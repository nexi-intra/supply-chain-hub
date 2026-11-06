const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../store.cjs')
const { createCountRepository } = require('./countRepository.cjs')
const { createCountService } = require('./countService.cjs')

const stock = (material, sloc, unrestricted, blocked = 0, valueUnrestricted = 0, valueBlocked = 0) => ({ material, description: `${material} tekst`, plant: 'D301', sloc, unrestricted, blocked, valueUnrestricted, valueBlocked })
const serial = (serialNo, material, sloc, stockType = 'unrestricted') => ({ serial: serialNo, material, sloc, plant: 'D301', description: material, userStatus: '', stockType })

const ANNA = { email: 'Anna@example.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const BO = { email: 'bo@example.test', fullName: 'Bo', role: 'user', team: 'TCD' }
const MONA = { email: 'mona@example.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
const TRINE = { email: 'trine@example.test', fullName: 'Trine', role: 'user', team: 'TRR' }

function setup({ status = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-service-'))
  const stores = new Map()
  const storeFor = team => {
    if (!stores.has(team)) stores.set(team, createStore(path.join(root, 'data', team)))
    return stores.get(team)
  }
  if (status) storeFor('TCD').set('statusser', { st0open1: { id: 'st0open1', team: 'TCD', name: 'Status Q4 2026', year: 2026, quarter: 4, state: 'open', startedBy: { email: 'mona@example.test', name: 'Mona' }, startedAt: 1, history: [], reports: [] } })
  const clock = { now: 1_000_000 }
  const sap = {
    mb52: [stock('INT4300-4921-0', 'D000', 2, 0, 2000), stock('INT4300-4921-0-R', 'D000', 1), stock('R162-0717', 'D000', 100, 0, 500), stock('INT4300-4921-0-R', 'D004', 1)],
    serials: [serial('N1', 'INT4300-4921-0', 'D000'), serial('N2', 'INT4300-4921-0', 'D000'), serial('U1', 'INT4300-4921-0-R', 'D000'), serial('U2', 'INT4300-4921-0-R', 'D004')],
  }
  const fetcher = {
    calls: 0,
    longCalls: [],
    async fetchPlant() { this.calls++; return { mb52: sap.mb52, serials: sap.serials, sapUser: 'D00K418', fetchedAt: clock.now } },
    async fetchLongSerials({ material, serials }) {
      this.longCalls.push({ material, serials })
      return serials.filter(serial => serial !== 'N2').map(serial => ({ serial, long: `251427${serial}`, material }))
    },
  }
  const placementSource = { load: async () => ({ file: 'C:\\x\\Placeringsark_15_10_2026.xlsm', placements: [{ placement: 'A1.1', area: 'A', material: 'R162-0717', quantity: 90 }, { placement: 'A1.2', area: 'A', material: 'INT4300-4921-0', quantity: 2 }] }) }
  let ids = 0
  const written = []
  const reportWriter = {
    count: async (team, data) => { written.push({ kind: 'count', team, name: data.meta.name, language: data.language }); return path.join(root, 'rapporter', `${data.meta.name}.xlsx`) },
    status: async (team, data) => { written.push({ kind: 'status', team, version: data.version, counts: data.counts.length, history: data.status.history.map(entry => entry.action), language: data.language }); return path.join(root, 'rapporter', `${data.status.name} v${data.version}.xlsx`) },
  }
  const service = name => createCountService({
    repo: createCountRepository({ storeFor, now: () => clock.now }),
    storeFor, fetcher, placementSource, reportWriter,
    journalsDir: path.join(root, `local-${name}`), deviceId: name,
    now: () => clock.now, newId: () => `${name}${++ids}`,
    journalOptions: { autoFlush: false },
  })
  return { root, clock, sap, fetcher, service, written, storeFor, repo: createCountRepository({ storeFor, now: () => clock.now }), tick: ms => { clock.now += ms } }
}

async function newCount(ctx, svc, user = ANNA) {
  const preview = await svc.preview(user, { scope: { type: 'slocs', slocs: ['D000'] } })
  return svc.createCount(user, { token: preview.token, name: 'Status D000' })
}

test('preview fetches SAP once and shows groups; create stores the count for the team only', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const preview = await anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } })
  assert.equal(ctx.fetcher.calls, 1)
  assert.equal(preview.summary.groups.new.serials, 2)
  assert.equal(preview.summary.misplaced.length, 1)
  assert.equal(preview.placementSheet.placements, 2)
  const meta = await anna.createCount(ANNA, { token: preview.token, name: 'Status D000' })
  assert.equal(meta.owner.email, 'anna@example.test')
  await assert.rejects(anna.createCount(ANNA, { token: preview.token, name: 'Igen' }), { code: 'PREVIEW_EXPIRED' })
  const list = await anna.listCounts(BO)
  assert.equal(list.length, 1)
  assert.equal(list[0].myStatus, null)
  assert.deepEqual(await anna.listCounts(TRINE), [])
  await assert.rejects(ctx.service('pc9').openCount(TRINE, meta.id), { code: 'COUNT_NOT_FOUND' })
  const opened = await anna.openCount(ANNA, meta.id)
  assert.deepEqual(opened.countLists.map(line => line.place), ['A1.1'], 'serial-managed materials are scanned, not on count lists')
  assert.equal(opened.me.isOwner, true)
})

test('only approved members can scan; the owner approves join requests', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const { id } = await newCount(ctx, anna)
  await assert.rejects(bo.scan(BO, id, { serial: 'N1', place: 'A1.1' }), { code: 'COUNT_NOT_MEMBER' })
  await bo.requestJoin(BO, id)
  await assert.rejects(bo.decideMember(BO, id, { email: BO.email, approve: true }), { code: 'COUNT_OWNER_ONLY' })
  await anna.decideMember(ANNA, id, { email: 'BO@example.test', approve: true })
  const result = await bo.scan(BO, id, { serial: ' n1 ', place: 'A1.1' })
  assert.equal(result.outcome, 'found')
  assert.equal(result.saved, true)
})

test('two counters on two PCs: duplicates are recognised across users once synced', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const { id } = await newCount(ctx, anna)
  await bo.requestJoin(BO, id)
  await anna.decideMember(ANNA, id, { email: BO.email, approve: true })
  assert.equal((await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })).outcome, 'found')
  assert.equal((await anna.scan(ANNA, id, { serial: 'U1', place: 'A1.1' })).move, true)
  await anna.flush(ANNA, id)
  ctx.tick(5000)
  await bo.getState(BO, id)
  const duplicate = await bo.scan(BO, id, { serial: 'N1', place: 'B1' })
  assert.equal(duplicate.outcome, 'duplicate')
  assert.equal(duplicate.previous.byName, 'Anna')
  assert.equal((await bo.scan(BO, id, { serial: 'U2', place: 'B1' })).outcome, 'other-sloc')
  assert.equal((await bo.scan(BO, id, { serial: 'NOPE', place: 'B1' })).outcome, 'unknown')
  await bo.flush(BO, id)
  ctx.tick(5000)
  const state = await anna.getState(ANNA, id)
  assert.equal(state.serials.found, 2)
  assert.equal(state.serials.expected, 3)
  assert.equal(state.progress.counters.length, 2)
  assert.deepEqual(state.moves.map(item => item.serial).sort(), ['U1', 'U2'])
})

test('sending for approval and closing wait until this PC\'s scans are on M:', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  await anna.scan(ANNA, id, { serial: 'N2', place: 'A1.1' })
  const store = ctx.storeFor('TCD')
  const setAsync = store.setAsync.bind(store)
  let down = true
  store.setAsync = (key, ...rest) => (down && String(key).startsWith(`count-${id}-j-`) ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : setAsync(key, ...rest))
  await assert.rejects(anna.submitMaterial(ANNA, id, { material: 'INT4300-4921-0' }), { code: 'STORAGE_UNAVAILABLE' })
  await assert.rejects(anna.closeCount(ANNA, id), { code: 'STORAGE_UNAVAILABLE' })
  assert.equal((await ctx.repo.getApprovals('TCD', id))['INT4300-4921-0'], undefined, 'nothing was sent for approval')
  assert.equal((await ctx.repo.listCounts('TCD')).find(count => count.id === id).status, 'open', 'the count stays open')
  down = false
  assert.equal((await anna.submitMaterial(ANNA, id, { material: 'INT4300-4921-0' })).status, 'submitted')
  assert.equal((await anna.closeCount(ANNA, id)).status, 'closed')
})

test('lines, undo and imports', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const opened = await anna.openCount(ANNA, id)
  await anna.saveLine(ANNA, id, { lineId: opened.countLists[0].lineId, place: 'A1.1', material: 'r162-0717', qty: 90 })
  await anna.saveLine(ANNA, id, { place: 'Arbejdsstation 4', material: 'R162-0717', qty: 5 })
  await assert.rejects(anna.saveLine(ANNA, id, { place: 'X', material: 'R162-0717', qty: -1 }), { code: 'LINE_INVALID' })
  await assert.rejects(anna.saveLine(ANNA, id, { place: '', material: 'R162-0717', qty: 1 }), { code: 'LINE_INVALID' })
  let state = await anna.getState(ANNA, id)
  assert.equal(state.rows.find(row => row.material === 'R162-0717').counted, 95)
  assert.deepEqual(state.progress.accessory.lines, { counted: 2, total: 2 })
  await anna.undo(ANNA, id, {})
  ctx.tick(2000)
  state = await anna.getState(ANNA, id)
  assert.equal(state.rows.find(row => row.material === 'R162-0717').counted, 90)
  const dry = await anna.importSerials(ANNA, id, { text: 'N1\nN2\nN2\nZZZ\n<bad>', place: 'Palle 14.2' })
  assert.deepEqual({ found: dry.found, repeated: dry.repeated, unknown: dry.unknown, invalid: dry.invalid, toImport: dry.toImport }, { found: 2, repeated: 1, unknown: 1, invalid: 1, toImport: 3 })
  await assert.rejects(anna.importSerials(ANNA, id, { text: 'N1', place: ' ' }), { code: 'IMPORT_INVALID' })
  const done = await anna.importSerials(ANNA, id, { text: 'N1\nN2\nZZZ', place: 'Palle 14.2', dryRun: false })
  assert.equal(done.imported, 3)
  ctx.tick(2000)
  assert.equal((await anna.getState(ANNA, id)).serials.found, 2)
  await anna.undo(ANNA, id, { eventId: done.eventId })
  ctx.tick(2000)
  assert.equal((await anna.getState(ANNA, id)).serials.found, 0)
})

test('area claims warn other counters and expire after 30 minutes', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const { id } = await newCount(ctx, anna)
  await bo.requestJoin(BO, id)
  await anna.decideMember(ANNA, id, { email: BO.email, approve: true })
  await bo.claimArea(BO, id, { area: 'a' })
  await assert.rejects(anna.claimArea(ANNA, id, { area: 'A' }), { code: 'CLAIM_TAKEN' })
  const warned = await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  assert.deepEqual(warned.areaWarning, { area: 'A', byName: 'Bo' })
  ctx.tick(31 * 60 * 1000)
  assert.equal((await anna.scan(ANNA, id, { serial: 'N2', place: 'A1.1' })).areaWarning, null)
  await anna.claimArea(ANNA, id, { area: 'A' })
})

test('closing stops counting; only the owner can close and reopen', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  await assert.rejects(ctx.service('pc2').closeCount(BO, id), { code: 'COUNT_OWNER_ONLY' })
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  await anna.closeCount(ANNA, id)
  await assert.rejects(anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' }), { code: 'COUNT_CLOSED' })
  const [entry] = await anna.listCounts(ANNA)
  assert.equal(entry.status, 'closed')
  assert.equal(entry.summary.reached, 1, 'the final progress is saved for the overview card')
  await anna.reopenCount(ANNA, id)
  assert.equal((await anna.scan(ANNA, id, { serial: 'N2', place: 'A1.1' })).outcome, 'found')
})

test('managers approve per material, mark posted in SAP and maintain storage rules', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await assert.rejects(anna.setApproval(ANNA, id, { material: 'R162-0717', status: 'approved' }), { code: 'MANAGER_ONLY' })
  await assert.rejects(mona.setApproval(MONA, id, { material: 'R162-0717', status: 'posted' }), { code: 'APPROVAL_INVALID' })
  await assert.rejects(mona.setApproval(MONA, id, { material: 'R162-0717', status: 'returned' }), { code: 'APPROVAL_INVALID' })
  await mona.setApproval(MONA, id, { material: 'r162-0717', status: 'approved' })
  const posted = await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'posted' })
  assert.equal(posted.postedBy.name, 'Mona')
  assert.equal(posted.by.name, 'Mona')
  await assert.rejects(anna.setRule(ANNA, { sloc: 'D006', kinds: ['new'] }), { code: 'MANAGER_ONLY' })
  await mona.setRule(MONA, { sloc: 'D006', kinds: ['new'] })
  const rules = await anna.getRules(ANNA)
  assert.deepEqual(rules.rules.D006, ['new'])
  assert.equal(rules.canEdit, false)
  assert.ok(rules.suggestions.bySloc.D000)
})

test('another team\'s storage rules are only peeked at, never through a store that creates its folder', async () => {
  const ctx = setup()
  const peeked = []
  const anna = createCountService({
    repo: createCountRepository({ storeFor: team => { if (team !== 'TCD') throw new Error(`store opened for ${team}`); return createStore(path.join(ctx.root, 'data', team)) }, now: () => ctx.clock.now }),
    storeFor: team => { if (team !== 'TCD') throw new Error(`store opened for ${team}`); return createStore(path.join(ctx.root, 'data', team)) },
    fetcher: ctx.fetcher,
    peekRules: async team => { peeked.push(team); return {} },
    journalsDir: path.join(ctx.root, 'local-x'), deviceId: 'x', now: () => ctx.clock.now, journalOptions: { autoFlush: false },
  })
  const preview = await anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } })
  assert.deepEqual(peeked, ['TRR'])
  assert.deepEqual(preview.summary.misplaced[0].suggestions, ['D004', 'D005'])
  assert.equal(fs.existsSync(path.join(ctx.root, 'data', 'TRR')), false)
})

test('when M: drops out during a count, scanning goes on locally and is uploaded later', async () => {
  const ctx = setup()
  const realStores = new Map()
  let offline = false
  const failing = store => new Proxy(store, {
    get(target, name) {
      const value = target[name]
      if (typeof value !== 'function') return value
      return (...args) => {
        if (!offline) return value.apply(target, args)
        if (name === 'getAsync') return Promise.resolve(undefined)
        return Promise.reject(Object.assign(new Error('offline'), { code: 'ENOENT' }))
      }
    },
  })
  const storeFor = team => {
    if (!realStores.has(team)) realStores.set(team, createStore(path.join(ctx.root, 'data', team)))
    return failing(realStores.get(team))
  }
  const anna = createCountService({
    repo: createCountRepository({ storeFor, now: () => ctx.clock.now }), storeFor, fetcher: ctx.fetcher,
    journalsDir: path.join(ctx.root, 'local-off'), deviceId: 'off', now: () => ctx.clock.now, journalOptions: { autoFlush: false },
  })
  const { id } = await newCount(ctx, anna)
  await anna.getState(ANNA, id)
  offline = true
  const result = await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  assert.equal(result.outcome, 'found')
  assert.equal(result.journal.pending, 1)
  assert.equal((await anna.flush(ANNA, id)).ok, false)
  ctx.tick(5000)
  const state = await anna.getState(ANNA, id)
  assert.equal(state.serials.found, 1)
  assert.equal(state.journal.online, false)
  offline = false
  assert.equal((await anna.flush(ANNA, id)).ok, true)
})

test('a count opened once can be opened again and scanned while M: is down (local cache)', async () => {
  const ctx = setup()
  const { createLocalCache } = require('./localCache.cjs')
  const cache = createLocalCache(path.join(ctx.root, 'cache'))
  let offline = false
  const real = createStore(path.join(ctx.root, 'data', 'TCD'))
  const storeFor = () => new Proxy(real, {
    get(target, name) {
      const value = target[name]
      if (typeof value !== 'function') return value
      return (...args) => (offline ? Promise.reject(Object.assign(new Error('offline'), { code: 'EIO' })) : value.apply(target, args))
    },
  })
  const make = device => createCountService({
    repo: createCountRepository({ storeFor, now: () => ctx.clock.now }), storeFor, fetcher: ctx.fetcher, localCache: cache,
    journalsDir: path.join(ctx.root, `local-${device}`), deviceId: device, now: () => ctx.clock.now, journalOptions: { autoFlush: false },
  })
  const first = make('pc1')
  const { id } = await newCount(ctx, first)
  await first.openCount(ANNA, id)
  offline = true
  const restarted = make('pc1')
  const opened = await restarted.openCount(ANNA, id)
  assert.equal(opened.meta.id, id)
  assert.equal((await restarted.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })).outcome, 'found')
  await assert.rejects(make('pc2').openCount(ANNA, 'neveropened1'), { code: 'STORAGE_UNAVAILABLE' })
})

test('a new preview replaces the same user\'s previous one, and huge pasted imports are refused', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const first = await anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } })
  const second = await anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } })
  await assert.rejects(anna.createCount(ANNA, { token: first.token, name: 'Gammel' }), { code: 'PREVIEW_EXPIRED' })
  const { id } = await anna.createCount(ANNA, { token: second.token, name: 'Ny' })
  await assert.rejects(anna.importSerials(ANNA, id, { text: 'X'.repeat(2_000_001), place: 'P1' }), { code: 'IMPORT_TOO_LARGE' })
})

test('the owner or a manager can delete a wrongly created count; colleagues who have it open are told', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await bo.requestJoin(BO, id)
  await anna.decideMember(ANNA, id, { email: BO.email, approve: true })
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  await anna.flush(ANNA, id)
  await bo.getState(BO, id)
  await assert.rejects(bo.deleteCount(BO, id), { code: 'COUNT_OWNER_ONLY' })
  await anna.deleteCount(ANNA, id)
  assert.deepEqual(await anna.listCounts(ANNA), [])
  assert.equal(fs.readdirSync(path.join(ctx.root, 'data', 'TCD')).some(name => name.startsWith(`count-${id}-`)), false)
  assert.equal(fs.readdirSync(path.join(ctx.root, 'local-pc1')).some(name => name.includes(id)), false, 'local journal removed')
  ctx.tick(5000)
  await assert.rejects(bo.getState(BO, id), { code: 'COUNT_DELETED' })
  await assert.rejects(bo.scan(BO, id, { serial: 'N2', place: 'A1.1' }), { code: 'COUNT_DELETED' })
  await assert.rejects(anna.openCount(ANNA, id), { code: 'COUNT_DELETED' })
  const second = await newCount(ctx, anna)
  await mona.deleteCount(MONA, second.id)
  assert.deepEqual(await anna.listCounts(ANNA), [])
})

test('one material in focus: all its serials, found (where and by whom) and missing', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N2', place: 'Palle 3' })
  const result = await anna.materialSerials(ANNA, id, { material: 'int4300-4921-0' })
  assert.equal(result.material, 'INT4300-4921-0')
  assert.equal(result.description, 'INT4300-4921-0 tekst')
  assert.equal(result.expected, 2)
  assert.deepEqual(result.found.map(item => ({ serial: item.serial, place: item.place, byName: item.byName, sloc: item.sloc })), [{ serial: 'N2', place: 'Palle 3', byName: 'Anna', sloc: 'D000' }])
  assert.deepEqual(result.missing.map(item => item.serial), ['N1'])
  assert.deepEqual(result.elsewhere, [])
  const filtered = await anna.materialSerials(ANNA, id, { material: 'INT4300-4921-0', query: 'n1' })
  assert.deepEqual([filtered.found.length, filtered.missing.length, filtered.totals.missing], [0, 1, 1])
  await assert.rejects(anna.materialSerials(ANNA, id, { material: 'R999-0001' }), { code: 'MATERIAL_NOT_FOUND' })
})

test('a material document is looked up in SAP, checked, imported with its number and flagged if imported twice', async () => {
  const ctx = setup()
  const row = (serial, material, description) => ({ serial, material, description, plant: 'D301', sloc: 'D000', userStatus: '' })
  ctx.fetcher.fetchMatdoc = async ({ team }) => ({ document: '4900229137 2026 01', transaction: team === 'TCD' ? 'ZMS_REP' : 'ZMS_PREP', rows: [row('N1', 'INT4300-4921-0', 'SmartPOS'), row('N2', 'INT4300-4921-0', 'SmartPOS'), row('ZZ9', 'INT9999-0000-0', 'Ukendt')] })
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const lookup = await anna.lookupMatdoc(ANNA, id, { document: '4900229137 2026 01' })
  assert.equal(lookup.document, '4900229137 2026 01')
  assert.equal(lookup.transaction, 'ZMS_REP')
  assert.deepEqual(lookup.serials, ['N1', 'N2', 'ZZ9'])
  assert.deepEqual(lookup.materials, [{ material: 'INT4300-4921-0', description: 'SmartPOS', count: 2 }, { material: 'INT9999-0000-0', description: 'Ukendt', count: 1 }])
  assert.deepEqual([lookup.check.found, lookup.check.unknown, lookup.check.toImport], [2, 1, 3])
  assert.equal(lookup.alreadyImported, null)
  await assert.rejects(anna.importSerials(ANNA, id, { serials: lookup.serials, place: 'Palle 14.2', document: 'nonsense', dryRun: false }), { code: 'IMPORT_INVALID' })
  await anna.importSerials(ANNA, id, { serials: lookup.serials, place: 'Palle 14.2', document: lookup.document, dryRun: false })
  const again = await anna.lookupMatdoc(ANNA, id, { document: '4900229137 2026 01' })
  assert.equal(again.alreadyImported.byName, 'Anna')
  assert.equal(again.alreadyImported.place, 'Palle 14.2')
  const focus = await anna.materialSerials(ANNA, id, { material: 'INT4300-4921-0' })
  assert.deepEqual(focus.found.map(item => item.document), ['4900229137 2026 01', '4900229137 2026 01'])
})

test('a manager starts a status; without one no count can be created', async () => {
  const ctx = setup({ status: false })
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  await assert.rejects(anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } }), { code: 'STATUS_NONE' })
  assert.equal(ctx.fetcher.calls, 0, 'no SAP fetch without a status')
  await assert.rejects(anna.startStatus(ANNA, { year: 2026, quarter: 4 }), { code: 'MANAGER_ONLY' })
  const status = await mona.startStatus(MONA, { year: 2026, quarter: 4 })
  assert.equal(status.name, 'Status Q4 2026')
  await assert.rejects(mona.startStatus(MONA, { year: 2027, quarter: 1 }), { code: 'STATUS_ALREADY_OPEN' })
  await assert.rejects(ctx.service('pc9').startStatus({ ...MONA, team: 'TCD' }, { year: 2026, quarter: 5 }), { code: 'STATUS_INVALID' })
  const meta = await newCount(ctx, anna)
  assert.equal(meta.statusId, status.id)
  const overview = await anna.statusOverview(ANNA)
  assert.equal(overview.active.id, status.id)
  assert.equal(overview.canManage, false)
  assert.deepEqual(overview.active.counts.map(item => item.id), [meta.id])
  assert.deepEqual(overview.unassigned, [])
  assert.equal((await mona.statusOverview(MONA)).canManage, true)
})

test('when the status is locked nothing in its counts can change, but it can still be read', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  await ctx.repo.updateStatus('TCD', 'st0open1', { state: 'locked', lockedAt: 2, lockedBy: { email: 'mona@example.test', name: 'Mona' } }, { action: 'locked', by: { email: 'mona@example.test', name: 'Mona' } })
  ctx.tick(5000)
  const locked = { code: 'STATUS_LOCKED' }
  await assert.rejects(anna.scan(ANNA, id, { serial: 'N2', place: 'A1.1' }), locked)
  await assert.rejects(anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 1 }), locked)
  await assert.rejects(anna.importSerials(ANNA, id, { text: 'N2', place: 'P1', dryRun: false }), locked)
  await assert.rejects(anna.undo(ANNA, id, {}), locked)
  await assert.rejects(anna.closeCount(ANNA, id), locked)
  await assert.rejects(anna.deleteCount(ANNA, id), locked)
  await assert.rejects(mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' }), locked)
  await assert.rejects(ctx.service('pc2').requestJoin(BO, id), locked)
  const state = await anna.getState(ANNA, id)
  assert.equal(state.serials.found, 1)
  assert.equal(state.statusLocked, true)
  assert.equal(state.me.canWrite, false)
})

test('counts in a status may not overlap; the stock type splits a location in two counts', async () => {
  const ctx = setup()
  ctx.sap.mb52[0] = stock('INT4300-4921-0', 'D000', 2, 1, 2000, 1000)
  ctx.sap.serials.push(serial('B1', 'INT4300-4921-0', 'D000', 'blocked'))
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const create = async (svc, user, scope, name) => {
    const preview = await svc.preview(user, { scope })
    return svc.createCount(user, { token: preview.token, name })
  }
  const fri = await create(anna, ANNA, { type: 'slocs', slocs: ['D000'], stockTypes: ['unrestricted'] }, 'D000 fri')
  assert.deepEqual(fri.scope.stockTypes, ['unrestricted'])
  const calls = ctx.fetcher.calls
  await assert.rejects(bo.preview(BO, { scope: { type: 'slocs', slocs: ['D000', 'D004'] } }), error => error.code === 'SCOPE_TAKEN' && error.message === 'D000 (unblocked) tælles allerede i "D000 fri" af Anna')
  await assert.rejects(bo.preview(BO, { scope: { type: 'materials', materials: ['R162-0717'], stockTypes: ['unrestricted'] } }), { code: 'SCOPE_TAKEN' })
  assert.equal(ctx.fetcher.calls, calls, 'an overlap is refused before SAP is asked')

  const first = await bo.preview(BO, { scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['blocked'] } })
  const second = await anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['blocked'] } })
  const blocked = await bo.createCount(BO, { token: first.token, name: 'D000 spærret' })
  await assert.rejects(anna.createCount(ANNA, { token: second.token, name: 'Igen' }), { code: 'SCOPE_TAKEN' })

  const { active } = await anna.statusOverview(ANNA)
  assert.deepEqual(active.taken.map(item => `${item.name}:${item.slocs.join(',')}:${item.stockTypes.join('+')}:${item.ownerName}`).sort(), ['D000 fri:D000:unrestricted:Anna', 'D000 spærret:D000:blocked:Bo'])

  const check = await anna.importSerials(ANNA, fri.id, { text: 'N2\nB1', place: 'P1', dryRun: true })
  assert.equal(check.otherCount, 1)
  const elsewhere = await anna.scan(ANNA, fri.id, { serial: 'B1', place: 'A1.1' })
  assert.equal(elsewhere.outcome, 'other-count')
  assert.equal(elsewhere.otherCount, 'D000 spærret')
  assert.equal((await bo.scan(BO, blocked.id, { serial: 'B1', place: 'A1.1' })).outcome, 'found')
  assert.equal((await bo.scan(BO, blocked.id, { serial: 'N1', place: 'A1.1' })).outcome, 'other-count')
  const state = await bo.getState(BO, blocked.id)
  assert.deepEqual([...new Set(state.rows.map(row => row.stockType))], ['blocked'])

  await bo.deleteCount(BO, blocked.id)
  assert.ok((await create(anna, ANNA, { type: 'slocs', slocs: ['D000'], stockTypes: ['blocked'] }, 'D000 spærret 2')).id, 'a deleted count frees its part')
})

test('the status overview sums the progress and value differences of its counts', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  ctx.tick(2000)
  const state = await anna.getState(ANNA, id)
  const { active } = await anna.statusOverview(ANNA)
  assert.equal(active.counts[0].summary.valueDiff, -1500, 'one terminal (1000) and 100 labels (5 each) missing')
  assert.deepEqual(active.progress, { counts: 1, closed: 0, reached: state.progress.overall.reached, total: state.progress.overall.total, percent: state.progress.overall.percent, valueDiff: -1500 })
})

test('a manager locks the status when every count is closed and every material approved; unlocking needs a reason', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })

  let checklist = await mona.statusChecklist(MONA, 'st0open1')
  assert.equal(checklist.ready, false)
  assert.equal(checklist.counts[0].open, true)
  assert.deepEqual(checklist.counts[0].pending.map(item => item.material).sort(), ['INT4300-4921-0', 'INT4300-4921-0-R', 'R162-0717'])
  await assert.rejects(mona.lockStatus(MONA, 'st0open1'), { code: 'STATUS_NOT_READY' })
  await assert.rejects(mona.statusArchive(MONA, 'st0open1'), { code: 'STATUS_NOT_LOCKED' })

  await anna.closeCount(ANNA, id)
  await mona.setApproval(MONA, id, { material: 'INT4300-4921-0', status: 'approved' })
  await mona.setApproval(MONA, id, { material: 'INT4300-4921-0-R', status: 'approved' })
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'posted' })
  checklist = await mona.statusChecklist(MONA, 'st0open1')
  assert.equal(checklist.ready, true)
  await assert.rejects(anna.lockStatus(ANNA, 'st0open1'), { code: 'MANAGER_ONLY' })

  const locked = await mona.lockStatus(MONA, 'st0open1')
  assert.equal(locked.state, 'locked')
  assert.equal(locked.lockedBy.email, 'mona@example.test')
  assert.deepEqual(locked.reports.map(report => `${report.version}:${report.file}:${report.counts.length}`), ['1:Status Q4 2026 v1.xlsx:1'])
  assert.deepEqual(ctx.written.map(item => `${item.kind}:${item.language}`), ['count:da', 'status:da'], 'Danish unless the manager asks for English')
  await assert.rejects(mona.lockStatus(MONA, 'st0open1'), { code: 'STATUS_LOCKED' })
  await assert.rejects(anna.reopenCount(ANNA, id), { code: 'STATUS_LOCKED' })
  const overview = await anna.statusOverview(ANNA)
  assert.equal(overview.active, null)
  assert.equal(overview.statuses[0].state, 'locked')

  const archive = await anna.statusArchive(ANNA, 'st0open1')
  assert.deepEqual([archive.totals.over, archive.totals.valueOver, archive.totals.valueUnder, archive.totals.valueAbs], [0, 0, 1500, 1500], 'only missing pieces: under is the whole difference')
  assert.ok(archive.totals.absPercent > 0 && archive.totals.under === archive.totals.absDiff)
  assert.deepEqual(archive.counts.map(item => item.id), [id])
  assert.deepEqual([...new Set(archive.lines.map(line => line.material))].sort(), ['INT4300-4921-0', 'INT4300-4921-0-R', 'R162-0717'])
  assert.equal(archive.lines.find(line => line.material === 'R162-0717').approval.status, 'posted')
  assert.equal(await anna.statusArchive(ANNA, 'st0open1'), archive, 'a locked status is read once')

  await assert.rejects(anna.unlockStatus(ANNA, 'st0open1', { reason: 'Fejl' }), { code: 'MANAGER_ONLY' })
  await assert.rejects(mona.unlockStatus(MONA, 'st0open1', { reason: ' ' }), { code: 'UNLOCK_REASON' })
  const unlocked = await mona.unlockStatus(MONA, 'st0open1', { reason: 'Rettelse af R162' })
  assert.equal(unlocked.state, 'open')
  assert.deepEqual(unlocked.history.at(-1).reason, 'Rettelse af R162')
  await anna.reopenCount(ANNA, id)
  await anna.closeCount(ANNA, id)
  const again = await mona.lockStatus(MONA, 'st0open1', { language: 'en' })
  assert.deepEqual(again.reports.map(report => report.version), [1, 2])
  assert.deepEqual(ctx.written.at(-1), { kind: 'status', team: 'TCD', version: 2, counts: 1, history: ['locked', 'unlocked', 'locked'], language: 'en' })
  assert.equal(ctx.written.at(-2).language, 'en', 'the count reports follow the language of the manager who locks')

  await mona.startStatus(MONA, { year: 2027, quarter: 1 })
  await assert.rejects(mona.unlockStatus(MONA, 'st0open1', { reason: 'Rettelse' }), { code: 'STATUS_ALREADY_OPEN' })
})

test('serial number rules decide per material and stock type whether the long serials from SAP are copied; they are cached', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N2', place: 'A1.1' })
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  ctx.tick(2000)
  const row = { material: 'INT4300-4921-0', sloc: 'D000', stockType: 'unrestricted' }

  assert.deepEqual(await anna.copySerials(ANNA, id, row), { serials: ['N1', 'N2'], long: false, total: 2, withoutLong: [], lookedUp: 0 })
  assert.equal(ctx.fetcher.longCalls.length, 0, 'no rule, no SAP')

  await assert.rejects(anna.setSerialRule(ANNA, { material: 'INT4300-4921-0', unrestricted: true }), { code: 'MANAGER_ONLY' })
  await mona.setSerialRule(MONA, { material: 'INT4300-4921-0', unrestricted: true, blocked: false })
  const rules = await anna.serialRules(ANNA)
  assert.equal(rules.supported, true)
  assert.equal(rules.canEdit, false)
  assert.deepEqual(rules.rules.map(rule => `${rule.material}:${rule.unrestricted}:${rule.blocked}`), ['INT4300-4921-0:true:false'])
  assert.deepEqual((await anna.serialRules(TRINE)).supported, false)
  assert.deepEqual((await anna.openCount(ANNA, id)).serialRules['INT4300-4921-0'].unrestricted, true)

  assert.deepEqual(await anna.copySerials(ANNA, id, row), { serials: ['251427N1', 'N2'], long: true, total: 2, withoutLong: ['N2'], lookedUp: 2 })
  assert.deepEqual(ctx.fetcher.longCalls[0], { material: 'INT4300-4921-0', serials: ['N1', 'N2'] })
  await anna.flush(ANNA, id)
  const again = await ctx.service('pc2').copySerials(BO, id, row)
  assert.deepEqual(again.serials, ['251427N1', 'N2'])
  assert.deepEqual(ctx.fetcher.longCalls[1].serials, ['N2'], 'the long N1 comes from the shared cache, also on another PC')
  assert.deepEqual((await anna.copySerials(ANNA, id, { ...row, stockType: 'blocked' })).serials, [])
})

test('a manager deletes a whole status with all its counts, also a locked one', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  await anna.flush(ANNA, id)
  await assert.rejects(anna.deleteStatus(ANNA, 'st0open1'), { code: 'MANAGER_ONLY' })
  await ctx.repo.updateStatus('TCD', 'st0open1', { state: 'locked', lockedAt: 2 }, { action: 'locked', by: { email: 'mona@example.test', name: 'Mona' } })

  assert.deepEqual(await mona.deleteStatus(MONA, 'st0open1'), { ok: true, counts: 1 })
  const overview = await anna.statusOverview(ANNA)
  assert.deepEqual([overview.active, overview.statuses.length, overview.unassigned.length], [null, 0, 0])
  ctx.tick(5000)
  await assert.rejects(anna.getState(ANNA, id), { code: 'COUNT_DELETED' })
  await assert.rejects(mona.deleteStatus(MONA, 'st0open1'), { code: 'STATUS_NOT_FOUND' })
  assert.equal((await mona.startStatus(MONA, { year: 2026, quarter: 4 })).state, 'open', 'a new status can start right away')
})

test('a new count has exactly one stock type, and blocked stock is only counted in D000', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const invalid = { code: 'SCOPE_INVALID' }
  await assert.rejects(anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['unrestricted', 'blocked'] } }), invalid)
  await assert.rejects(anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000', 'D004'], stockTypes: ['blocked'] } }), error => error.code === 'SCOPE_INVALID' && /D000/.test(error.message))
  await assert.rejects(anna.preview(ANNA, { scope: { type: 'materials', materials: ['R162-0717'], stockTypes: ['blocked'] } }), invalid)
  assert.equal(ctx.fetcher.calls, 0, 'refused before SAP is asked')
  const blocked = await anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['blocked'] } })
  assert.ok(blocked.token)
  const plain = await anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } })
  const meta = await anna.createCount(ANNA, { token: plain.token, name: 'D000' })
  assert.deepEqual(meta.scope.stockTypes, ['unrestricted'], 'no stock type given = unblocked')
})

test('a new count is terminals or accessories; accessories only in D000, and accessories elsewhere show as an error', async () => {
  const ctx = setup()
  ctx.sap.mb52.push(stock('R162-0717', 'D004', 5, 0, 25))
  const anna = ctx.service('pc1')
  const scope = (slocs, kinds) => ({ type: 'slocs', slocs, stockTypes: ['unrestricted'], kinds })
  await assert.rejects(anna.preview(ANNA, { scope: scope(['D000', 'D004'], ['accessory']) }), error => error.code === 'SCOPE_INVALID' && /D000/.test(error.message))
  await assert.rejects(anna.preview(ANNA, { scope: scope(['D000'], ['new', 'used', 'accessory']) }), { code: 'SCOPE_INVALID' })
  await assert.rejects(anna.preview(ANNA, { scope: scope(['D000'], ['new']) }), { code: 'SCOPE_INVALID' })
  assert.equal(ctx.fetcher.calls, 0)

  const accessories = await anna.preview(ANNA, { scope: scope(['D000'], ['accessory']) })
  assert.equal(accessories.summary.groups.new.lines, 0)
  assert.equal(accessories.summary.groups.accessory.lines, 1)
  assert.deepEqual(accessories.accessoryOutside, [{ sloc: 'D004', materials: 1, quantity: 5 }])
  await anna.createCount(ANNA, { token: accessories.token, name: 'D000 tilbehør' })
  const terminals = await anna.preview(ANNA, { scope: scope(['D000'], ['new', 'used']) })
  assert.deepEqual(terminals.accessoryOutside, [])
  await anna.createCount(ANNA, { token: terminals.token, name: 'D000 terminaler' })
  const { active } = await anna.statusOverview(ANNA)
  assert.deepEqual(active.taken.map(item => `${item.name}:${item.kinds.join('+')}`).sort(), ['D000 terminaler:new+used', 'D000 tilbehør:accessory'])
})

test('approval freezes a material: fetching SAP again or counting afterwards does not change its difference', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  const approval = await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  assert.deepEqual(approval.frozen, [{ sloc: 'D000', stockType: 'unrestricted', sapQty: 100, counted: 97, diff: -3, valueDiff: -15 }])

  ctx.sap.mb52[2] = stock('R162-0717', 'D000', 130, 0, 650)
  const refetch = await anna.previewRefetch(ANNA, id)
  assert.deepEqual(refetch.diff.changes.find(change => change.material === 'R162-0717').frozen, true)
  await anna.applyRefetch(ANNA, id, { token: refetch.token })
  ctx.tick(2000)
  const row = state => state.rows.find(item => item.material === 'R162-0717')
  let state = await anna.getState(ANNA, id)
  assert.deepEqual([row(state).sapQty, row(state).counted, row(state).diff, row(state).countedAfter], [100, 97, -3, 0])
  assert.equal(typeof row(state).frozenAt, 'number')

  await assert.rejects(anna.saveLine(ANNA, id, { place: 'A1.2', material: 'R162-0717', qty: 5 }), { code: 'MATERIAL_APPROVED' }, 'an approved material is not counted any more')
  assert.equal((await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'posted' })).frozen[0].diff, -3, 'posting keeps the frozen numbers')

  await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, D1: { id: 'D1', docNo: '105000903', status: 'printed', lines: [{ material: 'R162-0717' }] } } }))
  await assert.rejects(mona.setApproval(MONA, id, { material: 'R162-0717', status: 'reset' }), { code: 'PIDOC_ACTIVE' }, 'an SAP document locks the approval')
  await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, D1: { ...all.D1, status: 'deleted' } } }))

  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'reset' })
  await anna.saveLine(ANNA, id, { place: 'A1.2', material: 'R162-0717', qty: 5 })
  ctx.tick(2000)
  state = await anna.getState(ANNA, id)
  assert.deepEqual([row(state).sapQty, row(state).counted, row(state).diff, row(state).frozenAt], [130, 102, -28, undefined], 'reset shows the live numbers again')
})

test('a material is locked to its counter: others ask to count along; sending to approval needs the difference accepted', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await bo.requestJoin(BO, id)
  await anna.decideMember(ANNA, id, { email: BO.email, approve: true })

  assert.equal((await anna.lockMaterial(ANNA, id, { material: 'INT4300-4921-0' })).holder.name, 'Anna')
  await assert.rejects(bo.lockMaterial(BO, id, { material: 'INT4300-4921-0' }), { code: 'MATERIAL_LOCKED' })
  const scanned = await bo.scan(BO, id, { serial: 'N1', place: 'A1.1' })
  assert.deepEqual([scanned.outcome, scanned.saved, scanned.materialWarning], ['found', true, { kind: 'locked', byName: 'Anna' }], 'the scan is kept, with a warning')
  await bo.saveLine(BO, id, { place: 'A1.1', material: 'R162-0717', qty: 100 })
  await assert.rejects(anna.saveLine(ANNA, id, { place: 'A1.2', material: 'R162-0717', qty: 1 }), { code: 'MATERIAL_LOCKED' }, 'counting an accessory locks it')

  assert.deepEqual((await bo.requestMaterial(BO, id, { material: 'INT4300-4921-0' })).requests.map(item => item.name), ['Bo'])
  await assert.rejects(bo.answerMaterialRequest(BO, id, { material: 'INT4300-4921-0', email: BO.email, allow: true }), { code: 'COUNT_OWNER_ONLY' })
  await anna.answerMaterialRequest(ANNA, id, { material: 'INT4300-4921-0', email: BO.email, allow: true })
  assert.deepEqual((await bo.lockMaterial(BO, id, { material: 'INT4300-4921-0' })).helpers.map(item => item.name), ['Bo'])
  let state = await anna.getState(ANNA, id)
  assert.deepEqual(state.materialLocks.map(lock => `${lock.material}:${lock.holder.name}`).sort(), ['INT4300-4921-0:Anna', 'R162-0717:Bo'])

  const sent = await bo.submitMaterial(BO, id, { material: 'R162-0717' })
  assert.deepEqual([sent.status, sent.diff, sent.by.name], ['submitted', 0, 'Bo'])
  await bo.flush(BO, id)
  await assert.rejects(anna.submitMaterial(ANNA, id, { material: 'INT4300-4921-0' }), error => error.code === 'SUBMIT_HAS_DIFF' && /difference på -1 stk\./.test(error.message))
  const withDiff = await anna.submitMaterial(ANNA, id, { material: 'INT4300-4921-0', acceptDiff: true, comment: 'N2 mangler' })
  assert.deepEqual([withDiff.status, withDiff.diff, withDiff.comment], ['submitted', -1, 'N2 mangler'])
  state = await anna.getState(ANNA, id)
  assert.deepEqual(state.materialLocks, [], 'sending to approval releases the lock')
  assert.equal(state.approvals['R162-0717'].status, 'submitted')

  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  await assert.rejects(anna.lockMaterial(ANNA, id, { material: 'R162-0717' }), { code: 'MATERIAL_APPROVED' })
  await assert.rejects(anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 1 }), { code: 'MATERIAL_APPROVED' })
  assert.equal((await bo.scan(BO, id, { serial: 'N2', place: 'A1.1' })).materialWarning, null)

  await anna.lockMaterial(ANNA, id, { material: 'INT4300-4921-0-R' })
  await assert.rejects(bo.releaseMaterial(BO, id, { material: 'INT4300-4921-0-R' }), { code: 'COUNT_OWNER_ONLY' })
  await anna.releaseMaterial(ANNA, id, { material: 'INT4300-4921-0-R' })
  assert.deepEqual((await anna.getState(ANNA, id)).materialLocks, [])
})

test('count document: SAP stock of the day + the approved difference; fetched by a manager or the owner, read by everyone', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  const row = doc => doc.rows.find(item => item.material === 'R162-0717')

  let doc = await bo.countDoc(BO, id)
  assert.deepEqual([doc.fetchedAt, row(doc).sapToday, row(doc).docQty, row(doc).diff, doc.canFetch], [null, null, null, -3, false])
  await assert.rejects(bo.fetchDocStock(BO, id), { code: 'COUNT_OWNER_ONLY' })

  ctx.sap.mb52[2] = stock('R162-0717', 'D000', 80, 0, 400)
  ctx.tick(60_000)
  doc = await mona.fetchDocStock(MONA, id)
  assert.deepEqual([row(doc).sapAtApproval, row(doc).sapToday, row(doc).docQty], [100, 80, 77])
  assert.equal(doc.fetchedBy.name, 'Mona')
  assert.equal(doc.missingApproval, 2, 'the terminals are not approved yet')
  assert.equal(row(await bo.countDoc(BO, id)).docQty, 77, 'stored for the whole team')
  assert.equal((await anna.countDoc(ANNA, id)).canFetch, true)
  const ADA = { email: 'ada@example.test', fullName: 'Ada', role: 'user', team: 'TCD', countAdmin: true }
  const ada = ctx.service('pc4')
  assert.equal((await ada.countDoc(ADA, id)).canFetch, true, 'an Optælling admin may fetch the SAP figures of the day')
  ctx.tick(60_000)
  assert.equal((await ada.fetchDocStock(ADA, id)).fetchedBy.name, 'Ada')
})

test('count document for serials: SAP\'s serials of the day minus the ones missing at approval – also for an older approval', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  await anna.scan(ANNA, id, { serial: 'U1', place: 'A1.1' })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  const approval = await mona.setApproval(MONA, id, { material: 'INT4300-4921-0', status: 'approved' })
  assert.deepEqual(approval.frozen.map(row => [row.diff, row.missingSerials]), [[-1, ['N2']]], 'N2 is missing at approval')
  await mona.setApproval(MONA, id, { material: 'INT4300-4921-0-R', status: 'approved' })
  const row = (doc, material) => doc.rows.find(item => item.material === material && item.sloc === 'D000')
  const terminal = { material: 'INT4300-4921-0', sloc: 'D000', stockType: 'unrestricted' }
  const used = { material: 'INT4300-4921-0-R', sloc: 'D000', stockType: 'unrestricted' }
  await assert.rejects(mona.copySerials(MONA, id, { ...terminal, forDoc: true }), { code: 'DOC_NOT_FETCHED' })

  // Days later: N5 has come in; U1 has gone out and U8 has come in.
  ctx.sap.mb52 = [stock('INT4300-4921-0', 'D000', 3, 0, 3000), stock('INT4300-4921-0-R', 'D000', 1), stock('R162-0717', 'D000', 100, 0, 500)]
  ctx.sap.serials = [serial('N1', 'INT4300-4921-0', 'D000'), serial('N2', 'INT4300-4921-0', 'D000'), serial('N5', 'INT4300-4921-0', 'D000'), serial('U8', 'INT4300-4921-0-R', 'D000')]
  ctx.tick(86_400_000)
  let doc = await mona.fetchDocStock(MONA, id)
  assert.equal(doc.withSerials, true)
  assert.deepEqual([row(doc, 'INT4300-4921-0').sapToday, row(doc, 'INT4300-4921-0').docQty, row(doc, 'INT4300-4921-0').expectedQty], [3, 2, 2])
  assert.deepEqual([row(doc, 'INT4300-4921-0-R').diff, row(doc, 'INT4300-4921-0-R').docQty, row(doc, 'INT4300-4921-0-R').expectedQty], [0, 1, 1])
  assert.equal('docSerials' in row(doc, 'INT4300-4921-0'), false, 'the lists stay in the main process')
  assert.deepEqual((await mona.copySerials(MONA, id, { ...terminal, forDoc: true })).serials, ['N1', 'N5'], 'the new terminal is on the list, the missing N2 is not')
  assert.deepEqual((await mona.copySerials(MONA, id, { ...used, forDoc: true })).serials, ['U8'], 'zero difference = the live list of SAP')
  assert.deepEqual((await mona.copySerials(MONA, id, terminal)).serials, ['N1'], 'without forDoc: the serials found in the count')
  await assert.rejects(mona.copySerials(MONA, id, { material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', forDoc: true }), { code: 'APPROVAL_INVALID' })

  // An approval from before the missing serials were frozen: rebuilt from the scan times. A scan after it does not count.
  const stored = (await ctx.repo.getApprovals('TCD', id))['INT4300-4921-0']
  await ctx.repo.setApproval('TCD', id, 'INT4300-4921-0', { ...stored, frozen: stored.frozen.map(({ missingSerials, ...rest }) => rest) })
  await anna.scan(ANNA, id, { serial: 'N2', place: 'A1.1' })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  assert.deepEqual((await mona.copySerials(MONA, id, { ...terminal, forDoc: true })).serials, ['N1', 'N5'])

  // A stock of the day fetched before serials were included: no list, fetch again.
  const saved = await ctx.repo.getCountDoc('TCD', id)
  await ctx.repo.setCountDoc('TCD', id, { ...saved, withSerials: undefined, lines: saved.lines.map(({ serials, ...line }) => line) })
  doc = await mona.countDoc(MONA, id)
  assert.deepEqual([row(doc, 'INT4300-4921-0').needsSerials, row(doc, 'INT4300-4921-0').docQty, row(doc, 'R162-0717').needsSerials], [true, null, false])
  await assert.rejects(mona.copySerials(MONA, id, { ...terminal, forDoc: true }), { code: 'DOC_NOT_FETCHED' })
})

test('a found serial can be removed again (undoable); approved materials and the others\' locked materials are protected', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await bo.requestJoin(BO, id)
  await anna.decideMember(ANNA, id, { email: BO.email, approve: true })
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  await assert.rejects(anna.removeSerial(ANNA, id, { serial: 'N2' }), { code: 'SERIAL_NOT_FOUND' })
  const removed = await anna.removeSerial(ANNA, id, { serial: 'n1 ' })
  assert.deepEqual([removed.serial, removed.material, removed.previous.byName, removed.previous.place], ['N1', 'INT4300-4921-0', 'Anna', 'A1.1'])
  assert.equal((await anna.getState(ANNA, id)).serials.found, 0)
  assert.equal((await anna.undo(ANNA, id)).undone.type, 'serial-remove', 'Ctrl+Z brings it back')
  assert.equal((await anna.getState(ANNA, id)).serials.found, 1)

  await anna.lockMaterial(ANNA, id, { material: 'INT4300-4921-0' })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  await assert.rejects(bo.removeSerial(BO, id, { serial: 'N1' }), { code: 'MATERIAL_LOCKED' })
  await anna.releaseMaterial(ANNA, id, { material: 'INT4300-4921-0' })
  await mona.setApproval(MONA, id, { material: 'INT4300-4921-0', status: 'approved' })
  await assert.rejects(anna.removeSerial(ANNA, id, { serial: 'N1' }), { code: 'MATERIAL_APPROVED' })
})

test('the owner can fetch SAP again, see the differences and apply them', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  ctx.sap.mb52 = [stock('INT4300-4921-0', 'D000', 3, 0, 3000), stock('R162-0717', 'D000', 100, 0, 500)]
  ctx.sap.serials = [serial('N1', 'INT4300-4921-0', 'D000'), serial('N2', 'INT4300-4921-0', 'D000'), serial('N9', 'INT4300-4921-0', 'D000')]
  ctx.tick(1000)
  const preview = await anna.previewRefetch(ANNA, id)
  assert.deepEqual(preview.diff.serials, { added: 1, removed: 1 })
  assert.deepEqual(preview.diff.changes.map(change => `${change.material}:${change.before.unrestricted}->${change.after.unrestricted}`), ['INT4300-4921-0:2->3', 'INT4300-4921-0-R:1->0'])
  const meta = await anna.applyRefetch(ANNA, id, { token: preview.token })
  assert.equal(meta.snapshotVersion, 2)
  assert.equal((await anna.getState(ANNA, id)).serials.expected, 3)

  const ADA = { email: 'ada@example.test', fullName: 'Ada', role: 'user', team: 'TCD', countAdmin: true }
  const ada = ctx.service('pc4')
  await assert.rejects(ctx.service('pc2').previewRefetch(BO, id), { code: 'COUNT_OWNER_ONLY' }, 'an ordinary user may not')
  assert.equal((await ada.openCount(ADA, id)).me.canFetchSap, true)
  assert.equal((await anna.openCount(ANNA, id)).me.canFetchSap, true)
  const byAdmin = await ada.previewRefetch(ADA, id)
  await assert.rejects(anna.applyRefetch(ANNA, id, { token: byAdmin.token }), { code: 'PREVIEW_EXPIRED' }, 'only the one who fetched applies it')
  assert.equal((await ada.applyRefetch(ADA, id, { token: byAdmin.token })).snapshotVersion, 3, 'an Optælling admin may fetch SAP again')
})

test('readCount (for Hubert) shows figures, differences, material locks and area claims without writing anything to the drive', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const { id } = await newCount(ctx, anna)
  await bo.requestJoin(BO, id)
  await anna.decideMember(ANNA, id, { email: BO.email, approve: true })
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  await anna.lockMaterial(ANNA, id, { material: 'INT4300-4921-0' })
  await bo.claimArea(BO, id, { area: 'A' })
  await anna.flush(ANNA, id)
  const files = () => Object.fromEntries(fs.readdirSync(path.join(ctx.root, 'data', 'TCD')).map(name => [name, fs.readFileSync(path.join(ctx.root, 'data', 'TCD', name), 'utf8')]))
  const before = files()
  ctx.tick(5 * 60 * 1000)
  const view = await ctx.service('pc3').readCount(MONA, id)
  assert.deepEqual(files(), before, 'Hubert never writes, not even the summary in the counts index')
  assert.equal(view.meta.id, id)
  assert.ok(view.rows.some(row => row.material === 'INT4300-4921-0' && row.diff === -1))
  assert.deepEqual(view.materialLocks.map(lock => `${lock.material}:${lock.holder.name}`), ['INT4300-4921-0:Anna'])
  assert.deepEqual(view.claims.map(claim => `${claim.area}:${claim.name}`), ['A:Bo'])
  assert.ok(view.progress.overall.total > 0)
})

// ---------- Scan context: scanning answers from memory, the drive is read in the background ----------
/** A service for `name` whose repository counts (and can hold) every read from the drive. */
function countingService(ctx, name) {
  const base = createCountRepository({ storeFor: ctx.storeFor, now: () => ctx.clock.now })
  const reads = []
  let gate = null
  const repo = new Proxy(base, {
    get(target, prop) {
      const value = target[prop]
      if (typeof value !== 'function' || !/^(get|is|list)/.test(String(prop))) return value
      return async (...args) => {
        reads.push(prop)
        if (gate) await gate.promise
        return value.apply(target, args)
      }
    },
  })
  const svc = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, journalsDir: path.join(ctx.root, `local-${name}`), deviceId: name, now: () => ctx.clock.now, newId: () => `${name}-${crypto.randomUUID()}`, journalOptions: { autoFlush: false } })
  return {
    svc,
    reads,
    hold() { let release; const promise = new Promise(resolve => { release = resolve }); gate = { promise, release } },
    release() { if (gate) { gate.release(); gate = null } },
  }
}

const within = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve('timeout'), ms))])

test('a second scan within 5 s reads nothing from the drive', async () => {
  const ctx = setup()
  const { id } = await newCount(ctx, ctx.service('pc1'))
  const pc = countingService(ctx, 'pc1b')
  assert.equal((await pc.svc.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })).outcome, 'found')
  ctx.tick(1000)
  pc.reads.length = 0
  const second = await pc.svc.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  assert.equal(second.outcome, 'duplicate')
  const third = await pc.svc.scan(ANNA, id, { serial: 'N2', place: 'A1.1' })
  assert.deepEqual([third.outcome, third.saved, third.areaWarning, third.materialWarning], ['found', true, null, null])
  assert.deepEqual(pc.reads, [], 'served from the scan context')
})

test('a stale scan context answers at once and refreshes in the background', async () => {
  const ctx = setup()
  const { id } = await newCount(ctx, ctx.service('pc1'))
  const pc = countingService(ctx, 'pc1b')
  await pc.svc.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  ctx.tick(6000)
  pc.reads.length = 0
  pc.hold()
  try {
    const started = Date.now()
    const result = await within(pc.svc.scan(ANNA, id, { serial: 'N2', place: 'A1.1' }), 1000)
    assert.notEqual(result, 'timeout', 'the scan must not wait for the drive')
    assert.ok(Date.now() - started < 200, `answered in ${Date.now() - started} ms`)
    assert.deepEqual([result.outcome, result.saved], ['found', true])
    assert.equal((await within(pc.svc.scan(ANNA, id, { serial: 'U1', place: 'A1.1' }), 1000)).outcome, 'found')
  } finally {
    pc.release()
  }
  await pc.svc._scanContextSettled()
  assert.equal(pc.reads.filter(name => name === 'getStatus').length, 1, 'one background refresh, not one per scan')
  assert.equal(pc.reads.filter(name => name === 'getMembers').length, 1)
  pc.reads.length = 0
  ctx.tick(1000)
  assert.equal((await pc.svc.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })).outcome, 'duplicate')
  assert.deepEqual(pc.reads, [], 'the refreshed context is used')
})

test('a status locked elsewhere rejects the next scan after the background refresh', async () => {
  const ctx = setup()
  const { id } = await newCount(ctx, ctx.service('pc1'))
  const pc = countingService(ctx, 'pc1b')
  await pc.svc.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  await ctx.repo.updateStatus('TCD', 'st0open1', { state: 'locked', lockedAt: 2, lockedBy: { email: 'mona@example.test', name: 'Mona' } }, { action: 'locked', by: { email: 'mona@example.test', name: 'Mona' } })
  ctx.tick(6000)
  pc.hold()
  try {
    const result = await within(pc.svc.scan(ANNA, id, { serial: 'N2', place: 'A1.1' }), 1000)
    assert.notEqual(result, 'timeout')
    assert.equal(result.outcome, 'found', 'answered from the context of a moment ago')
  } finally {
    pc.release()
  }
  await pc.svc._scanContextSettled()
  await assert.rejects(pc.svc.scan(ANNA, id, { serial: 'U1', place: 'A1.1' }), { code: 'STATUS_LOCKED' })
})

test('changing a material lock on this client is seen by the next scan', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  await anna.requestJoin(BO, id)
  await anna.decideMember(ANNA, id, { email: BO.email, approve: true })
  const pc = countingService(ctx, 'pc2')
  assert.equal((await pc.svc.scan(BO, id, { serial: 'U1', place: 'A1.1' })).materialWarning, null)
  await pc.svc.lockMaterial(ANNA, id, { material: 'INT4300-4921-0' })
  ctx.tick(1000)
  const scanned = await pc.svc.scan(BO, id, { serial: 'N1', place: 'A1.1' })
  assert.deepEqual([scanned.outcome, scanned.saved, scanned.materialWarning], ['found', true, { kind: 'locked', byName: 'Anna' }])
  await pc.svc.releaseMaterial(ANNA, id, { material: 'INT4300-4921-0' })
  assert.equal((await pc.svc.scan(BO, id, { serial: 'N2', place: 'A1.1' })).materialWarning, null)
})
