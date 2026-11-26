const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { registerWarehouse, confirmedSerials } = require('./register.cjs')
const { confirmedAll } = require('./core/countDoc.cjs')
const { createStore } = require('../store.cjs')
const { createArrivalOrder } = require('../ipcArrivals.cjs')

function setup({ clipboard = { readText: () => '', writeText: () => {} }, env = {}, root = null, arrivals, outboxOptions, teamUsers, teamDir, storageConnected, currentActor } = {}) {
  if (!root) {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-register-'))
    for (const team of ['TCD', 'TRR', 'PIM', 'BPO']) fs.mkdirSync(path.join(root, team))
  }
  const handlers = new Map()
  const ipcMain = { handle: (channel, listener) => handlers.set(channel, listener) }
  const users = { 'mona@nexi.test': { email: 'mona@nexi.test', fullName: 'Mona Berg', role: 'manager', status: 'approved' }, 'anna@nexi.test': { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', status: 'approved' } }
  const actors = {
    mona: { email: 'mona@nexi.test', role: 'manager', activeTeam: { teamId: 'TCD', folderName: 'TCD' } },
    anna: { email: 'anna@nexi.test', role: 'user', activeTeam: { teamId: 'TCD', folderName: 'TCD' } },
    pim: { email: 'mona@nexi.test', role: 'manager', activeTeam: { teamId: 'PIM', folderName: 'PIM' } },
    // Finlandsforsendelser is the only tool of BPO; TRR has the four warehouse tools.
    bpo: { email: 'anna@nexi.test', role: 'user', activeTeam: { teamId: 'BPO', folderName: 'BPO' } },
    bpoBoss: { email: 'mona@nexi.test', role: 'manager', activeTeam: { teamId: 'BPO', folderName: 'BPO' } },
    trrAnna: { email: 'anna@nexi.test', role: 'user', activeTeam: { teamId: 'TRR', folderName: 'TRR' } },
    // Lars belongs to TCD and is an extra manager in TRR (authService: `teams` = home + extra teams); the open hub differs.
    larsTcd: { email: 'lars@nexi.test', role: 'user', activeTeam: { teamId: 'TCD', folderName: 'TCD' }, teams: [{ teamId: 'TCD', folderName: 'TCD' }, { teamId: 'TRR', folderName: 'TRR' }] },
    larsTrr: { email: 'lars@nexi.test', role: 'manager', activeTeam: { teamId: 'TRR', folderName: 'TRR' }, teams: [{ teamId: 'TCD', folderName: 'TCD' }, { teamId: 'TRR', folderName: 'TRR' }] },
    // The creator opens every hub, but authService lists only the home team.
    bossTcd: { email: 'boss@nexi.test', role: 'creator', activeTeam: { teamId: 'TCD', folderName: 'TCD' }, teams: [{ teamId: 'TCD', folderName: 'TCD' }] },
    bossTrr: { email: 'boss@nexi.test', role: 'creator', activeTeam: { teamId: 'TRR', folderName: 'TRR' }, teams: [{ teamId: 'TCD', folderName: 'TCD' }] },
  }
  const broadcasts = []
  const registered = registerWarehouse({
    ipcMain,
    // `delay`: this call's user lookup is slow (read from M:).
    currentActor: currentActor || (async event => { if (event.delay) await new Promise(resolve => setTimeout(resolve, event.delay)); return actors[event.who] }),
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
  for (const channel of ['me', 'counts:list', 'statuses:archive', 'pidocs:post', 'pidocs:check', 'sap-check:run', 'sap:show-doc']) assert.ok(handlers.has(`warehouse:${channel}`), channel)
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
  assert.deepEqual(await call('anna', 'me'), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', team: 'TCD', storageLocations: ['D000', 'D004', 'D005', 'D006', 'D102', 'D103', 'D104', 'D105', 'D106'], tools: ['timeclock', 'locations', 'counts', 'softwareload', 'finland'], canAdminister: false })
  await assert.rejects(call('pim', 'counts:list'), /WAREHOUSE_TEAM_NOT_ALLOWED/)
})

test('me for every team: the tools of the open hub, and storage locations only where Optælling is used', async () => {
  const { call } = setup()
  assert.deepEqual(await call('pim', 'me'), { email: 'mona@nexi.test', fullName: 'Mona Berg', role: 'manager', team: 'PIM', storageLocations: [], tools: [], canAdminister: true })
  assert.deepEqual(await call('bpo', 'me'), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', team: 'BPO', storageLocations: [], tools: ['finland'], canAdminister: false })
  assert.deepEqual((await call('bpoBoss', 'me')).role, 'manager')
  assert.equal((await call('bpoBoss', 'me')).canAdminister, true)
  assert.equal((await call('mona', 'me')).canAdminister, true)
  assert.equal((await call('anna', 'me')).canAdminister, false)
  assert.equal((await call('bpo', 'me')).canAdminister, false)
  await call('mona', 'roles:set-role', { email: 'anna@nexi.test', role: 'status-manager' })
  const statusManager = await call('anna', 'me')
  assert.deepEqual([statusManager.role, statusManager.canAdminister], ['manager', false], 'a status manager from Optælling does not administer the module')
  assert.deepEqual(await call('trrAnna', 'me'), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', team: 'TRR', storageLocations: ['D001', 'D002', 'D003'], tools: ['timeclock', 'locations', 'counts', 'softwareload'], canAdminister: false })
})

test('every existing channel still refuses other teams', async () => {
  const { call, registered } = setup()
  const existing = registered.channels.filter(channel => !['me', 'sap:status'].includes(channel) && !/^(admin|finland):/.test(channel))
  assert.ok(existing.length >= 60, `${existing.length} channels`)
  for (const channel of existing) {
    await assert.rejects(call('bpo', channel, {}), /^Error: WAREHOUSE_TEAM_NOT_ALLOWED$/, channel)
    await assert.rejects(call('pim', channel, {}), /^Error: WAREHOUSE_TEAM_NOT_ALLOWED$/, channel)
  }
  await registered.closeAll()
})

test('sap:status follows the tools: a team with a SAP tool gets an answer, a team without is refused', async () => {
  const { call } = setup()
  assert.equal((await call('bpo', 'sap:status', {})).expectedSystem, (await call('anna', 'sap:status', {})).expectedSystem)
  await assert.rejects(call('pim', 'sap:status', {}), /^Error: WAREHOUSE_TOOL_NOT_ALLOWED$/)
})

test('the window gets only our own codes: Node\'s ERR_* is unexpected, and a missing file is M: only when it is under the platform root', async t => {
  t.mock.method(console, 'error', () => {})
  let thrown = null
  const { root, call } = setup({ currentActor: async () => { throw thrown } })
  const failing = error => { thrown = error; return call('anna', 'me') }
  const missing = file => Object.assign(new Error(`ENOENT: no such file or directory, open '${file}'`), { code: 'ENOENT', path: file })

  await assert.rejects(failing(Object.assign(new TypeError('The "path" argument must be of type string. Received undefined'), { code: 'ERR_INVALID_ARG_TYPE' })), /^Error: UNEXPECTED_ERROR$/)
  await assert.rejects(failing(Object.assign(new Error('Cannot create a string longer than 0x1fffffe8 characters'), { code: 'ERR_STRING_TOO_LONG' })), /^Error: UNEXPECTED_ERROR$/)
  await assert.rejects(failing(missing(path.join(root, 'TCD', 'lagerstyring', 'roller.json'))), /^Error: STORAGE_UNAVAILABLE$/)
  await assert.rejects(failing(missing(path.join(os.tmpdir(), 'countpoint-sap-1', 'mb52.txt'))), /^Error: UNEXPECTED_ERROR$/, 'an SAP export without its file is not M:')
  await assert.rejects(failing(missing(`${root}-other${path.sep}x.json`)), /^Error: UNEXPECTED_ERROR$/, 'a folder next to the root is not under it')
  await assert.rejects(failing(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })), /^Error: UNEXPECTED_ERROR$/, 'no path: not known to be M:')
  await assert.rejects(failing(Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' })), /^Error: STORAGE_UNAVAILABLE$/)
  await assert.rejects(failing(Object.assign(new Error('LOCATION_FULL: A1.1 er fuld'), { code: 'LOCATION_FULL' })), /^Error: LOCATION_FULL: A1\.1 er fuld$/)
})

test('a report written while M: is lost is STORAGE_UNAVAILABLE, also when mkdir names no path on the drive (\\\\?)', async t => {
  t.mock.method(console, 'error', () => {})
  const { call } = setup()
  await call('mona', 'statuses:start', { year: 2026, quarter: 4 })
  const preview = await call('anna', 'counts:preview', { scope: { type: 'slocs', slocs: ['D000'] } })
  const { id } = await call('anna', 'counts:create', { token: preview.token, name: 'D000' })
  const mkdir = fs.promises.mkdir
  t.mock.method(fs.promises, 'mkdir', async (dir, options) => {
    if (path.basename(String(dir)) === 'rapporter') throw Object.assign(new Error("ENOENT: no such file or directory, mkdir '\\\\?'"), { code: 'ENOENT', path: '\\\\?' })
    return mkdir.call(fs.promises, dir, options)
  })
  await assert.rejects(call('anna', 'counts:report', { id }), /^Error: STORAGE_UNAVAILABLE$/)
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
  assert.equal((await call('anna', 'statuses:active-progress')).name, status.name)
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

test('Hubert\'s guide gets the Optælling role from the module\'s own user, and never waits more than 1 s for it', async () => {
  const { call, registered } = setup()
  const roleOf = (who, delay = 0) => registered.assistant.countRole({ who, sender: { id: 1 }, delay })
  assert.equal(await roleOf('anna'), 'user')
  assert.equal(await roleOf('mona'), 'manager')
  assert.equal(await roleOf('pim'), null, 'outside TCD/TRR there is no Optælling role')
  await call('mona', 'roles:set-role', { email: 'anna@nexi.test', role: 'admin' })
  assert.equal(await roleOf('anna'), 'admin')
  await call('mona', 'roles:set-role', { email: 'anna@nexi.test', role: 'status-manager' })
  assert.equal(await roleOf('anna'), 'status-manager')
  const startedAt = Date.now()
  const slow = roleOf('anna', 1500)
  assert.equal(await slow, null, 'a slow lookup shows the guide of a plain user')
  assert.ok(Date.now() - startedAt < 1400, `${Date.now() - startedAt} ms`)
  // While that lookup still hangs, the next questions do not wait for it again.
  const again = Date.now()
  assert.equal(await roleOf('anna'), null)
  assert.ok(Date.now() - again < 200, `${Date.now() - again} ms`)
  await new Promise(resolve => setTimeout(resolve, 700))
  assert.equal(await roleOf('anna'), 'status-manager', 'once the slow lookup has settled, the role is looked up again')
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
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 0, ids: [], failures: [] })
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
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 0, ids: [], failures: [] })
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
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 1, ids: ['busy-1'], failures: [] }, 'queued, not a failure')
  assert.equal(registered.hasPendingWrites(), false, 'safe on this PC: closing the window does not wait for M:')
  assert.equal(await registered.whenWritesSettled(20), true)
  assert.deepEqual(broadcasts.filter(([channel]) => channel === 'warehouse:locations:queued').map(([, payload]) => payload), [{ team: 'TCD' }], 'the windows show the waiting banner at once')
  registered.locations.take = take
  registered.closeAll()
  // Started again on the same PC: the queue is replayed at once.
  const again = setup({ root })
  for (let waited = 0; (await again.call('anna', 'locations:pending')).pending && waited < 5000; waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
  assert.deepEqual(await again.call('anna', 'locations:pending'), { pending: 0, ids: [], failures: [] })
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
  assert.deepEqual(await again.call('anna', 'locations:pending'), { pending: 1, ids: ['kept-1'], failures: [] }, 'still waiting, not thrown away')
  // An action handed in meanwhile waits behind it instead of running the queue against the local folder.
  assert.deepEqual(await again.call('anna', 'locations:take', { actionId: 'kept-2', pallet: pallet.id, quantity: 10 }), { queued: true })
  assert.deepEqual(await again.call('anna', 'locations:pending'), { pending: 2, ids: ['kept-1', 'kept-2'], failures: [] })
  connected = true
  again.registered.replayWrites()
  for (let waited = 0; (await again.call('anna', 'locations:pending')).pending && waited < 5000; waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
  assert.deepEqual(await again.call('anna', 'locations:pending'), { pending: 0, ids: [], failures: [] })
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
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 0, ids: [], failures: [] }, 'the put-away was not replayed before G1 existed')
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
  assert.deepEqual(await call('anna', 'locations:pending'), { pending: 0, ids: [], failures: [] })
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

test('a BPO manager sees the roles and gives Finlandsforsendelser admin over IPC; the roles file lives in BPO\\lagerstyring', async () => {
  const { root, call, registered } = setup()
  const before = await call('bpoBoss', 'admin:roles')
  assert.equal(before.team, 'BPO')
  assert.deepEqual(before.users, [
    { email: 'mona@nexi.test', fullName: 'Mona Berg', finlandRole: 'manager' },
    { email: 'anna@nexi.test', fullName: 'Anna Holm', finlandRole: 'user' },
  ])
  assert.deepEqual(await call('bpoBoss', 'admin:set-finland-admin', { email: 'anna@nexi.test', admin: true }), { email: 'anna@nexi.test', finlandAdmin: true })
  const after = await call('bpoBoss', 'admin:roles')
  assert.equal(after.users.find(user => user.email === 'anna@nexi.test').finlandRole, 'admin')
  assert.equal(after.log[0].action, 'finland-admin-added')
  assert.ok((await createStore(path.join(root, 'BPO', 'lagerstyring')).getAsync('roller')).finlandAdmins['anna@nexi.test'])

  await assert.rejects(call('bpo', 'admin:roles', {}), /^Error: MANAGER_ONLY/)
  await assert.rejects(call('bpo', 'admin:set-finland-admin', { email: 'anna@nexi.test', admin: false }), /^Error: MANAGER_ONLY/)
  await assert.rejects(call('trrAnna', 'admin:set-finland-admin', { email: 'anna@nexi.test', admin: true }), /^Error: WAREHOUSE_TOOL_NOT_ALLOWED$/)
  await assert.rejects(call('pim', 'admin:roles', {}), /^Error: WAREHOUSE_TOOL_NOT_ALLOWED$/)
  const tcd = await call('mona', 'admin:roles')
  assert.deepEqual(tcd.users.find(user => user.email === 'anna@nexi.test'), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', locationRole: 'user', finlandRole: 'user' }, 'each hub has its own roles')
  await registered.closeAll()
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

/** Every file read under `<root>\<team>` while `fn` runs. */
async function readsIn(root, team, fn) {
  const realReadFile = fs.promises.readFile
  const reads = []
  fs.promises.readFile = (file, ...rest) => {
    if (String(file).startsWith(path.join(root, team) + path.sep)) reads.push(String(file))
    return realReadFile.call(fs.promises, file, ...rest)
  }
  try { await fn() } finally { fs.promises.readFile = realReadFile }
  return reads
}

const SOFTWARELOAD_TASK = { type: 'sw', target: 'd006', version: '4.2.1' }
const TIMECLOCK_IN_TCD = /^Error: SOFTWARELOAD_TIMECLOCK_ELSEWHERE: Stempelkort kører i TCD\. Stop det der først$/
const SOFTWARELOAD_IN_TRR = /^Error: TIMECLOCK_SOFTWARELOAD_ELSEWHERE: Softwareload kører i TRR\. Stop det der først$/

test('a person in TCD and TRR cannot start Softwareload in TRR while Stempelkort runs in TCD', async () => {
  const { call } = setup()
  await call('larsTcd', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  await assert.rejects(call('larsTrr', 'softwareload:start', SOFTWARELOAD_TASK), TIMECLOCK_IN_TCD)
  assert.equal((await call('larsTrr', 'softwareload:status')).running, null, 'no task was started')
  assert.equal((await call('larsTcd', 'timeclock:status')).running.taskName, 'Lager', 'Stempelkort keeps running')

  // A paused Stempelkort counts no time, so the task starts; resuming the task is refused once Stempelkort runs again.
  await call('larsTcd', 'timeclock:pause')
  await call('larsTrr', 'softwareload:start', SOFTWARELOAD_TASK)
  await call('larsTrr', 'softwareload:pause')
  await call('larsTcd', 'timeclock:resume')
  await assert.rejects(call('larsTrr', 'softwareload:resume'), TIMECLOCK_IN_TCD)
  assert.equal((await call('larsTrr', 'softwareload:status')).running.paused, true, 'the task stays on its break')
})

test('the mirror: Stempelkort in TCD cannot start or resume while Softwareload runs in TRR', async () => {
  const { call } = setup()
  await call('larsTrr', 'softwareload:start', SOFTWARELOAD_TASK)
  await assert.rejects(call('larsTcd', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' }), SOFTWARELOAD_IN_TRR)
  assert.equal((await call('larsTcd', 'timeclock:status')).running, null, 'no clock was started')
  assert.equal((await call('larsTrr', 'softwareload:status')).running.paused, false, 'the task keeps running')

  await call('larsTrr', 'softwareload:pause')
  await call('larsTcd', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  await call('larsTcd', 'timeclock:pause')
  await call('larsTrr', 'softwareload:resume')
  await assert.rejects(call('larsTcd', 'timeclock:resume'), SOFTWARELOAD_IN_TRR)
  await assert.rejects(call('larsTcd', 'timeclock:start', { taskId: 'pak', taskName: 'Pakning', switchTask: true }), SOFTWARELOAD_IN_TRR)
  const { running } = await call('larsTcd', 'timeclock:status')
  assert.deepEqual([running.taskName, running.paused], ['Lager', true], 'a refused switch does not save or replace the clock')
})

test('the creator is checked both ways: Stempelkort in TRR first, then Softwareload in the home hub TCD is refused', async () => {
  const { call } = setup()
  await call('bossTrr', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  await assert.rejects(call('bossTcd', 'softwareload:start', SOFTWARELOAD_TASK), /^Error: SOFTWARELOAD_TIMECLOCK_ELSEWHERE: Stempelkort kører i TRR\. Stop det der først$/)
  assert.equal((await call('bossTcd', 'softwareload:status')).running, null)
})

test('another Hub on the same drive (the other hub\'s store not open here) still refuses the start', async () => {
  const first = setup()
  await first.call('larsTcd', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  const second = setup({ root: first.root })
  await assert.rejects(second.call('larsTrr', 'softwareload:start', SOFTWARELOAD_TASK), TIMECLOCK_IN_TCD)
  assert.equal((await second.call('larsTrr', 'softwareload:status')).running, null)
})

test('in the same hub nothing changes for a person in two hubs: Stempelkort pauses the task, and the task stops Stempelkort', async () => {
  const { root, call } = setup()
  const reads = await readsIn(root, 'TRR', async () => {
    const started = await call('larsTcd', 'softwareload:start', SOFTWARELOAD_TASK)
    const clock = await call('larsTcd', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
    assert.deepEqual([clock.pausedSoftwareload?.id, clock.pausedSoftwareload?.paused, clock.softwareloadPauseFailed], [started.id, true, undefined])
    const resumed = await call('larsTcd', 'softwareload:resume')
    assert.deepEqual([resumed.paused, resumed.stoppedTimeclock?.taskName], [false, 'Lager'])
  })
  assert.equal(reads.length, 3, 'one read of the other hub per start or resume')
  assert.equal(fs.existsSync(path.join(root, 'TRR', 'lagerstyring')), false, 'reading the other hub never creates its folder')
})

test('a person in one hub reads nothing in the other hub, and no folder is made there', async () => {
  const { root, call } = setup()
  const reads = await readsIn(root, 'TRR', async () => {
    await call('anna', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
    await call('anna', 'timeclock:pause')
    await call('anna', 'timeclock:resume')
    await call('anna', 'softwareload:start', SOFTWARELOAD_TASK)
    await call('anna', 'softwareload:pause')
    await call('anna', 'softwareload:resume')
    await call('anna', 'timeclock:start', { taskId: 'pak', taskName: 'Pakning', switchTask: true })
  })
  assert.deepEqual(reads, [])
  assert.equal(fs.existsSync(path.join(root, 'TRR', 'lagerstyring')), false)
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
    assert.deepEqual(await within(call('anna', 'locations:pending'), 1000), { pending: 1, ids: ['hang-1'], failures: [] })
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

test('a status manager past the role limit keeps the role while the shared read slots are busy with slow reads', async () => {
  const realNow = Date.now
  const realReadFile = fs.promises.readFile
  const held = []
  let clock = realNow()
  Date.now = () => clock
  // Six slow reads of other files hold every shared read slot of the store (MAX_CONCURRENT_READS) for 1.5 s.
  fs.promises.readFile = (file, ...rest) => {
    if (path.basename(String(file)).startsWith('langsom')) return new Promise(resolve => held.push(resolve)).then(() => realReadFile(file, ...rest))
    return realReadFile(file, ...rest)
  }
  const slow = []
  try {
    const { root, call } = setup()
    await call('mona', 'roles:set-role', { email: 'anna@nexi.test', role: 'status-manager' })
    assert.equal((await call('anna', 'me')).role, 'manager')
    const other = createStore(path.join(root, '_slow'))
    for (let i = 0; i < 6; i++) slow.push(other.getAsync(`langsom-${i}`, { skipCache: true }).catch(() => {}))
    const release = setTimeout(() => held.forEach(resolve => resolve()), 1500)
    clock += 61000
    assert.equal((await call('anna', 'me')).role, 'manager', 'M: is fine: the queue for a read slot is not a slow M:')
    clearTimeout(release)
  } finally {
    Date.now = realNow
    fs.promises.readFile = realReadFile
    held.forEach(resolve => resolve())
    await Promise.all(slow)
  }
})

// M: hanging must never freeze the Hub: stores are made with fs.promises.mkdir, never mkdirSync on the main thread.
test('the stores on M: are opened without a synchronous mkdir, and a report is looked up without a synchronous call', async t => {
  const { root, call } = setup()
  const local = path.join(root, '_user')
  const onDrive = file => !path.resolve(String(file)).startsWith(local)
  const mkdirSync = t.mock.method(fs, 'mkdirSync')
  const existsSync = t.mock.method(fs, 'existsSync')
  assert.equal((await call('anna', 'me')).role, 'user')
  await call('anna', 'timeclock:start', { taskId: 'lager', taskName: 'Lager' })
  await call('anna', 'softwareload:status')
  await call('mona', 'locations:create-location', { name: 'A2.4', type: 'Palle', purpose: 'reserve', capacity: 1 })
  await call('mona', 'sap-check:overview')
  await assert.rejects(call('mona', 'counts:open-report', { file: 'missing.xlsx' }), /REPORT_NOT_FOUND/)
  assert.deepEqual(mkdirSync.mock.calls.map(c => c.arguments[0]).filter(onDrive), [])
  assert.deepEqual(existsSync.mock.calls.map(c => c.arguments[0]).filter(onDrive), [])
  for (const dir of ['TCD/lagerstyring', 'TCD/lagerstyring/stempelkort', 'TCD/lagerstyring/placeringer', '_lagerstyring']) assert.ok(fs.statSync(path.join(root, dir)).isDirectory(), dir)
})

test('a team folder that cannot be made is tried once per back-off, not on every call (the SAP indicator polls every 5 s)', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-register-'))
  fs.writeFileSync(path.join(root, 'blocked'), 'a file where the team folder should be')
  const dataDir = path.join(root, 'blocked', 'TCD', 'lagerstyring')
  t.mock.method(console, 'error', () => {})
  const { call, registered } = setup({ root, teamDir: team => path.join(root, 'blocked', team) })
  const mkdirSync = t.mock.method(fs, 'mkdirSync')
  const mkdir = t.mock.method(fs.promises, 'mkdir')
  for (let i = 0; i < 3; i++) assert.equal((await call('anna', 'me')).role, 'user', 'a roles file that cannot be read is a plain user')
  assert.equal(mkdirSync.mock.calls.filter(c => String(c.arguments[0]).startsWith(dataDir)).length, 0)
  assert.equal(mkdir.mock.calls.filter(c => c.arguments[0] === dataDir).length, 1)
  // M: is back (main.cjs calls replayWrites): the folder is tried again at once, not after the back-off.
  fs.rmSync(path.join(root, 'blocked'))
  await registered.replayWrites()
  await call('anna', 'me')
  assert.equal(mkdir.mock.calls.filter(c => c.arguments[0] === dataDir).length, 2)
  assert.ok(fs.statSync(dataDir).isDirectory())
  await registered.closeAll()
})

test('a confirmed list of more than 2000 serials found in another count reaches the approval whole, so it can be confirmed', () => {
  const warned = Array.from({ length: 2500 }, (_, index) => `SN${String(index).padStart(6, '0')}`)
  const passed = confirmedSerials([...warned, 'X'.repeat(41), 42, null])
  assert.equal(passed.length, 2500, 'every serial, nothing that cannot be a serial')
  assert.equal(confirmedAll(warned, passed), true)
  assert.equal(confirmedSerials(Array.from({ length: 20001 }, (_, index) => `S${index}`)).length, 20000, 'still bounded')
  assert.deepEqual(confirmedSerials('SN1'), [])
})
