const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createStore, decideWatchTick, whenWritesSettled } = require('./store.cjs')

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

test('withLockedKeysAsync: fresh data, every key locked, writes and deletes applied, capabilities expire', async t => {
  const { directory, store } = temporaryStore(t), other = createStore(directory)
  store.set('a', { old: true }); other.set('a', { fresh: true })
  let escaped
  const result = await store.withLockedKeysAsync(['b', 'a', 'a'], tx => {
    escaped = tx
    assert.deepEqual(tx.get('a'), { fresh: true })
    assert.ok(fs.existsSync(path.join(directory, 'a.json.lock')))
    assert.ok(fs.existsSync(path.join(directory, 'b.json.lock')))
    assert.throws(() => tx.set('unlocked', 1), /Invalid transaction capability/)
    tx.set('b', [1]); tx.delete('a')
    assert.deepEqual(tx.get('b'), [1], 'a value set in the transaction is read back')
    assert.equal(tx.get('a'), undefined)
    return 'done'
  })
  assert.equal(result, 'done')
  assert.equal(store.get('a', { skipCache: true }), undefined); assert.deepEqual(other.get('b', { skipCache: true }), [1])
  assert.throws(() => escaped.get('b'), /Invalid transaction capability/)
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.lock') || name.endsWith('.tmp')), [])
})

test('withLockedKeysAsync: a failing or asynchronous transaction writes nothing and releases its locks', async t => {
  const { directory, store } = temporaryStore(t)
  store.set('a', 1)
  await assert.rejects(store.withLockedKeysAsync(['a'], async tx => { tx.set('a', 'must not write') }), /synchronous/)
  await assert.rejects(store.withLockedKeysAsync(['a', 'b'], tx => { tx.set('a', 2); tx.set('b', 2); throw new Error('synthetic failure') }), /synthetic failure/)
  assert.equal(store.get('a', { skipCache: true }), 1)
  assert.equal(store.get('b', { skipCache: true }), undefined)
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.lock') || name.endsWith('.tmp')), [])
})

test('withLockedKeysAsync keeps the event loop running: a write to M: takes seconds and must not freeze the app', async t => {
  const { store } = temporaryStore(t)
  let ticked = false
  let sawTick = false
  setImmediate(() => { ticked = true })
  await store.withLockedKeysAsync(['a'], tx => { sawTick = ticked; tx.set('a', 1) })
  assert.equal(sawTick, true)
})

test('withLockedKeysAsync does not hold its other locks while it waits for a busy one, and goes on when it is free', async t => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  const busy = path.join(directory, 'b.json.lock')
  fs.writeFileSync(busy, 'another-pc:owner')
  const done = store.withLockedKeysAsync(['a', 'b'], tx => { tx.set('a', `${tx.get('a')}+A`); tx.set('b', 'B') })
  // Holding a while waiting for b would block this until b is free (or the lock retries run out, ~7 s); it must get through now.
  const startedAt = Date.now()
  await other.withLockedKeysAsync(['a'], tx => { tx.set('a', 'other') })
  assert.ok(Date.now() - startedAt < 3000, `the other client waited ${Date.now() - startedAt} ms for a`)
  assert.ok(fs.existsSync(busy), 'b is still busy, so the first transaction is still waiting')
  fs.unlinkSync(busy)
  await done
  assert.deepEqual([store.get('a', { skipCache: true }), store.get('b', { skipCache: true })], ['other+A', 'B'])
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

test('whenWritesSettled resolves true once pending writes finish', async (t) => {
  const { store } = temporaryStore(t)
  const write = store.setAsync('pending', { value: 42 })
  assert.equal(await whenWritesSettled(5000), true)
  assert.deepEqual(store.get('pending', { skipCache: true }), { value: 42 })
  await write
})

test('whenWritesSettled resolves false when the timeout passes first', async (t) => {
  const { directory, store } = temporaryStore(t)
  const lockFile = path.join(directory, 'held.json.lock')
  fs.writeFileSync(lockFile, '99999:other-owner')
  const write = store.setAsync('held', 1)
  const started = Date.now()
  assert.equal(await whenWritesSettled(100), false)
  assert.ok(Date.now() - started < 200, `took ${Date.now() - started} ms`)
  fs.rmSync(lockFile, { force: true })
  await write
  assert.equal(await whenWritesSettled(1000), true)
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

test('mutateAsync reads, changes and writes under one lock, skips on undefined and serializes concurrent callers', async (t) => {
  const { directory, store } = temporaryStore(t)
  assert.deepEqual(await store.mutateAsync('counter', current => (current === undefined ? { n: 1 } : undefined)), { n: 1 })
  assert.deepEqual(await store.getAsync('counter', { skipCache: true }), { n: 1 })
  assert.equal(await store.mutateAsync('counter', () => undefined), undefined)
  assert.deepEqual(await store.getAsync('counter', { skipCache: true }), { n: 1 })

  const other = createStore(directory)
  await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? other : store).mutateAsync('counter', current => ({ n: current.n + 1 }))))
  assert.deepEqual(await store.getAsync('counter', { skipCache: true }), { n: 9 })
  assert.ok(!fs.existsSync(path.join(directory, 'counter.json.lock')))

  await assert.rejects(store.mutateAsync('counter', async () => ({ n: 0 })), /synchronous/)
  await assert.rejects(store.mutateAsync('counter', () => { throw new Error('nope') }), /nope/)
  assert.deepEqual(await store.getAsync('counter', { skipCache: true }), { n: 9 })
  assert.ok(!fs.existsSync(path.join(directory, 'counter.json.lock')))
})

const fileMtime = (directory, key) => fs.statSync(path.join(directory, `${key}.json`)).mtimeMs
const assertNoLeftovers = (directory) => {
  const left = fs.readdirSync(directory)
  assert.ok(!left.some(name => name.endsWith('.tmp')), `tmp left: ${left}`)
  assert.ok(!left.some(name => name.endsWith('.lock')), `lock left: ${left}`)
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

test('updateAsync with an unchanged field value does not rewrite the file', async (t) => {
  const { directory, store } = temporaryStore(t)
  await store.setAsync('client-versions', { a: { v: 1 } })
  const before = fileMtime(directory, 'client-versions')
  await pause(25)
  assert.deepEqual(await store.updateAsync('client-versions', { op: 'setField', field: 'a', value: { v: 1 } }), { a: { v: 1 } })
  assert.deepEqual((await store.updateDetailedAsync('client-versions', { op: 'setField', field: 'a', value: { v: 1 } })).value, { a: { v: 1 } })
  assert.deepEqual(store.update('client-versions', { op: 'setField', field: 'a', value: { v: 1 } }), { a: { v: 1 } })
  assert.equal(fileMtime(directory, 'client-versions'), before)
  assert.deepEqual(await store.getAsync('client-versions'), { a: { v: 1 } })
  assertNoLeftovers(directory)
})

test('mutateAsync returning an equal value does not rewrite the file', async (t) => {
  const { directory, store } = temporaryStore(t)
  const value = { n: 3, list: [1, 2] }
  await store.setAsync('counter', value)
  const before = fileMtime(directory, 'counter')
  await pause(25)
  assert.deepEqual(await store.mutateAsync('counter', current => structuredClone(current)), value)
  assert.deepEqual(store.mutate('counter', current => structuredClone(current)), value)
  assert.equal(fileMtime(directory, 'counter'), before)
  assertNoLeftovers(directory)
})

test('upsert of an identical item does not rewrite the file', async (t) => {
  const { directory, store } = temporaryStore(t)
  const sameItem = { id: '1', name: 'Vagt' }
  await store.setAsync('shifts', [sameItem, { id: '2', name: 'Anden' }])
  const before = fileMtime(directory, 'shifts')
  await pause(25)
  assert.deepEqual(await store.updateAsync('shifts', { op: 'upsert', items: [sameItem] }), [sameItem, { id: '2', name: 'Anden' }])
  assert.deepEqual(store.update('shifts', { op: 'upsert', items: [sameItem] }), [sameItem, { id: '2', name: 'Anden' }])
  assert.equal(fileMtime(directory, 'shifts'), before)
  assertNoLeftovers(directory)
})

test('a real change is still written', async (t) => {
  const { directory, store } = temporaryStore(t)
  await store.setAsync('client-versions', { a: { v: 1 } })
  const before = fileMtime(directory, 'client-versions')
  await pause(25)
  assert.deepEqual(await store.updateAsync('client-versions', { op: 'setField', field: 'a', value: { v: 2 } }), { a: { v: 2 } })
  assert.notEqual(fileMtime(directory, 'client-versions'), before)
  assert.deepEqual(await store.getAsync('client-versions', { skipCache: true }), { a: { v: 2 } })
  const mid = fileMtime(directory, 'client-versions')
  await pause(25)
  assert.deepEqual(await store.mutateAsync('client-versions', current => { current.a.v = 3; return current }), { a: { v: 3 } })
  assert.notEqual(fileMtime(directory, 'client-versions'), mid)
  assert.deepEqual(await store.getAsync('client-versions', { skipCache: true }), { a: { v: 3 } })
  assertNoLeftovers(directory)
})

test('sweepStaleTempFilesAsync removes only temp files that are old by both name and mtime', async (t) => {
  const { directory, store } = temporaryStore(t)
  store.set('index', { ok: true })
  const day = 24 * 60 * 60 * 1000
  const old = Date.now() - 2 * day
  const write = (name, mtimeMs) => {
    const file = path.join(directory, name)
    fs.writeFileSync(file, 'x')
    fs.utimesSync(file, new Date(mtimeMs), new Date(mtimeMs))
    return name
  }
  const stale = write(`index.json.123.${old}.deadbeef.tmp`, old)
  const freshName = write(`index.json.123.${Date.now()}.deadbeef.tmp`, old)
  const freshMtime = write(`index.json.123.${old}.cafebabe.tmp`, Date.now())
  const foreign = write('notes.tmp', old)

  assert.deepEqual(await store.sweepStaleTempFilesAsync(), [stale])
  const left = fs.readdirSync(directory)
  for (const name of [freshName, freshMtime, foreign, 'index.json']) assert.ok(left.includes(name), name)
  assert.ok(!left.includes(stale))
  assert.deepEqual(store.get('index'), { ok: true })
})

test('getAsync mirrors get: decrypts, caches, and reports missing keys as undefined', async (t) => {
  const { store } = temporaryStore(t)
  assert.equal(await store.getAsync('missing'), undefined)
  const value = [{ id: '1', name: 'Vagt' }]
  store.set('shifts', value)
  assert.deepEqual(await store.getAsync('shifts', { skipCache: true }), value)
  assert.deepEqual(await store.getAsync('shifts'), value)
})

test('dumpAllAsync can skip keys BEFORE reading them, so a filtered backup stays cheap', async (t) => {
  const { store } = temporaryStore(t)
  store.set('shifts', [{ id: '1' }])
  store.set('file_a_meta', { size: 1 })
  store.set('file_a_chunk_0', 'AAAA')
  const reads = []
  const counting = key => { reads.push(key); return !key.startsWith('file_') }

  assert.deepEqual(Object.keys(await store.dumpAllAsync()).sort(), ['file_a_chunk_0', 'file_a_meta', 'shifts'])

  reads.length = 0
  const filtered = await store.dumpAllAsync(counting)
  assert.deepEqual(Object.keys(filtered), ['shifts'])
  // Filteret skal spare selve LAESNINGEN - ellers er der ingen gevinst over SMB.
  assert.deepEqual(reads.sort(), ['file_a_chunk_0', 'file_a_meta', 'shifts'])
  assert.deepEqual(filtered.shifts, [{ id: '1' }])
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

test('an unthrottled getAsync skips the read-slot queue while every slot is held by slow reads', async (t) => {
  const { store } = temporaryStore(t)
  for (let i = 0; i < 6; i++) store.set(`slow${i}`, i)
  store.set('control', 'ok')
  store.invalidate()
  const readFile = fs.promises.readFile
  let release
  const gate = new Promise(resolve => { release = resolve })
  t.mock.method(fs.promises, 'readFile', async (file, ...rest) => {
    if (path.basename(file).startsWith('slow')) await gate
    return readFile(file, ...rest)
  })
  t.after(() => release())
  const order = []
  const slow = Array.from({ length: 6 }, (_, i) => store.getAsync(`slow${i}`).then(() => order.push(`slow${i}`)))
  const fast = store.getAsync('control', { skipCache: true, unthrottled: true }).then(value => { order.push('control'); return value })
  const winner = await Promise.race([fast, sleep(1000).then(() => 'timeout')])
  assert.equal(winner, 'ok')
  assert.deepEqual(order, ['control'])
  release()
  await Promise.all(slow)
})

test('without the option a read still waits for a free read slot', async (t) => {
  const { store } = temporaryStore(t)
  for (let i = 0; i < 6; i++) store.set(`slow${i}`, i)
  store.set('control', 'ok')
  store.invalidate()
  const readFile = fs.promises.readFile
  let release
  const gate = new Promise(resolve => { release = resolve })
  t.mock.method(fs.promises, 'readFile', async (file, ...rest) => {
    if (path.basename(file).startsWith('slow')) await gate
    return readFile(file, ...rest)
  })
  t.after(() => release())
  const slow = Array.from({ length: 6 }, (_, i) => store.getAsync(`slow${i}`))
  const result = await Promise.race([store.getAsync('control', { skipCache: true }), sleep(150).then(() => 'queued')])
  assert.equal(result, 'queued')
  release()
  await Promise.all(slow)
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
test('watch scans mutable keys with bounded stat calls and ignores immutable files', async (t) => {
  const { directory, store } = temporaryStore(t)
  for (let index = 0; index < 16; index++) store.set(`setting-${index}`, index)
  store.set('file_attachment_meta', { size: 1 })
  store.set('file_attachment_chunk_0', 'data')
  const first = store.scanDirectory(null)
  assert.equal(first.snapshot.size, 18)
  const stat = fs.promises.stat
  let concurrent = 0
  let maximum = 0
  const paths = []
  t.mock.method(fs.promises, 'stat', async file => {
    paths.push(path.basename(file))
    concurrent++
    maximum = Math.max(maximum, concurrent)
    try {
      await new Promise(resolve => setTimeout(resolve, 3))
      return await stat(file)
    } finally { concurrent-- }
  })
  store.set('setting-1', 'changed')
  const changed = await store.scanDirectoryAsync(first.snapshot)
  assert.deepEqual(changed.changedKeys, ['setting-1'])
  assert.ok(maximum <= 4)
  assert.ok(maximum > 1)
  assert.equal(paths.length, 16)
  assert.ok(paths.every(file => !file.startsWith('file_attachment')))
  assert.equal(changed.snapshot.size, 18)
  store.delete('file_attachment_chunk_0')
  const afterRemoval = await store.scanDirectoryAsync(changed.snapshot)
  assert.deepEqual(afterRemoval.changedKeys, ['file_attachment_chunk_0'])
  assert.ok(fs.existsSync(path.join(directory, 'file_attachment_meta.json')))
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

test('decideWatchTick skips an unchanged directory, scans on change, defers within the gap and runs the safety scan', () => {
  const config = { safetyScanMs: 30000, hiddenSafetyScanMs: 120000, minScanGapMs: 2000 }
  const base = { visible: true, dirMtimeMs: 100, lastDirMtimeMs: 100, nowMs: 100000, lastFullScanAtMs: 99000, lastChangeScanAtMs: null, forceFull: false }
  const cases = [
    [{}, 'skip'],
    [{ dirMtimeMs: 200, lastChangeScanAtMs: 99500 }, 'defer'],
    [{ dirMtimeMs: 200, lastChangeScanAtMs: 97500 }, 'full'],
    [{ lastFullScanAtMs: 70000 }, 'full'],
    [{ lastFullScanAtMs: 70000, visible: false }, 'skip'],
    [{ forceFull: true, lastChangeScanAtMs: 99500 }, 'full'],
  ]
  for (const [overrides, expected] of cases) {
    assert.equal(decideWatchTick({ ...base, ...overrides }, config), expected, JSON.stringify(overrides))
  }
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('an unchanged directory is not rescanned file by file', async (t) => {
  const { directory, store } = temporaryStore(t)
  for (let index = 0; index < 20; index++) store.set(`setting-${index}`, index)
  const stat = fs.promises.stat
  let fileStats = 0
  t.mock.method(fs.promises, 'stat', async (file, ...rest) => {
    if (path.resolve(file) !== path.resolve(directory)) fileStats++
    return stat(file, ...rest)
  })
  const stop = store.watch(() => {}, () => {}, { intervalMs: 30, safetyScanMs: 60000 })
  t.after(() => stop())
  await sleep(200)
  assert.equal(fileStats, 0)
})

test('a write from another store instance is reported on the next tick', async (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  const changed = []
  const stop = store.watch(keys => changed.push(...keys), () => {}, { intervalMs: 30, minScanGapMs: 0 })
  t.after(() => stop())
  other.set('k', 1)
  for (let waited = 0; waited < 500 && !changed.includes('k'); waited += 10) await sleep(10)
  assert.ok(changed.includes('k'))
})

test('watch with initialScan async does no synchronous directory or file I/O and still reports a later change', async (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  for (let index = 0; index < 5; index++) store.set(`setting-${index}`, index)
  let syncCalls = 0, syncScans = 0
  const readdirSync = fs.readdirSync, statSync = fs.statSync
  const isScan = target => path.resolve(String(target)) === path.resolve(directory)
  t.mock.method(fs, 'readdirSync', (target, ...rest) => { syncCalls++; if (isScan(target)) syncScans++; return readdirSync(target, ...rest) })
  t.mock.method(fs, 'statSync', (target, ...rest) => { syncCalls++; if (isScan(target)) syncScans++; return statSync(target, ...rest) })
  const changed = []
  const stop = store.watch(keys => changed.push(...keys), () => {}, { intervalMs: 20, minScanGapMs: 0, initialScan: 'async' })
  t.after(() => stop())
  assert.equal(syncCalls, 0, 'watch() returns before any synchronous scan')
  assert.equal(store.isConnected(), true, 'connection stays optimistic while the first scan runs')
  await sleep(150)
  assert.deepEqual(changed, [], 'the initial scan reports nothing')
  other.set('setting-1', 'changed')
  for (let waited = 0; waited < 1000 && !changed.includes('setting-1'); waited += 10) await sleep(10)
  assert.ok(changed.includes('setting-1'))
  assert.equal(syncScans, 0, 'the watcher never scans the directory synchronously')
})

test('a directory change that touched no data file does not start the change-scan gap', async (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  store.set('existing', 1)
  const changed = []
  const stop = store.watch(keys => changed.push(...keys), () => {}, { intervalMs: 20, safetyScanMs: 60000, minScanGapMs: 5000 })
  t.after(() => stop())
  await sleep(60)
  // Kun en laasefil kommer og gaar: mappens mtime skifter, men ingen noegle er aendret.
  const lock = path.join(directory, 'existing.json.lock')
  fs.writeFileSync(lock, 'x'); fs.unlinkSync(lock)
  await sleep(150)
  assert.deepEqual(changed, [])
  other.set('k', 1)
  for (let waited = 0; waited < 1500 && !changed.includes('k'); waited += 10) await sleep(10)
  assert.ok(changed.includes('k'), 'the real write is not deferred by the lock-only scan')
})

test('the safety scan finds a change that left the directory mtime untouched', async (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  // Hele sekunder, saa utimes kan saette praecis samme mtime tilbage.
  const previous = new Date(Math.floor(Date.now() / 1000) * 1000 - 60000)
  fs.utimesSync(directory, previous, previous)
  const changed = []
  const watchStartedAt = Date.now()
  const stop = store.watch(keys => changed.push(...keys), () => {}, { intervalMs: 20, safetyScanMs: 1000, minScanGapMs: 0 })
  t.after(() => stop())
  other.set('k', 2)
  fs.utimesSync(directory, previous, previous)
  const writtenAt = Date.now()
  await sleep(Math.max(0, writtenAt + 100 - Date.now()))
  // Kun meningsfuldt hvis sikkerheds-scannen (1 s efter watch-start) ikke kan vaere naaet endnu.
  if (Date.now() - watchStartedAt < 1000) assert.ok(!changed.includes('k'), 'mappens mtime er uaendret: ingen scanning endnu')
  for (let waited = 0; waited < 3000 && !changed.includes('k'); waited += 20) await sleep(20)
  assert.ok(changed.includes('k'), 'sikkerheds-scannen skal finde aendringen')
})

test('a hidden watcher slows down and becoming visible scans at once', async (t) => {
  const { directory, store } = temporaryStore(t)
  const other = createStore(directory)
  const changed = []
  const stop = store.watch(keys => changed.push(...keys), () => {}, { intervalMs: 20, hiddenIntervalMs: 5000, hiddenSafetyScanMs: 60000 })
  t.after(() => stop())
  store.setWatchVisibility(false)
  other.set('k', 3)
  await sleep(150)
  assert.ok(!changed.includes('k'), 'skjult watcher tikker kun hvert 5. sekund')
  store.setWatchVisibility(true)
  for (let waited = 0; waited < 100 && !changed.includes('k'); waited += 5) await sleep(5)
  assert.ok(changed.includes('k'), 'synlig igen: scanner med det samme')
})

test('setWatchVisibility is safe before watch() and after stop', (t) => {
  const { store } = temporaryStore(t)
  store.setWatchVisibility(false)
  const stop = store.watch(() => {}, () => {}, { intervalMs: 20 })
  stop()
  store.setWatchVisibility(true)
  store.setWatchVisibility(false)
})

test('statAsync reports a key file change marker without reading it, and undefined when missing', async (t) => {
  const { store } = temporaryStore(t)
  assert.equal(await store.statAsync('missing'), undefined)
  await store.setAsync('game', { revision: 1 })
  const first = await store.statAsync('game')
  assert.ok(first.size > 0 && first.mtimeMs > 0)
  await new Promise(resolve => setTimeout(resolve, 20))
  await store.setAsync('game', { revision: 2, more: 'data' })
  const second = await store.statAsync('game')
  assert.ok(second.mtimeMs !== first.mtimeMs || second.size !== first.size)
})

// ---------- A save writes into a prepared temp file instead of creating one (creating a file on M: costs 2-15 s) ----------
const { createPreparedFiles: createPreparedFilesForStore, PREPARED_FILE_PATTERN } = require('./preparedFiles.cjs')
async function preparedStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-store-prepared-'))
  const pool = createPreparedFilesForStore()
  t.after(async () => { await pool.closeAll(); fs.rmSync(directory, { recursive: true, force: true }) })
  pool.want(directory, 2)
  await pool.whenIdle()
  return { directory, pool, store: createStore(directory, { preparedFiles: pool }) }
}

test('a save with a prepared temp file creates no new file during the save', async t => {
  const { store } = await preparedStore(t)
  const opened = []
  const realOpen = fs.promises.open
  t.mock.method(fs.promises, 'open', (file, flags, ...rest) => { opened.push([path.basename(String(file)), flags]); return realOpen(file, flags, ...rest) })
  await store.setAsync('k', { a: 1 })
  t.mock.restoreAll()
  const tmpOpens = opened.filter(([name]) => name.endsWith('.tmp'))
  // The save itself writes into a prepared file; the pool may make the next one ready in the background meanwhile.
  assert.ok(tmpOpens.some(([name, flags]) => PREPARED_FILE_PATTERN.test(name) && flags === 'r+'), JSON.stringify(tmpOpens))
  assert.ok(!tmpOpens.some(([name]) => /\.json\.\d+\.\d+\.[0-9a-f]{8}\.tmp$/.test(name)), 'no temp file is created the old way')
  assert.ok(tmpOpens.filter(([, flags]) => flags !== 'r+').every(([name]) => name.startsWith('~hub-prep-')), JSON.stringify(tmpOpens))
  assert.deepEqual(await store.getAsync('k', { skipCache: true }), { a: 1 })
})

test('a failed write into a prepared file is never reused, and the save is done the ordinary way', async t => {
  const { store, pool, directory } = await preparedStore(t)
  await store.setAsync('k', { v: 'old' })
  await pool.whenIdle()
  const ready = fs.readdirSync(directory).filter(name => name.startsWith('~hub-prep-'))
  const realOpen = fs.promises.open
  let failed = null
  t.mock.method(fs.promises, 'open', async (file, flags, ...rest) => {
    const handle = await realOpen(file, flags, ...rest)
    if (flags === 'r+' && !failed && String(file).endsWith('.tmp')) {
      failed = path.basename(String(file))
      handle.write = async () => { throw Object.assign(new Error('disk trouble'), { code: 'EIO' }) }
    }
    return handle
  })
  await store.setAsync('k', { v: 'new' })
  t.mock.restoreAll()
  assert.ok(ready.includes(failed), 'the failing write was into a prepared file')
  assert.deepEqual(await store.getAsync('k', { skipCache: true }), { v: 'new' })
  await pool.whenIdle()
  assert.ok(!fs.existsSync(path.join(directory, failed)), 'the half-written prepared file is deleted')
  for (let file = pool.takeTmp(directory); file; file = pool.takeTmp(directory)) assert.notEqual(path.basename(file), failed)
})

// The app runs for days; another client's sweep may delete a prepared file that waited for over 24 h.
test('a prepared file that has disappeared does not fail the save', async t => {
  const { store, directory } = await preparedStore(t)
  for (const name of fs.readdirSync(directory).filter(entry => entry.startsWith('~hub-prep-'))) fs.unlinkSync(path.join(directory, name))
  await store.setAsync('k', { v: 1 })
  assert.deepEqual(await store.getAsync('k', { skipCache: true }), { v: 1 })
})

test('prepared files never show up as keys, in a scan or in a dump', async t => {
  const { store, directory } = await preparedStore(t)
  await store.setAsync('real', 1)
  assert.ok(fs.readdirSync(directory).some(name => PREPARED_FILE_PATTERN.test(name)), 'prepared files are there')
  assert.deepEqual(await store.keysAsync(), ['real'])
  const scan = await store.scanDirectoryAsync(null)
  assert.deepEqual(Object.keys(Object.fromEntries(scan.snapshot)).map(name => name.replace(/\.json$/, '')), ['real'])
  assert.deepEqual(Object.keys(await store.dumpAllAsync()), ['real'])
})

test('sweep removes prepared files left behind for over 24 h, from any pid, and keeps recent ones', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-sweep-prepared-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = createStore(directory)
  const day = 24 * 60 * 60 * 1000
  const oldMs = Date.now() - 2 * day
  const old = new Date(oldMs)
  const put = (name, mtime) => { const file = path.join(directory, name); fs.writeFileSync(file, 'x'); if (mtime) fs.utimesSync(file, mtime, mtime); return name }
  const oldPrep = put(`~hub-prep-999-${oldMs}-0123abcd.tmp`, old)
  const oldOwner = put(`~hub-owner-999-${oldMs}-89abcdef.lockowner`, old)
  const recentName = put(`~hub-prep-999-${Date.now()}-0123abce.tmp`, old)
  const recentMtime = put(`~hub-owner-999-${oldMs}-0123abcf.lockowner`)
  const removed = await store.sweepStaleTempFilesAsync()
  assert.deepEqual(removed.sort(), [oldOwner, oldPrep].sort())
  assert.ok(fs.existsSync(path.join(directory, recentName)), 'a recent name is kept even with an old mtime')
  assert.ok(fs.existsSync(path.join(directory, recentMtime)), 'a fresh mtime (an owner file in use as a lock) is kept')
})
