import type { MultiplayerApi, MultiplayerSnapshot } from './multiplayer'

export interface SnapshotState<S = MultiplayerSnapshot> {
  snapshot: S | null
  /** The last fetch failed; cleared by the next success. The previous snapshot stays available. */
  error: unknown
  /** True once the first fetch has been answered, successfully or not. */
  loaded: boolean
  /** A fetch the user can see (first load or an explicit retry) is running. */
  loading: boolean
}

export const EMPTY_SNAPSHOT_STATE: SnapshotState<never> = { snapshot: null, error: null, loaded: false, loading: false }
const INITIAL = EMPTY_SNAPSHOT_STATE

/** Structural equality for JSON data, so an unchanged answer never causes a render. */
export function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

export interface SnapshotStore<S = MultiplayerSnapshot> {
  getState(): SnapshotState<S>
  subscribe(listener: () => void): () => void
  /**
   * Keeps the store live while held: follows the module's change channel (one trailing fetch per burst) and
   * fetches once now. A different `scope` (the signed-in user) starts from scratch.
   */
  retain(scope?: string): () => void
  /** One fetch at a time; a request made while one runs is answered by one more fetch afterwards. `visible` shows `loading`. */
  refresh(options?: { visible?: boolean }): Promise<void>
}

export function createSnapshotStore<S = MultiplayerSnapshot>(api: { snapshot(): Promise<S>; onChanged(callback: () => void): () => void }, { debounceMs = 200 }: { debounceMs?: number } = {}): SnapshotStore<S> {
  let state: SnapshotState<S> = INITIAL
  let json: string | null = null
  const listeners = new Set<() => void>()
  let holders = 0
  let scope: string | undefined
  let generation = 0
  let running: Promise<void> | null = null
  let again = false
  let visible = false
  let unsubscribe: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const publish = (next: SnapshotState<S>) => {
    if (next.snapshot === state.snapshot && next.error === state.error && next.loaded === state.loaded && next.loading === state.loading) return
    state = next
    for (const listener of [...listeners]) listener()
  }

  async function fetchOnce(showLoading: boolean) {
    const mine = generation
    if (showLoading || !state.loaded) publish({ ...state, loading: true })
    try {
      const next = await api.snapshot()
      if (mine !== generation) return
      const nextJson = JSON.stringify(next)
      const unchanged = nextJson === json
      json = nextJson
      publish({ snapshot: unchanged ? state.snapshot : next, error: null, loaded: true, loading: false })
    } catch (error) {
      if (mine !== generation) return
      publish({ ...state, error, loaded: true, loading: false })
    }
  }

  function refresh(options?: { visible?: boolean }): Promise<void> {
    if (options?.visible) visible = true
    if (running) { again = true; return running }
    running = (async () => {
      try {
        do {
          again = false
          const showLoading = visible
          visible = false
          await fetchOnce(showLoading)
        } while (again)
      } finally {
        running = null
      }
    })()
    return running
  }

  function reset() {
    generation++
    json = null
    visible = false
    state = INITIAL
    for (const listener of [...listeners]) listener()
  }

  function retain(next?: string) {
    holders++
    if (next !== undefined && scope !== next) {
      const hadScope = scope !== undefined
      scope = next
      if (hadScope) reset()
    }
    if (holders === 1) {
      unsubscribe = api.onChanged(() => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { timer = undefined; void refresh() }, debounceMs)
      })
    }
    void refresh()
    let released = false
    return () => {
      if (released) return
      released = true
      holders--
      if (holders > 0) return
      if (timer) { clearTimeout(timer); timer = undefined }
      unsubscribe?.()
      unsubscribe = undefined
      scope = undefined
      reset()
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    retain,
    refresh,
  }
}

const stores = new WeakMap<object, SnapshotStore>()

/** One store per bridge object, shared by the bell, the toasts and every lobby. */
export function sharedSnapshotStore(api: MultiplayerApi): SnapshotStore {
  let store = stores.get(api)
  if (!store) {
    store = createSnapshotStore(api)
    stores.set(api, store)
  }
  return store
}
