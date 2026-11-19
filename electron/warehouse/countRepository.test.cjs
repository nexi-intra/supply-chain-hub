const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../store.cjs')
const { createCountRepository, isCountId } = require('./countRepository.cjs')

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-repo-'))
  const stores = new Map()
  const storeFor = team => {
    if (!stores.has(team)) stores.set(team, createStore(path.join(dataDir, team)))
    return stores.get(team)
  }
  let clock = 1000
  let counter = 0
  const repo = createCountRepository({ storeFor, now: () => clock, newId: () => `count${++counter}abc` })
  return { repo, dataDir, storeFor, tick: ms => { clock += ms } }
}

const OWNER = { email: 'anna@example.test', name: 'Anna' }
const SNAPSHOT = { v: 1, team: 'TCD', scope: { type: 'slocs', slocs: ['D000'], materials: [] }, materials: [], stock: [], serials: [], excluded: { other: { materials: 0, quantity: 0 }, manual: [] }, fetchedAt: 900, fetchedBy: 'anna@example.test' }

test('serial number rules: TCD only, new terminals only; blocked stock never uses long serials; off removes the rule', async () => {
  const { repo } = setup()
  const by = { email: 'mona@example.test', name: 'Mona' }
  const rule = await repo.setSerialRule('TCD', 'int4300-7825-0', { unrestricted: true, blocked: true, by })
  assert.deepEqual({ unrestricted: rule.unrestricted, blocked: rule.blocked, by: rule.updatedBy.name }, { unrestricted: true, blocked: false, by: 'Mona' })
  assert.deepEqual(Object.keys(await repo.getSerialRules('TCD')), ['INT4300-7825-0'])
  await assert.rejects(repo.setSerialRule('TRR', 'INT4300-7825-0', { unrestricted: true, blocked: false, by }), { code: 'SERIAL_RULES_TCD_ONLY' })
  await assert.rejects(repo.setSerialRule('TCD', 'INT4300-7825-0-R', { unrestricted: true, blocked: false, by }), { code: 'RULE_INVALID' })
  await assert.rejects(repo.setSerialRule('TCD', 'R162-0717', { unrestricted: true, blocked: false, by }), { code: 'RULE_INVALID' })
  await repo.setSerialRule('TCD', 'INT4300-7825-0', { unrestricted: false, by })
  assert.deepEqual(await repo.getSerialRules('TCD'), {})
})

test('long serial numbers are cached per team and merged, never overwritten with junk', async () => {
  const { repo } = setup()
  await repo.saveLongSerials('TCD', [{ short: '303201349258058038', long: '251427303201349258058038', material: 'INT4300-7825-0' }])
  await repo.saveLongSerials('TCD', [{ short: 'S2', long: 'L2LONG', material: 'INT4300-7825-0' }, { short: 'BAD<', long: 'x', material: 'M' }])
  const cache = await repo.getLongSerials('TCD')
  assert.equal(cache['303201349258058038'].long, '251427303201349258058038')
  assert.equal(cache.S2.long, 'L2LONG')
  assert.equal(Object.keys(cache).length, 2)
  assert.deepEqual(await repo.getLongSerials('TRR'), {})
})

test('count ids are short lowercase tokens', () => {
  assert.equal(isCountId('count1abc'), true)
  assert.equal(isCountId('../etc'), false)
  assert.equal(isCountId('A'.repeat(10)), false)
})

test('creating a count writes meta, snapshot, owner membership and the index', async () => {
  const { repo, dataDir } = setup()
  const meta = await repo.createCount('TCD', { name: '  Status D000  ', snapshot: SNAPSHOT, placements: [{ placement: 'A1.1', area: 'A', material: 'R1' }], owner: OWNER })
  assert.equal(meta.id, 'count1abc')
  assert.equal(meta.name, 'Status D000')
  assert.equal(meta.status, 'open')
  assert.deepEqual(meta.owner, OWNER)
  assert.deepEqual(meta.scope, SNAPSHOT.scope)
  assert.deepEqual(await repo.getSnapshot('TCD', meta.id), SNAPSHOT)
  assert.deepEqual(await repo.getPlacements('TCD', meta.id), [{ placement: 'A1.1', area: 'A', material: 'R1' }])
  const members = await repo.getMembers('TCD', meta.id)
  assert.equal(members['anna@example.test'].role, 'owner')
  assert.equal(members['anna@example.test'].status, 'approved')
  const list = await repo.listCounts('TCD')
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'Status D000')
  assert.deepEqual(await repo.listCounts('TRR'), [], 'teams never see each other')
  assert.ok(fs.existsSync(path.join(dataDir, 'TCD')))
  assert.equal(fs.existsSync(path.join(dataDir, 'TRR', 'counts-index.json')), false)
})

test('a count needs a name of reasonable length', async () => {
  const { repo } = setup()
  await assert.rejects(repo.createCount('TCD', { name: '  ', snapshot: SNAPSHOT, owner: OWNER }), { code: 'COUNT_INVALID' })
  await assert.rejects(repo.createCount('TCD', { name: 'x'.repeat(81), snapshot: SNAPSHOT, owner: OWNER }), { code: 'COUNT_INVALID' })
})

test('two PCs changing different fields of the same count at once both reach the count list', async () => {
  const { repo, dataDir } = setup()
  const { id } = await repo.createCount('TCD', { name: 'Test', snapshot: SNAPSHOT, owner: OWNER })
  const other = createCountRepository({ storeFor: () => createStore(path.join(dataDir, 'TCD')), now: () => 2000 })
  await Promise.all([
    repo.updateMeta('TCD', id, { status: 'closed', closedAt: 5000, closedBy: OWNER }),
    other.updateMeta('TCD', id, { fetchedAt: 7777 }),
  ])
  // Read from disk (the other repo opens a fresh store each time); on a real PC the watcher refreshes the cache.
  const meta = await other.getMeta('TCD', id)
  assert.deepEqual([meta.status, meta.fetchedAt], ['closed', 7777])
  const [entry] = await other.listCounts('TCD')
  assert.deepEqual([entry.status, entry.fetchedAt], ['closed', 7777], 'the list agrees with the count')
})

test('meta fields, members, claims and approvals are updated field by field', async () => {
  const { repo } = setup()
  const { id } = await repo.createCount('TCD', { name: 'Test', snapshot: SNAPSHOT, owner: OWNER })
  await repo.updateMeta('TCD', id, { status: 'closed', closedAt: 5000, closedBy: OWNER })
  const meta = await repo.getMeta('TCD', id)
  assert.equal(meta.status, 'closed')
  assert.equal(meta.name, 'Test')
  assert.equal((await repo.listCounts('TCD'))[0].status, 'closed', 'the index follows the status')
  await repo.setMember('TCD', id, 'bo@example.test', { email: 'bo@example.test', name: 'Bo', role: 'participant', status: 'requested' })
  assert.equal((await repo.getMembers('TCD', id))['bo@example.test'].status, 'requested')
  await repo.setClaim('TCD', id, 'A', { email: 'bo@example.test', name: 'Bo', at: 10, lastActivity: 10 })
  assert.deepEqual(Object.keys(await repo.getClaims('TCD', id)), ['A'])
  await repo.deleteClaim('TCD', id, 'A')
  assert.deepEqual(await repo.getClaims('TCD', id), {})
  await repo.setApproval('TCD', id, 'R162-0717', { status: 'approved', by: 'm@example.test' })
  assert.equal((await repo.getApprovals('TCD', id))['R162-0717'].status, 'approved')
})

test('SAP documents of a count are changed with compare-and-set', async () => {
  const { repo } = setup()
  const { id } = await repo.createCount('TCD', { name: 'Test', snapshot: SNAPSHOT, owner: OWNER })
  assert.deepEqual(await repo.getPiDocs('TCD', id), {})
  const result = await repo.changePiDocs('TCD', id, all => ({ all: { ...all, d1: { id: 'd1', status: 'creating' } }, result: 'd1' }))
  assert.equal(result, 'd1')
  await repo.changePiDocs('TCD', id, all => ({ all: { ...all, d1: { ...all.d1, status: 'created', docNo: '100000250' } } }))
  assert.deepEqual((await repo.getPiDocs('TCD', id)).d1, { id: 'd1', status: 'created', docNo: '100000250' })
})

test('replacing the snapshot keeps the previous one', async () => {
  const { repo } = setup()
  const { id } = await repo.createCount('TCD', { name: 'Test', snapshot: SNAPSHOT, owner: OWNER })
  const next = { ...SNAPSHOT, fetchedAt: 2000 }
  await repo.replaceSnapshot('TCD', id, next)
  assert.equal((await repo.getSnapshot('TCD', id)).fetchedAt, 2000)
  assert.equal((await repo.getPreviousSnapshot('TCD', id)).fetchedAt, 900)
})

test('deleting a count removes all its files and leaves a tombstone in the index', async () => {
  const { repo, dataDir } = setup()
  const keep = await repo.createCount('TCD', { name: 'Behold', snapshot: SNAPSHOT, owner: OWNER })
  const gone = await repo.createCount('TCD', { name: 'Forkert', snapshot: SNAPSHOT, owner: OWNER })
  await repo.setClaim('TCD', gone.id, 'A', { email: 'x', name: 'X', at: 1, lastActivity: 1 })
  await repo.deleteCount('TCD', gone.id, OWNER)
  assert.deepEqual((await repo.listCounts('TCD')).map(entry => entry.id), [keep.id])
  assert.equal(await repo.isDeleted('TCD', gone.id), true)
  assert.equal(await repo.isDeleted('TCD', keep.id), false)
  const files = fs.readdirSync(path.join(dataDir, 'TCD'))
  assert.equal(files.some(name => name.startsWith(`count-${gone.id}-`)), false)
  assert.ok(files.some(name => name.startsWith(`count-${keep.id}-`)))
  await assert.rejects(repo.getMeta('TCD', gone.id), { code: 'COUNT_NOT_FOUND' })
})

test('statuses: one open per team, started with history, locked and unlocked field by field', async () => {
  const { repo, tick } = setup()
  assert.deepEqual(await repo.listStatuses('TCD'), [])
  const status = await repo.startStatus('TCD', { name: 'Status Q4 2026', year: 2026, quarter: 4, by: OWNER })
  assert.equal(status.state, 'open')
  assert.equal(status.name, 'Status Q4 2026')
  assert.deepEqual(status.history.map(item => item.action), ['started'])
  await assert.rejects(repo.startStatus('TCD', { name: 'Igen', year: 2026, quarter: 4, by: OWNER }), { code: 'STATUS_ALREADY_OPEN' })
  assert.equal((await repo.getActiveStatus('TCD')).id, status.id)
  assert.equal(await repo.getActiveStatus('TRR'), null, 'teams are separate')
  tick(10)
  const locked = await repo.updateStatus('TCD', status.id, { state: 'locked', lockedAt: 5, lockedBy: OWNER }, { action: 'locked', by: OWNER })
  assert.equal(locked.state, 'locked')
  assert.deepEqual(locked.history.map(item => item.action), ['started', 'locked'])
  assert.equal(await repo.getActiveStatus('TCD'), null)
  const next = await repo.startStatus('TCD', { name: 'Status Q1 2027', year: 2027, quarter: 1, by: OWNER })
  assert.deepEqual((await repo.listStatuses('TCD')).map(item => item.id), [next.id, status.id], 'newest first')
  await assert.rejects(repo.updateStatus('TCD', 'nope1234', { state: 'locked' }, { action: 'locked', by: OWNER }), { code: 'STATUS_NOT_FOUND' })
})

test('own placements and storage rules are shared by the team', async () => {
  const { repo } = setup()
  await repo.saveOwnPlacement('TCD', { name: ' Arbejdsstation  4 ', area: 'ws', createdBy: OWNER })
  await repo.saveOwnPlacement('TCD', { name: 'arbejdsstation 4', area: 'WS', createdBy: OWNER })
  const own = await repo.getOwnPlacements('TCD')
  assert.equal(own.length, 1, 'names are unique regardless of case and spaces')
  assert.equal(own[0].name, 'Arbejdsstation 4')
  assert.equal(own[0].area, 'WS')
  await assert.rejects(repo.saveOwnPlacement('TCD', { name: '', createdBy: OWNER }), { code: 'PLACEMENT_INVALID' })
  await repo.setRule('TCD', 'D006', { kinds: ['new'], by: OWNER })
  assert.deepEqual((await repo.getRules('TCD')).D006.kinds, ['new'])
  await assert.rejects(repo.setRule('TCD', 'D001', { kinds: ['used'], by: OWNER }), { code: 'RULE_INVALID' })
  await assert.rejects(repo.setRule('TCD', 'D006', { kinds: ['nonsense'], by: OWNER }), { code: 'RULE_INVALID' })
})
