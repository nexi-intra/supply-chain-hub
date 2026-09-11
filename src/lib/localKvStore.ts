// Local persistent key/value store backed by localStorage. Data survives
// reloads and app restarts. Used in the browser; in the desktop app the
// Electron file-based store (shared network folder) takes over instead.
// Falls back to an in-memory Map where Web Storage is blocked.

export interface KvStore {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
  /**
   * Atomar opdatering af et array af objekter med `id` — i desktop-appen under
   * fil-lås på tværs af klienter, så samtidige skrivninger ikke taber elementer.
   */
  update<T extends { id: string }>(key: string, operation: KvArrayOperation<T>): Promise<T[]>
  /**
   * Atomar opdatering af ét felt i et objekt (fx 'users', keyet pr. email) —
   * samme fil-lås som `update()`, men til data der ikke er et array af {id}-objekter.
   */
  updateField(key: string, operation: KvFieldOperation): Promise<Record<string, unknown>>
  /** Notifies when keys change (other tabs/clients, and local writes). Returns unsubscribe. */
  subscribe(listener: (changedKeys: string[]) => void): () => void
}

export type KvArrayOperation<T extends { id: string }> =
  | { op: 'append'; items: T[]; path?: string[] }
  | { op: 'upsert'; items: T[]; path?: string[] }
  | { op: 'remove'; ids: string[]; path?: string[] }

export type KvFieldOperation =
  | { op: 'setField'; field: string; value: unknown }
  | { op: 'deleteField'; field: string }

const PREFIX = 'tcd-hub:'

function detectStorage(): Storage | null {
  try {
    const testKey = '__tcd_hub_storage_test__'
    window.localStorage.setItem(testKey, '1')
    window.localStorage.removeItem(testKey)
    return window.localStorage
  } catch {
    return null
  }
}

const storage = detectStorage()
const memoryFallback = new Map<string, string>()

function read(key: string): string | undefined {
  if (storage) {
    const value = storage.getItem(PREFIX + key)
    return value === null ? undefined : value
  }
  return memoryFallback.get(key)
}

function write(key: string, value: string): void {
  if (storage) {
    storage.setItem(PREFIX + key, value)
  } else {
    memoryFallback.set(key, value)
  }
}

function remove(key: string): void {
  if (storage) {
    storage.removeItem(PREFIX + key)
  } else {
    memoryFallback.delete(key)
  }
}

function allKeys(): string[] {
  if (storage) {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key.slice(PREFIX.length))
    }
    return keys
  }
  return Array.from(memoryFallback.keys())
}

const listeners = new Set<(changedKeys: string[]) => void>()

function notify(changedKeys: string[]) {
  listeners.forEach((listener) => listener(changedKeys))
}

// Cross-tab sync: the 'storage' event fires in *other* tabs on writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith(PREFIX)) notify([event.key.slice(PREFIX.length)])
  })
}

// Async API kept for call-site compatibility.
export const localKv: KvStore = {
  async get<T>(key: string): Promise<T | undefined> {
    const raw = read(key)
    if (raw === undefined) return undefined
    try {
      return JSON.parse(raw) as T
    } catch {
      return undefined
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    write(key, JSON.stringify(value))
    notify([key])
  },

  async delete(key: string): Promise<void> {
    remove(key)
    notify([key])
  },

  async keys(): Promise<string[]> {
    return allKeys()
  },

  // Browser kører single-client pr. origin — simpel read-modify-write rækker her.
  // path navigerer ned i et objekt til et nested array (fx leaderboard pr. sværhedsgrad).
  async update<T extends { id: string }>(key: string, operation: KvArrayOperation<T>): Promise<T[]> {
    const current = await localKv.get<Record<string, unknown> | T[]>(key)
    const path = operation.path && operation.path.length > 0 ? operation.path : null
    let root: Record<string, unknown> | undefined
    let list: T[]
    if (path) {
      root = current && typeof current === 'object' && !Array.isArray(current) ? current as Record<string, unknown> : {}
      let parent: Record<string, unknown> = root
      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i]
        if (!parent[segment] || typeof parent[segment] !== 'object' || Array.isArray(parent[segment])) {
          parent[segment] = {}
        }
        parent = parent[segment] as Record<string, unknown>
      }
      const lastSegment = path[path.length - 1]
      list = Array.isArray(parent[lastSegment]) ? parent[lastSegment] as T[] : []
    } else {
      list = Array.isArray(current) ? current as T[] : []
    }
    let next: T[]
    if (operation.op === 'append') {
      next = [...list, ...operation.items]
    } else if (operation.op === 'upsert') {
      next = [...list]
      for (const item of operation.items) {
        const index = next.findIndex((entry) => entry?.id === item.id)
        if (index !== -1) next[index] = item
        else next.push(item)
      }
    } else {
      const ids = new Set(operation.ids)
      next = list.filter((entry) => !entry || !ids.has(entry.id))
    }
    if (path && root) {
      let parent: Record<string, unknown> = root
      for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]] as Record<string, unknown>
      parent[path[path.length - 1]] = next
      write(key, JSON.stringify(root))
    } else {
      write(key, JSON.stringify(next))
    }
    notify([key])
    return next
  },

  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  // Browser kører single-client pr. origin — simpel read-modify-write rækker her.
  async updateField(key: string, operation: KvFieldOperation): Promise<Record<string, unknown>> {
    const current = await localKv.get<Record<string, unknown>>(key)
    const root: Record<string, unknown> = current && typeof current === 'object' && !Array.isArray(current) ? current : {}
    if (operation.op === 'setField') root[operation.field] = operation.value
    else delete root[operation.field]
    write(key, JSON.stringify(root))
    notify([key])
    return root
  },
}
