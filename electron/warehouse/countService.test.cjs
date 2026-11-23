const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore, whenWritesSettled } = require('../store.cjs')
const { createCountRepository } = require('./countRepository.cjs')
const { createCountService } = require('./countService.cjs')
const { createPiDocService } = require('./piDocService.cjs')

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
  // A PC of its own has its own stores (and read caches) on the same folder; the others share one, as before.
  const ownStores = new Map()
  const storeOf = name => team => {
    const id = `${name}:${team}`
    if (!ownStores.has(id)) ownStores.set(id, createStore(path.join(root, 'data', team)))
    return ownStores.get(id)
  }
  const service = (name, { ownStore = false } = {}) => createCountService({
    repo: createCountRepository({ storeFor: ownStore ? storeOf(name) : storeFor, now: () => clock.now }),
    storeFor: ownStore ? storeOf(name) : storeFor, fetcher, placementSource, reportWriter,
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

test('an Optælling admin and a manager take part in every count from the start and decide on join requests', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const mona = ctx.service('pc3')
  const ADA = { email: 'ada@example.test', fullName: 'Ada', role: 'user', team: 'TCD', countAdmin: true }
  const ada = ctx.service('pc4')
  const { id } = await newCount(ctx, anna)

  const adaOpen = await ada.openCount(ADA, id)
  assert.deepEqual([adaOpen.me.canWrite, adaOpen.me.status, adaOpen.me.byRole, adaOpen.me.canDecideMembers], [true, 'approved', true, true])
  assert.equal((await ada.scan(ADA, id, { serial: 'N1', place: 'A1.1' })).saved, true, 'an admin scans without asking to join')
  assert.equal((await mona.scan(MONA, id, { serial: 'N2', place: 'A1.1' })).saved, true, 'so does a manager')
  assert.deepEqual(await ada.requestJoin(ADA, id), { email: 'ada@example.test', name: 'Ada', role: 'participant', status: 'approved', byRole: true }, 'nothing to ask for')
  assert.equal((await ctx.repo.getMembers('TCD', id))['ada@example.test'], undefined, 'role access is not written to the members file')

  const boOpen = await bo.openCount(BO, id)
  assert.deepEqual([boOpen.me.canWrite, boOpen.me.byRole, boOpen.me.canDecideMembers], [false, false, false])
  assert.equal((await anna.openCount(ANNA, id)).me.canDecideMembers, true, 'the owner still decides')
  await bo.requestJoin(BO, id)
  assert.equal((await ada.decideMember(ADA, id, { email: BO.email, approve: false })).status, 'rejected')
  assert.equal((await mona.decideMember(MONA, id, { email: BO.email, approve: true })).decidedBy.name, 'Mona')
  assert.equal((await bo.scan(BO, id, { serial: 'U1', place: 'A1.1' })).saved, true)
  await assert.rejects(bo.decideMember(BO, id, { email: ADA.email, approve: true }), { code: 'COUNT_OWNER_ONLY' })

  const list = await bo.listCounts(ADA)
  assert.deepEqual([list[0].canDecideMembers, (await bo.listCounts(BO))[0].canDecideMembers], [true, false])
  await Promise.all([ada.flush(ADA, id), mona.flush(MONA, id), bo.flush(BO, id)])
  ctx.tick(2000)
  const report = await anna.reportData(ANNA, id)
  assert.deepEqual(Object.values(report.members).filter(member => member.status === 'approved').map(member => member.name).sort(), ['Ada', 'Anna', 'Bo', 'Mona'], 'the report names everyone who counted')
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

test('a material document typed with and without year is recognised as already imported', async () => {
  const ctx = setup()
  const asked = []
  ctx.fetcher.fetchMatdoc = async ({ document }) => {
    asked.push(document)
    return { document: '4900229137 2026', transaction: 'ZMS_REP', rows: [{ serial: 'N1', material: 'INT4300-4921-0', description: 'SmartPOS', plant: 'D301', sloc: 'D000', userStatus: '' }] }
  }
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const first = await anna.lookupMatdoc(ANNA, id, { document: '4900229137 2026' })
  await anna.importSerials(ANNA, id, { serials: first.serials, place: 'Palle 14.2', document: first.document, dryRun: false })
  const again = await anna.lookupMatdoc(ANNA, id, { document: '4900229137' })
  assert.deepEqual(asked, ['4900229137 2026', '4900229137'])
  assert.equal(again.document, '4900229137 2026', 'the document SAP found, with its year, is shown')
  assert.equal(again.alreadyImported?.place, 'Palle 14.2')
  const focus = await anna.materialSerials(ANNA, id, { material: 'INT4300-4921-0' })
  assert.deepEqual(focus.found.map(item => item.document), ['4900229137 2026'])
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

test('a count still being created holds its area in the status but is not shown as a count yet', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const creating = { id: 'creating1abc', name: 'D000 på vej', scope: { type: 'slocs', slocs: ['D000'], materials: [] }, status: 'open', owner: { email: 'bo@example.test', name: 'Bo' }, createdAt: ctx.clock.now, fetchedAt: ctx.clock.now, statusId: 'st0open1', creating: true }
  await ctx.storeFor('TCD').updateAsync('counts-index', { op: 'setField', field: creating.id, value: creating })
  assert.deepEqual(await anna.listCounts(ANNA), [])
  const { active } = await anna.statusOverview(ANNA)
  assert.deepEqual([active.counts.length, active.taken.map(item => item.name)], [0, ['D000 på vej']])
  await assert.rejects(anna.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } }), { code: 'SCOPE_TAKEN' })
  const checklist = await mona.statusChecklist(MONA, 'st0open1')
  assert.deepEqual([checklist.ready, checklist.counts.map(item => [item.name, item.open])], [false, [['D000 på vej', true]]], 'the status cannot be locked meanwhile')
})

/** A store whose "count is created" index write (the `creating` mark cleared) fails the next `times` times. */
function finishFailing(real, times) {
  const left = { times }
  return {
    left,
    store: {
      ...real,
      mutateAsync: (key, change) => real.mutateAsync(key, current => {
        const before = structuredClone(current)
        const next = change(current)
        const finishing = key === 'counts-index' && next && Object.keys(next).some(id => before?.[id]?.creating && next[id] && !next[id].creating)
        if (finishing && left.times > 0) {
          left.times--
          throw Object.assign(new Error('KV_LOCK_BUSY'), { code: 'KV_LOCK_BUSY' })
        }
        return next
      }),
    },
  }
}

test('a new count whose "created" mark cannot be written is tried again, and given back if it never can', async () => {
  const ctx = setup()
  const failing = finishFailing(ctx.storeFor('TCD'), 1)
  const waits = []
  const repo = createCountRepository({ storeFor: () => failing.store, now: () => ctx.clock.now, wait: async ms => { waits.push(ms) } })
  const svc = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, placementSource: null, journalsDir: path.join(ctx.root, 'local-finish'), deviceId: 'finish', now: () => ctx.clock.now, newId: () => 'unused', journalOptions: { autoFlush: false } })
  const first = await newCount(ctx, svc)
  assert.deepEqual([failing.left.times, waits.length], [0, 1], 'failed once, then tried again')
  assert.deepEqual((await ctx.repo.listCounts('TCD')).map(entry => [entry.id, 'creating' in entry]), [[first.id, false]], 'the count is shown')
  await ctx.repo.deleteCount('TCD', first.id, { email: 'anna@example.test', name: 'Anna' })

  failing.left.times = 99
  const preview = await svc.preview(ANNA, { scope: { type: 'slocs', slocs: ['D000'] } })
  await assert.rejects(svc.createCount(ANNA, { token: preview.token, name: 'Status D000' }), { code: 'KV_LOCK_BUSY' })
  assert.equal(waits.length, 4, 'tried again three times')
  assert.deepEqual(await ctx.repo.listCounts('TCD'), [], 'the area is given back')
  assert.equal(fs.readdirSync(path.join(ctx.root, 'data', 'TCD')).some(name => name.startsWith('count-') && !name.startsWith(`count-${first.id}-`)), false, 'and its files are removed')
  failing.left.times = 0
  const meta = await svc.createCount(ANNA, { token: preview.token, name: 'Status D000' })
  assert.deepEqual((await ctx.repo.listCounts('TCD')).map(entry => entry.id), [meta.id], 'the same preview creates it')
})

test('a status deleted or locked removes the reservations left there by a crash', async () => {
  const ctx = setup()
  const mona = ctx.service('pc3')
  const store = ctx.storeFor('TCD')
  const crashed = id => ({ id, name: 'Hængt', scope: { type: 'slocs', slocs: ['D000'], materials: [] }, status: 'open', owner: { email: 'bo@example.test', name: 'Bo' }, createdAt: ctx.clock.now, fetchedAt: ctx.clock.now, statusId: 'st0open1', creating: true })
  await store.updateAsync('counts-index', { op: 'setField', field: 'crashed1abc', value: crashed('crashed1abc') })
  await store.setAsync('count-crashed1abc-expected', { partial: true })
  ctx.tick(10 * 60 * 1000 + 1)
  await assert.rejects(mona.lockStatus(MONA, 'st0open1'), { code: 'STATUS_NOT_READY' })
  assert.equal(await ctx.repo.isDeleted('TCD', 'crashed1abc'), true, 'locking settles it')

  await store.updateAsync('counts-index', { op: 'setField', field: 'crashed2abc', value: { ...crashed('crashed2abc'), createdAt: ctx.clock.now } })
  await store.setAsync('count-crashed2abc-expected', { partial: true })
  ctx.tick(10 * 60 * 1000 + 1)
  await mona.deleteStatus(MONA, 'st0open1')
  assert.equal(await ctx.repo.isDeleted('TCD', 'crashed2abc'), true, 'deleting settles it')
  assert.equal(fs.readdirSync(path.join(ctx.root, 'data', 'TCD')).some(name => name.startsWith('count-crashed2abc-')), false, 'with its files')
})

test('the status overview sums the progress and value differences of its counts', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  ctx.tick(2000)
  const state = await anna.getState(ANNA, id)
  assert.equal(await whenWritesSettled(5000), true, 'the summary is saved in the background')
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
  assert.deepEqual(ctx.written.map(item => `${item.kind}:${item.language}`).sort(), ['count:da', 'status:da'], 'Danish unless the manager asks for English (the reports are written at the same time)')
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
  const lastTwo = ctx.written.slice(-2)
  assert.deepEqual(lastTwo.find(item => item.kind === 'status'), { kind: 'status', team: 'TCD', version: 2, counts: 1, history: ['locked', 'unlocked', 'locked'], language: 'en' })
  assert.equal(lastTwo.find(item => item.kind === 'count').language, 'en', 'the count reports follow the language of the manager who locks')

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
  // The long serials are saved to the shared cache in the background (copying does not wait for M:).
  assert.equal(await whenWritesSettled(5000), true)
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

  // A posted material is final: the counted-after numbers never go into a second correction in SAP.
  const postedMessage = 'R162-0717 er bogført i SAP og kan ikke ændres. Lav en ny optælling, hvis der skal rettes mere.'
  for (const status of ['reset', 'returned', 'approved']) {
    await assert.rejects(mona.setApproval(MONA, id, { material: 'R162-0717', status, comment: 'Tæl igen' }), { code: 'COUNT_MATERIAL_POSTED', message: postedMessage }, `${status} is refused on a posted material`)
  }
  assert.equal((await ctx.repo.getApprovals('TCD', id))['R162-0717'].status, 'posted')

  await mona.undoPosted(MONA, id, { material: 'R162-0717', reason: 'Trykket ved en fejl' })
  await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, D1: { id: 'D1', docNo: '105000903', status: 'printed', lines: [{ material: 'R162-0717' }] } } }))
  await assert.rejects(mona.setApproval(MONA, id, { material: 'R162-0717', status: 'reset' }), { code: 'PIDOC_ACTIVE', message: 'R162-0717 har SAP-dokument 105000903. Slet det først.' }, 'an SAP document locks the approval')
  await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, D1: { ...all.D1, status: 'deleted' } } }))

  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'reset' })
  await anna.saveLine(ANNA, id, { place: 'A1.2', material: 'R162-0717', qty: 5 })
  ctx.tick(2000)
  state = await anna.getState(ANNA, id)
  assert.deepEqual([row(state).sapQty, row(state).counted, row(state).diff, row(state).frozenAt], [130, 102, -28, undefined], 'reset shows the live numbers again')
})

test('a wrong "Bogført i SAP" mark is undone only by a manager, with a reason and without an SAP document', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const ADA = { email: 'ada@example.test', fullName: 'Ada', role: 'user', team: 'TCD', countAdmin: true }
  const { id } = await newCount(ctx, anna)
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  await assert.rejects(mona.undoPosted(MONA, id, { material: 'R162-0717', reason: 'Fejl' }), { code: 'APPROVAL_INVALID' }, 'only a posted material can be undone')
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'posted' })
  ctx.tick(1000)

  await assert.rejects(anna.undoPosted(ANNA, id, { material: 'R162-0717', reason: 'Fejl' }), { code: 'MANAGER_ONLY' })
  await assert.rejects(ctx.service('pc4').undoPosted(ADA, id, { material: 'R162-0717', reason: 'Fejl' }), { code: 'MANAGER_ONLY' }, 'an Optælling admin cannot post, so cannot undo it either')
  for (const reason of [undefined, '', '   ']) await assert.rejects(mona.undoPosted(MONA, id, { material: 'R162-0717', reason }), { code: 'UNPOST_REASON' })

  for (const status of ['creating', 'created', 'printed', 'counted', 'posted']) {
    await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, D1: { id: 'D1', docNo: '105000903', status, lines: [{ material: 'R162-0717' }] } } }))
    await assert.rejects(mona.undoPosted(MONA, id, { material: 'R162-0717', reason: 'Fejl' }), { code: 'UNPOST_PIDOC' }, `a ${status} SAP document holds the material`)
  }
  assert.equal((await ctx.repo.getApprovals('TCD', id))['R162-0717'].status, 'posted', 'nothing changed while refused')
  await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, D1: { ...all.D1, status: 'deleted' }, D2: { id: 'D2', docNo: '105000904', status: 'posted', lines: [{ material: 'INT4300-4921-0' }] } } }))

  const posted = (await ctx.repo.getApprovals('TCD', id))['R162-0717']
  const undone = await mona.undoPosted(MONA, id, { material: 'r162-0717', reason: '  Trykket ved en fejl  ' })
  const firstUndo = { by: { email: 'mona@example.test', name: 'Mona' }, at: ctx.clock.now, reason: 'Trykket ved en fejl', postedBy: posted.postedBy, postedAt: posted.postedAt }
  assert.deepEqual([undone.status, undone.frozen[0].diff, undone.by.name, undone.unposts], ['approved', -3, 'Mona', [firstUndo]], 'back to approved with the frozen numbers; the undo and who posted are logged')
  assert.deepEqual([undone.postedBy, undone.postedAt, undone.unpostedBy, undone.unpostedAt, undone.unpostReason], [undefined, undefined, undefined, undefined, undefined], 'only the log holds the undone post')
  assert.deepEqual((await ctx.repo.getApprovals('TCD', id))['R162-0717'], undone)

  // The log follows the material through reset, approval, a second undo and sending back.
  ctx.tick(1000)
  const reset = await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'reset' })
  assert.deepEqual([reset.status, reset.unposts], ['open', [firstUndo]], 'reset is allowed again and keeps the log')
  assert.deepEqual((await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })).unposts, [firstUndo])
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'posted' })
  ctx.tick(1000)
  const second = await mona.undoPosted(MONA, id, { material: 'R162-0717', reason: 'Igen forkert' })
  assert.deepEqual(second.unposts.map(entry => entry.reason), ['Trykket ved en fejl', 'Igen forkert'], 'a second undo is added, not overwriting the first')
  const returned = await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'returned', comment: 'Tæl igen' })
  assert.deepEqual(returned.unposts, second.unposts)
  assert.deepEqual((await ctx.repo.getApprovals('TCD', id))['R162-0717'].unposts, second.unposts)

  // A counter sending it to approval and "Godkend alle uden difference" keep the log too.
  await anna.saveLine(ANNA, id, { place: 'A1.2', material: 'R162-0717', qty: 3 })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  assert.deepEqual((await anna.submitMaterial(ANNA, id, { material: 'R162-0717' })).unposts, second.unposts)
  await mona.approveAllWithoutDifference(MONA, id)
  const cleanApproved = (await ctx.repo.getApprovals('TCD', id))['R162-0717']
  assert.deepEqual([cleanApproved.status, cleanApproved.comment, cleanApproved.unposts], ['approved', 'Ingen difference', second.unposts])
})

test('a material posted through an SAP document gets the posted message on reset and send back', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  // The document is posted in SAP; the approval may still say approved (marking it posted is a separate write).
  await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, D1: { id: 'D1', docNo: '105000903', status: 'posted', lines: [{ material: 'R162-0717' }] } } }))
  for (const status of ['reset', 'returned']) {
    await assert.rejects(mona.setApproval(MONA, id, { material: 'R162-0717', status, comment: 'Tæl igen' }), { code: 'COUNT_MATERIAL_POSTED', message: 'R162-0717 er bogført i SAP og kan ikke ændres. Lav en ny optælling, hvis der skal rettes mere.' }, status)
  }
  assert.equal((await ctx.repo.getApprovals('TCD', id))['R162-0717'].status, 'approved')
})

test('a "Bogført i SAP" made on another PC after this PC read the approvals still refuses a reset (checked under the lock)', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  // PC 2 has a cached read from before PC 1's post reached the drive.
  const repo = createCountRepository({ storeFor: ctx.storeFor, now: () => ctx.clock.now })
  const stale = await repo.getApprovals('TCD', id)
  const pc2 = createCountService({
    repo: { ...repo, getApprovals: async () => structuredClone(stale) },
    storeFor: ctx.storeFor, fetcher: ctx.fetcher, journalsDir: path.join(ctx.root, 'local-pc2'), deviceId: 'pc2',
    now: () => ctx.clock.now, newId: () => crypto.randomUUID(), journalOptions: { autoFlush: false },
  })
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'posted' })

  for (const status of ['reset', 'returned', 'approved']) {
    await assert.rejects(pc2.setApproval(MONA, id, { material: 'R162-0717', status, comment: 'Tæl igen' }), { code: 'COUNT_MATERIAL_POSTED' }, `${status} sees the post under the lock`)
  }
  const stored = (await ctx.repo.getApprovals('TCD', id))['R162-0717']
  assert.deepEqual([stored.status, stored.postedBy.name], ['posted', 'Mona'], 'the post is not overwritten')
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

test('a quantity line on a serial-managed material is refused; a material counted by quantity is still allowed', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const text = 'Materialet har serienumre. Scan eller importér dem, eller brug Fjern serienummer.'
  await assert.rejects(anna.saveLine(ANNA, id, { place: 'Reol 3', material: 'int4300-4921-0', qty: 2 }), error => error.code === 'LINE_SERIAL_MANAGED' && error.message === text)
  await assert.rejects(anna.saveLine(ANNA, id, { place: 'Reol 3', material: 'INT4300-4921-0', qty: 0 }), { code: 'LINE_SERIAL_MANAGED' })
  await anna.saveLine(ANNA, id, { place: 'Reol 3', material: 'R162-0717', qty: 2 })
  const state = await anna.getState(ANNA, id)
  assert.deepEqual(state.lines.map(line => `${line.material}:${line.qty}`), ['R162-0717:2'], 'a material counted by quantity is still allowed')
  assert.deepEqual(state.materialLocks.map(lock => lock.material), ['R162-0717'], 'a refused line does not take the material')
})

test('an old quantity line on a serial-managed material blocks its approval until the line is deleted', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.scan(ANNA, id, { serial: 'N1', place: 'Reol 3' })
  await anna.scan(ANNA, id, { serial: 'U1', place: 'Reol 3' })
  await anna.flush(ANNA, id)
  // Written by a client from before the rule: N2's label could not be read, so "1 stk." was typed instead.
  const old = { type: 'line', lineId: 'ln-old', place: 'Reol 3', area: '', material: 'INT4300-4921-0', sloc: 'D000', stockType: 'unrestricted', qty: 1, status: 'counted', comment: '', id: 'old-1', at: ctx.clock.now, by: BO.email, byName: 'Bo' }
  await ctx.storeFor('TCD').setAsync(`count-${id}-j-oldclient000-0000`, { writer: 'oldclient000', by: BO.email, full: false, events: [old] })
  ctx.tick(10_000)

  const state = await mona.getState(MONA, id)
  const row = state.rows.find(item => item.material === 'INT4300-4921-0' && item.stockType === 'unrestricted')
  assert.deepEqual([row.countedSerials, row.countedLines, row.diff], [1, 1, 0], 'the line is not dropped silently from the difference')
  const blocked = error => error.code === 'APPROVAL_SERIAL_LINES' && /INT4300-4921-0/.test(error.message)
  await assert.rejects(mona.setApproval(MONA, id, { material: 'INT4300-4921-0', status: 'approved' }), blocked)
  await assert.rejects(anna.submitMaterial(ANNA, id, { material: 'INT4300-4921-0' }), blocked)
  assert.deepEqual(await mona.approveAllWithoutDifference(MONA, id), { approved: 1 }, 'only INT4300-4921-0-R; the line keeps INT4300-4921-0 out')
  const approvals = await ctx.repo.getApprovals('TCD', id)
  assert.equal(approvals['INT4300-4921-0'], undefined)

  await anna.deleteLine(ANNA, id, { lineId: 'ln-old' })
  await anna.flush(ANNA, id)
  ctx.tick(10_000)
  const approved = await mona.setApproval(MONA, id, { material: 'INT4300-4921-0', status: 'approved' })
  assert.equal(approved.status, 'approved')
  assert.deepEqual(approved.frozen.map(item => [item.counted, item.diff, item.missingSerials]), [[1, -1, ['N2']]], 'after the deletion the serials decide')
})

test('a material approved with a quantity line (older client) gets no document quantity and cannot be posted until it is approved again', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const ADA = { email: 'ada@example.test', fullName: 'Ada', role: 'user', team: 'TCD', countAdmin: true }
  const ada = ctx.service('pc4')
  const { id } = await newCount(ctx, anna)
  const terminal = { material: 'INT4300-4921-0', sloc: 'D000', stockType: 'unrestricted' }
  await anna.scan(ANNA, id, { serial: 'N1', place: 'Reol 3' })
  await anna.flush(ANNA, id)
  // What 1.6.7 wrote: "1 stk." for the unreadable N2, approved as "Ingen difference" with N2 frozen as missing.
  const old = { type: 'line', lineId: 'ln-old', place: 'Reol 3', area: '', ...terminal, qty: 1, status: 'counted', comment: '', id: 'old-1', at: ctx.clock.now, by: BO.email, byName: 'Bo' }
  await ctx.storeFor('TCD').setAsync(`count-${id}-j-oldclient000-0000`, { writer: 'oldclient000', by: BO.email, full: false, events: [old] })
  await ctx.repo.setApproval('TCD', id, terminal.material, { status: 'approved', comment: 'Ingen difference', by: { email: MONA.email, name: 'Mona' }, at: ctx.clock.now + 1000, frozen: [{ sloc: 'D000', stockType: 'unrestricted', sapQty: 2, counted: 2, diff: 0, valueDiff: 0, missingSerials: ['N2'] }] })
  ctx.tick(10_000)

  assert.deepEqual((await mona.getState(MONA, id)).approvedWithSerialLines, [terminal.material])
  let doc = await mona.fetchDocStock(MONA, id)
  const rowOf = result => result.rows.find(item => item.material === terminal.material && item.sloc === 'D000')
  assert.deepEqual([rowOf(doc).docQty, rowOf(doc).serialLinesAtApproval, rowOf(doc).expectedQty], [null, true, 2], 'never the 1 serial for an approved 2')
  const refused = { code: 'APPROVED_WITH_SERIAL_LINES' }
  await assert.rejects(mona.copySerials(MONA, id, { ...terminal, forDoc: true }), refused)
  const entered = []
  const writer = {
    createDocument: async () => ({ docs: [{ docNo: '105000940', materials: [terminal.material] }], missing: [] }),
    enterSerials: async request => { entered.push(request); return { counted: request.serials.length, serials: request.serials.length, newSerials: 0 } },
    enterCounts: async request => { entered.push(request); return { message: 'ok' } },
  }
  const piDocsOf = counts => createPiDocService({ counts, repo: ctx.repo, roles: { roleOf: async user => (user.countAdmin ? 'admin' : user.role) }, writer, system: 'QS4', now: () => ctx.clock.now })
  await assert.rejects(piDocsOf(mona).create(MONA, id, { materials: [terminal.material], sloc: 'D000', stockType: 'unrestricted' }), refused)
  await assert.rejects(mona.setApproval(MONA, id, { material: terminal.material, status: 'posted' }), refused)
  // SAP posted a document for it anyway (made before this rule): marked as posted, and reported for the warning.
  const before = (await ctx.repo.getApprovals('TCD', id))[terminal.material]
  assert.deepEqual(await mona.markPosted(MONA, id, [terminal.material]), { posted: [terminal.material], skipped: [], serialLines: [terminal.material], already: [] })
  assert.equal((await ctx.repo.getApprovals('TCD', id))[terminal.material].status, 'posted')
  assert.deepEqual((await mona.getState(MONA, id)).approvedWithSerialLines, [terminal.material], 'still flagged once posted')
  await ctx.repo.setApproval('TCD', id, terminal.material, before)

  // A document made before this rule: "Læg antal på" enters nothing.
  await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, D1: { id: 'D1', docNo: '105000939', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', kind: 'new', transaction: 'ZMS_COUNT_SERIAL', createdBy: { email: MONA.email }, docFetchedAt: doc.fetchedAt, lines: [{ material: terminal.material, transaction: 'ZMS_COUNT_SERIAL' }] } } }))
  await assert.rejects(piDocsOf(ada).count(ADA, id, 'D1'), refused)
  assert.deepEqual(entered, [])
  // "Nulstil" while the document holds it tells the whole way out, not only "slet det først".
  await assert.rejects(mona.setApproval(MONA, id, { material: terminal.material, status: 'reset' }), { code: 'PIDOC_ACTIVE', message: `${terminal.material} er godkendt med tællelinjer med antal og har SAP-dokument 105000939. Slet SAP-dokumentet, nulstil materialet, slet linjen og godkend igen.` })
  await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, D1: { ...all.D1, status: 'deleted' } } }))

  // Deleting the line does not hide it: the frozen numbers still hold it.
  await anna.deleteLine(ANNA, id, { lineId: 'ln-old' })
  await anna.flush(ANNA, id)
  ctx.tick(10_000)
  assert.deepEqual((await mona.getState(MONA, id)).approvedWithSerialLines, [terminal.material])
  await mona.setApproval(MONA, id, { material: terminal.material, status: 'reset' })
  ctx.tick(10_000)
  assert.deepEqual((await mona.getState(MONA, id)).approvedWithSerialLines, [])
  const again = await mona.setApproval(MONA, id, { material: terminal.material, status: 'approved' })
  assert.deepEqual(again.frozen.map(item => [item.counted, item.diff, item.missingSerials]), [[1, -1, ['N2']]])
  doc = await mona.countDoc(MONA, id)
  assert.deepEqual([rowOf(doc).docQty, rowOf(doc).serialLinesAtApproval, rowOf(doc).expectedQty], [1, false, 1])
  assert.deepEqual((await mona.copySerials(MONA, id, { ...terminal, forDoc: true })).serials, ['N1'])
  await piDocsOf(mona).create(MONA, id, { materials: [terminal.material], sloc: 'D000', stockType: 'unrestricted' })
  assert.equal((await mona.setApproval(MONA, id, { material: terminal.material, status: 'posted' })).status, 'posted')
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

test('"Læg antal på" two days later needs the SAP figures of the day again, and enters SAP today + the approved difference', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const ADA = { email: 'ada@example.test', fullName: 'Ada', role: 'user', team: 'TCD', countAdmin: true }
  const ada = ctx.service('pc4')
  const { id } = await newCount(ctx, anna)
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  const entered = []
  const writer = {
    createDocument: async () => ({ docs: [{ docNo: '105000930', materials: ['R162-0717'] }], missing: [] }),
    printDocument: async () => ({ message: 'ok' }),
    enterCounts: async request => { entered.push(request); return { message: 'ok' } },
  }
  const piDocsOf = counts => createPiDocService({ counts, repo: ctx.repo, roles: { roleOf: async user => (user.countAdmin ? 'admin' : user.role) }, writer, system: 'QS4', now: () => ctx.clock.now })

  // Monday: SAP 100, approved difference -3, the document is made and printed.
  await mona.fetchDocStock(MONA, id)
  await piDocsOf(mona).create(MONA, id, { materials: ['R162-0717'], sloc: 'D000', stockType: 'unrestricted' })
  await piDocsOf(mona).print(MONA, id, '105000930')
  // 20 pcs are issued in SAP; Wednesday the admin enters the count.
  ctx.sap.mb52[2] = stock('R162-0717', 'D000', 80, 0, 400)
  ctx.tick(2 * 86_400_000)
  await assert.rejects(piDocsOf(ada).count(ADA, id, '105000930'), { code: 'PIDOC_DOC_STALE' })
  assert.deepEqual(entered, [], 'not 97 into MI04')
  await ada.fetchDocStock(ADA, id)
  await piDocsOf(ada).count(ADA, id, '105000930')
  assert.deepEqual(entered, [{ docNo: '105000930', year: String(new Date(1_000_000).getFullYear()), entries: [{ material: 'R162-0717', qty: 77 }] }], 'SAP today 80 + difference -3')
})

test('"Hent dagens SAP-tal" refuses figures without a line for an approved material that had SAP stock at approval, unless exactly those were confirmed', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  const row = doc => doc.rows.find(item => item.material === 'R162-0717')

  // SAP of the day lists neither the approved R162-0717 (SAP 100 at approval) nor the not yet approved terminals.
  ctx.sap.mb52 = [stock('INT4300-4921-0-R', 'D000', 1)]
  ctx.tick(60_000)
  const exportedAt = ctx.clock.now
  const exports = ctx.fetcher.calls
  await assert.rejects(mona.fetchDocStock(MONA, id), error => error.code === 'DOC_STOCK_MISSING' && /: R162-0717 D000$/.test(error.message))
  assert.equal((await mona.countDoc(MONA, id)).fetchedAt, null, 'nothing is saved')
  for (const confirmMissing of [true, 'R162-0717 D000', ['R162-0717 D003']]) {
    await assert.rejects(mona.fetchDocStock(MONA, id, { confirmMissing }), { code: 'DOC_STOCK_MISSING' }, 'only a list holding what is missing confirms')
  }

  // Confirming saves the lines of the refused export (kept in main): SAP is not exported a second time.
  const beforeAgain = ctx.fetcher.calls
  await assert.rejects(mona.fetchDocStock(MONA, id), { code: 'DOC_STOCK_MISSING' })
  assert.equal(ctx.fetcher.calls, beforeAgain + 1, '"Hent dagens SAP-tal" again (nothing confirmed) exports anew')
  const callsBefore = ctx.fetcher.calls
  ctx.tick(5000)
  const doc = await mona.fetchDocStock(MONA, id, { confirmMissing: ['R162-0717 D000'] })
  assert.equal(ctx.fetcher.calls, callsBefore, 'no second SAP export')
  assert.ok(callsBefore > exports)
  assert.deepEqual([doc.fetchedAt, row(doc).sapToday, row(doc).docQty], [exportedAt, 0, -3])
  assert.deepEqual(doc.confirmedMissing, { fetchedAt: exportedAt, materials: ['R162-0717 D000'] }, 'kept with the figures, so "Læg antal på" does not ask again')

  // The next fetch also misses INT4300-4921-0-R in MB52 (approved meanwhile; IQ09 still lists U1, which is SAP i dag 0
  // all the same): confirming only what was shown before is not enough.
  await mona.setApproval(MONA, id, { material: 'INT4300-4921-0-R', status: 'approved' })
  ctx.sap.mb52 = [stock('INT4300-4921-0', 'D000', 2, 0, 2000)]
  ctx.tick(60_000)
  await assert.rejects(mona.fetchDocStock(MONA, id, { confirmMissing: ['R162-0717 D000'] }), error => error.code === 'DOC_STOCK_MISSING' && /: INT4300-4921-0-R D000, R162-0717 D000$/.test(error.message))
  assert.equal((await mona.countDoc(MONA, id)).fetchedAt, doc.fetchedAt, 'nothing is saved')
  // Newer figures were saved meanwhile (another PC): the kept, older export never replaces them; SAP is exported anew.
  ctx.tick(1000)
  await ctx.repo.setCountDoc('TCD', id, { ...(await ctx.repo.getCountDoc('TCD', id)), fetchedAt: ctx.clock.now })
  const beforeNewer = ctx.fetcher.calls
  assert.equal((await mona.fetchDocStock(MONA, id, { confirmMissing: ['R162-0717 D000', 'INT4300-4921-0-R D000'] })).fetchedAt, ctx.clock.now)
  assert.equal(ctx.fetcher.calls, beforeNewer + 1)

  // A material with no SAP stock at approval may be missing today.
  await ctx.repo.setApproval('TCD', id, 'R162-0717', { ...(await ctx.repo.getApprovals('TCD', id))['R162-0717'], frozen: [{ sloc: 'D000', stockType: 'unrestricted', sapQty: 0, counted: 0, diff: 0, valueDiff: 0 }] })
  ctx.sap.mb52 = [stock('INT4300-4921-0-R', 'D000', 1)]
  ctx.tick(60_000)
  const plain = await mona.fetchDocStock(MONA, id)
  assert.deepEqual([plain.fetchedAt, plain.confirmedMissing], [ctx.clock.now, undefined], 'nothing confirmed for these figures')
})

test('the SAP figures of the day can be fetched after the status is locked; nothing else in the count changes', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  await ctx.repo.updateStatus('TCD', 'st0open1', { state: 'locked', lockedAt: 2, lockedBy: { email: 'mona@example.test', name: 'Mona' } }, { action: 'locked', by: { email: 'mona@example.test', name: 'Mona' } })
  ctx.tick(5000)
  assert.equal((await mona.countDoc(MONA, id)).canFetch, true)
  const doc = await mona.fetchDocStock(MONA, id)
  assert.deepEqual([doc.fetchedAt, doc.rows.find(item => item.material === 'R162-0717').docQty], [ctx.clock.now, 97])
  await assert.rejects(mona.setApproval(MONA, id, { material: 'R162-0717', status: 'reset' }), { code: 'STATUS_LOCKED' })
  await assert.rejects(ctx.service('pc2').fetchDocStock(BO, id), { code: 'COUNT_OWNER_ONLY' })
})

test('after the status is locked the SAP documents are still made, counted, posted and deleted, and posting marks "Bogført i SAP"', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const ADA = { email: 'ada@example.test', fullName: 'Ada', role: 'user', team: 'TCD', countAdmin: true }
  const ada = ctx.service('pc4')
  const { id } = await newCount(ctx, anna)
  await anna.saveLine(ANNA, id, { place: 'A1.1', material: 'R162-0717', qty: 97 })
  await anna.scan(ANNA, id, { serial: 'U1', place: 'A1.1' })
  await anna.flush(ANNA, id)
  ctx.tick(2000)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  await mona.setApproval(MONA, id, { material: 'INT4300-4921-0-R', status: 'approved' })
  await ctx.repo.updateStatus('TCD', 'st0open1', { state: 'locked', lockedAt: 2, lockedBy: { email: 'mona@example.test', name: 'Mona' } }, { action: 'locked', by: { email: 'mona@example.test', name: 'Mona' } })
  ctx.tick(5000)
  // Another PC looks at the archive: read once while nothing changes, read again after the posting.
  const viewer = ctx.service('pc5', { ownStore: true })
  const before = await viewer.statusArchive(MONA, 'st0open1')
  assert.equal(before.lines.find(line => line.material === 'R162-0717').approval.status, 'approved')
  assert.equal(await viewer.statusArchive(MONA, 'st0open1'), before, 'cached while nothing changes')

  const sap = []
  const writer = {
    createDocument: async ({ materials }) => { sap.push('create'); return { docs: [{ docNo: materials[0] === 'R162-0717' ? '105000950' : '105000951', materials }], missing: [] } },
    printDocument: async () => { sap.push('print'); return { message: 'ok' } },
    enterCounts: async () => { sap.push('count'); return { message: 'ok' } },
    postDocuments: async ({ docNos }) => { sap.push('post'); return { posted: docNos, open: [], materialDocs: { 105000950: '4905204900' }, differences: [{ docNo: '105000950', material: 'R162-0717', book: 100, counted: 97, diff: -3, amount: 15 }] } },
    deleteDocument: async () => { sap.push('delete'); return { deleted: true, message: 'deleted' } },
  }
  const piDocsOf = counts => createPiDocService({ counts, repo: ctx.repo, roles: { roleOf: async user => (user.countAdmin ? 'admin' : user.role) }, writer, system: 'QS4', now: () => ctx.clock.now })
  await mona.fetchDocStock(MONA, id)
  await piDocsOf(mona).create(MONA, id, { materials: ['R162-0717'], sloc: 'D000', stockType: 'unrestricted' })
  await piDocsOf(mona).print(MONA, id, '105000950')
  await piDocsOf(ada).count(ADA, id, '105000950')
  const posted = await piDocsOf(mona).post(MONA, id, ['105000950'])
  assert.deepEqual([posted.posted, posted.marked], [['105000950'], { posted: ['R162-0717'], skipped: [] }])
  assert.equal((await ctx.repo.getApprovals('TCD', id))['R162-0717'].status, 'posted', 'marked although the status is locked')
  assert.equal((await viewer.statusArchive(MONA, 'st0open1')).lines.find(line => line.material === 'R162-0717').approval.status, 'posted', 'the archive on another PC shows the posting')

  // The same material on a second document (blocked stock): already "Bogført i SAP", never reported as not approved.
  await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, 105000952: { id: '105000952', docNo: '105000952', year: '1970', status: 'counted', sloc: 'D000', stockType: 'blocked', kind: 'accessory', transaction: 'MI04', createdBy: { email: 'mona@example.test' }, lines: [{ material: 'R162-0717', transaction: 'MI04' }] } } }))
  const second = await piDocsOf(mona).post(MONA, id, ['105000952'])
  assert.deepEqual([second.posted, second.marked], [['105000952'], { posted: ['R162-0717'], skipped: [] }])

  await piDocsOf(mona).create(MONA, id, { materials: ['INT4300-4921-0-R'], sloc: 'D000', stockType: 'unrestricted' })
  await piDocsOf(mona).remove(MONA, id, '105000951')
  assert.deepEqual(sap, ['create', 'print', 'count', 'post', 'post', 'create', 'delete'])

  const locked = { code: 'STATUS_LOCKED' }
  await assert.rejects(anna.scan(ANNA, id, { serial: 'N1', place: 'A1.1' }), locked)
  await assert.rejects(mona.setApproval(MONA, id, { material: 'INT4300-4921-0-R', status: 'reset' }), locked)
  await assert.rejects(mona.setApproval(MONA, id, { material: 'INT4300-4921-0-R', status: 'returned' }), locked)
  await assert.rejects(mona.undoPosted(MONA, id, { material: 'R162-0717', reason: 'Fejl' }), locked)
  await assert.rejects(mona.approveAllWithoutDifference(MONA, id), locked)
})

test('a count with an SAP document not posted yet cannot be deleted; posted ones are kept in the delete mark', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  const doc = (docId, status, extra = {}) => ({ id: docId, docNo: docId, year: '2026', status, sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R162-0717' }], ...extra })
  const setDocs = docs => ctx.repo.changePiDocs('TCD', id, () => ({ all: Object.fromEntries(docs.map(item => [item.id, item])) }))
  for (const status of ['created', 'printed', 'counted']) {
    await setDocs([doc('105000960', status)])
    await assert.rejects(anna.deleteCount(ANNA, id), error => error.code === 'COUNT_PIDOCS_ACTIVE' && error.message === 'Slet SAP-dokumenterne først. Disse SAP-dokumenter er ikke bogført: 105000960')
  }
  await setDocs([{ id: 'CPREF1', reference: 'CPREF1', status: 'creating', startedAt: ctx.clock.now, sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R162-0717' }] }])
  await assert.rejects(mona.deleteCount(MONA, id), error => error.code === 'COUNT_PIDOCS_ACTIVE' && /under oprettelse$/.test(error.message))
  assert.equal((await ctx.repo.listCounts('TCD')).length, 1, 'nothing deleted')

  // A reservation left by a crash (older than 20 minutes) and a deleted document do not stop it.
  ctx.tick(20 * 60 * 1000 + 1)
  await setDocs([{ id: 'CPREF1', reference: 'CPREF1', status: 'creating', startedAt: 0, lines: [] }, doc('105000961', 'deleted'), doc('105000962', 'posted', { materialDoc: '4905204901' }), doc('105000963', 'posted')])
  assert.deepEqual(await anna.deleteCount(ANNA, id), { ok: true })
  const entry = (await ctx.storeFor('TCD').getAsync('counts-index'))[id]
  assert.deepEqual([entry.deleted, entry.deletedDocs], [true, [{ docNo: '105000962', year: '2026', materialDoc: '4905204901' }, { docNo: '105000963', year: '2026', materialDoc: null }]])
})

test('the delete makes sure the SAP document file exists before reading it, so a "not found" cached by Windows is never read twice', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const seen = []
  const file = `count-${id}-sap-dokumenter`
  const repo = { ...ctx.repo, getPiDocs: async (...args) => { seen.push(Boolean(await ctx.storeFor('TCD').statAsync(file))); return ctx.repo.getPiDocs(...args) } }
  const svc = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, placementSource: null, journalsDir: path.join(ctx.root, 'local-exists'), deviceId: 'exists', now: () => ctx.clock.now, newId: () => 'unused', journalOptions: { autoFlush: false } })
  assert.equal(await ctx.storeFor('TCD').statAsync(file), undefined, 'a count without SAP documents has no file')
  assert.deepEqual(await svc.deleteCount(ANNA, id), { ok: true })
  assert.deepEqual(seen, [true, true], 'the first read and the second read after the tombstone')

  // An existing file is left as it is.
  const second = await newCount(ctx, anna)
  await ctx.repo.changePiDocs('TCD', second.id, () => ({ all: { D2: { id: 'D2', docNo: '105000991', status: 'printed', lines: [] } } }))
  await assert.rejects(svc.deleteCount(ANNA, second.id), { code: 'COUNT_PIDOCS_ACTIVE' })
  assert.equal((await ctx.repo.getPiDocs('TCD', second.id, { fresh: true })).D2.status, 'printed', 'not overwritten')
})

test('a delete and a document reserved at the same moment both refuse, and no reservation is left', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  const created = []
  let checked
  const tombstoneSeen = new Promise(resolve => { checked = resolve })
  let release
  const gate = new Promise(resolve => { release = resolve })
  // The other PC: reserves, then reads the tombstone, and goes on only after the delete has been undone.
  const piRepo = { ...ctx.repo, isDeleted: async (...args) => { const deleted = await ctx.repo.isDeleted(...args); checked(); await gate; return deleted } }
  const piDocs = createPiDocService({ counts: mona, repo: piRepo, roles: { roleOf: async user => user.role }, writer: { createDocument: async request => { created.push(request); return { docs: [], missing: [] } } }, system: 'QS4', now: () => ctx.clock.now })
  let creating
  // This PC: the create starts right after the tombstone, so the delete's second read finds the reservation.
  const repo = { ...ctx.repo, markDeleted: async (...args) => { const result = await ctx.repo.markDeleted(...args); creating = piDocs.create(MONA, id, { materials: ['R162-0717'], sloc: 'D000', stockType: 'unrestricted' }); await tombstoneSeen; return result } }
  const svc = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, placementSource: null, journalsDir: path.join(ctx.root, 'local-both'), deviceId: 'both', now: () => ctx.clock.now, newId: () => 'unused', journalOptions: { autoFlush: false } })
  await assert.rejects(svc.deleteCount(ANNA, id), { code: 'COUNT_PIDOCS_ACTIVE' })
  assert.equal(await ctx.repo.isDeleted('TCD', id, { fresh: true }), false, 'the delete is undone')
  release()
  await assert.rejects(creating, { code: 'COUNT_DELETED' })
  assert.deepEqual([created, await ctx.repo.getPiDocs('TCD', id, { fresh: true })], [[], {}], 'SAP is never asked, and the reservation is taken back')
})

test('when the undone delete cannot be written back, the count id is logged and the refusal still stands', async t => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const repo = {
    ...ctx.repo,
    markDeleted: async (...args) => { const result = await ctx.repo.markDeleted(...args); await ctx.repo.changePiDocs('TCD', id, all => ({ all: { ...all, CPRACE2: { id: 'CPRACE2', reference: 'CPRACE2', status: 'creating', startedAt: ctx.clock.now, lines: [] } } })); return result },
    restoreDeleted: async () => { throw Object.assign(new Error('x'), { code: 'KV_LOCK_BUSY' }) },
  }
  const svc = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, placementSource: null, journalsDir: path.join(ctx.root, 'local-log'), deviceId: 'log', now: () => ctx.clock.now, newId: () => 'unused', journalOptions: { autoFlush: false } })
  const logged = t.mock.method(console, 'error', () => {})
  await assert.rejects(svc.deleteCount(ANNA, id), { code: 'COUNT_PIDOCS_ACTIVE' })
  assert.ok(logged.mock.calls.some(call => call.arguments.join(' ').includes('tombstoned but not removed') && call.arguments.includes(id)))
  assert.equal((await ctx.repo.getMeta('TCD', id)).id, id, 'nothing is removed')
})

test('a document reserved on another PC while the count is being deleted stops the delete, and the count comes back whole', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const reservation = { id: 'CPRACE1', reference: 'CPRACE1', status: 'creating', sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R162-0717' }] }
  // Right after the tombstone is written, a manager on another PC reserves a document (read before the tombstone).
  const repo = { ...ctx.repo, markDeleted: async (...args) => { const result = await ctx.repo.markDeleted(...args); await ctx.repo.changePiDocs('TCD', args[1][0], all => ({ all: { ...all, CPRACE1: { ...reservation, startedAt: ctx.clock.now } } })); return result } }
  const svc = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, placementSource: null, journalsDir: path.join(ctx.root, 'local-race'), deviceId: 'race', now: () => ctx.clock.now, newId: () => 'unused', journalOptions: { autoFlush: false } })
  const entry = (await ctx.storeFor('TCD').getAsync('counts-index'))[id]
  const refused = error => error.code === 'COUNT_PIDOCS_ACTIVE' && /under oprettelse$/.test(error.message)
  await assert.rejects(svc.deleteCount(ANNA, id), refused)
  assert.deepEqual((await ctx.storeFor('TCD').getAsync('counts-index', { skipCache: true }))[id], entry, 'the index entry is back as it was')
  assert.equal((await ctx.repo.getMeta('TCD', id)).id, id, 'the files are kept')
  assert.equal(await ctx.repo.isDeleted('TCD', id, { fresh: true }), false)

  await ctx.repo.changePiDocs('TCD', id, () => ({ all: {} }))
  await assert.rejects(svc.deleteStatus(MONA, 'st0open1'), refused)
  assert.equal((await ctx.repo.getStatus('TCD', 'st0open1')).state, 'open', 'the status is kept')
  assert.deepEqual((await ctx.repo.listCounts('TCD')).map(item => item.id), [id])
})

test('deleting a status is refused while one of its counts has an SAP document not posted yet; posted ones are kept per count', async () => {
  const ctx = setup()
  ctx.sap.mb52[0] = stock('INT4300-4921-0', 'D000', 2, 1, 2000, 1000)
  ctx.sap.serials.push(serial('B1', 'INT4300-4921-0', 'D000', 'blocked'))
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const create = async scope => anna.createCount(ANNA, { token: (await anna.preview(ANNA, { scope })).token, name: `D000 ${scope.stockTypes[0]}` })
  const first = await create({ type: 'slocs', slocs: ['D000'], stockTypes: ['unrestricted'] })
  const second = await create({ type: 'slocs', slocs: ['D000'], stockTypes: ['blocked'] })
  const doc = (docId, status) => ({ id: docId, docNo: docId, year: '2026', status, sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R162-0717' }], ...(status === 'posted' ? { materialDoc: `49${docId}` } : {}) })
  await ctx.repo.changePiDocs('TCD', first.id, () => ({ all: { 105000970: doc('105000970', 'posted') } }))
  await ctx.repo.changePiDocs('TCD', second.id, () => ({ all: { 105000971: doc('105000971', 'printed') } }))
  await ctx.repo.updateStatus('TCD', 'st0open1', { state: 'locked', lockedAt: 2 }, { action: 'locked', by: { email: 'mona@example.test', name: 'Mona' } })
  await assert.rejects(mona.deleteStatus(MONA, 'st0open1'), error => error.code === 'COUNT_PIDOCS_ACTIVE' && error.message === 'Slet SAP-dokumenterne først. Disse SAP-dokumenter er ikke bogført: 105000971 (D000 blocked)')
  assert.equal((await ctx.repo.listCounts('TCD')).length, 2, 'nothing deleted')
  assert.equal((await ctx.repo.getStatus('TCD', 'st0open1')).state, 'locked')

  await ctx.repo.changePiDocs('TCD', second.id, () => ({ all: { 105000971: doc('105000971', 'posted') } }))
  assert.deepEqual(await mona.deleteStatus(MONA, 'st0open1'), { ok: true, counts: 2 })
  const index = await ctx.storeFor('TCD').getAsync('counts-index')
  assert.deepEqual([index[first.id].deletedDocs, index[second.id].deletedDocs], [[{ docNo: '105000970', year: '2026', materialDoc: '49105000970' }], [{ docNo: '105000971', year: '2026', materialDoc: '49105000971' }]])
})

test('the report data has the SAP documents of the count', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  assert.deepEqual((await anna.reportData(ANNA, id)).piDocs, [])
  const posted = { id: '105000980', docNo: '105000980', year: '2026', status: 'posted', sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R162-0717' }], materialDoc: '4905204902', differences: [{ material: 'R162-0717', book: 100, counted: 97, diff: -3, amount: 15 }] }
  await ctx.repo.changePiDocs('TCD', id, () => ({ all: { [posted.id]: posted } }))
  assert.deepEqual((await anna.reportData(ANNA, id)).piDocs, [posted])
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
  ctx.tick(1000)
  const byAdmin = await ada.previewRefetch(ADA, id)
  await assert.rejects(anna.applyRefetch(ANNA, id, { token: byAdmin.token }), { code: 'PREVIEW_EXPIRED' }, 'only the one who fetched applies it')
  assert.equal((await ada.applyRefetch(ADA, id, { token: byAdmin.token })).snapshotVersion, 3, 'an Optælling admin may fetch SAP again')
})

test('"Hent SAP igen" is refused when someone else fetched SAP again after the preview, so older figures never replace newer ones', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  const same = await anna.previewRefetch(ANNA, id)
  await assert.rejects(anna.applyRefetch(ANNA, id, { token: same.token }), { code: 'REFETCH_OUTDATED' }, 'figures that are not newer than the stored ones')

  ctx.tick(1000)
  const older = await anna.previewRefetch(ANNA, id)
  ctx.sap.mb52 = [stock('INT4300-4921-0', 'D000', 3, 0, 3000), stock('R162-0717', 'D000', 100, 0, 500)]
  ctx.tick(1000)
  const newer = await mona.previewRefetch(MONA, id)
  const applied = await mona.applyRefetch(MONA, id, { token: newer.token })
  await assert.rejects(anna.applyRefetch(ANNA, id, { token: older.token }), error => error.code === 'REFETCH_OUTDATED' && error.message === 'En anden har hentet SAP igen imens. Hent igen for at se forskellene.')
  const meta = await ctx.repo.getMeta('TCD', id)
  assert.deepEqual([meta.fetchedAt, meta.snapshotVersion], [applied.fetchedAt, 2])
  assert.equal((await ctx.repo.getSnapshot('TCD', id)).fetchedAt, applied.fetchedAt, 'the newer SAP figures stay')
  assert.equal((await ctx.repo.listCounts('TCD'))[0].fetchedAt, applied.fetchedAt, 'the count list too')
  await assert.rejects(anna.applyRefetch(ANNA, id, { token: older.token }), { code: 'PREVIEW_EXPIRED' }, 'the outdated preview is gone')

  ctx.tick(1000)
  const again = await anna.previewRefetch(ANNA, id)
  assert.equal((await anna.applyRefetch(ANNA, id, { token: again.token })).snapshotVersion, 3, 'a new preview compares with the newer figures and applies')
})

test('"Hent SAP igen" is refused on a count closed after the preview', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  ctx.tick(1000)
  const preview = await anna.previewRefetch(ANNA, id)
  await ctx.service('pc5').closeCount(ANNA, id)
  await assert.rejects(anna.applyRefetch(ANNA, id, { token: preview.token }), { code: 'COUNT_CLOSED' })
  const meta = await ctx.repo.getMeta('TCD', id)
  assert.deepEqual([meta.status, meta.snapshotVersion], ['closed', 1])
  assert.equal((await ctx.repo.getSnapshot('TCD', id)).fetchedAt, meta.fetchedAt, 'the snapshot is untouched')

  await ctx.service('pc5').reopenCount(ANNA, id)
  assert.equal((await anna.applyRefetch(ANNA, id, { token: preview.token })).snapshotVersion, 2, 'reopened, the same preview applies')
})

test('"Hent SAP igen" that stopped after the meta was written can be tried again with the same preview', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const real = createCountRepository({ storeFor: ctx.storeFor, now: () => ctx.clock.now })
  let fail = true
  const repo = { ...real, replaceSnapshot: async (...args) => { if (fail) { fail = false; throw Object.assign(new Error('KV_LOCK_BUSY'), { code: 'KV_LOCK_BUSY' }) } return real.replaceSnapshot(...args) } }
  const svc = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, journalsDir: path.join(ctx.root, 'local-retry'), deviceId: 'retry', now: () => ctx.clock.now, journalOptions: { autoFlush: false } })
  ctx.sap.mb52 = [stock('INT4300-4921-0', 'D000', 3, 0, 3000), stock('R162-0717', 'D000', 100, 0, 500)]
  ctx.tick(1000)
  const preview = await svc.previewRefetch(ANNA, id)
  await assert.rejects(svc.applyRefetch(ANNA, id, { token: preview.token }), { code: 'KV_LOCK_BUSY' })
  const meta = await svc.applyRefetch(ANNA, id, { token: preview.token })
  assert.deepEqual([meta.fetchedAt, meta.snapshotVersion], [ctx.clock.now, 2], 'counted once')
  assert.equal((await ctx.repo.getSnapshot('TCD', id)).fetchedAt, ctx.clock.now)
})

test('"Hent SAP igen" goes on when only the count list could not be updated after the meta', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const real = ctx.storeFor('TCD')
  let failIndex = false
  const wrapped = { ...real, mutateAsync: async (key, change) => { if (failIndex && key === 'counts-index') { failIndex = false; throw Object.assign(new Error('KV_LOCK_BUSY'), { code: 'KV_LOCK_BUSY' }) } return real.mutateAsync(key, change) } }
  const repo = createCountRepository({ storeFor: () => wrapped, now: () => ctx.clock.now })
  const svc = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, journalsDir: path.join(ctx.root, 'local-index'), deviceId: 'index', now: () => ctx.clock.now, journalOptions: { autoFlush: false } })
  ctx.tick(1000)
  const preview = await svc.previewRefetch(ANNA, id)
  failIndex = true
  const meta = await svc.applyRefetch(ANNA, id, { token: preview.token })
  assert.equal(failIndex, false, 'the index write was tried and failed')
  const [stored, snapshot] = [await ctx.repo.getMeta('TCD', id), await ctx.repo.getSnapshot('TCD', id)]
  assert.deepEqual([meta.fetchedAt, stored.fetchedAt, snapshot.fetchedAt, stored.snapshotVersion], [ctx.clock.now, ctx.clock.now, ctx.clock.now, 2])
})

test('after "Hent SAP igen" on one PC, another PC with the count open shows the new SAP figures without a restart', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  const sapQty = state => state.rows.find(row => row.material === 'INT4300-4921-0').sapQty
  const before = await mona.getState(MONA, id)
  assert.deepEqual([before.serials.expected, sapQty(before)], [3, 2])

  ctx.sap.mb52 = [stock('INT4300-4921-0', 'D000', 3, 0, 3000), stock('R162-0717', 'D000', 100, 0, 500)]
  ctx.sap.serials = [serial('N1', 'INT4300-4921-0', 'D000'), serial('N2', 'INT4300-4921-0', 'D000'), serial('N9', 'INT4300-4921-0', 'D000')]
  ctx.tick(1000)
  const preview = await anna.previewRefetch(ANNA, id)
  const meta = await anna.applyRefetch(ANNA, id, { token: preview.token })

  ctx.tick(5000)
  const after = await mona.getState(MONA, id)
  assert.equal(after.meta.fetchedAt, meta.fetchedAt)
  assert.deepEqual([after.serials.expected, sapQty(after)], [3, 3], 'the same SAP figures as on the PC that fetched')
  assert.equal(after.rows.some(row => row.material === 'INT4300-4921-0-R'), false, 'a material gone from SAP is gone here too')
  const opened = await mona.openCount(MONA, id)
  assert.equal(opened.materials.find(item => item.material === 'INT4300-4921-0').unrestricted, 3, 'the materials of the screen follow too')
  assert.deepEqual((await mona.materialSerials(MONA, id, { material: 'INT4300-4921-0' })).missing.map(item => item.serial).sort(), ['N1', 'N2', 'N9'])
})

test('a half-written refetch (new meta, old snapshot) is picked up once the snapshot is there', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await mona.getState(MONA, id)
  const snapshot = await ctx.repo.getSnapshot('TCD', id)
  await ctx.repo.updateMeta('TCD', id, { fetchedAt: snapshot.fetchedAt + 1000, snapshotVersion: 2 })
  ctx.tick(5000)
  assert.equal((await mona.getState(MONA, id)).serials.expected, 3, 'the old snapshot is kept while the new one is not there yet')
  ctx.tick(5000)
  await mona.getState(MONA, id)
  await ctx.repo.replaceSnapshot('TCD', id, { ...snapshot, fetchedAt: snapshot.fetchedAt + 1000, stock: snapshot.stock.map(line => (snapshot.materials[line.m].material === 'INT4300-4921-0' ? { ...line, unrestricted: 1 } : line)) })
  ctx.tick(31_000)
  const state = await mona.getState(MONA, id)
  assert.equal(state.rows.find(row => row.material === 'INT4300-4921-0').sapQty, 1)
})

test('notifications for the Hub: join requests to those who decide, submissions to managers, the answers to the one who asked', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const mona = ctx.service('pc3')
  const ADA = { email: 'ada@example.test', fullName: 'Ada', role: 'user', team: 'TCD', countAdmin: true }
  const CARL = { email: 'carl@example.test', fullName: 'Carl', role: 'user', team: 'TCD' }
  const ada = ctx.service('pc4')
  const { id } = await newCount(ctx, anna)
  const types = async (svc, user) => (await svc.notifications(user)).map(item => item.type).sort()

  await bo.requestJoin(BO, id)
  const [request] = await anna.notifications(ANNA)
  assert.deepEqual(request, { type: 'join-request', countId: id, countName: 'Status D000', email: 'bo@example.test', name: 'Bo', at: ctx.clock.now })
  assert.deepEqual([await types(ada, ADA), await types(mona, MONA)], [['join-request'], ['join-request']], 'admins and managers decide too')
  assert.deepEqual([await types(bo, BO), await types(ctx.service('pc5'), CARL), await types(ctx.service('pc6'), TRINE)], [[], [], []])

  ctx.tick(20_000)
  await mona.decideMember(MONA, id, { email: BO.email, approve: true })
  ctx.tick(20_000)
  assert.deepEqual([await types(anna, ANNA), await types(ada, ADA)], [[], []], 'answered by one: gone for everyone')
  const [decided] = await bo.notifications(BO)
  assert.deepEqual([decided.type, decided.approved, decided.name, decided.countId], ['join-decided', true, 'Mona', id])

  await bo.saveLine(BO, id, { place: 'A1.1', material: 'R162-0717', qty: 100 })
  await bo.submitMaterial(BO, id, { material: 'R162-0717' })
  ctx.tick(20_000)
  const submitted = (await mona.notifications(MONA)).find(item => item.type === 'submitted')
  assert.deepEqual([submitted.material, submitted.name, submitted.diff], ['R162-0717', 'Bo', 0])
  assert.deepEqual([await types(ada, ADA), await types(anna, ANNA)], [[], []], 'only managers approve materials')

  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'returned', comment: 'Tæl reol 3 igen' })
  ctx.tick(20_000)
  assert.deepEqual(await types(mona, MONA), [])
  const returned = (await bo.notifications(BO)).find(item => item.type === 'returned')
  assert.deepEqual([returned.material, returned.name, returned.comment], ['R162-0717', 'Mona', 'Tæl reol 3 igen'])

  ctx.tick(15 * 24 * 3600 * 1000)
  assert.deepEqual(await types(bo, BO), [], 'answers are shown for 14 days')
  await bo.requestJoin(CARL, id)
  await anna.closeCount(ANNA, id)
  ctx.tick(20_000)
  assert.deepEqual(await types(anna, ANNA), [], 'a closed count asks nothing')
})

test('a slow read of the snapshot never puts the old SAP figures back over this PC\'s own "Hent SAP igen"', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const real = createCountRepository({ storeFor: ctx.storeFor, now: () => ctx.clock.now })
  let gate = null
  let reached = null
  let writeGate = null
  let writing = null
  const repo = {
    ...real,
    getSnapshot: async (team, countId, options) => {
      const value = await real.getSnapshot(team, countId, options)
      if (options?.fresh && gate) { reached(); await gate }
      return value
    },
    replaceSnapshot: async (...args) => {
      if (writeGate) { writing(); await writeGate }
      return real.replaceSnapshot(...args)
    },
  }
  const mona = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, journalsDir: path.join(ctx.root, 'local-slow'), deviceId: 'slow', now: () => ctx.clock.now, journalOptions: { autoFlush: false } })
  await mona.getState(MONA, id)
  ctx.sap.mb52 = [stock('INT4300-4921-0', 'D000', 3, 0, 3000), stock('R162-0717', 'D000', 100, 0, 500)]
  ctx.tick(1000)
  const preview = await mona.previewRefetch(MONA, id)
  // "Hent SAP igen" writes the meta (under its lock) before the snapshot: the next poll starts reading the snapshot, which is still the old one.
  let releaseWrite
  writeGate = new Promise(resolve => { releaseWrite = resolve })
  const atWrite = new Promise(resolve => { writing = resolve })
  const applying = mona.applyRefetch(MONA, id, { token: preview.token })
  await atWrite
  writeGate = null
  let release
  gate = new Promise(resolve => { release = resolve })
  const atRead = new Promise(resolve => { reached = resolve })
  ctx.tick(5000)
  const polling = mona.getState(MONA, id)
  await atRead
  gate = null
  releaseWrite()
  await applying
  release()
  await polling
  // At once (before the next refresh): an approval made now freezes the rows of this state.
  assert.equal((await mona.getState(MONA, id)).rows.find(row => row.material === 'INT4300-4921-0').sapQty, 3)
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
  // Styrede timere (opvarmning og hængende opfriskning) og et signal, hver gang en kontekst-hentning er færdig.
  const timers = []
  const setTimer = (fn, ms) => { const timer = { fn, ms, done: false, unrefed: false, unref() { timer.unrefed = true; return timer } }; timers.push(timer); return timer }
  const clearTimer = timer => { if (timer) timer.done = true }
  let waiters = []
  const onScanContextRefreshed = () => { const due = waiters; waiters = []; for (const resolve of due) resolve() }
  const svc = createCountService({ repo, storeFor: ctx.storeFor, fetcher: ctx.fetcher, journalsDir: path.join(ctx.root, `local-${name}`), deviceId: name, now: () => ctx.clock.now, newId: () => `${name}-${crypto.randomUUID()}`, journalOptions: { autoFlush: false }, setTimer, clearTimer, onScanContextRefreshed })
  return {
    svc,
    reads,
    timers,
    hold() { let release; const promise = new Promise(resolve => { release = resolve }); gate = { promise, release }; return gate },
    release() { if (gate) { gate.release(); gate = null } },
    /** Stops holding new reads; the reads already held hang until their gate is released (or forever). */
    unhold() { gate = null },
    /** Resolves when the next scan-context fetch has settled (call it before the fetch can settle). */
    refreshed() { return new Promise(resolve => waiters.push(resolve)) },
    armed: ms => timers.filter(timer => !timer.done && timer.ms === ms).length,
    fire(ms) { const due = timers.filter(timer => !timer.done && timer.ms === ms); for (const timer of due) { timer.done = true; timer.fn() } return due.length },
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
  const refreshed = pc.refreshed()
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
  assert.notEqual(await within(refreshed, 2000), 'timeout', 'the background refresh settles')
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
  const refreshed = pc.refreshed()
  try {
    const result = await within(pc.svc.scan(ANNA, id, { serial: 'N2', place: 'A1.1' }), 1000)
    assert.notEqual(result, 'timeout')
    assert.equal(result.outcome, 'found', 'answered from the context of a moment ago')
  } finally {
    pc.release()
  }
  assert.notEqual(await within(refreshed, 2000), 'timeout', 'the background refresh settles')
  await assert.rejects(pc.svc.scan(ANNA, id, { serial: 'U1', place: 'A1.1' }), { code: 'STATUS_LOCKED' })
})

test('an active scanner keeps its scan context fresh', async () => {
  const ctx = setup()
  const { id } = await newCount(ctx, ctx.service('pc1'))
  const pc = countingService(ctx, 'pc1b')
  await pc.svc.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  assert.equal(pc.armed(4000), 1, 'one warm-up timer per count and user')
  ctx.tick(4000)
  const refreshed = pc.refreshed()
  assert.equal(pc.fire(4000), 1)
  assert.notEqual(await within(refreshed, 2000), 'timeout', 'the warm-up refreshes the context')
  ctx.tick(2000)
  pc.reads.length = 0
  pc.hold()
  try {
    const started = Date.now()
    const result = await within(pc.svc.scan(ANNA, id, { serial: 'N2', place: 'A1.1' }), 1000)
    assert.notEqual(result, 'timeout')
    assert.ok(Date.now() - started < 90, `answered in ${Date.now() - started} ms without waiting for the drive`)
    assert.deepEqual([result.outcome, result.saved], ['found', true])
  } finally {
    pc.release()
  }
  assert.deepEqual(pc.reads, [], 'the warm context is fresh')
  assert.equal(pc.armed(4000), 1, 'still one timer after scanning again')
  assert.ok(pc.timers.every(timer => timer.unrefed), 'timers never keep the app alive')
})

test('warm-up stops after two minutes without scanning', async () => {
  const ctx = setup()
  const { id } = await newCount(ctx, ctx.service('pc1'))
  const pc = countingService(ctx, 'pc1b')
  await pc.svc.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  const scannedAt = ctx.clock.now
  let refreshes = 0
  while (pc.armed(4000)) {
    assert.ok(ctx.clock.now - scannedAt < 130_000, 'the warm-up must stop')
    ctx.tick(4000)
    pc.reads.length = 0
    const refreshed = pc.refreshed()
    pc.fire(4000)
    if (await within(refreshed, 300) !== 'timeout') refreshes++
  }
  assert.deepEqual(pc.reads, [], 'the last timer read nothing')
  assert.equal(ctx.clock.now - scannedAt, 120_000, 'stopped after two minutes idle')
  assert.equal(refreshes, 29, 'refreshed every 4 s while the scanner was active')
  await pc.svc.scan(ANNA, id, { serial: 'N2', place: 'A1.1' })
  assert.equal(pc.armed(4000), 1, 'a new scan starts the warm-up again')
  await pc.svc.closeAll()
  assert.equal(pc.armed(4000), 0, 'closing clears the timer')
})

test('a hung background refresh does not block later refreshes', async () => {
  const ctx = setup()
  const { id } = await newCount(ctx, ctx.service('pc1'))
  const pc = countingService(ctx, 'pc1b')
  await pc.svc.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })
  ctx.tick(6000)
  const hung = pc.hold()
  const result = await within(pc.svc.scan(ANNA, id, { serial: 'N2', place: 'A1.1' }), 1000)
  assert.equal(result.outcome, 'found', 'answered from the old context')
  pc.unhold()
  const logged = []
  const original = console.error
  console.error = (...args) => logged.push(args.join(' '))
  try {
    assert.equal(pc.fire(10_000), 1, 'the hung refresh times out after 10 s')
    ctx.tick(1000)
    pc.reads.length = 0
    const refreshed = pc.refreshed()
    assert.equal((await pc.svc.scan(ANNA, id, { serial: 'U1', place: 'A1.1' })).outcome, 'found')
    assert.notEqual(await within(refreshed, 2000), 'timeout', 'a new refresh ran')
    assert.equal(pc.reads.filter(name => name === 'getMembers').length, 1, 'a new refresh was started')
    assert.equal(logged.filter(line => /scan context/.test(line)).length, 1, 'logged once')
  } finally {
    console.error = original
  }
  // Det hængende svar kommer sent og må ikke erstatte den nyere kontekst.
  const late = pc.refreshed()
  hung.release()
  await within(late, 2000)
  ctx.tick(4500)
  pc.reads.length = 0
  assert.equal((await pc.svc.scan(ANNA, id, { serial: 'N1', place: 'A1.1' })).outcome, 'duplicate')
  assert.deepEqual(pc.reads, [], 'the late result was ignored')
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

test('opening a count does not wait for the summary to be saved on the drive (a write to M: can take 30 s)', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const store = ctx.storeFor('TCD')
  const setAsync = store.setAsync
  let summaryWrites = 0
  store.setAsync = (key, value) => {
    if (key.endsWith('-summary')) { summaryWrites++; return new Promise(() => {}) }
    return setAsync(key, value)
  }
  const fresh = ctx.service('pc2')
  const answer = await Promise.race([fresh.getState(ANNA, id).then(() => 'answered'), new Promise(resolve => setTimeout(() => resolve('waited for the write'), 1000))])
  assert.equal(answer, 'answered')
  assert.equal(summaryWrites, 1, 'the summary is still saved, in the background')
})

test('opening a count reads its files from the drive in parallel, not one after another', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const store = ctx.storeFor('TCD')
  const getAsync = store.getAsync
  let inFlight = 0
  let most = 0
  store.getAsync = async (...args) => {
    inFlight++
    most = Math.max(most, inFlight)
    try {
      await new Promise(resolve => setTimeout(resolve, 20))
      return await getAsync(...args)
    } finally {
      inFlight--
    }
  }
  const fresh = ctx.service('pc2')
  await fresh.openCount(ANNA, id)
  await fresh.getState(ANNA, id)
  assert.ok(most >= 4, `at most ${most} reads ran at once`)
})
test('choosing a material you already count, or one someone else counts, answers without writing to the drive', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const bo = ctx.service('pc2')
  const { id } = await newCount(ctx, anna)
  await bo.requestJoin(BO, id)
  await anna.decideMember(ANNA, id, { email: BO.email, approve: true })
  const store = ctx.storeFor('TCD')
  const updateAsync = store.updateAsync
  const mutateAsync = store.mutateAsync
  let lockWrites = 0
  store.updateAsync = (key, operation) => {
    if (key.endsWith('-materiallaase')) lockWrites++
    return updateAsync(key, operation)
  }
  store.mutateAsync = (key, callback) => {
    if (key.endsWith('-materiallaase')) lockWrites++
    return mutateAsync(key, callback)
  }
  assert.equal((await anna.lockMaterial(ANNA, id, { material: 'INT4300-4921-0' })).holder.name, 'Anna')
  assert.equal(lockWrites, 1, 'taking a free material is saved')
  assert.equal((await anna.lockMaterial(ANNA, id, { material: 'INT4300-4921-0' })).holder.name, 'Anna')
  await assert.rejects(bo.lockMaterial(BO, id, { material: 'INT4300-4921-0' }), { code: 'MATERIAL_LOCKED' })
  assert.equal(lockWrites, 1, 'a write to M: takes seconds; nothing to change means nothing to write')
})
// ---------- Writes to M: take 15-90 s each: one write instead of many, and different files at the same time ----------
/** Records every write to the drive for the keys `watch` picks, and how many of them ran at the same time. */
function watchWrites(store, { delayMs = 0, watch = () => true } = {}) {
  const watched = { writes: [], most: 0 }
  let inFlight = 0
  for (const name of ['setAsync', 'updateAsync', 'mutateAsync', 'deleteAsync']) {
    const original = store[name]
    store[name] = async (key, ...args) => {
      if (!watch(key)) return original.call(store, key, ...args)
      watched.writes.push(key)
      inFlight++
      watched.most = Math.max(watched.most, inFlight)
      try {
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs))
        return await original.call(store, key, ...args)
      } finally {
        inFlight--
      }
    }
  }
  return watched
}

test('"Godkend alle uden difference" is one write of the approvals for every material, and keeps earlier approvals', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  for (const serialNo of ['N1', 'N2', 'U1']) await anna.scan(ANNA, id, { serial: serialNo, place: 'A1.1' })
  await anna.flush(ANNA, id)
  await mona.setApproval(MONA, id, { material: 'INT4300-4921-0', status: 'approved', comment: 'Tjekket' })
  const watched = watchWrites(ctx.storeFor('TCD'), { watch: key => key.endsWith('-approvals') })
  assert.deepEqual(await mona.approveAllWithoutDifference(MONA, id), { approved: 1 })
  assert.equal(watched.writes.length, 1, 'one write, not one per material')
  const approvals = await ctx.repo.getApprovals('TCD', id)
  assert.deepEqual([approvals['INT4300-4921-0'].comment, approvals['INT4300-4921-0-R'].status, approvals['INT4300-4921-0-R'].comment], ['Tjekket', 'approved', 'Ingen difference'])
  assert.ok(approvals['INT4300-4921-0-R'].frozen.length > 0, 'the figures are frozen as with a single approval')
  assert.equal(approvals['R162-0717'], undefined, 'a material with a difference is not approved')
  assert.deepEqual(await mona.approveAllWithoutDifference(MONA, id), { approved: 0 })
})

test('approving writes the approval and releases the material lock at the same time', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await anna.lockMaterial(ANNA, id, { material: 'R162-0717' })
  const watched = watchWrites(ctx.storeFor('TCD'), { delayMs: 30, watch: key => /-(approvals|materiallaase)$/.test(key) })
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  assert.deepEqual(watched.writes.map(key => key.split('-').at(-1)).sort(), ['approvals', 'materiallaase'])
  assert.equal(watched.most, 2, 'both writes ran at once')
  assert.deepEqual(await ctx.repo.getMaterialLocks('TCD', id), {})
})

test('closing a count writes its meta once, with the index entry and the summary at the same time', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const { id } = await newCount(ctx, anna)
  const watched = watchWrites(ctx.storeFor('TCD'), { delayMs: 30, watch: key => /-(meta|summary)$/.test(key) || key === 'counts-index' })
  const meta = await anna.closeCount(ANNA, id)
  assert.deepEqual([meta.status, meta.closedBy.name], ['closed', 'Anna'])
  assert.deepEqual(watched.writes.map(key => key.split('-').at(-1)).sort(), ['index', 'meta', 'summary'], 'three fields of the meta in one write')
  assert.equal(watched.most, 3)
  const index = await ctx.repo.listCounts('TCD')
  assert.equal(index.find(entry => entry.id === id).status, 'closed')
  assert.equal((await ctx.repo.getMeta('TCD', id)).closedAt, ctx.clock.now)
})

test('posted SAP documents mark all their approved materials "Bogført i SAP" in one write', async () => {
  const ctx = setup()
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const { id } = await newCount(ctx, anna)
  await mona.setApproval(MONA, id, { material: 'R162-0717', status: 'approved' })
  await mona.setApproval(MONA, id, { material: 'INT4300-4921-0', status: 'approved' })
  await assert.rejects(anna.markPosted(ANNA, id, ['R162-0717']), { code: 'MANAGER_ONLY' })
  const watched = watchWrites(ctx.storeFor('TCD'), { watch: key => key.endsWith('-approvals') })
  assert.deepEqual(await mona.markPosted(MONA, id, ['r162-0717', 'INT4300-4921-0', 'INT4300-4921-0-R']), { posted: ['R162-0717', 'INT4300-4921-0'], skipped: ['INT4300-4921-0-R'], serialLines: [], already: [] })
  assert.equal(watched.writes.length, 1)
  const approvals = await ctx.repo.getApprovals('TCD', id)
  assert.deepEqual([approvals['R162-0717'].status, approvals['R162-0717'].postedBy.name, approvals['INT4300-4921-0-R']], ['posted', 'Mona', undefined])
  // A second document of the same material: already posted, not skipped, and the first mark is kept.
  ctx.tick(1000)
  assert.deepEqual(await mona.markPosted(MONA, id, ['R162-0717']), { posted: [], skipped: [], serialLines: [], already: ['R162-0717'] })
  assert.equal((await ctx.repo.getApprovals('TCD', id))['R162-0717'].postedAt, approvals['R162-0717'].postedAt)
})

test('deleting a status marks all its counts deleted in one write of the index', async () => {
  const ctx = setup()
  ctx.sap.mb52[0] = stock('INT4300-4921-0', 'D000', 2, 1, 2000, 1000)
  ctx.sap.serials.push(serial('B1', 'INT4300-4921-0', 'D000', 'blocked'))
  const anna = ctx.service('pc1')
  const mona = ctx.service('pc3')
  const create = async scope => anna.createCount(ANNA, { token: (await anna.preview(ANNA, { scope })).token, name: scope.stockTypes[0] })
  const first = await create({ type: 'slocs', slocs: ['D000'], stockTypes: ['unrestricted'] })
  const second = await create({ type: 'slocs', slocs: ['D000'], stockTypes: ['blocked'] })
  const watched = watchWrites(ctx.storeFor('TCD'), { watch: key => key === 'counts-index' || key === 'statusser' })
  assert.deepEqual(await mona.deleteStatus(MONA, 'st0open1'), { ok: true, counts: 2 })
  assert.deepEqual(watched.writes.sort(), ['counts-index', 'statusser'])
  assert.deepEqual(await ctx.repo.listCounts('TCD'), [])
  assert.deepEqual((await ctx.storeFor('TCD').keysAsync()).filter(key => key.includes(first.id) || key.includes(second.id)), [], 'the files of both counts are gone')
})
