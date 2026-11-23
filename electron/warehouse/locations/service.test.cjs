const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { createLocationRepository } = require('./repository.cjs')
const { createLocationService } = require('./service.cjs')
const { createOutbox, QUEUED_METHODS } = require('./outbox.cjs')

const ANNA = { email: 'anna@x.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const BO = { email: 'bo@x.test', fullName: 'Bo', role: 'user', team: 'TCD' }
const ADA = { email: 'ada@x.test', fullName: 'Ada', role: 'user', team: 'TCD' }
const TRR = { email: 'tina@x.test', fullName: 'Tina', role: 'user', team: 'TRR' }
const day = (y, m, d) => Date.UTC(y, m - 1, d)
const place = (name, extra = {}) => ({ id: name, name, area: name.replace(/[\d. ].*$/, ''), type: 'Palle', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '', ...extra })

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-service-'))
  const clock = { now: day(2026, 10, 20) }
  let ids = 0
  const learned = []
  const missing = []
  const catalog = {
    describe: async materials => Object.fromEntries(materials.map(material => [material, { 'R162-0717': 'Ethernet Cable RJ45 2m', 'INT4300-4921-0': 'SmartPOS N950' }[material]]).filter(([, text]) => text)),
    learn: async entries => { learned.push(...entries) },
    describeMissing: async materials => { missing.push(materials) },
  }
  const fetcher = { fetchMatdoc: async ({ document }) => ({ document: /^\d{10}$/.test(document) ? `${document} 2026` : document, transaction: 'ZMS_REP', rows: [{ serial: 'N1', material: 'INT4300-4921-0', description: 'SmartPOS N950' }, { serial: 'N2', material: 'INT4300-4921-0', description: 'SmartPOS N950' }] }) }
  // One store per "PC", both on the same folder, like two Hubs on M:.
  const service = () => {
    const stores = new Map()
    const storeFor = team => { if (!stores.has(team)) stores.set(team, createStore(path.join(root, team))); return stores.get(team) }
    const repo = createLocationRepository({ storeFor, now: () => clock.now, newId: () => `id${++ids}` })
    return { repo, service: createLocationService({ repo, catalog, fetcher, isLocationAdmin: async user => user.role === 'manager' || user.email === 'ada@x.test', now: () => clock.now, newId: () => `id${++ids}` }) }
  }
  const pc1 = service()
  const seed = async (locations, pallets = []) => pc1.repo.transact('TCD', tx => {
    for (const location of locations) tx.locations[location.id] = location
    for (const pallet of pallets) tx.pallets[pallet.id] = { document: null, serials: [], sloc: 'D000', tags: [], note: '', createdAt: pallet.receivedAt, ...pallet }
  })
  return { clock, learned, missing, pc1, pc2: service(), seed }
}

test('a daily action locks only what it changes (pallets or shelf stock), the places, meta and the month on M:', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-service-'))
  const store = createStore(root)
  const locks = []
  const spied = { ...store, withLockedKeysAsync: (keys, fn) => { locks.push([...new Set(keys)].sort()); return store.withLockedKeysAsync(keys, fn) } }
  let ids = 0
  const repo = createLocationRepository({ storeFor: () => spied, now: () => day(2026, 10, 20), newId: () => `id${++ids}` })
  const service = createLocationService({ repo, catalog: { describe: async () => ({}) }, fetcher: {}, isLocationAdmin: async user => user.email === 'ada@x.test', now: () => day(2026, 10, 20), newId: () => `id${++ids}` })
  await repo.transact('TCD', tx => { tx.locations['C16.2'] = place('C16.2'); tx.locations['E9 H1'] = place('E9 H1', { type: 'Hylde', rack: 'E9', shelf: 1 }); tx.meta.shelvesMigratedAt = 1 })
  locks.length = 0
  const { created: [pallet] } = await service.putAway(ANNA, { pallets: [{ location: 'C16.2', material: 'R162-0717', quantity: 5 }], actionId: 'a1' })
  await service.changeSloc(ANNA, { pallet: pallet.id, sloc: 'D004', actionId: 'a2' })
  await service.shelfPut(ANNA, { location: 'E9 H1', material: 'R162-0717', quantity: 3, actionId: 'a3' })
  assert.deepEqual(locks, [
    ['history-2026-10', 'locations', 'meta', 'pallets', 'tx-pending'],
    ['history-2026-10', 'locations', 'meta', 'pallets', 'tx-pending'],
    ['history-2026-10', 'locations', 'meta', 'stock', 'tx-pending'],
  ])
  const [put] = await repo.history('TCD', { type: 'shelf-put' })
  locks.length = 0
  assert.deepEqual(await service.undo(ADA, { eventId: put.id, at: put.at }), { undone: 1 })
  assert.deepEqual(locks, [['history-2026-10', 'locations', 'meta', 'pallets', 'stock', 'tags', 'tx-pending']], 'an undo with the event time locks only its month')
})

test('a whole goods receipt is put away in one go; a pallet on a pick place is used up there', async () => {
  const { pc1, seed } = setup()
  await seed([place('C16.2'), place('C16.3'), place('H26', { purpose: 'pick', type: 'Hylde', fixedMaterials: ['R162-0717'] })])
  const { created, filled } = await pc1.service.putAway(ANNA, { pallets: [
    { location: 'c16.2', material: 'INT4300-4921-0', quantity: 120, document: '5000032337 2026 0001', serials: ['N1'] },
    { location: 'C16.3', material: 'INT4300-4921-0', quantity: 120 },
    { location: 'H26', material: 'R162-0717', quantity: 40 },
  ] })
  assert.equal(created.length, 2)
  assert.deepEqual(filled, ['H26'], 'the pick place is filled, no pallet is kept there')
  assert.equal(created[0].location, 'C16.2', 'the place is found however it is typed')
  assert.equal(created[0].sloc, 'D000')
  const state = await pc1.repo.read('TCD')
  assert.equal(Object.keys(state.pallets).length, 2)
  assert.equal(state.pick, undefined, 'pick places have no status')
  assert.deepEqual((await pc1.repo.history('TCD')).map(event => event.type).sort(), ['putaway', 'putaway', 'putaway'])
})

test('a full, reserved or inactive place is refused on putAway', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1'), place('A17.1', { purpose: 'reserved' }), place('A9.9', { active: false })], [{ id: 'p1', location: 'A2.1', material: 'X', quantity: 1, receivedAt: 1 }])
  await assert.rejects(pc1.service.putAway(ANNA, { pallets: [{ location: 'A2.1', material: 'X', quantity: 1 }] }), { code: 'LOCATION_FULL' })
  await assert.rejects(pc1.service.putAway(ANNA, { pallets: [{ location: 'A17.1', material: 'X', quantity: 1 }] }), { code: 'LOCATION_RESERVED' })
  await assert.rejects(pc1.service.putAway(ANNA, { pallets: [{ location: 'A9.9', material: 'X', quantity: 1 }] }), { code: 'LOCATION_INACTIVE' })
  await assert.rejects(pc1.service.putAway(ANNA, { pallets: [{ location: 'Z1', material: 'X', quantity: 1 }] }), { code: 'LOCATION_NOT_FOUND' })
})

test('take: whole pallet, X pcs, X >= quantity takes all, X <= 0 or 1.5 is QUANTITY_INVALID', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1'), place('A2.4')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: day(2024, 11, 7) }, { id: 'p2', location: 'A2.4', material: 'R162-0717', quantity: 50, receivedAt: day(2024, 11, 18) }])
  assert.equal((await pc1.service.take(ANNA, { pallet: 'p1', quantity: 30 })).pallet.quantity, 70)
  for (const quantity of [0, -1, 1.5, 'x']) await assert.rejects(pc1.service.take(ANNA, { pallet: 'p1', quantity }), { code: 'QUANTITY_INVALID' }, String(quantity))
  assert.equal((await pc1.service.take(ANNA, { pallet: 'p1', quantity: 70 })).pallet, null)
  assert.equal((await pc1.service.take(ANNA, { pallet: 'p2' })).pallet, null)
  assert.deepEqual((await pc1.repo.read('TCD')).pallets, {})
  const takes = (await pc1.repo.history('TCD')).filter(event => event.type === 'take').map(event => event.quantity).sort((a, b) => a - b)
  assert.deepEqual(takes, [30, 50, 70])
})

test('a pallet with an unknown quantity stays on its place after a take or refill of some pieces; only "take all" removes it', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.4'), place('H26', { purpose: 'pick', type: 'Hylde', fixedMaterials: ['R162-0717'] })], [{ id: 'p1', location: 'A2.4', material: 'R162-0717', quantity: null, receivedAt: 1 }])
  const taken = await pc1.service.take(ANNA, { pallet: 'p1', quantity: 5 })
  assert.equal(taken.pallet.id, 'p1')
  assert.equal(taken.pallet.quantity, null, 'the quantity stays unknown')
  const refilled = await pc1.service.refill(ANNA, { location: 'H26', pallet: 'p1', quantity: 20 })
  assert.equal(refilled.pallet.quantity, null)
  assert.deepEqual((await pc1.repo.read('TCD')).pallets.p1, { id: 'p1', location: 'A2.4', material: 'R162-0717', quantity: null, receivedAt: 1, document: null, serials: [], sloc: 'D000', tags: [], note: '', createdAt: 1 }, 'the pallet is unchanged')
  await assert.rejects(pc1.service.putAway(ANNA, { pallets: [{ location: 'A2.4', material: 'X', quantity: 1 }] }), { code: 'LOCATION_FULL' }, 'the place is still taken')
  assert.equal((await pc1.service.take(ANNA, { pallet: 'p1' })).pallet, null)
  assert.deepEqual((await pc1.repo.read('TCD')).pallets, {})
  const log = (await pc1.repo.history('TCD')).filter(event => event.type === 'take' || event.type === 'refill').sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  assert.deepEqual(log.map(event => `${event.type}:${event.pallet}:${event.quantity}`), ['take:p1:5', 'refill:p1:20', 'take:p1:null'], 'the log has the pieces taken')
  const line = (await pc1.service.log(ADA, {})).events.find(event => event.type === 'take' && event.quantity === 5)
  assert.deepEqual([line.canUndo, line.reason], [false, 'Pallens antal er ukendt, så der er intet at fortryde'], 'nothing was changed, and the log says why')
})

test('a take of some pieces from a pallet with an unknown quantity is never named as what blocks an undo', async () => {
  const { clock, pc1, seed } = setup()
  const TOM = { email: 'tom@x.test', fullName: 'Tom', role: 'user', team: 'TCD' }
  await seed([place('A2.4')])
  const { created: [pallet] } = await pc1.service.putAway(ANNA, { actionId: 'a1', pallets: [{ location: 'A2.4', material: 'R162-0717' }] })
  clock.now += 60000
  await pc1.service.editPallet(TOM, { actionId: 'a2', pallet: pallet.id, changes: { note: 'Bøjet hjørne' } })
  clock.now += 60000
  await pc1.service.take(BO, { actionId: 'a3', pallet: pallet.id, quantity: 5 })
  const put = (await pc1.service.log(ADA, {})).events.find(event => event.type === 'putaway')
  assert.match(put.reason, /Tom rettede pallen.*fortryd den først/)
  await assert.rejects(pc1.service.undo(ADA, { eventId: put.id }), error => error.code === 'UNDO_CONFLICT' && /Tom rettede pallen.*fortryd den først/.test(error.message))
})

test('two people take the same pallet: the first wins, the second gets PALLET_GONE and nothing is counted twice', async () => {
  const { pc1, pc2, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  const results = await Promise.allSettled([pc1.service.take(ANNA, { pallet: 'p1' }), pc2.service.take(BO, { pallet: 'p1' })])
  assert.deepEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected'])
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'PALLET_GONE')
  assert.equal((await pc1.repo.history('TCD')).filter(event => event.type === 'take').length, 1)
})

test('taking a younger pallet works but returns the older one for the warning', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1'), place('A2.4')], [{ id: 'old', location: 'A2.1', material: 'R162-0717', quantity: 10, receivedAt: day(2024, 11, 7) }, { id: 'young', location: 'A2.4', material: 'R162-0717', quantity: 10, receivedAt: day(2025, 1, 1) }])
  const result = await pc1.service.take(ANNA, { pallet: 'young' })
  assert.equal(result.olderPallet.id, 'old')
  assert.equal(result.pallet, null)
  assert.equal((await pc1.service.take(ANNA, { pallet: 'old' })).olderPallet, null)
})

test('refill takes from a reserve pallet of the pick place\'s material; there is no "run empty" status any more', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1'), place('A2.2'), place('H26', { purpose: 'pick', type: 'Hylde', fixedMaterials: ['R162-0717'] })], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }, { id: 'p9', location: 'A2.2', material: 'R133-0032', quantity: 5, receivedAt: 1 }])
  assert.equal(pc1.service.markEmpty, undefined)
  const overview = await pc1.service.overview(ANNA)
  assert.equal(overview.empty, undefined)
  await pc1.service.refill(ANNA, { location: 'h26', pallet: 'p1', quantity: 20 })
  const state = await pc1.repo.read('TCD')
  assert.equal(state.pallets.p1.quantity, 80)
  assert.equal(state.pick, undefined)
  assert.deepEqual((await pc1.repo.history('TCD')).filter(event => event.type === 'refill').map(event => `${event.from}→${event.to}:${event.quantity}`), ['A2.1→H26:20'])
  await assert.rejects(pc1.service.refill(ANNA, { location: 'A2.1', pallet: 'p1' }), { code: 'NOT_PICK_PLACE' })
  await assert.rejects(pc1.service.refill(ANNA, { location: 'H26', pallet: 'p9' }), { code: 'MATERIAL_MISMATCH' })
})

test('move and changeSloc keep the pallet and write from/to events; bad sloc is SLOC_INVALID', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1'), place('C16.2')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  await pc1.service.move(ANNA, { pallet: 'p1', to: 'c16.2' })
  await pc1.service.changeSloc(ANNA, { pallet: 'p1', sloc: 'D004' })
  await assert.rejects(pc1.service.changeSloc(ANNA, { pallet: 'p1', sloc: 'Lager 4' }), { code: 'SLOC_INVALID' })
  const state = await pc1.repo.read('TCD')
  assert.equal(state.pallets.p1.location, 'C16.2')
  assert.equal(state.pallets.p1.sloc, 'D004')
  const events = await pc1.repo.history('TCD', { pallet: 'p1' })
  assert.deepEqual(events.map(event => `${event.type}:${event.from}>${event.to}`), ['sloc:D000>D004', 'move:A2.1>C16.2'])
})

test('editPallet records every changed field before/after in the history', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  await pc1.service.editPallet(ANNA, { pallet: 'p1', changes: { quantity: 90, note: 'Talt om', tags: ['Brandskab'] } })
  const [event] = await pc1.repo.history('TCD', { pallet: 'p1' })
  assert.equal(event.type, 'edit-pallet')
  assert.deepEqual(event.changes, { quantity: [100, 90], note: ['', 'Talt om'], tags: [[], ['Brandskab']] })
  await assert.rejects(pc1.service.editPallet(ANNA, { pallet: 'p1', changes: { quantity: -3 } }), { code: 'QUANTITY_INVALID' })
})

test('editPallet: a note edited on a card opened before someone else took from the pallet keeps their take', async () => {
  const { pc1, pc2, seed } = setup()
  const LIS = { email: 'lis@x.test', fullName: 'Lis', role: 'user', team: 'TCD' }
  await seed([place('A2.4')], [{ id: 'p1', location: 'A2.4', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  // Bo's card shows 100; Lis takes 30 on her PC; Bo then saves only a new note.
  await pc2.service.take(LIS, { pallet: 'p1', quantity: 30, actionId: 'lis-take' })
  await pc1.service.editPallet(BO, { pallet: 'p1', changes: { note: 'Hjørne skadet' }, expected: { note: '' }, actionId: 'bo-edit' })
  const state = await pc1.repo.read('TCD')
  assert.equal(state.pallets.p1.quantity, 70)
  assert.equal(state.pallets.p1.note, 'Hjørne skadet')
  const [event] = await pc1.repo.history('TCD', { pallet: 'p1' })
  assert.deepEqual(event.changes, { note: ['', 'Hjørne skadet'] })
})

test('editPallet refuses with PALLET_CHANGED, naming who changed it, when a field is no longer what the dialog showed', async () => {
  const { pc1, pc2, seed } = setup()
  const LIS = { email: 'lis@x.test', fullName: 'Lis', role: 'user', team: 'TCD' }
  await seed([place('A2.4'), place('A2.5')], [{ id: 'p1', location: 'A2.4', material: 'R162-0717', quantity: 100, receivedAt: 1 }, { id: 'p2', location: 'A2.5', material: 'R162-0717', quantity: 5, receivedAt: 1 }])
  await pc2.service.take(LIS, { pallet: 'p1', quantity: 30, actionId: 'lis-take' })
  await assert.rejects(pc1.service.editPallet(BO, { pallet: 'p1', changes: { quantity: 90 }, expected: { quantity: 100 }, actionId: 'bo-edit' }), { code: 'PALLET_CHANGED', message: 'Pallen er ændret af Lis imens. Se den igen.' })
  await assert.rejects(pc1.service.editPallet(BO, { pallet: 'p1', changes: { material: 'X1' }, expected: { material: 'R162-0718' } }), { code: 'PALLET_CHANGED' })
  // Any field it names is checked; with no one in the log to name, the text says so without a name.
  await assert.rejects(pc1.service.editPallet(BO, { pallet: 'p2', changes: { note: 'Ny' }, expected: { note: 'Gammel' } }), { code: 'PALLET_CHANGED', message: 'Pallen er ændret imens. Se den igen.' })
  const state = await pc1.repo.read('TCD')
  assert.equal(state.pallets.p1.quantity, 70)
  assert.equal(state.pallets.p1.material, 'R162-0717')
  assert.equal(state.pallets.p2.note, '')
  assert.equal(state.meta.applied.includes('bo-edit'), false, 'a refused edit is not recorded as applied')
  assert.deepEqual((await pc1.repo.history('TCD', { pallet: 'p1' })).map(event => event.type), ['take'])
  // What the dialog showed is still there: the edit goes through.
  await pc1.service.editPallet(BO, { pallet: 'p1', changes: { quantity: 65 }, expected: { quantity: 70 } })
  assert.equal((await pc1.repo.read('TCD')).pallets.p1.quantity, 65)
})

test('PALLET_CHANGED names who changed the refused field, not whoever touched the pallet last', async () => {
  const { pc1, pc2, seed } = setup()
  const LIS = { email: 'lis@x.test', fullName: 'Lis', role: 'user', team: 'TCD' }
  const KIM = { email: 'kim@x.test', fullName: 'Kim', role: 'user', team: 'TCD' }
  await seed([place('A2.4'), place('A2.5')], [{ id: 'p1', location: 'A2.4', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  await pc2.service.take(LIS, { pallet: 'p1', quantity: 30 })
  await pc2.service.move(KIM, { pallet: 'p1', to: 'A2.5' })
  await assert.rejects(pc1.service.editPallet(BO, { pallet: 'p1', changes: { quantity: 90 }, expected: { quantity: 100 } }), { code: 'PALLET_CHANGED', message: 'Pallen er ændret af Lis imens. Se den igen.' })
})

test('a pallet edit queued while M: is down keeps expected and is refused with PALLET_CHANGED when replayed after a take', async () => {
  const { pc1, pc2, seed } = setup()
  const LIS = { email: 'lis@x.test', fullName: 'Lis', role: 'user', team: 'TCD' }
  await seed([place('A2.4')], [{ id: 'p1', location: 'A2.4', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  let mDown = true
  const outbox = createOutbox({
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'locations-outbox-')),
    run: async action => { if (mDown) throw Object.assign(new Error('STORAGE_UNAVAILABLE'), { code: 'STORAGE_UNAVAILABLE' }); return pc1.service[action.method](action.user, action.request) },
    isStorageError: error => error?.code === 'STORAGE_UNAVAILABLE',
    pauseMs: 0,
  })
  const request = { actionId: 'bo-edit', pallet: 'p1', changes: { quantity: 90 }, expected: { quantity: 100 } }
  assert.deepEqual(await outbox.submit({ id: 'bo-edit', method: 'editPallet', user: BO, request }), { queued: true })
  await pc2.service.take(LIS, { pallet: 'p1', quantity: 30 })
  mDown = false
  const { done, failed } = await outbox.flush()
  assert.equal(done, 0)
  assert.equal(failed[0].code, 'PALLET_CHANGED')
  const [failure] = outbox.failures()
  assert.equal(failure.code, 'PALLET_CHANGED')
  assert.deepEqual(failure.request.expected, { quantity: 100 })
  assert.equal((await pc1.repo.read('TCD')).pallets.p1.quantity, 70)
})

test('editPallet without expected (an older Hub sending every field) works as before', async () => {
  const { pc1, pc2, seed } = setup()
  const LIS = { email: 'lis@x.test', fullName: 'Lis', role: 'user', team: 'TCD' }
  await seed([place('A2.4')], [{ id: 'p1', location: 'A2.4', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  await pc2.service.take(LIS, { pallet: 'p1', quantity: 30 })
  await pc1.service.editPallet(BO, { pallet: 'p1', changes: { material: 'R162-0717', quantity: 100, receivedAt: 1, document: null, serials: [], tags: [], note: 'Hjørne skadet' } })
  const state = await pc1.repo.read('TCD')
  assert.equal(state.pallets.p1.quantity, 100)
  assert.equal(state.pallets.p1.note, 'Hjørne skadet')
})

test('the first daily action after an import sets meta.liveAt', async () => {
  const { pc1, seed, clock } = setup()
  await seed([place('A2.1')])
  assert.equal((await pc1.repo.read('TCD')).meta.liveAt, undefined)
  await pc1.service.putAway(ANNA, { pallets: [{ location: 'A2.1', material: 'X', quantity: 1 }] })
  assert.equal((await pc1.repo.read('TCD')).meta.liveAt, clock.now)
})

test('another hub is refused and TCD never sees TRR pallets', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 1, receivedAt: 1 }])
  await assert.rejects(pc1.service.overview({ ...ANNA, team: 'PIM' }), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' })
  assert.deepEqual((await pc1.service.search(TRR, { query: 'R162' })).pallets, [])
  assert.equal((await pc1.service.search(ANNA, { query: 'ethernet' })).materials[0].material, 'R162-0717')
})

test('lookupDocument returns material, description and serials from the material document', async () => {
  const { pc1, learned } = setup()
  const result = await pc1.service.lookupDocument(ANNA, { document: '4900229137 2026 01' })
  assert.deepEqual(result.materials, [{ material: 'INT4300-4921-0', description: 'SmartPOS N950', quantity: 2, serials: ['N1', 'N2'] }])
  assert.deepEqual(learned.map(entry => `${entry.material}:${entry.source}`), ['INT4300-4921-0:matdoc'])
  assert.equal((await pc1.service.lookupDocument(ANNA, { document: '4900229137' })).document, '4900229137 2026', 'the document SAP found, with its year')
})

test('cards show descriptions, FIFO, pick places and history', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1'), place('H26', { purpose: 'pick', type: 'Hylde', fixedMaterials: ['R162-0717'] }), place('I8', { purpose: 'station', type: 'Bord', fixedMaterials: ['R162-0717'] })], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: day(2024, 11, 7) }])
  const card = await pc1.service.materialCard(ANNA, { material: 'R162-0717' })
  assert.equal(card.description, 'Ethernet Cable RJ45 2m')
  assert.deepEqual(card.pickPlaces.map(item => `${item.id}:${item.state}`), ['H26:undefined'], 'pick places without status')
  const pickCard = await pc1.service.locationCard(ANNA, { location: 'H26' })
  assert.deepEqual(pickCard.fixed, [{ material: 'R162-0717', description: 'Ethernet Cable RJ45 2m' }])
  assert.deepEqual(card.stations.map(item => item.id), ['I8'])
  assert.equal(card.reserve[0].ageDays, 712)
  assert.equal(card.total, 100)
  const location = await pc1.service.locationCard(ANNA, { location: 'a2.1' })
  assert.equal(location.pallets[0].description, 'Ethernet Cable RJ45 2m')
  const pallet = await pc1.service.palletCard(ANNA, { pallet: 'p1' })
  assert.equal(pallet.location.id, 'A2.1')
  await assert.rejects(pc1.service.palletCard(ANNA, { pallet: 'nope' }), { code: 'PALLET_GONE' })
})

test('a replayed action id is applied once, also from another PC: a partial take is not counted twice', async () => {
  const { pc1, pc2, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  const first = await pc1.service.take(ANNA, { pallet: 'p1', quantity: 10, actionId: 'act-1' })
  assert.equal(first.pallet.quantity, 90)
  assert.deepEqual(await pc2.service.take(ANNA, { pallet: 'p1', quantity: 10, actionId: 'act-1' }), { duplicate: true })
  assert.equal((await pc1.repo.read('TCD')).pallets.p1.quantity, 90)
  assert.equal((await pc1.repo.history('TCD')).filter(event => event.type === 'take').length, 1)
  await pc1.service.take(ANNA, { pallet: 'p1', quantity: 10, actionId: 'act-2' })
  assert.equal((await pc1.repo.read('TCD')).pallets.p1.quantity, 80, 'a new id is a new action')
})

// M: drops while a transaction replaces its files: the rename of `file` fails once (the files before it are written).
const dropAt = (t, file) => {
  const rename = fs.promises.rename
  let armed = true
  t.mock.method(fs.promises, 'rename', async (from, to) => {
    if (armed && path.basename(String(to)) === file) { armed = false; throw Object.assign(new Error('EIO: M: er væk'), { code: 'EIO' }) }
    return rename(from, to)
  })
}

test('a put-away replayed after M: dropped between the pallets and the rest makes one pallet, with an id from the action', async t => {
  const { pc1, seed } = setup()
  await seed([place('A2.1'), place('A2.2')])
  const request = { actionId: 'put-1', pallets: [{ location: 'A2.1', material: 'R162-0717', quantity: 10 }, { location: 'A2.2', material: 'R162-0717', quantity: 20 }] }
  dropAt(t, 'meta.json')
  await assert.rejects(pc1.service.putAway(ANNA, request), { code: 'EIO' })
  t.mock.restoreAll()
  const replayed = await pc1.service.putAway(ANNA, request)
  const pallets = Object.values((await pc1.repo.read('TCD')).pallets)
  assert.deepEqual(pallets.map(pallet => [pallet.id, pallet.location, pallet.quantity]).sort(), [['put-1:0', 'A2.1', 10], ['put-1:1', 'A2.2', 20]], 'one pallet per physical pallet')
  if (!replayed.duplicate) assert.deepEqual(replayed.created.map(pallet => pallet.id), ['put-1:0', 'put-1:1'])
  assert.deepEqual(await pc1.service.putAway(ANNA, request), { duplicate: true })
  assert.deepEqual((await pc1.repo.history('TCD', { type: 'putaway' })).map(event => event.pallet).sort(), ['put-1:0', 'put-1:1'], 'one log line per pallet')
})

test('a partial take replayed after M: dropped before the action id was written is subtracted once, also from another PC', async t => {
  const { pc1, pc2, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  const request = { actionId: 'take-1', pallet: 'p1', quantity: 30 }
  dropAt(t, 'meta.json')
  await assert.rejects(pc1.service.take(ANNA, request), { code: 'EIO' })
  t.mock.restoreAll()
  assert.deepEqual(await pc2.service.take(ANNA, request), { duplicate: true }, 'the other PC finishes the action first and sees it is done')
  assert.deepEqual(await pc1.service.take(ANNA, request), { duplicate: true })
  assert.equal((await pc1.repo.read('TCD')).pallets.p1.quantity, 70)
  assert.equal((await pc1.repo.history('TCD', { type: 'take' })).length, 1)
})

test('a pallet put or moved straight onto a pick place is used up there and leaves no pallet behind, also the second time', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1'), place('H26', { purpose: 'pick', type: 'Hylde', fixedMaterials: ['R162-0717'] })], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 40, receivedAt: 1 }])
  for (const round of [1, 2]) {
    const result = await pc1.service.putAway(ANNA, { pallets: [{ location: 'H26', material: 'R162-0717', quantity: 40 }] })
    assert.deepEqual([result.created.length, result.filled], [0, ['H26']], `round ${round}`)
    const state = await pc1.repo.read('TCD')
    assert.equal(Object.values(state.pallets).filter(pallet => pallet.location === 'H26').length, 0, `round ${round}: no pallet on the pick place`)
  }
  await assert.rejects(pc1.service.putAway(ANNA, { pallets: [{ location: 'H26', material: 'R133-0032', quantity: 1 }] }), { code: 'MATERIAL_MISMATCH' })
  assert.equal((await pc1.service.move(ANNA, { pallet: 'p1', to: 'H26' })).pallet, null, 'moving onto the pick place uses the pallet up')
  const state = await pc1.repo.read('TCD')
  assert.equal(state.pallets.p1, undefined)
  assert.equal((await pc1.service.materialCard(ANNA, { material: 'R162-0717' })).total, 0)
})

test('another PC sees that something changed through the change stamp', async () => {
  const { pc1, pc2, clock, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  const before = (await pc2.service.stamp(ANNA)).changedAt
  clock.now += 1000
  await pc1.service.take(ANNA, { pallet: 'p1', quantity: 1 })
  const after = (await pc2.service.stamp(ANNA)).changedAt
  assert.ok(after > before, `${after} > ${before}`)
  assert.equal((await pc2.service.stamp(ANNA)).changedAt, after, 'reading changes nothing')
})

test('a material typed by hand gets its SAP description looked up in the background', async () => {
  const { pc1, seed, missing } = setup()
  await seed([place('C1.1')])
  await pc1.service.putAway(ANNA, { pallets: [{ location: 'C1.1', material: 'R555-0001', quantity: 1 }] })
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.deepEqual(missing, [['R555-0001']])
})

test('the log shows every action newest first with who and what, for everyone in the team', async () => {
  const { pc1, clock, seed } = setup()
  await seed([place('A2.1')])
  await pc1.service.putAway(ANNA, { actionId: 'a1', pallets: [{ location: 'A2.1', material: 'R162-0717', quantity: 100 }] })
  clock.now += 60000
  const pallet = Object.keys((await pc1.repo.read('TCD')).pallets)[0]
  await pc1.service.take(ANNA, { actionId: 'a2', pallet, quantity: 10 })
  const log = await pc1.service.log(ANNA)
  assert.deepEqual(log.events.filter(event => event.type !== 'location').map(event => event.type), ['take', 'putaway'])
  assert.equal(log.events[0].by.name, 'Anna')
  assert.equal(log.canUndo, false, 'a plain user does not undo')
  assert.equal(log.events[0].change, undefined, 'the recorded change never leaves the main process')
  assert.deepEqual(log.people.map(person => person.name), ['Anna'])
  assert.deepEqual((await pc1.service.log(ANNA, { type: 'take' })).events.map(event => event.type), ['take'])
  assert.deepEqual((await pc1.service.log(ANNA, { person: 'bo@x.test' })).events, [])
  assert.deepEqual((await pc1.service.log(ANNA, { query: 'a2.1' })).events.filter(event => event.type !== 'location').length, 2)
})

test('a Placerings admin undoes a take: the pallet is back and both lines are in the log', async () => {
  const { pc1, clock, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  await pc1.service.take(ANNA, { actionId: 'a1', pallet: 'p1', quantity: 10 })
  const take = (await pc1.service.log(ADA, { type: 'take' })).events[0]
  assert.equal(take.canUndo, true)
  clock.now += 60000
  assert.deepEqual(await pc1.service.undo(ADA, { eventId: take.id, actionId: 'u1' }), { undone: 1 })
  assert.equal((await pc1.repo.read('TCD')).pallets.p1.quantity, 100)
  const log = await pc1.service.log(ADA)
  assert.equal(log.events[0].type, 'undo')
  const undone = log.events.find(event => event.id === take.id)
  assert.deepEqual([undone.undoneBy.name, undone.canUndo], ['Ada', false])
})

test('an undo is refused with the later action named when something changed since', async () => {
  const { pc1, clock, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  await pc1.service.take(ANNA, { actionId: 'a1', pallet: 'p1', quantity: 10 })
  clock.now += 60000
  await pc1.service.take(BO, { actionId: 'a2', pallet: 'p1', quantity: 5 })
  const first = (await pc1.service.log(ADA, { person: 'anna@x.test' })).events.find(event => event.type === 'take')
  assert.equal(first.canUndo, false)
  assert.match(first.reason, /Bo .*5 stk.*fortryd den først/)
  await assert.rejects(pc1.service.undo(ADA, { eventId: first.id }), error => error.code === 'UNDO_CONFLICT' && /Bo .*5 stk.*fortryd den først/.test(error.message))
})

test('a plain user cannot undo (LOCATIONS_MANAGER_ONLY) and sees canUndo false', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  await pc1.service.take(ANNA, { pallet: 'p1', quantity: 10 })
  const log = await pc1.service.log(ANNA)
  assert.equal(log.canUndo, false)
  await assert.rejects(pc1.service.undo(ANNA, { eventId: log.events[0].id }), { code: 'LOCATIONS_MANAGER_ONLY' })
  await assert.rejects(pc1.service.undo(ADA, { eventId: 'nope' }), { code: 'UNDO_NOT_FOUND' })
})

test('the conflict explanation never points at an undo: it names the action to undo first', async () => {
  const { pc1, clock, seed } = setup()
  await seed([place('A2.1')], [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  await pc1.service.take(ANNA, { actionId: 'a1', pallet: 'p1', quantity: 10 })
  clock.now += 60000
  await pc1.service.take(BO, { actionId: 'a2', pallet: 'p1', quantity: 5 })
  clock.now += 60000
  await pc1.service.take(BO, { actionId: 'a3', pallet: 'p1', quantity: 3 })
  clock.now += 60000
  const last = (await pc1.service.log(ADA, { type: 'take' })).events[0]
  await pc1.service.undo(ADA, { eventId: last.id, actionId: 'u1' })
  const first = (await pc1.service.log(ADA, { person: 'anna@x.test' })).events.find(event => event.type === 'take')
  assert.match(first.reason, /Bo tog 5 stk/)
  assert.doesNotMatch(first.reason, /fortrød/)
})

test('the log says what an undo will do, for the whole action', async () => {
  const { pc1, seed } = setup()
  await seed([place('A2.1'), place('A2.2'), place('A2.3')], [{ id: 'p0', location: 'A2.3', material: 'R162-0717', quantity: 100, receivedAt: 1 }])
  await pc1.service.putAway(ANNA, { actionId: 'a1', pallets: [{ location: 'A2.1', material: 'R162-0717', quantity: 10 }, { location: 'A2.2', material: 'R162-0717', quantity: 20 }] })
  await pc1.service.take(ANNA, { actionId: 'a2', pallet: 'p0', quantity: 15 })
  const log = await pc1.service.log(ADA)
  const take = log.events.find(event => event.type === 'take')
  assert.deepEqual(take.effect, { pallets: { remove: [], restore: [], change: [{ location: 'A2.3', from: 85, to: 100 }] }, places: { remove: [], restore: [], change: [] } })
  const put = log.events.filter(event => event.type === 'putaway')
  assert.equal(put.length, 2)
  for (const line of put) assert.deepEqual(line.effect.pallets.remove.sort(), ['A2.1', 'A2.2'], 'every line of the action shows the whole action')
  assert.equal((await pc1.service.log(ANNA)).events.find(event => event.type === 'take').effect, undefined, 'only those who can undo get the effect')
})

test('the log stays fast for an admin with a big warehouse and a long history', async () => {
  const locations = {}
  const pallets = {}
  const events = []
  for (let i = 0; i < 1500; i++) {
    locations['L' + i] = place('L' + i)
    pallets['p' + i] = { id: 'p' + i, location: 'L' + i, material: 'R162-0717', quantity: 50, receivedAt: 1, document: null, serials: [], sloc: 'D000', tags: [], note: '', createdAt: 1 }
    events.push({ id: 'e' + i, tx: 't' + i, at: day(2026, 10, 20) - i * 1000, type: 'take', by: { email: 'bo@x.test', name: 'Bo' }, pallet: 'p' + i, location: 'L' + i, material: 'R162-0717', quantity: 1,
      change: { before: { pallets: { ['p' + i]: { ...pallets['p' + i], quantity: 51 } }, locations: {} }, after: { pallets: { ['p' + i]: pallets['p' + i] }, locations: {} } } })
  }
  const repo = { read: async () => ({ locations, pallets, meta: {} }), history: async () => events }
  const service = createLocationService({ repo, catalog: {}, fetcher: {}, isLocationAdmin: async () => true, now: () => day(2026, 10, 20), newId: () => 'x' })
  const started = Date.now()
  const log = await service.log(ADA, { days: 90 })
  const took = Date.now() - started
  assert.equal(log.events.length, 500)
  assert.equal(log.events[0].canUndo, true)
  assert.ok(took < 400, `log took ${took} ms`)
  const plain = await service.log(ADA, { days: 90, verdicts: false })
  assert.equal(plain.events[0].canUndo, false, 'Hubert reads the log without undo verdicts')
})

test('an undo while M: is down fails as a storage error (so it is queued), never as "not found"', async () => {
  const down = async () => { throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }) }
  const storeFor = () => ({ getAsync: async () => undefined, withLockedKeysAsync: down })
  const repo = createLocationRepository({ storeFor, now: () => day(2026, 10, 20), newId: () => 'x' })
  const service = createLocationService({ repo, catalog: {}, fetcher: {}, isLocationAdmin: async () => true, now: () => day(2026, 10, 20), newId: () => 'x' })
  await assert.rejects(service.undo(ADA, { eventId: 'e1', actionId: 'u1' }), { code: 'ENOENT' })
})

const shelf = (name, extra = {}) => place(name, { type: 'Hylde', area: name.replace(/[\d. ].*$/, ''), ...extra })
const MONA = { email: 'mona@x.test', fullName: 'Mona', role: 'manager', team: 'TCD' }

test('Anna puts 40 and then 10 more on E9 H5, takes 5, and the shelf holds 45', async () => {
  const { pc1, clock, seed } = setup()
  await seed([shelf('E9 H5', { rack: 'E9', shelf: 5 })])
  await pc1.service.shelfPut(ANNA, { actionId: 's1', location: 'e9 h5', material: 'r162-0717', quantity: 40 })
  clock.now += 1000
  const second = await pc1.service.shelfPut(ANNA, { actionId: 's2', location: 'E9 H5', material: 'R162-0717', quantity: 10 })
  assert.equal(second.line.quantity, 50)
  clock.now += 1000
  assert.equal((await pc1.service.shelfTake(ANNA, { actionId: 's3', location: 'E9 H5', material: 'R162-0717', quantity: 5 })).taken, 5)
  const card = await pc1.service.locationCard(ANNA, { location: 'E9 H5' })
  assert.deepEqual(card.stock.map(line => [line.material, line.quantity, line.description]), [['R162-0717', 45, 'Ethernet Cable RJ45 2m']])
  assert.deepEqual((await pc1.service.log(ANNA)).events.map(event => event.type).filter(type => type.startsWith('shelf')), ['shelf-take', 'shelf-put', 'shelf-put'])
  assert.deepEqual(await pc1.service.shelfPut(ANNA, { actionId: 's2', location: 'E9 H5', material: 'R162-0717', quantity: 10 }), { duplicate: true }, 'a replayed action is applied once')
})

test('taking more than the shelf holds, or from an emptied line, changes nothing', async () => {
  const { pc1, pc2, seed } = setup()
  await seed([shelf('E9 H5')])
  await pc1.service.shelfPut(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 10 })
  await assert.rejects(pc1.service.shelfTake(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 11 }), { code: 'STOCK_TOO_LOW' })
  assert.equal((await pc1.repo.read('TCD')).stock['E9 H5|R162-0717'].quantity, 10)
  await pc2.service.shelfTake(BO, { location: 'E9 H5', material: 'R162-0717' })
  await assert.rejects(pc1.service.shelfTake(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 1 }), { code: 'STOCK_GONE' })
  await assert.rejects(pc1.service.shelfMove(ANNA, { from: 'E9 H5', to: 'E9 H5', material: 'R162-0717', quantity: 1 }), { code: 'STOCK_GONE' })
})

test('pallets never go on a lagerhylde, stock never on a pallet place; a pallet place is full at one, a floor never', async () => {
  const { pc1, seed } = setup()
  await seed([shelf('E9 H5'), place('A1.1'), place('F1.0', { type: 'Gulv', capacity: 1 })])
  const one = location => ({ location, material: 'R162-0717', quantity: 1 })
  await assert.rejects(pc1.service.putAway(ANNA, { pallets: [one('E9 H5')] }), { code: 'LOCATION_IS_SHELF' })
  await assert.rejects(pc1.service.shelfPut(ANNA, { location: 'A1.1', material: 'R162-0717', quantity: 1 }), { code: 'NOT_A_SHELF' })
  await pc1.service.putAway(ANNA, { pallets: [one('A1.1')] })
  await assert.rejects(pc1.service.putAway(ANNA, { pallets: [one('A1.1')] }), { code: 'LOCATION_FULL' })
  await pc1.service.putAway(ANNA, { pallets: [one('F1.0'), one('F1.0'), one('F1.0')] })
  assert.equal((await pc1.service.locationCard(ANNA, { location: 'F1.0' })).pallets.length, 3)
})

test('a pick place is refilled from a shelf when there is no reserve pallet', async () => {
  const { pc1, seed } = setup()
  await seed([shelf('E9 H5'), place('H26', { type: 'Hylde', purpose: 'pick', fixedMaterials: ['R162-0717'] })])
  await pc1.service.shelfPut(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 40 })
  const card = await pc1.service.materialCard(ANNA, { material: 'R162-0717' })
  assert.deepEqual(card.shelves, [{ location: 'E9 H5', name: 'E9 H5', quantity: 40 }])
  assert.equal(card.total, 40, 'shelves count in the total')
  assert.equal(card.refillShelf, 'E9 H5')
  await assert.rejects(pc1.service.refill(ANNA, { location: 'H26', shelf: 'E9 H5' }), { code: 'QUANTITY_INVALID' })
  await pc1.service.refill(ANNA, { actionId: 'r1', location: 'H26', shelf: 'E9 H5', quantity: 10 })
  assert.equal((await pc1.repo.read('TCD')).stock['E9 H5|R162-0717'].quantity, 30)
  const refill = (await pc1.service.log(ANNA, { type: 'refill' })).events[0]
  assert.deepEqual([refill.from, refill.to, refill.quantity], ['E9 H5', 'H26', 10])
})

test('stock moves between shelves and its quantity can be set; the rack card shows the shelves highest first', async () => {
  const { pc1, seed } = setup()
  await seed([shelf('E9 H1', { rack: 'E9', shelf: 1 }), shelf('E9 H2', { rack: 'E9', shelf: 2 }), shelf('E9 H3', { rack: 'E9', shelf: 3 })])
  await pc1.service.shelfPut(ANNA, { location: 'E9 H1', material: 'R162-0717', quantity: 40 })
  await pc1.service.shelfMove(ANNA, { from: 'E9 H1', to: 'E9 H2', material: 'R162-0717', quantity: 10 })
  await pc1.service.shelfSet(ANNA, { location: 'E9 H1', material: 'R162-0717', quantity: 28 })
  const rack = await pc1.service.rackCard(ANNA, { rack: 'e9' })
  assert.deepEqual(rack.shelves.map(item => [item.location.name, item.stock.map(line => line.quantity)]), [['E9 H3', []], ['E9 H2', [10]], ['E9 H1', [28]]])
  assert.equal(rack.rack, 'E9')
  await assert.rejects(pc1.service.rackCard(ANNA, { rack: 'X1' }), { code: 'RACK_INVALID' })
  assert.deepEqual((await pc1.service.search(ANNA, { query: 'E9' })).racks, ['E9'])
  const set = (await pc1.service.log(ANNA, { type: 'shelf-set' })).events[0]
  assert.deepEqual(set.changes, { quantity: [30, 28] })
  await pc1.service.shelfSet(ANNA, { location: 'E9 H2', material: 'R162-0717', quantity: 0 })
  assert.equal((await pc1.repo.read('TCD')).stock['E9 H2|R162-0717'], undefined, '0 removes the line')
})

test('the migration turns shelf pallets into stock once, also when two PCs open at the same time', async () => {
  const { pc1, pc2, seed } = setup()
  await seed([shelf('E9 H5'), place('A1.1')], [
    { id: 'p1', location: 'E9 H5', material: 'R162-0717', quantity: 10, receivedAt: 1, document: '5000032337' },
    { id: 'p2', location: 'E9 H5', material: 'R162-0717', quantity: 5, receivedAt: 2 },
    { id: 'p3', location: 'A1.1', material: 'R162-0717', quantity: 7, receivedAt: 3 },
  ])
  // The second PC read the meta before the first one migrated (two PCs opening at once): the flag is checked again under the lock.
  pc2.repo.meta = async () => ({})
  await pc1.service.overview(ANNA)
  await pc2.service.overview(ANNA)
  const state = await pc1.repo.read('TCD')
  assert.equal(state.stock['E9 H5|R162-0717'].quantity, 15)
  assert.match(state.stock['E9 H5|R162-0717'].note, /5000032337/)
  assert.deepEqual(Object.keys(state.pallets), ['p3'])
  assert.deepEqual([state.locations['E9 H5'].rack, state.locations['E9 H5'].shelf], ['E9', 5])
  await pc1.service.overview(ANNA)
  const migrations = (await pc1.service.log(MONA)).events.filter(event => event.type === 'migrate')
  assert.equal(migrations.length, 1)
  assert.equal(migrations[0].canUndo, false)
})

test('an undo of a shelf take puts the quantity back and the dialog effect says so', async () => {
  const { pc1, clock, seed } = setup()
  await seed([shelf('E9 H5')])
  await pc1.service.shelfPut(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 40 })
  clock.now += 1000
  await pc1.service.shelfTake(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 5 })
  const take = (await pc1.service.log(ADA, { type: 'shelf-take' })).events[0]
  assert.equal(take.canUndo, true)
  assert.deepEqual(take.effect.stock, [{ location: 'E9 H5', material: 'R162-0717', from: 35, to: 40 }])
  const put = (await pc1.service.log(ADA, { type: 'shelf-put' })).events[0]
  assert.match(put.reason, /Anna tog 5 stk\. R162-0717 fra E9 H5/)
  await pc1.service.undo(ADA, { eventId: take.id })
  assert.equal((await pc1.repo.read('TCD')).stock['E9 H5|R162-0717'].quantity, 40)
})

test('mapContents: what stands on every place, merged per material, oldest pallet first', async () => {
  const { pc1, seed } = setup()
  await seed([place('A1.1'), place('A1.2'), place('F1.0', { type: 'Gulv', capacity: 0 }), place('H26', { type: 'Hylde', purpose: 'pick', fixedMaterials: ['R162-0717'] }), place('A9.9', { active: false }), place('A17.1', { purpose: 'reserved' }), shelf('E9 H5'), place('Z1')], [
    { id: 'p1', location: 'F1.0', material: 'INT4300-4921-0', quantity: 10, receivedAt: day(2026, 9, 1) },
    { id: 'p2', location: 'F1.0', material: 'R162-0717', quantity: 5, receivedAt: day(2026, 8, 1) },
    { id: 'p3', location: 'F1.0', material: 'R162-0717', quantity: null, receivedAt: day(2026, 8, 5) },
    { id: 'p4', location: 'A1.2', material: 'R162-0717', quantity: 7, receivedAt: day(2026, 7, 1) },
    { id: 'p5', location: 'A9.9', material: 'R162-0717', quantity: 1, receivedAt: day(2025, 1, 1) },
    { id: 'p6', location: 'A17.1', material: 'X-ONLY-RESERVED', quantity: 1, receivedAt: day(2025, 1, 1) },
  ])
  await pc1.service.shelfPut(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 40 })
  const map = await pc1.service.mapContents(ANNA)
  assert.deepEqual(map.places['F1.0'].materials.map(m => [m.material, m.pallets, m.quantity, m.oldestAt]), [['R162-0717', 2, 5, day(2026, 8, 1)], ['INT4300-4921-0', 1, 10, day(2026, 9, 1)]], 'oldest pallet first; a null quantity adds nothing')
  assert.equal(map.places['F1.0'].materials[0].description, 'Ethernet Cable RJ45 2m')
  assert.deepEqual(map.places['E9 H5'].materials.map(m => [m.material, m.pallets, m.quantity, m.fixed]), [['R162-0717', 0, 40, false]])
  assert.deepEqual(map.places.H26.materials.map(m => [m.material, m.pallets, m.quantity, m.fixed]), [['R162-0717', 0, null, true]], 'a pick place shows its fixed material')
  assert.equal(map.places['A1.1'], undefined, 'empty places are left out')
  assert.equal(map.places.Z1, undefined)
  assert.equal(map.oldest['R162-0717'], 'A1.2', 'same as Tag: the deactivated A9.9 does not count')
  assert.equal(map.oldest['X-ONLY-RESERVED'], undefined, 'a reserved place is never the oldest')
  assert.deepEqual(await pc1.service.mapContents(TRR), { places: {}, oldest: {} }, 'another hub sees only its own')
})

test('mapContents: fixed materials of a reserve place are not shown as content', async () => {
  const { pc1, seed } = setup()
  await seed([place('A1.1', { fixedMaterials: ['R162-0717'] }), place('I1', { type: 'Bord', purpose: 'station', fixedMaterials: ['INT4300-4921-0'] })])
  const map = await pc1.service.mapContents(ANNA)
  assert.equal(map.places['A1.1'], undefined)
  assert.deepEqual(map.places.I1.materials.map(m => [m.material, m.fixed]), [['INT4300-4921-0', true]])
})

test('overview tells whether a drawing is published, without the heavier list', async () => {
  const { pc1 } = setup()
  assert.equal((await pc1.service.overview(ANNA)).drawing, null)
  await pc1.repo.transact('TCD', tx => { tx.meta.layout = { version: 3, linked: ['A1.1'] } })
  assert.deepEqual((await pc1.service.overview(ANNA)).drawing, { version: 3, linked: ['A1.1'] })
})
test('opening Placeringer checks the one-time shelf migration once, not on every overview (a read on M: each time)', async () => {
  const { pc1, seed } = setup()
  await seed([place('A1.1')])
  await pc1.service.overview(ANNA)
  const meta = pc1.repo.meta
  let metaReads = 0
  pc1.repo.meta = async (...args) => { metaReads++; return meta(...args) }
  await pc1.service.overview(ANNA)
  await pc1.service.overview(ANNA)
  assert.equal(metaReads, 0)
})
test('every action the outbox can replay is applied once on M: when its id comes again (a crash after M: had it)', async () => {
  const { pc1, seed } = setup()
  await seed(
    [place('A2.1'), place('A2.2'), place('A2.3'), place('A2.4'), place('H26', { purpose: 'pick', type: 'Hylde', fixedMaterials: ['R162-0717'] }), shelf('E9 H1', { rack: 'E9', shelf: 1 }), shelf('E9 H2', { rack: 'E9', shelf: 2 })],
    [{ id: 'p1', location: 'A2.1', material: 'R162-0717', quantity: 100, receivedAt: 1 }, { id: 'p2', location: 'A2.2', material: 'R162-0717', quantity: 50, receivedAt: 2 }],
  )
  const calls = [
    ['putAway', ANNA, { pallets: [{ location: 'A2.3', material: 'R162-0717', quantity: 5 }] }],
    ['take', ANNA, { pallet: 'p1', quantity: 10 }],
    ['refill', ANNA, { location: 'H26', pallet: 'p1', quantity: 5 }],
    ['move', ANNA, { pallet: 'p2', to: 'A2.4' }],
    ['changeSloc', ANNA, { pallet: 'p1', sloc: 'D004' }],
    ['editPallet', ANNA, { pallet: 'p1', changes: { note: 'talt' } }],
    ['shelfPut', ANNA, { location: 'E9 H1', material: 'R162-0717', quantity: 40 }],
    ['shelfTake', ANNA, { location: 'E9 H1', material: 'R162-0717', quantity: 5 }],
    ['shelfMove', ANNA, { from: 'E9 H1', to: 'E9 H2', material: 'R162-0717', quantity: 5 }],
    ['shelfSet', ANNA, { location: 'E9 H1', material: 'R162-0717', quantity: 20 }],
    ['undo', ADA, async () => { const [set] = await pc1.repo.history('TCD', { type: 'shelf-set' }); return { eventId: set.id, at: set.at } }],
  ]
  assert.deepEqual(calls.map(([method]) => method).sort(), [...QUEUED_METHODS].sort(), 'every queued method is covered')
  for (const [method, user, make] of calls) {
    const request = { ...(typeof make === 'function' ? await make() : make), actionId: `replay-${method}` }
    const first = await pc1.service[method](user, request)
    assert.notDeepEqual(first, { duplicate: true }, `${method} is applied the first time`)
    const state = JSON.stringify(await pc1.repo.read('TCD'))
    const events = (await pc1.repo.history('TCD')).length
    assert.deepEqual(await pc1.service[method](user, request), { duplicate: true }, `${method} is not applied twice`)
    assert.equal(JSON.stringify(await pc1.repo.read('TCD')), state, `${method}: nothing changed by the replay`)
    assert.equal((await pc1.repo.history('TCD')).length, events, `${method}: no new event`)
  }
})