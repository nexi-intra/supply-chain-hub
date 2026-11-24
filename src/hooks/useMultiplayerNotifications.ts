import { useMemo } from 'react'
import type { MultiplayerGameEntry, MultiplayerNotification } from '@/lib/multiplayer'
import { unreadMultiplayerNotifications } from '@/lib/multiplayerNotifications'
import { useMultiplayerSnapshot } from '@/hooks/useMultiplayerSnapshot'
import { useStableValue } from '@/hooks/useStable'

export interface MultiplayerNotificationState {
  /** Unread notifications for the signed-in user, newest first. */
  notifications: MultiplayerNotification[]
  /** The user's games, for player names. */
  games: MultiplayerGameEntry[]
  /** True once the first snapshot has been answered (successfully or not). */
  loaded: boolean
  /** True once a snapshot succeeded; only then is "already existed at start" known. */
  ready: boolean
}

const NO_NOTIFICATIONS: MultiplayerNotification[] = []
const NO_GAMES: MultiplayerGameEntry[] = []
const UNAVAILABLE: MultiplayerNotificationState = { notifications: NO_NOTIFICATIONS, games: NO_GAMES, loaded: true, ready: false }

/** Unread Word-Puzzle notifications for the bell, toast and Windows notifications; follows the module's shared snapshot. */
export function useMultiplayerNotifications(userEmail: string): MultiplayerNotificationState {
  const expected = userEmail.trim().toLowerCase()
  const enabled = Boolean(expected) && typeof window !== 'undefined' && Boolean(window.electronMultiplayer)
  const { state } = useMultiplayerSnapshot({ scope: expected, enabled })
  const snapshot = state.snapshot

  const unread = useMemo(() => (snapshot ? unreadMultiplayerNotifications(snapshot, expected) : NO_NOTIFICATIONS), [snapshot, expected])
  // Unrelated parts of the snapshot (rivals, stats) change without these two changing.
  const notifications = useStableValue(unread)
  const games = useStableValue(snapshot?.games ?? NO_GAMES)
  const loaded = state.loaded
  const ready = snapshot !== null

  return useMemo(
    () => (enabled ? { notifications, games, loaded, ready } : UNAVAILABLE),
    [enabled, notifications, games, loaded, ready],
  )
}
