const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { locationKey, areaFromName } = require('./model.cjs')
const { createLocationRepository } = require('./repository.cjs')

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-repo-'))
  const stores = new Map()
  const storeFor = team => { if (!stores.has(team)) stores.set(team, createStore(path.join(root, team))); return stores.get(team) }
  const clock = { now: Date.UTC(2026, 9, 20, 8) }
  let ids = 0
  return { clock, repo: createLocationRepository({ storeFor, now: () => clock.now, newId: () => `id${++ids}` }) }
}

test('locationKey treats case and spaces as the same place', () => {
  assert.equal(locationKey(' a2.4 '), 'A2.4')
  assert.equal(locationKey('Reol  X 1'), 'REOL X 1')
})

test('areaFromName finds the area like the sheet, also for prefixes Sheet2 lacks', () => {
  for (const [name, area] of [['A2.4', 'A'], ['E9 H5', 'E'], ['Reol X 1', 'REOL'], ['CW3', 'CW'], ['Prep1', 'PREP'], ['K12', 'K'], ['F1.0', 'F']]) assert.equal(areaFromName(name), area, name)
})

test('transact writes all changed keys and the events at once; a thrown error writes nothing', async () => {
  const { repo } = setup()
  await repo.transact('TCD', tx => {
    tx.locations['A2.4'] = { id: 'A2.4', name: 'A2.4', area: 'A', type: 'Palle', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '' }
    tx.pallets.p1 = { id: 'p1', location: 'A2.4', material: 'R162-0717', quantity: 1120 }
    tx.event({ type: 'putaway', pallet: 'p1', location: 'A2.4', by: { email: 'anna@x.test', name: 'Anna' } })
  })
  let state = await repo.read('TCD')
  assert.equal(state.locations['A2.4'].area, 'A')
  assert.equal(state.pallets.p1.material, 'R162-0717')
  assert.deepEqual((await repo.history('TCD')).map(event => event.type), ['putaway'])

  await assert.rejects(repo.transact('TCD', tx => {
    delete tx.pallets.p1
    tx.event({ type: 'take', pallet: 'p1' })
    throw Object.assign(new Error('PALLET_GONE'), { code: 'PALLET_GONE' })
  }), { code: 'PALLET_GONE' })
  state = await repo.read('TCD')
  assert.ok(state.pallets.p1, 'nothing written')
  assert.equal((await repo.history('TCD')).length, 1)
  assert.deepEqual((await repo.read('TRR')).pallets, {}, 'teams are apart')
})

test('history is split per month and filtered by location, pallet and material', async () => {
  const { repo, clock } = setup()
  await repo.transact('TCD', tx => tx.event({ type: 'putaway', pallet: 'p1', location: 'A2.4', material: 'R162-0717' }))
  clock.now = Date.UTC(2026, 10, 2, 8)
  await repo.transact('TCD', tx => tx.event({ type: 'take', pallet: 'p2', location: 'C16.2', material: 'INT4300-4921-0' }))
  assert.deepEqual((await repo.history('TCD', { months: 3 })).map(event => event.pallet), ['p2', 'p1'], 'newest first')
  assert.deepEqual((await repo.history('TCD', { location: 'A2.4' })).map(event => event.pallet), ['p1'])
  assert.deepEqual((await repo.history('TCD', { material: 'INT4300-4921-0' })).map(event => event.pallet), ['p2'])
  assert.deepEqual((await repo.history('TCD', { pallet: 'p1' })).map(event => event.type), ['putaway'])
})

// A second "PC" on the same folder, for undo races.
function secondPc(root, clock) {
  const stores = new Map()
  const storeFor = team => { if (!stores.has(team)) stores.set(team, createStore(path.join(root, team))); return stores.get(team) }
  let ids = 1000
  return createLocationRepository({ storeFor, now: () => clock.now, newId: () => `pc2-${++ids}` })
}
const ANNA = { email: 'anna@x.test', name: 'Anna' }
const MONA = { email: 'mona@x.test', name: 'Mona' }
const place = id => ({ id, name: id, area: 'A', type: 'Palle', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '' })
const putPallet = (repo, id, extra = {}) => repo.transact('TCD', { actionId: `act-${id}` }, tx => {
  tx.pallets[id] = { id, location: 'A2.4', material: 'R162-0717', quantity: 100, ...extra }
  tx.event({ type: 'putaway', by: ANNA, pallet: id, location: 'A2.4', material: 'R162-0717', quantity: 100 })
})

test('a transaction records one tx id on all its events and the change on the first', async () => {
  const { repo } = setup()
  await repo.transact('TCD', tx => { tx.locations['A2.4'] = place('A2.4') })
  await repo.transact('TCD', { actionId: 'act-1' }, tx => {
    tx.pallets.p1 = { id: 'p1', location: 'A2.4', material: 'R162-0717', quantity: 1 }
    tx.pallets.p2 = { id: 'p2', location: 'A2.4', material: 'R162-0717', quantity: 2 }
    tx.event({ type: 'putaway', by: ANNA, pallet: 'p1' })
    tx.event({ type: 'putaway', by: ANNA, pallet: 'p2' })
  })
  const events = (await repo.history('TCD', { type: 'putaway' })).reverse()
  assert.deepEqual(events.map(event => [event.tx, event.actionId]), [['act-1', 'act-1'], ['act-1', 'act-1']])
  assert.deepEqual(Object.keys(events[0].change.after.pallets).sort(), ['p1', 'p2'])
  assert.equal(events[0].change.before.pallets.p1, null)
  assert.equal(events[1].change, undefined, 'the change is written once per action')
  await repo.transact('TCD', { snapshot: false }, tx => { tx.pallets = {}; tx.event({ type: 'import', by: MONA }) })
  assert.equal((await repo.history('TCD', { type: 'import' }))[0].change, undefined, 'no snapshot for an import')
})

test('undo restores the state, marks the events and logs the undo', async () => {
  const { repo, clock } = setup()
  await repo.transact('TCD', tx => { tx.locations['A2.4'] = place('A2.4') })
  await putPallet(repo, 'p1')
  const [put] = await repo.history('TCD', { type: 'putaway' })
  clock.now += 60000
  assert.deepEqual(await repo.undo('TCD', { tx: put.tx, at: put.at, by: MONA, actionId: 'undo-1' }), { undone: 1 })
  assert.equal((await repo.read('TCD')).pallets.p1, undefined)
  const [undo, marked] = await repo.history('TCD', { months: 1 })
  assert.deepEqual([undo.type, undo.undoes, undo.by.name, undo.pallet], ['undo', put.tx, 'Mona', 'p1'])
  assert.deepEqual([marked.id, marked.undoneAt, marked.undoneBy.name], [put.id, clock.now, 'Mona'])
  assert.deepEqual(await repo.undo('TCD', { tx: put.tx, at: put.at, by: MONA, actionId: 'undo-1' }), { duplicate: true }, 'the same undo action is applied once')
})

test('undo is refused when something changed since, when already undone, for import and for old events', async () => {
  const { repo } = setup()
  await repo.transact('TCD', tx => { tx.locations['A2.4'] = place('A2.4') })
  await putPallet(repo, 'p1')
  const [put] = await repo.history('TCD', { type: 'putaway' })
  await repo.transact('TCD', tx => { tx.pallets.p1.quantity = 40; tx.event({ type: 'take', by: ANNA, pallet: 'p1' }) })
  await assert.rejects(repo.undo('TCD', { tx: put.tx, at: put.at, by: MONA }), error => error.code === 'UNDO_CONFLICT' && error.conflict.id === 'p1')
  const [take] = await repo.history('TCD', { type: 'take' })
  await repo.undo('TCD', { tx: take.tx, at: take.at, by: MONA })
  await assert.rejects(repo.undo('TCD', { tx: take.tx, at: take.at, by: MONA }), { code: 'UNDO_ALREADY' })
  const [undo] = await repo.history('TCD', { type: 'undo' })
  await assert.rejects(repo.undo('TCD', { tx: undo.tx, at: undo.at, by: MONA }), { code: 'UNDO_NOT_POSSIBLE' }, 'an undo cannot be undone')
  await repo.transact('TCD', { snapshot: false }, tx => tx.event({ type: 'import', by: MONA }))
  const [imported] = await repo.history('TCD', { type: 'import' })
  await assert.rejects(repo.undo('TCD', { tx: imported.tx, at: imported.at, by: MONA }), { code: 'UNDO_NOT_POSSIBLE' })
  await assert.rejects(repo.undo('TCD', { tx: 'nope', at: put.at, by: MONA }), { code: 'UNDO_NOT_FOUND' })
})

test('two PCs undo the same action at once: one succeeds, the other gets UNDO_ALREADY', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-repo-'))
  const clock = { now: Date.UTC(2026, 9, 20, 8) }
  const pc1 = secondPc(root, clock)
  const pc2 = secondPc(root, clock)
  await pc1.transact('TCD', tx => { tx.locations['A2.4'] = place('A2.4') })
  await putPallet(pc1, 'p1')
  const [put] = await pc1.history('TCD', { type: 'putaway' })
  const results = await Promise.allSettled([pc1.undo('TCD', { tx: put.tx, at: put.at, by: MONA }), pc2.undo('TCD', { tx: put.tx, at: put.at, by: ANNA })])
  assert.deepEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected'])
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'UNDO_ALREADY')
  assert.equal((await pc1.history('TCD', { type: 'undo' })).length, 1)
})

test('an undo of an event from last month locks and marks that month', async () => {
  const { repo, clock } = setup()
  await repo.transact('TCD', tx => { tx.locations['A2.4'] = place('A2.4') })
  await putPallet(repo, 'p1')
  const [put] = await repo.history('TCD', { type: 'putaway' })
  clock.now = Date.UTC(2026, 10, 2, 8)
  await repo.undo('TCD', { tx: put.tx, at: put.at, by: MONA })
  const events = await repo.history('TCD', { months: 2 })
  assert.equal(events.find(event => event.id === put.id).undoneBy.name, 'Mona', 'October is marked')
  assert.equal(new Date(events.find(event => event.type === 'undo').at).getUTCMonth(), 10, 'the undo is in November')
})

test('history filters by person, type and since', async () => {
  const { repo, clock } = setup()
  await repo.transact('TCD', tx => tx.event({ type: 'putaway', by: ANNA, pallet: 'p1' }))
  clock.now += 3600000
  await repo.transact('TCD', tx => tx.event({ type: 'take', by: MONA, pallet: 'p1' }))
  assert.deepEqual((await repo.history('TCD', { person: 'ANNA@x.test' })).map(event => event.type), ['putaway'])
  assert.deepEqual((await repo.history('TCD', { type: 'take' })).map(event => event.by.name), ['Mona'])
  assert.deepEqual((await repo.history('TCD', { since: clock.now - 1000 })).map(event => event.type), ['take'])
})

test('a stock change is written, recorded and undone like pallets', async () => {
  const { repo } = setup()
  assert.deepEqual((await repo.read('TCD')).stock, {})
  await repo.transact('TCD', tx => {
    tx.locations['E9 H5'] = { id: 'E9 H5', name: 'E9 H5', area: 'E', type: 'Hylde', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '', rack: 'E9', shelf: 5 }
  })
  await repo.transact('TCD', tx => {
    tx.stock['E9 H5|R162-0717'] = { id: 'E9 H5|R162-0717', location: 'E9 H5', material: 'R162-0717', quantity: 40 }
    tx.event({ type: 'shelf-put', location: 'E9 H5', material: 'R162-0717', quantity: 40 })
  })
  assert.equal((await repo.read('TCD')).stock['E9 H5|R162-0717'].quantity, 40)
  const put = (await repo.history('TCD')).find(event => event.type === 'shelf-put')
  assert.equal(put.change.after.stock['E9 H5|R162-0717'].quantity, 40)
  assert.deepEqual(await repo.undo('TCD', { eventId: put.id, by: { email: 'a@x', name: 'A' } }), { undone: 1 })
  assert.deepEqual((await repo.read('TCD')).stock, {})
})

// One team's drawing, step by step: the tests build on each other.
test.describe('the drawing keys', () => {
  const { repo } = setup()
  const MONA_REF = MONA
  const layout = { version: 0, hall: { w: 60000, h: 30000 }, notes: '', items: [] }
  const draft = { ...layout, basedOn: 0, editedBy: MONA_REF, editedAt: Date.UTC(2026, 9, 20, 7), decisions: { outside: [], remove: [] } }

  test('readLayout is empty before anything is drawn', async () => assert.deepEqual(await repo.readLayout('TCD'), { layout: null, draft: null, versions: [] }))
  test('writeDraft keeps the draft apart from the places', async () => {
    await repo.writeDraft('TCD', () => draft)
    assert.deepEqual((await repo.readLayout('TCD')).draft, draft)
    assert.equal((await repo.read('TCD')).meta.changedAt, undefined)
    await repo.writeDraft('TCD', () => null)
    assert.equal((await repo.readLayout('TCD')).draft, null)
  })
  test('writeDraft writes nothing when fn returns undefined', async () => {
    await repo.writeDraft('TCD', () => draft)
    assert.deepEqual(await repo.writeDraft('TCD', () => {}), draft)
    assert.deepEqual((await repo.readLayout('TCD')).draft, draft)
    await repo.writeDraft('TCD', () => null)
  })
  test('transact withLayout writes the drawing, its versions and clears the draft in one go', async () => {
    await repo.writeDraft('TCD', () => draft)
    await repo.transact('TCD', { withLayout: true, snapshot: false }, tx => { tx.layout = { ...layout, version: 1 }; tx.layoutVersions = []; tx.draft = null; tx.event({ type: 'layout', by: MONA_REF }) })
    const after = await repo.readLayout('TCD')
    assert.equal(after.layout.version, 1); assert.equal(after.draft, null)
    assert.ok((await repo.read('TCD')).meta.changedAt)
  })
  test('a drawing publish cannot be undone', async () => {
    const [event] = await repo.history('TCD', { type: 'layout' })
    await assert.rejects(repo.undo('TCD', { eventId: event.id, by: MONA_REF }), { code: 'UNDO_NOT_POSSIBLE' })
  })
  test('a drawing publish that recorded a change of the places still cannot be undone', async () => {
    await repo.transact('TCD', { withLayout: true }, tx => { tx.locations['A2.4'] = place('A2.4'); tx.layout = { ...layout, version: 2 }; tx.event({ type: 'layout', by: MONA_REF }) })
    const [event] = await repo.history('TCD', { type: 'layout' })
    assert.ok(event.change)
    await assert.rejects(repo.undo('TCD', { eventId: event.id, by: MONA_REF }), { code: 'UNDO_NOT_POSSIBLE' })
  })
  test('transact without withLayout has no layout on tx', async () => repo.transact('TCD', tx => assert.equal(tx.layout, undefined)))
})
