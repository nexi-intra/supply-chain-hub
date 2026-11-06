const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { registerWarehouse } = require('./register.cjs')

function setup({ clipboard = { readText: () => '', writeText: () => {} } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-register-'))
  for (const team of ['TCD', 'TRR', 'PIM']) fs.mkdirSync(path.join(root, team))
  const handlers = new Map()
  const ipcMain = { handle: (channel, listener) => handlers.set(channel, listener) }
  const users = { 'mona@nexi.test': { email: 'mona@nexi.test', fullName: 'Mona Berg', role: 'manager', status: 'approved' }, 'anna@nexi.test': { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', status: 'approved' } }
  const actors = {
    mona: { email: 'mona@nexi.test', role: 'manager', activeTeam: { teamId: 'TCD', folderName: 'TCD' } },
    anna: { email: 'anna@nexi.test', role: 'user', activeTeam: { teamId: 'TCD', folderName: 'TCD' } },
    pim: { email: 'mona@nexi.test', role: 'manager', activeTeam: { teamId: 'PIM', folderName: 'PIM' } },
  }
  const broadcasts = []
  const registered = registerWarehouse({
    ipcMain,
    currentActor: async event => actors[event.who],
    teamUsers: async () => users,
    teamDir: team => path.join(root, team),
    platformRoot: () => root,
    userDataDir: path.join(root, '_user'),
    electron: { clipboard, dialog: {}, shell: {}, BrowserWindow: {} },
    broadcast: (channel, payload) => broadcasts.push([channel, payload]),
    // Fake SAP (fixture files): background description lookups must never reach a real SAP from a test.
    isPackaged: false,
    env: { TCD_HUB_SAP_FIXTURES_DIR: path.join(__dirname, 'fixtures', 'sap') },
  })
  const call = (who, channel, payload) => handlers.get(`warehouse:${channel}`)({ who, sender: { id: 1 } }, payload)
  return { root, handlers, registered, call, broadcasts }
}

test('every Optælling channel is registered once under "warehouse:"', () => {
  const { handlers, registered } = setup()
  assert.equal(handlers.size, registered.channels.length)
  assert.ok(registered.channels.length >= 65, `${registered.channels.length} channels`)
  for (const channel of ['me', 'counts:list', 'statuses:archive', 'pidocs:post', 'sap-check:run', 'sap:show-doc']) assert.ok(handlers.has(`warehouse:${channel}`), channel)
  assert.equal([...handlers.keys()].some(channel => /^warehouse:(auth|updates|app):/.test(channel)), false, 'no own login or updates inside the Hub')
})

test('the open hub is the team: a TCD user gets TCD and its storage locations, other hubs are refused', async () => {
  const { call } = setup()
  assert.deepEqual(await call('anna', 'me'), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', team: 'TCD', storageLocations: ['D000', 'D004', 'D005', 'D006', 'D102', 'D103', 'D104', 'D105', 'D106'] })
  await assert.rejects(call('pim', 'me'), /^Error: WAREHOUSE_TEAM_NOT_ALLOWED$/)
  await assert.rejects(call('pim', 'counts:list'), /WAREHOUSE_TEAM_NOT_ALLOWED/)
})

test('copying answers only when the text is on the (async, Electron 44) clipboard', async () => {
  const clipboard = { current: '' }
  clipboard.readText = async () => clipboard.current
  clipboard.writeText = text => new Promise(resolve => setTimeout(() => { clipboard.current = text; resolve() }, 5))
  const { call } = setup({ clipboard })
  assert.deepEqual(await call('anna', 'clipboard:write', { text: 'NCC202796019' }), { ok: true })
  assert.equal(clipboard.current, 'NCC202796019')
})

test('data is written to "<team folder>\\lagerstyring", never next to the Hub\'s own keys', async () => {
  const { root, call } = setup()
  await assert.rejects(call('anna', 'statuses:start', { year: 2026, quarter: 4 }), /MANAGER_ONLY/)
  const status = await call('mona', 'statuses:start', { year: 2026, quarter: 4 })
  assert.equal(status.state, 'open')
  assert.ok(fs.readdirSync(path.join(root, 'TCD', 'lagerstyring')).length > 0)
  assert.deepEqual(fs.readdirSync(path.join(root, 'TCD')), ['lagerstyring'])
  assert.equal((await call('anna', 'statuses:overview')).active.name, status.name)
})

test('Hubert reads Optælling through the same services and Hub user: TCD gets the live figures, other hubs are refused, nothing is written', async () => {
  const { root, call, registered } = setup()
  const status = await call('mona', 'statuses:start', { year: 2026, quarter: 4 })
  const dir = path.join(root, 'TCD', 'lagerstyring')
  const files = () => Object.fromEntries(fs.readdirSync(dir).map(name => [name, fs.readFileSync(path.join(dir, name), 'utf8')]))
  const before = files()
  const answer = await registered.assistant.answer({ event: { who: 'anna', sender: { id: 1 } }, question: 'hvor langt er optællingen?', language: 'da' })
  assert.match(answer.text, new RegExp(status.name))
  assert.deepEqual(answer.navigation.params, { itemId: `status:${status.id}` })
  assert.deepEqual(files(), before, 'asking Hubert writes nothing')
  const refused = await registered.assistant.answer({ event: { who: 'pim', sender: { id: 1 } }, question: 'hvor langt er optællingen?', language: 'da' })
  assert.match(refused.text, /kun i TCD- og TRR-hubben/)
  assert.equal(fs.existsSync(path.join(root, 'PIM', 'lagerstyring')), false)
  assert.equal(await registered.assistant.answer({ event: { who: 'anna', sender: { id: 1 } }, question: 'hvem har ferie i dag?', language: 'da' }), null)
})

const LOCATION_CHANNELS = ['overview', 'lookup-document', 'suggest', 'put-away', 'take', 'refill', 'move', 'change-sloc', 'edit-pallet', 'search', 'material-card', 'location-card', 'pallet-card', 'list', 'stamp', 'log', 'undo', 'rack-card', 'shelf-put', 'shelf-take', 'shelf-move', 'shelf-set', 'create-rack', 'add-shelf', 'delete-locations', 'set-active-many', 'create-location', 'create-series', 'edit-location', 'set-active', 'set-tags', 'preview-import', 'apply-import', 'map-contents',
  'layout', 'layout-draft', 'layout-preview', 'layout-versions', 'layout-start-draft', 'layout-save-draft', 'layout-discard-draft', 'layout-publish', 'layout-open-version']

test('the drawing is reached over IPC without the local queue; only a publish tells the windows', async () => {
  const { call, broadcasts } = setup()
  assert.deepEqual(await call('anna', 'locations:layout'), { layout: null })
  await assert.rejects(call('anna', 'locations:layout-start-draft'), /LOCATIONS_MANAGER_ONLY/)
  const { draft } = await call('mona', 'locations:layout-start-draft')
  assert.equal(draft.basedOn, 0)
  assert.equal((await call('mona', 'locations:layout-preview')).counts.create, 0)
  assert.deepEqual(broadcasts.filter(([channel]) => channel === 'warehouse:locations:changed'), [])
  await assert.rejects(call('mona', 'locations:layout-publish', { rev: draft.rev + 1 }), /LAYOUT_STALE/)
  const published = await call('mona', 'locations:layout-publish', { rev: draft.rev })
  assert.equal(published.version, 1)
  assert.deepEqual(broadcasts.filter(([channel]) => channel === 'warehouse:locations:changed').map(([, payload]) => payload), [{ team: 'TCD' }])
  assert.equal((await call('anna', 'locations:layout')).layout.version, 1)
  assert.deepEqual((await call('anna', 'locations:list')).drawing, { version: 1, linked: [] })
  await assert.rejects(call('mona', 'locations:layout-publish'), /LAYOUT_NO_DRAFT/)
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 0, failures: [] })
})

test('every Placeringer channel is registered under "warehouse:locations:" and data lands in <team>\\lagerstyring\\placeringer', async () => {
  const { root, handlers, call, broadcasts } = setup()
  for (const channel of LOCATION_CHANNELS) assert.ok(handlers.has(`warehouse:locations:${channel}`), channel)
  assert.equal(handlers.has('warehouse:locations:mark-empty'), false, 'no "run empty" any more')
  await assert.rejects(call('anna', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 1 }), /LOCATIONS_MANAGER_ONLY/)
  await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 1 })
  const { created } = await call('anna', 'locations:put-away', { pallets: [{ location: 'a2.4', material: 'R162-0717', quantity: 50 }] })
  assert.equal(created.length, 1)
  assert.ok(fs.readdirSync(path.join(root, 'TCD', 'lagerstyring', 'placeringer')).length > 0)
  assert.deepEqual(fs.readdirSync(path.join(root, 'TCD')), ['lagerstyring'])
  assert.deepEqual(broadcasts.filter(([channel]) => channel === 'warehouse:locations:changed').map(([, payload]) => payload), [{ team: 'TCD' }, { team: 'TCD' }], 'every change tells the windows')
  const overview = await call('anna', 'locations:overview')
  assert.equal(overview.counts.pallets, 1)
  assert.equal((await call('anna', 'locations:search', { query: 'A2' })).locations[0].id, 'A2.4')
})

test('another hub is refused on the Placeringer channels', async () => {
  const { root, call } = setup()
  await assert.rejects(call('pim', 'locations:overview'), /WAREHOUSE_TEAM_NOT_ALLOWED/)
  await assert.rejects(call('pim', 'locations:create-location', { name: 'A1', type: 'Palle', purpose: 'reserve', capacity: 1 }), /WAREHOUSE_TEAM_NOT_ALLOWED/)
  assert.equal(fs.existsSync(path.join(root, 'PIM', 'lagerstyring')), false)
})

test('daily Placeringer actions go through the local queue: the same action id is applied once', async () => {
  const { call } = setup()
  await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 2 })
  const first = await call('anna', 'locations:put-away', { actionId: 'act-1', pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 50 }] })
  assert.equal(first.created.length, 1)
  assert.deepEqual(await call('anna', 'locations:put-away', { actionId: 'act-1', pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 50 }] }), { duplicate: true })
  assert.equal((await call('anna', 'locations:overview')).counts.pallets, 1)
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 0, failures: [] })
})

test('Hubert answers Placeringer questions first and still answers Optælling questions', async () => {
  const { call, registered } = setup()
  await call('mona', 'locations:create-location', { name: 'A2.1', type: 'Palle', purpose: 'reserve', capacity: 1 })
  await call('anna', 'locations:put-away', { pallets: [{ location: 'A2.1', material: 'R162-0717', quantity: 1120 }] })
  const where = await registered.assistant.answer({ event: { who: 'anna', sender: { id: 1 } }, question: 'hvor henter jeg R162-0717?', language: 'da' })
  assert.match(where.text, /A2\.1/)
  assert.deepEqual(where.navigation.params, { tab: 'locations', itemId: 'material:R162-0717' })
  const status = await registered.assistant.answer({ event: { who: 'anna', sender: { id: 1 } }, question: 'hvor langt er optællingen?', language: 'da' })
  assert.doesNotMatch(status.text, /A2\.1/)
})

test('a manager makes a colleague Placerings admin over IPC; that person may then maintain locations and undo', async () => {
  const { call, handlers } = setup()
  assert.ok(handlers.has('warehouse:roles:set-location-admin'))
  assert.deepEqual(await call('anna', 'roles:me'), { role: 'user', locationAdmin: false })
  await assert.rejects(call('anna', 'roles:set-location-admin', { email: 'anna@nexi.test', admin: true }), /MANAGER_ONLY/)
  assert.deepEqual(await call('mona', 'roles:set-location-admin', { email: 'anna@nexi.test', admin: true }), { email: 'anna@nexi.test', locationAdmin: true })
  assert.deepEqual(await call('anna', 'roles:me'), { role: 'user', locationAdmin: true })
  await call('anna', 'locations:create-location', { name: 'A2.1', type: 'Palle', purpose: 'reserve', capacity: 1 })
  await call('anna', 'locations:put-away', { actionId: 'p-1', pallets: [{ location: 'A2.1', material: 'R162-0717', quantity: 10 }] })
  const log = await call('anna', 'locations:log')
  const put = log.events.find(event => event.type === 'putaway')
  assert.equal(put.canUndo, true)
  assert.deepEqual(await call('anna', 'locations:undo', { actionId: 'u-1', eventId: put.id }), { undone: 1 })
  assert.equal((await call('anna', 'locations:overview')).counts.pallets, 0)
})

test('shelf work goes through the local queue (applied once), and racks and deletion are reached over IPC', async () => {
  const { call } = setup()
  await assert.rejects(call('anna', 'locations:create-rack', { name: 'E9', shelves: 2 }), /LOCATIONS_MANAGER_ONLY/)
  assert.equal((await call('mona', 'locations:create-rack', { name: 'E9', shelves: 2 })).created.length, 2)
  const first = await call('anna', 'locations:shelf-put', { actionId: 'sh-1', location: 'E9 H1', material: 'R162-0717', quantity: 40 })
  assert.equal(first.line.quantity, 40)
  assert.deepEqual(await call('anna', 'locations:shelf-put', { actionId: 'sh-1', location: 'E9 H1', material: 'R162-0717', quantity: 40 }), { duplicate: true })
  await call('anna', 'locations:shelf-move', { actionId: 'sh-2', from: 'E9 H1', to: 'E9 H2', material: 'R162-0717', quantity: 10 })
  await call('anna', 'locations:shelf-take', { actionId: 'sh-3', location: 'E9 H2', material: 'R162-0717', quantity: 4 })
  await call('anna', 'locations:shelf-set', { actionId: 'sh-4', location: 'E9 H1', material: 'R162-0717', quantity: 29 })
  const rack = await call('anna', 'locations:rack-card', { rack: 'E9' })
  assert.deepEqual(rack.shelves.map(item => item.stock.map(line => line.quantity)), [[6], [29]])
  assert.equal((await call('mona', 'locations:add-shelf', { rack: 'E9' })).location.name, 'E9 H3')
  assert.deepEqual(await call('mona', 'locations:delete-locations', { locations: ['E9 H3', 'E9 H2'] }), { deleted: ['E9 H3'], kept: [{ name: 'E9 H2', reason: 'Der står 1 materiale på E9 H2' }] })
  assert.deepEqual(await call('mona', 'locations:set-active-many', { locations: ['E9 H1'], active: false }), { changed: 1 })
})
