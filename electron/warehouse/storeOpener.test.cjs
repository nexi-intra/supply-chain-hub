const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStoreOpener, OPEN_RETRY_MS } = require('./storeOpener.cjs')
const { createStore } = require('../store.cjs')

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-opener-'))
const quiet = t => t.mock.method(console, 'error', () => {})

test('a store is opened without a synchronous mkdir: the folder is made with fs.promises.mkdir', async t => {
  const dir = path.join(tempRoot(), 'TCD', 'lagerstyring')
  const mkdirSync = t.mock.method(fs, 'mkdirSync')
  const mkdir = t.mock.method(fs.promises, 'mkdir')
  const opener = createStoreOpener({ createStore })
  const opening = opener.open(dir)
  assert.ok(opening instanceof Promise, 'open is async')
  const store = await opening
  assert.equal(mkdirSync.mock.callCount(), 0, 'no mkdirSync on the main thread')
  assert.deepEqual(mkdir.mock.calls.map(call => call.arguments), [[dir, { recursive: true }]])
  assert.ok(fs.statSync(dir).isDirectory())
  await store.setAsync('a', 1)
  assert.equal(await (await opener.open(dir)).getAsync('a'), 1)
  assert.equal(await opener.open(dir), store, 'opened once, kept')
  assert.equal(mkdir.mock.callCount(), 1)
})

test('callers that open the same folder at once share one mkdir', async t => {
  const dir = path.join(tempRoot(), 'shared')
  const mkdir = t.mock.method(fs.promises, 'mkdir')
  const opener = createStoreOpener({ createStore })
  const [a, b] = await Promise.all([opener.open(dir), opener.open(dir)])
  assert.equal(a, b)
  assert.equal(mkdir.mock.callCount(), 1)
})

test('a failed mkdir is remembered for a few seconds, so a drive that is down is not tried on every check', async t => {
  quiet(t)
  const dir = path.join(tempRoot(), 'down')
  let clock = 1000
  let down = true
  const realMkdir = fs.promises.mkdir
  const mkdir = t.mock.method(fs.promises, 'mkdir', (...args) => down ? Promise.reject(Object.assign(new Error('gone'), { code: 'ETIMEDOUT' })) : realMkdir(...args))
  const opener = createStoreOpener({ createStore, now: () => clock })
  await assert.rejects(opener.open(dir), { code: 'STORAGE_UNAVAILABLE' })
  assert.equal(mkdir.mock.callCount(), 1)
  clock += OPEN_RETRY_MS - 1
  await assert.rejects(opener.open(dir), { code: 'STORAGE_UNAVAILABLE' })
  assert.equal(mkdir.mock.callCount(), 1, 'not tried again within the back-off')
  assert.equal(opener.opened(dir), undefined)
  down = false
  clock += 1
  assert.ok(await opener.open(dir), 'tried again after the back-off')
  assert.equal(mkdir.mock.callCount(), 2)
})

test('forget() lets a folder that just failed be tried at once (M: is back)', async t => {
  quiet(t)
  const dir = path.join(tempRoot(), 'back')
  let down = true
  const realMkdir = fs.promises.mkdir
  t.mock.method(fs.promises, 'mkdir', (...args) => down ? Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' })) : realMkdir(...args))
  const opener = createStoreOpener({ createStore, now: () => 0 })
  await assert.rejects(opener.open(dir), { code: 'STORAGE_UNAVAILABLE' })
  down = false
  opener.forget()
  assert.ok(await opener.open(dir))
})

test('a lazy store forwards every store method to the opened store, and opens it only when a method is called', async t => {
  const dir = path.join(tempRoot(), 'lazy')
  let dirCalls = 0
  const mkdirSync = t.mock.method(fs, 'mkdirSync')
  const opener = createStoreOpener({ createStore })
  const lazy = opener.lazy(() => { dirCalls++; return dir })
  assert.equal(fs.existsSync(dir), false, 'nothing opened yet')
  assert.equal(lazy.then, undefined, 'not a thenable, so awaiting it gives the store handle back')
  assert.equal(await lazy, lazy)
  await lazy.setAsync('x', { n: 1 })
  assert.deepEqual(await lazy.getAsync('x'), { n: 1 })
  assert.deepEqual(await lazy.mutateAsync('x', current => ({ n: current.n + 1 })), { n: 2 })
  assert.deepEqual(await lazy.keysAsync(), ['x'])
  await lazy.withLockedKeysAsync(['x'], locked => { locked.set('x', { n: 3 }) })
  assert.deepEqual(await lazy.getAsync('x', { skipCache: true }), { n: 3 })
  await lazy.deleteAsync('x')
  assert.equal(await lazy.getAsync('x'), undefined)
  // Every method of a real store is reachable, also ones the services do not use today.
  const real = await opener.open(dir)
  for (const name of Object.keys(real).filter(key => typeof real[key] === 'function')) assert.equal(typeof lazy[name], 'function', name)
  assert.equal(lazy.dataDir, dir)
  assert.ok(dirCalls > 0, 'the folder is looked up on use (the platform root may change)')
  assert.equal(mkdirSync.mock.callCount(), 0)
})

test('a lazy store turns a failed open into a rejected call, never a synchronous throw', async t => {
  quiet(t)
  t.mock.method(fs.promises, 'mkdir', () => Promise.reject(Object.assign(new Error('gone'), { code: 'EIO' })))
  const opener = createStoreOpener({ createStore })
  const lazy = opener.lazy(() => path.join(tempRoot(), 'down'))
  let call
  assert.doesNotThrow(() => { call = lazy.getAsync('x') })
  await assert.rejects(call, { code: 'STORAGE_UNAVAILABLE' })
  const failing = opener.lazy(() => { throw Object.assign(new Error('no root'), { code: 'AUTH_FORBIDDEN' }) })
  await assert.rejects(failing.getAsync('x'), { code: 'AUTH_FORBIDDEN' })
})

test('handles are kept per folder', () => {
  const opener = createStoreOpener({ createStore })
  assert.equal(opener.handle('C:\\x\\a'), opener.handle('C:\\x\\a'))
  assert.notEqual(opener.handle('C:\\x\\a'), opener.handle('C:\\x\\b'))
})

test('forget() during an open: a later open does not join the old attempt, and the old failure is not remembered', async t => {
  quiet(t)
  const dir = path.join(tempRoot(), 'flaky')
  const realMkdir = fs.promises.mkdir
  const held = []
  t.mock.method(fs.promises, 'mkdir', (...args) => new Promise((resolve, reject) => held.push({ ok: () => realMkdir(...args).then(resolve, reject), fail: () => reject(Object.assign(new Error('gone'), { code: 'ETIMEDOUT' })) })))
  const settle = () => new Promise(resolve => setImmediate(resolve))
  const opener = createStoreOpener({ createStore, now: () => 0 })
  const first = opener.open(dir)
  await settle()
  opener.forget()
  const second = opener.open(dir)
  await settle()
  assert.equal(held.length, 2, 'the open after forget() is a new attempt')
  held[0].fail()
  await assert.rejects(first, { code: 'STORAGE_UNAVAILABLE' })
  const third = opener.open(dir)
  await settle()
  assert.equal(held.length, 2, 'joins the attempt after forget(), which the old failure neither ended nor blocked')
  held[1].ok()
  const store = await second
  assert.ok(store)
  assert.equal(await third, store)
})