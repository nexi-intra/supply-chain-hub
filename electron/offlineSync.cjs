// Kombinerer en netværks-store (det delte drev) med en lokal spejl-store, så
// appen kan blive ved med at læse OG SKRIVE data, selv når netværksstien er
// utilgængelig. Skrivninger (set/update/delete) mens offline anvendes med det
// samme på den lokale cache OG lægges i en persisteret kø (gemt i selve den
// lokale store), som afspilles mod netværksstien når forbindelsen er tilbage.
//
// Array-operationer (update: append/upsert/remove) afspilles som OPERATIONER
// via netværks-storens egen atomare update()-mekanisme — ikke som rå
// overskrivning — så en anden klients samtidige ændringer på samme nøgle ikke
// går tabt.
//
// Ingen Electron-imports — almindeligt Node-modul, testbart isoleret ligesom
// store.cjs.

const QUEUE_KEY = '__offline-queue__'
const DISCARDED_KEY = '__offline-discarded__'
// Fejl der ALDRIG loeser sig selv ved at proeve igen. En konflikt betyder at
// data blev aendret paa drevet imens; genafspilning giver samme konflikt for
// evigt. KV_LOCK_BUSY hoerer bevidst IKKE til her - den er forbigaaende.
const PERMANENT_ERRORS = new Set(['KV_CONFLICT', 'KV_INVALID_OPERATION'])
// Sikkerhedsnet for alt andet der maatte fejle igen og igen.
const MAX_REPLAY_ATTEMPTS = 25
const MAX_DISCARDED_KEPT = 50

/**
 * @param {ReturnType<import('./store.cjs').createStore>} networkStore
 * @param {ReturnType<import('./store.cjs').createStore>} localStore
 * @param {{ onSyncResult?: (result: { succeeded: number, failed: number, remaining: number }) => void, onRevalidated?: (keys: string[]) => void }} [options]
 */
function createResilientStore(networkStore, localStore, options = {}) {
  const { onSyncResult, onRevalidated } = options
  const revisions = new Map()
  let mirrorGeneration = 0
  const touch = key => revisions.set(key, (revisions.get(key) || 0) + 1)
  const queued = key => loadQueue().some(entry => entry.key === key)
  const semanticError = error => ['KV_CONFLICT', 'KV_INVALID_OPERATION', 'KV_LOCK_BUSY'].includes(error.code)

  /** Best-effort, ikke-blokerende spejling — må aldrig kunne vælte hovedoperationen. */
  function mirrorToLocal(key, value) {
    const revision = revisions.get(key) || 0
    const generation = mirrorGeneration
    setImmediate(() => {
      try {
        if (generation !== mirrorGeneration || (revisions.get(key) || 0) !== revision || queued(key)) return
        localStore.set(key, value)
      } catch (err) {
        console.error(`TCD Hub: kunne ikke spejle "${key}" til lokal cache:`, err)
      }
    })
  }

  function mirrorDeleteToLocal(key) {
    const revision = revisions.get(key) || 0
    const generation = mirrorGeneration
    setImmediate(() => {
      try {
        if (generation !== mirrorGeneration || (revisions.get(key) || 0) !== revision || queued(key)) return
        localStore.delete(key)
      } catch (err) { console.error(`Supply Chain Hub: kunne ikke rydde cache for "${key}":`, err) }
    })
  }

  function loadQueue() {
    return localStore.get(QUEUE_KEY) || []
  }

  function saveQueue(queue) {
    localStore.set(QUEUE_KEY, queue)
  }

  /** Opgivne skrivninger gemmes lokalt, saa de kan undersoeges - aldrig slettet i stilhed. */
  function saveDiscarded(entries) {
    try {
      const previous = localStore.get(DISCARDED_KEY) || []
      localStore.set(DISCARDED_KEY, [...entries, ...previous].slice(0, MAX_DISCARDED_KEPT))
    } catch (err) {
      console.error('TCD Hub: kunne ikke gemme opgivne skrivninger:', err)
    }
  }

  let queueIdCounter = 0
  function enqueue(entry) {
    const queue = loadQueue()
    queue.push({
      id: `q${Date.now()}_${queueIdCounter++}`,
      queuedAt: Date.now(),
      attempts: 0,
      ...entry,
    })
    saveQueue(queue)
  }

  function applyToNetwork(entry) {
    if (options.guardReplay) return options.guardReplay(entry, () => applyToNetworkUnlocked(entry))
    return applyToNetworkUnlocked(entry)
  }
  function applyToNetworkUnlocked(entry) {
    if (entry.kind === 'set') {
      networkStore.set(entry.key, entry.value)
      mirrorToLocal(entry.key, entry.value)
    } else if (entry.kind === 'delete') {
      networkStore.delete(entry.key)
      mirrorDeleteToLocal(entry.key)
    } else if (entry.kind === 'update') {
      const result = networkStore.update(entry.key, entry.operation)
      mirrorToLocal(entry.key, result)
    }
  }

  /**
   * Afspiller den lokalt gemte kø mod netværksstien, i rækkefølge. Hvis
   * forbindelsen forsvinder IGEN midtvejs, stoppes med det samme og resten af
   * køen gemmes uændret (ikke markeret som fejlede forsøg).
   */
  function replayQueue() {
    const queue = loadQueue()
    if (queue.length === 0) return { succeeded: 0, failed: 0, remaining: 0 }

    const remaining = []
    const discarded = []
    const blockedKeys = new Set()
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i]
      if (blockedKeys.has(entry.key)) { remaining.push(entry); continue }
      if (!networkStore.isConnected()) {
        remaining.push(...queue.slice(i))
        break
      }
      try {
        applyToNetwork(entry)
        succeeded++
      } catch (err) {
        const attempts = entry.attempts + 1
        const lastError = String((err && err.message) || err)
        // En KONFLIKT kan aldrig loese sig selv ved at proeve igen: elementet
        // blev aendret paa drevet imens, saa genafspilning giver samme konflikt
        // i al evighed. Beholdt vi posten, ville noeglen desuden blive ved med
        // at blive serveret fra den lokale (forael­dede) kopi, fordi queued(key)
        // er sand. Derfor lægges den til side i stedet - med spor, ikke i stilhed.
        if (PERMANENT_ERRORS.has(err?.code) || attempts >= MAX_REPLAY_ATTEMPTS) {
          discarded.push({ ...entry, attempts, lastError, discardedAt: Date.now() })
          console.error(`TCD Hub: opgav synkronisering af "${entry.key}" efter ${attempts} forsoeg: ${lastError}`)
          continue
        }
        failed++
        blockedKeys.add(entry.key)
        remaining.push({ ...entry, attempts, lastError })
      }
    }

    saveQueue(remaining)
    if (discarded.length) saveDiscarded(discarded)
    // Returformen holdes uaendret (succeeded/failed/remaining) - den er en del
    // af API'et mod UI og tests. Opgivne poster logges og gemmes lokalt.
    const result = { succeeded, failed, remaining: remaining.length }
    // Kun kvittering for noget der FAKTISK blev synkroniseret. Forbigaaende
    // fejl retter sig selv ved naeste forsoeg og skal ikke afbryde brugeren.
    if (succeeded > 0) onSyncResult?.(result)
    return result
  }

  /** Afspiller køen og rapporterer resultatet videre (bruges både automatisk og fra en manuel "prøv igen"-knap). */
  function runReplay() {
    return replayQueue()
  }

  function get(key, options) {
    if (queued(key)) return localStore.get(key)
    if (!networkStore.isConnected()) {
      // Watcheren har allerede opdaget at netværksstien er utilgængelig — stol
      // IKKE på networkStore.get()'s resultat (et fuldt drev-udfald kan
      // fejlagtigt se ud som "nøglen findes ikke"). Server fra lokal cache.
      return localStore.get(key)
    }
    try {
      const value = networkStore.get(key, options)
      if (value !== undefined) mirrorToLocal(key, value)
      return value
    } catch (err) {
      console.error(`TCD Hub: kunne ikke læse "${key}" fra delt lager, bruger lokal cache:`, err)
      return localStore.get(key)
    }
  }

  // Async twin of get(): same offline/cache fallback, plus "spejl foerst":
  // en SMB-rundtur koster 150-300 ms uanset filstoerrelse, saa hvis noeglen
  // findes i det lokale spejl (fra sidste laesning/session) returneres den MED
  // DET SAMME, og netvaerket hentes i baggrunden. Afviger M:-vaerdien, opdateres
  // spejlet og onRevalidated(key) fyres, saa vinduerne genindlaeser noeglen.
  async function getAsync(key, options) {
    if (queued(key)) return localStore.get(key)
    if (!networkStore.isConnected()) return localStore.get(key)
    if (!(options && options.skipCache)) {
      const fresh = networkStore.peekCache?.(key)
      if (fresh) return fresh.value
      const mirrored = localStore.get(key)
      if (mirrored !== undefined) {
        revalidate(key, mirrored, options)
        return mirrored
      }
    }
    try {
      const value = await networkStore.getAsync(key, options)
      if (value !== undefined) mirrorToLocal(key, value)
      return value
    } catch (err) {
      console.error(`TCD Hub: kunne ikke læse "${key}" fra delt lager, bruger lokal cache:`, err)
      return localStore.get(key)
    }
  }

  // Een baggrundshentning pr. noegle ad gangen; fejl ignoreres (spejlet staar).
  const revalidating = new Map()
  function revalidate(key, mirrored, options) {
    if (revalidating.has(key)) return revalidating.get(key)
    const run = (async () => {
      try {
        const value = await networkStore.getAsync(key, options)
        if (queued(key)) return
        if (value === undefined) {
          if (!networkStore.isConnected()) return
          mirrorDeleteToLocal(key)
          onRevalidated?.([key])
        } else if (JSON.stringify(value) !== JSON.stringify(mirrored)) {
          mirrorToLocal(key, value)
          onRevalidated?.([key])
        }
      } catch (err) {
        if (process.env.TCD_HUB_DEBUG) console.warn(`KV: baggrundshentning af "${key}" fejlede, spejl bevares:`, err.message)
      } finally {
        revalidating.delete(key)
      }
    })()
    revalidating.set(key, run)
    return run
  }

  /**
   * Opstarts-varmning: genhenter alle spejlede noegler i baggrunden med lav
   * parallelisme, saa spejlet er ajour FOER brugeren navigerer derhen (ellers
   * vises sidste sessions data et oejeblik ved foerste besoeg). Kun noegler der
   * allerede ligger i spejlet - dvs. dem brugeren faktisk bruger - og aldrig
   * fil-chunks (store, sjaeldent laeste).
   */
  async function revalidateMirror({ concurrency = 2 } = {}) {
    if (!networkStore.isConnected()) return 0
    const keys = localStore.keys().filter(key => key !== QUEUE_KEY && !key.startsWith('__') && !key.includes('_chunk_') && !queued(key) && !networkStore.peekCache?.(key))
    let index = 0
    let refreshed = 0
    const worker = async () => {
      while (index < keys.length && networkStore.isConnected()) {
        const key = keys[index++]
        const mirrored = localStore.get(key)
        if (mirrored === undefined) continue
        await revalidate(key, mirrored)
        refreshed++
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker))
    return refreshed
  }

  function set(key, value) {
    touch(key)
    if (!queued(key) && networkStore.isConnected()) {
      try {
        networkStore.set(key, value)
        mirrorToLocal(key, value)
        return
      } catch (err) {
        if (semanticError(err)) throw err
        console.error(`TCD Hub: skrivning af "${key}" fejlede, gemmer lokalt og synkroniserer senere:`, err)
      }
    }
    localStore.set(key, value)
    enqueue({ kind: 'set', key, value })
  }

  // Async-tvillinger til IPC-vejen: samme offline-koe og fejlsemantik, men
  // netvaerksskrivningen blokerer aldrig main-event-loopet.
  async function setAsync(key, value) {
    touch(key)
    if (!queued(key) && networkStore.isConnected()) {
      try {
        await networkStore.setAsync(key, value)
        mirrorToLocal(key, value)
        return
      } catch (err) {
        if (semanticError(err)) throw err
        console.error(`TCD Hub: skrivning af "${key}" fejlede, gemmer lokalt og synkroniserer senere:`, err)
      }
    }
    localStore.set(key, value)
    enqueue({ kind: 'set', key, value })
  }

  async function deleteAsync(key) {
    touch(key)
    if (!queued(key) && networkStore.isConnected()) {
      try {
        await networkStore.deleteAsync(key)
        mirrorDeleteToLocal(key)
        return
      } catch (err) {
        if (semanticError(err)) throw err
        console.error(`TCD Hub: sletning af "${key}" fejlede, gemmer lokalt og synkroniserer senere:`, err)
      }
    }
    localStore.delete(key)
    enqueue({ kind: 'delete', key })
  }

  async function updateAsync(key, operation) {
    touch(key)
    if (!queued(key) && networkStore.isConnected()) {
      try {
        const result = await networkStore.updateAsync(key, operation)
        mirrorToLocal(key, result)
        return result
      } catch (err) {
        if (semanticError(err)) throw err
        console.error(`TCD Hub: opdatering af "${key}" fejlede, gemmer lokalt og synkroniserer senere:`, err)
      }
    }
    const result = localStore.update(key, operation)
    enqueue({ kind: 'update', key, operation })
    return result
  }

  async function keysAsync() {
    if (!networkStore.isConnected()) return localStore.keys().filter((k) => k !== QUEUE_KEY && k !== DISCARDED_KEY)
    try {
      return await networkStore.keysAsync()
    } catch (err) {
      console.error('TCD Hub: kunne ikke liste nøgler fra delt lager, bruger lokal cache:', err)
      return localStore.keys().filter((k) => k !== QUEUE_KEY && k !== DISCARDED_KEY)
    }
  }

  function del(key) {
    touch(key)
    if (!queued(key) && networkStore.isConnected()) {
      try {
        networkStore.delete(key)
        mirrorDeleteToLocal(key)
        return
      } catch (err) {
        if (semanticError(err)) throw err
        console.error(`TCD Hub: sletning af "${key}" fejlede, gemmer lokalt og synkroniserer senere:`, err)
      }
    }
    localStore.delete(key)
    enqueue({ kind: 'delete', key })
  }

  function keys() {
    if (!networkStore.isConnected()) return localStore.keys().filter((k) => k !== QUEUE_KEY && k !== DISCARDED_KEY)
    try {
      return networkStore.keys()
    } catch (err) {
      console.error('TCD Hub: kunne ikke liste nøgler fra delt lager, bruger lokal cache:', err)
      return localStore.keys().filter((k) => k !== QUEUE_KEY && k !== DISCARDED_KEY)
    }
  }

  function update(key, operation) {
    touch(key)
    if (!queued(key) && networkStore.isConnected()) {
      try {
        const result = networkStore.update(key, operation)
        mirrorToLocal(key, result)
        return result
      } catch (err) {
        if (semanticError(err)) throw err
        console.error(`TCD Hub: opdatering af "${key}" fejlede, gemmer lokalt og synkroniserer senere:`, err)
      }
    }
    // Genbruger den lokale stores EGEN atomare update()-logik til at beregne
    // det umiddelbare resultat, så kaldere ser en konsistent værdi med det samme.
    const result = localStore.update(key, operation)
    enqueue({ kind: 'update', key, operation })
    return result
  }

  function watch(onChange, onConnectionChange, intervalMs) {
    // Fanger op på en evt. kø fra sidste session, hvis appen starter allerede forbundet.
    if (networkStore.isConnected()) runReplay()

    return networkStore.watch(onChange, (connected) => {
      if (connected) runReplay()
      onConnectionChange?.(connected)
    }, intervalMs)
  }

  function isConnected() {
    return networkStore.isConnected()
  }

  function dumpAll() {
    return networkStore.dumpAll()
  }

  function dumpAllAsync() {
    return networkStore.dumpAllAsync()
  }

  function getPendingSyncCount() {
    return loadQueue().length
  }

  return {
    get,
    getAsync,
    set,
    setAsync,
    delete: del,
    deleteAsync,
    keys,
    keysAsync,
    update,
    updateAsync,
    watch,
    isConnected,
    dumpAll,
    dumpAllAsync,
    getPendingSyncCount,
    retrySyncNow: runReplay,
    revalidateMirror,
    invalidate() { mirrorGeneration++; networkStore.invalidate?.(); localStore.invalidate?.() },
    get dataDir() {
      return networkStore.dataDir
    },
  }
}

module.exports = { createResilientStore }
