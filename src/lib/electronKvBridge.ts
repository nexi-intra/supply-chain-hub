import type { KvStore, KvArrayOperation, KvFieldOperation } from './localKvStore'

/** Live status for forbindelsen til den delte datamappe (electron/main.cjs). */
export interface StorageConnectionStatus {
  connected: boolean
  dataDir: string
  source: 'env' | 'config' | 'user' | 'default'
  /** Tidsstempel for seneste statusskift. */
  since: number
  /** True hvis appen ved opstart måtte falde tilbage fra en foretrukken (men utilgængelig) kilde. */
  startedDisconnected: boolean
  /** Kilder ('env'/'config'/'user') der blev forsøgt og fejlede før den nuværende blev valgt. */
  failedSources: string[]
  /** Antal ændringer lavet mens offline, der endnu ikke er synkroniseret til det delte lager. */
  pendingSyncCount: number
}

/** Resultat af en (automatisk eller manuel) afspilning af den offline skrive-kø. */
export interface StorageSyncResult {
  succeeded: number
  failed: number
  remaining: number
}

// Raw API exposed by electron/preload.cjs via contextBridge.
export interface ElectronKvApi {
  get(key: string): Promise<unknown>
  getMany(keys: string[]): Promise<unknown[]>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
  update(key: string, operation: unknown): Promise<unknown>
  getDataDir(): Promise<string>
  getStorageInfo(): Promise<{ dataDir: string; source: 'env' | 'config' | 'user' | 'default' }>
  chooseDataDir(): Promise<{ dataDir: string; migratedFiles: number } | null>
  getConnectionStatus(): Promise<StorageConnectionStatus>
  retrySync(): Promise<StorageSyncResult>
  onConnectionChanged(callback: (status: StorageConnectionStatus) => void): () => void
  onSyncResult(callback: (result: StorageSyncResult) => void): () => void
  onChanged(callback: (changedKeys: string[]) => void): () => void
}



/** Adapts the preload bridge to the app's KvStore interface. */
export function createElectronKv(api: ElectronKvApi): KvStore {
  let queued = new Map<string, Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }>>()
  let flushScheduled = false
  const flushReads = async () => {
    flushScheduled = false
    const batch = queued
    queued = new Map()
    const keys = [...batch.keys()]
    try {
      const values = await api.getMany(keys)
      keys.forEach((key, index) => batch.get(key)?.forEach(request => request.resolve(values[index])))
    } catch (error) {
      batch.forEach(requests => requests.forEach(request => request.reject(error)))
    }
  }
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return new Promise<T | undefined>((resolve, reject) => {
        const requests = queued.get(key) || []
        requests.push({ resolve: value => resolve(value as T | undefined), reject })
        queued.set(key, requests)
        if (!flushScheduled) {
          flushScheduled = true
          queueMicrotask(flushReads)
        }
      })
    },
    async set<T>(key: string, value: T): Promise<void> {
      await api.set(key, value)
    },
    async delete(key: string): Promise<void> {
      await api.delete(key)
    },
    async keys(): Promise<string[]> {
      return api.keys()
    },
    async update<T extends { id: string }>(key: string, operation: KvArrayOperation<T>): Promise<T[]> {
      return (await api.update(key, operation)) as T[]
    },
    async updateField(key: string, operation: KvFieldOperation): Promise<Record<string, unknown>> {
      return (await api.update(key, operation)) as Record<string, unknown>
    },
    async compareAndSet<T>(key: string, expected: T | undefined, value: T): Promise<T> {
      return (await api.update(key, { op: 'compareAndSet', expected, value })) as T
    },
    subscribe(listener) {
      return api.onChanged(listener)
    },
  }
}
