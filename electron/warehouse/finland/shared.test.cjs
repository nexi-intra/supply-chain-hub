const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { parcelKey } = require('./core/sheetIndex.cjs')
const { createFinlandShared, TEST_WORKBOOK_URL } = require('./shared.cjs')

const ANNA = { email: 'anna@x.test', fullName: 'Anna Holm', role: 'user', team: 'BPO', tools: ['finland'] }
const BO = { email: 'bo@x.test', fullName: 'Bo Jensen', role: 'user', team: 'TCD', tools: ['finland'] }
const ADA = { email: 'ada@x.test', fullName: 'Ada', role: 'manager', team: 'TCD', tools: ['finland'] }
const CARL = { email: 'carl@x.test', fullName: 'Carl', role: 'creator', team: 'TCD', tools: ['finland'] }

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'finland-shared-'))
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }))

function setup() {
  const dir = fs.mkdtempSync(path.join(ROOT, 'finlandsforsendelser-'))
  const store = createStore(dir)
  const clock = { now: Date.UTC(2026, 10, 19, 9) }
  const shared = createFinlandShared({ store, now: () => clock.now })
  return { dir, store, clock, shared }
}

const PARCEL = { delivery: '0080012345', tracking: 'JJD000390007788990011', shippedOn: '2026-11-18', orderType: 'ZOR', postalCode: '00100' }

test('marks and restores a parcel', async () => {
  const { shared, clock } = setup()
  assert.deepEqual(await shared.notSent.list(), [], 'an empty folder is an empty list')
  await shared.notSent.mark(ANNA, PARCEL)
  assert.deepEqual(await shared.notSent.list(), [{ ...PARCEL, by: 'anna@x.test', byName: 'Anna Holm', at: clock.now }])
  clock.now += 1000
  await shared.notSent.mark(BO, PARCEL)
  assert.equal((await shared.notSent.list())[0].byName, 'Anna Holm', 'marking it again keeps who marked it first')
  await assert.rejects(shared.notSent.mark(ANNA, { ...PARCEL, tracking: '' }), { code: 'FINLAND_ENTRY_INVALID' })
  assert.equal(await shared.notSent.restore(parcelKey(PARCEL.delivery, PARCEL.tracking)), true)
  assert.deepEqual(await shared.notSent.list(), [])
  assert.equal(await shared.notSent.restore(parcelKey(PARCEL.delivery, PARCEL.tracking)), false)
})

test('the not-sent list is unreadable when the folder is gone', async () => {
  const { shared, dir, store } = setup()
  fs.rmSync(dir, { recursive: true, force: true })
  store.invalidate()
  await assert.rejects(shared.notSent.list(), { code: 'STORAGE_UNAVAILABLE' })
  await assert.rejects(shared.drafts.others(ANNA.email), { code: 'STORAGE_UNAVAILABLE' })
})

test('a lock held by someone else refuses with the name and day', async () => {
  const { shared } = setup()
  const release = await shared.lock.acquire(ANNA, { day: '2026-11-19', action: 'write-day', ttlMs: 60000 })
  assert.deepEqual(await shared.lock.current(), { email: 'anna@x.test', name: 'Anna Holm', day: '2026-11-19', action: 'write-day', at: Date.UTC(2026, 10, 19, 9), expiresAt: Date.UTC(2026, 10, 19, 9) + 60000 })
  await assert.rejects(shared.lock.acquire(BO, { day: '2026-11-05', action: 'fix-review', ttlMs: 60000 }), error => {
    assert.equal(error.code, 'FINLAND_LOCKED')
    assert.equal(error.message, 'FINLAND_LOCKED: Anna Holm skriver 19.11 i arket lige nu')
    return true
  })
  await release()
  assert.equal(await shared.lock.current(), null)
  const bo = await shared.lock.acquire(BO, { day: '2026-11-05', action: 'fix-review', ttlMs: 60000 })
  await bo()
})

test('the same person on another PC is refused while her first lock holds', async () => {
  const { shared, dir } = setup()
  const otherPc = createFinlandShared({ store: createStore(dir), now: () => Date.UTC(2026, 10, 19, 9) })
  const first = await shared.lock.acquire(ANNA, { day: '2026-11-19', action: 'skriver', ttlMs: 60000 })
  await assert.rejects(otherPc.lock.acquire({ ...ANNA, email: 'ANNA@x.test' }, { day: '2026-11-20', action: 'skriver', ttlMs: 60000 }), {
    code: 'FINLAND_LOCKED',
    message: 'FINLAND_LOCKED: Du skriver allerede i arket fra en anden pc. Prøv igen om lidt.',
  })
  assert.equal((await shared.lock.current()).day, '2026-11-19', 'the first lock is untouched')
  await first()
  await (await otherPc.lock.acquire(ANNA, { day: '2026-11-20', action: 'skriver', ttlMs: 60000 }))()
})

test('a lock is renewed only by its own acquisition while it holds', async () => {
  const { shared, clock } = setup()
  const anna = await shared.lock.acquire(ANNA, { day: '2026-11-19', action: 'skriver', ttlMs: 60000 })
  clock.now += 30000
  await shared.lock.renew(anna.token, { ttlMs: 5 * 60000 })
  assert.equal((await shared.lock.current()).expiresAt, clock.now + 5 * 60000, 'renewed from now')
  await assert.rejects(shared.lock.renew('another-token', { ttlMs: 60000 }), { code: 'FINLAND_LOCKED', message: 'FINLAND_LOCKED: Anna Holm skriver 19.11 i arket lige nu' })
  await anna()

  // Expired while reading, taken, written and freed by Bo in between: Anna's renew must fail, also with the lock free.
  const again = await shared.lock.acquire(ANNA, { day: '2026-11-19', action: 'skriver', ttlMs: 60000 })
  clock.now += 60001
  const bo = await shared.lock.acquire(BO, { day: '2026-11-19', action: 'skriver', ttlMs: 60000 })
  await assert.rejects(shared.lock.renew(again.token, { ttlMs: 60000 }), { code: 'FINLAND_LOCKED', message: 'FINLAND_LOCKED: Bo Jensen skriver 19.11 i arket lige nu' })
  await bo()
  await assert.rejects(shared.lock.renew(again.token, { ttlMs: 60000 }), { code: 'FINLAND_LOCKED', message: /Intet er skrevet/ })
  assert.equal(await shared.lock.current(), null, 'a failed renew takes no lock')
})

test('an expired lock can be taken by someone else', async () => {
  const { shared, clock } = setup()
  await shared.lock.acquire(ANNA, { day: '2026-11-19', action: 'write-day', ttlMs: 60000 })
  clock.now += 60001
  assert.equal(await shared.lock.current(), null)
  await shared.lock.acquire(BO, { day: '2026-11-19', action: 'write-day', ttlMs: 60000 })
  assert.equal((await shared.lock.current()).email, 'bo@x.test')
})

test('release does not free a lock someone else has taken since', async () => {
  const { shared, clock } = setup()
  const anna = await shared.lock.acquire(ANNA, { day: '2026-11-19', action: 'write-day', ttlMs: 60000 })
  clock.now += 60001
  await shared.lock.acquire(BO, { day: '2026-11-19', action: 'write-day', ttlMs: 60000 })
  await anna()
  assert.equal((await shared.lock.current()).email, 'bo@x.test')

  // Her own expired lock taken again by her: the first acquisition's release must not free the second.
  clock.now += 60001
  const old = await shared.lock.acquire(ADA, { day: '2026-11-19', action: 'write-day', ttlMs: 60000 })
  clock.now += 60001
  await shared.lock.acquire(ADA, { day: '2026-11-19', action: 'fix-review', ttlMs: 60000 })
  await old()
  assert.equal((await shared.lock.current()).action, 'fix-review')
})

test('a lock without a usable ttl gets the default two minutes', async () => {
  for (const ttlMs of [0, -5, NaN, Infinity, 'x', null]) {
    const { shared, clock } = setup()
    await shared.lock.acquire(ANNA, { day: '2026-11-19', action: 'write-day', ttlMs })
    assert.equal((await shared.lock.current()).expiresAt, clock.now + 2 * 60000, `ttlMs ${String(ttlMs)}`)
    await assert.rejects(shared.lock.acquire(BO, { day: '2026-11-19', action: 'write-day' }), { code: 'FINLAND_LOCKED' })
  }
})

test("another PC's not-sent marks and written keys are seen at once, not from the read cache", async () => {
  const { shared, dir } = setup()
  const other = createFinlandShared({ store: createStore(dir), now: () => Date.UTC(2026, 10, 19, 9) })
  // This PC writes and reads first, so each value sits in its read cache (a missing file is never cached).
  const FIRST = { ...PARCEL, tracking: 'JJD000390000000000001' }
  await shared.notSent.mark(ANNA, FIRST)
  await shared.dayLog.record(ANNA, '2026-11-19', ['0|Z'])
  await (await shared.lock.acquire(ANNA, { day: '2026-11-19', action: 'write-day', ttlMs: 60000 }))()
  assert.deepEqual((await shared.notSent.list()).map(entry => entry.tracking), [FIRST.tracking])
  assert.deepEqual([...await shared.dayLog.recentKeys()], ['0|Z'])
  assert.equal(await shared.lock.current(), null)
  await other.notSent.mark(BO, PARCEL)
  await other.dayLog.record(BO, '2026-11-19', ['1|A'])
  await other.lock.acquire(BO, { day: '2026-11-19', action: 'write-day', ttlMs: 60000 })
  assert.deepEqual((await shared.notSent.list()).map(entry => entry.tracking).sort(), [FIRST.tracking, PARCEL.tracking].sort())
  assert.deepEqual([...await shared.dayLog.recentKeys()].sort(), ['0|Z', '1|A'])
  assert.equal((await shared.lock.current()).email, 'bo@x.test')
})

test('recent keys are forgotten after 30 minutes', async () => {
  const { shared, clock } = setup()
  const start = clock.now
  await shared.dayLog.record(ANNA, '2026-11-19', ['1|A', '2|B'])
  assert.deepEqual([...await shared.dayLog.recentKeys()].sort(), ['1|A', '2|B'])
  clock.now += 20 * 60000
  await shared.dayLog.record(BO, '2026-11-19', ['3|C'])
  assert.deepEqual(await shared.dayLog.days(), { '2026-11-19': { byName: 'Bo Jensen', at: start + 20 * 60000, count: 3 } })
  clock.now += 10 * 60000 + 1
  assert.deepEqual([...await shared.dayLog.recentKeys()], ['3|C'])
  assert.deepEqual([...await shared.dayLog.recentKeys(5 * 60000)], [])
  clock.now += 30 * 60000
  await shared.dayLog.record(ANNA, '2026-11-20', ['4|D'])
  assert.deepEqual([...await shared.dayLog.recentKeys(24 * 60 * 60000)], ['4|D'], 'older keys are pruned when recording')
  assert.equal((await shared.dayLog.days())['2026-11-19'].count, 3, 'the day summary is kept')
})

test('settings default to the test sheet and only managers change them', async () => {
  const { shared } = setup()
  assert.equal(TEST_WORKBOOK_URL, 'https://christianiabpos.sharepoint.com/sites/NordicSupplyChain/Shared Documents/General/Testark - Ordre sendt til Finland fra Danmark.xlsx')
  assert.deepEqual(await shared.settings.get(), { workbookUrl: TEST_WORKBOOK_URL, sheetName: 'Sheet1', tableName: 'Table2', isTest: true })
  const real = { workbookUrl: 'https://christianiabpos.sharepoint.com/sites/NordicSupplyChain/Ordre.xlsx', sheetName: 'Ark1', tableName: 'Ordrer' }
  await assert.rejects(shared.settings.set(ANNA, real), { code: 'MANAGER_ONLY' })
  assert.deepEqual(await shared.settings.set(ADA, real), { ...real, isTest: false })
  assert.deepEqual(await shared.settings.get(), { ...real, isTest: false })
  const local = { workbookUrl: 'C:\\Users\\ada\\Kopi af ark.xlsx', sheetName: 'Sheet1', tableName: 'Table2' }
  assert.deepEqual(await shared.settings.set(CARL, local), { ...local, isTest: false })
  for (const bad of [
    { ...real, workbookUrl: 'http://example.test/ark.xlsx' },
    { ...real, workbookUrl: 'ark.xlsx' },
    { ...real, workbookUrl: 'C:\\ark.csv' },
    { ...real, sheetName: '  ' },
    { ...real, tableName: 'x'.repeat(65) },
  ]) await assert.rejects(shared.settings.set(ADA, bad), { code: 'FINLAND_SETTINGS_INVALID' })
  assert.deepEqual(await shared.settings.set(ADA, { workbookUrl: TEST_WORKBOOK_URL, sheetName: 'Sheet1', tableName: 'Table2' }), { workbookUrl: TEST_WORKBOOK_URL, sheetName: 'Sheet1', tableName: 'Table2', isTest: true })
})

test('drafts are per person and others are counted per day', async () => {
  const { shared, store, clock } = setup()
  const anna = shared.drafts(ANNA.email, ANNA.fullName)
  assert.deepEqual(await anna.all(), [])
  assert.equal(await anna.get('1|A'), null)
  await anna.set('1|A', { key: '1|A', pickedUp: '2026-11-18', wanted: { note: 'x' } })
  await anna.set('2|B', { key: '2|B', pickedUp: '2026-11-18' })
  await anna.set('3|C', { key: '3|C', pickedUp: '2026-11-19' })
  assert.deepEqual(await anna.get('1|A'), { key: '1|A', pickedUp: '2026-11-18', wanted: { note: 'x' }, updatedAt: new Date(clock.now).toISOString() })
  assert.equal((await anna.all()).length, 3)
  await anna.remove(['2|B', 'missing'])
  assert.deepEqual((await anna.all()).map(draft => draft.key), ['1|A', '3|C'])

  const ownKey = (await store.keysAsync()).find(key => key.startsWith('kladder-'))
  assert.match(ownKey, /^kladder-[0-9a-f]{16}$/)
  assert.deepEqual(Object.keys(await store.getAsync(ownKey)), ['email', 'name', 'drafts'])

  // The same person through her upper-case address is the same file; Bo has his own.
  assert.equal((await shared.drafts('ANNA@x.test').all()).length, 2)
  const bo = shared.drafts(BO.email, BO.fullName)
  assert.deepEqual(await bo.all(), [])
  await bo.set('9|Z', { key: '9|Z', pickedUp: '2026-11-19' })

  assert.deepEqual(await shared.drafts.others(BO.email), [{ email: 'anna@x.test', name: 'Anna Holm', byDay: { '2026-11-18': 1, '2026-11-19': 1 }, keys: ['1|A', '3|C'], updatedAt: new Date(clock.now).toISOString() }])
  assert.deepEqual((await shared.drafts.others(ANNA.email)).map(other => other.email), ['bo@x.test'])
  await bo.remove(['9|Z'])
  assert.deepEqual(await shared.drafts.others(ANNA.email), [], 'someone without drafts is not listed')
})

test("only managers clear someone's drafts", async () => {
  const { shared } = setup()
  const anna = shared.drafts(ANNA.email, ANNA.fullName)
  await anna.set('1|A', { key: '1|A', pickedUp: '2026-11-18' })
  await assert.rejects(shared.drafts.clear(BO, ANNA.email), { code: 'MANAGER_ONLY' })
  assert.equal((await anna.all()).length, 1)
  assert.deepEqual(await shared.drafts.clear(ADA, 'Anna@x.test'), { email: 'anna@x.test', cleared: 1 })
  assert.deepEqual(await anna.all(), [])
  assert.deepEqual(await shared.drafts.clear(CARL, ANNA.email), { email: 'anna@x.test', cleared: 0 })
})

test('clearing drafts is logged with who, whose and how many, newest first', async () => {
  const { shared, clock } = setup()
  assert.deepEqual(await shared.drafts.clearedLog(), [])
  const anna = shared.drafts(ANNA.email, ANNA.fullName)
  await anna.set('1|A', { key: '1|A', pickedUp: '2026-11-18' })
  await anna.set('2|B', { key: '2|B', pickedUp: '2026-11-18' })
  await shared.drafts.clear(ADA, ANNA.email)
  await shared.drafts.clear(ADA, ANNA.email)
  await assert.rejects(shared.drafts.clear(BO, ANNA.email), { code: 'MANAGER_ONLY' })
  clock.now += 60000
  await shared.drafts(BO.email, BO.fullName).set('3|C', { key: '3|C', pickedUp: '2026-11-19' })
  await shared.drafts.clear(CARL, BO.email)
  assert.deepEqual(await shared.drafts.clearedLog(), [
    { by: 'carl@x.test', byName: 'Carl', email: 'bo@x.test', name: 'Bo Jensen', count: 1, at: clock.now },
    { by: 'ada@x.test', byName: 'Ada', email: 'anna@x.test', name: 'Anna Holm', count: 2, at: clock.now - 60000 },
  ], 'a clear with nothing to delete is not logged')
  assert.deepEqual(await shared.drafts.others(''), [], 'the log is not read as anyone\'s drafts')
})

test('drafts, not-sent marks and written keys are kept per sheet; without a sheet they are the test sheet\'s', async () => {
  const { shared } = setup()
  const REAL = 'https://christianiabpos.sharepoint.com/sites/NordicSupplyChain/Ordre.xlsx'
  const anna = shared.drafts(ANNA.email, ANNA.fullName)
  await anna.set('1|A', { key: '1|A', pickedUp: '2026-11-18' })
  await anna.set('2|B', { key: '2|B', pickedUp: '2026-11-18', workbookUrl: REAL })
  assert.deepEqual((await shared.drafts.others(BO.email, REAL)).map(o => [o.keys, o.byDay]), [[['2|B'], { '2026-11-18': 1 }]])
  assert.deepEqual((await shared.drafts.others(BO.email, TEST_WORKBOOK_URL)).map(o => o.keys), [['1|A']])
  assert.deepEqual((await shared.drafts.others(BO.email)).map(o => o.keys), [['1|A', '2|B']])

  await shared.notSent.mark(ANNA, PARCEL)
  assert.deepEqual(await shared.notSent.list(REAL), [])
  assert.equal((await shared.notSent.list(TEST_WORKBOOK_URL)).length, 1)
  assert.equal(await shared.notSent.restore(parcelKey(PARCEL.delivery, PARCEL.tracking), REAL), false, 'a test-sheet mark is not restored from the real sheet')
  // Marked again in the real sheet: the test sheet's mark gives way.
  const marked = await shared.notSent.mark(BO, { ...PARCEL, workbookUrl: REAL })
  assert.equal(marked.byName, 'Bo Jensen')
  assert.deepEqual((await shared.notSent.list(REAL)).map(e => e.byName), ['Bo Jensen'])
  assert.deepEqual(await shared.notSent.list(TEST_WORKBOOK_URL), [])

  await shared.dayLog.record(ANNA, '2026-11-19', ['1|A'])
  await shared.dayLog.record(BO, '2026-11-19', ['2|B'], { workbookUrl: REAL })
  assert.deepEqual([...await shared.dayLog.recentKeys(undefined, REAL)], ['2|B'])
  assert.deepEqual([...await shared.dayLog.recentKeys(undefined, TEST_WORKBOOK_URL)], ['1|A'])
  assert.deepEqual([...await shared.dayLog.recentKeys()].sort(), ['1|A', '2|B'])
  assert.deepEqual(await shared.dayLog.days(REAL), { '2026-11-19': { byName: 'Bo Jensen', at: Date.UTC(2026, 10, 19, 9), count: 1, workbookUrl: REAL } }, 'the test sheet\'s count is not carried over')
  assert.deepEqual(await shared.dayLog.days(TEST_WORKBOOK_URL), {})
})
