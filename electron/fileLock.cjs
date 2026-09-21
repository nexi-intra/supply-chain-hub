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
      if (process.env.TCD_HUB_DEBUG) {
        const elapsedMs = Date.now() - startedAt
        if (elapsedMs >= 100) console.warn(`KV TIMING: lock ${elapsedMs}ms attempts=${attempt + 1} target=${target}`)
      }
      break
    } catch (error) {
      if (!LOCK_CONTENTION.has(error.code)) throw error
      // Selv-heling (samme model som acquireFileLockAsync): en laas efterladt af
      // en crashet/dræbt klient ville ellers blokere ALLE fremtidige forsøg
      // permanent (fx kontolåsen — attempts:1/6 giver ingen reel ventetid). Kun
      // laase hvis alder ligger LANGT over enhver legitim holdetid fjernes.
      if (staleMs > 0 && error.code === 'EEXIST') {
        try {
          const stat = fs.statSync(target)
          if (Date.now() - stat.mtimeMs > staleMs) {
            console.warn(`KV: fjerner forladt laas (${Math.round((Date.now() - stat.mtimeMs) / 1000)}s gammel): ${target}`)
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
// Asynkron tvilling til IPC-skrivevejen: samme laasefil og ejerskabsmodel, men
// ventetiden er await-baseret i stedet for Atomics.wait, saa Electrons
// main-event-loop (og dermed AL input) aldrig blokeres af et langsomt SMB-drev.
async function acquireFileLockAsync(target, { attempts = 50, delayMs = 100, createParent = true, staleMs = 0 } = {}) {
  const startedAt = Date.now()
  if (createParent) await fs.promises.mkdir(path.dirname(target), { recursive: true })
  const owner = `${process.pid}:${crypto.randomUUID()}`
  for (let attempt = 0; ; attempt++) {
    try {
      const handle = await fs.promises.open(target, 'wx')
      try { await handle.write(owner) } finally { await handle.close() }
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
          if (Date.now() - stat.mtimeMs > staleMs) {
            console.warn(`KV: fjerner forladt laas (${Math.round((Date.now() - stat.mtimeMs) / 1000)}s gammel): ${target}`)
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
  return async () => { try { if (await fs.promises.readFile(target, 'utf8') === owner) await fs.promises.unlink(target) } catch { /* preserve ownership */ } }
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
module.exports = { withFileLock, withFileLocks, withFileLockAsync }
