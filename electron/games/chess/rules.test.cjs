const test = require('node:test')
const assert = require('node:assert/strict')
const chess = require('./rules.cjs')

const reason = value => ({ reason: value })
const squares = text => ({ from: text.slice(0, 2), to: text.slice(2, 4), ...(text[4] ? { promotion: text[4] } : {}) })

/** Plays UCI moves in turn; the first mover is taken from the position. */
function play(state, ...ucis) {
  let current = state
  let last
  for (const uci of ucis) {
    last = chess.applyMove(current, chess.turnColor(current), squares(uci), '2026-10-07T10:00:00.000Z')
    current = last.state
  }
  return { state: current, ...last }
}

const fromFen = startFen => chess.createChessState({ whiteIndex: 0, startFen })

test('a new game starts with white to move and twenty legal moves', () => {
  const state = chess.createChessState({ whiteIndex: 1 })
  assert.equal(state.whiteIndex, 1)
  assert.equal(state.fen, chess.START_FEN)
  assert.deepEqual(state.moves, [])
  assert.equal(chess.turnColor(state), 'white')
  assert.equal(chess.legalMoves(state).length, 20)
  assert.throws(() => chess.createChessState({ whiteIndex: 2 }), reason('invalid-state'))
})

test('legal moves are applied and recorded; illegal and out-of-turn moves are rejected', () => {
  const state = chess.createChessState({ whiteIndex: 0 })
  const first = chess.applyMove(state, 'white', squares('e2e4'), 'now')
  assert.equal(first.move.san, 'e4')
  assert.deepEqual({ by: first.move.by, from: first.move.from, to: first.move.to, piece: first.move.piece, at: first.move.at }, { by: 'white', from: 'e2', to: 'e4', piece: 'p', at: 'now' })
  assert.match(first.move.fenAfter, /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b KQkq - 0 1$/)
  assert.equal(first.state.moves.length, 1)
  assert.equal(state.moves.length, 0, 'input state is not mutated')
  assert.deepEqual(first.outcome, { over: false, result: null, reason: null })
  assert.throws(() => chess.applyMove(first.state, 'white', squares('d2d4')), reason('not-your-turn'))
  assert.throws(() => chess.applyMove(state, 'black', squares('e7e5')), reason('not-your-turn'))
  assert.throws(() => chess.applyMove(state, 'white', squares('e2e5')), reason('illegal-move'))
  assert.throws(() => chess.applyMove(state, 'white', squares('e3e4')), reason('illegal-move'))
  assert.throws(() => chess.applyMove(state, 'white', { from: 'z9', to: 'e4' }), reason('illegal-move'))
  assert.throws(() => chess.applyMove(state, 'white', {}), reason('illegal-move'))
  assert.throws(() => chess.applyMove(state, 'green', squares('e2e4')), reason('invalid-state'))
})

test('captures are recorded with the captured piece', () => {
  const { move, state } = play(chess.createChessState({ whiteIndex: 0 }), 'e2e4', 'd7d5', 'e4d5')
  assert.equal(move.san, 'exd5')
  assert.equal(move.captured, 'p')
  assert.equal(chess.projection(state, 'white').captured.white[0], 'p')
})

test('castling works on both sides and never through an attacked square', () => {
  const both = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
  const short = chess.applyMove(both, 'white', squares('e1g1'))
  assert.equal(short.move.san, 'O-O')
  assert.match(short.move.flags, /k/)
  assert.match(short.move.fenAfter, /^r3k2r\/8\/8\/8\/8\/8\/8\/R4RK1 b kq/)
  const long = chess.applyMove(both, 'white', squares('e1c1'))
  assert.equal(long.move.san, 'O-O-O')
  assert.match(long.move.flags, /q/)
  assert.match(long.move.fenAfter, /^r3k2r\/8\/8\/8\/8\/8\/8\/2KR3R b kq/)
  const guarded = fromFen('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1')
  assert.throws(() => chess.applyMove(guarded, 'white', squares('e1g1')), reason('illegal-move'))
  assert.equal(chess.applyMove(guarded, 'white', squares('e1c1')).move.san, 'O-O-O')
  const inCheck = fromFen('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1')
  assert.throws(() => chess.applyMove(inCheck, 'white', squares('e1g1')), reason('illegal-move'))
})

test('en passant captures the pawn that passed', () => {
  const { move, state } = play(chess.createChessState({ whiteIndex: 0 }), 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6')
  assert.equal(move.san, 'exd6')
  assert.equal(move.captured, 'p')
  assert.match(move.flags, /e/)
  const ranks = move.fenAfter.split(' ')[0].split('/')
  assert.equal(ranks[2], 'p2P4')
  assert.equal(ranks[3], '8')
  assert.equal(chess.projection(state, 'black').captured.white.length, 1)
})

test('promotion requires a piece, allows underpromotion and rejects stray promotions', () => {
  const state = fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1')
  assert.throws(() => chess.applyMove(state, 'white', squares('a7a8')), reason('promotion-required'))
  assert.throws(() => chess.applyMove(state, 'white', { from: 'a7', to: 'a8', promotion: 'k' }), reason('invalid-promotion'))
  assert.throws(() => chess.applyMove(state, 'white', { from: 'a1', to: 'a2', promotion: 'q' }), reason('invalid-promotion'))
  const queen = chess.applyMove(state, 'white', squares('a7a8q'))
  assert.equal(queen.move.promotion, 'q')
  assert.equal(queen.move.san, 'a8=Q')
  const knight = chess.applyMove(state, 'white', squares('a7a8n'))
  assert.equal(knight.move.promotion, 'n')
  assert.match(knight.move.fenAfter, /^N7\/7k/)
  const promotions = chess.legalMoves(state).filter(move => move.from === 'a7').map(move => move.promotion).sort()
  assert.deepEqual(promotions, ['b', 'n', 'q', 'r'])
})

test('checkmate ends the game and names the winner (fool\'s mate)', () => {
  const result = play(chess.createChessState({ whiteIndex: 0 }), 'f2f3', 'e7e5', 'g2g4', 'd8h4')
  assert.deepEqual(result.outcome, { over: true, result: 'black', reason: 'checkmate' })
  assert.equal(result.move.san, 'Qh4#')
  assert.throws(() => chess.applyMove(result.state, 'white', squares('a2a3')), reason('game-over'))
  const view = chess.projection(result.state, 'white')
  assert.equal(view.inCheck, true)
  assert.equal(view.checkSquare, 'e1')
  assert.deepEqual(view.legalMoves, [])
  assert.deepEqual(view.outcome, result.outcome)
})

test('stalemate is a draw', () => {
  const result = chess.applyMove(fromFen('7k/8/6K1/5Q2/8/8/8/8 w - - 0 1'), 'white', squares('f5f7'))
  assert.deepEqual(result.outcome, { over: true, result: 'draw', reason: 'stalemate' })
})

test('insufficient material is a draw', () => {
  const result = chess.applyMove(fromFen('4k3/8/8/8/8/8/4p3/4K3 w - - 0 1'), 'white', squares('e1e2'))
  assert.deepEqual(result.outcome, { over: true, result: 'draw', reason: 'insufficient' })
  assert.equal(chess.outcome(fromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).reason, 'insufficient')
})

test('fifty-move rule draws when the halfmove clock reaches 100', () => {
  const state = fromFen('4k3/8/8/8/8/8/8/4K2R w - - 98 80')
  const quiet = chess.applyMove(state, 'white', squares('h1h2'))
  assert.equal(quiet.outcome.over, false)
  const last = chess.applyMove(quiet.state, 'black', squares('e8d8'))
  assert.deepEqual(last.outcome, { over: true, result: 'draw', reason: 'fifty-move' })
})

test('threefold repetition draws, also after the state was saved and loaded again', () => {
  const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8']
  let state = chess.createChessState({ whiteIndex: 0 })
  state = play(state, ...shuffle).state
  state = JSON.parse(JSON.stringify(state))
  const middle = play(state, 'g1f3', 'g8f6', 'f3g1')
  assert.equal(middle.outcome.over, false)
  const saved = JSON.parse(JSON.stringify(middle.state))
  const end = chess.applyMove(saved, 'black', squares('f6g8'))
  assert.deepEqual(end.outcome, { over: true, result: 'draw', reason: 'threefold' })
})

test('projection shows legal moves only to the player on turn, plus captures and the last move', () => {
  const { state } = play(chess.createChessState({ whiteIndex: 0 }), 'e2e4', 'd7d5', 'e4d5')
  const mine = chess.projection(state, 'black')
  assert.equal(mine.turn, 'b')
  assert.equal(mine.myColor, 'black')
  assert.ok(mine.legalMoves.length > 0)
  assert.ok(mine.legalMoves.every(move => typeof move.san === 'string' && typeof move.flags === 'string'))
  assert.deepEqual(chess.projection(state, 'white').legalMoves, [])
  assert.deepEqual(mine.lastMove, { from: 'e4', to: 'd5' })
  assert.deepEqual(mine.captured, { white: ['p'], black: [] })
  assert.deepEqual(mine.moves.map(move => move.san), ['e4', 'd5', 'exd5'])
  assert.equal(mine.inCheck, false)
  assert.equal(mine.checkSquare, null)
  assert.equal(chess.projection(chess.createChessState({ whiteIndex: 0 }), 'white').lastMove, null)
  const check = play(chess.createChessState({ whiteIndex: 0 }), 'e2e4', 'f7f6', 'd1h5', 'g7g6', 'h5g6')
  const checked = chess.projection(check.state, 'black')
  assert.equal(checked.inCheck, true)
  assert.equal(checked.checkSquare, 'e8')
})

test('state survives a JSON round trip and rejects malformed data', () => {
  const { state } = play(chess.createChessState({ whiteIndex: 1 }), 'e2e4', 'e7e5', 'g1f3')
  const copy = JSON.parse(JSON.stringify(state))
  assert.deepEqual(copy, state)
  assert.equal(chess.projection(copy, 'black').fen, state.fen)
  assert.equal(chess.isState(copy), true)
  assert.equal(chess.isState({ ...copy, whiteIndex: 3 }), false)
  assert.equal(chess.isState({ ...copy, moves: 'x' }), false)
  assert.throws(() => chess.projection({ fen: 'x' }, 'white'), reason('invalid-state'))
})
