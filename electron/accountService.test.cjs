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
  shared.set('active-sessions', { old: { email: oldEmail, token: 'SYNTHETIC OLD TOKEN' }, creator: { email: creator, token: 'SYNTHETIC CREATOR TOKEN' } })
  registry.createAccessView(root, { viewId: 'both', name: 'Synthetic Combined', teamIds: ['A', 'B'], userEmails: [oldEmail, creator] })
  const actor = { email: creator, role: 'creator', viewId: null, home: registry.lookupTeamForEmail(root, creator) }
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
test('the read context changes on migration and creator authentication remains possible during recovery without changing private snapshots', t => {
  const f = fixture(t, { beforeStep: ({ index }) => { if (index === 2) throw new Error('synthetic stop') } })
  const context = f.service.context()
  assert.throws(f.rename)
  assert.throws(() => f.service.context(), code('ACCOUNT_MIGRATION_PENDING'))
  assert.throws(() => f.service.runAuthentication(f.oldEmail, () => {}), code('ACCOUNT_MIGRATION_PENDING'))
  assert.equal(f.service.runAuthentication(f.creator, ({ recovering }) => recovering), true)
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
  assert.equal(f.read(f.own, `app-language-user_${f.oldEmail}`), undefined); assert.equal(f.read(f.own, `app-language-user_${f.newEmail}`), 'fi')
  assert.equal(f.read(f.own, `hub-dashboard-${f.newEmail}`).tasks.size, 'compact')
  assert.equal(f.read(f.shared, 'active-sessions').old, undefined); assert.ok(f.read(f.shared, 'active-sessions').creator)
  assert.deepEqual(registry.listAccessViewsForEmail(f.root, f.newEmail)[0].teamIds, ['A', 'B']); assert.equal(registry.listAccessViewsForEmail(f.root, f.oldEmail).length, 0)
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
test('pending state and progress survive a failed write and a new service instance can resume', t => {
  let broken = true
  const f = fixture(t, { beforeStep: ({ index }) => { if (broken && index === 2) throw new Error('SYNTHETIC EACCES') } })
  assert.throws(f.rename, /SYNTHETIC EACCES/)
  const pending = f.service.status(f.actor); assert.equal(pending.state, 'failed'); assert.equal(pending.applied, 2)
  assert.throws(() => f.service.runWrite(() => f.own.set('projects', [])), code('ACCOUNT_MIGRATION_PENDING'))
  // Den asynkrone skrivevej tager ikke laengere den globale kontolaas (den
  // serialiserede ALLE brugeres gemninger). Porten skal stadig holde.
  assert.rejects(() => f.service.runWriteAsync(() => f.own.set('projects', [])), code('ACCOUNT_MIGRATION_PENDING'))
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
test('recovery and journal status never disclose private snapshots or allow ordinary users/read-only views', t => {
  const f = fixture(t, { beforeStep: () => { throw new Error('SYNTHETIC FAILURE') } }); assert.throws(f.rename)
  assert.equal(JSON.stringify(f.service.status(f.actor)).includes('PASSWORD'), false)
  for (const actor of [{ ...f.actor, role: 'user' }, { ...f.actor, viewId: 'both' }]) {
    assert.throws(() => f.service.status(actor), code('AUTH_FORBIDDEN'))
    assert.throws(() => f.service.resume(actor, f.service.pending().id), code('AUTH_FORBIDDEN'))
  }
})
test('manager can migrate own team but never a different team or the creator account', t => {
  const f = fixture(t), manager = { ...f.actor, email: 'manager@example.test', role: 'manager' }
  assert.throws(() => f.service.rename({ ...manager, home: { teamId: 'B' } }, 'A', f.operation), code('AUTH_FORBIDDEN'))
  assert.throws(() => f.service.rename(manager, 'A', { ...f.operation, field: f.creator }), code('AUTH_FORBIDDEN'))
  assert.ok(f.service.rename(manager, 'A', f.operation)[f.newEmail])
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
