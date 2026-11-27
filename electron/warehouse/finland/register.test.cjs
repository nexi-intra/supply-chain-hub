const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { registerWarehouse } = require('../register.cjs')
const { trackingUrl, TRACKING_URLS } = require('./register.cjs')
const { parcelKey } = require('./core/sheetIndex.cjs')

const CHANNELS = [
  'load', 'load-sheet', 'pending', 'current', 'write-day', 'fix-review', 'save-draft', 'save-followup', 'resolve-conflict', 'check-manual',
  'add-manual-row', 'mark-not-sent', 'restore-not-sent', 'delete-not-sent-row', 'open-tracking', 'settings',
  'set-settings', 'drafts-overview', 'clear-drafts',
]
const BLANK = { expected: '', received: '', sla: '', comment: '', terminal: '' }
const TRACKING = '00073215000000000001'
const KEY = parcelKey('82100001', TRACKING)
const SHEET = [{ row: 2, delivery: '82100001', trackingText: TRACKING, pickedUp: '2026-11-20', orderType: 'ZRO', postalCode: '00100', courier: 'Postnord', followUp: { ...BLANK } }]

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'finland-register-'))
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }))

function fakeExcel(rows = SHEET) {
  const calls = []
  return {
    calls,
    async readSheet() {
      calls.push('read')
      return { rows: rows.map(r => ({ ...r, followUp: { ...r.followUp } })), wasOpen: true, filterRemoved: false }
    },
    async appendRows() { calls.push('append'); throw new Error('not in these tests') },
    async replaceTracking() { calls.push('replace'); throw new Error('not in these tests') },
    async deleteRow() { calls.push('delete'); throw new Error('not in these tests') },
    async writeFollowUp() { calls.push('followup'); throw new Error('not in these tests') },
  }
}

function setup({ storageConnected } = {}) {
  const root = fs.mkdtempSync(path.join(ROOT, 'hub-'))
  for (const team of ['TCD', 'TRR', 'PIM', 'BPO']) fs.mkdirSync(path.join(root, team))
  const handlers = new Map()
  const users = {
    'mona@nexi.test': { email: 'mona@nexi.test', fullName: 'Mona Berg', role: 'manager', status: 'approved' },
    'anna@nexi.test': { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', status: 'approved' },
  }
  const actors = {
    anna: { email: 'anna@nexi.test', role: 'user', activeTeam: { teamId: 'TCD', folderName: 'TCD' } },
    bpo: { email: 'anna@nexi.test', role: 'user', activeTeam: { teamId: 'BPO', folderName: 'BPO' } },
    bpoBoss: { email: 'mona@nexi.test', role: 'manager', activeTeam: { teamId: 'BPO', folderName: 'BPO' } },
    trrAnna: { email: 'anna@nexi.test', role: 'user', activeTeam: { teamId: 'TRR', folderName: 'TRR' } },
  }
  const clipboard = { text: '', writeText(value) { this.text = value }, readText() { return this.text } }
  const excel = fakeExcel()
  const opened = []
  const registered = registerWarehouse({
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    currentActor: async event => actors[event.who],
    teamUsers: async () => users,
    teamDir: team => path.join(root, team),
    platformRoot: () => root,
    userDataDir: path.join(root, '_user'),
    electron: { clipboard, dialog: {}, shell: {}, BrowserWindow: {} },
    broadcast: () => {},
    isPackaged: false,
    env: { TCD_HUB_SAP_FIXTURES_DIR: path.join(__dirname, '..', 'fixtures', 'sap') },
    ...(storageConnected ? { storageConnected } : {}),
    finlandDeps: {
      excel,
      fetchParcels: async () => { throw new Error('SAP is not used in these tests') },
      trackingWindows: { open: (...args) => opened.push(args), closeAll: () => {} },
    },
  })
  const call = (who, channel, payload) => handlers.get(`warehouse:finland:${channel}`)({ who, sender: { id: 1 } }, payload)
  return { root, registered, call, excel, clipboard, opened }
}

test('every Finland channel is registered under "warehouse:finland:"', async () => {
  const { registered } = setup()
  assert.deepEqual(registered.channels.filter(channel => channel.startsWith('finland:')).sort(), CHANNELS.map(name => `finland:${name}`).sort())
  await registered.closeAll()
})

test('a TRR user is refused every Finland channel', async () => {
  const { call, excel, registered } = setup()
  for (const channel of CHANNELS) await assert.rejects(call('trrAnna', channel, {}), /^Error: WAREHOUSE_TOOL_NOT_ALLOWED$/, channel)
  assert.deepEqual(excel.calls, [])
  await registered.closeAll()
})

test('a BPO user reads the sheet', async () => {
  const { call, excel, registered } = setup()
  const snap = await call('bpo', 'load-sheet')
  assert.deepEqual(excel.calls, ['read'])
  assert.equal(snap.followUp.rows.length, 1)
  assert.equal(snap.followUp.rows[0].key, KEY)
  assert.equal(snap.sheet.isTest, true, 'the test sheet until a manager chooses another')
  assert.equal((await call('bpo', 'settings')).sheetName, 'Sheet1')
  await registered.closeAll()
})

test('the open hub decides on every call', async () => {
  const { call, registered } = setup()
  assert.equal((await call('anna', 'load-sheet')).followUp.rows.length, 1)
  await assert.rejects(call('trrAnna', 'load-sheet'), /^Error: WAREHOUSE_TOOL_NOT_ALLOWED$/)
  assert.equal((await call('anna', 'settings')).tableName, 'Table2')
  await registered.closeAll()
})

test('invalid input is refused before the service', async () => {
  const { call, excel, registered } = setup()
  await call('bpo', 'load-sheet')
  const reads = excel.calls.length
  const cases = [
    ['write-day', { date: '2026-13-01' }],
    ['write-day', { date: '2026-02-30' }],
    ['write-day', {}],
    ['fix-review', { delivery: '8210A', tracking: TRACKING }],
    ['save-draft', { key: '82100001|ab', wanted: { comment: 'x' } }],
    ['save-draft', { key: KEY, wanted: { received: '2026-11-31' } }],
    ['save-draft', { key: KEY, wanted: { sla: 'MAYBE' } }],
    ['save-draft', { key: KEY, wanted: { comment: 'x'.repeat(301) } }],
    ['save-draft', { key: KEY }],
    ['save-followup', {}],
    ['save-followup', { date: '20.11.2026' }],
    ['resolve-conflict', { key: KEY, field: 'pickedUp', choice: 'mine' }],
    ['resolve-conflict', { key: KEY, field: 'comment', choice: 'both' }],
    ['check-manual', { delivery: '1'.repeat(61) }],
    ['mark-not-sent', { delivery: '82100001', tracking: 'ab' }],
    ['restore-not-sent', { key: 'x' }],
    ['delete-not-sent-row', { key: KEY, row: 1 }],
    ['delete-not-sent-row', { key: KEY, row: '3' }],
    ['clear-drafts', { email: 42 }],
  ]
  for (const [channel, payload] of cases) await assert.rejects(call('bpo', channel, payload), /^Error: FINLAND_INVALID_INPUT: \S/, `${channel} ${JSON.stringify(payload)}`)
  assert.equal(excel.calls.length, reads, 'Excel is not touched')
  assert.equal(await registered.finlandPending({ who: 'bpo', sender: { id: 1 } }), 0, 'no draft was saved')
  await registered.closeAll()
})

test('a draft is the person\'s own: counted for the close warning, and managers see and clear it', async () => {
  const { call, registered } = setup()
  await call('bpo', 'load-sheet')
  await call('bpo', 'save-draft', { key: KEY, wanted: { comment: 'Ring til kunden' }, slaManual: false, base: BLANK })
  assert.equal(await registered.finlandPending({ who: 'bpo', sender: { id: 1 } }), 1)
  assert.equal(await registered.finlandPending({ who: 'anna', sender: { id: 1 } }), 1, 'the same person in TCD')
  assert.equal(await registered.finlandPending({ who: 'trrAnna', sender: { id: 1 } }), 0, 'TRR has no Finlandsforsendelser')
  assert.equal(await registered.finlandPending({ who: 'nobody', sender: { id: 1 } }), 0, 'no person: no warning')

  await assert.rejects(call('bpo', 'drafts-overview'), /^Error: MANAGER_ONLY/)
  await assert.rejects(call('bpo', 'clear-drafts', { email: 'anna@nexi.test' }), /^Error: MANAGER_ONLY/)
  await assert.rejects(call('bpo', 'set-settings', { workbookUrl: 'https://x.test/a.xlsx', sheetName: 'A', tableName: 'B' }), /^Error: MANAGER_ONLY/)
  const overview = await call('bpoBoss', 'drafts-overview')
  assert.deepEqual(overview.people.map(person => [person.email, person.name, person.count, person.byDay]), [['anna@nexi.test', 'Anna Holm', 1, { '2026-11-20': 1 }]])
  assert.deepEqual(overview.currentSheet, { workbookUrl: (await call('bpo', 'settings')).workbookUrl, drafts: 1, notSent: 0 })
  assert.deepEqual(overview.cleared, [])
  assert.deepEqual(await call('bpoBoss', 'clear-drafts', { email: 'anna@nexi.test' }), { email: 'anna@nexi.test', cleared: 1 })
  assert.equal(await registered.finlandPending({ who: 'bpo', sender: { id: 1 } }), 0)
  const after = await call('bpoBoss', 'drafts-overview')
  assert.deepEqual(after.people, [])
  assert.deepEqual(after.cleared.map(entry => [entry.by, entry.byName, entry.email, entry.name, entry.count]), [['mona@nexi.test', 'Mona Berg', 'anna@nexi.test', 'Anna Holm', 1]])
  assert.equal(typeof after.cleared[0].at, 'number')
  await registered.closeAll()
})

test('the switch of sheet is told what stays behind in the current sheet', async () => {
  const { call, registered } = setup()
  await call('bpo', 'load-sheet')
  await call('bpo', 'save-draft', { key: KEY, wanted: { comment: 'Ring til kunden' }, slaManual: false, base: BLANK })
  await call('bpoBoss', 'set-settings', { workbookUrl: 'https://x.test/rigtigt.xlsx', sheetName: 'Sheet1', tableName: 'Table2' })
  const overview = await call('bpoBoss', 'drafts-overview')
  assert.deepEqual(overview.currentSheet, { workbookUrl: 'https://x.test/rigtigt.xlsx', drafts: 0, notSent: 0 }, 'the test sheet\'s change is not the real sheet\'s')
  assert.equal(overview.people[0].count, 1, 'it is still listed, so a manager can delete it')
  assert.equal(await call('bpo', 'pending'), 0)
  await registered.closeAll()
})

test('writes are refused while M: is away; reads still answer', async () => {
  let connected = true
  const { call, excel, registered } = setup({ storageConnected: () => connected })
  await call('bpo', 'load-sheet')
  connected = false
  const reads = excel.calls.length
  for (const [channel, payload] of [
    ['write-day', { date: '2026-11-20' }],
    ['fix-review', { delivery: '82100001', tracking: TRACKING }],
    ['save-draft', { key: KEY, wanted: { comment: 'x' }, slaManual: false, base: BLANK }],
    ['save-followup', { date: null }],
    ['resolve-conflict', { key: KEY, field: 'comment', choice: 'mine' }],
    ['add-manual-row', { delivery: '82100005', orderType: 'ZRO', postalCode: '00100', courier: 'DSV', tracking: '00157145000000000005', pickedUp: '2026-11-20' }],
    ['mark-not-sent', { delivery: '82100001', tracking: TRACKING }],
    ['restore-not-sent', { key: KEY }],
    ['delete-not-sent-row', { key: KEY, row: 2 }],
    ['set-settings', { workbookUrl: 'https://x.test/a.xlsx', sheetName: 'A', tableName: 'B' }],
    ['clear-drafts', { email: 'anna@nexi.test' }],
  ]) await assert.rejects(call('bpoBoss', channel, payload), /^Error: STORAGE_UNAVAILABLE$/, channel)
  assert.equal(excel.calls.length, reads, 'Excel is not touched')
  assert.equal((await call('bpo', 'settings')).sheetName, 'Sheet1')
  assert.equal(await call('bpo', 'pending'), 0)
  await registered.closeAll()
})

test('the window counts its own drafts without reading the sheet', async () => {
  const { call, excel, registered } = setup()
  assert.equal(await call('bpo', 'pending'), 0)
  assert.deepEqual(excel.calls, [], 'Excel is not touched')
  await call('bpo', 'load-sheet')
  await call('bpo', 'save-draft', { key: KEY, wanted: { comment: 'Ring til kunden' }, slaManual: false, base: BLANK })
  const reads = excel.calls.length
  assert.equal(await call('bpo', 'pending'), 1)
  assert.equal(await call('bpoBoss', 'pending'), 0, 'another person\'s drafts are not counted')
  assert.equal(excel.calls.length, reads, 'Excel is not touched')
  await assert.rejects(call('trrAnna', 'pending'), /^Error: WAREHOUSE_TOOL_NOT_ALLOWED$/)
  await registered.closeAll()
})

test('tracking only opens https addresses from the config', async () => {
  assert.equal(trackingUrl(TRACKING_URLS, 'Postnord', TRACKING), `https://www.postnord.dk/varktojer/track-trace?shipmentId=${TRACKING}`)
  assert.equal(trackingUrl(TRACKING_URLS, 'DHL', 'JD014600006199999999'), 'https://www.dhl.com/dk-en/home/tracking.html?tracking-id=JD014600006199999999&submit=1')
  assert.equal(trackingUrl(TRACKING_URLS, 'DSV', TRACKING), 'https://mydsv.dsv.com/app/tracking-public/')
  for (const [courier, id] of [['UPS', TRACKING], ['toString', TRACKING], ['__proto__', TRACKING], ['Postnord', 'AB1'], ['Postnord', `${TRACKING}&x=1`], ['Postnord', '']]) {
    assert.throws(() => trackingUrl(TRACKING_URLS, courier, id), { code: 'FINLAND_INVALID_INPUT' }, `${courier} ${id}`)
  }
  assert.throws(() => trackingUrl({ Postnord: 'http://www.postnord.dk/?id={id}' }, 'Postnord', TRACKING), { code: 'FINLAND_INVALID_INPUT', message: /https/ })
  assert.throws(() => trackingUrl({ Postnord: 'javascript:alert({id})' }, 'Postnord', TRACKING), { code: 'FINLAND_INVALID_INPUT' })

  const { call, clipboard, opened, registered } = setup()
  await assert.rejects(call('bpo', 'open-tracking', { courier: 'UPS', tracking: TRACKING }), /^Error: FINLAND_INVALID_INPUT: \S/)
  assert.deepEqual(opened, [])
  assert.deepEqual(await call('bpo', 'open-tracking', { courier: 'Postnord', tracking: TRACKING }), { copied: false })
  assert.equal(clipboard.text, '', 'a number in the address is not copied')
  // DSV's page cannot take the number in the address, so it is copied for Ctrl+V.
  assert.deepEqual(await call('bpo', 'open-tracking', { courier: 'DSV', tracking: TRACKING }), { copied: true })
  assert.equal(clipboard.text, TRACKING)
  assert.deepEqual(opened, [
    ['Postnord', TRACKING, `https://www.postnord.dk/varktojer/track-trace?shipmentId=${TRACKING}`],
    ['DSV', TRACKING, 'https://mydsv.dsv.com/app/tracking-public/'],
  ])
  await registered.closeAll()
})
