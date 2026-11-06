export const MULTIPLAYER_LANGUAGES = ['da', 'en', 'sv', 'fi'] as const
export const MULTIPLAYER_GAME_TYPES = ['word-puzzle', 'chess', 'backgammon'] as const
export const MULTIPLAYER_GAME_STATUSES = ['invited', 'active', 'awaiting-approval', 'finished', 'declined', 'cancelled'] as const
export const MULTIPLAYER_NOTIFICATION_TYPES = [
  'invite', 'accepted', 'declined', 'cancelled', 'turn', 'approve-word', 'word-approved', 'word-rejected', 'reminder', 'chat', 'finished',
  'draw-offer', 'draw-declined',
] as const
export const MULTIPLAYER_FINISHED_REASONS = [
  'out-of-tiles', 'scoreless', 'resigned', 'checkmate', 'stalemate', 'threefold', 'fifty-move', 'insufficient', 'draw-agreed', 'bore-off',
] as const
/** Rules-engine codes carried in `error.detail` of MULTIPLAYER_INVALID_MOVE and in a failed preview. */
export const MULTIPLAYER_MOVE_ERRORS = [
  'EMPTY', 'OUT_OF_BOUNDS', 'INVALID_LETTER', 'OCCUPIED', 'DUPLICATE_SQUARE', 'NOT_IN_LINE', 'GAP',
  'MUST_COVER_CENTER', 'FIRST_MOVE_TOO_SHORT', 'NOT_CONNECTED', 'TILES_NOT_IN_RACK', 'BAG_TOO_SMALL',
  'ILLEGAL_MOVE', 'PROMOTION_REQUIRED', 'INVALID_PROMOTION', 'INCOMPLETE_TURN',
] as const
export const MULTIPLAYER_ERROR_CODES = [
  'AUTH_REQUIRED', 'MULTIPLAYER_INVALID', 'MULTIPLAYER_FORBIDDEN', 'MULTIPLAYER_NOT_FOUND', 'MULTIPLAYER_STATE',
  'MULTIPLAYER_NOT_YOUR_TURN', 'MULTIPLAYER_CONFLICT', 'MULTIPLAYER_INVALID_MOVE', 'MULTIPLAYER_LIMIT', 'MULTIPLAYER_TOO_SOON',
  'MULTIPLAYER_HUBERT_LIMIT', 'MULTIPLAYER_OPERATION_CONFLICT', 'MULTIPLAYER_INVALID_DATA', 'MULTIPLAYER_UNAVAILABLE',
] as const
/** Treats and meat bones each player may give Hubert in one game (mirrors electron/multiplayer.cjs). */
export const MULTIPLAYER_HUBERT_LIMIT = { treat: 10, bone: 2 } as const
/** The fixed emoji a player can send the opponent in a game, in tray order (mirrors electron/multiplayer.cjs). */
export const MULTIPLAYER_REACTION_EMOJIS = ['👏', '🔥', '😂', '😮', '🎉', '😅', '🤔', '🐶'] as const
/** Minimum time between two reactions of one player (mirrors the service). */
export const MULTIPLAYER_REACTION_COOLDOWN_MS = 3000

export type MultiplayerLanguage = typeof MULTIPLAYER_LANGUAGES[number]
export type MultiplayerGameType = typeof MULTIPLAYER_GAME_TYPES[number]
export type MultiplayerGameStatus = typeof MULTIPLAYER_GAME_STATUSES[number]
export type MultiplayerNotificationType = typeof MULTIPLAYER_NOTIFICATION_TYPES[number]
export type MultiplayerFinishedReason = typeof MULTIPLAYER_FINISHED_REASONS[number]
export type MultiplayerMoveError = typeof MULTIPLAYER_MOVE_ERRORS[number]
export type MultiplayerErrorCode = typeof MULTIPLAYER_ERROR_CODES[number]
/** Index of a player inside a game: 0 is the challenger. */
export type MultiplayerSeat = 0 | 1
export type HubertFood = keyof typeof MULTIPLAYER_HUBERT_LIMIT
export type MultiplayerReactionEmoji = typeof MULTIPLAYER_REACTION_EMOJIS[number]

export interface MultiplayerActor {
  email: string
  fullName: string
  teamCode: string
}

export interface MultiplayerPerson {
  email: string
  fullName: string
  teamCode: string
}

export interface MultiplayerTeam {
  folderName: string
  name: string
}

export interface MultiplayerPlayer {
  email: string
  name: string
  teamCode: string
}

/** Fields every index entry has, whatever the game. */
interface MultiplayerEntryBase {
  id: string
  /** Index 0 is the challenger. */
  players: [MultiplayerPlayer, MultiplayerPlayer]
  status: MultiplayerGameStatus
  /** Email of the player who must act next (the approver while a word awaits approval), otherwise null. */
  turn: string | null
  gameRevision: number
  createdAt: string
  updatedAt: string
  /** Word-Puzzle points; for chess 0-0 until the end, then 1-0, 0-1 or 0.5-0.5. */
  scores: [number, number]
  winner: string | 'draw' | null
  finishedReason: MultiplayerFinishedReason | null
  /** ISO time of the last reminder sent by each player (by seat). */
  reminders: [string | null, string | null]
  /** Set when Hubert was fed, so the opponent's client notices; feeding never changes gameRevision. */
  hubertAt?: string
  /** Set when a reaction was sent, so the opponent's client notices; reactions never change gameRevision. */
  reactAt?: string
}

/** Small record kept in the watched shared index; the full game lives in a separate file. */
export interface MultiplayerWordPuzzleEntry extends MultiplayerEntryBase {
  type: 'word-puzzle'
  language: MultiplayerLanguage
}

export type MultiplayerChessColor = 'white' | 'black'

export interface MultiplayerChessEntry extends MultiplayerEntryBase {
  type: 'chess'
  language: null
  /** The colour the challenger asked for. */
  challengerColor: MultiplayerChessColor | 'random'
  /** Seat that plays white; null while a random invitation is still unanswered. */
  whiteIndex: MultiplayerSeat | null
}

export type MultiplayerGameEntry = MultiplayerWordPuzzleEntry | MultiplayerChessEntry | MultiplayerBackgammonEntry

/** Backgammon in the index: scores are the checkers each seat has borne off. */
export interface MultiplayerBackgammonEntry extends MultiplayerEntryBase {
  type: 'backgammon'
  language: null
  challengerColor: MultiplayerChessColor | 'random'
  whiteIndex: MultiplayerSeat | null
  /** 1 single, 2 gammon, 3 backgammon - once the game is over. */
  winPoints?: 1 | 2 | 3
}

/** No free text: the renderer localises from type and player names. */
export interface MultiplayerNotification {
  id: string
  gameId: string
  /** Absent on notifications written before chess existed, which means word-puzzle. */
  gameType?: MultiplayerGameType
  recipientEmail: string
  actorEmail: string
  type: MultiplayerNotificationType
  createdAt: string
  readAt: string | null
}

export interface MultiplayerStats {
  email: string
  fullName: string
  teamCode: string
  wins: number
  losses: number
  draws: number
  played: number
}

/** My record against one colleague in one kind of game, seen from my side. */
export interface MultiplayerRival extends MultiplayerStats {
  type: string
  lastPlayedAt: string | null
}

export interface MultiplayerSnapshot {
  actor: MultiplayerActor
  games: MultiplayerGameEntry[]
  notifications: MultiplayerNotification[]
  people: MultiplayerPerson[]
  teams: MultiplayerTeam[]
  /** Word-Puzzle only, kept for older callers; the same as statsByType['word-puzzle']. */
  stats: MultiplayerStats[]
  myStats: MultiplayerStats
  statsByType: Record<MultiplayerGameType, MultiplayerStats[]>
  myStatsByType: Record<MultiplayerGameType, MultiplayerStats>
  rivals: MultiplayerRival[]
  /** The ten best Word-Puzzle moves across all games (main word, whole move score). */
  topWords: MultiplayerTopWord[]
}

export interface MultiplayerTopWord {
  word: string
  score: number
  language: MultiplayerLanguage
  fullName: string
  teamCode: string
  at: string
  mine: boolean
}

export interface MultiplayerBoardTile {
  letter: string
  blank: boolean
}

export type MultiplayerBoard = Array<Array<MultiplayerBoardTile | null>>

export interface MultiplayerPlacement {
  row: number
  col: number
  /** Upper-case letter; for a blank tile the letter it stands for. */
  letter: string
  blank?: boolean
}

export interface MultiplayerWord {
  word: string
  score: number
  /** null when no word list is available or the check failed. */
  known: boolean | null
}

export interface MultiplayerPending {
  by: MultiplayerSeat
  placements: MultiplayerPlacement[]
  words: MultiplayerWord[]
  total: number
  bingo: boolean
  at: string
}

export interface MultiplayerMove {
  by: MultiplayerSeat
  kind: 'play' | 'pass' | 'exchange' | 'resign'
  words?: Array<{ word: string; score: number }>
  score: number
  at: string
  count?: number
}

export interface MultiplayerChatMessage {
  id: string
  by: MultiplayerSeat
  text: string
  at: string
}

/** What each player has given Hubert in this game, by seat, and the latest feeding. */
export interface MultiplayerHubert {
  treats: [number, number]
  bones: [number, number]
  last: { id: string; by: MultiplayerSeat; kind: HubertFood; at: string } | null
}

/** An emoji one player sent the other; only the last 20 of a game are kept. */
export interface MultiplayerReaction {
  id: string
  by: MultiplayerSeat
  emoji: MultiplayerReactionEmoji
  at: string
}

/** Projection for one player: only their own rack, never the bag or the opponent rack. */
export interface MultiplayerGame {
  id: string
  type: 'word-puzzle'
  /** Single counter bumped by every game command, chat included; moves must send the latest value as expectedRevision. */
  revision: number
  language: MultiplayerLanguage
  status: MultiplayerGameStatus
  players: [MultiplayerPlayer, MultiplayerPlayer]
  me: MultiplayerSeat
  /** Email of the player who must act next (the approver while a word awaits approval), otherwise null. */
  turn: string | null
  board: MultiplayerBoard
  rack: string[]
  opponentRackCount: number
  bagCount: number
  scores: [number, number]
  pending: MultiplayerPending | null
  moves: MultiplayerMove[]
  chat: MultiplayerChatMessage[]
  hubert: MultiplayerHubert
  reactions: MultiplayerReaction[]
  winner: string | 'draw' | null
  finishedReason: MultiplayerFinishedReason | null
  createdAt: string
  updatedAt: string
}

export type MultiplayerChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type MultiplayerChessPromotion = 'q' | 'r' | 'b' | 'n'
export type MultiplayerChessEnd = 'checkmate' | 'stalemate' | 'threefold' | 'fifty-move' | 'insufficient'

export type MultiplayerChessOutcome =
  | { over: false; result: null; reason: null }
  | { over: true; result: MultiplayerChessColor | 'draw'; reason: MultiplayerChessEnd }

/** A played move; `flags` are chess.js flags (n normal, b double push, e en passant, c capture, p promotion, k/q castling). */
export interface MultiplayerChessMove {
  by: MultiplayerChessColor
  san: string
  from: string
  to: string
  piece: MultiplayerChessPieceType
  captured?: MultiplayerChessPieceType
  promotion?: MultiplayerChessPromotion
  flags: string
  fenAfter: string
  at: string
}

export interface MultiplayerChessLegalMove {
  from: string
  to: string
  /** One entry per promotion piece for a promoting move. */
  promotion?: MultiplayerChessPromotion
  san: string
  flags: string
}

export interface MultiplayerChessProjection {
  fen: string
  /** Side to move: 'w' or 'b'. */
  turn: 'w' | 'b'
  myColor: MultiplayerChessColor
  inCheck: boolean
  /** Square of the king in check, also set on checkmate. */
  checkSquare: string | null
  /** Every legal move for the side to move, but only when it is my turn and the game is not over. */
  legalMoves: MultiplayerChessLegalMove[]
  moves: MultiplayerChessMove[]
  /** Pieces each colour has captured, in order of capture. */
  captured: Record<MultiplayerChessColor, MultiplayerChessPieceType[]>
  lastMove: { from: string; to: string } | null
  outcome: MultiplayerChessOutcome
}

/** Projection of a chess game for one player; `me` is 0 for the challenger. */
export interface MultiplayerChessGame {
  id: string
  type: 'chess'
  revision: number
  status: MultiplayerGameStatus
  players: [MultiplayerPlayer, MultiplayerPlayer]
  me: MultiplayerSeat
  turn: string | null
  /** Seat that plays white. */
  whiteIndex: MultiplayerSeat
  chess: MultiplayerChessProjection
  /** Open draw offer, by seat; only while the game is active. */
  drawOffer: { by: MultiplayerSeat; at: string } | null
  chat: MultiplayerChatMessage[]
  hubert: MultiplayerHubert
  reactions: MultiplayerReaction[]
  winner: string | 'draw' | null
  finishedReason: MultiplayerFinishedReason | null
  createdAt: string
  updatedAt: string
}

export type MultiplayerAnyGame = MultiplayerGame | MultiplayerChessGame | MultiplayerBackgammonGame

/** A backgammon checker move: from the bar or a point (1..24, numbered from white's side), to a point or off. */
export interface BackgammonStep {
  from: number | 'bar'
  to: number | 'off'
  die: number
  hit?: boolean
}

export interface MultiplayerBackgammonProjection {
  /** points[i] is point i + 1: positive = white checkers, negative = black. */
  points: number[]
  bar: Record<MultiplayerChessColor, number>
  off: Record<MultiplayerChessColor, number>
  /** Colour to move; null once the game is over. */
  turn: MultiplayerChessColor | null
  /** The two dice of the colour to move (empty when over). */
  dice: number[]
  myColor: MultiplayerChessColor
  opening: Record<MultiplayerChessColor, number> | null
  pips: Record<MultiplayerChessColor, number>
  /** How many dice I must play this turn (0 when it is not my turn, or when nothing can be played). */
  required: number
  lastTurn: { by: MultiplayerChessColor; dice: number[]; steps: BackgammonStep[] } | null
  turnCount: number
  outcome: { over: boolean; winner: MultiplayerChessColor | null; points: number; reason: 'bore-off' | null }
}

export interface MultiplayerBackgammonGame {
  id: string
  type: 'backgammon'
  revision: number
  status: MultiplayerGameStatus
  players: [MultiplayerPlayer, MultiplayerPlayer]
  me: MultiplayerSeat
  turn: string | null
  whiteIndex: MultiplayerSeat
  bg: MultiplayerBackgammonProjection
  chat: MultiplayerChatMessage[]
  hubert: MultiplayerHubert
  reactions: MultiplayerReaction[]
  winner: string | null
  finishedReason: MultiplayerFinishedReason | null
  winPoints: number | null
  createdAt: string
  updatedAt: string
}

export type MultiplayerCommand = { operationId: string } & (
  | { type: 'challenge'; opponentEmail: string; language: MultiplayerLanguage; gameType?: 'word-puzzle' }
  /** `color` is the challenger's colour; random when left out. */
  | { type: 'challenge'; opponentEmail: string; gameType: 'chess' | 'backgammon'; color?: MultiplayerChessColor | 'random' }
  | { type: 'respond'; gameId: string; accept: boolean }
  | { type: 'cancel'; gameId: string }
  | { type: 'move'; gameId: string; expectedRevision: number; placements: MultiplayerPlacement[] }
  | { type: 'approve-word'; gameId: string; expectedRevision: number; accept: boolean }
  | { type: 'pass'; gameId: string; expectedRevision: number }
  | { type: 'exchange'; gameId: string; expectedRevision: number; letters: string[] }
  | { type: 'chess-move'; gameId: string; expectedRevision: number; from: string; to: string; promotion?: MultiplayerChessPromotion }
  | { type: 'offer-draw'; gameId: string; expectedRevision: number }
  | { type: 'respond-draw'; gameId: string; expectedRevision: number; accept: boolean }
  /** A whole backgammon turn; empty when nothing can be played. */
  | { type: 'bg-move'; gameId: string; expectedRevision: number; steps: BackgammonStep[] }
  | { type: 'resign'; gameId: string; expectedRevision: number }
  | { type: 'remind'; gameId: string }
  | { type: 'chat'; gameId: string; text: string }
  /** Never bumps the revision, so it needs no expectedRevision. */
  | { type: 'hubert'; gameId: string; kind: HubertFood }
  /** An emoji for the opponent; never bumps the revision either. */
  | { type: 'react'; gameId: string; emoji: MultiplayerReactionEmoji }
  | { type: 'acknowledge'; notificationIds: string[] }
)

export interface MultiplayerCommandResult {
  /** null for commands without a game (acknowledge). */
  entry: MultiplayerGameEntry | null
  game?: MultiplayerAnyGame
}

export interface MultiplayerPreviewInput {
  gameId: string
  placements: MultiplayerPlacement[]
}

export type MultiplayerPreview =
  | { ok: false; error: MultiplayerMoveError }
  | { ok: true; words: MultiplayerWord[]; total: number; bingo: boolean }

export interface MultiplayerApi {
  snapshot(): Promise<MultiplayerSnapshot>
  game(gameId: string): Promise<MultiplayerAnyGame>
  /** Cheap change marker for an open game (the game file's mtime and size); null when it has no game file yet. */
  gameStamp?(gameId: string): Promise<string | null>
  preview(input: MultiplayerPreviewInput): Promise<MultiplayerPreview>
  command(command: MultiplayerCommand): Promise<MultiplayerCommandResult>
  /** Asks the service to load the language's word list now; a hint only, failures can be ignored. */
  warmWords(language: MultiplayerLanguage): Promise<void>
  onChanged(callback: () => void): () => void
}

declare global {
  interface Window {
    electronMultiplayer?: MultiplayerApi
  }
}
