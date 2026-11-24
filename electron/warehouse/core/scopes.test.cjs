const test = require('node:test')
const assert = require('node:assert/strict')
const { scopeStockTypes, scopeKinds, scopeCovers, scopeOverlap, describeOverlap } = require('./scopes.cjs')

const BOTH = ['unrestricted', 'blocked']
const TEAM_SLOCS = ['D000', 'D004', 'D005', 'D006']
const slocs = (list, stockTypes = BOTH) => ({ type: 'slocs', slocs: list, materials: [], stockTypes })
const materials = (list, stockTypes = BOTH) => ({ type: 'materials', slocs: TEAM_SLOCS, materials: list, stockTypes })
const TERMINALS = ['new', 'used']
const ACCESSORIES = ['accessory']

test('a scope counts terminals or accessories; old scopes count every group', () => {
  assert.deepEqual(scopeKinds(slocs(['D000'])), ['new', 'used', 'accessory'])
  const accessories = { ...slocs(['D000'], ['unrestricted']), kinds: ACCESSORIES }
  assert.equal(scopeCovers(accessories, 'R162-0717', 'D000', 'unrestricted'), true)
  assert.equal(scopeCovers(accessories, 'INT4300-4921-0', 'D000', 'unrestricted'), false)
  const terminals = { ...slocs(['D000'], ['unrestricted']), kinds: TERMINALS }
  assert.equal(scopeOverlap(terminals, accessories), null, 'terminals and accessories of D000 can be counted side by side')
  assert.deepEqual(scopeOverlap(terminals, slocs(['D000'])), { slocs: ['D000'], stockTypes: ['unrestricted'], materials: null, kinds: TERMINALS })
  assert.equal(describeOverlap(scopeOverlap(accessories, { ...slocs(['D000']), kinds: ACCESSORIES }), { name: 'D000 tilbehør', owner: { name: 'Bo' } }), 'D000 (tilbehør, unblocked) tælles allerede i "D000 tilbehør" af Bo')
})

test('old scopes without stock types count both', () => {
  assert.deepEqual(scopeStockTypes({ type: 'slocs', slocs: ['D000'], materials: [] }), BOTH)
  assert.deepEqual(scopeStockTypes(slocs(['D000'], ['blocked'])), ['blocked'])
})

test('a scope covers a material, location and stock type', () => {
  assert.equal(scopeCovers(slocs(['D000'], ['blocked']), 'R1', 'D000', 'blocked'), true)
  assert.equal(scopeCovers(slocs(['D000'], ['blocked']), 'R1', 'D000', 'unrestricted'), false)
  assert.equal(scopeCovers(slocs(['D000']), 'R1', 'D004', 'blocked'), false)
  assert.equal(scopeCovers(materials(['R1']), 'R1', 'D004', 'unrestricted'), true)
  assert.equal(scopeCovers(materials(['R1']), 'R2', 'D004', 'unrestricted'), false)
})

test('the same location with another stock type is no overlap', () => {
  assert.equal(scopeOverlap(slocs(['D000'], ['unrestricted']), slocs(['D000'], ['blocked'])), null)
  assert.equal(scopeOverlap(slocs(['D000']), slocs(['D004'])), null)
  assert.equal(scopeOverlap(materials(['R1']), materials(['R2'])), null)
})

test('overlap names the shared locations, stock types and materials', () => {
  const all = ['new', 'used', 'accessory']
  assert.deepEqual(scopeOverlap(slocs(['D000', 'D004']), slocs(['D004'], ['blocked'])), { slocs: ['D004'], stockTypes: ['blocked'], materials: null, kinds: all })
  assert.deepEqual(scopeOverlap(slocs(['D000']), materials(['R1'], ['unrestricted'])), { slocs: ['D000'], stockTypes: ['unrestricted'], materials: ['R1'], kinds: all })
  assert.deepEqual(scopeOverlap(materials(['R1'], ['blocked']), slocs(['D006'])), { slocs: ['D006'], stockTypes: ['blocked'], materials: ['R1'], kinds: all })
  assert.deepEqual(scopeOverlap(materials(['R1', 'R2']), materials(['R2', 'R3'])), { slocs: TEAM_SLOCS, stockTypes: BOTH, materials: ['R2'], kinds: all })
})

test('the overlap is explained in Danish with the other count', () => {
  assert.equal(describeOverlap({ slocs: ['D000'], stockTypes: ['blocked'], materials: null }, { name: 'D000 blocked', owner: { name: 'Bo' } }), 'D000 (blocked) tælles allerede i "D000 blocked" af Bo')
  assert.equal(describeOverlap({ slocs: ['D000', 'D004'], stockTypes: BOTH, materials: ['R1', 'R2', 'R3', 'R4'] }, { name: 'Kabler', owner: { name: 'Anna' } }), 'R1, R2, R3 +1 i D000, D004 (unblocked og blocked) tælles allerede i "Kabler" af Anna')
})
