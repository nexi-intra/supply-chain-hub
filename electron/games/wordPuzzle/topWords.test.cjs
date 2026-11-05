const test = require('node:test')
const assert = require('node:assert/strict')
const { TOP_WORDS_LIMIT, topWordsFromMoves, mergeTopWords, readTopWords } = require('./topWords.cjs')

const players = [{ email: 'anna@example.test' }, { email: 'bo@example.test' }]
const game = (moves, language = 'da') => ({ id: 'g1', language, moves })
const play = (by, word, score, at, extra = []) => ({ by, kind: 'play', words: [{ word, score }, ...extra], score, at })

test('every scored play becomes an entry with the main word, the whole move score and the player', () => {
  const moves = [
    play(0, 'HUND', 14, '2026-10-01T10:00:00.000Z', [{ word: 'US', score: 3 }]),
    { by: 1, kind: 'pass', score: 0, at: '2026-10-01T10:01:00.000Z' },
    { by: 1, kind: 'exchange', score: 0, count: 2, at: '2026-10-01T10:02:00.000Z' },
    play(1, 'ZEBRA', 74, '2026-10-01T10:03:00.000Z'),
  ]
  assert.deepEqual(topWordsFromMoves(game(moves), players), [
    { id: 'g1:0', word: 'HUND', score: 14, language: 'da', email: 'anna@example.test', at: '2026-10-01T10:00:00.000Z' },
    { id: 'g1:3', word: 'ZEBRA', score: 74, language: 'da', email: 'bo@example.test', at: '2026-10-01T10:03:00.000Z' },
  ])
})

test('only moves from the given position are taken, so one write never adds an older move twice', () => {
  const moves = [play(0, 'HUND', 14, '2026-10-01T10:00:00.000Z'), play(1, 'KAT', 9, '2026-10-01T10:01:00.000Z')]
  assert.deepEqual(topWordsFromMoves(game(moves), players, 1).map(entry => entry.id), ['g1:1'])
})

test('chess games and moves without words or points are ignored', () => {
  assert.deepEqual(topWordsFromMoves({ id: 'c1', type: 'chess', moves: [play(0, 'X', 5, 'a')] }, players), [])
  assert.deepEqual(topWordsFromMoves(game([{ by: 0, kind: 'play', words: [], score: 0, at: 'a' }]), players), [])
})

test('merging keeps the best ten, highest score first, earliest first on a tie, without duplicates', () => {
  const entry = (id, score, at) => ({ id, word: id.toUpperCase(), score, language: 'da', email: 'anna@example.test', at })
  const current = Array.from({ length: TOP_WORDS_LIMIT }, (_, index) => entry(`w${index}`, 10 + index, `2026-10-01T10:${String(index).padStart(2, '0')}:00.000Z`))
  const merged = mergeTopWords(current, [entry('new', 15, '2026-10-02T10:00:00.000Z'), entry('w9', 19, '2026-10-01T10:09:00.000Z'), entry('low', 1, '2026-10-02T10:00:00.000Z')])
  assert.equal(merged.length, TOP_WORDS_LIMIT)
  assert.deepEqual(merged.map(item => item.id), ['w9', 'w8', 'w7', 'w6', 'w5', 'new', 'w4', 'w3', 'w2', 'w1'])
  assert.equal(merged.filter(item => item.id === 'w9').length, 1)
})

test('stored data is read defensively: anything malformed is dropped instead of breaking the lobby', () => {
  const good = { id: 'g1:0', word: 'HUND', score: 14, language: 'da', email: 'anna@example.test', at: '2026-10-01T10:00:00.000Z' }
  assert.deepEqual(readTopWords(undefined), [])
  assert.deepEqual(readTopWords('nope'), [])
  assert.deepEqual(readTopWords([good, null, { ...good, id: 'x', score: '14' }, { ...good, id: 'y', word: '' }, { ...good, id: 'z', email: 7 }]), [good])
})
