const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

// Windows/SMB afviser et 'wx'-open med EPERM (og af og til EACCES/EBUSY) i det
// oejeblik en anden klient netop har slettet laasefilen: filen er "delete
// pending" indtil den sidste handle lukkes. Det er kaploeb om laasen - altsaa
// samme situation som EEXIST - og IKKE en rettighedsfejl, saa det skal proeves
// igen. Slap den raat igennem, landede brugeren med "EPERM: operation not
// permitted" midt i en helt almindelig skrivning.
const LOCK_CONTENTION = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY'])

function lockBusy(code) {
  const busy = new Error(code === 'EEXIST'
    ? 'KV_LOCK_BUSY: Lageret er optaget af en anden klient. Prøv igen.'
    : `KV_LOCK_BUSY: Lageret kunne ikke låses (${code}). Prøv igen.`)
  busy.code = 'KV_LOCK_BUSY'
  return busy
}

// MAALT PAA PRODUKTIONSDREVET: en laasefil der netop er oprettet af en anden
// klient rapporterede mtime som 17 AAR gammel (`fjerner forladt laas
// (549628504s gammel)`, set gentagne gange). SMB naaede ikke at skrive metadata
// foer vi stattede den. Stolede vi blindt paa mtime, slettede vi altsaa en laas
// en kollega holdt LIGE NU - og saa skrev to klienter samtidig i den samme fil.
//
// Derfor: mtime bruges kun naar alderen er plausibel. Er den absurd, falder vi
// tilbage paa VORES EGEN klokke - vi skal selv have set den samme laas (samme
// ejer) ligge uroert i staleMs, foer den maa fjernes. Det er ogsaa immunt over
// for en kollega-pc med forkert systemur.
const MAX_TRUSTED_LOCK_AGE_MS = 30 * 24 * 60 * 60 * 1000
// Clocks on two PCs differ a little; a lock dated further ahead than this is treated as untrustworthy instead.
const FRESH_CLOCK_SKEW_MS = 60 * 1000
// An async holder touches its lock this often, well inside the 30 s after which every client (1.6.6 included)
// regards a lock as abandoned.
const LOCK_HEARTBEAT_MS = 10 * 1000
// A holder that hangs must not keep a key locked for ever: after this the lock ages again like any other.
const LOCK_HEARTBEAT_MAX_MS = 10 * 60 * 1000
const observedLocks = new Map()

function readOwner(target) {
  try { return fs.readFileSync(target, 'utf8') } catch { return null }
}
// Async tvilling: acquireFileLockAsync maa aldrig lave synkron SMB-I/O paa main.
async function readOwnerAsync(target) {
  try { return await fs.promises.readFile(target, 'utf8') } catch { return null }
}

/** Maa laasen fjernes? `mtimeMs` bruges kun hvis alderen er troværdig. */
function isAbandonedLock(target, staleMs, mtimeMs, owner) {
  const age = Date.now() - mtimeMs
  if (age >= staleMs && age < MAX_TRUSTED_LOCK_AGE_MS) {
    observedLocks.delete(target)
    return { abandoned: true, reason: `${Math.round(age / 1000)}s gammel` }
  }
  // A believable, recent mtime means the owner is alive (an async holder refreshes it while it writes). Before,
  // a lock merely seen for staleMs was taken even then - so an 80 s write on M: lost its lock to another client.
  if (age > -FRESH_CLOCK_SKEW_MS && age < staleMs) {
    observedLocks.delete(target)
    return { abandoned: false }
  }
  const seen = observedLocks.get(target)
  if (!seen || seen.owner !== owner) {
    observedLocks.set(target, { owner, since: Date.now() })
    return { abandoned: false }
  }
  const watched = Date.now() - seen.since
  if (watched < staleMs) return { abandoned: false }
  observedLocks.delete(target)
  return { abandoned: true, reason: `uroert i ${Math.round(watched / 1000)}s (mtime var utroværdig)` }
}

// A slow live client on another PC may still own a lock. Do not steal it
// solely because a wall-clock timeout has elapsed.
function acquireFileLock(target, { attempts = 50, delayMs = 100, createParent = true, staleMs = 0 } = {}) {
  const startedAt = Date.now()
  if (createParent) fs.mkdirSync(path.dirname(target), { recursive: true })
  const owner = `${process.pid}:${crypto.randomUUID()}`
  for (let attempt = 0; ; attempt++) {
    try {
      const fd = fs.openSync(target, 'wx')
      try { fs.writeSync(fd, owner) } finally { fs.closeSync(fd) }
      observedLocks.delete(target)
      if (process.env.TCD_HUB_DEBUG) {
        const elapsedMs = Date.now() - startedAt
        if (elapsedMs >= 100) console.warn(`KV TIMING: lock ${elapsedMs}ms attempts=${attempt + 1} target=${target}`)
      }
      break
    } catch (error) {
      if (!LOCK_CONTENTION.has(error.code)) throw error
      // Selv-heling (samme model som acquireFileLockAsync): en laas efterladt af
      // en crashet/dræbt klient ville ellers blokere ALLE fremtidige forsøg
      // permanent (fx kontolåsen — attempts:1/6 giver ingen reel ventetid).
      if (staleMs > 0 && error.code === 'EEXIST') {
        try {
          const stat = fs.statSync(target)
          const verdict = isAbandonedLock(target, staleMs, stat.mtimeMs, readOwner(target))
          if (verdict.abandoned) {
            console.warn(`KV: fjerner forladt laas (${verdict.reason}): ${target}`)
            try { fs.unlinkSync(target) } catch { /* ignoreres */ }
            continue
          }
        } catch { /* laasen forsvandt netop - proev igen */ }
      }
      if (attempt + 1 >= attempts) {
        if (process.env.TCD_HUB_DEBUG) console.warn(`KV TIMING: lock-failed ${Date.now() - startedAt}ms attempts=${attempts} target=${target}`)
        throw lockBusy(error.code)
      }
      // Jitter (samme begrundelse som acquireFileLockAsync): uden det ville
      // flere klienter der kolliderer om samme laas vente PRAECIS lige laenge
      // og saa stoede sammen igen i naeste forsoeg, igen og igen.
      const jitter = 0.6 + Math.random() * 0.8
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.round(delayMs * jitter))
    }
  }
  return () => { try { if (fs.readFileSync(target, 'utf8') === owner) fs.unlinkSync(target) } catch { /* preserve ownership */ } }
}
function withFileLock(target, mutate, options) {
  const release = acquireFileLock(target, options)
  try { return mutate() } finally { release() }
}
// Prepared owner files (preparedFiles.cjs): when one is ready, the lock is taken as a hard link to it instead of
// creating a new file - creating a file on M: costs 2-15 s, a link ~0.65 s. `link` fails with EEXIST exactly like
// open('wx'), so 1.6.6 clients (which use open('wx') on the same lock name) and we still exclude each other.
let preparedFiles = null
function setPreparedFiles(pool) { preparedFiles = pool }
// A link failing with one of these may mean the share does not support hard links; it is only concluded when the
// ordinary way then works at once. EPERM is also what SMB says right after another client deleted the lock, so it
// takes several in a row before links are given up for the folder.
const LINK_UNSUPPORTED = new Set(['ENOTSUP', 'ENOSYS', 'EXDEV', 'EINVAL'])
const LINK_EPERM_LIMIT = 3
const linkEperms = new Map()

async function createLockFile(target, owner) {
  const handle = await fs.promises.open(target, 'wx')
  try { await handle.write(owner) } finally { await handle.close() }
}

// Asynkron tvilling til IPC-skrivevejen: samme laasefil og ejerskabsmodel, men
// ventetiden er await-baseret i stedet for Atomics.wait, saa Electrons
// main-event-loop (og dermed AL input) aldrig blokeres af et langsomt SMB-drev.
async function acquireFileLockAsync(target, { attempts = 50, delayMs = 100, createParent = true, staleMs = 0, heartbeatMs = LOCK_HEARTBEAT_MS } = {}) {
  const startedAt = Date.now()
  if (createParent) await fs.promises.mkdir(path.dirname(target), { recursive: true })
  const pool = preparedFiles
  const dir = path.dirname(target)
  let owner = `${process.pid}:${crypto.randomUUID()}`
  // A prepared owner file kept across attempts; `linked` is the one that became the lock.
  let entry = null
  let linked = null
  const giveBack = () => { if (entry) { pool.releaseOwner(dir, entry, { reusable: true }); entry = null } }
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        // Only in folders a store saves to with the pool: a lock elsewhere (Backup, _registry) prepares nothing there.
        if (!entry && pool?.knows(path.resolve(dir)) && pool.linkSupported(dir)) entry = pool.takeOwner(dir)
        if (entry) {
          let linkError = null
          try {
            const now = new Date()
            // A fresh mtime first, so neither 1.6.6 nor 1.6.7 takes the new lock for abandoned.
            await fs.promises.utimes(entry.file, now, now)
          } catch {
            // The owner file itself is in trouble: drop it and lock the ordinary way in this attempt.
            pool.releaseOwner(dir, entry, { reusable: false })
            entry = null
          }
          if (entry) {
            try {
              await fs.promises.link(entry.file, target)
              owner = entry.owner
              linked = entry
              entry = null
              linkEperms.delete(dir)
            } catch (error) {
              if (error.code === 'EEXIST') throw error
              linkError = error
            }
          }
          if (!linked) {
            // Not linked for another reason than "the lock exists": try the ordinary way at once. If that works, this
            // share may not link (remembered for the folder); if it fails, it is plain contention as before.
            await createLockFile(target, owner)
            const eperms = linkError?.code === 'EPERM' ? (linkEperms.get(dir) || 0) + 1 : 0
            if (eperms) linkEperms.set(dir, eperms)
            if (linkError && (LINK_UNSUPPORTED.has(linkError.code) || eperms >= LINK_EPERM_LIMIT)) {
              console.warn(`KV: haardlink-laase virker ikke i ${dir} (${linkError.code}) - bruger almindelige laasefiler`)
              pool.markLinkUnsupported(dir)
            }
            giveBack()
          }
        } else {
          await createLockFile(target, owner)
        }
        observedLocks.delete(target)
        if (process.env.TCD_HUB_DEBUG) {
          const elapsedMs = Date.now() - startedAt
          if (elapsedMs >= 100) console.warn(`KV TIMING: lock-async ${elapsedMs}ms attempts=${attempt + 1} target=${target}`)
        }
        break
      } catch (error) {
        if (!LOCK_CONTENTION.has(error.code)) throw error
        // Selv-heling: en laas efterladt af en crashet klient ville ellers blokere
        // ALLE klienters skrivninger permanent. Kun laase hvis alder ligger LANGT
        // over enhver legitim holdetid fjernes; live ejere beholder altid laasen.
        if (staleMs > 0 && error.code === 'EEXIST') {
          try {
            const stat = await fs.promises.stat(target)
            const verdict = isAbandonedLock(target, staleMs, stat.mtimeMs, await readOwnerAsync(target))
            if (verdict.abandoned) {
              console.warn(`KV: fjerner forladt laas (${verdict.reason}): ${target}`)
              await fs.promises.unlink(target).catch(() => {})
              continue
            }
          } catch { /* laasen forsvandt netop - proev igen */ }
        }
        if (attempt + 1 >= attempts) {
          if (process.env.TCD_HUB_DEBUG) console.warn(`KV TIMING: lock-async-failed ${Date.now() - startedAt}ms attempts=${attempts} target=${target}`)
          throw lockBusy(error.code)
        }
        // Jitter (±40%) bryder lockstep: uden det ville mange klienter, der
        // kolliderer om samme laas, vente PRAECIS lige laenge og saa kollidere
        // igen i det samme oejeblik — igen og igen. Med jitter spreder de sig ud
        // og en efter en slipper igennem, saa faerre skrivninger loeber toer.
        const jitter = 0.6 + Math.random() * 0.8
        await new Promise(resolve => setTimeout(resolve, Math.round(delayMs * jitter)))
      }
    }
  } finally {
    // An owner file still in hand (lock failed, or taken the ordinary way) goes back unused.
    giveBack()
  }
  // Heartbeat: keep the lock's mtime fresh while we hold it, so no client takes it for abandoned during a slow write.
  let released = false
  let touching = null
  const heldSince = Date.now()
  const heartbeat = setInterval(() => {
    if (Date.now() - heldSince > LOCK_HEARTBEAT_MAX_MS) { clearInterval(heartbeat); return }
    if (touching) return
    const now = new Date()
    touching = fs.promises.utimes(target, now, now).catch(() => {}).finally(() => { touching = null })
  }, heartbeatMs)
  heartbeat.unref?.()
  return async () => {
    if (released) return
    released = true
    clearInterval(heartbeat)
    await touching
    let removed = false
    try {
      if (await fs.promises.readFile(target, 'utf8') === owner) {
        await fs.promises.unlink(target)
        removed = true
      }
    } catch { /* preserve ownership */ }
    // Only an owner file whose lock is certainly gone may get a new id; otherwise it is dropped (a left-behind lock
    // still pointing at it must age and be reclaimed like any lock).
    if (linked) pool.releaseOwner(dir, linked, { reusable: removed })
  }
}
async function withFileLockAsync(target, mutate, options) {
  const release = await acquireFileLockAsync(target, options)
  try { return await mutate() } finally { await release() }
}
function withFileLocks(targets, mutate, options) {
  const releases = []
  try {
    for (const target of [...new Set(targets)].sort()) releases.push(acquireFileLock(target, options))
    return mutate()
  } finally { for (const release of releases.reverse()) release() }
}
// Asynkron tvilling til withFileLocks. At oprette en fil paa M: koster 3-4 s
// (maalt 07.11), saa laasene oprettes PARALLELT - alt eller intet: er bare en
// optaget, slippes de andre, og hele saettet proeves igen efter jitter. Den holder
// aldrig en laas mens den venter, saa den kan ikke daedlaase med klienter (1.6.6)
// der tager de samme laasefiler en ad gangen i sorteret raekkefoelge.
async function withFileLocksAsync(targets, mutate, { attempts = 50, delayMs = 100, ...options } = {}) {
  const ordered = [...new Set(targets)].sort()
  if (preparedFiles) {
    // Enough owner files ready for every lock of such a transaction in each folder (next time, if not now).
    const perFolder = new Map()
    for (const target of ordered) perFolder.set(path.dirname(target), (perFolder.get(path.dirname(target)) || 0) + 1)
    for (const [dir, count] of perFolder) if (preparedFiles.knows(path.resolve(dir))) preparedFiles.want(dir, count)
  }
  let releases
  for (let round = 0; ; round++) {
    const results = await Promise.allSettled(ordered.map(target => acquireFileLockAsync(target, { ...options, attempts: 1, delayMs })))
    releases = results.filter(result => result.status === 'fulfilled').map(result => result.value)
    const failed = results.find(result => result.status === 'rejected')
    if (!failed) break
    await Promise.all(releases.map(release => release()))
    if (failed.reason?.code !== 'KV_LOCK_BUSY' || round + 1 >= attempts) throw failed.reason
    const jitter = 0.6 + Math.random() * 0.8
    await new Promise(resolve => setTimeout(resolve, Math.round(delayMs * jitter)))
  }
  try { return await mutate() } finally { await Promise.all(releases.map(release => release())) }
}
module.exports = { withFileLock, withFileLocks, withFileLockAsync, withFileLocksAsync, setPreparedFiles }
