// chess.js (BSD-2-Clause) is the authoritative rules engine; this module keeps only serialisable state around it.
const { Chess } = require('chess.js')

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const PROMOTIONS = ['q', 'r', 'b', 'n']
const COLORS = ['white', 'black']
const SQUARE = /^[a-h][1-8]$/

function ruleError(reason, message) {
  const error = new Error(`${reason}: ${message}`)
  error.reason = reason
  throw error
}

const colorOf = side => (side === 'w' ? 'white' : 'black')

/** whiteIndex is the seat (0 or 1) that plays white; startFen exists so positions can be set up for tests. */
function createChessState({ whiteIndex = 0, startFen = START_FEN } = {}) {
  if (whiteIndex !== 0 && whiteIndex !== 1) ruleError('invalid-state', 'whiteIndex must be 0 or 1')
  const chess = new Chess(startFen)
  return { whiteIndex, startFen, fen: chess.fen(), moves: [] }
}

function isState(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.startFen === 'string' &&
    typeof value.fen === 'string' && Array.isArray(value.moves) && (value.whiteIndex === 0 || value.whiteIndex === 1) &&
    value.moves.every(move => move !== null && typeof move === 'object' && typeof move.from === 'string' && typeof move.to === 'string')
}

/** Replays the full move list so repetition counting survives saves. */
function load(state) {
  if (!isState(state)) ruleError('invalid-state', 'Invalid chess state')
  const chess = new Chess(state.startFen)
  for (const move of state.moves) chess.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) })
  return chess
}

function outcomeOf(chess) {
  if (chess.isCheckmate()) return { over: true, result: chess.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' }
  if (chess.isStalemate()) return { over: true, result: 'draw', reason: 'stalemate' }
  if (chess.isInsufficientMaterial()) return { over: true, result: 'draw', reason: 'insufficient' }
  if (chess.isThreefoldRepetition()) return { over: true, result: 'draw', reason: 'threefold' }
  if (chess.isDrawByFiftyMoves()) return { over: true, result: 'draw', reason: 'fifty-move' }
  return { over: false, result: null, reason: null }
}

function outcome(state) {
  return outcomeOf(load(state))
}

function turnColor(state) {
  return colorOf(load(state).turn())
}

function movesOf(chess) {
  if (outcomeOf(chess).over) return []
  return chess.moves({ verbose: true }).map(move => ({
    from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}), san: move.san, flags: move.flags,
  }))
}

const legalMoves = state => movesOf(load(state))

function applyMove(state, seatColor, { from, to, promotion } = {}, at = null) {
  if (!COLORS.includes(seatColor)) ruleError('invalid-state', 'Invalid colour')
  const chess = load(state)
  if (outcomeOf(chess).over) ruleError('game-over', 'The game is over')
  if (colorOf(chess.turn()) !== seatColor) ruleError('not-your-turn', 'It is not your turn')
  if (typeof from !== 'string' || typeof to !== 'string' || !SQUARE.test(from) || !SQUARE.test(to)) ruleError('illegal-move', 'Invalid square')
  const candidates = chess.moves({ verbose: true }).filter(move => move.from === from && move.to === to)
  if (!candidates.length) ruleError('illegal-move', `${from}${to} is not legal`)
  if (candidates[0].promotion) {
    if (promotion === undefined || promotion === null) ruleError('promotion-required', 'A promotion piece is required')
    if (!PROMOTIONS.includes(promotion)) ruleError('invalid-promotion', 'Promote to q, r, b or n')
  } else if (promotion !== undefined && promotion !== null) {
    ruleError('invalid-promotion', 'This move does not promote')
  }
  const played = chess.move({ from, to, ...(candidates[0].promotion ? { promotion } : {}) })
  const record = {
    by: seatColor, san: played.san, from: played.from, to: played.to, piece: played.piece,
    ...(played.captured ? { captured: played.captured } : {}), ...(played.promotion ? { promotion: played.promotion } : {}),
    flags: played.flags, fenAfter: chess.fen(), at,
  }
  return { state: { ...state, fen: chess.fen(), moves: [...state.moves, record] }, move: record, outcome: outcomeOf(chess) }
}

function kingSquare(chess, side) {
  for (const row of chess.board()) {
    for (const cell of row) if (cell && cell.type === 'k' && cell.color === side) return cell.square
  }
  return null
}

/** What one player sees: the position, their colour and, on their turn, every legal move. */
function projection(state, myColor) {
  if (!COLORS.includes(myColor)) ruleError('invalid-state', 'Invalid colour')
  const chess = load(state)
  const result = outcomeOf(chess)
  const side = chess.turn()
  const captured = { white: [], black: [] }
  for (const move of state.moves) if (move.captured) captured[move.by].push(move.captured)
  const last = state.moves[state.moves.length - 1]
  const mine = !result.over && colorOf(side) === myColor
  return {
    fen: chess.fen(), turn: side, myColor, inCheck: chess.isCheck(), checkSquare: chess.isCheck() ? kingSquare(chess, side) : null,
    legalMoves: mine ? movesOf(chess) : [], moves: state.moves.map(move => ({ ...move })), captured,
    lastMove: last ? { from: last.from, to: last.to } : null, outcome: result,
  }
}

module.exports = { START_FEN, PROMOTIONS, createChessState, isState, applyMove, legalMoves, projection, outcome, turnColor }
