const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { withFileLock, withFileLocks, withFileLockAsync } = require('./fileLock.cjs')

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
// SMB melder EPERM naar en anden klient netop har slettet laasefilen (delete
// pending). Det er kaploeb, ikke en rettighedsfejl, og slap det raat igennem
// saa brugeren "EPERM: operation not permitted" midt i en normal skrivning.
test('a delete-pending lock (EPERM from SMB) is retried instead of surfacing raw', t => {
  const target = fixture(t)
  const realOpen = fs.openSync
  let denied = 0
  t.mock.method(fs, 'openSync', (...args) => {
    if (args[0] === target && denied < 2) { denied++; throw Object.assign(new Error('EPERM'), { code: 'EPERM' }) }
    return realOpen(...args)
  })
  assert.equal(withFileLock(target, () => 42, { attempts: 5, delayMs: 1 }), 42)
  assert.equal(denied, 2)
  assert.ok(!fs.existsSync(target))
})
test('a lock that stays inaccessible reports KV_LOCK_BUSY with the underlying code', t => {
  const target = fixture(t)
  t.mock.method(fs, 'openSync', () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }) })
  assert.throws(() => withFileLock(target, () => assert.fail('must not run'), { attempts: 2, delayMs: 1 }), error => error.code === 'KV_LOCK_BUSY' && /EPERM/.test(error.message))
})
test('a genuine filesystem failure is never disguised as lock contention', t => {
  const target = fixture(t)
  t.mock.method(fs, 'openSync', () => { throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }) })
  assert.throws(() => withFileLock(target, () => assert.fail('must not run'), { attempts: 2, delayMs: 1 }), { code: 'ENOSPC' })
})
// Maalt paa produktionsdrevet: en laas der netop var oprettet af en anden klient
// rapporterede mtime som 17 aar gammel. Blev den stjaalet, skrev to klienter i
// den samme fil samtidig.
test('a freshly created lock with an absurd mtime is NOT stolen', t => {
  const target = fixture(t)
  fs.writeFileSync(target, 'live-other-client')
  const bogus = new Date(Date.now() - 17 * 365 * 24 * 60 * 60 * 1000)
  fs.utimesSync(target, bogus, bogus)
  let called = false
  assert.throws(() => withFileLock(target, () => { called = true }, { attempts: 1, staleMs: 60000 }), { code: 'KV_LOCK_BUSY' })
  assert.equal(called, false)
  assert.equal(fs.readFileSync(target, 'utf8'), 'live-other-client', 'laasen skal stadig tilhoere den anden klient')
})
test('a lock with an absurd mtime is reclaimed once WE have watched it for staleMs', t => {
  const target = fixture(t)
  fs.writeFileSync(target, 'crashed-client')
  const bogus = new Date(Date.now() - 17 * 365 * 24 * 60 * 60 * 1000)
  fs.utimesSync(target, bogus, bogus)
  // Foerste forsoeg starter kun observationen.
  assert.throws(() => withFileLock(target, () => {}, { attempts: 1, staleMs: 40 }), { code: 'KV_LOCK_BUSY' })
  const waitUntil = Date.now() + 60
  while (Date.now() < waitUntil) { /* egen klokke, ikke filens */ }
  assert.equal(withFileLock(target, () => 42, { attempts: 1, staleMs: 40 }), 42)
  assert.ok(!fs.existsSync(target))
})
// Fundet live 2026-09-22: en laas havde mtime 2 TIMER ude i fremtiden (kollega-pc
// med forkert ur). `now - mtime` blev negativ, saa den blev aldrig regnet for
// forladt og blokerede noeglen permanent.
test('a lock dated in the future is still reclaimed once we have watched it', t => {
  const target = fixture(t)
  fs.writeFileSync(target, 'client-with-wrong-clock')
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000)
  fs.utimesSync(target, future, future)
  assert.throws(() => withFileLock(target, () => {}, { attempts: 1, staleMs: 40 }), { code: 'KV_LOCK_BUSY' })
  const waitUntil = Date.now() + 60
  while (Date.now() < waitUntil) { /* vores egen klokke */ }
  assert.equal(withFileLock(target, () => 42, { attempts: 1, staleMs: 40 }), 42)
  assert.ok(!fs.existsSync(target))
})
test('release does not remove a lock now owned by another writer', t => {
  const target = fixture(t)
  withFileLock(target, () => fs.writeFileSync(target, 'replacement-owner'))
  assert.equal(fs.readFileSync(target, 'utf8'), 'replacement-owner')
})
// Measured 07.11: a write on M: held its lock for 80 s, while other clients (1.6.6 too) treat a 30 s old lock as
// abandoned - logged 05.11 as "fjerner forladt laas (32s gammel)". Two writers in one file lose changes.
test('an async lock holder keeps its lock fresh while the write is still running', async t => {
  const target = fixture(t)
  await withFileLockAsync(target, async () => {
    const old = new Date(Date.now() - 60000)
    fs.utimesSync(target, old, old)
    await new Promise(resolve => setTimeout(resolve, 120))
    assert.ok(Date.now() - fs.statSync(target).mtimeMs < 5000, 'heartbeat must have refreshed the lock')
  }, { heartbeatMs: 20 })
  assert.ok(!fs.existsSync(target))
})
test('the heartbeat stops when the lock is released', async t => {
  const target = fixture(t)
  await withFileLockAsync(target, async () => {}, { heartbeatMs: 10 })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(!fs.existsSync(target), 'a late heartbeat must not recreate the lock file')
})
test('a lock whose owner keeps it fresh is never stolen, however long we watch it', t => {
  const target = fixture(t)
  fs.writeFileSync(target, 'slow-live-owner')
  assert.throws(() => withFileLock(target, () => {}, { attempts: 1, staleMs: 40 }), { code: 'KV_LOCK_BUSY' })
  const waitUntil = Date.now() + 60
  while (Date.now() < waitUntil) { /* watched for longer than staleMs */ }
  const now = new Date()
  fs.utimesSync(target, now, now)
  let called = false
  assert.throws(() => withFileLock(target, () => { called = true }, { attempts: 1, staleMs: 40 }), { code: 'KV_LOCK_BUSY' })
  assert.equal(called, false)
  assert.equal(fs.readFileSync(target, 'utf8'), 'slow-live-owner')
})
test('acquireFileLockAsync never reads the lock owner synchronously while waiting', async t => {
  const target = fixture(t)
  fs.writeFileSync(target, 'other-owner')
  const originalReadFileSync = fs.readFileSync
  const syncLockReads = []
  fs.readFileSync = function (file, ...rest) {
    if (String(file).endsWith('.lock')) {
      syncLockReads.push(String(file))
      throw new Error('synkron laeselaas paa main')
    }
    return originalReadFileSync.call(this, file, ...rest)
  }
  t.after(() => { fs.readFileSync = originalReadFileSync })
  await assert.rejects(
    withFileLockAsync(target, () => assert.fail('must not run'), { attempts: 3, delayMs: 10, staleMs: 60000 }),
    error => error.code === 'KV_LOCK_BUSY')
  fs.readFileSync = originalReadFileSync
  assert.deepEqual(syncLockReads, [])
  assert.equal(fs.readFileSync(target, 'utf8'), 'other-owner')
})
