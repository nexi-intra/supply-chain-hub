const test = require('node:test')
const assert = require('node:assert/strict')
const { createSecuredIpc } = require('./securedIpc.cjs')
function fixture(accounts = null) {
  const handlers = new Map(), event = { sender: { id: 1 } }
  let actor = { email: 'user@example.test', userId: 'user_user@example.test', role: 'user', token: 'verified', home: { teamId: 'a', folderName: 'A' }, viewId: null }
  let folder = 'A', trusted = true
  const service = { current() { if (!actor) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' }); return structuredClone(actor) }, requireRole(_, role) { if (actor.viewId || (actor.role !== 'creator' && (role === 'creator' || actor.role !== 'manager'))) throw Object.assign(new Error('AUTH_FORBIDDEN'), { code: 'AUTH_FORBIDDEN' }) } }
  const ipc = createSecuredIpc({ handle: (key, handler) => handlers.set(key, handler) }, { auth: () => service, accounts: () => accounts, trusted: () => trusted, currentFolder: () => folder, listTeams: () => [{ teamId: 'a', folderName: 'A' }, { teamId: 'b', folderName: 'B' }] })
  return { register(channel, handler = () => 'ok') { ipc.handle(channel, handler); return (...args) => handlers.get(channel)(event, ...args) }, actor: change => { actor = change === null ? null : { ...actor, ...change } }, folder: value => { folder = value }, trust: value => { trusted = value } }
}
const code = expected => error => error.code === expected
test('pending migrations block normal reads and writes before their handler but not authenticated recovery', async () => {
  const accounts = { context() { throw Object.assign(new Error('ACCOUNT_MIGRATION_PENDING'), { code: 'ACCOUNT_MIGRATION_PENDING' }) } }
  const f = fixture(accounts); let calls = 0
  for (const channel of ['kv:get', 'kv:set', 'assistant:ask', 'registry:update-team']) {
    const call = f.register(channel, () => { calls++; return 'must not run' })
    await assert.rejects(call('guides'), code('ACCOUNT_MIGRATION_PENDING'))
  }
  assert.equal(calls, 0)
  const recovery = f.register('accounts:resume')
  await assert.rejects(recovery('id'), code('AUTH_FORBIDDEN'))
  f.actor({ role: 'creator' }); assert.equal(await recovery('id'), 'ok')
  assert.equal(await f.register('accounts:status')(), 'ok')
  f.actor({ viewId: 'combined' }); await assert.rejects(recovery('id'), code('AUTH_FORBIDDEN'))
})
test('asynchronous reads cannot return data across a completed account migration', async () => {
  let context = 'before', resolve
  const f = fixture({ context: () => context })
  const call = f.register('kv:get', () => new Promise(done => { resolve = done }))
  const pending = call('guides'); context = 'after'; resolve('must not leak')
  await assert.rejects(pending, code('AUTH_CONTEXT_CHANGED'))
})
test('ordinary writes and directory assignments execute inside the account gate and check retired identities', async () => {
  let gated = false, checked = 0
  const accounts = { context: () => null, runWrite(callback) { gated = true; try { return callback() } finally { gated = false } }, assertAvailable() { assert.ok(gated); checked++ }, assertReferences() { assert.ok(gated); checked++ } }
  const f = fixture(accounts); f.actor({ role: 'manager' })
  assert.equal(await f.register('kv:update', () => { assert.ok(gated); return 'ok' })('users', { op: 'setField', field: 'new@example.test' }), 'ok')
  assert.equal(await f.register('registry:assign-user', () => { assert.ok(gated); return 'ok' })('new@example.test', 'a'), 'ok')
  assert.equal(checked, 3)
})
test('only a validated own-email migration can return after deliberate session revocation', async () => {
  const f = fixture({ context: () => null }); f.actor({ role: 'manager' })
  const call = f.register('kv:update', () => { f.actor(null); return { 'renamed@example.test': { email: 'renamed@example.test' } } })
  assert.deepEqual(await call('users', { op: 'renameField', field: 'user@example.test', newField: 'renamed@example.test' }), { 'renamed@example.test': { email: 'renamed@example.test' } })
})
test('every handler, including public login, rejects an untrusted window', async () => {
  const f = fixture(), call = f.register('auth:login'); f.trust(false)
  await assert.rejects(call(), code('AUTH_UNTRUSTED_WINDOW'))
})
test('unknown and ordinary handlers require a native session by default', async () => {
  const f = fixture(), call = f.register('future:feature'); f.actor(null)
  await assert.rejects(call(), code('AUTH_REQUIRED'))
})
test('guest preferences alone are available before authentication', async () => {
  const f = fixture(), call = f.register('kv:get'); f.actor(null)
  assert.equal(await call('app-language-guest'), 'ok')
  await assert.rejects(call('users'), code('AUTH_REQUIRED'))
})
test('the login screen can install the published latest version, not choose an arbitrary historical version', async () => {
  const f = fixture(), call = f.register('updates:install'); f.actor(null)
  assert.equal(await call(), 'ok')
  await assert.rejects(call({ version: '1.4.3' }), code('AUTH_REQUIRED'))
})
test('caller-supplied creator email cannot grant creator permissions', async () => {
  const f = fixture(), call = f.register('registry:update-team')
  await assert.rejects(call('creator@example.test', 'a', {}), code('AUTH_FORBIDDEN'))
  f.actor({ role: 'creator' }); assert.equal(await call('ignored', 'a', {}), 'ok')
})
test('an explicit credential backup is restricted to creator in the normal hub', async () => {
  const f = fixture(), call = f.register('backup:export')
  await assert.rejects(call(), code('AUTH_FORBIDDEN'))
  f.actor({ role: 'creator' }); assert.equal(await call(), 'ok')
  f.actor({ viewId: 'both' }); await assert.rejects(call(), code('AUTH_FORBIDDEN'))
})
test('tokens and internal keys cannot be read, updated, set or deleted through generic KV', async () => {
  const f = fixture()
  for (const channel of ['kv:get', 'kv:set', 'kv:update', 'kv:delete']) {
    const call = f.register(channel)
    for (const key of ['active-sessions', '__private', 'account-migration-journal', 'account-migration-control', 'account-retired-identities', '', {}]) await assert.rejects(call(key), code('AUTH_FORBIDDEN'))
  }
})
test('batched reads validate every key and bound the batch size', async () => {
  const f = fixture(), call = f.register('kv:get-many')
  assert.equal(await call(['users', 'guides']), 'ok')
  for (const keys of [[], ['users', 'active-sessions'], ['users', '__private'], Array(101).fill('users')]) await assert.rejects(call(keys), code('AUTH_FORBIDDEN'))
})
test('user management requires a manager and raw whole-user replacements remain forbidden', async () => {
  const f = fixture(), update = f.register('kv:update'), set = f.register('kv:set')
  await assert.rejects(update('users', {}), code('AUTH_FORBIDDEN'))
  f.actor({ role: 'manager' }); assert.equal(await update('users', {}), 'ok')
  await assert.rejects(set('users', {}), code('AUTH_FORBIDDEN'))
})
test('read-only hub blocks writes and allows only its own personal preferences', async () => {
  const f = fixture(), call = f.register('kv:set'); f.actor({ viewId: 'both' })
  await assert.rejects(call('guides', []), code('AUTH_FORBIDDEN'))
  assert.equal(await call('hub-dashboard-user@example.test', {}), 'ok')
  await assert.rejects(call('hub-dashboard-other@example.test', {}), code('AUTH_FORBIDDEN'))
  assert.equal(await call('todos-personal-user@example.test', {}), 'ok')
  await assert.rejects(call('todos-personal-other@example.test', {}), code('AUTH_FORBIDDEN'))
})
test('team switches must match a registered home, not arbitrary folders', async () => {
  const f = fixture(), call = f.register('registry:switch-to-team')
  assert.equal(await call('A'), 'ok')
  for (const folder of ['B', '../other', '_shared']) await assert.rejects(call(folder), code('AUTH_FORBIDDEN'))
})
test('assistant must use the authenticated token and selected view', async () => {
  const f = fixture(), call = f.register('assistant:ask')
  await assert.rejects(call({ token: 'other' }), code('AUTH_FORBIDDEN'))
  await assert.rejects(call({ token: 'verified', viewId: 'both' }), code('AUTH_FORBIDDEN'))
  assert.equal(await call({ token: 'verified' }), 'ok')
})
test('a client can consume its own forced-update request but cannot forge or delete another account request', async () => {
  const f = fixture(), call = f.register('kv:update')
  assert.equal(await call('force-update-requests', { op: 'deleteField', field: 'user@example.test' }), 'ok')
  await assert.rejects(call('force-update-requests', { op: 'deleteField', field: 'other@example.test' }), code('AUTH_FORBIDDEN'))
  await assert.rejects(call('force-update-requests', { op: 'setField', field: 'user@example.test', value: {} }), code('AUTH_FORBIDDEN'))
})
for (const change of ['logout', 'view', 'role', 'folder', 'token']) test(`an asynchronous result is discarded after ${change}`, async () => {
  const f = fixture(); let resolve
  const call = f.register('kv:get', () => new Promise(done => { resolve = done }))
  const pending = call('guides')
  if (change === 'logout') f.actor(null)
  else if (change === 'folder') f.folder('B')
  else f.actor(change === 'view' ? { viewId: 'both' } : change === 'role' ? { role: 'manager' } : { token: 'new' })
  resolve('must not leak')
  await assert.rejects(pending, code(change === 'logout' ? 'AUTH_REQUIRED' : 'AUTH_CONTEXT_CHANGED'))
})
