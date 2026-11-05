import { useEffect, useMemo, useRef, useSyncExternalStore, useCallback } from 'react'
import { EMPTY_SNAPSHOT_STATE, sharedSnapshotStore, type SnapshotState, type SnapshotStore } from '@/lib/multiplayerSnapshotStore'

const NO_STORE: SnapshotStore = {
  getState: () => EMPTY_SNAPSHOT_STATE,
  subscribe: () => () => {},
  retain: () => () => {},
  refresh: async () => {},
}

/** The one multiplayer snapshot every surface shares: one fetch per burst of changes, no re-render when nothing changed. */
export function useMultiplayerSnapshot(options: { scope?: string; enabled?: boolean } = {}): { state: SnapshotState; refresh: SnapshotStore['refresh'] } {
  const { scope, enabled = true } = options
  const api = typeof window === 'undefined' ? undefined : window.electronMultiplayer
  const store = useMemo(() => (api && enabled ? sharedSnapshotStore(api) : NO_STORE), [api, enabled])
  useEffect(() => store.retain(scope), [store, scope])
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const storeRef = useRef(store)
  storeRef.current = store
  const refresh = useCallback<SnapshotStore['refresh']>(next => storeRef.current.refresh(next), [])
  return { state, refresh }
}
