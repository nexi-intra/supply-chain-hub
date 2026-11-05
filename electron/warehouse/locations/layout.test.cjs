// Tegningen af lageret: the drawing is checked before it is stored, and its slots become the places of one hub.
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeLayout, normalizeDraft, placesOf } = require('./layout.cjs')

const doc = (...items) => ({ version: 0, hall: { w: 59, h: 68 }, items })
const rack = (slots, extra = {}) => ({ id: 'r1', type: 'rack', x: 1, y: 1, w: 4, h: 1, name: 'A', slots, ...extra })
const P = (id, name, extra = {}) => ({ id, name, kind: 'pallet', ...extra })

const unknownType = doc(rack([], { type: 'crane' }))
const slotIdTwice = doc(rack([P('s1', 'A1.1')]), rack([P('s1', 'B1.1')], { id: 'r2', name: 'B', y: 3 }))
const nameOf31Chars = doc(rack([P('s1', 'A'.repeat(31))]))
const palletWithoutName = doc(rack([P('s1', '   ')]))
const itemOutsideHall = doc(rack([], { x: 56 }))
const capacity7 = doc(rack([P('s1', 'S0', { capacity: 7 })]))

const layout = normalizeLayout({ version: 1, hall: { w: 59, h: 68 }, items: [
  { id: 'ra', type: 'rack', x: 8, y: 20, w: 40, h: 2, name: 'A', bays: 22, levels: 6, slots: [
    P('a1', 'A1.1', { pos: 1, level: 1 }), P('a2', 'A1.2', { purpose: 'pick', pos: 1, level: 2 }),
    { id: 'a3', name: 'A2.1', kind: 'aisle', pos: 2, level: 1 }, { id: 'a4', name: '', kind: 'blocked', pos: 3, level: 1 },
    { id: 'a5', name: '', kind: 'pick-unnamed', pos: 4, level: 1 }] },
  { id: 're', type: 'rack', x: 8, y: 0, w: 31, h: 2, name: 'E', owner: 'TRR', bays: 20, levels: 2, pull: { count: 28, firstNo: 0, shelves: 5, owner: 'TCD' }, slots: [
    { id: 'e1', name: 'E0 H1', kind: 'shelf', unit: 1, shelf: 1 }, P('e2', 'E1.1', { pos: 1, level: 1 })] },
  { id: 'rs', type: 'floorrow', x: 50, y: 10, w: 2, h: 10, name: 'S', floor: 'mezz', count: 1, depth: 2, slots: [P('s0', 'S0', { capacity: 2, pos: 1 })] },
  { id: 'fa', type: 'floor', x: 2, y: 40, w: 4, h: 4, name: 'A.Gulv', slots: [{ id: 'g1', name: 'A.Gulv', kind: 'floor' }] },
  { id: 'i1', type: 'special', x: 13, y: 32, w: 1, h: 1, name: 'I1', slots: [{ id: 'sp1', name: 'I1', kind: 'special' }] },
  { id: 'vp', type: 'shelfrack', x: 30, y: 40, w: 4, h: 1, name: 'Papir', visual: true, slots: [{ id: 'v1', name: 'Papir1', kind: 'shelf', section: 1, shelf: 1 }] },
  { id: 'rx', type: 'rack', x: 8, y: 50, w: 4, h: 1, name: 'X', owner: 'Andet', slots: [P('x1', 'X1.1', { pos: 1, level: 1 })] },
] })

test('normalizeLayout keeps a valid drawing and fills the defaults', () => {
  const out = normalizeLayout({ version: 0, hall: { w: 59, h: 68 }, items: [{ id: 'r1', type: 'rack', x: 1, y: 1, w: 4, h: 1, name: 'A', bays: 2, levels: 1, slots: [
    { id: 's1', name: ' A1.1 ', kind: 'pallet', pos: 1, level: 1 }, { id: 's2', name: 'Reol  X 1', kind: 'shelf', pos: 2, level: 1 }] }] })
  assert.equal(out.items[0].owner, 'TCD'); assert.equal(out.items[0].floor, 'ground'); assert.equal(out.notes, '')
  assert.deepEqual(out.items[0].slots.map(s => [s.name, s.purpose, s.capacity]), [['A1.1', 'reserve', 1], ['Reol X 1', 'reserve', undefined]])
  assert.equal(out.items[0].bays, 2, 'editor fields are kept')
})

test('normalizeLayout refuses what cannot be a drawing', () => {
  for (const bad of [unknownType, slotIdTwice, nameOf31Chars, palletWithoutName, itemOutsideHall, capacity7]) assert.throws(() => normalizeLayout(bad), { code: 'LAYOUT_INVALID' })
})

test('normalizeLayout keeps hand-set names, slot positions and editor fields, but only as JSON', () => {
  const out = normalizeLayout(doc(rack([{ id: 's1', name: 'E9 H1', kind: 'shelf', unit: 10, shelf: 1, manual: true, capacity: 4, color: 'red' }],
    { pull: { count: 28, firstNo: 0, shelves: 5, owner: 'TCD' }, bayLevels: { 1: 3 }, cut: [[0, 0]], pattern: '{reol}{fag}.{n}', later: { a: [1] }, onPick: () => {} })))
  const [item] = out.items
  assert.deepEqual(item.slots[0], { id: 's1', name: 'E9 H1', kind: 'shelf', purpose: 'reserve', manual: true, unit: 10, shelf: 1 })
  assert.deepEqual([item.pull, item.bayLevels, item.cut, item.pattern, item.later], [{ count: 28, firstNo: 0, shelves: 5, owner: 'TCD' }, { 1: 3 }, [[0, 0]], '{reol}{fag}.{n}', { a: [1] }])
  assert.equal('onPick' in item, false, 'a function is not a JSON value')
})

test('normalizeLayout limits: hall 10–300, 500 things, 400 slots a thing, 5000 in all, names 30, capacity 6, 2 MB', () => {
  const blocked = (prefix, count) => Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, name: '', kind: 'blocked' }))
  const racks = (count, slots) => Array.from({ length: count }, (_, i) => rack(blocked(`r${i}`, slots), { id: `r${i}` }))
  const texts = count => Array.from({ length: count }, (_, i) => ({ id: `t${i}`, type: 'text', x: 0, y: 0, w: 1, h: 1, name: 'Kontor' }))
  const hall = (w, h) => ({ ...doc(), hall: { w, h } })
  for (const good of [hall(10, 300), doc(...texts(500)), doc(...racks(1, 400)), doc(...racks(25, 200)), doc(rack([P('s1', 'A'.repeat(30), { capacity: 6 })], { x: 55, y: 67 }))])
    assert.doesNotThrow(() => normalizeLayout(good))
  const tooMany = doc(...racks(25, 200), rack(blocked('extra', 1), { id: 'extra' }))
  for (const bad of [hall(9, 68), hall(59, 301), doc(...texts(501)), doc(...racks(1, 401)), tooMany, doc(rack([], { y: -1 })), doc(rack([P('s1', 'S0', { capacity: 0 })])), { ...doc(), notes: 'æ'.repeat(1100000) }])
    assert.throws(() => normalizeLayout(bad), { code: 'LAYOUT_INVALID' })
  assert.throws(() => normalizeLayout(itemOutsideHall), { message: 'A ligger uden for hallen' })
})

test('normalizeDraft is a drawing plus the version it builds on and the decisions about places outside it', () => {
  const draft = normalizeDraft({ ...doc(rack([P('s1', ' A1.1')])), basedOn: 2, decisions: { outside: ['K1.1'] } })
  assert.deepEqual([draft.basedOn, draft.decisions, draft.items[0].slots[0].name], [2, { outside: ['K1.1'], remove: [] }, 'A1.1'])
  for (const bad of [doc(), { ...doc(), basedOn: -1 }, { ...doc(), basedOn: 1.5 }, { ...doc(), basedOn: 0, decisions: { remove: [1] } }, { ...capacity7, basedOn: 0 }, { ...doc(), basedOn: 0, rev: 'x' }])
    assert.throws(() => normalizeDraft(bad), { code: 'LAYOUT_INVALID' })
  assert.equal(normalizeDraft({ ...doc(), basedOn: 0, rev: 4 }).rev, 4, 'the revision is kept')
})

test('normalizeLayout keeps the names decided to stay outside the drawing', () => {
  assert.deepEqual(normalizeLayout({ ...doc(), outside: ['K1.1'] }).outside, ['K1.1'])
  assert.equal('outside' in normalizeLayout(doc()), false)
  assert.throws(() => normalizeLayout({ ...doc(), outside: [1] }), { code: 'LAYOUT_INVALID' })
})

test('placesOf gives the places of one hub, never visual things, aisles or other teams', () => {
  const tcd = placesOf(layout, 'TCD')
  assert.deepEqual(tcd.map(p => [p.name, p.type, p.purpose, p.capacity]), [
    ['A1.1', 'Palle', 'reserve', 1], ['A1.2', 'Palle', 'pick', 1], ['E0 H1', 'Hylde', 'reserve', 1],
    ['S0', 'Palle', 'reserve', 2], ['A.Gulv', 'Gulv', 'reserve', 0], ['I1', null, null, null]])
  assert.deepEqual(placesOf(layout, 'TRR').map(p => p.name), ['E1.1'])
  assert.equal(tcd[0].id, 'A1.1')
  assert.deepEqual(tcd[2], { slotId: 'e1', itemId: 're', name: 'E0 H1', id: 'E0 H1', type: 'Hylde', purpose: 'reserve', capacity: 1 })
  assert.deepEqual(placesOf(null, 'TCD'), [], 'no drawing yet, no places')
})
