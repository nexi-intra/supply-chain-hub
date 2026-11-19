import type { MultiplayerReaction, MultiplayerSeat } from './multiplayer'

/** When a game is opened, at most this many unseen reactions of the opponent pop up, so a long absence is not a firework. */
export const MAX_UNSEEN_REACTIONS = 3
/** Ids remembered per game; the game file keeps only the last 20 reactions, so older ids never come back. */
const SEEN_LIMIT = 40
const STORAGE_PREFIX = 'multiplayer-reactions-seen'

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

/** Where the ids of the reactions this person has seen in this game are kept (one entry per person and game). */
export function reactionScope(email: string, gameId: string): string {
  return `${email.trim().toLowerCase()}:${gameId}`
}

/** The opponent's reactions this client has not shown yet: the newest few, oldest first. Own reactions pop locally when sent. */
export function unseenReactions(
  reactions: readonly MultiplayerReaction[],
  seen: ReadonlySet<string>,
  me: MultiplayerSeat,
  limit = MAX_UNSEEN_REACTIONS,
): MultiplayerReaction[] {
  return reactions.filter(reaction => reaction.by !== me && !seen.has(reaction.id)).slice(-limit)
}

/** Every reaction currently in the game counts as seen afterwards, the ones beyond the limit and our own included. */
export function withSeenReactions(seen: ReadonlySet<string>, reactions: readonly MultiplayerReaction[]): Set<string> {
  const next = new Set(seen)
  for (const reaction of reactions) next.add(reaction.id)
  return next.size > SEEN_LIMIT ? new Set([...next].slice(-SEEN_LIMIT)) : next
}

export function loadSeenReactions(storage: ReadableStorage | null, scope: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(`${STORAGE_PREFIX}:${scope}`) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(-SEEN_LIMIT) : [])
  } catch {
    return new Set()
  }
}

export function saveSeenReactions(storage: WritableStorage | null, scope: string, seen: ReadonlySet<string>): void {
  try {
    storage?.setItem(`${STORAGE_PREFIX}:${scope}`, JSON.stringify([...seen].slice(-SEEN_LIMIT)))
  } catch {
    // Without storage the reactions may pop up again the next time the game is opened.
  }
}
