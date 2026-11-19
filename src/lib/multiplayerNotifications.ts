import type { NavigationTarget } from './appNavigation'
import type {
  MultiplayerGameEntry,
  MultiplayerGameType,
  MultiplayerNotification,
  MultiplayerSnapshot,
} from './multiplayer'

const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a) && Boolean(b) && a!.trim().toLowerCase() === b!.trim().toLowerCase()

/** Unread notifications for the signed-in user, newest first; empty when the snapshot belongs to someone else. */
export function unreadMultiplayerNotifications(
  snapshot: Pick<MultiplayerSnapshot, 'actor' | 'notifications'>,
  expectedEmail: string,
): MultiplayerNotification[] {
  if (!sameEmail(snapshot.actor.email, expectedEmail)) return []
  return snapshot.notifications
    .filter(note => note.readAt === null && sameEmail(note.recipientEmail, snapshot.actor.email))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

export function multiplayerActorName(games: readonly MultiplayerGameEntry[], notification: MultiplayerNotification): string {
  const own = games.find(game => game.id === notification.gameId)
  const candidates = own ? [own, ...games] : games
  for (const game of candidates) {
    const player = game.players.find(item => sameEmail(item.email, notification.actorEmail))
    if (player) return player.name
  }
  return notification.actorEmail.split('@')[0]
}

/** Game a notification is about: stored on it, else looked up, else word-puzzle (older notifications). */
export function multiplayerNotificationGameType(games: readonly MultiplayerGameEntry[], notification: Pick<MultiplayerNotification, 'gameId' | 'gameType'>): MultiplayerGameType {
  return notification.gameType ?? games.find(game => game.id === notification.gameId)?.type ?? 'word-puzzle'
}

/**
 * Every notification names its game: the Multiplayer hub opens that game's lobby (Word-Puzzle or chess), and the
 * match itself once it has started; an invitation that was not accepted only has the lobby to show.
 */
export function multiplayerNotificationTarget(notification: Pick<MultiplayerNotification, 'type' | 'gameId'>): NavigationTarget {
  return { view: 'games', params: { tab: 'multiplayer', itemId: notification.gameId } }
}
