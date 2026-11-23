const test = require('node:test')
const assert = require('node:assert/strict')
const { changeOf, undoPlan } = require('./undo.cjs')

const place = (name, extra = {}) => ({ id: name, name, area: name.replace(/[\d. ].*$/, ''), type: 'Palle', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '', ...extra })
const pallet = (id, location, extra = {}) => ({ id, location, material: 'R162-0717', quantity: 100, receivedAt: 1, document: null, serials: [], sloc: 'D000', tags: [], note: '', createdAt: 1, ...extra })
const state = (locations, pallets = []) => ({ locations: Object.fromEntries(locations.map(item => [item.id, item])), pallets: Object.fromEntries(pallets.map(item => [item.id, item])) })
const clone = value => structuredClone(value)

test('changeOf keeps only what differs, with null for what did not exist', () => {
  const before = state([place('A1.1'), place('A1.2')])
  const after = state([place('A1.1'), place('A1.2')], [pallet('p1', 'A1.1')])
  assert.deepEqual(changeOf(before, after), { before: { pallets: { p1: null }, locations: {} }, after: { pallets: { p1: pallet('p1', 'A1.1') }, locations: {} } })
  assert.equal(changeOf(before, clone(before)), null, 'nothing differs')
})

test('undoPlan puts everything back as it was before when nothing changed since', () => {
  const start = state([place('A1.1', { capacity: 2 }), place('A1.2')], [pallet('p1', 'A1.1'), pallet('p2', 'A1.1')])
  // take 10 of p1, take the whole p2, move p1 to A1.2: each as its own action
  for (const step of [
    s => { s.pallets.p1.quantity = 90 },
    s => { delete s.pallets.p2 },
    s => { s.pallets.p1.location = 'A1.2' },
  ]) {
    const after = clone(start)
    step(after)
    const plan = undoPlan(changeOf(start, after), after)
    assert.equal(plan.ok, true)
    assert.deepEqual(plan.state, start)
  }
  const putAway = state(Object.values(start.locations), [...Object.values(start.pallets), pallet('p8', 'A1.2'), pallet('p9', 'A1.2')])
  assert.deepEqual(undoPlan(changeOf(start, putAway), putAway).state, start, 'both pallets of one put-away are gone again')
})

test('undoPlan refuses as a whole when one thing the action touched has changed since', () => {
  const start = state([place('A1.1')])
  const after = state([place('A1.1')], [pallet('p1', 'A1.1'), pallet('p2', 'A1.1')])
  const change = changeOf(start, after)
  const later = clone(after)
  later.pallets.p2.quantity = 40
  assert.deepEqual(undoPlan(change, later), { ok: false, conflict: { kind: 'pallet', id: 'p2' } })
  assert.ok(later.pallets.p1, 'the state given is never changed')
})

test('undoing a created place is refused while a pallet stands on it', () => {
  const start = state([place('A1.1')])
  const after = state([place('A1.1'), place('C9.9')])
  const later = state([place('A1.1'), place('C9.9')], [pallet('p7', 'C9.9')])
  assert.deepEqual(undoPlan(changeOf(start, after), later), { ok: false, conflict: { kind: 'location', id: 'C9.9' } })
  assert.equal(undoPlan(changeOf(start, after), after).ok, true, 'an empty new place can be undone')
})

test('undoing a rename brings the old id back and its pallets with it', () => {
  const start = state([place('A1.1')], [pallet('p1', 'A1.1')])
  const after = state([place('A1.9', { name: 'A1.9' })], [pallet('p1', 'A1.9')])
  const plan = undoPlan(changeOf(start, after), after)
  assert.equal(plan.ok, true)
  assert.deepEqual(Object.keys(plan.state.locations), ['A1.1'])
  assert.equal(plan.state.pallets.p1.location, 'A1.1')
})

test('a pallet used up on a pick place comes back on undo while its place is free; not when another pallet has taken it', () => {
  const start = state([place('A1.1'), place('H1', { purpose: 'pick', fixedMaterials: ['R162-0717'] })], [pallet('p1', 'A1.1')])
  const after = state(Object.values(start.locations))
  assert.deepEqual(undoPlan(changeOf(start, after), after).state, start)
  const later = clone(after)
  later.pallets.p5 = pallet('p5', 'A1.1') // A1.1 (capacity 1) is now taken by another pallet
  assert.deepEqual(undoPlan(changeOf(start, after), later), { ok: false, conflict: { kind: 'location', id: 'A1.1', reason: 'full' } })
})

test('a move back to a place that was used again is refused when the place is full, with room it goes back', () => {
  // 09:00 Bo moves P from A2.4 to B1.1; 09:20 Lis puts a new pallet on A2.4, which holds one.
  const start = state([place('A2.4'), place('B1.1')], [pallet('P', 'A2.4')])
  const after = state(Object.values(start.locations), [pallet('P', 'B1.1')])
  const change = changeOf(start, after)
  const reused = clone(after)
  reused.pallets.L = pallet('L', 'A2.4')
  assert.deepEqual(undoPlan(change, reused), { ok: false, conflict: { kind: 'location', id: 'A2.4', reason: 'full' } })
  // A place for two (S0) with one new pallet, and a floor with any number, still have room.
  for (const extra of [{ type: 'Bord', capacity: 2 }, { type: 'Gulv', capacity: 0 }]) {
    const roomy = clone(reused)
    roomy.locations['A2.4'] = place('A2.4', extra)
    const plan = undoPlan(change, roomy)
    assert.equal(plan.ok, true, extra.type)
    assert.deepEqual([plan.state.pallets.P.location, plan.state.pallets.L.location], ['A2.4', 'A2.4'])
  }
})

test('a pallet is never put back on a place that has become reserved, a station or inactive since', () => {
  const start = state([place('A2.4'), place('B1.1')], [pallet('P', 'A2.4')])
  const moved = state(Object.values(start.locations), [pallet('P', 'B1.1')])
  const taken = state(Object.values(start.locations))
  for (const after of [moved, taken]) {
    const change = changeOf(start, after)
    for (const [extra, reason] of [[{ purpose: 'reserved' }, 'reserved'], [{ purpose: 'station', fixedMaterials: ['R162-0717'] }, 'station'], [{ active: false }, 'inactive']]) {
      const later = clone(after)
      later.locations['A2.4'] = place('A2.4', extra)
      assert.deepEqual(undoPlan(change, later), { ok: false, conflict: { kind: 'location', id: 'A2.4', reason } }, reason)
    }
  }
})

test('a pallet that stays on its place does not need room there: an edit on a full or deactivated place can be undone', () => {
  const start = state([place('A2.4', { active: false })], [pallet('P', 'A2.4'), pallet('Q', 'A2.4')])
  const after = clone(start)
  after.pallets.P.note = 'Bøjet hjørne'
  const plan = undoPlan(changeOf(start, after), after)
  assert.equal(plan.ok, true)
  assert.equal(plan.state.pallets.P.note, '')
})

test('a place the undo brings back as it was takes its pallets back with it, also when it was deactivated then', () => {
  const start = state([place('A1.1', { active: false })], [pallet('p1', 'A1.1')])
  const after = state([place('A1.9', { name: 'A1.9', active: false })], [pallet('p1', 'A1.9')])
  const plan = undoPlan(changeOf(start, after), after)
  assert.equal(plan.ok, true)
  assert.equal(plan.state.pallets.p1.location, 'A1.1')
})

test('an undo never puts a pallet back on a place that has become a pick place since', () => {
  const start = state([place('A1.1'), place('P1', { purpose: 'pick', fixedMaterials: ['R162-0717'] })], [pallet('p1', 'A1.1')])
  const after = state(Object.values(start.locations)) // p1 was moved onto the pick place P1 and used up there
  const later = clone(after)
  later.locations['A1.1'] = place('A1.1', { purpose: 'pick', fixedMaterials: ['R162-0717'] })
  assert.deepEqual(undoPlan(changeOf(start, after), later), { ok: false, conflict: { kind: 'location', id: 'A1.1' } })
})

test('an unrelated pallet on a missing place (bad data) does not block an undo', () => {
  const start = state([place('A1.1')], [pallet('p1', 'A1.1')])
  const after = state([place('A1.1')], [pallet('p1', 'A1.1', { quantity: 90 })])
  const later = clone(after)
  later.pallets.pX = pallet('pX', 'Z9.9')
  const plan = undoPlan(changeOf(start, after), later)
  assert.equal(plan.ok, true)
  assert.equal(plan.state.pallets.p1.quantity, 100)
})

test('undoing a shelf put is refused when the shelf was deleted or became a pick shelf since', () => {
  const shelf = place('E9 H5', { type: 'Hylde' })
  const line = { id: 'E9 H5|R162-0717', location: 'E9 H5', material: 'R162-0717', quantity: 40 }
  const start = { locations: { 'E9 H5': shelf }, pallets: {}, stock: { [line.id]: line } }
  const after = { locations: { 'E9 H5': shelf }, pallets: {}, stock: { [line.id]: { ...line, quantity: 30 } } }
  const change = changeOf(start, after)
  assert.equal(undoPlan(change, after).ok, true)
  assert.equal(undoPlan(change, after).state.stock[line.id].quantity, 40)
  const deleted = { ...after, locations: {} }
  assert.deepEqual(undoPlan(change, deleted), { ok: false, conflict: { kind: 'location', id: 'E9 H5' } })
  const pick = { ...after, locations: { 'E9 H5': { ...shelf, purpose: 'pick' } } }
  assert.deepEqual(undoPlan(change, pick), { ok: false, conflict: { kind: 'location', id: 'E9 H5' } })
})

test('undoing the creation of a shelf is refused while stock stands on it', () => {
  const start = { locations: {}, pallets: {}, stock: {} }
  const after = { locations: { 'E9 H5': place('E9 H5', { type: 'Hylde' }) }, pallets: {}, stock: {} }
  const later = { ...clone(after), stock: { 'E9 H5|R162-0717': { id: 'E9 H5|R162-0717', location: 'E9 H5', material: 'R162-0717', quantity: 4 } } }
  assert.deepEqual(undoPlan(changeOf(start, after), later), { ok: false, conflict: { kind: 'location', id: 'E9 H5' } })
})

test('an undo never puts a pallet on a lagerhylde, nor leaves stock on a place that is no longer one', () => {
  // A pallet moved X1 → Y1, then X1 became a lagerhylde: undoing the move would put the pallet on the shelf.
  const start = state([place('X1'), place('Y1')], [pallet('p1', 'X1')])
  const after = state([place('X1'), place('Y1')], [pallet('p1', 'Y1')])
  const later = clone(after)
  later.locations.X1 = place('X1', { type: 'Hylde' })
  assert.deepEqual(undoPlan(changeOf(start, after), later), { ok: false, conflict: { kind: 'location', id: 'X1' } })
  // A pick shelf edited to a lagerhylde, then stock put on it: undoing the edit would leave stock on a pick shelf.
  const pick = { locations: { 'E9 H1': place('E9 H1', { type: 'Hylde', purpose: 'pick', fixedMaterials: ['M2'] }) }, pallets: {}, stock: {} }
  const edited = { locations: { 'E9 H1': place('E9 H1', { type: 'Hylde' }) }, pallets: {}, stock: {} }
  const withStock = { ...clone(edited), stock: { 'E9 H1|M2': { id: 'E9 H1|M2', location: 'E9 H1', material: 'M2', quantity: 10 } } }
  assert.deepEqual(undoPlan(changeOf(pick, edited), withStock), { ok: false, conflict: { kind: 'location', id: 'E9 H1' } })
  // A Bord edited to a lagerhylde, a pallet left there before: undoing back to Bord is fine.
  const bord = { locations: { B1: place('B1', { type: 'Bord', capacity: 2 }) }, pallets: {}, stock: {} }
  const shelf = { locations: { B1: place('B1', { type: 'Hylde' }) }, pallets: {}, stock: {} }
  const palletLater = { ...clone(shelf), pallets: { p9: pallet('p9', 'B1') } }
  assert.equal(undoPlan(changeOf(bord, shelf), palletLater).ok, true)
})
