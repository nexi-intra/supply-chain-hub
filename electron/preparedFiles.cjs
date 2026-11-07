// Files made ready in the background, so a save on M: never has to create a new file while it waits: creating a file
// there costs 2-15 s (measured 07.11; most likely virus scanning of new files), writing into an existing one ~0.5-1 s.
// Per folder: empty temp files (written and renamed into place by a save) and owner files (a lock is taken as a hard
// link to one; each holds its own owner id). Nothing ever waits for a preparation: an empty pool means "do it as today".
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

// Neither ends in .json nor .json.lock, so no watcher, key list or backup (1.6.6 or 1.6.7) ever sees them.
const PREPARED_FILE_PATTERN = /^~hub-(prep|owner)-\d+-(\d+)-[0-9a-f]{8}\.(tmp|lockowner)$/

function createPreparedFiles({ fsp = fs.promises, pid = process.pid, now = Date.now, newOwnerId = () => `${pid}:${crypto.randomUUID()}`, poolSize = 2, maxPoolSize = 12 } = {}) {
  const folders = new Map()
  const work = new Set()
  let closed = false

  function folder(dir) {
    let state = folders.get(dir)
    if (!state) {
      // `lent`: owner files out as a lock; `returning`: being given a new id. Both come back, so they count as stock.
      state = { target: poolSize, tmps: [], owners: [], lent: 0, returning: 0, linkUnsupported: false, refilling: null, again: false }
      folders.set(dir, state)
    }
    return state
  }

  function track(promise) {
    const tracked = promise.catch(() => {}).finally(() => work.delete(tracked))
    work.add(tracked)
    return tracked
  }

  const discard = file => { track(fsp.unlink(file)) }

  async function create(dir, kind, content) {
    const file = path.join(dir, `~hub-${kind}-${pid}-${now()}-${crypto.randomBytes(4).toString('hex')}.${kind === 'prep' ? 'tmp' : 'lockowner'}`)
    const handle = await fsp.open(file, 'wx')
    try {
      if (content) await handle.write(content)
    } finally {
      await handle.close()
    }
    return file
  }

  function refill(dir) {
    if (closed) return
    const state = folder(dir)
    if (state.refilling) { state.again = true; return }
    state.refilling = track((async () => {
      // Yield first: otherwise a round with nothing to do would finish (and clear `refilling`) before it is even set.
      await null
      try {
        do {
          state.again = false
          const tmpsMissing = Math.max(0, state.target - state.tmps.length)
          const ownersMissing = state.linkUnsupported ? 0 : Math.max(0, state.target - state.owners.length - state.lent - state.returning)
          if (!tmpsMissing && !ownersMissing) break
          const results = await Promise.allSettled([
            ...Array.from({ length: tmpsMissing }, async () => {
              const file = await create(dir, 'prep', '')
              if (closed) discard(file); else state.tmps.push(file)
            }),
            ...Array.from({ length: ownersMissing }, async () => {
              const owner = newOwnerId()
              const file = await create(dir, 'owner', owner)
              if (closed || state.linkUnsupported) discard(file); else state.owners.push({ file, owner })
            }),
          ])
          // The drive is in trouble: stop for now; the next save asks again.
          if (results.some(result => result.status === 'rejected')) break
        } while (state.again && !closed)
      } finally {
        state.refilling = null
      }
    })())
  }

  /** A ready, empty temp file in `dir` (now the caller's), or null. Never waits. */
  function takeTmp(dir) {
    if (closed) return null
    const file = folder(dir).tmps.shift() ?? null
    refill(dir)
    return file
  }

  /** A ready owner file in `dir` with its own owner id as content, or null. Never waits. */
  function takeOwner(dir) {
    if (closed) return null
    const state = folder(dir)
    if (state.linkUnsupported) return null
    const entry = state.owners.shift() ?? null
    if (entry) state.lent++
    refill(dir)
    return entry
  }

  /**
   * Back from a lock. Reusable only when that lock was certainly removed: then a new id is written into the same file
   * (no new file on M:). Otherwise the file is deleted - it must never change while a left-behind lock still uses it.
   */
  function releaseOwner(dir, entry, { reusable }) {
    const state = folder(dir)
    state.lent = Math.max(0, state.lent - 1)
    if (closed || !reusable || state.linkUnsupported) {
      discard(entry.file)
      refill(dir)
      return
    }
    state.returning++
    track((async () => {
      try {
        const owner = newOwnerId()
        const handle = await fsp.open(entry.file, 'r+')
        try {
          await handle.write(owner, 0)
          await handle.truncate(Buffer.byteLength(owner))
        } finally {
          await handle.close()
        }
        if (closed || state.linkUnsupported) discard(entry.file)
        else state.owners.unshift({ file: entry.file, owner })
      } catch {
        discard(entry.file)
      } finally {
        state.returning--
        refill(dir)
      }
    })())
  }

  function discardTmp(file) { discard(file) }

  /** Keeps `count` of each kind ready in `dir` (e.g. a Placeringer action locks several keys at once). */
  function want(dir, count) {
    const state = folder(dir)
    state.target = Math.max(state.target, Math.min(maxPoolSize, count))
    refill(dir)
  }

  function markLinkUnsupported(dir) {
    const state = folder(dir)
    state.linkUnsupported = true
    for (const entry of state.owners.splice(0)) discard(entry.file)
  }

  const linkSupported = dir => !folder(dir).linkUnsupported

  async function whenIdle() {
    while (work.size > 0) await Promise.all([...work])
  }

  /** Stops preparing and deletes every ready file (when the app closes). Owner files still lent are deleted when released. */
  async function closeAll() {
    closed = true
    await whenIdle()
    for (const state of folders.values()) {
      for (const file of state.tmps.splice(0)) discard(file)
      for (const entry of state.owners.splice(0)) discard(entry.file)
    }
    await whenIdle()
  }

  return { takeTmp, takeOwner, releaseOwner, discardTmp, want, markLinkUnsupported, linkSupported, whenIdle, closeAll }
}

module.exports = { createPreparedFiles, PREPARED_FILE_PATTERN }
