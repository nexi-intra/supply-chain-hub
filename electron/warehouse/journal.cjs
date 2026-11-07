// A user's own scan journal for one count. Local first: every event is appended to an encrypted
// JSONL file on this PC immediately, then uploaded to the shared drive in fixed-size chunks.
// Each (user, PC) pair writes only its own chunk files, so writers never compete for a file.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { encryptPayload, parseFileContents } = require('../store.cjs')

const DEFAULT_CHUNK_SIZE = 500
const DEFAULT_FLUSH_MS = 2000
const RETRY_MS = 10000

function writerKey(email, deviceId) {
  return crypto.createHash('sha256').update(`${String(email).toLowerCase()}|${deviceId}`).digest('hex').slice(0, 12)
}

const chunkPrefix = countId => `count-${countId}-j-`
const chunkKey = (countId, writer, index) => `${chunkPrefix(countId)}${writer}-${String(index).padStart(4, '0')}`
const byTime = (a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Every writer's events for a count, oldest first. Full chunks never change, so `cache` keeps them. */
async function readAllJournals({ remote, countId, cache = new Map() }) {
  const prefix = chunkPrefix(countId)
  const keys = (await remote.keysAsync()).filter(name => name.startsWith(prefix)).sort()
  const events = []
  for (const name of keys) {
    let chunkEvents = cache.get(name)
    if (!chunkEvents) {
      const chunk = await remote.getAsync(name)
      chunkEvents = Array.isArray(chunk?.events) ? chunk.events : []
      if (chunk?.full) cache.set(name, chunkEvents)
    }
    events.push(...chunkEvents)
  }
  return events.sort(byTime)
}

function createJournal({ countId, team, user, deviceId, localDir, remote, chunkSize = DEFAULT_CHUNK_SIZE, now = Date.now, newId = () => crypto.randomUUID(), autoFlush = true, flushMs = DEFAULT_FLUSH_MS, onStatus }) {
  const writer = writerKey(user.email, deviceId)
  const localFile = path.join(localDir, `${team}-${countId}-${writer}.jsonl`)
  let events = []
  let uploaded = 0
  let remoteKnown = false
  let lastError = null
  let lastFlushAt = null
  let timer = null
  let closed = false
  let stopped = false

  // To køer: den lokale (alt der skriver den lokale fil eller udskifter `events`) er altid kort,
  // så en scanning aldrig venter på M:. Upload-køen sikrer, at kun én flush kører ad gangen.
  const chain = () => {
    let queue = Promise.resolve()
    return task => {
      const run = queue.then(task, task)
      queue = run.catch(() => {})
      return run
    }
  }
  const local = chain()
  const upload = chain()
  const notify = () => { try { onStatus?.(status()) } catch {} }

  async function readLocal() {
    let text
    try { text = await fs.promises.readFile(localFile, 'utf8') } catch (error) { if (error.code === 'ENOENT') return []; throw error }
    const result = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try { result.push(parseFileContents(line)) } catch { /* a half-written last line after a crash */ }
    }
    return result
  }

  async function writeLocal(all) {
    const temp = `${localFile}.${process.pid}.tmp`
    await fs.promises.writeFile(temp, all.map(event => encryptPayload(JSON.stringify(event))).join('\n') + (all.length ? '\n' : ''))
    await fs.promises.rename(temp, localFile)
  }

  async function readRemoteOwn() {
    const prefix = `${chunkPrefix(countId)}${writer}-`
    const keys = (await remote.keysAsync()).filter(name => name.startsWith(prefix)).sort()
    const result = []
    for (const name of keys) {
      const chunk = await remote.getAsync(name, { skipCache: true })
      if (Array.isArray(chunk?.events)) result.push(...chunk.events)
    }
    return result
  }

  /** Make the drive's copy and the local copy agree before anything is uploaded. */
  async function syncFromRemote() {
    const remoteEvents = await readRemoteOwn()
    // Flettes ud fra `events` som de er nu, så en scanning under drevlæsningen ikke går tabt.
    await local(async () => {
      const remoteIds = new Set(remoteEvents.map(event => event.id))
      const localOnly = events.filter(event => !remoteIds.has(event.id))
      const merged = [...remoteEvents, ...localOnly]
      if (merged.length !== events.length || merged.some((event, index) => event.id !== events[index]?.id)) {
        await writeLocal(merged)
        events = merged
      }
      uploaded = remoteEvents.length
      remoteKnown = true
    })
  }

  async function load() {
    await fs.promises.mkdir(localDir, { recursive: true })
    events = await local(readLocal)
    try {
      await upload(syncFromRemote)
      lastError = null
    } catch (error) {
      remoteKnown = false
      lastError = error.code || 'OFFLINE'
    }
    notify()
    if (autoFlush && pending() > 0) schedule(0)
    return events.slice()
  }

  function pending() {
    return remoteKnown ? events.length - uploaded : events.length
  }

  function schedule(delay = flushMs) {
    if (!autoFlush || closed || timer) return
    timer = setTimeout(() => { timer = null; flush() }, delay)
    timer.unref?.()
  }

  function append(fields) {
    return local(async () => {
      if (closed) throw Object.assign(new Error('JOURNAL_CLOSED'), { code: 'JOURNAL_CLOSED' })
      const event = { ...fields, id: newId(), at: now(), by: user.email, byName: user.name }
      await fs.promises.appendFile(localFile, encryptPayload(JSON.stringify(event)) + '\n')
      events.push(event)
      notify()
      schedule()
      return event
    })
  }

  function flush() {
    return upload(async () => {
      try {
        // Vent kun på allerede startede lokale skrivninger, så alt tilføjet før flush kommer med.
        await local(() => {})
        if (!remoteKnown) await syncFromRemote()
        // Øjebliksbillede: hændelser tilføjet under uploaden sendes af næste flush.
        const snapshot = events.slice()
        const target = snapshot.length
        for (let index = Math.floor(uploaded / chunkSize); index * chunkSize < target; index++) {
          // Stopped (the count was deleted): no further chunks, or they would be left on M: after its files are removed.
          if (stopped) break
          const slice = snapshot.slice(index * chunkSize, Math.min((index + 1) * chunkSize, target))
          await remote.setAsync(chunkKey(countId, writer, index), { writer, by: user.email, full: slice.length === chunkSize, events: slice })
        }
        uploaded = target
        lastError = null
        lastFlushAt = now()
      } catch (error) {
        lastError = error.code || 'OFFLINE'
        if (autoFlush && !closed) setTimeout(() => schedule(0), RETRY_MS).unref?.()
      }
      notify()
      return lastError ? { ok: false, pending: pending(), error: lastError } : { ok: true, pending: pending() }
    })
  }

  function status() {
    return { pending: pending(), online: !lastError, lastError, lastFlushAt, count: events.length }
  }

  async function close() {
    if (timer) { clearTimeout(timer); timer = null }
    const result = await flush()
    closed = true
    return result
  }

  /**
   * Stop without uploading anything (the count was deleted). Resolves when a local save or an upload already on its way
   * has finished, so the caller can remove the count's files without one being written again afterwards.
   */
  function stop() {
    if (timer) { clearTimeout(timer); timer = null }
    closed = true
    stopped = true
    return Promise.all([local(() => {}), upload(() => {})]).then(() => {}, () => {})
  }

  return { load, append, flush, close, stop, status, events: () => events.slice(), writer }
}

module.exports = { createJournal, readAllJournals, writerKey, chunkKey, DEFAULT_CHUNK_SIZE }
