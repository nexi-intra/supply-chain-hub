// File-based key/value store shared by all app instances via a common data
// directory (typically a network share). One JSON file per key. Plain Node
// module with no Electron imports so it can be tested standalone.
//
// Concurrency model: writes are atomic (temp file + rename, atomic on the
// same volume incl. SMB shares). All mutations take the same per-key lock;
// compareAndSet/replaceItem reject stale snapshots. Change detection is polling-based
// (mtime scans) because fs.watch is unreliable on network shares.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { withFileLock, withFileLocks, withFileLockAsync } = require('./fileLock.cjs')

const FILE_EXT = '.json'
const READ_ATTEMPTS = 5
const WRITE_ATTEMPTS = 30
const RETRY_DELAY_MS = 100
const SLOW_OPERATION_MS = 100

// Fil-laas for asynkrone (IPC) skrivninger. Med ~40 klienter paa et langsomt
// SMB-share kolliderer flere klienter ofte om samme noegle. attempts×delayMs
// giver et generoest vindue (~9s med jitter) saa en travl noegle rider
// kollisionen af sig i stedet for at fejle. staleMs=30s: en crashet klients
// laas ville ellers blokere ALLE andres skrivninger til den noegle; 30s er
// langt over enhver legitim holdetid (<2s), saa vi stjaeler kun beviseligt
// forladte laase, men genopretter 4× hurtigere end det gamle 2-minutters vindue.
const ASYNC_WRITE_LOCK = { createParent: false, staleMs: 30000, attempts: 60, delayMs: 120 }

// Laesninger mod SMB er latens-bundne (~150-300 ms pr. rundtur uanset
// filstoerrelse), saa parallelisme er den eneste maade at faa flere noegler
// hurtigt: maalt paa M: tog forsidens 11 noegler 3,7 s serielt mod 1,5 s
// parallelt. Graensen holdes moderat, fordi et SMB-share stadig kollapser under
// ubegraenset parallelisme; alle laesninger er async, saa main-traaden er fri.
const MAX_CONCURRENT_READS = 6
let activeReads = 0
const readWaiters = []
function acquireReadSlot() {
  if (activeReads < MAX_CONCURRENT_READS) { activeReads++; return Promise.resolve() }
  return new Promise(resolve => readWaiters.push(resolve))
}
function releaseReadSlot() {
  const next = readWaiters.shift()
  if (next) next()
  else activeReads--
}

// Read-cache-levetid. Naar watch() koerer, ved storen praecis hvilke filer der
// er aendret paa disken (mtime+size hvert tick) og sletter dem fra cachen —
// saa cachen kan holdes laenge, og TTL'en er kun et sikkerhedsnet mod en
// scanning der ikke fanger en aendring. Uden watcher (tests, engangs-stores)
// bruges den korte TTL som foer.
const CACHE_TTL_MS = 3000
const CACHE_TTL_WATCHED_MS = 60000
// Watcher-interval: et readdir+stat af 500 filer koster ~27 ms paa M:, saa 2 s
// er billigt og giver baade hurtigere synlighed af kollegers aendringer og
// hurtigere cache-invalidering.
const DEFAULT_WATCH_INTERVAL_MS = 2000
const MIN_WATCH_INTERVAL_MS = 1000

function logSlow(operation, target, startedAt, attempts = 1) {
  if (!process.env.TCD_HUB_DEBUG) return
  const elapsedMs = Date.now() - startedAt
  if (elapsedMs >= SLOW_OPERATION_MS) console.warn(`KV TIMING: ${operation} ${elapsedMs}ms attempts=${attempts} target=${target}`)
}

// Kryptering på disken (AES-256-GCM) forhindrer utilsigtet klartekstvisning.
// Den indbyggede fælles nøgle er ikke en adgangsgrænse: filrettigheder og
// backendens autorisation skal begrænse, hvem der må læse data.
const ENC_KEY = crypto.scryptSync('tcd-hub-storage-v1', 'tcd-hub-static-salt', 32)

function encryptPayload(json) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const data = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  return JSON.stringify({
    __enc: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  })
}

function decryptPayload(parsed) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(parsed.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'))
  const json = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ])
  return json.toString('utf8')
}

function parseFileContents(raw) {
  const parsed = JSON.parse(raw)
  if (parsed && typeof parsed === 'object' && parsed.__enc === 1) {
    return JSON.parse(decryptPayload(parsed))
  }
  // Legacy ukrypteret fil fra tidligere versioner.
  return parsed
}

function keyToFilename(key) {
  return encodeURIComponent(key) + FILE_EXT
}

function filenameToKey(filename) {
  return decodeURIComponent(filename.slice(0, -FILE_EXT.length))
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function createStore(dataDir, { externallyWatched = false } = {}) {
  fs.mkdirSync(dataDir, { recursive: true })

  // Local read cache. Invalideres af watch() pr. aendret noegle; TTL er sikkerhedsnet.
  const readCache = new Map()
  // Opdateres af watch()'s polling — true indtil bevist ellers (dvs. optimistisk
  // ved opstart, før første scanning har kørt).
  let connected = true
  // externallyWatched: en anden store-instans paa SAMME mappe koerer watch() og
  // kalder invalidate() her ved aendringer, saa cachen kan holdes lige saa laenge.
  let watching = externallyWatched

  // Cachen er kun paalidelig i lang tid naar watcheren aktivt overvaager
  // mappen OG kan naa den (frakoblet = ingen scanning = ingen invalidering).
  function isFresh(cached) {
    return Date.now() - cached.at < (watching && connected ? CACHE_TTL_WATCHED_MS : CACHE_TTL_MS)
  }

  function filePath(key) {
    return path.join(dataDir, keyToFilename(key))
  }

  function get(key, options) {
    const startedAt = Date.now()
    const skipCache = options && options.skipCache
    const cached = !skipCache && readCache.get(key)
    if (cached && isFresh(cached)) {
      // Uden watcher: opfrisk i baggrunden. Med watcher er det unoedvendigt (og en
      // synkron SMB-laesning paa main-traaden pr. cache-hit er netop det, vi undgaar).
      if (!watching) setImmediate(() => {
        try {
          const raw = fs.readFileSync(filePath(key), 'utf8')
          const decoded = parseFileContents(raw)
          readCache.set(key, { value: decoded, at: Date.now() })
        } catch {
          // Keep cached value on error.
        }
      })
      logSlow('get-cache', key, startedAt)
      return cached.value
    }

    let lastError
    for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
      try {
        const raw = fs.readFileSync(filePath(key), 'utf8')
        const decoded = parseFileContents(raw)
        readCache.set(key, { value: decoded, at: Date.now() })
        logSlow('get', key, startedAt, attempt)
        return decoded
      } catch (err) {
        if (err.code === 'ENOENT') { readCache.delete(key); logSlow('get-missing', key, startedAt, attempt); return undefined }
        lastError = err
        if (attempt < READ_ATTEMPTS) wait(RETRY_DELAY_MS)
      }
    }
    // Existing but temporarily unreadable data must never look like a missing
    // key; callers may otherwise initialize it with an empty value.
    logSlow('get-failed', key, startedAt, READ_ATTEMPTS)
    throw lastError
  }

  // Async read for IPC handlers: identical semantics to get(), but the network
  // file read runs on libuv's threadpool so Electron's main event loop stays
  // responsive during slow SMB reads instead of blocking on fs.readFileSync.
  async function getAsync(key, options) {
    const startedAt = Date.now()
    const skipCache = options && options.skipCache
    const cached = !skipCache && readCache.get(key)
    if (cached && isFresh(cached)) {
      logSlow('get-cache', key, startedAt)
      return cached.value
    }
    await acquireReadSlot()
    try {
      let lastError
      for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
        try {
          const raw = await fs.promises.readFile(filePath(key), 'utf8')
          const decoded = parseFileContents(raw)
          readCache.set(key, { value: decoded, at: Date.now() })
          logSlow('get', key, startedAt, attempt)
          return decoded
        } catch (err) {
          if (err.code === 'ENOENT') { readCache.delete(key); logSlow('get-missing', key, startedAt, attempt); return undefined }
          lastError = err
          if (attempt < READ_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
        }
      }
      logSlow('get-failed', key, startedAt, READ_ATTEMPTS)
      throw lastError
    } finally {
      releaseReadSlot()
    }
  }

  function setUnlocked(key, value) {
    let json
    try { json = JSON.stringify(value) } catch {
      const error = new Error('KV_INVALID_OPERATION: Værdien kan ikke gemmes som JSON')
      error.code = 'KV_INVALID_OPERATION'
      throw error
    }
    if (json === undefined) {
      const error = new Error('KV_INVALID_OPERATION: Værdien mangler')
      error.code = 'KV_INVALID_OPERATION'
      throw error
    }
    const target = filePath(key)
    const tmp = `${target}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`
    fs.writeFileSync(tmp, encryptPayload(json))

    let lastError
    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
      try {
        fs.renameSync(tmp, target)
        readCache.set(key, { value, at: Date.now() })
        return
      } catch (err) {
        lastError = err
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || attempt === WRITE_ATTEMPTS) break
        wait(RETRY_DELAY_MS)
      }
    }

    try { fs.unlinkSync(tmp) } catch {}
    throw lastError
  }

  function set(key, value) {
    return withFileLock(filePath(key) + '.lock', () => setUnlocked(key, value), { createParent: false })
  }

  // Asynkrone tvillinger til IPC-vejen: identisk semantik og samme laasefiler,
  // men skrivning/rename/retry-ventetid blokerer aldrig main-event-loopet.
  async function setUnlockedAsync(key, value) {
    let json
    try { json = JSON.stringify(value) } catch {
      const error = new Error('KV_INVALID_OPERATION: Værdien kan ikke gemmes som JSON')
      error.code = 'KV_INVALID_OPERATION'
      throw error
    }
    if (json === undefined) {
      const error = new Error('KV_INVALID_OPERATION: Værdien mangler')
      error.code = 'KV_INVALID_OPERATION'
      throw error
    }
    const target = filePath(key)
    const tmp = `${target}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`
    await fs.promises.writeFile(tmp, encryptPayload(json))
    let lastError
    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
      try {
        await fs.promises.rename(tmp, target)
        readCache.set(key, { value, at: Date.now() })
        return
      } catch (err) {
        lastError = err
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || attempt === WRITE_ATTEMPTS) break
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      }
    }
    try { await fs.promises.unlink(tmp) } catch {}
    throw lastError
  }

  // In-proces serialisering pr. noegle: to samtidige async-skrivninger til
  // SAMME noegle maa ikke slaas om fil-laasen (sync-vejen var implicit
  // serialiseret ved at blokere). Forskellige noegler koerer stadig parallelt.
  const pendingWrites = new Map()
  function serializeWrite(key, task) {
    const previous = pendingWrites.get(key) || Promise.resolve()
    const run = previous.catch(() => {}).then(task)
    const tracked = run.catch(() => {}).finally(() => { if (pendingWrites.get(key) === tracked) pendingWrites.delete(key) })
    pendingWrites.set(key, tracked)
    return run
  }

  function setAsync(key, value) {
    return serializeWrite(key, () => withFileLockAsync(filePath(key) + '.lock', () => setUnlockedAsync(key, value), ASYNC_WRITE_LOCK))
  }

  function deleteAsync(key) {
    return serializeWrite(key, () => withFileLockAsync(filePath(key) + '.lock', async () => {
      try { await fs.promises.unlink(filePath(key)) } catch (err) { if (err.code !== 'ENOENT') throw err }
      readCache.delete(key)
    }, ASYNC_WRITE_LOCK))
  }

  async function keysAsync() {
    const startedAt = Date.now()
    const result = (await fs.promises.readdir(dataDir))
      .filter((name) => name.endsWith(FILE_EXT))
      .map(filenameToKey)
    logSlow('keys', dataDir, startedAt)
    return result
  }

  function del(key) {
    return withFileLock(filePath(key) + '.lock', () => {
      try { fs.unlinkSync(filePath(key)) } catch (err) { if (err.code !== 'ENOENT') throw err }
      readCache.delete(key)
    }, { createParent: false })
  }

  function keys() {
    const startedAt = Date.now()
    const result = fs
      .readdirSync(dataDir)
      .filter((name) => name.endsWith(FILE_EXT))
      .map(filenameToKey)
    logSlow('keys', dataDir, startedAt)
    return result
  }

  // --- Atomar array-opdatering på tværs af klienter -----------------------
  // Låsefil pr. nøgle (exclusive create er atomisk, også på SMB-shares).
  // Ownership is checked on release; a slow remote owner is never evicted
  // merely because the operation has taken longer than ten seconds.

  function lockPath(key) {
    return filePath(key) + '.lock'
  }

  /**
   * Atomar opdatering af et array af objekter med `id` under fil-lås:
   *   { op: 'append', items }  — tilføj elementer
   *   { op: 'upsert', items }  — erstat pr. id, ellers tilføj
   *   { op: 'remove', ids }    — fjern pr. id
   * Valgfri `path` (array af nøgler) navigerer ned i et objekt til et nested
   * array, fx { path: ['easy'] } for et leaderboard opdelt pr. sværhedsgrad —
   * resten af objektet bevares, kun arrayet på den sti opdateres.
   *
   * To ekstra ops arbejder i stedet på et almindeligt objekt (fx 'users', keyet
   * pr. email) under samme fil-lås:
   *   { op: 'setField', field, value }  — sæt/erstat én nøgle i objektet
   *   { op: 'deleteField', field }      — fjern én nøgle fra objektet
   *
   * Returnerer det opdaterede array/objekt. Kaster hvis nøglen (på stien) ikke
   * har den forventede type (array for array-ops, objekt for felt-ops).
   */
  function update(key, operation) {
    validateOperation(operation)
    return withFileLock(lockPath(key), () => {
      const outcome = computeUpdate(key, operation, get(key, { skipCache: true }))
      if (outcome.write) setUnlocked(key, outcome.value)
      return outcome.result
    }, { createParent: false })
  }

  // Asynkron tvilling til IPC-vejen: samme laas, samme computeUpdate, men al
  // netvaerks-I/O er await-baseret saa main-event-loopet aldrig blokeres.
  async function updateAsync(key, operation) {
    validateOperation(operation)
    return serializeWrite(key, () => withFileLockAsync(lockPath(key), async () => {
      const outcome = computeUpdate(key, operation, await getAsync(key, { skipCache: true }))
      if (outcome.write) await setUnlockedAsync(key, outcome.value)
      return outcome.result
    }, ASYNC_WRITE_LOCK))
  }

  function validateOperation(operation) {
    const invalid = message => { const error = new Error(`KV_INVALID_OPERATION: ${message}`); error.code = 'KV_INVALID_OPERATION'; throw error }
    if (!operation || typeof operation !== 'object') invalid('Ugyldig operation')
    if (!['compareAndSet', 'replaceItem', 'renameField', 'setField', 'deleteField', 'append', 'upsert', 'remove'].includes(operation.op)) invalid('Ukendt operation')
    const unsafe = new Set(['__proto__', 'constructor', 'prototype'])
    if (operation.field && unsafe.has(operation.field)) invalid('Ugyldigt felt')
    if (operation.path && (!Array.isArray(operation.path) || operation.path.some(segment => typeof segment !== 'string' || unsafe.has(segment)))) invalid('Ugyldig sti')
    if (['renameField', 'setField', 'deleteField'].includes(operation.op) && (typeof operation.field !== 'string' || !operation.field)) invalid('Ugyldigt felt')
    if (operation.op === 'renameField' && (typeof operation.newField !== 'string' || !operation.newField || unsafe.has(operation.newField))) invalid('Ugyldigt nyt felt')
    if (['renameField', 'setField', 'compareAndSet'].includes(operation.op) && JSON.stringify(operation.value) === undefined) invalid('Værdien kan ikke gemmes')
    if (['append', 'upsert'].includes(operation.op) && (!Array.isArray(operation.items) || operation.items.some(item => !item || typeof item.id !== 'string' || !item.id))) invalid('Ugyldige elementer')
    if (operation.op === 'remove' && (!Array.isArray(operation.ids) || operation.ids.some(id => typeof id !== 'string'))) invalid('Ugyldige id’er')
  }

  /** Ren beregning af en valideret update mod den friske vaerdi — deles af sync/async vej. */
  function computeUpdate(key, operation, current) {
    const invalid = message => { const error = new Error(`KV_INVALID_OPERATION: ${message}`); error.code = 'KV_INVALID_OPERATION'; throw error }
    const conflict = () => { const error = new Error('KV_CONFLICT: Data blev ændret af en anden klient. Genindlæs og prøv igen.'); error.code = 'KV_CONFLICT'; throw error }
    if (operation.op === 'compareAndSet') {
      if (JSON.stringify(current) !== JSON.stringify(operation.expected)) {
        if (JSON.stringify(current) === JSON.stringify(operation.value)) return { write: false, result: current }
        conflict()
      }
      return { write: true, value: operation.value, result: operation.value }
    }
    if (operation.op === 'replaceItem') {
      const list = current || []
      if (!Array.isArray(list) || !operation.item || operation.item.id !== operation.id) invalid('Ugyldigt element')
      const index = list.findIndex(item => item?.id === operation.id)
      if (index === -1 || JSON.stringify(list[index]) !== JSON.stringify(operation.expected)) conflict()
      const next = [...list]
      next[index] = operation.item
      return { write: true, value: next, result: next }
    }
    if (operation.op === 'renameField') {
      if (!current || typeof current !== 'object' || Array.isArray(current)) invalid('Flytning kræver et objekt')
      if (!Object.hasOwn(current, operation.field) || JSON.stringify(current[operation.field]) !== JSON.stringify(operation.expected)) conflict()
      if (operation.newField !== operation.field && Object.hasOwn(current, operation.newField)) conflict()
      const next = { ...current }
      delete next[operation.field]
      next[operation.newField] = operation.value
      return { write: true, value: next, result: next }
    }
    if (operation.op === 'setField' || operation.op === 'deleteField') {
      if (current !== undefined && (!current || typeof current !== 'object' || Array.isArray(current))) invalid('Feltoperation kræver et objekt')
      const root = current && typeof current === 'object' && !Array.isArray(current) ? structuredClone(current) : {}
      if (operation.op === 'setField') root[operation.field] = operation.value
      else delete root[operation.field]
      return { write: true, value: root, result: root }
    }

    const opPath = operation.path && operation.path.length > 0 ? operation.path : null
    let root
    let list
    if (opPath) {
      if (current !== undefined && (!current || typeof current !== 'object' || Array.isArray(current))) invalid('Stien kræver et objekt')
      root = current && typeof current === 'object' && !Array.isArray(current) ? structuredClone(current) : {}
      let parent = root
      for (let i = 0; i < opPath.length - 1; i++) {
        const segment = opPath[i]
        if (parent[segment] !== undefined && (!parent[segment] || typeof parent[segment] !== 'object' || Array.isArray(parent[segment]))) invalid('Stien kræver et objekt')
        if (!parent[segment] || typeof parent[segment] !== 'object' || Array.isArray(parent[segment])) {
          parent[segment] = {}
        }
        parent = parent[segment]
      }
      const lastSegment = opPath[opPath.length - 1]
      if (parent[lastSegment] !== undefined && !Array.isArray(parent[lastSegment])) invalid('Stien kræver et array')
      list = Array.isArray(parent[lastSegment]) ? parent[lastSegment] : []
    } else {
      list = current === undefined ? [] : current
      if (!Array.isArray(list)) {
        invalid(`kv:update kræver et array i "${key}"`)
      }
    }
    let next
    if (operation.op === 'append') {
      next = [...list]
      for (const item of operation.items) {
        const existing = next.find(entry => entry?.id === item.id)
        // A queue replay may repeat a write that reached the share before
        // the connection failed. Identical IDs/content are already applied.
        if (existing) { if (JSON.stringify(existing) !== JSON.stringify(item)) conflict() }
        else next.push(item)
      }
    } else if (operation.op === 'upsert') {
      next = [...list]
      for (const item of operation.items) {
        const index = next.findIndex((entry) => entry && entry.id === item.id)
        if (index !== -1) next[index] = item
        else next.push(item)
      }
    } else if (operation.op === 'remove') {
      const ids = new Set(operation.ids)
      next = list.filter((entry) => !entry || !ids.has(entry.id))
    } else {
      throw new Error(`Ukendt kv:update-operation: ${operation.op}`)
    }
    if (opPath) {
      let parent = root
      for (let i = 0; i < opPath.length - 1; i++) parent = parent[opPath[i]]
      parent[opPath[opPath.length - 1]] = next
      return { write: true, value: root, result: next }
    }
    return { write: true, value: next, result: next }
  }

  // Trusted Node callers only (not exposed through preload/IPC). The callback
  // runs synchronously with the same lock as every other mutation. Returning
  // undefined skips the write; backups may be made inside the callback.
  function mutate(key, callback) {
    return withFileLock(filePath(key) + '.lock', () => {
      const next = callback(structuredClone(get(key, { skipCache: true })))
      if (next && typeof next.then === 'function') throw new Error('Mutation callback must be synchronous')
      if (next !== undefined) setUnlocked(key, next)
      return next
    }, { createParent: false })
  }

  // Trusted multi-record operations only. No capability is exposed to IPC.
  // Locks follow the same filename order across instances and stay held until
  // the synchronous callback returns. Escaped capabilities expire afterwards.
  function withLockedKeys(keys, callback) {
    if (typeof callback !== 'function' || require('node:util').types.isAsyncFunction(callback)) throw new Error('KV_INVALID_OPERATION: Transaction must be synchronous')
    if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string' || !key)) throw new Error('KV_INVALID_OPERATION: Invalid transaction keys')
    const ordered = [...new Set(keys)].sort((a, b) => lockPath(a).localeCompare(lockPath(b), 'en'))
    const allowed = new Set(ordered)
    let active = true
    const check = key => { if (!active || !allowed.has(key)) throw new Error('KV_INVALID_OPERATION: Invalid transaction capability') }
    const transaction = {
      get(key) { check(key); return structuredClone(get(key, { skipCache: true })) },
      set(key, value) { check(key); setUnlocked(key, value) },
      delete(key) { check(key); try { fs.unlinkSync(filePath(key)) } catch (error) { if (error.code !== 'ENOENT') throw error }; readCache.delete(key) },
    }
    try {
      const result = withFileLocks(ordered.map(lockPath), () => callback(transaction), { createParent: false })
      if (result && typeof result.then === 'function') throw new Error('KV_INVALID_OPERATION: Transaction must be synchronous')
      return result
    } finally { active = false }
  }

  /** Alle nøgler + værdier (til backup). */
  function dumpAll() {
    const result = {}
    for (const key of keys()) {
      try {
        const value = get(key)
        if (value !== undefined) result[key] = value
      } catch (err) {
        console.warn(`Backup: springer ulæselig nøgle over: ${key}`, err.message)
      }
    }
    return result
  }

  /**
   * Ren, tilstandsløs scanning af dataDir — opdager om mappen overhovedet kan
   * læses (forbindelsen til fx et netværksdrev) samt hvilke nøgler der er
   * ændret siden forrige snapshot. Ingen sideeffekter, så den kan testes
   * uafhængigt af watch()'s timer.
   */
  function scanDirectory(previousSnapshot) {
    let entries
    try {
      entries = fs.readdirSync(dataDir)
    } catch {
      return { reachable: false, snapshot: null, changedKeys: [] }
    }
    const next = new Map()
    for (const name of entries) {
      if (!name.endsWith(FILE_EXT)) continue
      try {
        const stat = fs.statSync(path.join(dataDir, name))
        next.set(name, stat.mtimeMs + ':' + stat.size)
      } catch {
        // File vanished between readdir and stat — treated as removed.
      }
    }
    return { reachable: true, snapshot: next, changedKeys: diffSnapshots(previousSnapshot, next) }
  }

  // Asynkron udgave til watch()-timeren: synkron scanning mod et langsomt
  // SMB-netværksdrev blokerede main-processens event-loop hvert 5. sekund —
  // og i Electron routes AL input (tastatur/mus) gennem main, så spil frøs
  // periodisk for input mens rendering kørte videre.
  async function scanDirectoryAsync(previousSnapshot) {
    let entries
    try {
      entries = await fs.promises.readdir(dataDir)
    } catch {
      return { reachable: false, snapshot: null, changedKeys: [] }
    }
    const next = new Map()
    const stamps = await Promise.all(
      entries
        .filter((name) => name.endsWith(FILE_EXT))
        .map(async (name) => {
          try {
            const stat = await fs.promises.stat(path.join(dataDir, name))
            return [name, stat.mtimeMs + ':' + stat.size]
          } catch {
            return null // File vanished between readdir and stat — treated as removed.
          }
        })
    )
    for (const entry of stamps) {
      if (entry) next.set(entry[0], entry[1])
    }
    return { reachable: true, snapshot: next, changedKeys: diffSnapshots(previousSnapshot, next) }
  }

  function diffSnapshots(previousSnapshot, next) {
    const changedKeys = []
    for (const [name, stamp] of next) {
      if (previousSnapshot?.get(name) !== stamp) changedKeys.push(filenameToKey(name))
    }
    if (previousSnapshot) {
      for (const name of previousSnapshot.keys()) {
        if (!next.has(name)) changedKeys.push(filenameToKey(name))
      }
    }
    return changedKeys
  }

  /**
   * Polls the directory and invokes onChange(changedKeys: string[]) whenever
   * files were added, modified, or removed, and onConnectionChange(connected)
   * whenever dataDir goes from reachable to unreachable or back (e.g. a
   * network share disconnecting/reconnecting). Returns a stop function.
   */
  function watch(onChange, onConnectionChange, intervalMs = DEFAULT_WATCH_INTERVAL_MS) {
    // Første scan er synkron (sker ved opstart, før vinduet vises) så
    // isConnected() er retvisende med det samme.
    const initial = scanDirectory(null)
    let snapshot = initial.snapshot
    connected = initial.reachable
    watching = true
    let scanning = false

    const timer = setInterval(() => {
      if (scanning) return // forrige scan (langsomt netværk) kører stadig
      scanning = true
      scanDirectoryAsync(snapshot)
        .then((result) => {
          if (result.reachable !== connected) {
            connected = result.reachable
            // Efter en frakobling kan vi have misset aendringer: start paa en frisk.
            if (connected) readCache.clear()
            onConnectionChange?.(connected)
          }
          if (!result.reachable) return

          snapshot = result.snapshot
          if (result.changedKeys.length > 0) {
            // Invalidate cache for changed keys to force fresh read on next get().
            for (const key of result.changedKeys) readCache.delete(key)
            onChange(result.changedKeys)
          }
        })
        .finally(() => { scanning = false })
    }, Math.max(intervalMs, MIN_WATCH_INTERVAL_MS))
    timer.unref?.()

    return () => { watching = false; clearInterval(timer) }
  }

  function isConnected() {
    return connected
  }

  return { get, getAsync, set, setAsync, delete: del, deleteAsync, keys, keysAsync, watch, update, updateAsync, mutate, withLockedKeys, invalidate: () => readCache.clear(), dumpAll, dataDir, isConnected, scanDirectory }
}

module.exports = { createStore, parseFileContents, keyToFilename }
