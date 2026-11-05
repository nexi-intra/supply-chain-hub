const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('./rules.cjs')

const {
  emptyBoard, validatePlacement, extractWords, scoreMove, applyPlacements,
  removeFromRack, drawTiles, exchangeTiles, rackValue, isGameOver, finalScores,
} = rules

// Horizontal ('h') or vertical ('v') run of tiles starting at (row, col).
const tiles = (row, col, word, dir = 'h') =>
  [...word].map((letter, i) => ({ row: dir === 'h' ? row : row + i, col: dir === 'h' ? col + i : col, letter, blank: false }))
const boardWith = (...runs) => runs.reduce((board, run) => applyPlacements(board, run), emptyBoard())
const wordsOf = result => result.map(w => w.word)

test('emptyBoard is 15x15 of nulls', () => {
  const board = emptyBoard()
  assert.equal(board.length, 15)
  for (const row of board) {
    assert.equal(row.length, 15)
    assert.ok(row.every(cell => cell === null))
  }
  assert.notEqual(emptyBoard()[0], board[0])
})

// ---- validatePlacement ----
test('validate: EMPTY', () => {
  assert.deepEqual(validatePlacement(emptyBoard(), [], 'en'), { ok: false, error: 'EMPTY' })
})

test('validate: OUT_OF_BOUNDS', () => {
  for (const p of [{ row: 15, col: 0 }, { row: 0, col: -1 }, { row: 1.5, col: 2 }]) {
    assert.equal(validatePlacement(emptyBoard(), [{ ...p, letter: 'A', blank: false }], 'en').error, 'OUT_OF_BOUNDS')
  }
})

test('validate: OCCUPIED', () => {
  const board = boardWith(tiles(7, 7, 'CAT'))
  assert.equal(validatePlacement(board, tiles(7, 8, 'X'), 'en').error, 'OCCUPIED')
})

test('validate: DUPLICATE_SQUARE', () => {
  assert.equal(validatePlacement(emptyBoard(), [...tiles(7, 7, 'A'), ...tiles(7, 7, 'B')], 'en').error, 'DUPLICATE_SQUARE')
})

test('validate: INVALID_LETTER', () => {
  assert.equal(validatePlacement(emptyBoard(), tiles(7, 6, 'ÆA'), 'en').error, 'INVALID_LETTER')
  assert.equal(validatePlacement(emptyBoard(), tiles(7, 6, 'aB'), 'en').error, 'INVALID_LETTER')
  const blank = letter => [{ row: 7, col: 7, letter, blank: true }, { row: 7, col: 8, letter: 'A', blank: false }]
  assert.equal(validatePlacement(emptyBoard(), blank('?'), 'en').error, 'INVALID_LETTER')
  assert.equal(validatePlacement(emptyBoard(), blank(undefined), 'en').error, 'INVALID_LETTER')
  assert.equal(validatePlacement(emptyBoard(), blank('Æ'), 'en').error, 'INVALID_LETTER')
  assert.deepEqual(validatePlacement(emptyBoard(), blank('C'), 'en'), { ok: true })
})

test('validate: NOT_IN_LINE', () => {
  const placements = [...tiles(7, 7, 'A'), ...tiles(8, 8, 'B')]
  assert.equal(validatePlacement(emptyBoard(), placements, 'en').error, 'NOT_IN_LINE')
})

test('validate: GAP must be filled by existing tiles', () => {
  const board = boardWith(tiles(7, 8, 'A'))
  assert.equal(validatePlacement(board, [...tiles(7, 7, 'C'), ...tiles(7, 10, 'T')], 'en').error, 'GAP')
  const filled = boardWith(tiles(7, 8, 'A'), tiles(7, 9, 'X'))
  assert.deepEqual(validatePlacement(filled, [...tiles(7, 7, 'C'), ...tiles(7, 10, 'T')], 'en'), { ok: true })
})

test('validate: MUST_COVER_CENTER', () => {
  assert.equal(validatePlacement(emptyBoard(), tiles(0, 0, 'CAT'), 'en').error, 'MUST_COVER_CENTER')
  assert.equal(validatePlacement(emptyBoard(), tiles(0, 0, 'C'), 'en').error, 'MUST_COVER_CENTER')
})

test('validate: FIRST_MOVE_TOO_SHORT', () => {
  assert.equal(validatePlacement(emptyBoard(), tiles(7, 7, 'A'), 'en').error, 'FIRST_MOVE_TOO_SHORT')
})

test('validate: NOT_CONNECTED', () => {
  const board = boardWith(tiles(7, 7, 'CAT'))
  assert.equal(validatePlacement(board, tiles(0, 0, 'DOG'), 'en').error, 'NOT_CONNECTED')
  assert.equal(validatePlacement(board, tiles(9, 7, 'DOG'), 'en').error, 'NOT_CONNECTED')
})

test('validate: first move across centre, both directions', () => {
  assert.deepEqual(validatePlacement(emptyBoard(), tiles(7, 6, 'CAT'), 'en'), { ok: true })
  assert.deepEqual(validatePlacement(emptyBoard(), tiles(5, 7, 'CAT', 'v'), 'en'), { ok: true })
})

test('validate: later moves touching existing tiles', () => {
  const board = boardWith(tiles(7, 7, 'CAT'))
  assert.deepEqual(validatePlacement(board, tiles(7, 10, 'S'), 'en'), { ok: true })
  assert.deepEqual(validatePlacement(board, tiles(8, 8, 'AT'), 'en'), { ok: true })
  assert.deepEqual(validatePlacement(board, tiles(8, 7, 'OD', 'v'), 'en'), { ok: true })
})

test('validate: Danish letters are valid in da but not en', () => {
  assert.deepEqual(validatePlacement(emptyBoard(), tiles(7, 6, 'ÆØÅ'), 'da'), { ok: true })
  assert.equal(validatePlacement(emptyBoard(), tiles(7, 6, 'ÆØÅ'), 'en').error, 'INVALID_LETTER')
})

test('validate does not mutate inputs', () => {
  const board = boardWith(tiles(7, 7, 'CAT'))
  const placements = tiles(7, 10, 'S')
  const snapshot = JSON.stringify([board, placements])
  validatePlacement(board, placements, 'en')
  assert.equal(JSON.stringify([board, placements]), snapshot)
})

// ---- extractWords ----
test('extract: first move forms one word', () => {
  const words = extractWords(emptyBoard(), tiles(7, 6, 'CAT'))
  assert.deepEqual(wordsOf(words), ['CAT'])
  assert.deepEqual(words[0].cells.map(c => [c.row, c.col, c.letter, c.blank, c.isNew]), [
    [7, 6, 'C', false, true], [7, 7, 'A', false, true], [7, 8, 'T', false, true],
  ])
})

test('extract: vertical first move', () => {
  assert.deepEqual(wordsOf(extractWords(emptyBoard(), tiles(5, 7, 'CAT', 'v'))), ['CAT'])
})

test('extract: extending an existing word', () => {
  const board = boardWith(tiles(7, 7, 'CAT'))
  const words = extractWords(board, tiles(7, 10, 'S'))
  assert.deepEqual(wordsOf(words), ['CATS'])
  assert.deepEqual(words[0].cells.map(c => c.isNew), [false, false, false, true])
})

test('extract: prefix extension', () => {
  const board = boardWith(tiles(7, 7, 'AT'))
  assert.deepEqual(wordsOf(extractWords(board, tiles(7, 6, 'C'))), ['CAT'])
})

test('extract: gap filled by existing tiles joins into one main word', () => {
  const board = boardWith(tiles(7, 8, 'AB'))
  const words = extractWords(board, [...tiles(7, 7, 'C'), ...tiles(7, 10, 'T')])
  assert.deepEqual(wordsOf(words), ['CABT'])
})

test('extract: parallel placement creates cross words', () => {
  const board = boardWith(tiles(7, 7, 'CAT'))
  const words = extractWords(board, tiles(8, 8, 'AT'))
  assert.deepEqual(wordsOf(words), ['AT', 'AA', 'TT'])
  assert.deepEqual(words[1].cells.map(c => [c.row, c.col, c.isNew]), [[7, 8, false], [8, 8, true]])
})

test('extract: single tile forming two words, horizontal is main', () => {
  const board = boardWith(tiles(7, 7, 'CA'), [{ row: 6, col: 9, letter: 'A', blank: false }, { row: 8, col: 9, letter: 'E', blank: false }])
  const words = extractWords(board, tiles(7, 9, 'T'))
  assert.deepEqual(wordsOf(words), ['CAT', 'ATE'])
})

test('extract: single tile forming only a vertical word', () => {
  const board = boardWith(tiles(6, 9, 'A'))
  assert.deepEqual(wordsOf(extractWords(board, tiles(7, 9, 'T'))), ['AT'])
})

test('extract: blank flag is carried on cells', () => {
  const words = extractWords(emptyBoard(), [
    { row: 7, col: 7, letter: 'C', blank: true }, { row: 7, col: 8, letter: 'A', blank: false },
  ])
  assert.deepEqual(words[0].cells.map(c => c.blank), [true, false])
})

// ---- scoreMove ----
test('score: first move doubles through the centre', () => {
  const result = scoreMove(emptyBoard(), tiles(7, 6, 'CAT'), 'en')
  assert.deepEqual(result, { words: [{ word: 'CAT', score: 10 }], bingo: false, total: 10 })
})

test('score: premiums apply to new tiles only', () => {
  const board = boardWith(tiles(7, 6, 'CAT'))
  const result = scoreMove(board, tiles(7, 9, 'S'), 'en')
  assert.deepEqual(result.words, [{ word: 'CATS', score: 6 }])
  assert.equal(result.total, 6)
})

test('score: double letter and double word together', () => {
  // Q on DL (7,3) = 20, +1+1+1+1 = 24, doubled by the centre = 48
  assert.equal(scoreMove(emptyBoard(), tiles(7, 3, 'QUITE'), 'en').total, 48)
})

test('score: triple letter', () => {
  const board = boardWith(tiles(5, 6, 'A'))
  // Z on TL (5,5) = 30, A = 1
  assert.deepEqual(scoreMove(board, tiles(5, 5, 'Z'), 'en').words, [{ word: 'ZA', score: 31 }])
})

test('score: TW and DW stack to x6', () => {
  const board = boardWith(tiles(1, 7, 'AAAAAA', 'v'))
  const placements = [...tiles(0, 7, 'S'), ...tiles(7, 7, 'S')]
  // letters 1+6+1 = 8; existing DL at (3,7) is ignored; x3 x2
  assert.deepEqual(scoreMove(board, placements, 'en').words, [{ word: 'SAAAAAAS', score: 48 }])
})

test('score: two DW stack to x4', () => {
  const board = boardWith(tiles(5, 4, 'AAAAA', 'v'))
  const placements = [...tiles(4, 4, 'S'), ...tiles(10, 4, 'S')]
  assert.deepEqual(scoreMove(board, placements, 'en').words, [{ word: 'SAAAAAS', score: 28 }])
})

test('score: blank scores zero on a double letter', () => {
  const placements = [{ row: 7, col: 3, letter: 'Q', blank: true }, ...tiles(7, 4, 'UITE')]
  // 0+1+1+1+1 = 4, x2 for the centre
  assert.equal(scoreMove(emptyBoard(), placements, 'en').total, 8)
})

test('score: blank on a double word still doubles', () => {
  const placements = [...tiles(7, 6, 'C'), { row: 7, col: 7, letter: 'A', blank: true }, ...tiles(7, 8, 'T')]
  // 3+0+1 = 4, x2
  assert.equal(scoreMove(emptyBoard(), placements, 'en').total, 8)
})

test('score: existing blank tiles stay worth zero', () => {
  const board = applyPlacements(emptyBoard(), [{ row: 7, col: 7, letter: 'A', blank: true }])
  assert.deepEqual(scoreMove(board, tiles(7, 8, 'T'), 'en').words, [{ word: 'AT', score: 1 }])
})

test('score: cross words count and the premium applies to each word', () => {
  const board = boardWith(tiles(7, 7, 'CAT'))
  const result = scoreMove(board, tiles(8, 8, 'AT'), 'en')
  // AT = 2(DL)+1, AA = 1+2(DL), TT = 1+1
  assert.deepEqual(result.words, [{ word: 'AT', score: 3 }, { word: 'AA', score: 3 }, { word: 'TT', score: 2 }])
  assert.equal(result.total, 8)
})

test('score: bingo with exactly seven tiles adds 50', () => {
  const result = scoreMove(emptyBoard(), tiles(7, 4, 'JOURNAL'), 'en')
  assert.deepEqual(result, { words: [{ word: 'JOURNAL', score: 28 }], bingo: true, total: 78 })
  const six = scoreMove(emptyBoard(), tiles(7, 4, 'JOURNA'), 'en')
  assert.equal(six.bingo, false)
})

test('score: Danish letters', () => {
  const result = scoreMove(emptyBoard(), tiles(7, 6, 'ÆØÅ'), 'da')
  assert.deepEqual(result.words, [{ word: 'ÆØÅ', score: 24 }])
})

test('score: Swedish and Finnish letters use their own values', () => {
  assert.equal(scoreMove(emptyBoard(), tiles(7, 6, 'ÄÖ'), 'sv').total, (3 + 4) * 2)
  assert.equal(scoreMove(emptyBoard(), tiles(7, 6, 'ÄÖ'), 'fi').total, (2 + 7) * 2)
})

// ---- applyPlacements / removeFromRack ----
test('applyPlacements returns a new board and keeps blank flags', () => {
  const board = emptyBoard()
  const next = applyPlacements(board, [{ row: 7, col: 7, letter: 'A', blank: true }])
  assert.equal(board[7][7], null)
  assert.deepEqual(next[7][7], { letter: 'A', blank: true })
  assert.notEqual(next[0], board[0])
})

test('removeFromRack removes letters and blanks', () => {
  const rack = ['C', 'A', 'T', '?', 'S']
  const placements = [...tiles(7, 7, 'CA'), { row: 7, col: 9, letter: 'X', blank: true }]
  assert.deepEqual(removeFromRack(rack, placements), { ok: true, rack: ['T', 'S'] })
  assert.deepEqual(rack, ['C', 'A', 'T', '?', 'S'])
})

test('removeFromRack rejects missing tiles', () => {
  assert.deepEqual(removeFromRack(['A'], tiles(7, 7, 'AA')), { ok: false, error: 'TILES_NOT_IN_RACK' })
  assert.deepEqual(removeFromRack(['A'], [{ row: 7, col: 7, letter: 'A', blank: true }]), { ok: false, error: 'TILES_NOT_IN_RACK' })
  assert.deepEqual(removeFromRack(['?'], tiles(7, 7, '?')), { ok: false, error: 'TILES_NOT_IN_RACK' })
})

// ---- drawTiles / exchangeTiles ----
test('drawTiles is deterministic with an injected randomInt', () => {
  const bag = ['A', 'B', 'C', 'D']
  const calls = []
  const result = drawTiles(bag, 2, max => { calls.push(max); return max - 1 })
  assert.deepEqual(result, { drawn: ['D', 'C'], bag: ['A', 'B'] })
  assert.deepEqual(calls, [4, 3])
  assert.deepEqual(bag, ['A', 'B', 'C', 'D'])
})

test('drawTiles draws at most what is in the bag', () => {
  assert.deepEqual(drawTiles(['A', 'B'], 5, () => 0), { drawn: ['A', 'B'], bag: [] })
  assert.deepEqual(drawTiles([], 3, () => 0), { drawn: [], bag: [] })
})

test('exchangeTiles draws first, then returns tiles to the bag', () => {
  const rack = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  const bag = ['H', 'I', 'J', 'K', 'L', 'M', 'N']
  const result = exchangeTiles(rack, bag, ['A', 'B'], () => 0)
  assert.equal(result.ok, true)
  assert.deepEqual(result.rack, ['C', 'D', 'E', 'F', 'G', 'H', 'I'])
  assert.deepEqual(result.bag, ['J', 'K', 'L', 'M', 'N', 'A', 'B'])
  assert.deepEqual(rack, ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  assert.equal(bag.length, 7)
})

test('exchangeTiles needs at least 7 tiles in the bag', () => {
  const result = exchangeTiles(['A', 'B'], ['C', 'D', 'E', 'F', 'G', 'H'], ['A'], () => 0)
  assert.equal(result.ok, false)
  assert.equal(result.error, 'BAG_TOO_SMALL')
})

test('exchangeTiles letters must be in the rack', () => {
  const bag = ['C', 'D', 'E', 'F', 'G', 'H', 'I']
  assert.equal(exchangeTiles(['A', 'B'], bag, ['Z'], () => 0).error, 'TILES_NOT_IN_RACK')
  assert.equal(exchangeTiles(['A', 'B'], bag, ['A', 'A'], () => 0).error, 'TILES_NOT_IN_RACK')
  assert.equal(exchangeTiles(['A', 'B'], bag, [], () => 0).error, 'EMPTY')
  assert.equal(exchangeTiles(['A', '?'], bag, ['?'], () => 0).ok, true)
})

// ---- rackValue / game over / final scores ----
test('rackValue sums points and blanks are zero', () => {
  assert.equal(rackValue(['Q', 'A', '?'], 'en'), 11)
  assert.equal(rackValue([], 'en'), 0)
  assert.equal(rackValue(['Æ', 'Ø'], 'da'), 8)
})

test('isGameOver', () => {
  assert.equal(isGameOver({ bagSize: 0, racks: { a: [], b: ['A'] }, consecutiveScoreless: 0 }), true)
  assert.equal(isGameOver({ bagSize: 0, racks: { a: ['A'], b: ['B'] }, consecutiveScoreless: 0 }), false)
  assert.equal(isGameOver({ bagSize: 3, racks: { a: [], b: ['B'] }, consecutiveScoreless: 0 }), false)
  assert.equal(isGameOver({ bagSize: 10, racks: { a: ['A'], b: ['B'] }, consecutiveScoreless: 5 }), false)
  assert.equal(isGameOver({ bagSize: 10, racks: { a: ['A'], b: ['B'] }, consecutiveScoreless: 6 }), true)
  assert.equal(isGameOver({ bagSize: 0, racks: [[], ['A']], consecutiveScoreless: 0 }), true)
})

test('finalScores: out-player gains the opponent rack value', () => {
  const scores = { p1: 100, p2: 90 }
  const racks = { p1: [], p2: ['Q', 'A'] }
  assert.deepEqual(finalScores(scores, racks, 'en'), { scores: { p1: 111, p2: 79 }, winner: 'p1' })
  assert.deepEqual(scores, { p1: 100, p2: 90 })
})

test('finalScores: nobody out means both lose their rack value', () => {
  const result = finalScores({ p1: 100, p2: 100 }, { p1: ['Q'], p2: ['A'] }, 'en')
  assert.deepEqual(result, { scores: { p1: 90, p2: 99 }, winner: 'p2' })
})

test('finalScores: the bonus can change the winner', () => {
  const result = finalScores({ p1: 90, p2: 95 }, { p1: [], p2: ['Q'] }, 'en')
  assert.deepEqual(result, { scores: { p1: 100, p2: 85 }, winner: 'p1' })
})

test('finalScores: draw', () => {
  const result = finalScores({ a: 90, b: 100 }, { a: [], b: ['A', 'A', 'A', 'A', 'A'] }, 'en')
  assert.deepEqual(result, { scores: { a: 95, b: 95 }, winner: 'draw' })
})

test('finalScores: both racks empty gives no bonus', () => {
  const result = finalScores({ a: 10, b: 20 }, { a: [], b: [] }, 'en')
  assert.deepEqual(result, { scores: { a: 10, b: 20 }, winner: 'b' })
})
