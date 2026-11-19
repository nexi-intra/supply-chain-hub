const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createOutbox, QUEUED_METHODS } = require('./outbox.cjs')

const ANNA = { email: 'anna@x.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const down = () => Object.assign(new Error('EIO'), { code: 'EIO' })
const isStorageError = error => ['EIO', 'STORAGE_UNAVAILABLE'].includes(error?.code)

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-'))
  const sap = { up: false, applied: [], refuse: new Set(), runs: 0 }
  const clock = { now: Date.UTC(2026, 9, 20) }
  const failedEvents = []
  const run = async action => {
    sap.runs++
    if (!sap.up) throw down()
    if (sap.refuse.has(action.id)) throw Object.assign(new Error('Pallen er ikke der længere'), { code: 'PALLET_GONE' })
    sap.applied.push(action.id)
    return { ok: action.id }
  }
  return { dir, sap, clock, failedEvents, make: () => createOutbox({ dir, run, isStorageError, now: () => clock.now, onFailed: failed => failedEvents.push(...failed.map(item => item.id)) }) }
}

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
  outbox.acknowledge(['a1'])
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
