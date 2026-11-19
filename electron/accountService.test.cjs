const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const registry = require('./registry.cjs')
const { createStore } = require('./store.cjs')
const { createAccountService } = require('./accountService.cjs')
const { publicUsers } = require('./userPolicy.cjs')
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-account-migration-test-'))
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'sch-account-migration-test-'))
    fs.rmSync(root, { recursive: true, force: true })
  })
  registry.createTeam(root, { teamId: 'A', folderName: 'A', name: 'Synthetic A' })
  registry.createTeam(root, { teamId: 'B', folderName: 'B', name: 'Synthetic B' })
  const oldEmail = 'old@example.test', newEmail = 'new@example.test', creator = 'creator@example.test'
  registry.setCreatorEmail(root, creator); registry.assignUserToTeam(root, creator, 'A'); registry.assignUserToTeam(root, oldEmail, 'A')
  const own = createStore(path.join(root, 'A')), other = createStore(path.join(root, 'B')), shared = createStore(path.join(root, '_shared'))
  const user = { email: oldEmail, password: 'SYNTHETIC STORED PASSWORD', fullName: 'Synthetic User', phone: '123', role: 'user', status: 'approved', username: 'synthetic', customMetadata: { keep: true } }
  own.set('users', { [oldEmail]: user, [creator]: { email: creator, password: 'CREATOR SYNTHETIC PASSWORD', role: 'creator' } })
  own.set('vacation-entries', [{ id: 'v1', userId: `user_${oldEmail}`, userEmail: oldEmail, notes: `Do not change this text: ${oldEmail}`, status: 'approved' }])
  own.set('shift-assignments', [{ id: 'shift', employeeId: oldEmail, comment: oldEmail }])
  own.set('home-office-patterns', { [oldEmail]: { weekdays: [1, 2] }, [creator]: { weekdays: [3] } })
  own.set('guides', [{ id: 'g', createdBy: oldEmail, content: oldEmail, sections: [{ steps: [{ text: oldEmail, imageIds: ['file_image'] }] }] }])
  own.set('guide-admin-emails', [oldEmail]); own.set(`app-language-user_${oldEmail}`, 'fi'); own.set(`hub-dashboard-${oldEmail}`, { tasks: { size: 'compact' } })
  own.set('file_image_chunk_0', 'BINARY IMAGE MUST NOT CHANGE')
  other.set('users', {}); other.set('guide-access-requests', [{ id: 'grant', requestingUserEmail: oldEmail, requestingTeamCode: 'A', guideId: 'external', status: 'approved' }])
  shared.set('shared-guides', [{ id: 'shared', createdBy: oldEmail, content: 'SHARED GUIDE BODY', sharedWithTeamCodes: ['A', 'B'] }])
  own.set('knowledge-articles', [{ id: 'k', createdBy: oldEmail, content: oldEmail, sections: [] }])
  other.set('knowledge-access-requests', [{ id: 'kgrant', requestingUserEmail: oldEmail, requestingTeamCode: 'A', guideId: 'external-k', status: 'approved' }])
  shared.set('shared-knowledge-articles', [{ id: 'shared-k', createdBy: oldEmail, content: 'SHARED KNOWLEDGE BODY', sharedWithTeamCodes: ['A', 'B'] }])
  shared.set('active-sessions', { old: { email: oldEmail, token: 'SYNTHETIC OLD TOKEN' }, creator: { email: creator, token: 'SYNTHETIC CREATOR TOKEN' } })
  const actor = { email: creator, role: 'creator', home: registry.lookupTeamForEmail(root, creator), activeTeam: registry.lookupTeamForEmail(root, creator) }
  const service = createAccountService({ getRoot: () => root, registry, openStore: createStore, ...options })
  const operation = { op: 'renameField', field: oldEmail, newField: newEmail, expected: publicUsers({ user }).user, value: { email: newEmail, fullName: 'Changed Name', password: '' } }
  return { root, oldEmail, newEmail, creator, own, other, shared, user, actor, service, operation, rename: () => service.rename(actor, 'A', operation), read: (store, key) => store.get(key, { skipCache: true }) }
}
const code = expected => error => error.code === expected
test('snapshots are written once and normal gates/status never reload a completed large journal', t => {
  let journalWrites = 0, journalReads = 0
  const wrapped = directory => {
    const store = createStore(directory)
    return { ...store,
      get(key, options) { if (key === 'account-migration-journal') journalReads++; return store.get(key, options) },
      withLockedKeys(keys, callback) { return store.withLockedKeys(keys, tx => callback({ ...tx, set(key, value) { if (key === 'account-migration-journal') journalWrites++; return tx.set(key, value) } })) },
    }
  }
  const f = fixture(t, { openStore: wrapped }); f.rename(); assert.equal(journalWrites, 1)
  journalReads = 0
  for (let i = 0; i < 3; i++) { f.service.context(); f.service.assertReady(); assert.equal(f.service.status(f.actor), null) }
  assert.equal(journalReads, 0)
})
test('a target write that reached disk before an exception is not repeated during recovery', t => {
  let failed = false
  const f = fixture(t, { openStore: directory => {
    const store = createStore(directory)
    return { ...store, withLockedKeys(keys, callback) { return store.withLockedKeys(keys, tx => callback({ ...tx, set(key, value) {
      tx.set(key, value)
      if (!failed && key === 'vacation-entries') { failed = true; throw new Error('SYNTHETIC ERROR AFTER DISK WRITE') }
    } })) } }
  } })
  assert.throws(f.rename, /AFTER DISK WRITE/); assert.equal(f.read(f.own, 'vacation-entries')[0].userEmail, f.newEmail)
  const fresh = createAccountService({ getRoot: () => f.root, registry, openStore: directory => {
    const store = createStore(directory)
    return { ...store, withLockedKeys(keys, callback) { return store.withLockedKeys(keys, tx => callback({ ...tx, set(key, value) { assert.notEqual(key, 'vacation-entries', 'already applied writes must not repeat'); return tx.set(key, value) } })) } }
  } })
  assert.equal(fresh.resume(f.actor, f.service.pending().id).state, 'committed')
  assert.equal(f.read(f.own, 'users')[f.newEmail].password, f.user.password)
})
test('an occupied global account lock blocks writes but the read gate stays lock-free', t => {
  const f = fixture(t), lock = path.join(f.root, '_registry', 'account-operation.lock')
  fs.writeFileSync(lock, 'synthetic-other-client')
  assert.throws(f.rename, code('KV_LOCK_BUSY')); assert.equal(f.service.context(), null)
  assert.equal(fs.readFileSync(lock, 'utf8'), 'synthetic-other-client')
  assert.deepEqual(f.read(f.own, 'users')[f.oldEmail], f.user)
})
test('a lock abandoned by a crashed client self-heals instead of blocking every future account operation forever', t => {
  const f = fixture(t), lock = path.join(f.root, '_registry', 'account-operation.lock')
  fs.writeFileSync(lock, 'crashed-client-pid:old-uuid')
  const old = new Date(Date.now() - 61000)
  fs.utimesSync(lock, old, old)
  f.rename()
  assert.equal(f.read(f.own, 'users')[f.newEmail].password, f.user.password)
  assert.equal(f.service.pending(), null)
})
test('context reads are served from a bounded snapshot and stay lock-free under contention', t => {
  let clock = 1000
  const f = fixture(t, { now: () => clock }), lock = path.join(f.root, '_registry', 'account-operation.lock')
  const first = f.service.context()
  fs.writeFileSync(lock, 'synthetic-other-client')
  assert.equal(f.service.context(), first)
  clock += 500
  assert.equal(f.service.context(), first)
  assert.equal(fs.readFileSync(lock, 'utf8'), 'synthetic-other-client')
})
test('malformed transaction journals fail closed and cannot be treated as a ready platform', t => {
  const f = fixture(t)
  createStore(path.join(f.root, '_registry')).set('account-migration-journal', { state: 'committed' })
  assert.throws(() => f.service.assertReady(), code('ACCOUNT_MIGRATION_INVALID'))
  assert.throws(f.rename, code('ACCOUNT_MIGRATION_INVALID'))
  assert.deepEqual(f.read(f.own, 'users')[f.oldEmail], f.user)
})

test('pending offline changes reject migration before making any journal or reference write', t => {
  const f = fixture(t, { assertNoPendingSync: () => { throw new Error('ACCOUNT_PENDING_SYNC') } })
  assert.throws(f.rename, /ACCOUNT_PENDING_SYNC/); assert.equal(f.service.pending(), null)
  assert.deepEqual(f.read(f.own, 'users')[f.oldEmail], f.user)
})
test('retired identities cannot reappear in stale operations, preferences or guide-admin lists', t => {
  const f = fixture(t); f.rename()
  for (const [key, value] of [
    ['vacation-entries', { op: 'append', items: [{ userEmail: f.oldEmail }] }],
    ['guide-admin-emails', { op: 'append', items: [f.oldEmail] }],
    ['users', { op: 'setField', field: f.oldEmail, value: { email: f.oldEmail } }],
    [`app-language-user_${f.oldEmail}`, 'fi'],
    ['home-office-patterns', { op: 'compareAndSet', value: { [f.oldEmail]: { days: [1] } } }],
  ]) assert.throws(() => f.service.assertReferences(key, value), code('ACCOUNT_RETIRED_REFERENCE'))
  assert.doesNotThrow(() => f.service.assertReferences('guides', [{ content: f.oldEmail, createdBy: f.newEmail }]))
})
test('runAuthenticationAsync waits for a held account lock without blocking the event loop', async t => {
  const f = fixture(t), lock = path.join(f.root, '_registry', 'account-operation.lock')
  fs.writeFileSync(lock, 'synthetic-other-client')
  let ticked = false, tickedBeforeRelease = null
  setImmediate(() => { ticked = true })
  setTimeout(() => { tickedBeforeRelease = ticked; fs.unlinkSync(lock) }, 300)
  assert.equal(await f.service.runAuthenticationAsync('a@x', ({ recovering }) => recovering ? 'recovering' : 'ok'), 'ok')
  assert.equal(tickedBeforeRelease, true)
  assert.equal(fs.existsSync(lock), false, 'own lock is released afterwards')
})
test('runAuthenticationAsync reads the migration control past the read-slot queue', async t => {
  const reads = []
  const f = fixture(t, { openStore: directory => {
    const store = createStore(directory)
    return { ...store, getAsync(key, options) { reads.push({ key, options }); return store.getAsync(key, options) } }
  } })
  reads.length = 0
  assert.equal(await f.service.runAuthenticationAsync('a@x', () => 'ok'), 'ok')
  const controlReads = reads.filter(read => read.key.startsWith('account-migration'))
  assert.ok(controlReads.length > 0)
  assert.ok(controlReads.every(read => read.options?.unthrottled === true && read.options?.skipCache === true))
  reads.length = 0
  await f.service.statusAsync(f.actor)
  assert.ok(reads.filter(read => read.key.startsWith('account-migration')).every(read => !read.options?.unthrottled), 'reads outside the lock stay throttled')
})
test('runAuthenticationAsync gives up with KV_LOCK_BUSY after its attempt budget', async t => {
  const f = fixture(t, { authenticationLockRetry: { attempts: 3, delayMs: 10 } }), lock = path.join(f.root, '_registry', 'account-operation.lock')
  fs.writeFileSync(lock, 'synthetic-other-client')
  let called = false
  await assert.rejects(f.service.runAuthenticationAsync(f.creator, () => { called = true }), code('KV_LOCK_BUSY'))
  assert.equal(called, false)
  assert.equal(fs.readFileSync(lock, 'utf8'), 'synthetic-other-client')
})
test('the read context changes on migration and creator authentication remains possible during recovery without changing private snapshots', async t => {
  const f = fixture(t, { beforeStep: ({ index }) => { if (index === 2) throw new Error('synthetic stop') } })
  const context = f.service.context()
  assert.throws(f.rename)
  assert.throws(() => f.service.context(), code('ACCOUNT_MIGRATION_PENDING'))
  assert.throws(() => f.service.runAuthentication(f.oldEmail, () => {}), code('ACCOUNT_MIGRATION_PENDING'))
  assert.equal(f.service.runAuthentication(f.creator, ({ recovering }) => recovering), true)
  await assert.rejects(f.service.runAuthenticationAsync(f.oldEmail, () => {}), code('ACCOUNT_MIGRATION_PENDING'))
  assert.equal(await f.service.runAuthenticationAsync(f.creator, async ({ recovering }) => recovering), true)
  f.shared.mutate('active-sessions', sessions => ({ ...sessions, recoveryCreator: { email: f.creator, token: 'SYNTHETIC RECOVERY TOKEN' } }))
  const fresh = createAccountService({ getRoot: () => f.root, registry, openStore: createStore })
  fresh.resume(f.actor, f.service.pending().id)
  assert.notEqual(fresh.context(), context)
  assert.equal(f.read(f.shared, 'active-sessions').recoveryCreator.token, 'SYNTHETIC RECOVERY TOKEN')
})
test('rolled-back recovery preserves unrelated sessions added after the failure', t => {
  const f = fixture(t, { beforeStep: ({ index }) => { if (index === 2) throw new Error('synthetic stop') } })
  assert.throws(f.rename)
  f.shared.mutate('active-sessions', sessions => ({ ...sessions, extra: { email: f.creator, token: 'KEEP' } }))
  const fresh = createAccountService({ getRoot: () => f.root, registry, openStore: createStore })
  fresh.rollback(f.actor, f.service.pending().id)
  assert.equal(f.read(f.shared, 'active-sessions').extra.token, 'KEEP')
  assert.ok(f.read(f.shared, 'active-sessions').old)
})
test('one journalled email migration preserves credentials and migrates all fixture references and preferences', t => {
  const f = fixture(t), result = f.rename(), users = f.read(f.own, 'users')
  assert.equal(result[f.newEmail].password, undefined); assert.equal(users[f.oldEmail], undefined)
  assert.equal(users[f.newEmail].password, f.user.password); assert.deepEqual(users[f.newEmail].customMetadata, { keep: true }); assert.ok(users[f.newEmail].accountId)
  assert.equal(registry.lookupTeamForEmail(f.root, f.oldEmail), null); assert.equal(registry.lookupTeamForEmail(f.root, f.newEmail).teamId, 'A')
  assert.equal(f.read(f.own, 'vacation-entries')[0].userId, `user_${f.newEmail}`); assert.equal(f.read(f.own, 'vacation-entries')[0].userEmail, f.newEmail)
  assert.equal(f.read(f.own, 'vacation-entries')[0].notes, `Do not change this text: ${f.oldEmail}`)
  assert.equal(f.read(f.own, 'shift-assignments')[0].employeeId, f.newEmail); assert.equal(f.read(f.own, 'shift-assignments')[0].comment, f.oldEmail)
  assert.deepEqual(f.read(f.own, 'home-office-patterns')[f.newEmail], { weekdays: [1, 2] })
  assert.deepEqual(f.read(f.own, 'guide-admin-emails'), [f.newEmail]); assert.equal(f.read(f.other, 'guide-access-requests')[0].requestingUserEmail, f.newEmail)
  const guide = f.read(f.own, 'guides')[0]; assert.equal(guide.createdBy, f.newEmail); assert.equal(guide.content, f.oldEmail); assert.equal(guide.sections[0].steps[0].text, f.oldEmail)
  assert.equal(f.read(f.shared, 'shared-guides')[0].createdBy, f.newEmail); assert.equal(f.read(f.own, 'file_image_chunk_0'), 'BINARY IMAGE MUST NOT CHANGE')
  assert.equal(f.read(f.own, 'knowledge-articles')[0].createdBy, f.newEmail); assert.equal(f.read(f.own, 'knowledge-articles')[0].content, f.oldEmail)
  assert.equal(f.read(f.other, 'knowledge-access-requests')[0].requestingUserEmail, f.newEmail)
  assert.equal(f.read(f.shared, 'shared-knowledge-articles')[0].createdBy, f.newEmail)
  assert.equal(f.read(f.own, `app-language-user_${f.oldEmail}`), undefined); assert.equal(f.read(f.own, `app-language-user_${f.newEmail}`), 'fi')
  assert.equal(f.read(f.own, `hub-dashboard-${f.newEmail}`).tasks.size, 'compact')
  assert.equal(f.read(f.shared, 'active-sessions').old, undefined); assert.ok(f.read(f.shared, 'active-sessions').creator)
  assert.equal(f.service.pending(), null); assert.throws(() => f.service.assertAvailable(f.oldEmail), code('ACCOUNT_EMAIL_RETIRED'))
})
test('a stale account snapshot stops the entire migration before any changes', t => {
  const f = fixture(t); f.own.mutate('users', users => ({ ...users, [f.oldEmail]: { ...users[f.oldEmail], phone: 'changed by someone else' } }))
  assert.throws(f.rename, code('KV_CONFLICT')); assert.equal(f.service.pending(), null)
  assert.equal(f.read(f.own, 'vacation-entries')[0].userEmail, f.oldEmail); assert.equal(registry.lookupTeamForEmail(f.root, f.oldEmail).teamId, 'A')
})
for (const target of ['own-account', 'other-team-account', 'personal-key', 'keyed-preference']) test(`preflight refuses an occupied ${target} without changing any original data`, t => {
  const f = fixture(t)
  if (target === 'own-account') f.own.mutate('users', users => ({ ...users, [f.newEmail]: { email: f.newEmail, password: 'DO NOT OVERWRITE' } }))
  if (target === 'other-team-account') { f.other.set('users', { [f.newEmail]: { email: f.newEmail, password: 'DO NOT OVERWRITE' } }); registry.assignUserToTeam(f.root, f.newEmail, 'B') }
  if (target === 'personal-key') f.own.set(`hub-dashboard-${f.newEmail}`, { keep: 'DO NOT OVERWRITE' })
  if (target === 'keyed-preference') f.own.mutate('home-office-patterns', value => ({ ...value, [f.newEmail]: { weekdays: [4] } }))
  assert.throws(f.rename); assert.equal(f.service.pending(), null)
  assert.equal(f.read(f.own, 'vacation-entries')[0].userEmail, f.oldEmail); assert.ok(f.read(f.own, 'users')[f.oldEmail])
})
test('pending state and progress survive a failed write and a new service instance can resume', async t => {
  let broken = true
  const f = fixture(t, { beforeStep: ({ index }) => { if (broken && index === 2) throw new Error('SYNTHETIC EACCES') } })
  assert.throws(f.rename, /SYNTHETIC EACCES/)
  const pending = f.service.status(f.actor); assert.equal(pending.state, 'failed'); assert.equal(pending.applied, 2)
  assert.throws(() => f.service.runWrite(() => f.own.set('projects', [])), code('ACCOUNT_MIGRATION_PENDING'))
  // Den asynkrone skrivevej tager ikke laengere den globale kontolaas (den
  // serialiserede ALLE brugeres gemninger). Porten skal stadig holde.
  // SKAL afventes: uden await koerte skrivningen efter at fixturen var ryddet op,
  // og fejlede saa med ENOENT i stedet for at teste porten.
  await assert.rejects(() => f.service.runWriteAsync(() => f.own.set('projects', [])), code('ACCOUNT_MIGRATION_PENDING'))
  const fresh = createAccountService({ getRoot: () => f.root, registry, openStore: createStore })
  assert.equal(fresh.resume(f.actor, pending.id).state, 'committed'); assert.equal(fresh.pending(), null)
  assert.equal(f.read(f.own, 'vacation-entries')[0].userEmail, f.newEmail)
  assert.equal(f.read(f.own, 'users')[f.newEmail].password, f.user.password)
})
test('safe rollback restores original data after a partial failure, including missing preference keys', t => {
  let broken = true
  const f = fixture(t, { beforeStep: ({ index, reverse }) => { if (broken && !reverse && index === 3) throw new Error('SYNTHETIC FAILURE') } })
  assert.throws(f.rename); const pending = f.service.pending(); broken = false
  assert.equal(f.service.rollback(f.actor, pending.id).state, 'rolled-back')
  assert.deepEqual(f.read(f.own, 'users')[f.oldEmail], f.user); assert.equal(f.read(f.own, 'users')[f.newEmail], undefined)
  assert.equal(f.read(f.own, `app-language-user_${f.newEmail}`), undefined); assert.equal(f.read(f.own, `app-language-user_${f.oldEmail}`), 'fi')
  assert.equal(f.read(f.own, 'vacation-entries')[0].userEmail, f.oldEmail); assert.equal(f.service.pending(), null)
})
for (const reverse of [false, true]) test(`${reverse ? 'rollback' : 'resume'} detects a third-party edit before making any recovery write`, t => {
  const f = fixture(t, { beforeStep: ({ index }) => { if (index === 2) throw new Error('SYNTHETIC FAILURE') } })
  assert.throws(f.rename); const pending = f.service.pending()
  f.own.set('vacation-entries', [{ id: 'third-party', keep: 'NEVER OVERWRITE' }])
  const usersBefore = f.read(f.own, 'users'), patternsBefore = f.read(f.own, 'home-office-patterns')
  const action = reverse ? f.service.rollback : f.service.resume
  assert.throws(() => action(f.actor, pending.id), code('ACCOUNT_MIGRATION_CONFLICT'))
  assert.deepEqual(f.read(f.own, 'vacation-entries'), [{ id: 'third-party', keep: 'NEVER OVERWRITE' }])
  assert.deepEqual(f.read(f.own, 'users'), usersBefore); assert.deepEqual(f.read(f.own, 'home-office-patterns'), patternsBefore)
})
test('recovery and journal status never disclose private snapshots or allow ordinary users', t => {
  const f = fixture(t, { beforeStep: () => { throw new Error('SYNTHETIC FAILURE') } }); assert.throws(f.rename)
  assert.equal(JSON.stringify(f.service.status(f.actor)).includes('PASSWORD'), false)
  for (const actor of [{ ...f.actor, role: 'user' }]) {
    assert.throws(() => f.service.status(actor), code('AUTH_FORBIDDEN'))
    assert.throws(() => f.service.resume(actor, f.service.pending().id), code('AUTH_FORBIDDEN'))
  }
})
test('manager can migrate own team but never a different team or the creator account', t => {
  const f = fixture(t), manager = { ...f.actor, email: 'manager@example.test', role: 'manager' }
  assert.throws(() => f.service.rename({ ...manager, activeTeam: { teamId: 'B' } }, 'A', f.operation), code('AUTH_FORBIDDEN'))
  assert.throws(() => f.service.rename(manager, 'A', { ...f.operation, field: f.creator }), code('AUTH_FORBIDDEN'))
  registry.setManagerAccess(f.root, f.oldEmail, ['B'])
  assert.ok(f.service.rename(manager, 'A', f.operation)[f.newEmail])
  assert.deepEqual(registry.listManagerAccess(f.root).map(({ email, teamIds }) => ({ email, teamIds })), [{ email: f.newEmail, teamIds: ['B'] }])
})
test('journal size limit rejects a migration before writing any data', t => {
  const f = fixture(t, { maxJournalBytes: 1 })
  assert.throws(f.rename, code('ACCOUNT_MIGRATION_TOO_LARGE')); assert.equal(f.service.pending(), null)
  assert.ok(f.read(f.own, 'users')[f.oldEmail]); assert.equal(registry.lookupTeamForEmail(f.root, f.newEmail), null)
})
test('failed snapshot reads do not initialize or replace malformed real-store data', t => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.root, 'B', 'projects.json'), 'synthetic corrupted JSON')
  assert.throws(f.rename); assert.equal(f.service.pending(), null); assert.ok(f.read(f.own, 'users')[f.oldEmail])
})
test('a rename migrates the shared multiplayer index and rejects retired identities in commands', t => {
  const f = fixture(t)
  f.shared.set('multiplayer-index', {
    games: [{ id: 'g1', players: [{ email: f.oldEmail, name: 'Synthetic User', teamCode: 'A' }, { email: f.creator, name: 'C', teamCode: 'A' }], status: 'active', turn: f.oldEmail, winner: null }],
    notifications: [{ id: 'n1', gameId: 'g1', recipientEmail: f.oldEmail, actorEmail: f.creator, type: 'turn', readAt: null }],
    operations: [{ operationId: 'op1', fingerprint: 'f', actorEmail: f.oldEmail, gameId: 'g1' }],
  })
  f.rename()
  const index = f.read(f.shared, 'multiplayer-index')
  assert.equal(index.games[0].players[0].email, f.newEmail)
  assert.equal(index.games[0].players[0].name, 'Synthetic User')
  assert.equal(index.games[0].turn, f.newEmail)
  assert.equal(index.notifications[0].recipientEmail, f.newEmail)
  assert.equal(index.operations[0].actorEmail, f.newEmail)
  assert.throws(() => f.service.assertReferences('multiplayer-index', { type: 'challenge', opponentEmail: f.oldEmail }), code('ACCOUNT_RETIRED_REFERENCE'))
  assert.doesNotThrow(() => f.service.assertReferences('multiplayer-index', { type: 'challenge', opponentEmail: f.newEmail }))
})

test('prepareReferenceChecksAsync loads retired identities once, so a write checks them without synchronous reads', async t => {
  const f = fixture(t)
  const meta = createStore(path.join(f.root, '_registry'))
  meta.set('account-retired-identities', { 'gone@example.test': { replacement: 'new@example.test', accountId: 'x' } })
  const service = createAccountService({ getRoot: () => f.root, registry, openStore: dir => {
    const store = createStore(dir)
    return { ...store, get: (...args) => { throw new Error('synchronous read on the main thread') } }
  } })
  await service.prepareReferenceChecksAsync()
  service.assertReferences('guides', { op: 'append', items: [{ id: '1', title: 'fine' }] })
  assert.throws(() => service.assertReferences('app-language-gone@example.test', 'da'), code('ACCOUNT_RETIRED_REFERENCE'))
  assert.equal(await service.contextAsync(), null)
})

function gatedControl(t, clock) {
  // Laesning af migrations-kontrollen der kan holdes tilbage, saa testen kan se om kalderen venter paa M:.
  let reads = 0, open = 0, gate = null
  const f = fixture(t, { now: () => clock.now, contextTtlMs: 5000, openStore: directory => {
    const store = createStore(directory)
    return { ...store, async getAsync(key, options) {
      if (!key.startsWith('account-migration')) return store.getAsync(key, options)
      reads++; open++
      try { if (gate) await gate.promise; return await store.getAsync(key, options) } finally { open-- }
    } }
  } })
  const drain = async () => { for (let i = 0; i < 200 && open; i++) await new Promise(resolve => setTimeout(resolve, 10)); await settle() }
  return { f, drain, reads: () => reads, hold() { let release; gate = { promise: new Promise(resolve => { release = resolve }) }; return () => { gate = null; release() } } }
}
const settle = () => new Promise(resolve => setImmediate(resolve))
test('contextAsync serves a stale terminal context at once and refreshes it in the background', async t => {
  const clock = { now: 1000000 }, io = gatedControl(t, clock)
  assert.equal(await io.f.service.contextAsync(), null)
  const first = io.reads()
  clock.now += 6000
  const release = io.hold()
  let answered = false
  const call = io.f.service.contextAsync().then(value => { answered = true; return value })
  await settle()
  const answeredAtOnce = answered
  if (!answered) { release(); await call }
  assert.equal(answeredAtOnce, true, 'the caller does not wait for the shared drive')
  assert.equal(await call, null)
  assert.ok(io.reads() > first, 'a background refresh was started')
  const during = io.reads()
  await io.f.service.contextAsync()
  assert.equal(io.reads(), during, 'one refresh at a time')
  release(); await io.drain()
  clock.now += 4000
  const afterRefresh = io.reads()
  await io.f.service.contextAsync()
  assert.equal(io.reads(), afterRefresh, 'the refresh renewed the cache time')
})
test('a migration started elsewhere blocks the call after the background refresh', async t => {
  const clock = { now: 1000000 }, io = gatedControl(t, clock)
  assert.equal(await io.f.service.contextAsync(), null)
  createStore(path.join(io.f.root, '_registry')).set('account-migration-control', { id: 'm1', root: path.resolve(io.f.root), teamId: 'A', oldEmail: io.f.oldEmail, newEmail: io.f.newEmail, state: 'running', applied: 0, total: 1 })
  clock.now += 6000
  const release = io.hold()
  const call = io.f.service.contextAsync()
  await settle(); release()
  assert.equal(await call, null, 'served from the bounded stale cache')
  await io.drain()
  await assert.rejects(io.f.service.contextAsync(), code('ACCOUNT_MIGRATION_PENDING'))
})
test('after 60 s without calls the context is read before answering', async t => {
  const clock = { now: 1000000 }, io = gatedControl(t, clock)
  assert.equal(await io.f.service.contextAsync(), null)
  createStore(path.join(io.f.root, '_registry')).set('account-migration-control', { id: 'm1', root: path.resolve(io.f.root), teamId: 'A', oldEmail: io.f.oldEmail, newEmail: io.f.newEmail, state: 'running', applied: 0, total: 1 })
  clock.now += 60000
  const release = io.hold()
  let settled = false
  const call = io.f.service.contextAsync().then(() => { settled = true }, error => { settled = true; throw error })
  await settle()
  assert.equal(settled, false, 'the caller waits for the shared drive')
  release()
  await assert.rejects(call, code('ACCOUNT_MIGRATION_PENDING'))
})
