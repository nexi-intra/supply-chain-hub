const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

// A slow live client on another PC may still own a lock. Do not steal it
// solely because a wall-clock timeout has elapsed.
function acquireFileLock(target, { attempts = 50, delayMs = 100, createParent = true } = {}) {
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
      if (error.code !== 'EEXIST') throw error
      if (attempt + 1 >= attempts) {
        if (process.env.TCD_HUB_DEBUG) console.warn(`KV TIMING: lock-failed ${Date.now() - startedAt}ms attempts=${attempts} target=${target}`)
        const busy = new Error('KV_LOCK_BUSY: Lageret er optaget af en anden klient. Prøv igen.')
        busy.code = 'KV_LOCK_BUSY'
        throw busy
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
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
      if (error.code !== 'EEXIST') throw error
      // Selv-heling: en laas efterladt af en crashet klient ville ellers blokere
      // ALLE klienters skrivninger permanent. Kun laase hvis alder ligger LANGT
      // over enhver legitim holdetid fjernes; live ejere beholder altid laasen.
      if (staleMs > 0) {
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
        const busy = new Error('KV_LOCK_BUSY: Lageret er optaget af en anden klient. Prøv igen.')
        busy.code = 'KV_LOCK_BUSY'
        throw busy
      }
      await new Promise(resolve => setTimeout(resolve, delayMs))
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
