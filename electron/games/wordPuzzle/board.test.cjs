const test = require('node:test')
const assert = require('node:assert/strict')
const { SIZE, CENTER, premiumAt, PREMIUM_COUNTS } = require('./board.cjs')

const squaresOf = kind => {
  const found = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (premiumAt(r, c) === kind) found.push([r, c])
  return found
}

test('board constants', () => {
  assert.equal(SIZE, 15)
  assert.equal(CENTER, 7)
})

test('premium counts are 8/17/12/24', () => {
  assert.deepEqual({ ...PREMIUM_COUNTS }, { TW: 8, DW: 17, TL: 12, DL: 24 })
  for (const kind of ['TW', 'DW', 'TL', 'DL']) assert.equal(squaresOf(kind).length, PREMIUM_COUNTS[kind])
})

test('layout is symmetric under mirroring and transpose', () => {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = premiumAt(r, c)
      assert.equal(premiumAt(SIZE - 1 - r, c), p, `row mirror ${r},${c}`)
      assert.equal(premiumAt(r, SIZE - 1 - c), p, `col mirror ${r},${c}`)
      assert.equal(premiumAt(c, r), p, `transpose ${r},${c}`)
    }
  }
})

test('centre is a double word', () => {
  assert.equal(premiumAt(CENTER, CENTER), 'DW')
})

test('known squares', () => {
  assert.equal(premiumAt(0, 0), 'TW')
  assert.equal(premiumAt(1, 5), 'TL')
  assert.equal(premiumAt(0, 3), 'DL')
  assert.equal(premiumAt(0, 1), null)
})

test('out of range returns null', () => {
  assert.equal(premiumAt(-1, 0), null)
  assert.equal(premiumAt(0, 15), null)
  assert.equal(premiumAt(15, 15), null)
  assert.equal(premiumAt(1.5, 2), null)
})
