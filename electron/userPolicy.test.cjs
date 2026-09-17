const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('./store.cjs')
const { publicUsers, updateUsers } = require('./userPolicy.cjs')
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-user-policy-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const store = createStore(root), creator = 'creator@example.test', email = 'user@example.test'
  const user = { email, password: 'legacy secret', fullName: 'Synthetic User', role: 'user', status: 'approved', customMetadata: { keep: true } }
  store.set('users', { [email]: user, [creator]: { email: creator, password: 'creator secret', role: 'creator' } })
  const actor = { email: 'manager@example.test', role: 'manager', viewId: null }
  return { root, store, creator, email, user, actor, update: operation => updateUsers(store, operation, actor, creator) }
}
const code = expected => error => error.code === expected
test('forms cannot set or replace backend account continuity identifiers', t => {
  const f = fixture(t)
  f.store.mutate('users', users => ({ ...users, [f.email]: { ...users[f.email], accountId: 'backend-owned' } }))
  const expected = publicUsers(f.store.get('users'))[f.email]
  f.update({ op: 'renameField', field: f.email, newField: f.email, expected, value: { ...expected, accountId: 'forged' } })
  assert.equal(f.store.get('users')[f.email].accountId, 'backend-owned')
})
test('public account reads omit all password hashes without mutating stored data', t => {
  const f = fixture(t), publicValue = publicUsers(f.store.get('users'))
  assert.equal(publicValue[f.email].password, undefined)
  assert.equal(f.store.get('users')[f.email].password, 'legacy secret')
})
test('ordinary accounts and selected read-only hubs cannot mutate accounts', t => {
  const f = fixture(t), op = { op: 'deleteField', field: f.email }
  f.actor.role = 'user'; assert.throws(() => f.update(op), code('AUTH_FORBIDDEN'))
  f.actor.role = 'manager'; f.actor.viewId = 'both'; assert.throws(() => f.update(op), code('AUTH_FORBIDDEN'))
})
test('profile edits with no password preserve stored credentials and metadata', t => {
  const f = fixture(t)
  const result = f.update({ op: 'renameField', field: f.email, newField: f.email, expected: publicUsers({ user: f.user }).user, value: { email: f.email, fullName: 'Changed', password: '' } })
  assert.equal(result[f.email].password, undefined)
  assert.equal(f.store.get('users', { skipCache: true })[f.email].password, 'legacy secret')
  assert.deepEqual(f.store.get('users')[f.email].customMetadata, { keep: true })
})
test('atomic email rename compares public fields and preserves private password', t => {
  const f = fixture(t), next = 'renamed@example.test'
  f.update({ op: 'renameField', field: f.email, newField: next, expected: publicUsers({ user: f.user }).user, value: { email: next, fullName: 'Changed' } })
  const users = f.store.get('users', { skipCache: true })
  assert.equal(users[f.email], undefined); assert.equal(users[next].password, 'legacy secret'); assert.deepEqual(users[next].customMetadata, { keep: true })
})
test('a stale account snapshot cannot overwrite another manager edit', t => {
  const f = fixture(t), other = createStore(f.root), expected = publicUsers({ user: f.user }).user
  other.mutate('users', users => ({ ...users, [f.email]: { ...users[f.email], phone: 'new' } }))
  assert.throws(() => f.update({ op: 'renameField', field: f.email, newField: f.email, expected, value: { email: f.email, fullName: 'stale' } }), code('KV_CONFLICT'))
  assert.equal(f.store.get('users', { skipCache: true })[f.email].phone, 'new')
})
test('rename collision cannot replace the target account', t => {
  const f = fixture(t)
  assert.throws(() => f.update({ op: 'renameField', field: f.email, newField: f.creator, expected: publicUsers({ user: f.user }).user, value: { email: f.creator } }), code('KV_CONFLICT'))
  assert.equal(f.store.get('users', { skipCache: true })[f.creator].password, 'creator secret')
})
test('creator account cannot be deleted, renamed or edited by a manager', t => {
  const f = fixture(t)
  for (const operation of [{ op: 'deleteField', field: f.creator }, { op: 'setField', field: f.creator, value: { email: f.creator } }]) assert.throws(() => f.update(operation), code('AUTH_FORBIDDEN'))
  f.actor.role = 'creator'; assert.throws(() => f.update({ op: 'deleteField', field: f.creator }), code('AUTH_FORBIDDEN'))
})
test('creator impersonation and plaintext password replacements are rejected', t => {
  const f = fixture(t)
  const original = { op: 'renameField', field: f.email, newField: f.email, expected: publicUsers({ user: f.user }).user }
  assert.throws(() => f.update({ ...original, value: { email: f.email, role: 'creator' } }), code('AUTH_FORBIDDEN'))
  assert.throws(() => f.update({ ...original, value: { email: f.email, password: 'plaintext' } }), code('KV_INVALID_OPERATION'))
})
test('unsupported whole-array operations and prototype fields are denied', t => {
  const f = fixture(t)
  for (const operation of [{ op: 'compareAndSet', value: {} }, { op: 'setField', field: '__proto__', value: {} }, { op: 'renameField', field: f.email, newField: '../escape' }]) assert.throws(() => f.update(operation), code('AUTH_FORBIDDEN'))
})
test('a late create cannot overwrite an already created account', t => {
  const f = fixture(t)
  assert.throws(() => f.update({ op: 'setField', field: f.email, value: { ...f.user, fullName: 'must not replace' } }), code('KV_CONFLICT'))
  assert.equal(f.store.get('users', { skipCache: true })[f.email].fullName, f.user.fullName)
})
