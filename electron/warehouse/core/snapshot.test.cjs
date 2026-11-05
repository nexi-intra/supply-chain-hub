const test = require('node:test')
const assert = require('node:assert/strict')
const { buildSnapshot, summarizeSnapshot, indexSnapshot } = require('./snapshot.cjs')
const { storageRulesFor } = require('./classify.cjs')

const rulesByTeam = { TCD: storageRulesFor('TCD', {}), TRR: storageRulesFor('TRR', {}) }
const stock = (material, sloc, unrestricted, blocked = 0, valueUnrestricted = 0, valueBlocked = 0, description = material) =>
  ({ material, description, plant: 'D301', sloc, unrestricted, blocked, valueUnrestricted, valueBlocked })
const serial = (serialNo, material, sloc, stockType = 'unrestricted') => ({ serial: serialNo, material, sloc, plant: 'D301', description: material, userStatus: '', stockType })

const MB52 = [
  stock('INT4300-4921-0', 'D000', 3, 0, 3000),
  stock('INT4300-4921-0', 'D006', 1, 0, 1000),
  stock('INT4300-4921-0-R', 'D000', 1),
  stock('INT4300-4921-0-R', 'D001', 2, 1),
  stock('R162-0717', 'D000', 100, 0, 432.5),
  stock('R092-0036', 'D000', 2, 1),
  stock('331-0194', 'D000', 72, 0, 3591.36),
]
const SERIALS = [
  serial('N1', 'INT4300-4921-0', 'D000'), serial('N2', 'INT4300-4921-0', 'D000'), serial('N3', 'INT4300-4921-0', 'D000'),
  serial('N4', 'INT4300-4921-0', 'D006'),
  serial('U1', 'INT4300-4921-0-R', 'D000'),
  serial('U2', 'INT4300-4921-0-R', 'D001'), serial('U3', 'INT4300-4921-0-R', 'D001'), serial('U4', 'INT4300-4921-0-R', 'D001', 'blocked'),
  serial('S1', 'R092-0036', 'D000'), serial('S2', 'R092-0036', 'D000'), serial('S3', 'R092-0036', 'D000', 'blocked'),
]
const base = { team: 'TCD', mb52: MB52, serials: SERIALS, rulesByTeam, fetchedAt: 1000, fetchedBy: 'anna@example.test' }

test('storage-location scope: INT and R stock in the chosen locations, everything else left out', () => {
  const snapshot = buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'] } })
  assert.deepEqual(snapshot.scope, { type: 'slocs', slocs: ['D000'], materials: [], stockTypes: ['unrestricted', 'blocked'], kinds: ['new', 'used', 'accessory'] })
  const inScope = snapshot.stock.filter(line => line.inScope).map(line => `${snapshot.materials[line.m].material}@${line.sloc}`)
  assert.deepEqual(inScope.sort(), ['INT4300-4921-0-R@D000', 'INT4300-4921-0@D000', 'R092-0036@D000', 'R162-0717@D000'])
  assert.equal(snapshot.materials.some(entry => entry.material === '331-0194'), false)
  assert.deepEqual(snapshot.excluded.other, { materials: 1, quantity: 72 })
})

test('material scope covers the team locations only, and only the named materials', () => {
  const snapshot = buildSnapshot({ ...base, scope: { type: 'materials', materials: ['int4300-4921-0-r'] } })
  const inScope = snapshot.stock.filter(line => line.inScope).map(line => line.sloc)
  assert.deepEqual(inScope, ['D000'])
  assert.deepEqual(snapshot.scope.materials, ['INT4300-4921-0-R'])
  assert.equal(snapshot.scope.slocs.includes('D001'), false)
})

test('unit price is value divided by quantity over the plant; used terminals are worth 0', () => {
  const snapshot = buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'] } })
  const price = code => snapshot.materials.find(entry => entry.material === code).unitPrice
  assert.equal(price('INT4300-4921-0'), 1000)
  assert.equal(price('R162-0717'), 4.325)
  assert.equal(price('INT4300-4921-0-R'), 0)
})

test('serial-managed materials are recognised from SAP serial numbers; plant-wide serials are kept', () => {
  const snapshot = buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'] } })
  const entry = code => snapshot.materials.find(item => item.material === code)
  assert.equal(entry('R092-0036').serialManaged, true)
  assert.equal(entry('R162-0717').serialManaged, false)
  assert.equal(snapshot.serials.length, SERIALS.length)
  const index = indexSnapshot(snapshot)
  assert.deepEqual(index.serials.get('U4'), { material: 'INT4300-4921-0-R', sloc: 'D001', stockType: 'blocked', inScope: false })
  assert.deepEqual(index.serials.get('S3'), { material: 'R092-0036', sloc: 'D000', stockType: 'blocked', inScope: true })
  assert.equal(index.materials.get('R092-0036').kind, 'accessory')
})

test('group: an accessory count holds only accessories, a terminal count only terminals', () => {
  const accessories = buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['unrestricted'], kinds: ['accessory'] } })
  assert.deepEqual(accessories.scope.kinds, ['accessory'])
  assert.deepEqual(accessories.stock.filter(line => line.inScope).map(line => accessories.materials[line.m].material).sort(), ['R092-0036', 'R162-0717'])
  const index = indexSnapshot(accessories)
  assert.equal(index.serials.get('S1').inScope, true)
  assert.equal(index.serials.get('N1').inScope, false)
  const terminals = buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['unrestricted'], kinds: ['new', 'used'] } })
  assert.deepEqual(terminals.stock.filter(line => line.inScope).map(line => terminals.materials[line.m].material).sort(), ['INT4300-4921-0', 'INT4300-4921-0-R'])
  assert.throws(() => buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'], kinds: ['other'] } }), { code: 'SCOPE_INVALID' })
})

test('stock type: a blocked-only count holds just the blocked stock and the blocked serials', () => {
  const snapshot = buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['blocked'] } })
  assert.deepEqual(snapshot.scope.stockTypes, ['blocked'])
  const inScope = snapshot.stock.filter(line => line.inScope).map(line => `${snapshot.materials[line.m].material}@${line.sloc}`)
  assert.deepEqual(inScope, ['R092-0036@D000'])
  const index = indexSnapshot(snapshot)
  assert.equal(index.serials.get('S3').inScope, true)
  assert.equal(index.serials.get('S1').inScope, false)
  const summary = summarizeSnapshot(snapshot)
  assert.deepEqual(summary.groups.accessory, { materials: 1, lines: 1, unrestricted: 0, blocked: 1, serials: 1, value: 0 })
  assert.equal(summary.groups.new.lines, 0)
  assert.throws(() => buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'], stockTypes: [] } }), { code: 'SCOPE_INVALID' })
  assert.throws(() => buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['quality'] } }), { code: 'SCOPE_INVALID' })
})

test('an unrestricted-only count leaves the blocked quantities out', () => {
  const summary = summarizeSnapshot(buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['unrestricted'] } }))
  assert.deepEqual(summary.groups.accessory, { materials: 2, lines: 2, unrestricted: 102, blocked: 0, serials: 2, value: 432.5 })
})

test('snapshots stored before stock types existed still count both', () => {
  const snapshot = buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'] } })
  delete snapshot.scope.stockTypes
  const index = indexSnapshot(snapshot)
  assert.equal(index.serials.get('S1').inScope, true)
  assert.equal(index.serials.get('S3').inScope, true)
})

test('misplaced stock is marked with suggested locations', () => {
  const snapshot = buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000', 'D006'] } })
  const used = snapshot.stock.find(line => snapshot.materials[line.m].material === 'INT4300-4921-0-R' && line.sloc === 'D000')
  assert.equal(used.misplaced, true)
  assert.deepEqual(used.suggestions, ['D004', 'D005'])
  const fine = snapshot.stock.find(line => snapshot.materials[line.m].material === 'INT4300-4921-0' && line.sloc === 'D006')
  assert.equal(fine.misplaced, false)
})

test('manual exclusions are left out of the count but remembered with their reason', () => {
  const snapshot = buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000'] }, exclusions: [{ material: 'r162-0717', reason: 'Tælles ikke på tilbehør' }] })
  const line = snapshot.stock.find(item => snapshot.materials[item.m].material === 'R162-0717')
  assert.equal(line.inScope, false)
  assert.deepEqual(snapshot.excluded.manual, [{ material: 'R162-0717', reason: 'Tælles ikke på tilbehør' }])
})

test('only the team own storage locations can be counted', () => {
  assert.throws(() => buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D001'] } }), { code: 'SCOPE_INVALID' })
  assert.throws(() => buildSnapshot({ ...base, scope: { type: 'slocs', slocs: [] } }), { code: 'SCOPE_INVALID' })
  assert.throws(() => buildSnapshot({ ...base, scope: { type: 'materials', materials: ['bad material!'] } }), { code: 'SCOPE_INVALID' })
  const trr = buildSnapshot({ ...base, team: 'TRR', scope: { type: 'slocs', slocs: ['D001'] } })
  assert.equal(trr.stock.filter(line => line.inScope).length, 1)
})

test('summary for the preview: groups, unrestricted and blocked, serials, misplaced and left out', () => {
  const summary = summarizeSnapshot(buildSnapshot({ ...base, scope: { type: 'slocs', slocs: ['D000', 'D006'] } }))
  assert.deepEqual(summary.groups.new, { materials: 1, lines: 2, unrestricted: 4, blocked: 0, serials: 4, value: 4000 })
  assert.deepEqual(summary.groups.used, { materials: 1, lines: 1, unrestricted: 1, blocked: 0, serials: 1, value: 0 })
  assert.deepEqual(summary.groups.accessory, { materials: 2, lines: 2, unrestricted: 102, blocked: 1, serials: 3, value: 432.5 })
  assert.equal(summary.misplaced.length, 1)
  assert.equal(summary.misplaced[0].material, 'INT4300-4921-0-R')
  assert.deepEqual(summary.excluded.other, { materials: 1, quantity: 72 })
  assert.deepEqual(summary.slocs, ['D000', 'D006'])
})
