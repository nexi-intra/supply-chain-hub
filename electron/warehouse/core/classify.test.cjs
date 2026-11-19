const test = require('node:test')
const assert = require('node:assert/strict')
const { materialKind, teamExpectedKinds, storageRulesFor, isMisplaced, suggestLocations, suggestRulesFromStock } = require('./classify.cjs')

test('material kinds: new and used terminals, accessories and everything else', () => {
  assert.equal(materialKind('INT4300-4921-0'), 'new')
  assert.equal(materialKind('INT4300-4921-0-R'), 'used')
  assert.equal(materialKind('int4300-4921-0-r'), 'used')
  assert.equal(materialKind('INT4700-4100-9-R'), 'used')
  assert.equal(materialKind('INT4700-4100-9'), 'new')
  assert.equal(materialKind('R092-0036'), 'accessory')
  assert.equal(materialKind('331-0194'), 'other')
  assert.equal(materialKind('S379-0840'), 'other')
  assert.equal(materialKind(''), 'other')
})

test('TCD expects all three kinds, TRR only used terminals', () => {
  assert.deepEqual(teamExpectedKinds('TCD'), ['new', 'used', 'accessory'])
  assert.deepEqual(teamExpectedKinds('TRR'), ['used'])
})

test('default storage rules come from what the teams told us; unknown locations have no rule', () => {
  const tcd = storageRulesFor('TCD', {})
  assert.deepEqual(tcd.D000, ['new', 'accessory'])
  assert.deepEqual(tcd.D004, ['used'])
  assert.deepEqual(tcd.D005, ['new', 'used'])
  assert.equal(tcd.D106, null)
  assert.equal(tcd.D001, undefined)
  assert.deepEqual(storageRulesFor('TRR', {}), { D001: ['used'], D002: ['used'], D003: ['used'] })
})

test('a manager rule overrides the default; invalid stored rules are ignored', () => {
  const rules = storageRulesFor('TCD', { D006: { kinds: ['new'] }, D004: { kinds: ['used', 'new'] }, D999: { kinds: ['new'] }, D102: { kinds: ['bogus'] } })
  assert.deepEqual(rules.D006, ['new'])
  assert.deepEqual(rules.D004, ['new', 'used'])
  assert.equal(rules.D999, undefined)
  assert.equal(rules.D102, null)
})

test('misplaced only when the location has a rule that does not allow the kind', () => {
  const rules = storageRulesFor('TCD', {})
  assert.equal(isMisplaced('used', 'D000', rules), true)
  assert.equal(isMisplaced('new', 'D000', rules), false)
  assert.equal(isMisplaced('used', 'D106', rules), false)
  assert.equal(isMisplaced('used', 'D100', rules), false)
})

test('suggested locations: dedicated locations of the own team first, then the other team', () => {
  const all = { TCD: storageRulesFor('TCD', {}), TRR: storageRulesFor('TRR', {}) }
  assert.deepEqual(suggestLocations('used', 'TCD', all), ['D004', 'D005'])
  assert.deepEqual(suggestLocations('accessory', 'TRR', all), ['D000'])
  assert.deepEqual(suggestLocations('other', 'TCD', all), [])
})

test('rule suggestions from SAP stock: kinds with a real share of the quantity in each location', () => {
  const rows = [
    { material: 'INT4300-4921-0', sloc: 'D106', unrestricted: 40, blocked: 0 },
    { material: 'INT4300-4921-0-R', sloc: 'D106', unrestricted: 60, blocked: 5 },
    { material: 'R092-0036', sloc: 'D106', unrestricted: 1, blocked: 0 },
    { material: '331-0194', sloc: 'D106', unrestricted: 500, blocked: 0 },
    { material: 'INT4300-4921-0-R', sloc: 'D000', unrestricted: 1, blocked: 0 },
    { material: 'INT4300-4921-0', sloc: 'D000', unrestricted: 1985, blocked: 0 },
  ]
  const suggestions = suggestRulesFromStock(rows, ['D106', 'D000', 'D105'])
  assert.deepEqual(suggestions.D106.quantities, { new: 40, used: 65, accessory: 1 })
  assert.deepEqual(suggestions.D106.suggested, ['new', 'used'])
  assert.deepEqual(suggestions.D000.suggested, ['new'])
  assert.deepEqual(suggestions.D105, { quantities: { new: 0, used: 0, accessory: 0 }, suggested: [] })
})
