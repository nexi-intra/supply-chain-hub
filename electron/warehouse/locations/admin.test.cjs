const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { createLocationRepository } = require('./repository.cjs')
const { createLocationService } = require('./service.cjs')
const { createLayoutService } = require('./layoutService.cjs')

const ANNA = { email: 'anna@x.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const ADA = { email: 'ada@x.test', fullName: 'Ada', role: 'user', team: 'TCD' }
const MONA = { email: 'mona@x.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
// Optælling's admin (not a Placerings admin) and a status manager, passed on as a manager like serviceUser does.
const OLE = { email: 'ole@x.test', fullName: 'Ole', role: 'user', team: 'TCD' }
const SIF = { email: 'sif@x.test', fullName: 'Sif', role: 'manager', statusManager: true, team: 'TCD' }

const P = (id, name) => ({ id, name, kind: 'pallet' })
const SH = (id, name, purpose = 'reserve') => ({ id, name, kind: 'shelf', purpose })

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-admin-'))
  const stores = new Map()
  const storeFor = team => { if (!stores.has(team)) stores.set(team, createStore(path.join(root, team))); return stores.get(team) }
  let ids = 0
  const repo = createLocationRepository({ storeFor, now: () => 1000, newId: () => `id${++ids}` })
  // Like roles.isLocationAdmin: a real manager, or Ada who has Placerings admin.
  const isLocationAdmin = async user => (user.role === 'manager' && !user.statusManager) || user.email === ADA.email
  const service = createLocationService({ repo, catalog: { describe: async () => ({}), learn: async () => {} }, fetcher: {}, isLocationAdmin, now: () => 1000, newId: () => `id${++ids}` })
  const layouts = createLayoutService({ repo, locations: service, now: () => 1000 })
  // Mona publishes a drawing with one thing per slot.
  async function publishDrawing(slots) {
    const { draft } = await layouts.startDraft(MONA)
    const items = slots.map((slot, index) => ({ id: `t${index}`, type: slot.kind === 'shelf' ? 'shelfrack' : 'rack', x: 1, y: 1 + 2 * index, w: 4, h: 1, name: slot.name, slots: [slot] }))
    const { rev } = await layouts.saveDraft(MONA, { draft: { ...draft, items } })
    return layouts.publish(MONA, { rev })
  }
  return { repo, service, publishDrawing }
}

test('only managers, status managers and admins maintain locations', async () => {
  const { service } = setup()
  await assert.rejects(service.createLocation(ANNA, { name: 'A1.1', type: 'Palle', purpose: 'reserve' }), { code: 'LOCATIONS_MANAGER_ONLY' })
  assert.equal((await service.createLocation(ADA, { name: 'a1.1', type: 'Palle', purpose: 'reserve' })).location.id, 'A1.1')
  const made = await service.createLocation(MONA, { name: 'Reol X 1', type: 'Hylde', purpose: 'reserve', capacity: 4 })
  assert.deepEqual([made.location.area, made.location.capacity], ['REOL', 4])
  await assert.rejects(service.createLocation(MONA, { name: 'A1.1 ', type: 'Palle', purpose: 'reserve' }), { code: 'LOCATION_EXISTS' })
  await assert.rejects(service.createLocation(MONA, { name: 'A1.2', type: 'Kasse', purpose: 'reserve' }), { code: 'LOCATION_INVALID' })
  await assert.rejects(service.createLocation(MONA, { name: 'H26', type: 'Hylde', purpose: 'pick' }), { code: 'LOCATION_INVALID' }, 'a pick place needs its material')
  await assert.rejects(service.setTags(ANNA, { tags: ['Brandskab'] }), { code: 'LOCATIONS_MANAGER_ONLY' })
  assert.deepEqual((await service.setTags(MONA, { tags: [' Brandskab', 'Brandskab', 'Sluse oppe'] })).tags, ['Brandskab', 'Sluse oppe'])
})

test('createSeries makes C1.1–C20.6 once, skips existing names and refuses more than 500', async () => {
  const { service, repo } = setup()
  await service.createLocation(MONA, { name: 'C3.2', type: 'Palle', purpose: 'reserve' })
  const result = await service.createSeries(MONA, { prefix: 'C', aisles: [1, 20], places: [1, 6], type: 'Palle', purpose: 'reserve', capacity: 1 })
  assert.equal(result.created.length, 119)
  assert.deepEqual(result.skipped, ['C3.2'])
  const ids = Object.keys((await repo.read('TCD')).locations)
  assert.ok(ids.includes('C1.1') && ids.includes('C20.6'))
  await assert.rejects(service.createSeries(MONA, { prefix: 'E', aisles: [1, 100], places: [1, 6], type: 'Palle', purpose: 'reserve' }), { code: 'SERIES_TOO_LARGE' })
})

test('everything about a place can be changed, also with pallets on it: they stay and are only left out of FIFO', async () => {
  const { service, repo } = setup()
  await service.createLocation(MONA, { name: 'A2.1', type: 'Bord', purpose: 'reserve', capacity: 2 })
  await service.putAway(ANNA, { pallets: [{ location: 'A2.1', material: 'R162-0717', quantity: 10 }, { location: 'A2.1', material: 'R162-0717', quantity: 5 }] })
  assert.equal((await service.setActive(MONA, { location: 'A2.1', active: false })).location.active, false, 'deactivated with its pallets')
  assert.equal((await service.materialCard(ANNA, { material: 'R162-0717' })).reserve.length, 0, 'not in FIFO while deactivated')
  await service.setActive(MONA, { location: 'A2.1', active: true })
  assert.equal((await service.editLocation(MONA, { location: 'A2.1', changes: { capacity: 1 } })).location.capacity, 1, 'capacity below the pallets on it: the place is just full')
  assert.equal((await service.editLocation(MONA, { location: 'A2.1', changes: { purpose: 'reserved' } })).location.purpose, 'reserved')
  assert.equal(Object.values((await repo.read('TCD')).pallets).filter(pallet => pallet.location === 'A2.1').length, 2, 'the pallets stay on the place')
  assert.equal((await service.editLocation(MONA, { location: 'A2.1', changes: { purpose: 'station', fixedMaterials: ['R162-0717'] } })).location.purpose, 'station')
  assert.equal((await service.locationCard(ANNA, { location: 'A2.1' })).pallets.length, 2, 'they are shown on the place and can be moved or taken')
  await assert.rejects(service.editLocation(MONA, { location: 'A2.1', changes: { capacity: 0 } }), { code: 'LOCATION_INVALID' }, 'only real nonsense is refused')
  await assert.rejects(service.editLocation(MONA, { location: 'A2.1', changes: { name: ' ' } }), { code: 'LOCATION_INVALID' })
})

test('a reserve place with pallets becomes a pick place when it is confirmed: the pallets become the pick pallet and their materials are fixed there', async () => {
  const { service, repo } = setup()
  await service.createLocation(MONA, { name: 'A16.1', type: 'Palle', purpose: 'reserve', fixedMaterials: ['R162-0603'] })
  await service.putAway(ANNA, { pallets: [{ location: 'A16.1', material: 'R162-0603', quantity: 120 }] })
  await assert.rejects(service.editLocation(MONA, { location: 'A16.1', changes: { purpose: 'pick' } }), { code: 'LOCATION_NOT_EMPTY' }, 'not without confirmation')
  const { location } = await service.editLocation(MONA, { location: 'A16.1', changes: { purpose: 'pick', fixedMaterials: [] }, usePallets: true })
  assert.deepEqual([location.purpose, location.fixedMaterials], ['pick', ['R162-0603']], 'the pallet\'s material is fixed there')
  const state = await repo.read('TCD')
  assert.deepEqual(Object.values(state.pallets).filter(pallet => pallet.location === 'A16.1'), [], 'a pick place holds no pallets')
  const history = await repo.history('TCD', { location: 'A16.1' })
  assert.ok(history.some(event => event.type === 'move' && event.to === 'A16.1' && event.material === 'R162-0603' && event.quantity === 120), 'the pallet is in the history')
  await service.createLocation(MONA, { name: 'A16.2', type: 'Palle', purpose: 'reserve' })
  await service.putAway(ANNA, { pallets: [{ location: 'A16.2', material: 'R162-0603', quantity: 5 }] })
  assert.equal((await service.editLocation(MONA, { location: 'A16.2', changes: { purpose: 'station', fixedMaterials: ['R162-0603'] }, usePallets: true })).location.purpose, 'station', 'a station keeps its pallets on the place')
  assert.equal(Object.values((await repo.read('TCD')).pallets).filter(pallet => pallet.location === 'A16.2').length, 1)
})

test('editing a location keeps its pallets and is written to the history', async () => {
  const { service, repo } = setup()
  await service.createLocation(MONA, { name: 'A2.1', type: 'Bord', purpose: 'reserve' })
  const { created } = await service.putAway(ANNA, { pallets: [{ location: 'A2.1', material: 'R162-0717', quantity: 10 }] })
  await service.editLocation(MONA, { location: 'A2.1', changes: { fixedMaterials: ['r162-0717'], note: 'Fast plads', capacity: 2 } })
  const state = await repo.read('TCD')
  assert.deepEqual(state.locations['A2.1'].fixedMaterials, ['R162-0717'])
  assert.equal(state.locations['A2.1'].capacity, 2)
  assert.equal(state.pallets[created[0].id].location, 'A2.1')
  const [event] = await repo.history('TCD', { location: 'A2.1' })
  assert.equal(event.type, 'location')
  assert.deepEqual(event.changes.capacity, [1, 2])
  await service.setActive(MONA, { location: 'A2.1', active: true })
})

test('list gives every location in name order with its occupancy, the tags and whether the person may maintain them', async () => {
  const { service } = setup()
  await service.createSeries(MONA, { prefix: 'C', aisles: [10, 10], places: [1, 2], type: 'Palle', purpose: 'reserve', capacity: 1 })
  await service.createLocation(MONA, { name: 'C9.1', type: 'Bord', purpose: 'reserve', capacity: 2 })
  await service.putAway(ANNA, { pallets: [{ location: 'C9.1', material: 'R162-0717', quantity: 5 }] })
  const listed = await service.list(ANNA)
  assert.deepEqual(listed.locations.map(location => `${location.id}:${location.used}/${location.capacity}`), ['C9.1:1/2', 'C10.1:0/1', 'C10.2:0/1'])
  assert.equal(listed.canAdmin, false)
  assert.equal((await service.list(MONA)).canAdmin, true)
  assert.deepEqual(listed.tags, [])
})

test('Optælling admins and status managers cannot maintain locations; Placerings admins and managers can', async () => {
  const { service } = setup()
  await assert.rejects(service.createLocation(OLE, { name: 'B1.1', type: 'Palle', purpose: 'reserve' }), { code: 'LOCATIONS_MANAGER_ONLY' })
  await assert.rejects(service.createLocation(SIF, { name: 'B1.1', type: 'Palle', purpose: 'reserve' }), { code: 'LOCATIONS_MANAGER_ONLY' }, 'a status manager is not a Placerings admin')
  assert.equal((await service.createLocation(ADA, { name: 'B1.1', type: 'Palle', purpose: 'reserve' })).location.id, 'B1.1')
  assert.equal((await service.createLocation(MONA, { name: 'B1.2', type: 'Palle', purpose: 'reserve' })).location.id, 'B1.2')
  assert.equal((await service.list(ADA)).canAdmin, true)
  assert.equal((await service.list(ANNA)).canAdmin, false)
  assert.equal((await service.list(SIF)).canAdmin, false)
})

test('a rack is created with its shelves in one action, and a shelf is added with the next number', async () => {
  const { service } = setup()
  const { created } = await service.createRack(MONA, { name: 'e9', shelves: 3 })
  assert.deepEqual(created.map(location => [location.name, location.type, location.purpose, location.rack, location.shelf, location.area]), [
    ['E9 H1', 'Hylde', 'reserve', 'E9', 1, 'E'], ['E9 H2', 'Hylde', 'reserve', 'E9', 2, 'E'], ['E9 H3', 'Hylde', 'reserve', 'E9', 3, 'E'],
  ])
  assert.equal((await service.addShelf(MONA, { rack: 'E9' })).location.name, 'E9 H4')
  await assert.rejects(service.createRack(MONA, { name: 'E8', shelves: 0 }), { code: 'RACK_INVALID' })
  await assert.rejects(service.createRack(MONA, { name: 'E8', shelves: 21 }), { code: 'RACK_INVALID' })
  await assert.rejects(service.createRack(MONA, { name: 'E9', shelves: 2 }), { code: 'LOCATION_EXISTS' })
  await assert.rejects(service.addShelf(MONA, { rack: 'X1' }), { code: 'RACK_INVALID' })
  const pick = await service.createRack(MONA, { name: 'P7', shelves: 2, purpose: 'pick' })
  assert.deepEqual(pick.created.map(location => location.purpose), ['pick', 'pick'], 'pick shelves get their materials afterwards')
  const lines = (await service.log(MONA)).events.filter(event => event.type === 'location')
  assert.equal(lines.length, 3, 'one log line per action')
  assert.deepEqual(lines.at(-1).changes, { rack: [null, 'E9 (3 hylder)'] })
})

test('the type decides capacity: a pallet place is one, a floor has none, a shelf gets its rack from the name', async () => {
  const { service } = setup()
  assert.equal((await service.createLocation(MONA, { name: 'A1.1', type: 'Palle', capacity: 7 })).location.capacity, 1)
  assert.equal((await service.createLocation(MONA, { name: 'F1.0', type: 'Gulv' })).location.capacity, 0)
  const shelf = (await service.createLocation(MONA, { name: 'e9 h5', type: 'Hylde' })).location
  assert.deepEqual([shelf.rack, shelf.shelf], ['E9', 5])
  assert.deepEqual((await service.createSeries(MONA, { prefix: 'G', aisles: [1, 1], places: [1, 2], type: 'Gulv' })).created.map(location => location.capacity), [0, 0])
})

test('a Palle with room for two (S0 from the drawing) takes two pallets, the third is refused', async () => {
  const { service, repo } = setup()
  await repo.transact('TCD', tx => {
    tx.locations.S0 = { id: 'S0', name: 'S0', area: 'S', type: 'Palle', purpose: 'reserve', capacity: 2, fixedMaterials: [], active: true, note: '' }
  })
  const one = { location: 'S0', material: 'R162-0717', quantity: 1 }
  await service.putAway(ANNA, { pallets: [one] })
  await service.putAway(ANNA, { pallets: [one] })
  await assert.rejects(service.putAway(ANNA, { pallets: [one] }), { code: 'LOCATION_FULL' })
  assert.equal(Object.values((await repo.read('TCD')).pallets).filter(pallet => pallet.location === 'S0').length, 2)
})

test('editing a Palle keeps the capacity it has (S0 stays at two); the admin cannot set it, a place made a Palle gets one', async () => {
  const { service, repo } = setup()
  await repo.transact('TCD', tx => {
    tx.locations.S0 = { id: 'S0', name: 'S0', area: 'S', type: 'Palle', purpose: 'reserve', capacity: 2, fixedMaterials: [], active: true, note: '' }
  })
  assert.equal((await service.editLocation(MONA, { location: 'S0', changes: { note: 'x' } })).location.capacity, 2, 'a note edit keeps room for two')
  assert.equal((await service.editLocation(MONA, { location: 'S0', changes: { capacity: 5 } })).location.capacity, 2, 'the admin cannot set a Palle\'s capacity')
  assert.equal((await repo.read('TCD')).locations.S0.capacity, 2)
  await service.createLocation(MONA, { name: 'B1', type: 'Bord', capacity: 3 })
  assert.equal((await service.editLocation(MONA, { location: 'B1', changes: { type: 'Palle' } })).location.capacity, 1, 'a place made a Palle gets one')
})

test('only empty places are deleted; the rest are kept with the reason, in one log line that can be undone', async () => {
  const { service, repo } = setup()
  for (const name of ['A1.1', 'C1.1', 'C1.2']) await service.createLocation(MONA, { name, type: 'Palle' })
  await service.createRack(MONA, { name: 'E9', shelves: 2 })
  await service.putAway(ANNA, { pallets: [{ location: 'A1.1', material: 'R162-0717', quantity: 1 }] })
  await service.shelfPut(ANNA, { location: 'E9 H2', material: 'R162-0717', quantity: 4 })
  const result = await service.deleteLocations(ADA, { locations: ['A1.1', 'c1.1', 'C1.2', 'E9 H2', 'Z9'] })
  assert.deepEqual(result.deleted, ['C1.1', 'C1.2'])
  assert.deepEqual(result.kept.map(item => item.name), ['A1.1', 'E9 H2', 'Z9'])
  assert.match(result.kept[0].reason, /1 palle på A1.1/)
  assert.match(result.kept[1].reason, /1 materiale på E9 H2/)
  assert.match(result.kept[2].reason, /findes ikke/)
  const line = (await service.log(MONA)).events.find(event => event.changes?.deleted)
  assert.deepEqual(line.changes.deleted, ['C1.1, C1.2', null])
  await service.undo(MONA, { eventId: line.id })
  assert.ok((await repo.read('TCD')).locations['C1.2'], 'the undo brings them back')
  await assert.rejects(service.deleteLocations(MONA, { locations: Array.from({ length: 501 }, (_, i) => `X${i}`) }), { code: 'SERIES_TOO_LARGE' })
})

test('deleting a rack deletes all its shelves or none', async () => {
  const { service, repo } = setup()
  await service.createRack(MONA, { name: 'E9', shelves: 3 })
  await service.shelfPut(ANNA, { location: 'E9 H2', material: 'R162-0717', quantity: 4 })
  const shelves = ['E9 H1', 'E9 H2', 'E9 H3']
  await assert.rejects(service.deleteLocations(MONA, { locations: shelves, allOrNothing: true }), error => error.code === 'RACK_NOT_EMPTY' && /E9 H2/.test(error.message))
  assert.equal(Object.keys((await repo.read('TCD')).locations).length, 3, 'nothing deleted')
  await service.shelfTake(ANNA, { location: 'E9 H2', material: 'R162-0717' })
  assert.deepEqual((await service.deleteLocations(MONA, { locations: shelves, allOrNothing: true })).deleted, shelves)
})

test('renaming a shelf keeps its stock; making a stocked shelf a pick shelf, or a place with pallets a lagerhylde, is refused', async () => {
  const { service, repo } = setup()
  await service.createRack(MONA, { name: 'E9', shelves: 5 })
  await service.shelfPut(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 4 })
  const renamed = (await service.editLocation(MONA, { location: 'E9 H5', changes: { name: 'E9 H6' } })).location
  assert.deepEqual([renamed.rack, renamed.shelf], ['E9', 6])
  assert.deepEqual(Object.keys((await repo.read('TCD')).stock), ['E9 H6|R162-0717'])
  assert.equal((await service.locationCard(ANNA, { location: 'E9 H6' })).stock.length, 1)
  await assert.rejects(service.editLocation(MONA, { location: 'E9 H6', changes: { purpose: 'pick', fixedMaterials: ['R162-0717'] } }), error => error.code === 'LOCATION_NOT_EMPTY' && /1 materiale/.test(error.message))
  await service.createLocation(MONA, { name: 'B1', type: 'Bord', capacity: 2 })
  await service.putAway(ANNA, { pallets: [{ location: 'B1', material: 'R162-0717', quantity: 1 }] })
  await assert.rejects(service.editLocation(MONA, { location: 'B1', changes: { type: 'Hylde' } }), { code: 'LOCATION_NOT_EMPTY' })
})

test('many places are deactivated in one action, and the list shows rack, shelf and stock count', async () => {
  const { service } = setup()
  await service.createRack(MONA, { name: 'E9', shelves: 2 })
  await service.shelfPut(ANNA, { location: 'E9 H1', material: 'R162-0717', quantity: 4 })
  assert.deepEqual(await service.setActiveMany(MONA, { locations: ['E9 H1', 'E9 H2'], active: false }), { changed: 2 })
  const listed = (await service.list(MONA)).locations
  assert.deepEqual(listed.map(item => [item.name, item.active, item.rack, item.shelf, item.stockCount]), [['E9 H1', false, 'E9', 1, 1], ['E9 H2', false, 'E9', 2, 0]])
})

test('a place that got a pallet between the list and the click is kept, the others deleted', async () => {
  const { service } = setup()
  for (const name of ['C1.1', 'C1.2']) await service.createLocation(MONA, { name, type: 'Palle' })
  await service.putAway(ANNA, { pallets: [{ location: 'C1.2', material: 'R162-0717', quantity: 1 }] })
  const result = await service.deleteLocations(MONA, { locations: ['C1.1', 'C1.2'] })
  assert.deepEqual([result.deleted, result.kept.map(item => item.name)], [['C1.1'], ['C1.2']])
})

test('a plain user cannot create racks or delete places', async () => {
  const { service } = setup()
  await service.createRack(MONA, { name: 'E9', shelves: 1 })
  for (const call of [service.createRack(ANNA, { name: 'E8', shelves: 1 }), service.addShelf(OLE, { rack: 'E9' }), service.deleteLocations(SIF, { locations: ['E9 H1'] }), service.setActiveMany(ANNA, { locations: ['E9 H1'], active: false })]) {
    await assert.rejects(call, { code: 'LOCATIONS_MANAGER_ONLY' })
  }
})

test('after the first publish places are made on the drawing, not in the list', async () => {
  const { service, publishDrawing } = setup()
  await service.createRack(MONA, { name: 'E9', shelves: 1 })
  await publishDrawing([P('s1', 'A1.1'), SH('s2', 'H1', 'pick')])
  for (const call of [() => service.createLocation(MONA, { name: 'A9.9', type: 'Palle', purpose: 'reserve' }), () => service.createSeries(MONA, { prefix: 'C', aisles: [1, 1], places: [1, 1], type: 'Palle', purpose: 'reserve' }), () => service.createRack(MONA, { name: 'Z', shelves: 1 }), () => service.applyImport(MONA, { token: 'x' })])
    await assert.rejects(call(), { code: 'LAYOUT_OWNS_PLACES' })
  await assert.rejects(service.addShelf(MONA, { rack: 'E9' }), { code: 'LAYOUT_OWNS_PLACES' })
  await assert.rejects(service.previewImport(MONA), { code: 'LAYOUT_OWNS_PLACES' }, 'refused before the sheet is looked for')
})

test('a place on the drawing keeps its physical fields; the rest can still be changed', async () => {
  const { service, publishDrawing } = setup()
  await publishDrawing([P('s1', 'A1.1'), SH('s2', 'H1', 'pick')])
  await assert.rejects(service.editLocation(MONA, { location: 'A1.1', changes: { name: 'A1.2' } }), { code: 'LOCATION_ON_DRAWING' })
  await assert.rejects(service.editLocation(MONA, { location: 'A1.1', changes: { purpose: 'pick', fixedMaterials: ['R1'] } }), { code: 'LOCATION_ON_DRAWING' })
  assert.equal((await service.editLocation(MONA, { location: 'A1.1', changes: { purpose: 'reserved', note: 'Brandskab' } })).location.purpose, 'reserved')
  assert.equal((await service.editLocation(MONA, { location: 'H1', changes: { note: 'mangler materiale' } })).location.note, 'mangler materiale')
  assert.match((await service.deleteLocations(MONA, { locations: ['A1.1'] })).kept[0].reason, /tegningen/)
  assert.deepEqual((await service.list(MONA)).drawing, { version: 1, linked: ['A1.1', 'H1'] })
})

test('a place on the drawing cannot change name spelling, type or capacity; the list says when there is no drawing', async () => {
  const { service, publishDrawing } = setup()
  assert.equal((await service.list(MONA)).drawing, null)
  await service.createLocation(MONA, { name: 'B1', type: 'Bord', capacity: 2 })
  await publishDrawing([P('s1', 'A1.1'), SH('s2', 'H1', 'pick')])
  await assert.rejects(service.editLocation(MONA, { location: 'A1.1', changes: { name: 'a1.1' } }), { code: 'LOCATION_ON_DRAWING' }, 'not even the spelling')
  for (const changes of [{ type: 'Gulv' }, { capacity: 3 }]) await assert.rejects(service.editLocation(MONA, { location: 'H1', changes }), { code: 'LOCATION_ON_DRAWING' })
  assert.equal((await service.editLocation(MONA, { location: 'H1', changes: { fixedMaterials: ['R162-0717'] } })).location.fixedMaterials[0], 'R162-0717')
  assert.equal((await service.editLocation(MONA, { location: 'B1', changes: { name: 'B2', capacity: 3 } })).location.capacity, 3, 'a place outside the drawing is the list\'s')
  assert.deepEqual((await service.deleteLocations(MONA, { locations: ['B2', 'H1'] })).deleted, ['B2'])
})

test('a publish in the log cannot be undone', async () => {
  const { service, publishDrawing } = setup()
  await publishDrawing([P('s1', 'A1.1')])
  const event = (await service.log(MONA)).events.find(item => item.type === 'layout')
  assert.deepEqual([event.canUndo, event.reason], [false, 'Kan ikke fortrydes'])
})

test('an older action cannot be undone when it would remove or rename a place on the drawing; a note can', async () => {
  const { service, repo, publishDrawing } = setup()
  await service.createLocation(MONA, { name: 'C1.1', type: 'Palle', purpose: 'reserve' })
  await service.createLocation(MONA, { name: 'B1.1', type: 'Palle', purpose: 'reserve' })
  await service.editLocation(MONA, { location: 'B1.1', changes: { name: 'A1.2' } })
  await service.editLocation(MONA, { location: 'C1.1', changes: { note: 'Brandskab' } })
  await service.createLocation(MONA, { name: 'A1.1', type: 'Palle', purpose: 'reserve' })
  const before = (await service.log(MONA)).events
  const created = before.find(event => event.location === 'A1.1' && event.changes?.created)
  const renamed = before.find(event => event.type === 'location' && event.from === 'B1.1')
  const noted = before.find(event => event.type === 'location' && event.changes?.note)
  await publishDrawing([P('s1', 'A1.1'), P('s2', 'A1.2'), P('s3', 'C1.1')])
  const reason = name => `Handlingen rører ${name}, som er på tegningen – ret den på tegningen`
  const after = new Map((await service.log(MONA)).events.map(event => [event.id, event]))
  assert.deepEqual([after.get(created.id).canUndo, after.get(created.id).reason], [false, reason('A1.1')])
  assert.deepEqual([after.get(renamed.id).canUndo, after.get(renamed.id).reason], [false, reason('A1.2')])
  assert.equal(after.get(noted.id).canUndo, true)
  await assert.rejects(service.undo(MONA, { eventId: created.id }), error => error.code === 'UNDO_NOT_POSSIBLE' && error.message === reason('A1.1'))
  await assert.rejects(service.undo(MONA, { eventId: renamed.id }), { code: 'UNDO_NOT_POSSIBLE' })
  const { locations } = await repo.read('TCD')
  assert.ok(locations['A1.1'] && locations['A1.2'] && !locations['B1.1'], 'nothing was undone')
  await service.undo(MONA, { eventId: noted.id })
  assert.equal((await repo.read('TCD')).locations['C1.1'].note, '')
})
