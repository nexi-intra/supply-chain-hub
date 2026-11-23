const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { registerWarehouse } = require('./register.cjs')
const { createStore } = require('../store.cjs')
const { createArrivalOrder } = require('../ipcArrivals.cjs')

function setup({ clipboard = { readText: () => '', writeText: () => {} }, env = {}, root = null, arrivals, outboxOptions, teamUsers, teamDir, storageConnected } = {}) {
  if (!root) {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-register-'))
    for (const team of ['TCD', 'TRR', 'PIM']) fs.mkdirSync(path.join(root, team))
  }
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
    // `delay`: this call's user lookup is slow (read from M:).
    currentActor: async event => { if (event.delay) await new Promise(resolve => setTimeout(resolve, event.delay)); return actors[event.who] },
    teamUsers: teamUsers || (async () => users),
    teamDir: teamDir || (team => path.join(root, team)),
    platformRoot: () => root,
    ...(storageConnected ? { storageConnected } : {}),
    userDataDir: path.join(root, '_user'),
    electron: { clipboard, dialog: {}, shell: {}, BrowserWindow: {} },
    broadcast: (channel, payload) => broadcasts.push([channel, payload]),
    // Fake SAP (fixture files): background description lookups must never reach a real SAP from a test.
    isPackaged: false,
    env: { TCD_HUB_SAP_FIXTURES_DIR: path.join(__dirname, 'fixtures', 'sap'), ...env },
    ...(arrivals ? { arrivals } : {}),
    ...(outboxOptions ? { outboxOptions } : {}),
  })
  const call = (who, channel, payload) => handlers.get(`warehouse:${channel}`)({ who, sender: { id: 1 } }, payload)
  // As main.cjs: every call is numbered the moment it arrives, before its user is looked up.
  const send = (who, channel, payload, delay = 0) => {
    const event = { who, sender: { id: 1 }, delay }
    arrivals?.arrive(`warehouse:${channel}`, event)
    return Promise.resolve(handlers.get(`warehouse:${channel}`)(event, payload)).finally(() => arrivals?.leave(event))
  }
  return { root, handlers, registered, call, send, broadcasts }
}

test('every Optælling channel is registered once under "warehouse:"', () => {
  const { handlers, registered } = setup()
  assert.equal(handlers.size, registered.channels.length)
  assert.ok(registered.channels.length >= 65, `${registered.channels.length} channels`)
  for (const channel of ['me', 'counts:list', 'statuses:archive', 'pidocs:post', 'sap-check:run', 'sap:show-doc']) assert.ok(handlers.has(`warehouse:${channel}`), channel)
  assert.equal([...handlers.keys()].some(channel => /^warehouse:(auth|updates|app):/.test(channel)), false, 'no own login or updates inside the Hub')
})

test('"Tjek SAP-fejl" over IPC: the check is saved in the shared store and the mail to the SAP team is recorded', async () => {
  const outlookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-register-outlook-'))
  const { root, call } = setup({ env: { TCD_HUB_OUTLOOK_FAKE_DIR: outlookDir } })
  const check = await call('mona', 'sap-check:run', { scope: 'TCD' })
  assert.ok(check.errors.length > 0, 'the fixture SAP data has errors to mail')
  const overview = await call('mona', 'sap-check:overview')
  assert.equal(overview.latest.id, check.id)
  assert.deepEqual(overview.history.map(entry => entry.id), [check.id])
  assert.equal((await createStore(path.join(root, '_lagerstyring')).getAsync(`sap-tjek-${check.id}`))?.id, check.id, 'the check lives in the shared store of the platform root')

  await call('mona', 'sap-check:settings', { to: 'sap-team@nexi.test', cc: '', language: 'da' })
  const mail = await call('mona', 'sap-check:mail', { id: check.id, mode: 'all', scope: 'D301' })
  assert.equal(mail.count, check.errors.length)
  assert.equal(fs.readdirSync(outlookDir).length, 1, 'one draft')
  const after = await call('mona', 'sap-check:overview')
  assert.equal(after.latest.mail.count, mail.count)
  assert.equal(after.latest.mails.length, 1, 'the mail is recorded once')
  assert.equal(after.history[0].mail.file, mail.file)
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

test('Windows refusing the clipboard (Electron 44 still resolves) is CLIPBOARD_REFUSED, never "copied"', async () => {
  const clipboard = { current: '37', refuse: false }
  clipboard.readText = async () => clipboard.current
  clipboard.writeText = async text => { if (!clipboard.refuse) clipboard.current = text }
  const { call } = setup({ clipboard })
  await call('mona', 'statuses:start', { year: 2026, quarter: 4 })
  const preview = await call('anna', 'counts:preview', { scope: { type: 'slocs', slocs: ['D000'] } })
  const { id } = await call('anna', 'counts:create', { token: preview.token, name: 'D000' })
  await call('anna', 'counts:scan', { id, serial: 'NCC202796019', place: 'A1.1' })
  await call('anna', 'counts:scan', { id, serial: 'NCC202796020', place: 'A1.1' })
  const row = { id, material: 'INT4300-4921-0', sloc: 'D000', stockType: 'unrestricted' }

  clipboard.refuse = true
  await assert.rejects(call('anna', 'clipboard:write', { text: '42' }), /^Error: CLIPBOARD_REFUSED$/)
  await assert.rejects(call('anna', 'counts:copy-serials', row), /^Error: CLIPBOARD_REFUSED$/)
  assert.equal(clipboard.current, '37', 'the previous value is still there, and the window was told')
  const resolves = clipboard.writeText
  clipboard.writeText = () => Promise.reject(new Error('OpenClipboard failed'))
  await assert.rejects(call('anna', 'clipboard:write', { text: '42' }), /^Error: CLIPBOARD_REFUSED$/)
  clipboard.writeText = resolves

  clipboard.refuse = false
  assert.deepEqual(await call('anna', 'clipboard:write', { text: '42' }), { ok: true })
  assert.equal((await call('anna', 'counts:copy-serials', row)).total, 2)
  assert.equal(clipboard.current, 'NCC202796019\r\nNCC202796020')
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
  // The publish starts the next draft on the new drawing; publishing it needs its own preview (revision) first.
  assert.equal(published.draft.basedOn, 1)
  await assert.rejects(call('mona', 'locations:layout-publish'), /LAYOUT_STALE/)
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
  const { call, registered } = setup()
  await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 2 })
  const first = await call('anna', 'locations:put-away', { actionId: 'act-1', pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 50 }] })
  assert.equal(first.created.length, 1)
  assert.deepEqual(await call('anna', 'locations:put-away', { actionId: 'act-1', pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 50 }] }), { duplicate: true })
  assert.equal((await call('anna', 'locations:overview')).counts.pallets, 1)
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 0, failures: [] })
  assert.equal(registered.hasPendingWrites(), false)
  assert.equal(await registered.whenWritesSettled(1000), true)
})

test('a daily action that finds M: busy (KV_LOCK_BUSY) is kept on this PC instead of refused, and applied once when replayed', async () => {
  const { root, call, registered, broadcasts } = setup()
  await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 1 })
  const { created: [pallet] } = await call('anna', 'locations:put-away', { pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 100 }] })
  const take = registered.locations.take
  // The store gives up on the locks before anything is written (fileLock.cjs withFileLocksAsync).
  registered.locations.take = async () => { throw Object.assign(new Error('KV_LOCK_BUSY: Lageret er optaget af en anden klient. Prøv igen.'), { code: 'KV_LOCK_BUSY' }) }
  assert.deepEqual(await call('anna', 'locations:take', { actionId: 'busy-1', pallet: pallet.id, quantity: 30 }), { queued: true })
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 1, failures: [] }, 'queued, not a failure')
  assert.equal(registered.hasPendingWrites(), false, 'safe on this PC: closing the window does not wait for M:')
  assert.equal(await registered.whenWritesSettled(20), true)
  assert.deepEqual(broadcasts.filter(([channel]) => channel === 'warehouse:locations:queued').map(([, payload]) => payload), [{ team: 'TCD' }], 'the windows show the waiting banner at once')
  registered.locations.take = take
  registered.closeAll()
  // Started again on the same PC: the queue is replayed at once.
  const again = setup({ root })
  for (let waited = 0; (await again.call('anna', 'locations:pending')).pending && waited < 5000; waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
  assert.deepEqual(await again.call('anna', 'locations:pending'), { pending: 0, failures: [] })
  assert.deepEqual(await again.call('anna', 'locations:take', { actionId: 'busy-1', pallet: pallet.id, quantity: 30 }), { duplicate: true })
  assert.equal((await again.call('anna', 'locations:pallet-card', { pallet: pallet.id })).pallet.quantity, 70, 'taken once')
  again.registered.closeAll()
})

test('a Hub started before M: is reachable keeps the waiting Placeringer actions and replays them once M: is back', async () => {
  const { root, call, registered } = setup()
  await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 1 })
  const { created: [pallet] } = await call('anna', 'locations:put-away', { pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 100 }] })
  const take = registered.locations.take
  registered.locations.take = async () => { throw Object.assign(new Error('KV_LOCK_BUSY'), { code: 'KV_LOCK_BUSY' }) }
  assert.deepEqual(await call('anna', 'locations:take', { actionId: 'kept-1', pallet: pallet.id, quantity: 30 }), { queued: true })
  registered.locations.take = take
  await registered.closeAll()
  // Started again with M: away: the Hub fell back to its local data folder, which has no team registry.
  let connected = false
  const fallback = team => {
    if (!connected) throw Object.assign(new Error('AUTH_FORBIDDEN'), { code: 'AUTH_FORBIDDEN' })
    return path.join(root, team)
  }
  const again = setup({ root, teamDir: fallback, storageConnected: () => connected })
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.deepEqual(await again.call('anna', 'locations:pending'), { pending: 1, failures: [] }, 'still waiting, not thrown away')
  // An action handed in meanwhile waits behind it instead of running the queue against the local folder.
  assert.deepEqual(await again.call('anna', 'locations:take', { actionId: 'kept-2', pallet: pallet.id, quantity: 10 }), { queued: true })
  assert.deepEqual(await again.call('anna', 'locations:pending'), { pending: 2, failures: [] })
  connected = true
  again.registered.replayWrites()
  for (let waited = 0; (await again.call('anna', 'locations:pending')).pending && waited < 5000; waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
  assert.deepEqual(await again.call('anna', 'locations:pending'), { pending: 0, failures: [] })
  assert.equal((await again.call('anna', 'locations:pallet-card', { pallet: pallet.id })).pallet.quantity, 60, 'both applied once')
  await again.registered.closeAll()
})

test('Placeringer actions sent at once run in the order the window sent them, also when an earlier one waits longer for its user', async () => {
  const { call, send, registered } = setup({ arrivals: createArrivalOrder() })
  await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 2 })
  const ran = []
  for (const method of ['createLocation', 'putAway', 'take']) {
    const original = registered.locations[method]
    registered.locations[method] = async (user, request) => { ran.push(request.actionId || request.name); return original(user, request) }
  }
  // A place made by an admin and pallets put on it at once: the put-aways must not overtake the place.
  const results = await Promise.all([
    send('mona', 'locations:create-location', { name: 'G1', type: 'Gulv', purpose: 'reserve' }, 60),
    send('anna', 'locations:put-away', { actionId: 'p1', pallets: [{ location: 'G1', material: 'R162-0717', quantity: 10 }] }, 30),
    send('anna', 'locations:put-away', { actionId: 'p2', pallets: [{ location: 'G1', material: 'R162-0717', quantity: 20 }] }),
  ])
  assert.deepEqual(ran, ['G1', 'p1', 'p2'])
  assert.deepEqual(results.slice(1).map(result => result.created.length), [1, 1])
  const [pallet] = results[1].created
  ran.length = 0
  await Promise.all([
    send('anna', 'locations:take', { actionId: 't1', pallet: pallet.id, quantity: 4 }, 40),
    send('anna', 'locations:take', { actionId: 't2', pallet: pallet.id }),
  ])
  assert.deepEqual(ran, ['t1', 't2'], 'take part, then the rest')
  assert.equal(registered.hasPendingWrites(), false)
  registered.closeAll()
})
test('a put-away on a place made just before it waits for that place, also when it was kept while M: was busy and is replayed', async () => {
  const { call, send, registered } = setup({ arrivals: createArrivalOrder(), outboxOptions: { busyPauseMs: 200, busyJitterMs: 0 } })
  await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 1 })
  const { created: [pallet] } = await call('anna', 'locations:put-away', { pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 100 }] })
  const take = registered.locations.take
  registered.locations.take = async () => { registered.locations.take = take; throw Object.assign(new Error('KV_LOCK_BUSY'), { code: 'KV_LOCK_BUSY' }) }
  const create = registered.locations.createLocation
  registered.locations.createLocation = async (user, request) => { await new Promise(resolve => setTimeout(resolve, 800)); return create(user, request) }
  const [taken, made] = await Promise.all([
    send('anna', 'locations:take', { actionId: 't1', pallet: pallet.id, quantity: 30 }),
    send('mona', 'locations:create-location', { name: 'G1', type: 'Gulv', purpose: 'reserve' }),
    send('anna', 'locations:put-away', { actionId: 'p1', pallets: [{ location: 'G1', material: 'R162-0717', quantity: 10 }] }),
  ])
  assert.deepEqual(taken, { queued: true })
  assert.equal(made.location.name, 'G1')
  for (let waited = 0; (await call('anna', 'locations:pending')).pending && waited < 5000; waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 0, failures: [] }, 'the put-away was not replayed before G1 existed')
  assert.equal((await call('anna', 'locations:location-card', { location: 'G1' })).pallets.length, 1)
  assert.equal((await call('anna', 'locations:pallet-card', { pallet: pallet.id })).pallet.quantity, 70)
  registered.closeAll()
})

test('the team user list is used at once when it is older than 30 s and read again in the background', async () => {
  const realNow = Date.now
  let clock = realNow()
  Date.now = () => clock
  try {
    const users = { 'anna@nexi.test': { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', status: 'approved' } }
    let reads = 0
    let hang = false
    const teamUsers = async () => { reads++; if (hang) await new Promise(() => {}); return users }
    const { call } = setup({ teamUsers })
    assert.equal((await call('anna', 'me')).fullName, 'Anna Holm', 'the first read waits: nothing is known yet')
    clock += 31000
    hang = true
    const before = reads
    const answer = await Promise.race([call('anna', 'me'), new Promise(resolve => setTimeout(() => resolve('blocked'), 1000))])
    assert.notEqual(answer, 'blocked', 'a slow M: does not hold the call up')
    assert.equal(answer.fullName, 'Anna Holm')
    assert.equal(reads, before + 1, 'read again in the background')
    await call('anna', 'me')
    assert.equal(reads, before + 1, 'one read at a time')
  } finally {
    Date.now = realNow
  }
})
test('a pallet edit keeps what the dialog showed (expected) through the local queue, so a stale edit is refused', async () => {
  const { call } = setup()
  await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 1 })
  const { created: [pallet] } = await call('anna', 'locations:put-away', { pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 100 }] })
  await call('mona', 'locations:take', { pallet: pallet.id, quantity: 30 })
  await assert.rejects(call('anna', 'locations:edit-pallet', { actionId: 'edit-1', pallet: pallet.id, changes: { quantity: 90 }, expected: { quantity: 100 } }), /PALLET_CHANGED/)
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

const SOFTWARELOAD_CHANNELS = ['status', 'start', 'edit', 'scan', 'unscan', 'mark-failed', 'unmark-failed', 'pause', 'resume', 'cancel', 'versions',
  'preview', 'finish', 'continue', 'stop', 'pending-preview', 'abandon', 'kif-preview', 'kif-move', 'search', 'tasks']

test('softwareload channels are registered and starting Stempelkort pauses a running softwareload task', async () => {
  const { root, handlers, call } = setup()
  for (const channel of SOFTWARELOAD_CHANNELS) assert.ok(handlers.has(`warehouse:softwareload:${channel}`), channel)
  const started = await call('anna', 'softwareload:start', { type: 'sw', target: 'd006', version: '4.2.1' })
  assert.equal(started.target, 'D006')
  assert.deepEqual(await call('anna', 'softwareload:scan', { serial: 'ncc1', taskId: started.id }), { serial: 'NCC1', count: 1 })
  await assert.rejects(call('anna', 'softwareload:scan', { serial: 'NCC1', taskId: started.id }), /^Error: SOFTWARELOAD_DUPLICATE: /)
  await assert.rejects(call('anna', 'softwareload:scan', { serial: 'NCC2', taskId: 'an-old-task' }), /^Error: SOFTWARELOAD_NOT_RUNNING: /)
  const edited = await call('anna', 'softwareload:edit', { type: 'key', kif: 'yes', target: 'd004', version: '4.2.2', taskId: started.id })
  assert.deepEqual([edited.type, edited.kif, edited.target, edited.version], ['key', false, 'D004', '4.2.2'], 'only kif: true puts the task in KIF')
  await assert.rejects(call('anna', 'softwareload:edit', { type: 'key', target: 'D004', version: '4.2.2', taskId: 'an-old-task' }), /^Error: SOFTWARELOAD_NOT_RUNNING: /)
  const clock = await call('anna', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  assert.equal(clock.taskName, 'Lager')
  assert.deepEqual([clock.pausedSoftwareload?.id, clock.pausedSoftwareload?.paused, clock.softwareloadPauseFailed], [started.id, true, undefined], 'Stempelkort says it paused the task')
  const { running } = await call('anna', 'softwareload:status')
  assert.equal(running.paused, true)
  assert.deepEqual(running.terminals.map(terminal => terminal.serial), ['NCC1'])
  assert.ok(fs.readdirSync(path.join(root, 'TCD', 'lagerstyring', 'softwareload')).length > 0)
  // PS4 (the default system) may move terminals since 2026-11-23.
  assert.equal((await call('anna', 'softwareload:status')).writeEnabled, true)
  assert.deepEqual(await call('anna', 'softwareload:search', { serial: 'NCC1' }), { lines: [], unreadable: 0 })
  assert.deepEqual(await call('anna', 'softwareload:versions'), ['4.2.2', '4.2.1'])
  await assert.rejects(call('pim', 'softwareload:status'), /WAREHOUSE_TEAM_NOT_ALLOWED/)
})

test('softwareload:finish passes the chosen end time on, and only a number', async () => {
  const { call } = setup()
  const started = await call('anna', 'softwareload:start', { type: 'sw', target: 'd006', version: '4.2.1' })
  const confirmed = { taskId: started.id, choice: { type: 'sw', kif: false, target: 'D006', version: '4.2.1' }, planned: { transfers: [], blocks: [] } }
  await assert.rejects(call('anna', 'softwareload:finish', { ...confirmed, endAt: started.startedAt - 1 }), /^Error: SOFTWARELOAD_INVALID: Sluttiden skal ligge mellem/)
  assert.equal((await call('anna', 'softwareload:status')).running.id, started.id, 'the task still runs')
  await assert.rejects(call('anna', 'softwareload:finish', { taskId: confirmed.taskId, choice: confirmed.choice }), /^Error: SOFTWARELOAD_PLAN_CHANGED: /, 'the SAP steps the user saw are passed on')
  const finished = await call('anna', 'softwareload:finish', { ...confirmed, endAt: 'i går' })
  assert.equal(finished.state, 'faerdig', 'an end time that is not a number is left out')
})

test('Stempelkort and softwareload never count the same time: resuming one stops or pauses the other', async () => {
  const { root, call } = setup()
  await call('anna', 'softwareload:start', { type: 'sw', target: 'd006', version: '4.2.1' })
  await call('anna', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  const resumed = await call('anna', 'softwareload:resume')
  assert.deepEqual([resumed.paused, resumed.stoppedTimeclock?.taskName], [false, 'Lager'], 'resuming the task stops Stempelkort, as starting it does')
  assert.equal((await call('anna', 'timeclock:status')).running, null)

  // Stempelkort on a break while the task runs (another PC, an older version): resuming Stempelkort pauses the task.
  await call('anna', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  await call('anna', 'timeclock:pause')
  const store = createStore(path.join(root, 'TCD', 'lagerstyring', 'softwareload'))
  const [key] = (await store.keysAsync()).filter(name => name.startsWith('aktiv-'))
  await store.mutateAsync(key, task => ({ ...task, pauses: task.pauses.map(pause => ({ ...pause, to: pause.to ?? Date.now() })) }))
  await call('anna', 'timeclock:resume')
  const task = await store.getAsync(key, { skipCache: true })
  assert.equal(task.pauses.at(-1).to, null, 'the task is on a break again')
})

test('Stempelkort says when it could not pause the softwareload task, and still starts', async () => {
  const { root, call } = setup()
  const none = await call('anna', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  assert.deepEqual([none.pausedSoftwareload, none.softwareloadPauseFailed], [null, undefined], 'no task, nothing to say')
  await call('anna', 'softwareload:start', { type: 'sw', target: 'd006', version: '4.2.1' })
  // The running task cannot be read, as when M: answers with a broken file.
  const dir = path.join(root, 'TCD', 'lagerstyring', 'softwareload')
  const [file] = fs.readdirSync(dir).filter(name => name.startsWith('aktiv-'))
  fs.writeFileSync(path.join(dir, file), '{ broken')
  const started = await call('anna', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  assert.deepEqual([started.taskName, started.pausedSoftwareload, started.softwareloadPauseFailed], ['Lager', null, true])
  await call('anna', 'timeclock:pause')
  const resumed = await call('anna', 'timeclock:resume')
  assert.deepEqual([resumed.paused, resumed.pausedSoftwareload, resumed.softwareloadPauseFailed], [false, null, true])
})

test('the CountPoint role of a user is read once per 30 s, and again at once after a role change through this Hub', async () => {
  const realNow = Date.now
  const realReadFile = fs.promises.readFile
  let clock = realNow()
  let reads = 0
  Date.now = () => clock
  fs.promises.readFile = (file, ...rest) => {
    if (path.basename(String(file)).startsWith('roller')) reads++
    return realReadFile(file, ...rest)
  }
  try {
    const { call } = setup()
    await call('mona', 'roles:set-role', { email: 'anna@nexi.test', role: 'admin' })
    clock += 4000
    reads = 0
    assert.equal((await call('anna', 'me')).role, 'user')
    clock += 4000
    assert.equal((await call('anna', 'me')).role, 'user')
    assert.equal(reads, 1, 'the second call within 30 s uses the cached role')
    await call('mona', 'roles:set-role', { email: 'anna@nexi.test', role: 'status-manager' })
    assert.equal((await call('anna', 'me')).role, 'manager', 'a role change through this Hub is seen at once')
  } finally {
    Date.now = realNow
    fs.promises.readFile = realReadFile
  }
})

test('a status manager removed on another PC does not keep the rights while the roles file cannot be read', async () => {
  const realNow = Date.now
  const realReadFile = fs.promises.readFile
  let clock = realNow()
  let busy = false
  Date.now = () => clock
  fs.promises.readFile = (file, ...rest) => {
    if (busy && path.basename(String(file)).startsWith('roller')) return Promise.reject(Object.assign(new Error('busy'), { code: 'EBUSY' }))
    return realReadFile(file, ...rest)
  }
  try {
    const { call } = setup()
    await call('mona', 'roles:set-role', { email: 'anna@nexi.test', role: 'status-manager' })
    assert.equal((await call('anna', 'me')).role, 'manager')
    busy = true
    clock += 31000
    assert.equal((await call('anna', 'me')).role, 'manager', 'within the hard limit the old role is used while it is read again')
    await new Promise(resolve => setTimeout(resolve, 1000))
    clock += 30000
    assert.equal((await call('anna', 'me')).role, 'user', 'past the hard limit a failed read falls back to a plain user')
    busy = false
    assert.equal((await call('anna', 'me')).role, 'manager', 'a good read gives the role back')
  } finally {
    Date.now = realNow
    fs.promises.readFile = realReadFile
  }
})

// M: not answering: a read of the roles file hangs until the test lets it through (store read slots are shared).
function hangingRoles() {
  const realNow = Date.now
  const realReadFile = fs.promises.readFile
  const held = []
  const state = { clock: realNow(), hang: false }
  Date.now = () => state.clock
  fs.promises.readFile = (file, ...rest) => {
    if (state.hang && path.basename(String(file)).startsWith('roller')) return new Promise(resolve => held.push(resolve)).then(() => realReadFile(file, ...rest))
    return realReadFile(file, ...rest)
  }
  state.restore = async () => {
    Date.now = realNow
    fs.promises.readFile = realReadFile
    for (const release of held) release()
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return state
}
const within = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve('blocked'), ms))])

test('a plain user past the role limit is not held up by a hanging roles read: a put-away is kept on this PC at once', async () => {
  const m = hangingRoles()
  try {
    let connected = true
    const { call, registered } = setup({ storageConnected: () => connected })
    await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 2 })
    assert.equal((await call('anna', 'me')).role, 'user')
    m.clock += 61000
    m.hang = true
    connected = false
    const answer = await within(call('anna', 'locations:put-away', { actionId: 'hang-1', pallets: [{ location: 'A2.4', material: 'R162-0717', quantity: 5 }] }), 1000)
    assert.deepEqual(answer, { queued: true })
    assert.deepEqual(await within(call('anna', 'locations:pending'), 1000), { pending: 1, failures: [] })
    await registered.closeAll()
  } finally {
    await m.restore()
  }
})

test('a status manager past the role limit with a hanging roles read is a plain user after the read limit', async () => {
  const m = hangingRoles()
  try {
    const { call } = setup()
    await call('mona', 'roles:set-role', { email: 'anna@nexi.test', role: 'status-manager' })
    assert.equal((await call('anna', 'me')).role, 'manager')
    m.clock += 61000
    m.hang = true
    const startedAt = performance.now()
    assert.equal((await within(call('anna', 'me'), 1500)).role, 'user')
    assert.ok(performance.now() - startedAt < 1500, 'answered within the read limit')
  } finally {
    await m.restore()
  }
})

test('a status manager past the role limit keeps the role when M: answers in time', async () => {
  const m = hangingRoles()
  try {
    const { call } = setup()
    await call('mona', 'roles:set-role', { email: 'anna@nexi.test', role: 'status-manager' })
    assert.equal((await call('anna', 'me')).role, 'manager')
    m.clock += 61000
    assert.equal((await call('anna', 'me')).role, 'manager')
  } finally {
    await m.restore()
  }
})
