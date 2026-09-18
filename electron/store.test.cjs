const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createStore } = require('./store.cjs')

test('trusted multi-key capabilities read fresh data, lock every key, and expire', t => {
  const { directory, store } = temporaryStore(t), other = createStore(directory)
  store.set('a', { old: true }); other.set('a', { fresh: true })
  let escaped
  store.withLockedKeys(['b', 'a', 'a'], tx => {
    escaped = tx
    assert.deepEqual(tx.get('a'), { fresh: true })
    assert.ok(fs.existsSync(path.join(directory, 'a.json.lock')))
    assert.ok(fs.existsSync(path.join(directory, 'b.json.lock')))
    assert.throws(() => tx.set('unlocked', 1), /Invalid transaction capability/)
    tx.set('b', [1]); tx.delete('a')
  })
  assert.equal(store.get('a'), undefined); assert.deepEqual(store.get('b'), [1])
  assert.throws(() => escaped.get('b'), /Invalid transaction capability/)
  assert.ok(!fs.existsSync(path.join(directory, 'a.json.lock')))
})
test('asynchronous multi-key callbacks are rejected before running and failures release locks', t => {
  const { directory, store } = temporaryStore(t)
  assert.throws(() => store.withLockedKeys(['a'], async tx => { tx.set('a', 'must not write') }), /synchronous/)
  assert.equal(store.get('a'), undefined)
  assert.throws(() => store.withLockedKeys(['a'], () => { throw new Error('synthetic failure') }), /synthetic failure/)
  assert.ok(!fs.existsSync(path.join(directory, 'a.json.lock')))
})

test('trusted migration mutation uses fresh data and releases the lock if backup fails', (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  store.set('items', ['initial'])
  other.set('items', ['initial', 'other'])
  store.mutate('items', current => [...current, 'migration'])
  assert.deepEqual(store.get('items', { skipCache: true }), ['initial', 'other', 'migration'])
  assert.throws(() => store.mutate('items', current => { current.push('must-not-save'); throw new Error('backup failed') }), /backup failed/)
  assert.deepEqual(store.get('items', { skipCache: true }), ['initial', 'other', 'migration'])
  assert.ok(!fs.existsSync(path.join(directory, 'items.json.lock')))
})

test('a compare-and-set replay already applied to the share succeeds without rewriting', (t) => {
  const { store } = temporaryStore(t)
  store.set('setting', 'new')
  assert.equal(store.update('setting', { op: 'compareAndSet', expected: 'old', value: 'new' }), 'new')
  assert.equal(store.get('setting', { skipCache: true }), 'new')
})

test('async twins keep identical semantics: set, update, delete, keys and lock release', async (t) => {
  const { directory, store } = temporaryStore(t)
  await store.setAsync('tasks', [{ id: 'a', text: 'first' }])
  assert.deepEqual(store.get('tasks', { skipCache: true }), [{ id: 'a', text: 'first' }])
  const next = await store.updateAsync('tasks', { op: 'upsert', items: [{ id: 'b', text: 'second' }] })
  assert.deepEqual(next.map(item => item.id), ['a', 'b'])
  // Konflikt-semantik er identisk med den synkrone vej
  await assert.rejects(store.updateAsync('tasks', { op: 'append', items: [{ id: 'a', text: 'DIFFERENT' }] }), { code: 'KV_CONFLICT' })
  await assert.rejects(store.updateAsync('tasks', { op: 'setField', field: 'x', value: 1 }), { code: 'KV_INVALID_OPERATION' })
  // compareAndSet-replay uden omskrivning
  await store.setAsync('setting', 'new')
  assert.equal(await store.updateAsync('setting', { op: 'compareAndSet', expected: 'old', value: 'new' }), 'new')
  assert.ok((await store.keysAsync()).includes('tasks'))
  await store.deleteAsync('tasks')
  assert.equal(store.get('tasks', { skipCache: true }), undefined)
  assert.ok(!fs.existsSync(path.join(directory, 'tasks.json.lock')))
})

test('async update against a nested path preserves the surrounding object', async (t) => {
  const { store } = temporaryStore(t)
  store.set('board', { meta: 'keep', easy: [{ id: 'old', score: 1 }] })
  const result = await store.updateAsync('board', { op: 'upsert', path: ['easy'], items: [{ id: 'new', score: 2 }] })
  assert.deepEqual(result.map(item => item.id), ['old', 'new'])
  assert.equal(store.get('board', { skipCache: true }).meta, 'keep')
})

test('async writes self-heal a provably abandoned lock but never steal a fresh one', async (t) => {
  const { directory, store } = temporaryStore(t)
  const lockFile = path.join(directory, 'tasks.json.lock')
  // Forladt laas (crashet klient): mtime langt over legitim holdetid -> fjernes
  fs.writeFileSync(lockFile, '99999:dead-owner')
  const abandoned = new Date(Date.now() - 10 * 60 * 1000)
  fs.utimesSync(lockFile, abandoned, abandoned)
  await store.setAsync('tasks', [{ id: 'a' }])
  assert.deepEqual(store.get('tasks', { skipCache: true }), [{ id: 'a' }])
  assert.ok(!fs.existsSync(lockFile))
  // Frisk laas (live ejer): stjaeles ALDRIG -> KV_LOCK_BUSY efter forsoegene
  fs.writeFileSync(lockFile, '99999:live-owner')
  await assert.rejects(store.setAsync('tasks', [{ id: 'b' }]), { code: 'KV_LOCK_BUSY' })
  assert.equal(fs.readFileSync(lockFile, 'utf8'), '99999:live-owner')
  assert.deepEqual(store.get('tasks', { skipCache: true }), [{ id: 'a' }])
})

test('append replay is idempotent but cannot overwrite an existing different record', (t) => {
  const { store } = temporaryStore(t)
  const item = { id: 'same', text: 'Synthetic message' }
  store.update('emails', { op: 'append', items: [item] })
  store.update('emails', { op: 'append', items: [item] })
  assert.deepEqual(store.get('emails', { skipCache: true }), [item])
  assert.throws(() => store.update('emails', { op: 'append', items: [{ ...item, text: 'Different message' }] }), { code: 'KV_CONFLICT' })
  assert.deepEqual(store.get('emails', { skipCache: true }), [item])
})

test('renaming an account is one atomic mutation and preserves unrelated accounts', (t) => {
  const { store } = temporaryStore(t)
  const original = { email: 'old@example.com', password: 'synthetic-hash', phone: 'synthetic-phone', status: 'approved' }
  const other = { email: 'other@example.com', password: 'other-synthetic-hash' }
  store.set('users', { 'old@example.com': original, 'other@example.com': other })
  const renamed = { ...original, email: 'new@example.com', fullName: 'Synthetic Name' }
  store.update('users', { op: 'renameField', field: 'old@example.com', newField: 'new@example.com', expected: original, value: renamed })
  const users = store.get('users', { skipCache: true })
  assert.equal(users['old@example.com'], undefined)
  assert.equal(users['new@example.com'].password, original.password)
  assert.equal(users['new@example.com'].phone, original.phone)
  assert.deepEqual(users['other@example.com'], other)
})

test('an account rename rejects an occupied email or a changed source without deleting either account', (t) => {
  const { store } = temporaryStore(t)
  const original = { email: 'old@example.com', password: 'synthetic-hash' }
  const newer = { ...original, status: 'approved' }
  store.set('users', { 'old@example.com': newer, 'taken@example.com': { name: 'Other' } })
  assert.throws(() => store.update('users', { op: 'renameField', field: 'old@example.com', newField: 'new@example.com', expected: original, value: original }), { code: 'KV_CONFLICT' })
  assert.throws(() => store.update('users', { op: 'renameField', field: 'old@example.com', newField: 'taken@example.com', expected: newer, value: newer }), { code: 'KV_CONFLICT' })
  assert.deepEqual(store.get('users', { skipCache: true }), { 'old@example.com': newer, 'taken@example.com': { name: 'Other' } })
})

test('invalid array or field operations cannot empty existing data', (t) => {
  const { store } = temporaryStore(t)
  store.set('items', { retained: true })
  assert.throws(() => store.update('items', { op: 'append', items: [] }), { code: 'KV_INVALID_OPERATION' })
  assert.deepEqual(store.get('items', { skipCache: true }), { retained: true })
  store.set('items', ['retained'])
  assert.throws(() => store.update('items', { op: 'setField', field: 'new', value: true }), { code: 'KV_INVALID_OPERATION' })
  assert.deepEqual(store.get('items', { skipCache: true }), ['retained'])
})

test('compare-and-set rejects a stale snapshot from a second client', (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  store.set('projects', [{ id: 'first' }])
  const snapshot = store.get('projects')
  other.update('projects', { op: 'append', items: [{ id: 'other' }] })
  assert.throws(() => store.update('projects', { op: 'compareAndSet', expected: snapshot, value: [{ id: 'mine' }] }), { code: 'KV_CONFLICT' })
  assert.deepEqual(store.get('projects', { skipCache: true }), [{ id: 'first' }, { id: 'other' }])
})

test('compare-and-set initializes once and preserves an existing value', (t) => {
  const { store } = temporaryStore(t)
  assert.equal(store.update('setting', { op: 'compareAndSet', expected: undefined, value: 'first' }), 'first')
  assert.throws(() => store.update('setting', { op: 'compareAndSet', expected: undefined, value: 'second' }), { code: 'KV_CONFLICT' })
  assert.equal(store.get('setting', { skipCache: true }), 'first')
})

test('replaceItem preserves changes to other items and rejects changes to its own item', (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  const first = { id: 'first', members: [] }
  store.set('projects', [first, { id: 'second', members: [] }])
  other.update('projects', { op: 'upsert', items: [{ id: 'second', members: ['other'] }] })
  store.update('projects', { op: 'replaceItem', id: 'first', expected: first, item: { ...first, members: ['mine'] } })
  assert.deepEqual(store.get('projects', { skipCache: true })[1].members, ['other'])
  assert.throws(() => other.update('projects', { op: 'replaceItem', id: 'first', expected: first, item: first }), { code: 'KV_CONFLICT' })
})

test('unsafe object fields and paths cannot change prototypes', (t) => {
  const { store } = temporaryStore(t)
  assert.throws(() => store.update('users', { op: 'setField', field: '__proto__', value: { polluted: true } }), { code: 'KV_INVALID_OPERATION' })
  assert.throws(() => store.update('items', { op: 'append', path: ['constructor', 'prototype'], items: [] }), { code: 'KV_INVALID_OPERATION' })
  assert.equal({}.polluted, undefined)
  assert.equal(store.get('users'), undefined)
})

function temporaryStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tcd-hub-store-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return { directory, store: createStore(directory) }
}

test('missing keys return undefined', (t) => {
  const { store } = temporaryStore(t)
  assert.equal(store.get('missing'), undefined)
})

test('getAsync mirrors get: decrypts, caches, and reports missing keys as undefined', async (t) => {
  const { store } = temporaryStore(t)
  assert.equal(await store.getAsync('missing'), undefined)
  const value = [{ id: '1', name: 'Vagt' }]
  store.set('shifts', value)
  assert.deepEqual(await store.getAsync('shifts', { skipCache: true }), value)
  assert.deepEqual(await store.getAsync('shifts'), value)
})

test('a watched store serves cached reads long past the short TTL until the watcher sees a change', async (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  store.set('shifts', ['first'])
  assert.deepEqual(await store.getAsync('shifts'), ['first'])
  const changed = []
  const stop = store.watch(keys => changed.push(...keys), () => {}, 1000)
  t.after(() => stop())
  // Klokken skrues 10 s frem: uden watcher ville 3 s-TTL'en have udloebet.
  const realNow = Date.now
  Date.now = () => realNow() + 10000
  t.after(() => { Date.now = realNow })
  other.set('shifts', ['second'])
  // Watcheren har ikke tikket endnu: cachen er stadig gaeldende (ingen rundtur).
  assert.deepEqual(await store.getAsync('shifts'), ['first'])
  await new Promise(resolve => setTimeout(resolve, 1500))
  assert.ok(changed.includes('shifts'), 'watcheren skal melde noeglen aendret')
  assert.deepEqual(await store.getAsync('shifts'), ['second'])
})

test('an unwatched store still expires its cache after the short TTL', async (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  store.set('setting', 'old')
  assert.equal(await store.getAsync('setting'), 'old')
  other.set('setting', 'new')
  const realNow = Date.now
  Date.now = () => realNow() + 3500
  t.after(() => { Date.now = realNow })
  assert.equal(await store.getAsync('setting'), 'new')
})

test('an externally watched store keeps its cache until invalidate() is called', async (t) => {
  const { directory } = temporaryStore(t)
  const users = createStore(directory, { externallyWatched: true })
  const writer = createStore(directory)
  writer.set('users', { a: 1 })
  assert.deepEqual(await users.getAsync('users'), { a: 1 })
  writer.set('users', { a: 2 })
  const realNow = Date.now
  Date.now = () => realNow() + 10000
  t.after(() => { Date.now = realNow })
  assert.deepEqual(await users.getAsync('users'), { a: 1 })
  users.invalidate()
  assert.deepEqual(await users.getAsync('users'), { a: 2 })
})

test('many concurrent getAsync calls run in parallel rather than one at a time', async (t) => {
  const { store } = temporaryStore(t)
  for (let i = 0; i < 12; i++) store.set(`k${i}`, i)
  store.invalidate()
  const values = await Promise.all(Array.from({ length: 12 }, (_, i) => store.getAsync(`k${i}`)))
  assert.deepEqual(values, Array.from({ length: 12 }, (_, i) => i))
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
