import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import type { MultiplayerChessMove } from './multiplayer'
import {
  START_FEN, advantage, applyMove, cellToSquare, figurineSan, glideDuration, isDarkSquare, moveFocus, needsPromotion, parseFen,
  piecesFromFen, reconcile, samePlacement, scoreSheet, squareToCell, targetsFrom, trayOrder,
} from './chessView'

/** Plays SAN moves with chess.js and returns them the way the service records them. */
function play(sans: string[], fen = START_FEN): MultiplayerChessMove[] {
  const chess = new Chess(fen)
  return sans.map(san => {
    const move = chess.move(san)
    return {
      by: move.color === 'w' ? 'white' : 'black', san: move.san, from: move.from, to: move.to, piece: move.piece,
      ...(move.captured ? { captured: move.captured } : {}), ...(move.promotion ? { promotion: move.promotion as 'q' } : {}),
      flags: move.flags, fenAfter: chess.fen(), at: '2026-10-07T10:00:00.000Z',
    }
  })
}

describe('board geometry', () => {
  it('reads the start position', () => {
    const pieces = parseFen(START_FEN)
    expect(pieces.size).toBe(32)
    expect(pieces.get('e1')).toEqual({ color: 'w', type: 'k' })
    expect(pieces.get('d8')).toEqual({ color: 'b', type: 'q' })
    expect(pieces.get('e4')).toBeUndefined()
  })

  it('puts the player\'s colour at the bottom and round-trips squares', () => {
    expect(squareToCell('a1', 'white')).toEqual({ x: 0, y: 7 })
    expect(squareToCell('a1', 'black')).toEqual({ x: 7, y: 0 })
    expect(squareToCell('h8', 'black')).toEqual({ x: 0, y: 7 })
    for (const bottom of ['white', 'black'] as const) {
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) expect(squareToCell(cellToSquare(x, y, bottom), bottom)).toEqual({ x, y })
    }
  })

  it('knows the colour of a square', () => {
    expect(isDarkSquare('a1')).toBe(true)
    expect(isDarkSquare('h1')).toBe(false)
    expect(isDarkSquare('e4')).toBe(false)
    expect(isDarkSquare('d4')).toBe(true)
  })

  it('moves the keyboard focus inside the board', () => {
    expect(moveFocus({ x: 0, y: 0 }, 'ArrowUp')).toEqual({ x: 0, y: 0 })
    expect(moveFocus({ x: 3, y: 3 }, 'ArrowRight')).toEqual({ x: 4, y: 3 })
    expect(moveFocus({ x: 3, y: 3 }, 'End')).toEqual({ x: 7, y: 3 })
  })
})

describe('legal targets', () => {
  const legal = [
    { from: 'e5', to: 'd6', san: 'exd6', flags: 'e' },
    { from: 'e5', to: 'e6', san: 'e6', flags: 'n' },
    { from: 'b7', to: 'a8', promotion: 'q' as const, san: 'bxa8=Q', flags: 'cp' },
    { from: 'b7', to: 'a8', promotion: 'n' as const, san: 'bxa8=N', flags: 'cp' },
  ]

  it('marks captures, en passant included, and collapses promotion choices into one target', () => {
    expect([...targetsFrom(legal, 'e5')]).toEqual([['d6', { capture: true, promotion: false }], ['e6', { capture: false, promotion: false }]])
    expect([...targetsFrom(legal, 'b7')]).toEqual([['a8', { capture: true, promotion: true }]])
    expect(needsPromotion(legal, 'b7', 'a8')).toBe(true)
    expect(needsPromotion(legal, 'e5', 'e6')).toBe(false)
  })
})

describe('applyMove', () => {
  it('castles king first, then the rook', () => {
    const moves = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O'])
    const before = piecesFromFen(moves[5].fenAfter)
    const result = applyMove(before, moves[6])!
    expect(result.plan.travels.map(travel => [travel.from, travel.to, travel.delay])).toEqual([['e1', 'g1', 0], ['h1', 'f1', 1]])
    expect(samePlacement(result.pieces, moves[6].fenAfter)).toBe(true)
    expect(result.plan.captured).toBeNull()
  })

  it('takes the passed pawn off its own square on en passant', () => {
    const moves = play(['e4', 'a6', 'e5', 'd5', 'exd6'])
    const result = applyMove(piecesFromFen(moves[3].fenAfter), moves[4])!
    expect(result.plan.captured).toMatchObject({ square: 'd5', type: 'p', color: 'b', by: 'w' })
    expect(samePlacement(result.pieces, moves[4].fenAfter)).toBe(true)
  })

  it('promotes on a capture and keeps the pawn\'s identity', () => {
    const fen = 'r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1'
    const [move] = play(['bxa8=Q'], fen)
    const before = piecesFromFen(fen)
    const pawn = before.find(piece => piece.square === 'b7')!
    const result = applyMove(before, move)!
    expect(result.plan.promotion).toEqual({ id: pawn.id, from: 'p', to: 'q' })
    expect(result.plan.captured).toMatchObject({ type: 'r', square: 'a8' })
    expect(result.pieces.find(piece => piece.id === pawn.id)).toMatchObject({ square: 'a8', type: 'q' })
  })

  it('hops knights and refuses a move from an empty square', () => {
    const [move] = play(['Nf3'])
    expect(applyMove(piecesFromFen(START_FEN), move)!.plan.travels[0].hop).toBe(true)
    expect(applyMove(piecesFromFen(START_FEN), { from: 'e4', to: 'e5', flags: 'n' })).toBeNull()
  })
})

describe('reconcile', () => {
  const moves = play(['e4', 'd5', 'exd5', 'Qxd5'])

  it('shows the first position without animation', () => {
    const { state, plan } = reconcile(null, { fen: START_FEN, moves: [] })
    expect(state.pieces).toHaveLength(32)
    expect(plan).toBeNull()
  })

  it('animates a single new move and keeps every identity', () => {
    const shown = reconcile(null, { fen: moves[1].fenAfter, moves: moves.slice(0, 2) }).state
    const { state, plan } = reconcile(shown, { fen: moves[2].fenAfter, moves: moves.slice(0, 3) })
    expect(plan?.travels[0]).toMatchObject({ from: 'e4', to: 'd5' })
    expect(plan?.captured).toMatchObject({ square: 'd5', type: 'p' })
    const ids = new Set(shown.pieces.map(piece => piece.id))
    expect(state.pieces.every(piece => ids.has(piece.id))).toBe(true)
  })

  it('jumps over missed moves but still acts out the newest one', () => {
    const shown = reconcile(null, { fen: START_FEN, moves: [] }).state
    const { state, plan } = reconcile(shown, { fen: moves[3].fenAfter, moves })
    expect(samePlacement(state.pieces, moves[3].fenAfter)).toBe(true)
    expect(plan?.travels[0]).toMatchObject({ from: 'd8', to: 'd5' })
  })

  it('keeps an optimistic move of our own when the service confirms it', () => {
    const shown = reconcile(null, { fen: moves[0].fenAfter, moves: moves.slice(0, 1) }).state
    const optimistic = applyMove(shown.pieces, moves[1])!
    const local = { fen: '', moveCount: 2, pieces: optimistic.pieces }
    const { state, plan } = reconcile(local, { fen: moves[1].fenAfter, moves: moves.slice(0, 2) })
    expect(plan).toBeNull()
    expect(state.pieces).toBe(local.pieces)
    expect(state.fen).toBe(moves[1].fenAfter)
  })

  it('falls back to the service position when an optimistic move was refused', () => {
    const shown = reconcile(null, { fen: START_FEN, moves: [] }).state
    const local = { fen: '', moveCount: 1, pieces: applyMove(shown.pieces, { from: 'e2', to: 'e4', flags: 'b' })!.pieces }
    const { state, plan } = reconcile(local, { fen: START_FEN, moves: [] })
    expect(plan).toBeNull()
    expect(samePlacement(state.pieces, START_FEN)).toBe(true)
  })
})

describe('score sheet and material', () => {
  it('pairs white and black moves by number', () => {
    const rows = scoreSheet(play(['e4', 'e5', 'Nf3']))
    expect(rows.map(row => [row.number, row.white?.san ?? null, row.black?.san ?? null])).toEqual([[1, 'e4', 'e5'], [2, 'Nf3', null]])
  })

  it('writes piece letters as figurines', () => {
    expect(figurineSan('Nxf7+')).toBe('♘xf7+')
    expect(figurineSan('exd8=Q#')).toBe('exd8=♕#')
    expect(figurineSan('O-O')).toBe('O-O')
  })

  it('counts material and lines captured pieces up', () => {
    expect(advantage({ white: ['q', 'p'], black: ['r'] }, 'white')).toBe(5)
    expect(advantage({ white: ['q', 'p'], black: ['r'] }, 'black')).toBe(-5)
    expect(trayOrder(['p', 'q', 'n', 'p', 'r'])).toEqual(['q', 'r', 'n', 'p', 'p'])
  })

  it('glides longer over longer distances, within limits', () => {
    expect(glideDuration('e2', 'e4', false)).toBeLessThan(glideDuration('a1', 'h8', false))
    expect(glideDuration('a1', 'h8', false)).toBeLessThanOrEqual(560)
    expect(glideDuration('g1', 'f3', true)).toBe(430)
  })
})
