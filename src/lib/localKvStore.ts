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
  compareAndSet<T>(key: string, expected: T | undefined, value: T): Promise<T>
  /** Notifies when keys change (other tabs/clients, and local writes). Returns unsubscribe. */
  subscribe(listener: (changedKeys: string[]) => void): () => void
}

export type KvArrayOperation<T extends { id: string }> =
  | { op: 'append'; items: T[]; path?: string[] }
  | { op: 'upsert'; items: T[]; path?: string[] }
  | { op: 'remove'; ids: string[]; path?: string[] }
  | { op: 'replaceItem'; id: string; expected: T; item: T; path?: never }

export type KvFieldOperation =
  | { op: 'setField'; field: string; value: unknown }
  | { op: 'deleteField'; field: string }
  | { op: 'renameField'; field: string; newField: string; expected: unknown; value: unknown }

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
    // An existing invalid value is not a missing key: initialization must not
    // overwrite it with an empty default.
    return JSON.parse(raw) as T
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
    const raw = read(key)
    const current = raw === undefined ? undefined : JSON.parse(raw) as Record<string, unknown> | T[]
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
    } else if (operation.op === 'replaceItem') {
      const index = list.findIndex(entry => entry?.id === operation.id)
      if (index === -1 || JSON.stringify(list[index]) !== JSON.stringify(operation.expected)) throw new Error('KV_CONFLICT: Data changed. Reload and try again.')
      next = [...list]
      next[index] = operation.item
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

  async compareAndSet<T>(key: string, expected: T | undefined, value: T): Promise<T> {
    // No await between read/check/write: local operations are serialized in
    // this renderer. Shared desktop data uses the file lock in store.cjs.
    const raw = read(key)
    const current = raw === undefined ? undefined : JSON.parse(raw)
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('KV_CONFLICT: Data changed. Reload and try again.')
    write(key, JSON.stringify(value))
    notify([key])
    return value
  },

  // Browser kører single-client pr. origin — simpel read-modify-write rækker her.
  async updateField(key: string, operation: KvFieldOperation): Promise<Record<string, unknown>> {
    const unsafe = new Set(['__proto__', 'constructor', 'prototype'])
    if (!operation.field || unsafe.has(operation.field) || (operation.op === 'renameField' && (!operation.newField || unsafe.has(operation.newField)))) throw new Error('KV_INVALID_OPERATION: Invalid field.')
    if (operation.op !== 'deleteField' && JSON.stringify(operation.value) === undefined) throw new Error('KV_INVALID_OPERATION: Missing value.')
    const raw = read(key)
    const current = raw === undefined ? undefined : JSON.parse(raw) as Record<string, unknown>
    if (current !== undefined && (!current || typeof current !== 'object' || Array.isArray(current))) throw new Error('KV_INVALID_OPERATION: Expected an object.')
    const root: Record<string, unknown> = current && typeof current === 'object' && !Array.isArray(current) ? current : {}
    if (operation.op === 'renameField') {
      if (!Object.prototype.hasOwnProperty.call(root, operation.field) || JSON.stringify(root[operation.field]) !== JSON.stringify(operation.expected) || (operation.field !== operation.newField && Object.prototype.hasOwnProperty.call(root, operation.newField))) throw new Error('KV_CONFLICT: The account changed or the new email is taken.')
      delete root[operation.field]
      root[operation.newField] = operation.value
    }
    else if (operation.op === 'setField') root[operation.field] = operation.value
    else delete root[operation.field]
    write(key, JSON.stringify(root))
    notify([key])
    return root
  },
}
