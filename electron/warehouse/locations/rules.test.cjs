const test = require('node:test')
const assert = require('node:assert/strict')
const { occupancy, areaSummary, fifo, suggestSlots, pickPlaces, stations, refillSuggestion, search } = require('./rules.cjs')
const { palletLimit } = require('./model.cjs')

const day = (y, m, d) => Date.UTC(y, m - 1, d)
const NOW = day(2026, 10, 20)
const place = (name, extra = {}) => ({ id: name, name, area: name.replace(/[\d. ].*$/, ''), type: 'Palle', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '', ...extra })
const pallet = (id, location, material, receivedAt, extra = {}) => ({ id, location, material, quantity: 100, receivedAt, document: null, serials: [], sloc: 'D000', tags: [], note: '', createdAt: receivedAt, ...extra })

function state() {
  const locations = Object.fromEntries([
    place('A2.1'), place('A2.4'), place('A2.5'), place('A3.1', { fixedMaterials: ['R133-0054'] }),
    place('A17.1', { purpose: 'reserved', note: 'TERMINAL REOL' }), place('A9.9', { active: false }),
    place('C1.1', { fixedMaterials: ['INT4300-4921-0'] }), place('C16.1'), place('C16.2'), place('C16.3'), place('C20.1'), place('F1.1'),
    place('H26', { type: 'Hylde', purpose: 'pick', fixedMaterials: ['R162-0717'] }),
    place('H1', { type: 'Hylde', purpose: 'pick', fixedMaterials: ['R133-0032', 'R162-0553'] }),
    place('I8', { type: 'Bord', purpose: 'station', fixedMaterials: ['R162-0717'] }),
    place('F1.0', { type: 'Gulv', capacity: 3 }),
  ].map(location => [location.id, location]))
  const pallets = Object.fromEntries([
    pallet('p1', 'A2.4', 'R162-0717', day(2024, 11, 18)),
    pallet('p2', 'A2.1', 'R162-0717', day(2024, 11, 7), { document: '5000032337 2026 0001', serials: ['NCC202796019'] }),
    pallet('p3', 'C16.1', 'INT4300-4921-0', day(2026, 10, 20)),
    pallet('p4', 'F1.0', 'R133-0049', day(2026, 1, 1)),
    pallet('p5', 'F1.0', 'R133-0049', day(2026, 2, 1)),
  ].map(item => [item.id, item]))
  return { locations, pallets }
}

test('fifo gives the oldest reserve pallet first and ignores pick and station places', () => {
  const s = state()
  s.pallets.p9 = pallet('p9', 'H26', 'R162-0717', day(2020, 1, 1))
  const list = fifo(s, 'R162-0717', { now: NOW })
  assert.deepEqual(list.map(item => item.location), ['A2.1', 'A2.4'])
  assert.equal(list[0].ageDays, 712)
})

test('suggestSlots prefers the fixed place, then the same aisle, then the area, never reserved or full places', () => {
  const s = state()
  const slots = suggestSlots(s, 'INT4300-4921-0', { limit: 20 })
  assert.deepEqual(slots.slice(0, 3).map(slot => `${slot.location}:${slot.reason}`), ['C1.1:fixed', 'C16.2:near', 'C16.3:near'])
  assert.equal(slots[3].location, 'C20.1')
  assert.equal(slots[3].reason, 'free')
  const names = slots.map(slot => slot.location)
  for (const never of ['A17.1', 'A9.9', 'H26', 'I8', 'C16.1', 'A2.1']) assert.ok(!names.includes(never), never)
  assert.ok(names.includes('F1.0'), 'a floor place with room left is free')
  assert.equal(suggestSlots(s, 'INT4300-4921-0', { limit: 2 }).length, 2)
})

test('refillSuggestion for a pick place is the oldest reserve pallet of its fixed material', () => {
  const s = state()
  assert.equal(refillSuggestion(s, 'H26', { now: NOW }).id, 'p2')
  assert.equal(refillSuggestion(s, 'A2.1', { now: NOW }), null, 'not a pick place')
  s.pallets.p6 = pallet('p6', 'A2.5', 'R162-0553', day(2025, 3, 1))
  assert.equal(refillSuggestion(s, 'H1', { now: NOW, material: 'R162-0553' }).id, 'p6', 'a pick place with several materials is refilled per material')
  assert.equal(refillSuggestion(s, 'H1', { now: NOW }), null, 'which material must be said when there are several')
  assert.deepEqual(pickPlaces(s, 'R162-0717').map(item => item.id), ['H26'])
  assert.deepEqual(stations(s, 'R162-0717').map(item => item.id), ['I8'])
})

test('areaSummary counts capacity, used and free reserve places per area; pick places hold no pallets and are left out', () => {
  const s = state()
  const byArea = Object.fromEntries(areaSummary(s).map(item => [item.area, item]))
  assert.deepEqual(byArea.A, { area: 'A', capacity: 4, used: 2, free: 2 })
  assert.equal(byArea.H, undefined)
  assert.equal(byArea.F.capacity, 1, 'a floor place has no capacity to count')
  assert.equal(byArea.F.used, 0)
  assert.deepEqual(occupancy(s)['F1.0'], { used: 2, capacity: null, free: null })
})

test('search finds by material prefix, description words, location, 49/50 number and serial', () => {
  const s = state()
  const texts = { 'R162-0717': 'Ethernet Cable RJ45 2m', 'INT4300-4921-0': 'SmartPOS N950 PCI PTS 6.x P2PE' }
  assert.deepEqual(search(s, texts, 'ethernet 2m').materials, ['R162-0717'])
  assert.deepEqual(search(s, texts, 'r162').materials, ['R162-0553', 'R162-0717'])
  assert.deepEqual(search(s, texts, '5000032337').pallets, ['p2'])
  assert.deepEqual(search(s, texts, 'NCC202796019').pallets, ['p2'])
  assert.deepEqual(search(s, texts, 'a2').locations, ['A2.1', 'A2.4', 'A2.5'])
  assert.deepEqual(search(s, texts, '  ').materials, [])
})

test('a pallet place takes exactly one pallet, a floor place any number, and shelves hold no pallets', () => {
  const s = state()
  s.pallets.p6 = { ...s.pallets.p1, id: 'p6', location: 'A2.5' }
  s.locations['E9 H5'] = { id: 'E9 H5', name: 'E9 H5', area: 'E', type: 'Hylde', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '', rack: 'E9', shelf: 5 }
  for (let i = 0; i < 7; i++) s.pallets['f' + i] = { ...s.pallets.p4, id: 'f' + i }
  assert.deepEqual(occupancy(s)['A2.5'], { used: 1, capacity: 1, free: 0 }, 'a pallet place is full at one pallet')
  assert.deepEqual(occupancy(s)['F1.0'], { used: 9, capacity: null, free: null })
  const names = suggestSlots(s, 'R999-0001', { limit: 50 }).map(slot => slot.location)
  assert.ok(names.includes('F1.0'), 'a floor is never full')
  assert.ok(!names.includes('E9 H5'), 'a lagerhylde holds no pallets')
  assert.ok(!names.includes('A2.5'))
  assert.equal(areaSummary(s).find(area => area.area === 'E'), undefined, 'shelves are not counted as pallet places')
  assert.deepEqual(search(s, {}, 'e9').racks, ['E9'])
  assert.deepEqual(search(s, {}, 'A2').racks, [])
})

test('a Palle with capacity 2 holds two pallets (S0 ovenpå)', () => {
  assert.equal(palletLimit({ type: 'Palle', purpose: 'reserve', capacity: 2 }), 2)
  assert.equal(palletLimit({ type: 'Palle', purpose: 'reserve', capacity: 1 }), 1)
  assert.equal(palletLimit({ type: 'Palle', purpose: 'reserve' }), 1)
})

test('the area summary counts a pallet place by the pallets it takes: one, or two for a place like S0', () => {
  const s = state()
  s.locations['A2.5'] = { ...s.locations['A2.5'], capacity: 2 }
  const byArea = Object.fromEntries(areaSummary(s).map(item => [item.area, item]))
  assert.deepEqual(byArea.A, { area: 'A', capacity: 5, used: 2, free: 3 })
})
