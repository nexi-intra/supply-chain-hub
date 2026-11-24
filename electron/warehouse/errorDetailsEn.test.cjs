// The English texts for a Danish backend detail (src/lib/warehouse/errorDetailsEn.json, used by errors.ts) are matched
// against the details the services really produce here, so a change of wording fails this test instead of quietly
// falling back to a text without the place or the person.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../store.cjs')
const { createCountRepository } = require('./countRepository.cjs')
const { createCountService } = require('./countService.cjs')
const { createLocationRepository } = require('./locations/repository.cjs')
const { createLocationService, PLACE_REASONS } = require('./locations/service.cjs')
const PATTERNS = require('../../src/lib/warehouse/errorDetailsEn.json')

/** As errorMessage in English: the first pattern of the code that matches the whole detail. */
function english(code, detail) {
  for (const [pattern, text] of PATTERNS[code] || []) {
    const regex = new RegExp(pattern)
    if (regex.test(detail)) return detail.replace(regex, text)
  }
  return null
}

async function refusal(promise, code) {
  let caught = null
  await promise.catch(error => { caught = error })
  assert.equal(caught?.code, code, `expected ${code}, got ${caught?.code}: ${caught?.message}`)
  return caught.message
}

const ANNA = { email: 'anna@x.test', fullName: 'Anna Holm', role: 'user', team: 'TCD' }
const BO = { email: 'bo@x.test', fullName: 'Bo Jensen', role: 'user', team: 'TCD' }
const ADA = { email: 'ada@x.test', fullName: 'Ada', role: 'manager', team: 'TCD' }
const place = (name, extra = {}) => ({ id: name, name, area: name.replace(/[\d. ].*$/, ''), type: 'Palle', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '', ...extra })

function locations() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'error-details-en-'))
  const clock = { now: Date.UTC(2026, 9, 20, 8) }
  let ids = 0
  const stores = new Map()
  const storeFor = team => { if (!stores.has(team)) stores.set(team, createStore(path.join(root, team))); return stores.get(team) }
  const repo = createLocationRepository({ storeFor, now: () => clock.now, newId: () => `id${++ids}` })
  const catalog = { describe: async () => ({}), learn: async () => {}, describeMissing: async () => {} }
  const service = createLocationService({ repo, catalog, fetcher: {}, isLocationAdmin: async user => user.role === 'manager', now: () => clock.now, newId: () => `id${++ids}` })
  const seed = (places, pallets = []) => repo.transact('TCD', tx => {
    for (const location of places) tx.locations[location.id] = location
    for (const pallet of pallets) tx.pallets[pallet.id] = { document: null, serials: [], sloc: 'D000', tags: [], note: '', createdAt: 1, receivedAt: 1, quantity: 1, material: 'R162-0717', ...pallet }
  })
  return { clock, service, seed }
}

test('Placeringer: the place, the material and the person of each refusal are kept in English', async () => {
  const { clock, service, seed } = locations()
  await seed([
    place('A2.1'), place('A9.9', { active: false }), place('H26', { purpose: 'pick', type: 'Hylde', fixedMaterials: ['R162-0717'] }),
    place('E9 H5', { type: 'Hylde' }), place('A3.1'), place('A3.2', { capacity: 2 }), place('A4.1'), place('A2.4'), place('B1.1', { type: 'Gulv', capacity: 0 }),
  ], [{ id: 'p1', location: 'A2.1' }, { id: 'p2', location: 'A3.1' }, { id: 'p3', location: 'A3.2' }, { id: 'p4', location: 'A3.2' }, { id: 'p5', location: 'A4.1' }, { id: 'P', location: 'A2.4', quantity: 100 }])
  const put = location => () => service.putAway(ANNA, { pallets: [{ location, material: 'R133-0032', quantity: 1 }] })

  const cases = [
    ['LOCATION_FULL', put('A2.1'), 'A2.1 is full.'],
    ['LOCATION_INACTIVE', put('A9.9'), 'A9.9 is deactivated.'],
    ['LOCATION_NOT_FOUND', put('Z1'), 'The location Z1 does not exist.'],
    ['MATERIAL_MISMATCH', put('H26'), 'R133-0032 does not belong to the pick place H26.'],
    ['LOCATION_NOT_EMPTY', () => service.editLocation(ADA, { location: 'A3.1', changes: { purpose: 'pick', fixedMaterials: ['R162-0717'] } }), 'There is 1 pallet on A3.1. Confirm that it becomes the pick pallet.'],
    ['LOCATION_NOT_EMPTY', () => service.editLocation(ADA, { location: 'A3.2', changes: { purpose: 'pick', fixedMaterials: ['R162-0717'] } }), 'There are 2 pallets on A3.2. Confirm that they become the pick pallet.'],
    ['LOCATION_NOT_EMPTY', () => service.editLocation(ADA, { location: 'A4.1', changes: { type: 'Hylde' } }), 'There is 1 pallet on A4.1. Move it first.'],
  ]
  for (const [code, refused, expected] of cases) {
    const detail = await refusal(refused(), code)
    assert.equal(english(code, detail), expected, detail)
  }

  await service.shelfPut(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 10 })
  const low = await refusal(service.shelfTake(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 11 }), 'STOCK_TOO_LOW')
  assert.equal(english('STOCK_TOO_LOW', low), 'There are only 10 pcs of R162-0717 on E9 H5.', low)
  const lines = await refusal(service.editLocation(ADA, { location: 'E9 H5', changes: { type: 'Palle' } }), 'LOCATION_NOT_EMPTY')
  assert.equal(english('LOCATION_NOT_EMPTY', lines), 'There is 1 material on E9 H5. Empty the shelf first.', lines)

  // An undo blocked by a later action names who and when.
  await service.move(BO, { actionId: 'bo-move', pallet: 'P', to: 'B1.1' })
  clock.now += 20 * 60000
  await service.putAway(ANNA, { actionId: 'anna-put', pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 1 }] })
  const at = new Date(clock.now)
  clock.now += 40 * 60000
  const move = (await service.log(ADA, { type: 'move' })).events.find(event => event.pallet === 'P' || event.from === 'A2.4')
  const blocked = await refusal(service.undo(ADA, { eventId: move.id, actionId: 'u1' }), 'UNDO_CONFLICT')
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  assert.equal(english('UNDO_CONFLICT', blocked), `Cannot be undone. Anna Holm made a later change at ${time}. Undo that first.`, blocked)
})

test('Placeringer: every reason an undo cannot put a pallet back has an English text; "something changed" gets the generic one', () => {
  const expected = { full: 'is full', reserved: 'is reserved', station: 'is a work station', inactive: 'is deactivated' }
  assert.deepEqual(Object.keys(PLACE_REASONS).sort(), Object.keys(expected).sort())
  for (const [reason, text] of Object.entries(PLACE_REASONS)) assert.equal(english('UNDO_CONFLICT', `Kan ikke fortrydes. A2.4 ${text}.`), `Cannot be undone. A2.4 ${expected[reason]}.`)
  assert.equal(english('UNDO_CONFLICT', 'Kan ikke fortrydes. Noget er ændret siden.'), null)
})

test('Optælling: an area another person counts names that person and the area in English', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'error-details-en-count-'))
  const stores = new Map()
  const storeFor = team => { if (!stores.has(team)) stores.set(team, createStore(path.join(root, 'data', team))); return stores.get(team) }
  storeFor('TCD').set('statusser', { st0open1: { id: 'st0open1', team: 'TCD', name: 'Status Q4 2026', year: 2026, quarter: 4, state: 'open', startedBy: { email: 'ada@x.test', name: 'Ada' }, startedAt: 1, history: [], reports: [] } })
  const clock = { now: 1_000_000 }
  const fetcher = { async fetchPlant() { return { mb52: [{ material: 'R162-0717', description: 'Kabel', plant: 'D301', sloc: 'D000', unrestricted: 100, blocked: 0, valueUnrestricted: 0, valueBlocked: 0 }], serials: [], sapUser: 'D00K418', fetchedAt: clock.now } } }
  let ids = 0
  const service = name => createCountService({
    repo: createCountRepository({ storeFor, now: () => clock.now }), storeFor, fetcher, placementSource: { load: async () => ({ file: '', placements: [] }) },
    journalsDir: path.join(root, `local-${name}`), deviceId: name, now: () => clock.now, newId: () => `${name}${++ids}`, journalOptions: { autoFlush: false },
  })
  const anna = service('pc1')
  const bo = service('pc2')
  const preview = await anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } })
  const { id } = await anna.createCount(ANNA, { token: preview.token, name: 'Status D000' })
  await bo.requestJoin(BO, id)
  await anna.decideMember(ANNA, id, { email: BO.email, approve: true })
  await bo.claimArea(BO, id, { area: 'reol 4' })
  const taken = await refusal(anna.claimArea(ANNA, id, { area: 'REOL 4' }), 'CLAIM_TAKEN')
  assert.equal(english('CLAIM_TAKEN', taken), 'Bo Jensen is already counting area REOL 4.', taken)
  await Promise.all([anna.closeAll?.(), bo.closeAll?.()])
})

test('Optælling: open SAP documents that stop a delete or a reset keep their numbers and the advice per status in English', async t => {
  const root = path.join(__dirname, `.error-details-en-pidocs-${process.pid}.local`)
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const stores = new Map()
  const storeFor = team => { if (!stores.has(team)) stores.set(team, createStore(path.join(root, 'data', team))); return stores.get(team) }
  storeFor('TCD').set('statusser', { st0open1: { id: 'st0open1', team: 'TCD', name: 'Status Q4 2026', year: 2026, quarter: 4, state: 'open', startedBy: { email: 'ada@x.test', name: 'Ada' }, startedAt: 1, history: [], reports: [] } })
  const clock = { now: 1_000_000 }
  const fetcher = { async fetchPlant() { return { mb52: [{ material: 'R162-0717', description: 'Kabel', plant: 'D301', sloc: 'D000', unrestricted: 100, blocked: 0, valueUnrestricted: 0, valueBlocked: 0 }], serials: [], sapUser: 'D00K418', fetchedAt: clock.now } } }
  let ids = 0
  const repo = createCountRepository({ storeFor, now: () => clock.now })
  const anna = createCountService({
    repo, storeFor, fetcher, placementSource: { load: async () => ({ file: '', placements: [] }) },
    journalsDir: path.join(root, 'local-pc1'), deviceId: 'pc1', now: () => clock.now, newId: () => `pc1${++ids}`, journalOptions: { autoFlush: false },
  })
  const preview = await anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } })
  const { id } = await anna.createCount(ANNA, { token: preview.token, name: 'Status D000' })
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.flush(ANNA, id)
  await anna.setApproval(ADA, id, { material: 'R162-0717', status: 'approved' })
  const doc = (docNo, status, extra = {}) => ({ id: docNo, docNo, year: '2026', status, sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R162-0717' }], ...extra })
  const unknown = { id: 'CPREF4', reference: 'CPREF4', status: 'created', sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R162-0717' }], sapUnknown: { step: 'create', status: 'created' } }
  const creating = { id: 'CPREF5', reference: 'CPREF5', status: 'creating', startedAt: clock.now, sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R162-0717' }] }
  const setDocs = docs => repo.changePiDocs('TCD', id, () => ({ all: Object.fromEntries(docs.map(item => [item.id, item])) }))

  const resets = [
    [[doc('105000960', 'printed')], 'R162-0717 has SAP document 105000960. Delete it in SAP (MI02) first.'],
    [[doc('105000960', 'counted')], 'R162-0717 has SAP document 105000960 with a quantity entered. Post it (Post).'],
    [[unknown], 'R162-0717 has an unknown SAP document (reference CPREF4). A manager must resolve it first.'],
    [[creating], 'R162-0717 is getting a SAP document (reference CPREF5). Wait until it is created.'],
  ]
  for (const [docs, expected] of resets) {
    await setDocs(docs)
    const detail = await refusal(anna.setApproval(ADA, id, { material: 'R162-0717', status: 'reset' }), 'PIDOC_ACTIVE')
    assert.equal(english('PIDOC_ACTIVE', detail), expected, detail)
  }
  assert.equal(english('PIDOC_ACTIVE', 'INT1-0 er godkendt med tællelinjer med antal og har SAP-dokument 105000939. Slet det i SAP (MI02), nulstil materialet, slet linjen og godkend igen.'), 'INT1-0 was approved with count lines with a quantity and has SAP document 105000939. Delete it in SAP (MI02), reset the material, delete the line and approve again.')

  const deletes = [
    [[doc('105000960', 'created')], 'These SAP documents are not posted: 105000960. Delete it in SAP (MI02).'],
    [[doc('105000960', 'printed'), doc('105000961', 'created')], 'These SAP documents are not posted: 105000960, 105000961. Delete them in SAP (MI02).'],
    [[doc('105000960', 'counted')], 'These SAP documents are not posted: 105000960. Post it (Post).'],
    [[doc('105000960', 'counted'), doc('105000961', 'counted')], 'These SAP documents are not posted: 105000960, 105000961. Post them (Post).'],
    [[unknown], 'These SAP documents are not posted: reference CPREF4. A manager must resolve it.'],
    [[creating], 'These SAP documents are not posted: reference CPREF5. Wait until it is created.'],
    [[doc('105000960', 'printed'), doc('105000961', 'counted'), unknown], 'These SAP documents are not posted: 105000960, 105000961, reference CPREF4. Delete the created and printed ones in SAP (MI02), post the counted ones (Post), let a manager resolve the unknown ones and wait for the ones being created.'],
  ]
  for (const [docs, expected] of deletes) {
    await setDocs(docs)
    const detail = await refusal(anna.deleteCount(ANNA, id), 'COUNT_PIDOCS_ACTIVE')
    assert.equal(english('COUNT_PIDOCS_ACTIVE', detail), expected, detail)
  }
})