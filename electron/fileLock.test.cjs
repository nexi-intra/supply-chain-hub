const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { withFileLock, withFileLocks } = require('./fileLock.cjs')

test('multi-locks deduplicate, hold every target and release after failure', t => {
  const first = fixture(t), second = path.join(path.dirname(first), 'second.lock')
  assert.throws(() => withFileLocks([second, first, first], () => {
    assert.ok(fs.existsSync(first)); assert.ok(fs.existsSync(second)); throw new Error('synthetic failure')
  }), /synthetic failure/)
  assert.ok(!fs.existsSync(first)); assert.ok(!fs.existsSync(second))
})
test('a failed later acquisition releases earlier locks but preserves the other owner', t => {
  const first = fixture(t), second = path.join(path.dirname(first), 'z.lock')
  fs.writeFileSync(second, 'other-owner')
  assert.throws(() => withFileLocks([second, first], () => assert.fail('must not run'), { attempts: 1 }), error => error.code === 'KV_LOCK_BUSY')
  assert.ok(!fs.existsSync(first)); assert.equal(fs.readFileSync(second, 'utf8'), 'other-owner')
})

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-lock-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return path.join(root, 'mutation.lock')
}
test('lock is released on both success and failure', t => {
  const target = fixture(t)
  assert.equal(withFileLock(target, () => 42), 42)
  assert.ok(!fs.existsSync(target))
  assert.throws(() => withFileLock(target, () => { throw new Error('test failure') }), /test failure/)
  assert.ok(!fs.existsSync(target))
})
test('a slow owner is never evicted because its lock looks old', t => {
  const target = fixture(t)
  fs.writeFileSync(target, 'other-machine-owner')
  const old = new Date(Date.now() - 60000)
  fs.utimesSync(target, old, old)
  let called = false
  assert.throws(() => withFileLock(target, () => { called = true }, { attempts: 1 }), { code: 'KV_LOCK_BUSY' })
  assert.equal(called, false)
  assert.equal(fs.readFileSync(target, 'utf8'), 'other-machine-owner')
})
test('with staleMs set, a provably abandoned lock is reclaimed instead of blocking forever', t => {
  const target = fixture(t)
  fs.writeFileSync(target, 'crashed-process-owner')
  const old = new Date(Date.now() - 61000)
  fs.utimesSync(target, old, old)
  assert.equal(withFileLock(target, () => 42, { attempts: 1, staleMs: 60000 }), 42)
  assert.ok(!fs.existsSync(target))
})
test('with staleMs set, a recent lock from a live client is still respected', t => {
  const target = fixture(t)
  fs.writeFileSync(target, 'live-other-client')
  let called = false
  assert.throws(() => withFileLock(target, () => { called = true }, { attempts: 1, staleMs: 60000 }), { code: 'KV_LOCK_BUSY' })
  assert.equal(called, false)
  assert.equal(fs.readFileSync(target, 'utf8'), 'live-other-client')
})
test('release does not remove a lock now owned by another writer', t => {
  const target = fixture(t)
  withFileLock(target, () => fs.writeFileSync(target, 'replacement-owner'))
  assert.equal(fs.readFileSync(target, 'utf8'), 'replacement-owner')
})
