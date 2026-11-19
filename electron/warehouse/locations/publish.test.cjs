// Udgivelse af tegningen: what publishing a drawing will do to the hub's places, before anything is written.
const test = require('node:test')
const assert = require('node:assert/strict')
const { planPublish, applyPublish } = require('./publish.cjs')
const { normalizeLayout, normalizeDraft } = require('./layout.cjs')
const { locationKey, areaFromName } = require('./model.cjs')
const { stockId } = require('./shelves.cjs')

const hall = { w: 59, h: 68 }
const L = (name, type = 'Palle', purpose = 'reserve', extra = {}) => ({
  id: locationKey(name), name, area: areaFromName(name), type, purpose, capacity: type === 'Gulv' ? 0 : 1, fixedMaterials: [], active: true, note: '', ...extra,
})
const pallet = (id, location) => ({ id, location, material: 'M1', quantity: 1 })
const line = (location, material) => ({ id: stockId(location, material), location, material, quantity: 5 })
const byId = list => Object.fromEntries(list.map(entry => [entry.id, entry]))
const stateOf = (locations, pallets = [], stock = []) => ({ locations: byId(locations), pallets: byId(pallets), stock: byId(stock) })
const P = (id, name, extra = {}) => ({ id, name, kind: 'pallet', ...extra })
const SH = (id, name, purpose = 'reserve') => ({ id, name, kind: 'shelf', purpose })
const SP = (id, name) => ({ id, name, kind: 'special' })
const rackWith = (slots, extra = {}) => ({ id: 'r1', type: 'rack', x: 1, y: 1, w: 4, h: 1, name: 'A', slots, ...extra })
const layoutOf = (items, version = 1) => normalizeLayout({ version, hall, items })
const draftOf = (items, decisions = {}, basedOn = 1) => normalizeDraft({ version: 0, hall, items, basedOn, decisions })
const pick = (object, fields) => Object.fromEntries(fields.map(field => [field, object[field]]))
const MONA_REF = { email: 'mona@x.test', name: 'Mona' }

test('first publish adopts by name, keeps the list spelling, creates the rest and leaves the others outside', () => {
  const plan = planPublish({ next: draftOf([rackWith([P('s1', 'p1.1'), SH('s2', 'H1', 'pick'), P('s3', 'A1.6')])], {}, 0), previous: null, state: stateOf([L('P1.1'), L('H1', 'Hylde', 'pick'), L('K1.1', 'Hylde')]), team: 'TCD' })
  assert.deepEqual(plan.create.map(c => c.name), ['A1.6'])
  assert.deepEqual([plan.rename.length, plan.change.length, plan.blocked.length], [0, 0, 0])
  assert.deepEqual(plan.outside.map(o => o.name), ['K1.1'])
  assert.equal(plan.counts.unchanged, 2)
  assert.deepEqual(plan.linked.sort(), ['A1.6', 'H1', 'P1.1'])
  assert.deepEqual([plan.basedOn, plan.version], [0, 0])
})

test('a slot keeps its place when renamed: the pallets go along', () => {
  const plan = planPublish({ previous: layoutOf([rackWith([P('s1', 'A1.1')])], 3), next: draftOf([rackWith([P('s1', 'A1.9')])], {}, 3), state: stateOf([L('A1.1')], [pallet('p1', 'A1.1')]), team: 'TCD' })
  assert.deepEqual(plan.rename, [{ slotId: 's1', from: 'A1.1', to: 'A1.9', pallets: 1, stock: 0 }])
  assert.deepEqual([plan.linked, plan.remove.length, plan.outside.length, plan.version], [['A1.9'], 0, 0, 3])
})

test('the drawing changes type, capacity and pick/reserve – never reserved, station or special places', () => {
  const state = stateOf([L('S0'), L('P1.1', 'Palle', 'reserved'), L('I1', 'Bord', 'station', { capacity: 2 }), L('H1', 'Hylde', 'pick')])
  const next = draftOf([rackWith([P('s0', 'S0', { capacity: 2 }), P('s1', 'P1.1'), SP('s2', 'I1'), SH('s3', 'H1', 'reserve')])])
  const plan = planPublish({ next, previous: null, state, team: 'TCD' })
  assert.deepEqual(plan.change.map(c => [c.name, c.changes]), [['S0', { capacity: [1, 2] }], ['H1', { purpose: ['pick', 'reserve'] }]])
  assert.deepEqual([plan.blocked.length, plan.counts.unchanged], [0, 2])
})

test('blocks: name twice, name taken, not empty, refused type, unknown special place', () => {
  const previous = layoutOf([rackWith([P('s3', 'X1.1'), P('s4', 'C1.1'), P('s7', 'B1.1')])])
  const next = draftOf([rackWith([P('s1', 'A1.1'), P('s2', 'a1.1'), P('s3', 'B1.1'), SH('s5', 'D1.1'), SP('s6', 'I99'), P('s7', 'B1.1')])])
  const state = stateOf([L('X1.1'), L('B1.1'), L('C1.1'), L('D1.1')], [pallet('p1', 'C1.1'), pallet('p2', 'D1.1')])
  const plan = planPublish({ next, previous, state, team: 'TCD' })
  assert.deepEqual(plan.blocked.map(b => [b.code, b.name]).sort(), [['NAME_TAKEN', 'B1.1'], ['NAME_TWICE', 'A1.1'], ['NAME_TWICE', 'B1.1'], ['NOT_EMPTY', 'C1.1'], ['SPECIAL_UNKNOWN', 'I99'], ['TYPE_REFUSED', 'D1.1']])
  assert.match(plan.blocked.find(b => b.code === 'NAME_TWICE').detail, /A1\.1.*a1\.1/)
  assert.equal(plan.counts.blocked, 6)
})

test('a lagerhylde with stock cannot become a pallet place', () => {
  const plan = planPublish({ next: draftOf([rackWith([P('s1', 'E9 H1')])]), previous: null, state: stateOf([L('E9 H1', 'Hylde')], [], [line('E9 H1', 'R1')]), team: 'TCD' })
  assert.deepEqual(plan.blocked.map(b => [b.code, b.name]), [['TYPE_REFUSED', 'E9 H1']])
})

test('a reserve place with pallets cannot become a pick place; an empty one can', () => {
  const next = draftOf([rackWith([P('s1', 'A1.1', { purpose: 'pick' })])])
  const plan = planPublish({ next, previous: null, state: stateOf([L('A1.1')], [pallet('p1', 'A1.1')]), team: 'TCD' })
  assert.deepEqual(plan.blocked.map(b => [b.code, b.name]), [['TYPE_REFUSED', 'A1.1']])
  assert.equal(plan.blocked[0].detail, 'Der står 1 palle på A1.1 – flyt den, før den bliver pluk-plads')
  const empty = planPublish({ next, previous: null, state: stateOf([L('A1.1')]), team: 'TCD' })
  assert.deepEqual([empty.change.map(c => c.changes), empty.blocked.length], [[{ purpose: ['reserve', 'pick'] }], 0])
})

test('a chain or swap of names is fine', () => {
  const previous = layoutOf([rackWith([P('s1', 'A1.1'), P('s2', 'A1.2')])])
  const state = stateOf([L('A1.1'), L('A1.2')], [pallet('p1', 'A1.1'), pallet('p2', 'A1.2')])
  const swap = planPublish({ previous, next: draftOf([rackWith([P('s1', 'A1.2'), P('s2', 'A1.1')])]), state, team: 'TCD' })
  assert.deepEqual([swap.rename.length, swap.blocked.length], [2, 0])
  const chain = planPublish({ previous, next: draftOf([rackWith([P('s1', 'A1.2'), P('s2', 'A1.3')])]), state, team: 'TCD' })
  assert.deepEqual(chain.rename.map(r => [r.from, r.to]), [['A1.1', 'A1.2'], ['A1.2', 'A1.3']])
  assert.deepEqual([chain.blocked.length, chain.linked], [0, ['A1.2', 'A1.3']])
})

test('a new slot may take the name another slot renames away: it becomes a new place', () => {
  const previous = layoutOf([rackWith([P('s1', 'A1.1')])])
  const plan = planPublish({ previous, next: draftOf([rackWith([P('s1', 'A1.9'), P('s2', 'A1.1')])]), state: stateOf([L('A1.1')], [pallet('p1', 'A1.1')]), team: 'TCD' })
  assert.deepEqual([plan.rename.map(r => r.to), plan.create.map(c => c.name), plan.blocked.length], [['A1.9'], ['A1.1'], 0])
})

// Task 5 deletes `remove` first, then renames, so a rename may take the name of a place removed in the same plan.
test('a rename may take the name of a dropped slot\'s place: only goods on it block', () => {
  const previous = layoutOf([rackWith([P('s1', 'A1.1'), P('s2', 'A1.2')])])
  const next = draftOf([rackWith([P('s1', 'A1.2')])])
  const plan = planPublish({ previous, next, state: stateOf([L('A1.1'), L('A1.2')], [pallet('p1', 'A1.1')]), team: 'TCD' })
  assert.deepEqual(plan.rename, [{ slotId: 's1', from: 'A1.1', to: 'A1.2', pallets: 1, stock: 0 }])
  assert.deepEqual([plan.remove.map(r => r.name), plan.blocked, plan.linked], [['A1.2'], [], ['A1.2']])
  const withGoods = planPublish({ previous, next, state: stateOf([L('A1.1'), L('A1.2')], [pallet('p1', 'A1.1'), pallet('p2', 'A1.2')]), team: 'TCD' })
  assert.deepEqual(withGoods.blocked.map(b => [b.code, b.name]), [['NOT_EMPTY', 'A1.2']])
})

test('a place the admin removes frees its name for a rename; without the decision the slot adopts that place', () => {
  const previous = layoutOf([rackWith([P('s1', 'A1.1')])])
  const state = stateOf([L('A1.1'), L('B1.1')], [pallet('p1', 'A1.1')])
  const plan = planPublish({ previous, next: draftOf([rackWith([P('s1', 'B1.1')])], { remove: ['B1.1'] }), state, team: 'TCD' })
  assert.deepEqual([plan.rename.map(r => [r.from, r.to]), plan.remove.map(r => r.name), plan.blocked], [[['A1.1', 'B1.1']], ['B1.1'], []])
  const adopted = planPublish({ previous, next: draftOf([rackWith([P('s1', 'B1.1')])]), state, team: 'TCD' })
  assert.deepEqual([adopted.rename, adopted.linked, adopted.blocked.map(b => [b.code, b.name])], [[], ['B1.1'], [['NOT_EMPTY', 'A1.1']]])
})

// "Find på tegningen" after the first publish: a published slot is given the name of a place outside the drawing.
test('a slot named like a place outside the drawing adopts it; its old place is dropped', () => {
  const previous = layoutOf([rackWith([P('s1', 'A1.1')])])
  const next = draftOf([rackWith([P('s1', 'K1.1')])])
  const plan = planPublish({ previous, next, state: stateOf([L('A1.1'), L('K1.1')], [pallet('p1', 'K1.1')]), team: 'TCD' })
  assert.deepEqual([plan.rename, plan.create, plan.remove, plan.blocked, plan.linked, plan.outside], [[], [], [{ name: 'A1.1', pallets: 0, stock: 0 }], [], ['K1.1'], []])
  assert.equal(plan.counts.unchanged, 1)
  const withGoods = planPublish({ previous, next, state: stateOf([L('A1.1'), L('K1.1')], [pallet('p1', 'K1.1'), pallet('p2', 'A1.1')]), team: 'TCD' })
  assert.deepEqual(withGoods.blocked.map(b => [b.code, b.name]), [['NOT_EMPTY', 'A1.1']])
})

test('a slot cannot take the name of a place that stays on the drawing', () => {
  const previous = layoutOf([rackWith([P('s1', 'A1.1'), P('s2', 'K1.1')])])
  const plan = planPublish({ previous, next: draftOf([rackWith([P('s1', 'K1.1'), P('s2', 'K1.1')])]), state: stateOf([L('A1.1'), L('K1.1')]), team: 'TCD' })
  assert.deepEqual(plan.blocked.map(b => [b.code, b.name]).sort(), [['NAME_TAKEN', 'K1.1'], ['NAME_TWICE', 'K1.1']])
})

test('applyPublish: the adopted place keeps its pallet and the slot\'s old place is gone', () => {
  const previous = layoutOf([rackWith([P('s1', 'A1.1')])])
  const tx = stateOf([L('A1.1'), L('K1.1', 'Palle', 'reserve', { note: 'ved porten' })], [pallet('p1', 'K1.1')])
  const plan = planPublish({ previous, next: draftOf([rackWith([P('s1', 'K1.1')])]), state: tx, team: 'TCD' })
  applyPublish(tx, plan, { at: 1000, by: MONA_REF })
  assert.deepEqual(Object.keys(tx.locations), ['K1.1'])
  assert.deepEqual([tx.locations['K1.1'].note, tx.pallets.p1.location], ['ved porten', 'K1.1'])
})

test('decisions: an empty place can be removed, one with goods is blocked', () => {
  const next = draftOf([rackWith([P('s1', 'A1.1')])], { remove: ['k1.1'] })
  const plan = planPublish({ next, previous: null, state: stateOf([L('A1.1'), L('K1.1')]), team: 'TCD' })
  assert.deepEqual(plan.remove.map(r => r.name), ['K1.1']); assert.ok(!plan.outside.some(o => o.name === 'K1.1'))
  const blockedWithGoods = planPublish({ next, previous: null, state: stateOf([L('A1.1'), L('K1.1')], [pallet('p1', 'K1.1')]), team: 'TCD' })
  assert.deepEqual(blockedWithGoods.blocked.map(b => b.code), ['NOT_EMPTY'])
})

test('slots of another team never become places here', () => assert.equal(planPublish({ next: draftOf([rackWith([P('d1', 'D1.1')], { owner: 'TRR' })]), previous: null, state: stateOf([]), team: 'TCD' }).create.length, 0))

// A publish of: A1.1 → A1.9 (a pallet), H1 → H9 (a stock line), S0 to capacity 2, new A1.6 and E9 H1, K1.1 dropped.
function publishCase() {
  const previous = layoutOf([rackWith([P('s1', 'A1.1'), SH('s2', 'H1'), P('s3', 'K1.1'), P('s0', 'S0')])])
  const next = draftOf([rackWith([P('s1', 'A1.9'), SH('s2', 'H9'), P('s0', 'S0', { capacity: 2 }), P('s4', 'A1.6'), SH('s5', 'E9 H1')])])
  const tx = stateOf([L('A1.1'), L('H1', 'Hylde'), L('K1.1'), L('S0')], [pallet('p1', 'A1.1')], [line('H1', 'R1')])
  return { tx, plan: planPublish({ previous, next, state: tx, team: 'TCD' }) }
}

test('applyPublish renames with pallets and stock, deletes, creates and changes in one go', () => {
  const { tx, plan } = publishCase()
  assert.deepEqual(applyPublish(tx, plan, { at: 1000, by: MONA_REF }), { linked: plan.linked })
  assert.ok(!tx.locations['A1.1']); assert.equal(tx.locations['A1.9'].name, 'A1.9'); assert.equal(tx.pallets.p1.location, 'A1.9')
  assert.deepEqual(Object.keys(tx.stock), ['H9|R1']); assert.equal(tx.stock['H9|R1'].location, 'H9')
  assert.deepEqual(pick(tx.locations['A1.6'], ['type', 'purpose', 'capacity', 'area', 'fixedMaterials', 'active']), { type: 'Palle', purpose: 'reserve', capacity: 1, area: 'A', fixedMaterials: [], active: true })
  assert.deepEqual([tx.locations['E9 H1'].rack, tx.locations['E9 H1'].shelf], ['E9', 1])
  assert.ok(!tx.locations['K1.1']); assert.equal(tx.locations.S0.capacity, 2)
  assert.deepEqual(['A1.9', 'H9', 'S0', 'A1.6', 'E9 H1'].map(id => [tx.locations[id].updatedAt, tx.locations[id].updatedBy]), Array(5).fill([1000, MONA_REF]))
})

test('a swap of two names keeps each pallet on its physical place', () => {
  const previous = layoutOf([rackWith([P('s1', 'A1.1'), P('s2', 'A1.2')])])
  const tx = stateOf([L('A1.1', 'Palle', 'reserve', { note: 'ved porten' }), L('A1.2')], [pallet('p1', 'A1.1'), pallet('p2', 'A1.2')])
  const swapPlan = planPublish({ previous, next: draftOf([rackWith([P('s1', 'A1.2'), P('s2', 'A1.1')])]), state: tx, team: 'TCD' })
  applyPublish(tx, swapPlan, { at: 1000, by: MONA_REF })
  assert.deepEqual([tx.pallets.p1.location, tx.pallets.p2.location], ['A1.2', 'A1.1'])
  assert.deepEqual([tx.locations['A1.2'].note, tx.locations['A1.1'].note], ['ved porten', ''])
})

test('a swap of two Hylder with the same material keeps each stock line on its physical shelf', () => {
  const previous = layoutOf([rackWith([SH('s1', 'H1'), SH('s2', 'H2')])])
  const tx = stateOf([L('H1', 'Hylde'), L('H2', 'Hylde')], [], [{ ...line('H1', 'R1'), quantity: 3 }, { ...line('H2', 'R1'), quantity: 7 }])
  const plan = planPublish({ previous, next: draftOf([rackWith([SH('s1', 'H2'), SH('s2', 'H1')])]), state: tx, team: 'TCD' })
  assert.deepEqual([plan.rename.map(r => [r.from, r.to, r.stock]), plan.blocked], [[['H1', 'H2', 1], ['H2', 'H1', 1]], []])
  applyPublish(tx, plan, { at: 1000, by: MONA_REF })
  assert.deepEqual(Object.values(tx.stock).map(entry => [entry.id, entry.location, entry.quantity]).sort(), [['H1|R1', 'H1', 7], ['H2|R1', 'H2', 3]])
})

test('a rename onto the name of a removed place keeps the renamed place and its pallet', () => {
  const previous = layoutOf([rackWith([P('s1', 'A1.1'), P('s2', 'A1.2')])])
  const tx = stateOf([L('A1.1', 'Palle', 'reserve', { note: 'gamle A1.1' }), L('A1.2')], [pallet('p1', 'A1.1')])
  const plan = planPublish({ previous, next: draftOf([rackWith([P('s1', 'A1.2')])]), state: tx, team: 'TCD' })
  applyPublish(tx, plan, { at: 1000, by: MONA_REF })
  assert.deepEqual(Object.keys(tx.locations), ['A1.2'])
  assert.deepEqual(pick(tx.locations['A1.2'], ['id', 'name', 'note']), { id: 'A1.2', name: 'A1.2', note: 'gamle A1.1' })
  assert.equal(tx.pallets.p1.location, 'A1.2')
})

test('a new type brings its capacity and rack/shelf; a renamed Hylde gets its new shelf and lines', () => {
  const previous = layoutOf([rackWith([SH('s4', 'E7 H1')])])
  const next = draftOf([rackWith([SH('s1', 'E9 H2'), { id: 's2', name: 'E8 H1', kind: 'floor' }, P('s3', 'G1', { capacity: 3 }), SH('s4', 'E7 H4')])])
  const tx = stateOf([L('E9 H2'), L('E8 H1', 'Hylde', 'reserve', { rack: 'E8', shelf: 1 }), L('G1', 'Gulv'), L('E7 H1', 'Hylde', 'reserve', { rack: 'E7', shelf: 1 })], [], [line('E7 H1', 'R2')])
  const plan = planPublish({ previous, next, state: tx, team: 'TCD' })
  applyPublish(tx, plan, { at: 1000, by: MONA_REF })
  assert.deepEqual(pick(tx.locations['E9 H2'], ['type', 'capacity', 'rack', 'shelf', 'updatedAt']), { type: 'Hylde', capacity: 1, rack: 'E9', shelf: 2, updatedAt: 1000 })
  assert.deepEqual(pick(tx.locations['E8 H1'], ['type', 'capacity']), { type: 'Gulv', capacity: 0 }); assert.ok(!('rack' in tx.locations['E8 H1']) && !('shelf' in tx.locations['E8 H1']))
  assert.deepEqual(pick(tx.locations.G1, ['type', 'capacity']), { type: 'Palle', capacity: 3 })
  assert.deepEqual(pick(tx.locations['E7 H4'], ['rack', 'shelf']), { rack: 'E7', shelf: 4 })
  assert.deepEqual(Object.values(tx.stock).map(entry => [entry.id, entry.location]), [['E7 H4|R2', 'E7 H4']])
})

test('applyPublish refuses a blocked plan and changes nothing', () => {
  const { tx, plan } = publishCase()
  const before = structuredClone(tx)
  assert.throws(() => applyPublish(tx, { ...plan, blocked: [{ code: 'NAME_TWICE', name: 'A1.1', detail: '' }] }, { at: 1, by: MONA_REF }), { code: 'LAYOUT_BLOCKED', message: /A1\.1/ })
  assert.deepEqual(tx, before)
})
