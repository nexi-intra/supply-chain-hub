import type {
  MultiplayerChessColor, MultiplayerChessLegalMove, MultiplayerChessMove, MultiplayerChessPieceType, MultiplayerChessPromotion,
} from './multiplayer'

// Pure board geometry, move bookkeeping and animation planning for the chess board in the Hub.

export const FILES = 'abcdefgh'
export const PIECE_VALUES: Record<MultiplayerChessPieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
export const PROMOTION_ORDER: readonly MultiplayerChessPromotion[] = ['q', 'r', 'b', 'n']

export type Side = 'w' | 'b'
export interface FenPiece { color: Side; type: MultiplayerChessPieceType }
/** A piece with an identity that survives moves, so the board can animate it from square to square. */
export interface TrackedPiece extends FenPiece { id: string; square: string }

export const sideOf = (color: MultiplayerChessColor): Side => (color === 'white' ? 'w' : 'b')
export const colorOf = (side: Side): MultiplayerChessColor => (side === 'w' ? 'white' : 'black')

export function isSquare(value: string): boolean {
  return /^[a-h][1-8]$/.test(value)
}

/** Pieces of a FEN's placement field by square. */
export function parseFen(fen: string): Map<string, FenPiece> {
  const pieces = new Map<string, FenPiece>()
  const rows = (fen.split(' ')[0] ?? '').split('/')
  rows.forEach((row, index) => {
    const rank = 8 - index
    let file = 0
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char)
        continue
      }
      const lower = char.toLowerCase()
      if ('pnbrqk'.includes(lower) && file < 8 && rank >= 1) {
        pieces.set(`${FILES[file]}${rank}`, { color: char === lower ? 'b' : 'w', type: lower as MultiplayerChessPieceType })
      }
      file += 1
    }
  })
  return pieces
}

/** Pieces with fresh identities, in a stable order (a8 to h1). */
export function piecesFromFen(fen: string): TrackedPiece[] {
  return [...parseFen(fen)].map(([square, piece]) => ({ ...piece, square, id: `${piece.color}${piece.type}@${square}` }))
}

/** Column and row on screen (0..7 from the top left) with `bottom` nearest the player. */
export function squareToCell(square: string, bottom: MultiplayerChessColor): { x: number; y: number } {
  const file = FILES.indexOf(square[0])
  const rank = Number(square[1]) - 1
  return bottom === 'white' ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank }
}

export function cellToSquare(x: number, y: number, bottom: MultiplayerChessColor): string {
  return bottom === 'white' ? `${FILES[x]}${8 - y}` : `${FILES[7 - x]}${y + 1}`
}

export const isDarkSquare = (square: string) => (FILES.indexOf(square[0]) + Number(square[1])) % 2 === 1

/** Moves from a square, one per target (promotion choices collapse into one target). */
export function targetsFrom(legal: readonly MultiplayerChessLegalMove[], from: string): Map<string, { capture: boolean; promotion: boolean }> {
  const targets = new Map<string, { capture: boolean; promotion: boolean }>()
  for (const move of legal) {
    if (move.from !== from) continue
    targets.set(move.to, { capture: move.flags.includes('c') || move.flags.includes('e'), promotion: Boolean(move.promotion) })
  }
  return targets
}

export function movableSquares(legal: readonly MultiplayerChessLegalMove[]): Set<string> {
  return new Set(legal.map(move => move.from))
}

export function findLegal(legal: readonly MultiplayerChessLegalMove[], from: string, to: string, promotion?: MultiplayerChessPromotion): MultiplayerChessLegalMove | null {
  return legal.find(move => move.from === from && move.to === to && (move.promotion ?? undefined) === promotion) ?? null
}

export function needsPromotion(legal: readonly MultiplayerChessLegalMove[], from: string, to: string): boolean {
  return legal.some(move => move.from === from && move.to === to && Boolean(move.promotion))
}

/** A move the player has made on their own board but not yet confirmed (sent). */
export interface PendingMove { from: string; to: string; promotion?: MultiplayerChessPromotion; fen: string }

/** The staged move still applies: the position (FEN) is unchanged and it is still a legal move in the current list. */
export function pendingStillValid(pending: PendingMove | null, fen: string, legal: readonly MultiplayerChessLegalMove[]): boolean {
  if (!pending || pending.fen !== fen) return false
  return findLegal(legal, pending.from, pending.to, pending.promotion) !== null
}

// ---------------------------------------------------------------- moves and animation

export interface MoveLike { from: string; to: string; flags: string; promotion?: MultiplayerChessPromotion }

export interface MovePlan {
  /** Pieces that travel, in the order they move (castling: king, then rook). */
  travels: Array<{ id: string; from: string; to: string; hop: boolean; delay: number }>
  /** A piece taken off the board; `square` is where it stood (differs from the target on en passant). */
  captured: (TrackedPiece & { by: Side }) | null
  /** A pawn that turns into another piece when it lands. */
  promotion: { id: string; from: MultiplayerChessPieceType; to: MultiplayerChessPromotion } | null
}

const castlingRook = (move: MoveLike): { from: string; to: string } | null => {
  const rank = move.from[1]
  if (move.flags.includes('k')) return { from: `h${rank}`, to: `f${rank}` }
  if (move.flags.includes('q')) return { from: `a${rank}`, to: `d${rank}` }
  return null
}

/** Applies a legal move to tracked pieces and says how to act it out; null when the move does not fit the pieces. */
export function applyMove(pieces: readonly TrackedPiece[], move: MoveLike): { pieces: TrackedPiece[]; plan: MovePlan } | null {
  const mover = pieces.find(piece => piece.square === move.from)
  if (!mover || !isSquare(move.to)) return null
  const capturedSquare = move.flags.includes('e') ? `${move.to[0]}${move.from[1]}` : move.to
  const victim = pieces.find(piece => piece.square === capturedSquare && piece.id !== mover.id && piece.color !== mover.color) ?? null
  const rook = castlingRook(move)
  const rookPiece = rook ? pieces.find(piece => piece.square === rook.from) ?? null : null
  const next: TrackedPiece[] = []
  for (const piece of pieces) {
    if (victim && piece.id === victim.id) continue
    if (piece.id === mover.id) next.push({ ...piece, square: move.to, type: move.promotion ?? piece.type })
    else if (rookPiece && rook && piece.id === rookPiece.id) next.push({ ...piece, square: rook.to })
    else next.push(piece)
  }
  const travels: MovePlan['travels'] = [{ id: mover.id, from: move.from, to: move.to, hop: mover.type === 'n', delay: 0 }]
  if (rookPiece && rook) travels.push({ id: rookPiece.id, from: rook.from, to: rook.to, hop: false, delay: 1 })
  return {
    pieces: next,
    plan: {
      travels,
      captured: victim ? { ...victim, by: mover.color } : null,
      promotion: move.promotion ? { id: mover.id, from: mover.type, to: move.promotion } : null,
    },
  }
}

/** Squares between two cells, for the length of a glide. */
export function distance(from: string, to: string): number {
  const dx = Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0]))
  const dy = Math.abs(Number(from[1]) - Number(to[1]))
  return Math.hypot(dx, dy)
}

/** Glide length in milliseconds: short hops are quick, long diagonals take a little longer. */
export function glideDuration(from: string, to: string, hop: boolean): number {
  if (hop) return 430
  return Math.round(Math.min(560, 230 + 55 * distance(from, to)))
}

export interface BoardState { fen: string; moveCount: number; pieces: TrackedPiece[] }

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * How to get from what the board shows to a new position: animate the last move when the board is exactly one
 * move behind, otherwise jump (and still act out the newest move from the position before it when it is known).
 * A board that already shows the position (an optimistic move of our own) keeps its pieces.
 */
export function reconcile(
  shown: BoardState | null,
  next: { fen: string; moves: readonly MultiplayerChessMove[] },
): { state: BoardState; plan: MovePlan | null } {
  const count = next.moves.length
  if (shown && shown.moveCount === count && samePlacement(shown.pieces, next.fen)) {
    return { state: shown.fen === next.fen ? shown : { ...shown, fen: next.fen }, plan: null }
  }
  const last = next.moves[count - 1]
  const before = count >= 2 ? next.moves[count - 2].fenAfter : START_FEN
  if (shown && last && shown.moveCount === count - 1 && samePlacement(shown.pieces, before)) {
    const applied = applyMove(shown.pieces, last)
    if (applied && samePlacement(applied.pieces, next.fen)) return { state: { fen: next.fen, moveCount: count, pieces: applied.pieces }, plan: applied.plan }
  }
  if (last && (!shown || shown.moveCount < count)) {
    const applied = applyMove(piecesFromFen(before), last)
    if (applied && samePlacement(applied.pieces, next.fen)) {
      return { state: { fen: next.fen, moveCount: count, pieces: applied.pieces }, plan: shown ? applied.plan : null }
    }
  }
  return { state: { fen: next.fen, moveCount: count, pieces: piecesFromFen(next.fen) }, plan: null }
}

export function samePlacement(pieces: readonly TrackedPiece[], fen: string): boolean {
  const expected = parseFen(fen)
  if (expected.size !== pieces.length) return false
  return pieces.every(piece => {
    const target = expected.get(piece.square)
    return target !== undefined && target.color === piece.color && target.type === piece.type
  })
}

// ---------------------------------------------------------------- score sheet and material

export interface SheetRow { number: number; white: MultiplayerChessMove | null; black: MultiplayerChessMove | null }

export function scoreSheet(moves: readonly MultiplayerChessMove[]): SheetRow[] {
  const rows: SheetRow[] = []
  for (const move of moves) {
    if (move.by === 'white' || rows.length === 0) rows.push({ number: rows.length + 1, white: move.by === 'white' ? move : null, black: move.by === 'black' ? move : null })
    else if (rows[rows.length - 1].black) rows.push({ number: rows.length + 1, white: null, black: move })
    else rows[rows.length - 1].black = move
  }
  return rows
}

const FIGURINES: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }

/** SAN with figurines instead of English piece letters, readable in every language. */
export function figurineSan(san: string): string {
  return san.replace(/[KQRBN]/g, letter => FIGURINES[letter])
}

export function material(pieces: readonly MultiplayerChessPieceType[]): number {
  return pieces.reduce((sum, type) => sum + PIECE_VALUES[type], 0)
}

/** Material advantage seen from `color`: what it has captured minus what it has lost. */
export function advantage(captured: Record<MultiplayerChessColor, readonly MultiplayerChessPieceType[]>, color: MultiplayerChessColor): number {
  return material(captured[color]) - material(captured[color === 'white' ? 'black' : 'white'])
}

/** Captured pieces sorted the way they are lined up in a tray: queen first, pawns last. */
export function trayOrder(pieces: readonly MultiplayerChessPieceType[]): MultiplayerChessPieceType[] {
  const order: MultiplayerChessPieceType[] = ['q', 'r', 'b', 'n', 'p', 'k']
  return [...pieces].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

// ---------------------------------------------------------------- keyboard

export function moveFocus(cell: { x: number; y: number }, key: string): { x: number; y: number } {
  const clamp = (value: number) => Math.min(7, Math.max(0, value))
  switch (key) {
    case 'ArrowUp': return { x: cell.x, y: clamp(cell.y - 1) }
    case 'ArrowDown': return { x: cell.x, y: clamp(cell.y + 1) }
    case 'ArrowLeft': return { x: clamp(cell.x - 1), y: cell.y }
    case 'ArrowRight': return { x: clamp(cell.x + 1), y: cell.y }
    case 'Home': return { x: 0, y: cell.y }
    case 'End': return { x: 7, y: cell.y }
    default: return cell
  }
}
