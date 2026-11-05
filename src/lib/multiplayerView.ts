import { BOARD_SIZE, CENTER } from '@/games/wordPuzzle/display'
import {
  MULTIPLAYER_ERROR_CODES,
  MULTIPLAYER_MOVE_ERRORS,
  type MultiplayerBackgammonEntry,
  type MultiplayerBoard,
  type MultiplayerChessEntry,
  type MultiplayerErrorCode,
  type MultiplayerGameEntry,
  type MultiplayerMoveError,
  type MultiplayerNotification,
  type MultiplayerNotificationType,
  type MultiplayerPerson,
  type MultiplayerPlacement,
  type MultiplayerPlayer,
  type MultiplayerWordPuzzleEntry,
} from './multiplayer'

export const RACK_SIZE = 7
/** Mirrors REMIND_INTERVAL_MS in electron/multiplayer.cjs; the main process stays the authority. */
export const REMINDER_INTERVAL_MS = 12 * 3600 * 1000
export const CHAT_TEXT_LIMIT = 500

const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a) && Boolean(b) && a!.trim().toLowerCase() === b!.trim().toLowerCase()

export function newOperationId(): string {
  return crypto.randomUUID()
}

/** An entry without a type was written before chess existed and is a Word-Puzzle. */
export const isChessEntry = (entry: MultiplayerGameEntry): entry is MultiplayerChessEntry => entry.type === 'chess'
export const isBackgammonEntry = (entry: MultiplayerGameEntry): entry is MultiplayerBackgammonEntry => entry.type === 'backgammon'
export const isWordPuzzleEntry = (entry: MultiplayerGameEntry): entry is MultiplayerWordPuzzleEntry => entry.type !== 'chess' && entry.type !== 'backgammon'

// ---------------------------------------------------------------- lobby

export interface LobbyGroups<T extends MultiplayerGameEntry = MultiplayerGameEntry> {
  yourTurn: T[]
  waiting: T[]
  invitationsIn: T[]
  invitationsOut: T[]
  finished: T[]
}

const newestFirst = (a: MultiplayerGameEntry, b: MultiplayerGameEntry) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)

export function groupGames<T extends MultiplayerGameEntry>(games: readonly T[], me: string): LobbyGroups<T> {
  const groups: LobbyGroups<T> = { yourTurn: [], waiting: [], invitationsIn: [], invitationsOut: [], finished: [] }
  for (const game of games) {
    if (game.status === 'invited') (sameEmail(game.players[1].email, me) ? groups.invitationsIn : groups.invitationsOut).push(game)
    else if (game.status === 'active' || game.status === 'awaiting-approval') (sameEmail(game.turn, me) ? groups.yourTurn : groups.waiting).push(game)
    else groups.finished.push(game)
  }
  for (const list of Object.values(groups)) list.sort(newestFirst)
  return groups
}

export function seatOf(game: { players: readonly [MultiplayerPlayer, MultiplayerPlayer] }, me: string): 0 | 1 | null {
  if (sameEmail(game.players[0].email, me)) return 0
  if (sameEmail(game.players[1].email, me)) return 1
  return null
}

export function opponentOf(game: { players: readonly [MultiplayerPlayer, MultiplayerPlayer] }, me: string): MultiplayerPlayer {
  return seatOf(game, me) === 1 ? game.players[0] : game.players[1]
}

interface Turnable { status: MultiplayerGameEntry['status']; turn: string | null }

export function canMove(game: Turnable, me: string): boolean {
  return game.status === 'active' && sameEmail(game.turn, me)
}

export function canApprove(game: Turnable, me: string): boolean {
  return game.status === 'awaiting-approval' && sameEmail(game.turn, me)
}

export function canAct(game: Turnable, me: string): boolean {
  return canMove(game, me) || canApprove(game, me)
}

export function canExchange(game: { bagCount: number }): boolean {
  return game.bagCount >= RACK_SIZE
}

export function canRemind(entry: MultiplayerGameEntry, me: string, now: number): boolean {
  if (entry.status !== 'active' && entry.status !== 'awaiting-approval') return false
  const seat = seatOf(entry, me)
  if (seat === null || sameEmail(entry.turn, me)) return false
  const last = entry.reminders?.[seat]
  return !last || now - Date.parse(last) >= REMINDER_INTERVAL_MS
}

export function outcomeFor(entry: { status: string; winner: string | null }, me: string): 'won' | 'lost' | 'draw' | null {
  if (entry.status !== 'finished' || !entry.winner) return null
  if (entry.winner === 'draw') return 'draw'
  return sameEmail(entry.winner, me) ? 'won' : 'lost'
}

const ACKNOWLEDGED_WHILE_VISIBLE: readonly MultiplayerNotificationType[] = [
  'turn', 'chat', 'approve-word', 'word-approved', 'word-rejected', 'finished', 'reminder', 'accepted', 'draw-offer', 'draw-declined',
]

/** Unread notifications that an open, visible match makes obsolete. */
export function unreadGameNotificationIds(notifications: readonly MultiplayerNotification[], gameId: string, me: string): string[] {
  return notifications
    .filter(note => note.gameId === gameId && note.readAt === null && sameEmail(note.recipientEmail, me) && ACKNOWLEDGED_WHILE_VISIBLE.includes(note.type))
    .map(note => note.id)
}

export function relativeTime(iso: string, now: number, language: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.floor((now - then) / 1000))
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  if (seconds < 45) return formatter.format(0, 'second')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return formatter.format(-Math.max(1, minutes), 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return formatter.format(-hours, 'hour')
  const days = Math.floor(hours / 24)
  if (days < 30) return formatter.format(-days, 'day')
  return new Date(then).toLocaleDateString(language)
}

export function multiplayerErrorInfo(error: unknown): { code: MultiplayerErrorCode | null; detail: MultiplayerMoveError | null } {
  const text = error && typeof error === 'object'
    ? `${'code' in error ? String(error.code) : ''} ${'message' in error ? String(error.message) : ''}`
    : String(error ?? '')
  const raw = text.match(/AUTH_[A-Z_]+|MULTIPLAYER_[A-Z_]+/)?.[0]
  if (!raw) return { code: null, detail: null }
  const code = (MULTIPLAYER_ERROR_CODES as readonly string[]).includes(raw) ? raw as MultiplayerErrorCode : 'MULTIPLAYER_UNAVAILABLE'
  const detailText = code === 'MULTIPLAYER_INVALID_MOVE' ? text.match(/MULTIPLAYER_INVALID_MOVE:\s*([A-Z_]+)/)?.[1] : undefined
  const detail = detailText && (MULTIPLAYER_MOVE_ERRORS as readonly string[]).includes(detailText) ? detailText as MultiplayerMoveError : null
  return { code, detail }
}

const fold = (value: string) => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ø/gi, 'o').replace(/æ/gi, 'ae')
  .toLowerCase().trim()

export function matchesPerson(person: MultiplayerPerson, teamName: string, query: string): boolean {
  const needle = fold(query)
  if (!needle) return true
  return fold(person.fullName).includes(needle) || fold(teamName).includes(needle)
}

// ---------------------------------------------------------------- placing tiles

export type Direction = 'across' | 'down'
export interface Cursor { row: number; col: number }
export interface KeyboardState { cursor: Cursor; direction: Direction }

/** A rack tile laid on a square but not played yet; `letter` is the effective letter (the chosen one for a blank). */
export interface DraftTile { rackIndex: number; row: number; col: number; letter: string; blank: boolean }
/** `order` is the on-screen order of all rack indexes (local shuffle); `tiles` are the ones currently on the board. */
export interface Draft { order: number[]; tiles: DraftTile[] }

const LETTER = /^\p{L}$/u

export function emptyDraft(rackSize: number): Draft {
  return { order: Array.from({ length: rackSize }, (_, index) => index), tiles: [] }
}

const inBounds = (row: number, col: number) => Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < BOARD_SIZE && col < BOARD_SIZE
const draftAt = (draft: Draft, row: number, col: number) => draft.tiles.find(tile => tile.row === row && tile.col === col)

export function squareFree(board: MultiplayerBoard, draft: Draft, row: number, col: number): boolean {
  return inBounds(row, col) && !board[row]?.[col] && !draftAt(draft, row, col)
}

export function unplacedRackIndexes(draft: Draft): number[] {
  return draft.order.filter(index => !draft.tiles.some(tile => tile.rackIndex === index))
}

export function placeTile(draft: Draft, board: MultiplayerBoard, rack: readonly string[], rackIndex: number, row: number, col: number, blankLetter?: string): Draft {
  if (!Number.isInteger(rackIndex) || rackIndex < 0 || rackIndex >= rack.length || !draft.order.includes(rackIndex)) return draft
  const own = draft.tiles.find(tile => tile.rackIndex === rackIndex)
  if (!inBounds(row, col) || board[row]?.[col]) return draft
  const occupant = draftAt(draft, row, col)
  if (occupant && occupant !== own) return draft
  const isBlank = rack[rackIndex] === '?'
  let letter = rack[rackIndex]
  if (isBlank) {
    const chosen = (blankLetter ?? '').toUpperCase()
    if (!LETTER.test(chosen)) return draft
    letter = chosen
  }
  const tile: DraftTile = { rackIndex, row, col, letter, blank: isBlank }
  return { ...draft, tiles: [...draft.tiles.filter(item => item.rackIndex !== rackIndex), tile] }
}

export function moveDraftTile(draft: Draft, board: MultiplayerBoard, from: Cursor, to: Cursor): Draft {
  const tile = draftAt(draft, from.row, from.col)
  if (!tile || !inBounds(to.row, to.col) || board[to.row]?.[to.col]) return draft
  const occupant = draftAt(draft, to.row, to.col)
  if (occupant && occupant !== tile) return draft
  return { ...draft, tiles: draft.tiles.map(item => (item === tile ? { ...item, row: to.row, col: to.col } : item)) }
}

export function recallTile(draft: Draft, row: number, col: number): Draft {
  if (!draftAt(draft, row, col)) return draft
  return { ...draft, tiles: draft.tiles.filter(tile => !(tile.row === row && tile.col === col)) }
}

export function recallAll(draft: Draft): Draft {
  return draft.tiles.length ? { ...draft, tiles: [] } : draft
}

/** Changes the letter a placed blank stands for. */
export function retargetBlank(draft: Draft, row: number, col: number, letter: string): Draft {
  const tile = draftAt(draft, row, col)
  const chosen = letter.toUpperCase()
  if (!tile || !tile.blank || !LETTER.test(chosen)) return draft
  return { ...draft, tiles: draft.tiles.map(item => (item === tile ? { ...item, letter: chosen } : item)) }
}

export function shuffleRack(draft: Draft, random: () => number = Math.random): Draft {
  const order = [...draft.order]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return { ...draft, order }
}

export function draftToPlacements(draft: Draft): MultiplayerPlacement[] {
  return [...draft.tiles]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map(tile => ({ row: tile.row, col: tile.col, letter: tile.letter, blank: tile.blank }))
}

// ---------------------------------------------------------------- keyboard

export function toggleDirection(state: KeyboardState): KeyboardState {
  return { ...state, direction: state.direction === 'across' ? 'down' : 'across' }
}

export function moveCursor(cursor: Cursor, key: string): Cursor {
  const clamp = (value: number) => Math.min(BOARD_SIZE - 1, Math.max(0, value))
  switch (key) {
    case 'ArrowUp': return { row: clamp(cursor.row - 1), col: cursor.col }
    case 'ArrowDown': return { row: clamp(cursor.row + 1), col: cursor.col }
    case 'ArrowLeft': return { row: cursor.row, col: clamp(cursor.col - 1) }
    case 'ArrowRight': return { row: cursor.row, col: clamp(cursor.col + 1) }
    default: return { ...cursor }
  }
}

/** First free square after (step 1) or before (step -1) `from`, skipping tiles; null when the line runs out. */
function stepFree(board: MultiplayerBoard, draft: Draft, from: Cursor, direction: Direction, step: 1 | -1): Cursor | null {
  let { row, col } = from
  for (;;) {
    if (direction === 'across') col += step
    else row += step
    if (!inBounds(row, col)) return null
    if (squareFree(board, draft, row, col)) return { row, col }
  }
}

/** Where a first keyboard letter should go: the centre if free, else the first free square. */
export function defaultCursor(board: MultiplayerBoard, draft: Draft): Cursor {
  if (squareFree(board, draft, CENTER, CENTER)) return { row: CENTER, col: CENTER }
  for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) if (squareFree(board, draft, row, col)) return { row, col }
  return { row: CENTER, col: CENTER }
}

export function typeLetter(
  draft: Draft, board: MultiplayerBoard, rack: readonly string[], state: KeyboardState, key: string, alphabet?: readonly string[],
): { draft: Draft; state: KeyboardState; placed: boolean } {
  const unchanged = { draft, state, placed: false }
  const letter = key.toUpperCase()
  if (!LETTER.test(letter) || (alphabet && !alphabet.includes(letter))) return unchanged
  const target = squareFree(board, draft, state.cursor.row, state.cursor.col) ? state.cursor : stepFree(board, draft, state.cursor, state.direction, 1)
  if (!target) return unchanged
  const free = unplacedRackIndexes(draft)
  const rackIndex = free.find(index => rack[index] === letter) ?? free.find(index => rack[index] === '?')
  if (rackIndex === undefined) return unchanged
  const next = placeTile(draft, board, rack, rackIndex, target.row, target.col, letter)
  if (next === draft) return unchanged
  const after = stepFree(board, next, target, state.direction, 1) ?? target
  return { draft: next, state: { ...state, cursor: after }, placed: true }
}

export function backspace(draft: Draft, board: MultiplayerBoard, state: KeyboardState): { draft: Draft; state: KeyboardState } {
  const here = draftAt(draft, state.cursor.row, state.cursor.col)
  if (here) return { draft: recallTile(draft, here.row, here.col), state }
  // Step back over finished tiles only; squares with draft tiles count as steps.
  let { row, col } = state.cursor
  for (;;) {
    if (state.direction === 'across') col -= 1
    else row -= 1
    if (!inBounds(row, col)) return { draft, state }
    if (!board[row]?.[col]) break
  }
  return { draft: recallTile(draft, row, col), state: { ...state, cursor: { row, col } } }
}
