const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../store.cjs')
const { createJournal, readAllJournals, readJournals, unsentWriters, writerKey } = require('./journal.cjs')

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-journal-'))
  const store = createStore(path.join(root, 'remote'))
  // `holdWrites` / `holdReads` are optional promises the fake drive waits on, to simulate a slow M:.
  const state = { offline: false, reads: 0, holdWrites: null, holdReads: null, waiting: 0 }
  const hold = async gate => { if (!gate) return; state.waiting++; try { await gate } finally { state.waiting-- } }
  const remote = {
    async setAsync(key, value) { await hold(state.holdWrites); if (state.offline) throw Object.assign(new Error('offline'), { code: 'ENOENT' }); return store.setAsync(key, value) },
    async getAsync(key, options) { await hold(state.holdReads); if (state.offline) throw Object.assign(new Error('offline'), { code: 'EIO' }); state.reads++; return store.getAsync(key, options) },
    async keysAsync() { await hold(state.holdReads); if (state.offline) throw Object.assign(new Error('offline'), { code: 'EIO' }); return store.keysAsync() },
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

function gate() {
  let release
  const promise = new Promise(resolve => { release = resolve })
  return { promise, release }
}
const within = (promise, ms) => Promise.race([promise.then(value => ({ value })), new Promise(resolve => setTimeout(() => resolve('timeout'), ms))])
async function until(check, ms = 2000) {
  const end = Date.now() + ms
  while (!check()) { if (Date.now() > end) throw new Error('condition not reached'); await new Promise(resolve => setTimeout(resolve, 5)) }
}

test('append does not wait for an upload in progress', async () => {
  const { make, remote, state } = setup()
  const journal = make()
  await journal.load()
  await journal.append({ type: 'scan', serial: 'N1' })
  const writes = gate()
  state.holdWrites = writes.promise
  const firstFlush = journal.flush()
  await until(() => state.waiting > 0)
  const second = await within(journal.append({ type: 'scan', serial: 'N2' }), 200)
  assert.notEqual(second, 'timeout', 'append must not wait for the upload to M:')
  assert.equal(second.value.serial, 'N2')
  assert.deepEqual(journal.events().map(item => item.serial), ['N1', 'N2'])
  assert.equal(state.waiting, 1, 'the upload is still blocked')
  state.holdWrites = null
  writes.release()
  assert.equal((await firstFlush).ok, true, 'the first flush uploads what it had')
  assert.equal(journal.status().pending, 1, 'the event appended during the upload is still pending')
  assert.deepEqual(await journal.flush(), { ok: true, pending: 0 })
  const chunk = await remote.getAsync('count-count1abc-j-' + journal.writer + '-0000', { skipCache: true })
  assert.deepEqual(chunk.events.map(item => item.id), ['e1', 'e2'])
  assert.equal(chunk.full, false)
})

test('an append during the remote read of syncFromRemote is kept locally', async () => {
  const { make, remote, state, root } = setup()
  const first = make()
  await first.load()
  for (const serial of ['N1', 'N2']) await first.append({ type: 'scan', serial })
  await first.flush()
  fs.rmSync(path.join(root, 'local-pc1'), { recursive: true, force: true })
  state.offline = true
  const second = make()
  await second.load()
  assert.equal(second.status().online, false, 'the drive was not known at load')
  state.offline = false
  const reads = gate()
  state.holdReads = reads.promise
  const flushing = second.flush()
  await until(() => state.waiting > 0)
  const appended = await within(second.append({ type: 'scan', serial: 'N3' }), 200)
  assert.notEqual(appended, 'timeout', 'append must not wait for the drive read')
  state.holdReads = null
  reads.release()
  assert.deepEqual(await flushing, { ok: true, pending: 0 })
  assert.deepEqual(second.events().map(item => item.serial), ['N1', 'N2', 'N3'])
  state.offline = true
  const third = make()
  await third.load()
  assert.deepEqual(third.events().map(item => item.serial), ['N1', 'N2', 'N3'], 'local file has every event once')
  state.offline = false
  const all = await readAllJournals({ remote, countId: 'count1abc' })
  assert.deepEqual(all.map(item => item.serial), ['N1', 'N2', 'N3'])
})

test('stop() resolves only after an upload already on its way, and writes no further chunks', async () => {
  const { make, remote, state } = setup()
  const journal = make()
  await journal.load()
  for (const serial of ['N1', 'N2', 'N3', 'N4']) await journal.append({ type: 'scan', serial })
  const writes = gate()
  state.holdWrites = writes.promise
  const flushing = journal.flush()
  await until(() => state.waiting > 0)
  const stopped = journal.stop()
  assert.equal(await within(stopped, 100), 'timeout', 'the count may only be removed once the upload in progress is done')
  state.holdWrites = null
  writes.release()
  await stopped
  await flushing
  const keys = (await remote.keysAsync()).filter(name => name.startsWith('count-count1abc-j-'))
  assert.deepEqual(keys.length, 1, 'the second chunk is not written after stop')
})

test('every upload writes a heartbeat in the chunk, and readJournals returns it per writer', async () => {
  const { root, remote } = setup()
  let clock = 50_000
  let ids = 0
  const journal = createJournal({
    countId: 'count1abc', team: 'TCD', user: { email: 'bo@example.test', name: 'Bo' }, deviceId: 'pc2', localDir: path.join(root, 'local-hb'), remote, chunkSize: 3,
    now: () => clock, newId: () => `h${++ids}`, autoFlush: false,
  })
  await journal.load()
  for (const serial of ['N1', 'N2', 'N3', 'N4']) { await journal.append({ type: 'scan', serial }); clock += 1000 }
  clock = 60_000
  await journal.flush()
  const last = await remote.getAsync(`count-count1abc-j-${journal.writer}-0001`, { skipCache: true })
  assert.deepEqual([last.uploadedAt, last.pendingAtUpload, last.lastEventAt], [60_000, 0, 53_000])
  assert.deepEqual(last.events.map(event => event.serial), ['N4'], 'the events are as before')

  const cache = new Map()
  const read = await readJournals({ remote, countId: 'count1abc', cache })
  assert.deepEqual(read.events.map(event => event.serial), ['N1', 'N2', 'N3', 'N4'])
  assert.deepEqual(read.writers, [{ writer: journal.writer, email: 'bo@example.test', name: 'Bo', uploadedAt: 60_000, pendingAtUpload: 0, lastEventAt: 53_000, exitedAt: null }])

  await journal.append({ type: 'scan', serial: 'N5' })
  await journal.append({ type: 'scan', serial: 'N6' })
  clock = 70_000
  await journal.flush()
  const again = await readJournals({ remote, countId: 'count1abc', cache })
  assert.deepEqual([again.writers[0].uploadedAt, again.writers[0].lastEventAt], [70_000, 60_000], 'the newest upload wins')
  const cached = await readJournals({ remote, countId: 'count1abc', cache })
  assert.equal(cached.writers[0].uploadedAt, 70_000, 'a full chunk from the cache keeps its heartbeat')
  assert.deepEqual((await readAllJournals({ remote, countId: 'count1abc' })).length, 6, 'readAllJournals still returns the events only')
})

test('a journal written without a heartbeat (1.6.7) is read as before and has no heartbeat', async () => {
  const { remote } = setup()
  await remote.setAsync('count-count1abc-j-oldclient000-0000', { writer: 'oldclient000', by: 'bo@example.test', full: false, events: [{ id: 'o1', type: 'scan', serial: 'N1', at: 5, by: 'bo@example.test', byName: 'Bo' }] })
  const read = await readJournals({ remote, countId: 'count1abc' })
  assert.deepEqual(read.events.map(event => event.id), ['o1'])
  assert.deepEqual(read.writers, [{ writer: 'oldclient000', email: 'bo@example.test', name: 'Bo', uploadedAt: null, pendingAtUpload: null, lastEventAt: null, exitedAt: null }])
  assert.deepEqual(unsentWriters(read.writers, { now: 10 * 60 * 60 * 1000 }), [], 'without a heartbeat nothing can be said')
})

test('load() sends one heartbeat when the journal has events, so a PC that was away is seen again', async () => {
  const { root, remote } = setup()
  let clock = 50_000
  let ids = 0
  const make = () => createJournal({
    countId: 'count1abc', team: 'TCD', user: { email: 'bo@example.test', name: 'Bo' }, deviceId: 'pc2', localDir: path.join(root, 'local-wake'), remote, chunkSize: 3,
    now: () => clock, newId: () => `w${++ids}`, autoFlush: false,
  })
  const first = make()
  await first.load()
  await first.append({ type: 'scan', serial: 'N1' })
  await first.flush()
  clock = 900_000
  const again = make()
  await again.load()
  await until(() => again.status().lastFlushAt === 900_000)
  const writer = (await readJournals({ remote, countId: 'count1abc' })).writers[0]
  assert.deepEqual([writer.uploadedAt, writer.pendingAtUpload], [900_000, 0])

  const empty = createJournal({ countId: 'count1abc', team: 'TCD', user: { email: 'cara@example.test', name: 'Cara' }, deviceId: 'pc3', localDir: path.join(root, 'local-empty'), remote, autoFlush: false, now: () => clock })
  await empty.load()
  assert.equal(empty.status().lastFlushAt, null, 'nothing to send for a PC without events')
})

test('a flush with nothing new still sends a fresh heartbeat, also when the last chunk is full; close() marks a clean exit', async () => {
  const { root, remote } = setup()
  let clock = 50_000
  let ids = 0
  const journal = createJournal({
    countId: 'count1abc', team: 'TCD', user: { email: 'bo@example.test', name: 'Bo' }, deviceId: 'pc2', localDir: path.join(root, 'local-ka'), remote, chunkSize: 3,
    now: () => clock, newId: () => `k${++ids}`, autoFlush: false,
  })
  await journal.load()
  for (const serial of ['N1', 'N2']) await journal.append({ type: 'scan', serial })
  await journal.flush()
  const cache = new Map()
  clock = 400_000
  await journal.flush()
  assert.equal((await readJournals({ remote, countId: 'count1abc', cache })).writers[0].uploadedAt, 400_000, 'the partial chunk is written again')

  await journal.append({ type: 'scan', serial: 'N3' })
  await journal.flush()
  await readJournals({ remote, countId: 'count1abc', cache })
  clock = 700_000
  await journal.flush()
  const read = await readJournals({ remote, countId: 'count1abc', cache })
  assert.deepEqual([read.writers[0].uploadedAt, read.writers[0].pendingAtUpload, read.events.length], [700_000, 0, 3], 'a full last chunk gets an empty chunk after it, holding the heartbeat')

  clock = 800_000
  await journal.close()
  const closed = (await readJournals({ remote, countId: 'count1abc', cache })).writers[0]
  assert.deepEqual([closed.uploadedAt, closed.exitedAt], [800_000, 800_000])
  assert.equal((await readAllJournals({ remote, countId: 'count1abc' })).length, 3, 'no events are added or lost')
})

test('unsentWriters: behind at its last upload, or no heartbeat for over 15 minutes without a clean exit', () => {
  const MIN = 60 * 1000
  const now = 600 * MIN
  const writer = (name, fields) => ({ writer: `w-${name}`, email: `${name}@example.test`, name, exitedAt: null, ...fields })
  const writers = [
    writer('synced', { uploadedAt: now - 2 * MIN, pendingAtUpload: 0, lastEventAt: now - 20 * MIN }),
    writer('behind', { uploadedAt: now - 5 * MIN, pendingAtUpload: 3, lastEventAt: now - 5 * MIN }),
    writer('fresh', { uploadedAt: now - 10 * 1000, pendingAtUpload: 2, lastEventAt: now - 10 * 1000 }),
    writer('between', { uploadedAt: now - 14 * MIN, pendingAtUpload: 0, lastEventAt: now - 30 * MIN }),
    writer('silent', { uploadedAt: now - 18 * MIN, pendingAtUpload: 0, lastEventAt: now - 18 * MIN }),
    writer('gone', { uploadedAt: now - 300 * MIN, pendingAtUpload: 0, lastEventAt: now - 300 * MIN }),
    writer('exited', { uploadedAt: now - 300 * MIN, pendingAtUpload: 0, lastEventAt: now - 300 * MIN, exitedAt: now - 300 * MIN }),
    writer('me', { uploadedAt: now - 30 * MIN, pendingAtUpload: 4, lastEventAt: now - 30 * MIN }),
    writer('legacy', { uploadedAt: null, pendingAtUpload: null, lastEventAt: null }),
  ]
  assert.deepEqual(unsentWriters(writers, { now, exclude: ['w-me'] }).map(item => [item.writer, item.since, item.pending]), [
    ['w-gone', now - 300 * MIN, 0],
    ['w-silent', now - 18 * MIN, 0],
    ['w-behind', now - 5 * MIN, 3],
  ], 'oldest first; a running upload, a clean exit and this PC are left out')
})

test('unsentWriters on a closed count: judged at the close, and a PC in sync after the close is left out', () => {
  const MIN = 60 * 1000
  const closedAt = 600 * MIN
  const now = closedAt + 15 * MIN
  const writer = (name, fields) => ({ writer: `w-${name}`, email: `${name}@example.test`, name, exitedAt: null, ...fields })
  const writers = [
    writer('owner', { uploadedAt: closedAt - 50, pendingAtUpload: 0, lastEventAt: closedAt - 60 }),
    writer('alive', { uploadedAt: closedAt - 4 * MIN, pendingAtUpload: 0, lastEventAt: closedAt - 30 * MIN }),
    writer('caughtUp', { uploadedAt: closedAt + 5 * MIN, pendingAtUpload: 0, lastEventAt: closedAt - MIN }),
    writer('behind', { uploadedAt: closedAt - 4 * MIN, pendingAtUpload: 2, lastEventAt: closedAt - 4 * MIN }),
    writer('between', { uploadedAt: closedAt - 12 * MIN, pendingAtUpload: 0, lastEventAt: closedAt - 12 * MIN }),
    writer('silent', { uploadedAt: closedAt - 16 * MIN, pendingAtUpload: 0, lastEventAt: closedAt - 16 * MIN }),
  ]
  assert.deepEqual(unsentWriters(writers, { now, closedAt }).map(item => item.writer), ['w-silent', 'w-behind'])
})

test('writer keys are stable, short and do not reveal the e-mail address', () => {
  const keyA = writerKey('anna@example.test', 'pc1')
  assert.match(keyA, /^[a-f0-9]{12}$/)
  assert.equal(keyA, writerKey('ANNA@example.test', 'pc1'))
  assert.notEqual(keyA, writerKey('anna@example.test', 'pc2'))
})
