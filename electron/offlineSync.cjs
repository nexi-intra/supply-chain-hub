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

/**
 * @param {ReturnType<import('./store.cjs').createStore>} networkStore
 * @param {ReturnType<import('./store.cjs').createStore>} localStore
 * @param {{ onSyncResult?: (result: { succeeded: number, failed: number, remaining: number }) => void }} [options]
 */
function createResilientStore(networkStore, localStore, options = {}) {
  const { onSyncResult } = options

  /** Best-effort, ikke-blokerende spejling — må aldrig kunne vælte hovedoperationen. */
  function mirrorToLocal(key, value) {
    setImmediate(() => {
      try {
        localStore.set(key, value)
      } catch (err) {
        console.error(`TCD Hub: kunne ikke spejle "${key}" til lokal cache:`, err)
      }
    })
  }

  function loadQueue() {
    return localStore.get(QUEUE_KEY) || []
  }

  function saveQueue(queue) {
    localStore.set(QUEUE_KEY, queue)
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
    if (entry.kind === 'set') {
      networkStore.set(entry.key, entry.value)
      mirrorToLocal(entry.key, entry.value)
    } else if (entry.kind === 'delete') {
      networkStore.delete(entry.key)
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
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i]
      if (!networkStore.isConnected()) {
        remaining.push(...queue.slice(i))
        break
      }
      try {
        applyToNetwork(entry)
        succeeded++
      } catch (err) {
        failed++
        remaining.push({ ...entry, attempts: entry.attempts + 1, lastError: String((err && err.message) || err) })
      }
    }

    saveQueue(remaining)
    return { succeeded, failed, remaining: remaining.length }
  }

  /** Afspiller køen og rapporterer resultatet videre (bruges både automatisk og fra en manuel "prøv igen"-knap). */
  function runReplay() {
    const result = replayQueue()
    if (result.succeeded > 0 || result.failed > 0) onSyncResult?.(result)
    return result
  }

  function get(key, options) {
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

  function set(key, value) {
    if (networkStore.isConnected()) {
      try {
        networkStore.set(key, value)
        mirrorToLocal(key, value)
        return
      } catch (err) {
        console.error(`TCD Hub: skrivning af "${key}" fejlede, gemmer lokalt og synkroniserer senere:`, err)
      }
    }
    localStore.set(key, value)
    enqueue({ kind: 'set', key, value })
  }

  function del(key) {
    if (networkStore.isConnected()) {
      try {
        networkStore.delete(key)
        setImmediate(() => {
          try { localStore.delete(key) } catch (err) { console.error(`TCD Hub: kunne ikke slette "${key}" fra lokal cache:`, err) }
        })
        return
      } catch (err) {
        console.error(`TCD Hub: sletning af "${key}" fejlede, gemmer lokalt og synkroniserer senere:`, err)
      }
    }
    localStore.delete(key)
    enqueue({ kind: 'delete', key })
  }

  function keys() {
    if (!networkStore.isConnected()) return localStore.keys().filter((k) => k !== QUEUE_KEY)
    try {
      return networkStore.keys()
    } catch (err) {
      console.error('TCD Hub: kunne ikke liste nøgler fra delt lager, bruger lokal cache:', err)
      return localStore.keys().filter((k) => k !== QUEUE_KEY)
    }
  }

  function update(key, operation) {
    if (networkStore.isConnected()) {
      try {
        const result = networkStore.update(key, operation)
        mirrorToLocal(key, result)
        return result
      } catch (err) {
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

  function getPendingSyncCount() {
    return loadQueue().length
  }

  return {
    get,
    set,
    delete: del,
    keys,
    update,
    watch,
    isConnected,
    dumpAll,
    getPendingSyncCount,
    retrySyncNow: runReplay,
    get dataDir() {
      return networkStore.dataDir
    },
  }
}

module.exports = { createResilientStore }
