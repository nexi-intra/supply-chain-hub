const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createStore } = require('./store.cjs')

function temporaryStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tcd-hub-store-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return { directory, store: createStore(directory) }
}

test('missing keys return undefined', (t) => {
  const { store } = temporaryStore(t)
  assert.equal(store.get('missing'), undefined)
})

test('values survive encrypted writes and reads', (t) => {
  const { store } = temporaryStore(t)
  const value = [{ id: '1', name: 'Vagt' }]

  store.set('shift-roles', value)

  assert.deepEqual(store.get('shift-roles'), value)
})

test('an existing unreadable file throws instead of returning undefined', (t) => {
  const { directory, store } = temporaryStore(t)
  fs.writeFileSync(path.join(directory, 'users.json'), '{not valid json')

  assert.throws(() => store.get('users'))
})

test('repeated writes replace the value without leaving temp files', (t) => {
  const { directory, store } = temporaryStore(t)

  store.set('projects', [{ id: 'old' }])
  store.set('projects', [{ id: 'new' }])

  assert.deepEqual(store.get('projects'), [{ id: 'new' }])
  assert.deepEqual(fs.readdirSync(directory), ['projects.json'])
})

test('update append adds items without replacing existing ones', (t) => {
  const { store } = temporaryStore(t)
  store.set('emails', [{ id: 'a', subject: 'Første' }])

  const result = store.update('emails', { op: 'append', items: [{ id: 'b', subject: 'Anden' }] })

  assert.deepEqual(result.map((e) => e.id), ['a', 'b'])
  assert.deepEqual(store.get('emails').map((e) => e.id), ['a', 'b'])
})

test('update upsert replaces by id and appends unknown ids', (t) => {
  const { store } = temporaryStore(t)
  store.set('vacation-entries', [{ id: 'v1', status: 'pending' }, { id: 'v2', status: 'pending' }])

  store.update('vacation-entries', { op: 'upsert', items: [{ id: 'v1', status: 'approved' }, { id: 'v3', status: 'pending' }] })

  const entries = store.get('vacation-entries')
  assert.equal(entries.find((v) => v.id === 'v1').status, 'approved')
  assert.equal(entries.find((v) => v.id === 'v2').status, 'pending')
  assert.equal(entries.length, 3)
})

test('update remove deletes by id and starts from empty for missing keys', (t) => {
  const { store } = temporaryStore(t)
  store.set('notes', [{ id: 'n1' }, { id: 'n2' }])

  store.update('notes', { op: 'remove', ids: ['n1'] })
  assert.deepEqual(store.get('notes'), [{ id: 'n2' }])

  const fresh = store.update('brand-new', { op: 'append', items: [{ id: 'x' }] })
  assert.deepEqual(fresh, [{ id: 'x' }])
})

test('update releases the lock file even when the operation throws', (t) => {
  const { directory, store } = temporaryStore(t)
  store.set('not-an-array', { id: 'scalar' })

  assert.throws(() => store.update('not-an-array', { op: 'append', items: [{ id: 'x' }] }))
  assert.ok(!fs.readdirSync(directory).some((name) => name.endsWith('.lock')))
})

test('interleaved updates from two store instances keep all items', (t) => {
  const { directory, store } = temporaryStore(t)
  const secondClient = createStore(directory)

  store.update('emails', { op: 'append', items: [{ id: 'client1' }] })
  secondClient.update('emails', { op: 'append', items: [{ id: 'client2' }] })
  store.update('emails', { op: 'append', items: [{ id: 'client1-again' }] })

  assert.deepEqual(store.get('emails').map((e) => e.id), ['client1', 'client2', 'client1-again'])
})

test('scanDirectory reports reachable with an empty snapshot for a fresh directory', (t) => {
  const { store } = temporaryStore(t)
  const result = store.scanDirectory(null)

  assert.equal(result.reachable, true)
  assert.equal(result.snapshot.size, 0)
  assert.deepEqual(result.changedKeys, [])
})

test('scanDirectory reports unreachable when the directory has vanished', (t) => {
  const { directory, store } = temporaryStore(t)
  fs.rmSync(directory, { recursive: true, force: true })

  const result = store.scanDirectory(null)

  assert.equal(result.reachable, false)
  assert.equal(result.snapshot, null)
  assert.deepEqual(result.changedKeys, [])
})

test('scanDirectory detects added, modified and removed keys against a previous snapshot', (t) => {
  const { store } = temporaryStore(t)
  store.set('projects', [{ id: 'p1' }])
  const first = store.scanDirectory(null)
  assert.deepEqual(first.changedKeys.sort(), ['projects'])

  // Ingen ændring siden sidste snapshot.
  const unchanged = store.scanDirectory(first.snapshot)
  assert.deepEqual(unchanged.changedKeys, [])

  store.set('users', { a: 1 })
  const afterAdd = store.scanDirectory(unchanged.snapshot)
  assert.deepEqual(afterAdd.changedKeys, ['users'])

  store.delete('projects')
  const afterRemove = store.scanDirectory(afterAdd.snapshot)
  assert.deepEqual(afterRemove.changedKeys, ['projects'])
})

test('watch reports connection loss and recovery via onConnectionChange', async (t) => {
  const { directory, store } = temporaryStore(t)
  const events = []
  let resolveDisconnected
  let resolveReconnected
  const disconnected = new Promise((resolve) => { resolveDisconnected = resolve })
  const reconnected = new Promise((resolve) => { resolveReconnected = resolve })

  const stop = store.watch(
    () => {},
    (connected) => {
      events.push(connected)
      if (events.length === 1) resolveDisconnected()
      if (events.length === 2) resolveReconnected()
    },
    5000
  )
  t.after(() => stop())

  assert.equal(store.isConnected(), true)
  fs.rmSync(directory, { recursive: true, force: true })

  await disconnected
  assert.deepEqual(events, [false])
  assert.equal(store.isConnected(), false)

  fs.mkdirSync(directory, { recursive: true })
  await reconnected
  assert.deepEqual(events, [false, true])
  assert.equal(store.isConnected(), true)
})