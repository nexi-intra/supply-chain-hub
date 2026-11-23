const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createOutbox, QUEUED_METHODS } = require('./outbox.cjs')

const ANNA = { email: 'anna@x.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const down = () => Object.assign(new Error('EIO'), { code: 'EIO' })
const busy = () => Object.assign(new Error('KV_LOCK_BUSY: Lageret er optaget af en anden klient. Prøv igen.'), { code: 'KV_LOCK_BUSY' })
const isStorageError = error => ['EIO', 'STORAGE_UNAVAILABLE'].includes(error?.code)
const isBusyError = error => error?.code === 'KV_LOCK_BUSY'

function setup({ random } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-'))
  // `busy`: how many of the next runs give up on the shared folder's locks (nothing is written then).
  // `before`: awaited at the start of every run (a test holds or inspects a run there). M: itself applies an id once.
  const sap = { up: false, busy: 0, applied: [], refuse: new Set(), runs: 0, before: null }
  const clock = { now: Date.UTC(2026, 9, 20) }
  const failedEvents = []
  const run = async action => {
    sap.runs++
    if (sap.before) await sap.before(action)
    if (!sap.up) throw down()
    if (sap.applied.includes(action.id)) return { duplicate: true }
    if (sap.busy > 0) { sap.busy--; throw busy() }
    if (sap.refuse.has(action.id)) throw Object.assign(new Error('Pallen er ikke der længere'), { code: 'PALLET_GONE' })
    sap.applied.push(action.id)
    return { ok: action.id }
  }
  // Fake timers: `live()` are the retries still scheduled; a test fires one by calling its `fn`.
  const timers = []
  const setTimer = (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer }
  const clearTimer = timer => { timer.cleared = true }
  const live = () => timers.filter(timer => !timer.cleared && !timer.fired)
  const fire = async timer => { timer.fired = true; timer.fn(); await new Promise(resolve => setImmediate(resolve)) }
  const queuedEvents = []
  return { dir, sap, clock, failedEvents, queuedEvents, live, fire, make: (extra = {}) => createOutbox({ dir, run, isStorageError, isBusyError, random, now: () => clock.now, setTimer, clearTimer, onQueued: action => queuedEvents.push(action.id), onFailed: failed => failedEvents.push(...failed.map(item => item.id)), ...extra }) }
}

function deferred() {
  let resolve
  const promise = new Promise(ok => { resolve = ok })
  return { promise, resolve }
}
const onDisk = dir => JSON.parse(fs.readFileSync(path.join(dir, 'locations-outbox.json'), 'utf8'))
// Polls until `check` holds (saves on this PC take a few ms each).
async function until(check, ms = 5000) {
  const holds = () => { try { return check() } catch { return false } }
  for (const end = Date.now() + ms; !holds() && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 5))
}
const eperm = () => Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })

test('only the daily actions can be queued', () => {
  assert.deepEqual([...QUEUED_METHODS].sort(), ['changeSloc', 'editPallet', 'move', 'putAway', 'refill', 'shelfMove', 'shelfPut', 'shelfSet', 'shelfTake', 'take', 'undo'])
})

test('when M: is down the action is queued locally and replayed in order when it is back', async () => {
  const { dir, sap, make } = setup()
  const outbox = make()
  assert.deepEqual(await outbox.submit({ id: 'a1', method: 'putAway', user: ANNA, request: { pallets: [] } }), { queued: true })
  assert.deepEqual(await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: { pallet: 'p1' } }), { queued: true })
  assert.equal(outbox.pending(), 2)
  const reopened = make()
  assert.equal(reopened.pending(), 2, 'the queue survives a restart')
  assert.deepEqual(await reopened.flush(), { done: 0, failed: [] }, 'still down: nothing lost, nothing done')
  sap.up = true
  assert.deepEqual(await reopened.flush(), { done: 2, failed: [] })
  assert.deepEqual(sap.applied, ['a1', 'a2'])
  assert.equal(reopened.pending(), 0)
  assert.deepEqual(await reopened.submit({ id: 'a3', method: 'move', user: ANNA, request: {} }), { queued: false, result: { ok: 'a3' } })
  assert.ok(fs.existsSync(path.join(dir, 'locations-outbox.json')))
})

test('a new action waits behind the queue so the order stays', async () => {
  const { sap, clock, make } = setup()
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} })
  sap.up = true
  clock.now += 31000
  assert.deepEqual(await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} }), { queued: false, result: { ok: 'a2' } })
  assert.deepEqual(sap.applied, ['a1', 'a2'])
})

test('a replayed action that is no longer possible is reported, not retried forever', async () => {
  const { sap, make } = setup()
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: { pallet: 'p1' } })
  await outbox.submit({ id: 'a2', method: 'move', user: ANNA, request: {} })
  sap.up = true
  sap.refuse.add('a1')
  const result = await outbox.flush()
  assert.equal(result.done, 1)
  assert.deepEqual(result.failed.map(item => [item.action.id, item.code]), [['a1', 'PALLET_GONE']])
  assert.equal(outbox.pending(), 0)
  assert.deepEqual(await outbox.flush(), { done: 0, failed: [] })
})

test('the same action id is never applied twice', async () => {
  const { sap, make } = setup()
  sap.up = true
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} })
  assert.deepEqual(await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} }), { queued: false, duplicate: true })
  sap.up = false
  await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} })
  await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} })
  assert.equal(outbox.pending(), 1)
  sap.up = true
  await Promise.all([outbox.flush(), outbox.flush()])
  assert.deepEqual(sap.applied, ['a1', 'a2'])
  assert.deepEqual(await make().submit({ id: 'a2', method: 'take', user: ANNA, request: {} }), { queued: false, duplicate: true }, 'also after a restart')
})

test('other errors are thrown at once and actions that cannot be queued are not queued', async () => {
  const { sap, make } = setup()
  sap.up = true
  sap.refuse.add('a1')
  const outbox = make()
  await assert.rejects(outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} }), { code: 'PALLET_GONE' })
  await assert.rejects(outbox.submit({ id: 'a2', method: 'applyImport', user: ANNA, request: {} }), { code: 'OUTBOX_METHOD_NOT_ALLOWED' })
  await assert.rejects(outbox.submit({ method: 'take', user: ANNA, request: {} }), { code: 'OUTBOX_ID_INVALID' })
  assert.equal(outbox.pending(), 0)
})

test('a replay failure is kept and reported whichever flush finds it, until it is acknowledged', async () => {
  const { sap, clock, failedEvents, make } = setup()
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'putAway', user: ANNA, request: { pallets: [{ location: 'H26', material: 'R162-0717' }] } })
  sap.up = true
  sap.refuse.add('a1')
  clock.now += 31000
  assert.deepEqual(await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} }), { queued: false, result: { ok: 'a2' } }, 'the next action replays the queue itself')
  assert.deepEqual(failedEvents, ['a1'], 'reported although no timer flush ran')
  const kept = make().failures()
  assert.deepEqual(kept.map(item => [item.id, item.method, item.code, item.email, item.team]), [['a1', 'putAway', 'PALLET_GONE', 'anna@x.test', 'TCD']], 'kept across a restart')
  assert.deepEqual(kept[0].request, { pallets: [{ location: 'H26', material: 'R162-0717' }] }, 'with what the action was about')
  await outbox.acknowledge(['a1'])
  assert.deepEqual(make().failures(), [])
})

test('while M: is down a new action is queued without touching M: again until the pause is over', async () => {
  const { sap, clock, make } = setup()
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} })
  const runs = sap.runs
  assert.deepEqual(await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} }), { queued: true })
  assert.equal(sap.runs, runs, 'no new attempt on the dead share')
  sap.up = true
  assert.deepEqual(await outbox.flush(), { done: 2, failed: [] }, 'the timer retry always tries')
  clock.now += 1000
  assert.deepEqual(await outbox.submit({ id: 'a3', method: 'take', user: ANNA, request: {} }), { queued: false, result: { ok: 'a3' } }, 'a successful retry ends the pause')
})

test('a replay that finds M: busy (KV_LOCK_BUSY) keeps the action first in the queue and tries it again; a business error is still final', async () => {
  const { sap, failedEvents, make } = setup()
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'putAway', user: ANNA, request: { pallets: [] } })
  await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: { pallet: 'p1' } })
  await outbox.submit({ id: 'a3', method: 'move', user: ANNA, request: {} })
  sap.up = true
  sap.busy = 1
  assert.deepEqual(await outbox.flush(), { done: 0, failed: [] }, 'nothing done, nothing failed')
  assert.equal(outbox.pending(), 3, 'still queued')
  assert.deepEqual(outbox.failures(), [], 'not kept as a failure')
  assert.deepEqual(failedEvents, [])
  sap.refuse.add('a2')
  const result = await outbox.flush()
  assert.equal(result.done, 2)
  assert.deepEqual(result.failed.map(item => [item.action.id, item.code]), [['a2', 'PALLET_GONE']], 'only the business error fails')
  assert.deepEqual(sap.applied, ['a1', 'a3'], 'a1 stayed first and was applied once')
  assert.equal(outbox.pending(), 0)
})

test('a direct action that finds M: busy (KV_LOCK_BUSY) is queued instead of refused and applied once later', async () => {
  const { sap, make } = setup()
  sap.up = true
  sap.busy = 1
  const outbox = make()
  assert.deepEqual(await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: { pallet: 'p1' } }), { queued: true })
  assert.equal(outbox.pending(), 1)
  assert.deepEqual(await outbox.flush(), { done: 1, failed: [] })
  assert.deepEqual(await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: { pallet: 'p1' } }), { queued: false, duplicate: true })
  assert.deepEqual(sap.applied, ['a1'])
  assert.deepEqual(outbox.failures(), [])
})

test('a direct action waiting behind the queue is queued, not thrown, when its replay finds M: busy', async () => {
  const { sap, clock, make } = setup()
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} })
  sap.up = true
  clock.now += 31000
  sap.busy = 1
  assert.deepEqual(await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} }), { queued: true })
  assert.equal(outbox.pending(), 2)
  assert.deepEqual(await outbox.flush(), { done: 2, failed: [] })
  assert.deepEqual(sap.applied, ['a1', 'a2'])
})

test('after KV_LOCK_BUSY new actions are only queued for a short pause with a random part, so PCs do not retry in step', async () => {
  for (const [random, pause] of [[0, 5000], [0.5, 7500], [0.9999, 9999]]) {
    const { sap, clock, make } = setup({ random: () => random })
    sap.up = true
    sap.busy = 1
    const outbox = make()
    assert.deepEqual(await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} }), { queued: true })
    const runs = sap.runs
    clock.now += pause - 1
    assert.deepEqual(await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} }), { queued: true }, `still paused at ${pause - 1} ms`)
    assert.equal(sap.runs, runs, 'M: is not tried during the pause')
    clock.now += 1
    assert.deepEqual(await outbox.submit({ id: 'a3', method: 'take', user: ANNA, request: {} }), { queued: false, result: { ok: 'a3' } }, `tried again after ${pause} ms`)
    assert.deepEqual(sap.applied, ['a1', 'a2', 'a3'])
  }
})

test('the busy pause draws its random part from Math.random by default', async t => {
  t.mock.method(Math, 'random', () => 0.25)
  const { sap, clock, make } = setup()
  sap.up = true
  sap.busy = 1
  const outbox = make()
  assert.deepEqual(await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} }), { queued: true })
  const runs = sap.runs
  clock.now += 6249
  assert.deepEqual(await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} }), { queued: true })
  assert.equal(sap.runs, runs, '5 s plus a quarter of the 5 s random part')
  clock.now += 1
  assert.deepEqual(await outbox.submit({ id: 'a3', method: 'take', user: ANNA, request: {} }), { queued: false, result: { ok: 'a3' } })
})
test('a busy M: schedules one retry at the random pause, not at the 30 s timer, and the retry replays the queue', async () => {
  const { sap, live, fire, make } = setup({ random: () => 0.5 })
  sap.up = true
  sap.busy = 2
  const outbox = make()
  assert.deepEqual(await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} }), { queued: true })
  assert.deepEqual(live().map(timer => timer.ms), [7500], 'one retry at 5 s plus the random part')
  assert.deepEqual(await outbox.flush(), { done: 0, failed: [] }, 'busy again (e.g. the 30 s timer)')
  assert.deepEqual(live().map(timer => timer.ms), [7500], 'still only one retry pending')
  await fire(live()[0])
  assert.deepEqual(sap.applied, ['a1'], 'the retry itself applied the action')
  assert.equal(outbox.pending(), 0)
  assert.deepEqual(live(), [], 'nothing left scheduled')
})

test('a scheduled busy retry is dropped when a flush succeeds first, when M: goes down and when the outbox is closed', async () => {
  const { sap, live, make } = setup({ random: () => 0 })
  sap.up = true
  sap.busy = 1
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} })
  assert.equal(live().length, 1)
  assert.deepEqual(await outbox.flush(), { done: 1, failed: [] })
  assert.deepEqual(live(), [], 'cleared by the successful flush')
  sap.busy = 1
  await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} })
  assert.equal(live().length, 1)
  sap.up = false
  await outbox.flush()
  assert.deepEqual(live(), [], 'M: down: the 30 s timer is the retry, not a short one')
  sap.up = true
  sap.busy = 1
  await outbox.flush()
  assert.equal(live().length, 1)
  outbox.close()
  assert.deepEqual(live(), [], 'cleared on close')
})

test('every action that ends up queued is announced, so the window shows the waiting banner at once', async () => {
  const { sap, clock, queuedEvents, make } = setup()
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} })
  await outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} })
  sap.up = true
  clock.now += 31000
  sap.busy = 1
  await outbox.submit({ id: 'a3', method: 'take', user: ANNA, request: {} })
  assert.deepEqual(queuedEvents, ['a1', 'a2', 'a3'], 'M: down, inside the pause, and behind a busy queue')
  await outbox.flush()
  await outbox.submit({ id: 'a4', method: 'take', user: ANNA, request: {} })
  assert.deepEqual(queuedEvents, ['a1', 'a2', 'a3'], 'not when the action was done')
})
test('after close a busy replay schedules no new retry, and an old retry does nothing', async () => {
  const { sap, live, fire, make } = setup({ random: () => 0 })
  sap.up = true
  sap.busy = 1
  const outbox = make()
  await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} })
  const old = live()[0]
  outbox.close()
  sap.busy = 1
  assert.deepEqual(await outbox.flush(), { done: 0, failed: [] }, 'a flush still running when the Hub closes')
  assert.deepEqual(live(), [], 'no retry after close')
  const runs = sap.runs
  await fire(old)
  assert.equal(sap.runs, runs, 'a retry that fires after close does not touch M:')
})
test('an action is in the outbox file while it runs (written ahead) and leaves it when M: has it', async () => {
  const { dir, sap, make } = setup()
  sap.up = true
  const outbox = make()
  const seen = []
  sap.before = async action => { seen.push([action.id, onDisk(dir).queue.map(item => item.id), outbox.pending(), outbox.unsettled()]) }
  assert.deepEqual(await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: { pallet: 'p1' } }), { queued: false, result: { ok: 'a1' } })
  assert.deepEqual(seen, [['a1', ['a1'], 0, 1]], 'on disk before it runs; not shown as waiting for M: while a person waits for it')
  assert.deepEqual(onDisk(dir).queue, [], 'gone from the file after success')
  assert.ok(onDisk(dir).applied.includes('a1'))
  assert.equal(outbox.unsettled(), 0)
})

test('an action left in the file by a crash is replayed exactly once at the next start, also when M: already had it', async () => {
  const { dir, sap, make } = setup()
  sap.up = true
  const crashed = make()
  // a1: M: wrote it, then the Hub died before it heard back. a2 (an undo) was written ahead behind it and never ran.
  sap.before = async action => { sap.applied.push(action.id); await new Promise(() => {}) }
  void crashed.submit({ id: 'a1', method: 'take', user: ANNA, request: { pallet: 'p1' } })
  void crashed.submit({ id: 'a2', method: 'undo', user: ANNA, request: { eventId: 'e1' } })
  await until(() => onDisk(dir).queue.length === 2 && sap.runs === 1)
  assert.deepEqual(onDisk(dir).queue.map(item => item.id), ['a1', 'a2'], 'both on disk although neither finished')
  sap.before = null
  const started = make()
  assert.equal(started.pending(), 2, 'both found at the start')
  const runs = sap.runs
  assert.deepEqual(await started.flush(), { done: 2, failed: [] })
  assert.equal(sap.runs - runs, 2)
  assert.deepEqual(sap.applied, ['a1', 'a2'], 'each applied once on M:')
  assert.deepEqual(await started.flush(), { done: 0, failed: [] }, 'not replayed again')
  assert.deepEqual(onDisk(dir).queue, [])
  assert.equal(make().pending(), 0)
})
test('two submits that overlap run one at a time, in the order they were made', async () => {
  const { sap, make } = setup()
  sap.up = true
  const outbox = make()
  const started = []
  const gates = { a1: deferred(), a2: deferred() }
  sap.before = async action => { started.push(action.id); await gates[action.id].promise }
  const one = outbox.submit({ id: 'a1', method: 'putAway', user: ANNA, request: {} })
  const two = outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} })
  await until(() => started.length > 0 && outbox.unsettled() === 2)
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.deepEqual(started, ['a1'], 'the second waits for the first')
  gates.a2.resolve()
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.deepEqual(started, ['a1'], 'also when it could have finished first')
  gates.a1.resolve()
  assert.deepEqual(await one, { queued: false, result: { ok: 'a1' } })
  assert.deepEqual(await two, { queued: false, result: { ok: 'a2' } })
  assert.deepEqual(sap.applied, ['a1', 'a2'])
})

test('a failure of one of two overlapping actions is thrown to its own caller only', async () => {
  const { sap, make } = setup()
  sap.up = true
  sap.refuse.add('a1')
  const outbox = make()
  const one = outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} })
  const two = outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} })
  await assert.rejects(one, { code: 'PALLET_GONE' })
  assert.deepEqual(await two, { queued: false, result: { ok: 'a2' } })
  assert.deepEqual(outbox.failures(), [], 'the person saw it: not kept to report later')
  assert.equal(outbox.unsettled(), 0)
})

test('a rename refused for a moment (EPERM) is tried again; a lasting one refuses the action before it runs', async () => {
  const { dir, sap, make } = setup()
  sap.up = true
  let refusals = 2
  const renames = []
  const rename = async (from, to) => { renames.push(from); if (refusals-- > 0) throw eperm(); return fs.promises.rename(from, to) }
  const outbox = make({ rename, saveRetryMs: 1 })
  assert.deepEqual(await outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} }), { queued: false, result: { ok: 'a1' } })
  assert.ok(renames.length >= 3, 'tried again after EPERM')
  assert.deepEqual(sap.applied, ['a1'])

  refusals = Infinity
  const runs = sap.runs
  await assert.rejects(outbox.submit({ id: 'a2', method: 'take', user: ANNA, request: {} }), { code: 'OUTBOX_SAVE_FAILED' })
  assert.equal(sap.runs, runs, 'never run: it could not be written ahead')
  assert.equal(outbox.unsettled(), 0, 'not kept either')
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.endsWith('.tmp')), [], 'no temp files left behind')
  refusals = 0
  assert.deepEqual(await outbox.submit({ id: 'a3', method: 'take', user: ANNA, request: {} }), { queued: false, result: { ok: 'a3' } })
  assert.deepEqual(onDisk(dir).queue, [])
  assert.deepEqual(sap.applied, ['a1', 'a3'], 'the refused action is never replayed')
})

test('only an action not yet on the disk of this PC holds a close: whenWritten waits for the write-ahead, not for M:', async () => {
  const { sap, make } = setup()
  let release = null
  const rename = async (from, to) => { if (release === null) { await new Promise(resolve => { release = resolve }) } return fs.promises.rename(from, to) }
  const outbox = make({ rename })
  assert.equal(await outbox.whenWritten(1000), true, 'nothing to wait for')
  const submitted = outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} })
  await until(() => release !== null)
  assert.equal(outbox.unwritten(), 1, 'on its way to the disk')
  assert.equal(await outbox.whenWritten(20), false)
  const written = outbox.whenWritten(5000)
  release()
  assert.equal(await written, true)
  assert.deepEqual(await submitted, { queued: true }, 'M: is down: kept here')
  assert.equal(outbox.unwritten(), 0)
  assert.equal(outbox.unsettled(), 1, 'still waiting for M:, but safe on disk')
  assert.equal(await outbox.whenWritten(1000), true, 'closing does not wait for M:')
  sap.up = true
  await outbox.flush()
  assert.equal(outbox.unsettled(), 0)
})

test('a write that fails before the rename (fsync) leaves no temp file and refuses the action', async () => {
  const { dir, sap, make } = setup()
  sap.up = true
  const openFile = async (file, flags) => {
    const handle = await fs.promises.open(file, flags)
    return { writeFile: (...args) => handle.writeFile(...args), close: () => handle.close(), sync: async () => { throw Object.assign(new Error('EIO: i/o error, fsync'), { code: 'EIO' }) } }
  }
  const outbox = make({ openFile })
  await assert.rejects(outbox.submit({ id: 'a1', method: 'take', user: ANNA, request: {} }), { code: 'OUTBOX_SAVE_FAILED' })
  assert.equal(sap.runs, 0)
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.endsWith('.tmp')), [])
})
test('an outbox file from 1.6.7 (without anything new) is read and replayed', async () => {
  const { dir, sap, make } = setup()
  fs.writeFileSync(path.join(dir, 'locations-outbox.json'), JSON.stringify({ queue: [{ id: 'old-1', method: 'take', user: ANNA, request: { pallet: 'p1' }, label: 'Tag', at: 1 }], applied: ['old-0'], failures: [] }))
  sap.up = true
  const outbox = make()
  assert.equal(outbox.pending(), 1)
  assert.deepEqual(await outbox.flush(), { done: 1, failed: [] })
  assert.deepEqual(await outbox.submit({ id: 'old-0', method: 'take', user: ANNA, request: {} }), { queued: false, duplicate: true })
})