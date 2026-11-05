import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { createSnapshotStore, EMPTY_SNAPSHOT_STATE, type SnapshotState, type SnapshotStore } from '@/lib/multiplayerSnapshotStore'
import { unreadHighFives, type HighFiveReceived, type HighFivesApi, type HighFiveSnapshot } from '@/lib/highFives'
import { useStableValue } from '@/hooks/useStable'

type HighFivesStore = SnapshotStore<HighFiveSnapshot>

const NO_STORE: HighFivesStore = {
  getState: () => EMPTY_SNAPSHOT_STATE,
  subscribe: () => () => {},
  retain: () => () => {},
  refresh: async () => {},
}
const NO_RECEIVED: HighFiveReceived[] = []

const stores = new WeakMap<object, HighFivesStore>()

/** One store per bridge object, shared by the bell and the Hub widget. */
function sharedStore(api: HighFivesApi): HighFivesStore {
  let store = stores.get(api)
  if (!store) {
    store = createSnapshotStore<HighFiveSnapshot>(api)
    stores.set(api, store)
  }
  return store
}

export interface HighFivesState {
  /** False in a browser without the desktop bridge. */
  available: boolean
  state: SnapshotState<HighFiveSnapshot>
  /** The snapshot, only while it belongs to the signed-in user. */
  snapshot: HighFiveSnapshot | null
  /** Unread high-fives for the bell, newest first. */
  unread: HighFiveReceived[]
  /** True once the first snapshot has been answered (successfully or not). */
  loaded: boolean
  refresh: HighFivesStore['refresh']
}

/** The one high-fives snapshot the bell and the Hub widget share: one fetch per burst of changes. */
export function useHighFives(userEmail: string): HighFivesState {
  const expected = userEmail.trim().toLowerCase()
  const api = typeof window === 'undefined' ? undefined : window.electronHighFives
  const available = Boolean(expected) && Boolean(api)
  const store = useMemo(() => (api && available ? sharedStore(api) : NO_STORE), [api, available])
  useEffect(() => store.retain(expected), [store, expected])
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const storeRef = useRef(store)
  storeRef.current = store
  const refresh = useCallback<HighFivesStore['refresh']>(next => storeRef.current.refresh(next), [])

  const own = state.snapshot && state.snapshot.actor.email.trim().toLowerCase() === expected ? state.snapshot : null
  // Unrelated parts of the snapshot (team feed, people) change without the unread list changing.
  const unread = useStableValue(useMemo(() => (own ? unreadHighFives(own, expected) : NO_RECEIVED), [own, expected]))
  return useMemo(
    () => ({ available, state, snapshot: own, unread, loaded: available ? state.loaded : true, refresh }),
    [available, state, own, unread, refresh],
  )
}
