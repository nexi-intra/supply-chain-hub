const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../store.cjs')
const { createJournal, readAllJournals, writerKey } = require('./journal.cjs')

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-journal-'))
  const store = createStore(path.join(root, 'remote'))
  const state = { offline: false, reads: 0 }
  const remote = {
    async setAsync(key, value) { if (state.offline) throw Object.assign(new Error('offline'), { code: 'ENOENT' }); return store.setAsync(key, value) },
    async getAsync(key, options) { if (state.offline) throw Object.assign(new Error('offline'), { code: 'EIO' }); state.reads++; return store.getAsync(key, options) },
    async keysAsync() { if (state.offline) throw Object.assign(new Error('offline'), { code: 'EIO' }); return store.keysAsync() },
  }
  let clock = 1000
  let ids = 0
  const make = (email = 'anna@example.test', deviceId = 'pc1', chunkSize = 3) => createJournal({
    countId: 'count1abc', team: 'TCD', user: { email, name: email.split('@')[0] }, deviceId, localDir: path.join(root, `local-${deviceId}`), remote, chunkSize,
    now: () => clock++, newId: () => `e${++ids}`, autoFlush: false,
  })
  return { root, remote, state, make }
}

test('appending saves locally at once and is uploaded on flush', async () => {
  const { make, remote } = setup()
  const journal = make()
  await journal.load()
  const event = await journal.append({ type: 'scan', serial: 'N1', place: 'A1.1' })
  assert.equal(event.id, 'e1')
  assert.equal(event.by, 'anna@example.test')
  assert.equal(event.byName, 'anna')
  assert.equal(typeof event.at, 'number')
  assert.equal(journal.status().pending, 1)
  const result = await journal.flush()
  assert.deepEqual(result, { ok: true, pending: 0 })
  const all = await readAllJournals({ remote, countId: 'count1abc' })
  assert.deepEqual(all.map(item => item.serial), ['N1'])
})

test('the local file survives a restart and nothing is uploaded twice', async () => {
  const { make, remote } = setup()
  const first = make()
  await first.load()
  for (const serial of ['N1', 'N2', 'N3', 'N4']) await first.append({ type: 'scan', serial })
  await first.flush()
  const second = make()
  await second.load()
  assert.deepEqual(second.events().map(item => item.serial), ['N1', 'N2', 'N3', 'N4'])
  assert.equal(second.status().pending, 0)
  const keys = (await remote.keysAsync()).filter(name => name.startsWith('count-count1abc-j-')).sort()
  assert.equal(keys.length, 2, 'four events with chunk size 3 are two chunks')
})

test('events from several writers are merged in time order', async () => {
  const { make, remote } = setup()
  const anna = make('anna@example.test', 'pc1')
  const bo = make('bo@example.test', 'pc2')
  await anna.load(); await bo.load()
  await anna.append({ type: 'scan', serial: 'A1' })
  await bo.append({ type: 'scan', serial: 'B1' })
  await anna.append({ type: 'scan', serial: 'A2' })
  await anna.flush(); await bo.flush()
  const all = await readAllJournals({ remote, countId: 'count1abc' })
  assert.deepEqual(all.map(item => item.serial), ['A1', 'B1', 'A2'])
})

test('full chunks are cached and not read again', async () => {
  const { make, remote, state } = setup()
  const journal = make()
  await journal.load()
  for (let index = 0; index < 7; index++) await journal.append({ type: 'scan', serial: `S${index}` })
  await journal.flush()
  const cache = new Map()
  await readAllJournals({ remote, countId: 'count1abc', cache })
  const before = state.reads
  const all = await readAllJournals({ remote, countId: 'count1abc', cache })
  assert.equal(all.length, 7)
  assert.equal(state.reads - before, 1, 'only the last, unfinished chunk is read again')
})

test('offline: scans are kept locally and uploaded when the drive is back', async () => {
  const { make, remote, state } = setup()
  const journal = make()
  await journal.load()
  state.offline = true
  await journal.append({ type: 'scan', serial: 'N1' })
  const failed = await journal.flush()
  assert.equal(failed.ok, false)
  assert.equal(journal.status().pending, 1)
  state.offline = false
  assert.deepEqual(await journal.flush(), { ok: true, pending: 0 })
  assert.equal((await readAllJournals({ remote, countId: 'count1abc' })).length, 1)
})

test('a lost local file is rebuilt from the drive and never overwrites it with less', async () => {
  const { make, remote, state, root } = setup()
  const first = make()
  await first.load()
  for (const serial of ['N1', 'N2', 'N3', 'N4']) await first.append({ type: 'scan', serial })
  await first.flush()
  fs.rmSync(path.join(root, 'local-pc1'), { recursive: true, force: true })
  state.offline = true
  const second = make()
  await second.load()
  await second.append({ type: 'scan', serial: 'N5' })
  assert.equal((await second.flush()).ok, false)
  state.offline = false
  assert.deepEqual(await second.flush(), { ok: true, pending: 0 })
  const all = await readAllJournals({ remote, countId: 'count1abc' })
  assert.deepEqual(all.map(item => item.serial), ['N1', 'N2', 'N3', 'N4', 'N5'])
  assert.deepEqual(second.events().map(item => item.serial), ['N1', 'N2', 'N3', 'N4', 'N5'])
})

test('writer keys are stable, short and do not reveal the e-mail address', () => {
  const keyA = writerKey('anna@example.test', 'pc1')
  assert.match(keyA, /^[a-f0-9]{12}$/)
  assert.equal(keyA, writerKey('ANNA@example.test', 'pc1'))
  assert.notEqual(keyA, writerKey('anna@example.test', 'pc2'))
})
