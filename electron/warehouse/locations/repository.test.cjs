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
  return { clock, storeFor, repo: createLocationRepository({ storeFor, now: () => clock.now, newId: () => `id${++ids}` }) }
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

test('a daily action locks only what it writes, the places, meta and the history; changing another key writes nothing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-repo-'))
  const store = createStore(root)
  const locks = []
  const spied = { ...store, withLockedKeysAsync: (keys, fn) => { locks.push([...keys].sort()); return store.withLockedKeysAsync(keys, fn) } }
  const repo = createLocationRepository({ storeFor: () => spied, now: () => Date.UTC(2026, 9, 20, 8), newId: () => `id${locks.length}` })
  await repo.transact('TCD', tx => {
    tx.locations['A2.4'] = { id: 'A2.4', name: 'A2.4', type: 'Palle', purpose: 'reserve' }
    tx.stock['E9 H1|M1'] = { id: 'E9 H1|M1', location: 'E9 H1', material: 'M1', quantity: 3 }
    tx.tags = ['Brandskab']
  })
  assert.deepEqual(locks[0], ['history-2026-10', 'locations', 'meta', 'pallets', 'stock', 'tags', 'tx-pending'], 'without `writes` every key is locked')

  const result = await repo.transact('TCD', { actionId: 'a1', writes: ['pallets'] }, tx => {
    assert.deepEqual([tx.locations['A2.4'].name, tx.stock['E9 H1|M1'].quantity, tx.tags], ['A2.4', 3, ['Brandskab']], 'the other keys are read as they are')
    tx.pallets.p1 = { id: 'p1', location: 'A2.4', material: 'M1', quantity: 1 }
    tx.event({ type: 'putaway', pallet: 'p1', location: 'A2.4' })
    return 'done'
  })
  assert.equal(result, 'done')
  assert.deepEqual(locks[1], ['history-2026-10', 'locations', 'meta', 'pallets', 'tx-pending'])
  assert.equal(await store.getAsync('tx-pending'), undefined, 'the journal is gone once the action is written')
  const state = await repo.read('TCD')
  assert.deepEqual([state.pallets.p1.location, state.meta.applied], ['A2.4', ['a1']])
  assert.ok((await repo.history('TCD'))[0].change, 'the change is still recorded for undo')

  await assert.rejects(repo.transact('TCD', { actionId: 'a2', writes: ['pallets'] }, tx => {
    delete tx.pallets.p1
    tx.stock['E9 H1|M1'].quantity = 0
    tx.event({ type: 'take', pallet: 'p1' })
  }), /KV_INVALID_OPERATION/)
  const after = await repo.read('TCD')
  assert.ok(after.pallets.p1, 'nothing written')
  assert.deepEqual([after.stock['E9 H1|M1'].quantity, after.meta.applied], [3, ['a1']])
  assert.equal((await repo.history('TCD')).length, 1)
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

test('an undo by event id with its time locks only that month and the current one', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-repo-'))
  const store = createStore(root)
  const locks = []
  const spied = { ...store, withLockedKeysAsync: (keys, fn) => { locks.push([...new Set(keys.filter(key => key.startsWith('history-')))].sort()); return store.withLockedKeysAsync(keys, fn) } }
  const clock = { now: Date.UTC(2026, 9, 20, 8) }
  let ids = 0
  const repo = createLocationRepository({ storeFor: () => spied, now: () => clock.now, newId: () => `id${++ids}` })
  await repo.transact('TCD', tx => { tx.locations['A2.4'] = place('A2.4') })
  await putPallet(repo, 'p1')
  await putPallet(repo, 'p2')
  const [second, first] = await repo.history('TCD', { type: 'putaway' })
  clock.now = Date.UTC(2026, 11, 2, 8)
  locks.length = 0
  assert.deepEqual(await repo.undo('TCD', { eventId: first.id, at: first.at, by: MONA }), { undone: 1 })
  assert.deepEqual(locks, [['history-2026-10', 'history-2026-12']])
  locks.length = 0
  assert.deepEqual(await repo.undo('TCD', { eventId: second.id, by: MONA }), { undone: 1 }, 'without the time the recent months are searched')
  assert.deepEqual(locks, [['history-2026-09', 'history-2026-10', 'history-2026-11', 'history-2026-12']])
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

// M: drops while a transaction replaces its files: the rename of `file` fails once (the files before it are written).
// `landed`: the rename reached M:, only the answer was lost.
const dropAt = (t, file, { landed = false } = {}) => {
  const rename = fs.promises.rename
  let armed = true
  t.mock.method(fs.promises, 'rename', async (from, to) => {
    if (!armed || path.basename(String(to)) !== file) return rename(from, to)
    armed = false
    if (landed) await rename(from, to)
    throw Object.assign(new Error('EIO: M: er væk'), { code: 'EIO' })
  })
}
const takeTen = (repo, actionId, id = 'p1') => repo.transact('TCD', { actionId, writes: ['pallets'] }, tx => {
  tx.pallets[id].quantity -= 10
  tx.event({ type: 'take', by: ANNA, pallet: id, location: 'A2.4', material: 'R162-0717', quantity: 10 })
})
// What a 1.6.6/1.6.7 Hub does: the same keys under the same locks, without knowing the journal.
const oldHub = (store, actionId, change) => store.withLockedKeysAsync(['history-2026-10', 'locations', 'meta', 'pallets'], locked => {
  const pallets = locked.get('pallets') || {}
  change(pallets)
  locked.set('pallets', pallets)
  const meta = locked.get('meta') || {}
  locked.set('meta', { ...meta, applied: [...(meta.applied || []), actionId], changedAt: Date.UTC(2026, 9, 20, 9) })
  locked.set('history-2026-10', [...(locked.get('history-2026-10') || []), { id: `e-${actionId}`, at: Date.UTC(2026, 9, 20, 9), tx: actionId, actionId, type: 'edit-pallet', by: MONA }])
})
const seeded = async () => {
  const context = setup()
  await context.repo.transact('TCD', tx => { tx.locations['A2.4'] = place('A2.4'); tx.locations['A2.5'] = place('A2.5') })
  await putPallet(context.repo, 'p1')
  await putPallet(context.repo, 'p2', { location: 'A2.5' })
  return { ...context, store: context.storeFor('TCD') }
}

test('an action M: dropped before its log line is finished by the next action: the line is there, the replay is recognised and it can be undone', async t => {
  const { repo, store } = await seeded()
  dropAt(t, 'history-2026-10.json')
  await assert.rejects(takeTen(repo, 'take-1'), { code: 'EIO' })
  t.mock.restoreAll()
  await takeTen(repo, 'take-2', 'p2')
  const [take] = await repo.history('TCD', { type: 'take', pallet: 'p1' })
  assert.equal(take?.actionId, 'take-1', 'the log line of the dropped action is there')
  assert.deepEqual(await takeTen(repo, 'take-1'), { duplicate: true })
  const state = await repo.read('TCD')
  assert.deepEqual([state.pallets.p1.quantity, state.pallets.p2.quantity], [90, 90])
  assert.deepEqual(await repo.undo('TCD', { eventId: take.id, by: MONA, actionId: 'undo-1' }), { undone: 1 })
  assert.equal((await repo.read('TCD')).pallets.p1.quantity, 100)
  assert.equal(await store.getAsync('tx-pending', { skipCache: true }), undefined)
})

test('a dropped action is finished once however often M: drops again, also when a rename landed but its answer was lost', async t => {
  const { repo, store } = await seeded()
  dropAt(t, 'meta.json')
  await assert.rejects(takeTen(repo, 'take-1'), { code: 'EIO' })
  t.mock.restoreAll()
  dropAt(t, 'meta.json', { landed: true })
  await assert.rejects(takeTen(repo, 'take-2'), { code: 'EIO' })
  t.mock.restoreAll()
  dropAt(t, 'pallets.json')
  await assert.rejects(takeTen(repo, 'take-3', 'p2'), { code: 'EIO' })
  t.mock.restoreAll()
  for (const actionId of ['take-1', 'take-2']) assert.deepEqual(await takeTen(repo, actionId), { duplicate: true }, actionId)
  assert.deepEqual(await takeTen(repo, 'take-3', 'p2'), { duplicate: true }, 'its journal was on M:, so the action is done')
  const state = await repo.read('TCD')
  assert.deepEqual([state.pallets.p1.quantity, state.pallets.p2.quantity], [80, 90])
  assert.deepEqual((await repo.history('TCD', { type: 'take' })).map(event => event.actionId).sort(), ['take-1', 'take-2', 'take-3'])
  assert.deepEqual(state.meta.applied.filter(id => id.startsWith('take-')), ['take-1', 'take-2', 'take-3'])
  assert.equal(await store.getAsync('tx-pending', { skipCache: true }), undefined)
})

test('an older Hub that wrote after the drop is never overwritten by the leftover journal', async t => {
  const { repo, store } = await seeded()
  dropAt(t, 'pallets.json')
  await assert.rejects(takeTen(repo, 'take-1'), { code: 'EIO' })
  t.mock.restoreAll()
  const warn = t.mock.method(console, 'warn', () => {})
  assert.ok(await store.getAsync('tx-pending', { skipCache: true }), 'the journal is on M:, nothing else of the action')
  await oldHub(store, 'old-1', pallets => { pallets.p1.quantity = 55 })
  await takeTen(repo, 'take-2', 'p2')
  const state = await repo.read('TCD')
  assert.deepEqual([state.pallets.p1.quantity, state.pallets.p2.quantity], [55, 90], 'the older Hub\'s count stands')
  assert.equal((await repo.history('TCD', { type: 'take', pallet: 'p1' })).length, 0, 'the dropped action is not logged as done')
  assert.equal(await store.getAsync('tx-pending', { skipCache: true }), undefined, 'the journal is given up')
  assert.equal(warn.mock.callCount(), 1, 'and that is logged')
})

test('an older Hub that wrote after a drop behind the log line: the action is recorded as done, its write stands', async t => {
  const { repo, store } = await seeded()
  dropAt(t, 'meta.json')
  await assert.rejects(takeTen(repo, 'take-1'), { code: 'EIO' })
  t.mock.restoreAll()
  await oldHub(store, 'old-1', pallets => { pallets.p2.note = 'Bøjet hjørne' })
  assert.deepEqual(await takeTen(repo, 'take-1'), { duplicate: true })
  const state = await repo.read('TCD')
  assert.deepEqual([state.pallets.p1.quantity, state.pallets.p2.note], [90, 'Bøjet hjørne'])
  assert.deepEqual(state.meta.applied.slice(-2), ['old-1', 'take-1'])
})

test('an undo finishes a leftover journal first, also when it is refused, and a dropped undo is applied once', async t => {
  const { repo, clock, store } = await seeded()
  const [put] = await repo.history('TCD', { type: 'putaway', pallet: 'p1' })
  dropAt(t, 'history-2026-10.json')
  await assert.rejects(takeTen(repo, 'take-1'), { code: 'EIO' })
  t.mock.restoreAll()
  clock.now += 60000
  await assert.rejects(repo.undo('TCD', { eventId: put.id, by: MONA, actionId: 'undo-put' }), { code: 'UNDO_CONFLICT' })
  const [take] = await repo.history('TCD', { type: 'take' })
  assert.equal(take?.actionId, 'take-1', 'the journal was finished although the undo was refused')
  assert.equal(await store.getAsync('tx-pending', { skipCache: true }), undefined)
  dropAt(t, 'meta.json')
  await assert.rejects(repo.undo('TCD', { eventId: take.id, by: MONA, actionId: 'undo-take' }), { code: 'EIO' })
  t.mock.restoreAll()
  assert.deepEqual(await repo.undo('TCD', { eventId: take.id, by: MONA, actionId: 'undo-take' }), { duplicate: true })
  assert.equal((await repo.read('TCD')).pallets.p1.quantity, 100)
  assert.equal((await repo.history('TCD', { type: 'undo' })).length, 1)
  assert.equal((await repo.history('TCD')).find(event => event.id === take.id).undoneBy.name, 'Mona')
})

test('a leftover journal with keys the next action does not lock is finished on its own first', async t => {
  const { repo, clock } = await seeded()
  await repo.transact('TCD', tx => { tx.locations['E9 H5'] = { ...place('E9 H5'), type: 'Hylde', rack: 'E9', shelf: 5 } })
  dropAt(t, 'history-2026-10.json')
  await assert.rejects(repo.transact('TCD', { actionId: 'shelf-1', writes: ['stock'] }, tx => {
    tx.stock['E9 H5|R162-0717'] = { id: 'E9 H5|R162-0717', location: 'E9 H5', material: 'R162-0717', quantity: 40 }
    tx.event({ type: 'shelf-put', by: ANNA, location: 'E9 H5', material: 'R162-0717', quantity: 40 })
  }), { code: 'EIO' })
  t.mock.restoreAll()
  clock.now = Date.UTC(2026, 10, 2, 8)
  await takeTen(repo, 'take-1')
  const state = await repo.read('TCD')
  assert.deepEqual([state.stock['E9 H5|R162-0717'].quantity, state.pallets.p1.quantity], [40, 90])
  assert.deepEqual((await repo.history('TCD', { months: 2 })).filter(event => event.actionId).map(event => event.actionId).sort(), ['act-p1', 'act-p2', 'shelf-1', 'take-1'])
  assert.ok(state.meta.applied.includes('shelf-1'))
})

test('a leftover drawing publish is finished on its own, and a draft the admin saved since is kept', async t => {
  const { repo } = setup()
  const layout = { version: 0, hall: { w: 60000, h: 30000 }, notes: '', items: [] }
  await repo.writeDraft('TCD', () => ({ ...layout, basedOn: 0, editedBy: MONA }))
  dropAt(t, 'layout.json')
  await assert.rejects(repo.transact('TCD', { withLayout: true, snapshot: false }, tx => {
    tx.layout = { ...layout, version: 1 }; tx.draft = null; tx.event({ type: 'layout', by: MONA })
  }), { code: 'EIO' })
  t.mock.restoreAll()
  const later = { ...layout, notes: 'Ny kladde', basedOn: 0, editedBy: MONA }
  await repo.writeDraft('TCD', () => later)
  await repo.transact('TCD', tx => { tx.locations['A2.4'] = place('A2.4') })
  const after = await repo.readLayout('TCD')
  assert.deepEqual([after.layout?.version, after.draft], [1, later])
  assert.equal((await repo.history('TCD', { type: 'layout' })).length, 1)
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
