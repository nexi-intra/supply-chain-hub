import type { NavigationTarget } from './appNavigation'

/** Mirrors EMOJIS in electron/highFives.cjs; the main process stays the authority. */
export const HIGH_FIVE_EMOJIS = ['🙌', '👏', '🎉', '💪', '🔥', '⭐', '🙏', '❤️'] as const
export type HighFiveEmoji = typeof HIGH_FIVE_EMOJIS[number]
export const DEFAULT_HIGH_FIVE_EMOJI: HighFiveEmoji = '🙌'
export const HIGH_FIVE_MESSAGE_LIMIT = 200
/** How many high-fives each list on the Hub shows. */
export const HIGH_FIVE_VISIBLE = 10

export interface HighFivePerson { email: string; fullName: string; teamCode: string }
export interface HighFiveTeam { folderName: string; name: string }

/** A high-five the signed-in user received. */
export interface HighFiveReceived {
  id: string
  senderName: string
  senderTeamCode: string
  emoji: string
  message: string
  at: string
  readAt: string | null
}

/** A high-five sent to or by someone in the user's team. */
export interface HighFiveTeamEntry {
  id: string
  senderName: string
  senderTeamCode: string
  recipientName: string
  recipientTeamCode: string
  emoji: string
  message: string
  at: string
}

export interface HighFiveActor { email: string; fullName: string; teamCode: string; canSend: boolean }

export interface HighFiveSnapshot {
  actor: HighFiveActor
  received: HighFiveReceived[]
  team: HighFiveTeamEntry[]
  /** Colleagues to choose from: everyone approved except the user and the creator. */
  people: HighFivePerson[]
  teams: HighFiveTeam[]
}

export interface HighFiveSendCommand { operationId: string; type: 'send'; recipientEmail: string; emoji: HighFiveEmoji; message: string }
export interface HighFiveAcknowledgeCommand { operationId: string; type: 'acknowledge'; ids: string[] }
export type HighFiveCommand = HighFiveSendCommand | HighFiveAcknowledgeCommand

export interface HighFivesApi {
  snapshot(): Promise<HighFiveSnapshot>
  command(command: HighFiveSendCommand): Promise<HighFiveTeamEntry>
  command(command: HighFiveAcknowledgeCommand): Promise<{ acknowledged: number }>
  onChanged(callback: () => void): () => void
}

declare global {
  interface Window {
    electronHighFives?: HighFivesApi
  }
}

const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a) && Boolean(b) && a!.trim().toLowerCase() === b!.trim().toLowerCase()

// Same rule as the main process: no control characters, line/paragraph separators or bidi overrides.
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/

export type HighFiveMessageProblem = 'empty' | 'tooLong' | 'unsafe'

export function highFiveMessageProblem(message: string): HighFiveMessageProblem | null {
  if (!message.trim()) return 'empty'
  if (message.length > HIGH_FIVE_MESSAGE_LIMIT) return 'tooLong'
  if (UNSAFE_TEXT.test(message)) return 'unsafe'
  return null
}

export function isHighFiveEmoji(value: string): value is HighFiveEmoji {
  return (HIGH_FIVE_EMOJIS as readonly string[]).includes(value)
}

/** The unread high-fives for the signed-in user, newest first; empty when the snapshot belongs to someone else. */
export function unreadHighFives(snapshot: Pick<HighFiveSnapshot, 'actor' | 'received'> | null, expectedEmail: string): HighFiveReceived[] {
  if (!snapshot || !sameEmail(snapshot.actor.email, expectedEmail)) return []
  return snapshot.received.filter(item => item.readAt === null).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

/** The team feed with the user's own just-sent entries merged in (the snapshot wins), newest first, cut to `limit`. */
export function mergeTeamFeed(team: readonly HighFiveTeamEntry[], local: readonly HighFiveTeamEntry[], limit = HIGH_FIVE_VISIBLE): HighFiveTeamEntry[] {
  const known = new Set(team.map(entry => entry.id))
  const sameContent = (a: HighFiveTeamEntry, b: HighFiveTeamEntry) =>
    a.senderName === b.senderName && a.recipientName === b.recipientName && a.emoji === b.emoji && a.message === b.message
  // A pending entry is already in the snapshot when the change notice beat the command's own answer.
  const extra = local.filter(entry => !known.has(entry.id) && !(entry.id.startsWith('pending-') && team.some(other => sameContent(entry, other))))
  return [...team, ...extra]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
}

export function sortPeople(people: readonly HighFivePerson[]): HighFivePerson[] {
  return [...people].sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export const HIGH_FIVE_ERROR_CODES = [
  'HIGH_FIVES_INVALID', 'HIGH_FIVES_FORBIDDEN', 'HIGH_FIVES_LIMIT', 'HIGH_FIVES_CONFLICT',
  'HIGH_FIVES_OPERATION_CONFLICT', 'HIGH_FIVES_INVALID_DATA', 'HIGH_FIVES_DIRECTORY', 'HIGH_FIVES_UNAVAILABLE', 'AUTH_REQUIRED',
] as const
export type HighFiveErrorCode = typeof HIGH_FIVE_ERROR_CODES[number]

/** The service error code inside an IPC error; the remote error text carries it ("HIGH_FIVES_LIMIT: ..."). */
export function highFiveErrorCode(error: unknown): HighFiveErrorCode | null {
  const text = error && typeof error === 'object'
    ? `${'code' in error ? String(error.code) : ''} ${'message' in error ? String(error.message) : ''}`
    : String(error ?? '')
  const raw = text.match(/AUTH_REQUIRED|HIGH_FIVES_[A-Z_]+/)?.[0]
  if (!raw) return null
  return (HIGH_FIVE_ERROR_CODES as readonly string[]).includes(raw) ? raw as HighFiveErrorCode : 'HIGH_FIVES_UNAVAILABLE'
}

/** Every high-five notification opens the Hub, where the widget lists it. */
export const HIGH_FIVE_TARGET: NavigationTarget = { view: 'hub' }
