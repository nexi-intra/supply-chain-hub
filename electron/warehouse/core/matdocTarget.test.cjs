const test = require('node:test')
const assert = require('node:assert/strict')
const { matdocTarget } = require('./matdocTarget.cjs')

const entry = (material, sloc, stockType, inScope) => ({ material, sloc, stockType, inScope })
const count = (id, fetchedAt, rows) => ({ id, name: `Count ${id}`, fetchedAt, serials: new Map(rows) })

const terminals = count('c1', 1, [
  ['S1', entry('M1', 'D001', 'unrestricted', true)],
  ['S2', entry('M1', 'D001', 'unrestricted', true)],
  ['S3', entry('M1', 'D002', 'unrestricted', false)],
  ['S4', entry('M1', 'D001', 'blocked', false)],
  ['A1', entry('ACC', 'D001', 'unrestricted', false)],
  ['X1', entry('EXCL', 'D001', 'unrestricted', false)],
])
const accessories = count('c2', 2, [
  ['S1', entry('M1', 'D001', 'unrestricted', false)],
  ['A1', entry('ACC', 'D001', 'unrestricted', true)],
  ['X1', entry('EXCL', 'D001', 'unrestricted', false)],
])

test('one pallet in one count is ok', () => {
  const result = matdocTarget({ serials: ['S1', 'S2', 'NOPE'], counts: [terminals, accessories] })
  assert.equal(result.outcome, 'ok')
  assert.equal(result.countId, 'c1')
  assert.equal(result.countName, 'Count c1')
  assert.equal(result.sloc, 'D001')
  assert.equal(result.stockType, 'unrestricted')
  assert.equal(result.unknown, 1)
  assert.deepEqual(result.groups, [{ sloc: 'D001', stockType: 'unrestricted', count: 2 }])
  assert.deepEqual(result.byCount, [{ countId: 'c1', countName: 'Count c1', count: 2 }])
  assert.deepEqual(result.rows, [
    { serial: 'S1', material: 'M1', sloc: 'D001', stockType: 'unrestricted', countId: 'c1', countName: 'Count c1' },
    { serial: 'S2', material: 'M1', sloc: 'D001', stockType: 'unrestricted', countId: 'c1', countName: 'Count c1' },
    { serial: 'NOPE', material: null, sloc: null, stockType: null, countId: null, countName: null },
  ])
})

test('duplicate serials are counted once', () => {
  const result = matdocTarget({ serials: ['S1', ' s1 ', 'NOPE', 'NOPE'], counts: [terminals] })
  assert.equal(result.outcome, 'ok')
  assert.equal(result.unknown, 1)
  assert.deepEqual(result.groups, [{ sloc: 'D001', stockType: 'unrestricted', count: 1 }])
  assert.deepEqual(result.rows.map(row => row.serial), ['S1', 'NOPE'])
})

test('two storage locations are mixed', () => {
  const result = matdocTarget({ serials: ['S3', 'S1', 'S2'], counts: [terminals] })
  assert.equal(result.outcome, 'mixed')
  assert.equal(result.countId, null)
  assert.equal(result.sloc, null)
  assert.equal(result.stockType, null)
  assert.deepEqual(result.groups, [
    { sloc: 'D001', stockType: 'unrestricted', count: 2 },
    { sloc: 'D002', stockType: 'unrestricted', count: 1 },
  ])
})

test('blocked and unblocked on one storage location are mixed', () => {
  const result = matdocTarget({ serials: ['S4', 'S1'], counts: [terminals] })
  assert.equal(result.outcome, 'mixed')
  assert.deepEqual(result.groups, [
    { sloc: 'D001', stockType: 'unrestricted', count: 1 },
    { sloc: 'D001', stockType: 'blocked', count: 1 },
  ])
})

test('a serial in two counts is "several"', () => {
  const both = count('c3', 3, [['S1', entry('M1', 'D001', 'unrestricted', true)]])
  const result = matdocTarget({ serials: ['S1'], counts: [terminals, both] })
  assert.equal(result.outcome, 'several')
  assert.equal(result.countId, null)
  assert.equal(result.sloc, 'D001')
  assert.equal(result.stockType, 'unrestricted')
  assert.deepEqual(result.byCount, [
    { countId: 'c1', countName: 'Count c1', count: 1 },
    { countId: 'c3', countName: 'Count c3', count: 1 },
  ])
  assert.equal(result.rows[0].countId, 'c1')
})

test('terminals and accessories in two counts are "several"', () => {
  const result = matdocTarget({ serials: ['A1', 'S1', 'S2'], counts: [terminals, accessories] })
  assert.equal(result.outcome, 'several')
  assert.deepEqual(result.byCount, [
    { countId: 'c1', countName: 'Count c1', count: 2 },
    { countId: 'c2', countName: 'Count c2', count: 1 },
  ])
  assert.equal(result.rows[0].countId, 'c2')
})

test('some serials outside every count is "outside"', () => {
  const result = matdocTarget({ serials: ['S1', 'X1'], counts: [terminals, accessories] })
  assert.equal(result.outcome, 'outside')
  assert.equal(result.countId, null)
  assert.equal(result.sloc, 'D001')
  assert.deepEqual(result.rows[1], { serial: 'X1', material: 'EXCL', sloc: 'D001', stockType: 'unrestricted', countId: null, countName: null })
})

test('no count counts the pallet is "none"', () => {
  const result = matdocTarget({ serials: ['X1'], counts: [terminals, accessories] })
  assert.equal(result.outcome, 'none')
  assert.equal(result.countId, null)
  assert.equal(result.sloc, 'D001')
  assert.equal(result.stockType, 'unrestricted')
  assert.deepEqual(result.groups, [{ sloc: 'D001', stockType: 'unrestricted', count: 1 }])
  assert.deepEqual(result.byCount, [])
})

test('nothing known is "unknown"', () => {
  const result = matdocTarget({ serials: ['NOPE', 'ALSO'], counts: [terminals, accessories] })
  assert.equal(result.outcome, 'unknown')
  assert.equal(result.countId, null)
  assert.equal(result.countName, null)
  assert.equal(result.sloc, null)
  assert.equal(result.stockType, null)
  assert.equal(result.unknown, 2)
  assert.deepEqual(result.groups, [])
})

test('location of an unclaimed serial comes from the newest SAP figures', () => {
  const older = count('c1', 1, [['S9', entry('M1', 'D001', 'unrestricted', false)]])
  const newer = count('c2', 2, [['S9', entry('M1', 'D002', 'blocked', false)]])
  const result = matdocTarget({ serials: ['S9'], counts: [newer, older] })
  assert.equal(result.outcome, 'none')
  assert.equal(result.rows[0].sloc, 'D002')
  assert.equal(result.rows[0].stockType, 'blocked')
  const reversed = matdocTarget({ serials: ['S9'], counts: [older, newer] })
  assert.equal(reversed.rows[0].sloc, 'D002')
})

test('location of a claimed serial comes from the count it belongs to', () => {
  const owner = count('c1', 1, [['S9', entry('M1', 'D001', 'unrestricted', true)]])
  const newer = count('c2', 2, [['S9', entry('M1', 'D002', 'blocked', false)]])
  const result = matdocTarget({ serials: ['S9'], counts: [owner, newer] })
  assert.equal(result.outcome, 'ok')
  assert.equal(result.countId, 'c1')
  assert.equal(result.sloc, 'D001')
  assert.equal(result.stockType, 'unrestricted')
})
