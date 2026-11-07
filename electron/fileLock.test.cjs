const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { withFileLock, withFileLocks, withFileLockAsync, withFileLocksAsync, setPreparedFiles } = require('./fileLock.cjs')
const { createPreparedFiles } = require('./preparedFiles.cjs')

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
  const touch = () => { const now = new Date(); fs.utimesSync(target, now, now) }
  touch()
  assert.throws(() => withFileLock(target, () => {}, { attempts: 1, staleMs: 400 }), { code: 'KV_LOCK_BUSY' })
  const waitUntil = Date.now() + 450
  while (Date.now() < waitUntil) { /* watched for longer than staleMs */ }
  touch()
  let called = false
  assert.throws(() => withFileLock(target, () => { called = true }, { attempts: 1, staleMs: 400 }), { code: 'KV_LOCK_BUSY' })
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

// ---------- Lock as a hard link to a prepared owner file (no new file on M: while saving) ----------
async function warmPool(t, dir, options) {
  const pool = createPreparedFiles(options)
  setPreparedFiles(pool)
  t.after(async () => { setPreparedFiles(null); await pool.closeAll() })
  pool.want(dir, 2)
  await pool.whenIdle()
  return pool
}
const ownerFileWith = (dir, content) => fs.readdirSync(dir).map(name => path.join(dir, name)).find(file => file.endsWith('.lockowner') && fs.readFileSync(file, 'utf8') === content)

test('a link lock keeps a wx locker out and the other way round', async t => {
  const target = fixture(t)
  await warmPool(t, path.dirname(target))
  await withFileLockAsync(target, async () => {
    assert.equal(fs.statSync(target).nlink, 2, 'the lock is a hard link to a prepared owner file')
    assert.throws(() => withFileLock(target, () => {}, { attempts: 1 }), { code: 'KV_LOCK_BUSY' })
  })
  assert.ok(!fs.existsSync(target))
  fs.writeFileSync(target, 'other-client')
  await assert.rejects(withFileLockAsync(target, () => assert.fail('must not run'), { attempts: 2, delayMs: 1 }), { code: 'KV_LOCK_BUSY' })
  assert.equal(fs.readFileSync(target, 'utf8'), 'other-client')
})

test('a link lock is the prepared owner file and is released by unlinking only the link', async t => {
  const target = fixture(t)
  const dir = path.dirname(target)
  const pool = await warmPool(t, dir, { poolSize: 1 })
  let ownerFile, firstId
  await withFileLockAsync(target, async () => {
    firstId = fs.readFileSync(target, 'utf8')
    ownerFile = ownerFileWith(dir, firstId)
    assert.ok(ownerFile, 'the lock content is a prepared owner file')
  })
  assert.ok(!fs.existsSync(target))
  await pool.whenIdle()
  assert.ok(fs.existsSync(ownerFile), 'the owner file stays')
  await withFileLockAsync(target, async () => {
    const secondId = fs.readFileSync(target, 'utf8')
    assert.notEqual(secondId, firstId, 'a reused owner file gets a new owner id')
    assert.equal(fs.readFileSync(ownerFile, 'utf8'), secondId, 'the same file is reused, no new one')
  })
})

test('release never removes a lock someone else has taken meanwhile', async t => {
  const target = fixture(t)
  const dir = path.dirname(target)
  const pool = await warmPool(t, dir)
  let ownerFile
  await withFileLockAsync(target, async () => {
    ownerFile = ownerFileWith(dir, fs.readFileSync(target, 'utf8'))
    fs.unlinkSync(target)
    fs.writeFileSync(target, 'thief')
  })
  assert.equal(fs.readFileSync(target, 'utf8'), 'thief')
  await pool.whenIdle()
  assert.ok(!fs.existsSync(ownerFile), 'an owner file whose lock was not certainly ours is never reused')
})

test('an abandoned link lock is reclaimed after staleMs like any lock', async t => {
  const target = fixture(t)
  await warmPool(t, path.dirname(target))
  await withFileLockAsync(target, async () => {
    const old = new Date(Date.now() - 61000)
    fs.utimesSync(target, old, old)
    assert.equal(withFileLock(target, () => 42, { attempts: 1, staleMs: 60000 }), 42)
  })
  assert.ok(!fs.existsSync(target))
})

test('nine locks in one folder with two prepared owners: two by link, the rest as today, none waits', async t => {
  const first = fixture(t)
  const dir = path.dirname(first)
  await warmPool(t, dir)
  const targets = Array.from({ length: 9 }, (_, index) => path.join(dir, `k${index}.json.lock`))
  await withFileLocksAsync(targets, async () => {
    assert.ok(targets.every(target => fs.existsSync(target)))
    const linked = targets.filter(target => fs.statSync(target).nlink === 2)
    assert.ok(linked.length >= 2, `${linked.length} locks by link`)
    const ids = targets.map(target => fs.readFileSync(target, 'utf8'))
    assert.equal(new Set(ids).size, 9, 'no owner file (owner id) is used by two locks')
  }, { attempts: 1 })
  assert.ok(targets.every(target => !fs.existsSync(target)))
})

test('when links are not supported the lock falls back and remembers it', async t => {
  const target = fixture(t)
  const dir = path.dirname(target)
  const pool = await warmPool(t, dir)
  const link = t.mock.method(fs.promises, 'link', async () => { throw Object.assign(new Error('not supported'), { code: 'ENOTSUP' }) })
  await withFileLockAsync(target, async () => {
    assert.equal(fs.statSync(target).nlink, 1, 'taken the way it is done today')
  })
  assert.equal(pool.linkSupported(dir), false)
  await withFileLockAsync(target, async () => {})
  assert.equal(link.mock.callCount(), 1, 'not tried again in that folder')
  assert.ok(!fs.existsSync(target))
})

test('one EPERM from a link (a lock just deleted by another client) does not give up links in the folder', async t => {
  const target = fixture(t)
  const dir = path.dirname(target)
  const pool = await warmPool(t, dir)
  const realLink = fs.promises.link
  let failures = 1
  t.mock.method(fs.promises, 'link', async (...args) => {
    if (failures-- > 0) throw Object.assign(new Error('delete pending'), { code: 'EPERM' })
    return realLink(...args)
  })
  await withFileLockAsync(target, async () => {})
  assert.equal(pool.linkSupported(dir), true)
  await withFileLockAsync(target, async () => {
    assert.equal(fs.statSync(target).nlink, 2, 'the next lock is a link again')
  })
})

test('a prepared owner file that has disappeared does not fail the lock', async t => {
  const target = fixture(t)
  const dir = path.dirname(target)
  await warmPool(t, dir)
  for (const name of fs.readdirSync(dir).filter(entry => entry.endsWith('.lockowner'))) fs.unlinkSync(path.join(dir, name))
  assert.equal(await withFileLockAsync(target, async () => 42, { attempts: 1 }), 42)
  assert.ok(!fs.existsSync(target))
})
