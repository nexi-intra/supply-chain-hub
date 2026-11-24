// Opens the warehouse stores on M: without blocking the main thread: the folder is made with fs.promises.mkdir before
// createStore (which then skips its own mkdirSync). A folder that could not be made is not tried again for a few
// seconds, so a hanging or missing drive is not hit by every call (a plain user's SAP indicator polls every 5 s).
const fs = require('node:fs')

const OPEN_RETRY_MS = 5000

function storageUnavailable() {
  return Object.assign(new Error('STORAGE_UNAVAILABLE'), { code: 'STORAGE_UNAVAILABLE' })
}

function createStoreOpener({ createStore, preparedFiles = null, now = () => Date.now(), retryMs = OPEN_RETRY_MS }) {
  const stores = new Map()
  const opening = new Map()
  const failedAt = new Map()
  const handles = new Map()
  // Raised by forget(): an attempt started before it is neither joined nor remembered when it fails.
  let generation = 0

  /** The store of `dir`, made on first use; rejects STORAGE_UNAVAILABLE while the folder cannot be made. */
  function open(dir) {
    const store = stores.get(dir)
    if (store) return Promise.resolve(store)
    const current = opening.get(dir)
    if (current && current.generation === generation) return current.pending
    const failed = failedAt.get(dir)
    if (failed !== undefined && now() - failed < retryMs) return Promise.reject(storageUnavailable())
    const started = generation
    const pending = Promise.resolve()
      .then(() => fs.promises.mkdir(dir, { recursive: true }))
      .then(() => {
        if (!stores.has(dir)) stores.set(dir, createStore(dir, { preparedFiles, createDir: false }))
        failedAt.delete(dir)
        return stores.get(dir)
      })
      .catch(error => {
        if (started === generation) failedAt.set(dir, now())
        console.error('Lagerstyring: storage unavailable', dir, error?.code)
        throw storageUnavailable()
      })
      .finally(() => { if (opening.get(dir)?.pending === pending) opening.delete(dir) })
    opening.set(dir, { pending, generation: started })
    return pending
  }

  /**
   * A store handle whose folder is looked up on each use (`dirOf`) and opened when a method is called. Every store
   * method is forwarded, so a service can never call one that a hand-written wrapper forgot; each returns a promise
   * (the services only use the *Async methods). `then` is not forwarded, so the handle is never taken for a promise.
   */
  function lazy(dirOf) {
    return new Proxy({}, {
      get: (_, name) => {
        if (name === 'then' || typeof name === 'symbol') return undefined
        if (name === 'dataDir') return dirOf()
        return async (...args) => (await open(dirOf()))[name](...args)
      },
    })
  }

  /** The handle of a known folder, the same object on every call. */
  function handle(dir) {
    if (!handles.has(dir)) handles.set(dir, lazy(() => dir))
    return handles.get(dir)
  }

  return {
    open,
    lazy,
    handle,
    /** The store of `dir` if it is open already; never opens or makes anything. */
    opened: dir => stores.get(dir),
    /** M: is back: folders that failed just now, or are being tried right now, may be tried again at once. */
    forget: () => { generation++; failedAt.clear() },
  }
}

module.exports = { createStoreOpener, OPEN_RETRY_MS }
