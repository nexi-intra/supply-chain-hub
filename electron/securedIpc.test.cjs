const test = require('node:test')
const assert = require('node:assert/strict')
const { createSecuredIpc, PUBLIC_CHANNELS } = require('./securedIpc.cjs')
const { createDesktopNotificationHandlers } = require('./desktopNotifications.cjs')
function fixture(accounts = null) {
  const handlers = new Map(), event = { sender: { id: 1 } }
  let actor = { email: 'user@example.test', userId: 'user_user@example.test', role: 'user', token: 'verified', home: { teamId: 'a', folderName: 'A' }, activeTeam: { teamId: 'a', folderName: 'A' }, teams: [{ teamId: 'a', folderName: 'A' }] }
  let folder = 'A', trusted = true
  const service = { current() { if (!actor) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' }); return structuredClone(actor) }, requireRole(_, role) { if (actor.role !== 'creator' && (role === 'creator' || actor.role !== 'manager')) throw Object.assign(new Error('AUTH_FORBIDDEN'), { code: 'AUTH_FORBIDDEN' }) } }
  const ipc = createSecuredIpc({ handle: (key, handler) => handlers.set(key, handler) }, { auth: () => service, accounts: () => accounts, trusted: () => trusted, currentFolder: () => folder, listTeams: () => [{ teamId: 'a', folderName: 'A' }, { teamId: 'b', folderName: 'B' }] })
  return { register(channel, handler = () => 'ok') { ipc.handle(channel, handler); return (...args) => handlers.get(channel)(event, ...args) }, actor: change => { actor = change === null ? null : { ...actor, ...change } }, folder: value => { folder = value }, trust: value => { trusted = value } }
}
const code = expected => error => error.code === expected
// Auth is awaited before a listener runs, so a test that changes context mid-call first waits for the listener to start.
const listenerStarted = async started => { for (let i = 0; i < 50 && !started(); i++) await new Promise(resolve => setImmediate(resolve)); assert.ok(started(), 'listener did not start') }
test('improvement case state cannot be bypassed through generic KV, including creator', async () => {
  const f = fixture()
  for (const role of ['user', 'manager', 'creator']) {
    f.actor({ role })
    for (const channel of ['kv:get', 'kv:set', 'kv:update', 'kv:delete']) {
      const call = f.register(channel)
      await assert.rejects(call('improvement-cases', []), code('AUTH_FORBIDDEN'))
    }
    await assert.rejects(f.register('kv:get-many')(['guides', 'improvement-cases']), code('AUTH_FORBIDDEN'))
  }
})
test('multiplayer index state cannot be bypassed through generic KV, including creator', async () => {
  const f = fixture()
  for (const role of ['user', 'manager', 'creator']) {
    f.actor({ role })
    for (const channel of ['kv:get', 'kv:set', 'kv:update', 'kv:delete']) {
      await assert.rejects(f.register(channel)('multiplayer-index', []), code('AUTH_FORBIDDEN'))
    }
    await assert.rejects(f.register('kv:get-many')(['guides', 'multiplayer-index']), code('AUTH_FORBIDDEN'))
  }
})
test('high-fives state cannot be bypassed through generic KV, including creator', async () => {
  const f = fixture()
  for (const role of ['user', 'manager', 'creator']) {
    f.actor({ role })
    for (const channel of ['kv:get', 'kv:set', 'kv:update', 'kv:delete']) {
      await assert.rejects(f.register(channel)('high-fives', []), code('AUTH_FORBIDDEN'))
    }
    await assert.rejects(f.register('kv:get-many')(['guides', 'high-fives']), code('AUTH_FORBIDDEN'))
  }
})
test('high-five commands use the account write gate and reference check while the snapshot stays ungated', async () => {
  let gated = false
  let checked = null
  const accounts = { context: () => null, assertReferences(key, value) { assert.ok(gated); checked = [key, value] }, async runWriteAsync(callback) { gated = true; try { return await callback() } finally { gated = false } } }
  const f = fixture(accounts)
  const input = { type: 'send', recipientEmail: 'new@example.test' }
  assert.equal(await f.register('highFives:command', () => { assert.ok(gated); return 'committed' })(input), 'committed')
  assert.deepEqual(checked, ['high-fives', input])
  assert.equal(await f.register('highFives:snapshot', () => { assert.equal(gated, false); return 'snapshot' })(), 'snapshot')
})
test('multiplayer commands use the account write gate and reference check while reads stay ungated', async () => {
  let gated = false
  let checked = null
  const accounts = { context: () => null, assertReferences(key, value) { assert.ok(gated); checked = [key, value] }, async runWriteAsync(callback) { gated = true; try { return await callback() } finally { gated = false } } }
  const f = fixture(accounts)
  const input = { type: 'challenge', opponentEmail: 'new@example.test' }
  assert.equal(await f.register('multiplayer:command', () => { assert.ok(gated); return 'committed' })(input), 'committed')
  assert.deepEqual(checked, ['multiplayer-index', input])
  for (const channel of ['multiplayer:snapshot', 'multiplayer:game', 'multiplayer:preview']) {
    assert.equal(await f.register(channel, () => { assert.equal(gated, false); return channel })({ gameId: 'g' }), channel)
  }
})
test('improvement commands use the account write gate while snapshots remain read-only', async () => {
  let gated = false
  let checked = false
  const accounts = { context: () => null, assertReferences(key) { assert.ok(gated); assert.equal(key, 'improvement-cases'); checked = true }, async runWriteAsync(callback) { gated = true; try { return await callback() } finally { gated = false } } }
  const f = fixture(accounts)
  assert.equal(await f.register('improvements:command', () => { assert.ok(gated); return 'committed' })({ type: 'comment' }), 'committed')
  assert.equal(await f.register('improvements:snapshot', () => { assert.equal(gated, false); return 'snapshot' })(), 'snapshot')
  assert.equal(checked, true)
})
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
})
test('asynchronous reads cannot return data across a completed account migration', async () => {
  let context = 'before', resolve
  const f = fixture({ context: () => context })
  const call = f.register('kv:get', () => new Promise(done => { resolve = done }))
  const pending = call('guides')
  await listenerStarted(() => resolve)
  context = 'after'; resolve('must not leak')
  await assert.rejects(pending, code('AUTH_CONTEXT_CHANGED'))
})
test('ordinary writes and directory assignments execute inside the account gate and check retired identities', async () => {
  let gated = false, checked = 0
  const accounts = { context: () => null, async runWriteAsync(callback) { gated = true; try { return await callback() } finally { gated = false } }, assertAvailable() { assert.ok(gated); checked++ }, assertReferences() { assert.ok(gated); checked++ } }
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
test('desktop notification channels are authenticated-only and validate their input before touching the notifier', async () => {
  for (const channel of ['notifications:desktop', 'notifications:desktop-enabled']) assert.equal(PUBLIC_CHANNELS.has(channel), false)
  const shown = [], state = { enabled: true }
  const handlers = createDesktopNotificationHandlers({ notify: request => { shown.push(request); return 'shown' }, isEnabled: () => state.enabled, setEnabled: value => { state.enabled = value } })
  const f = fixture()
  const notify = f.register('notifications:desktop', (event, request) => handlers.notify({ userId: 'u1' }, request))
  const enabled = f.register('notifications:desktop-enabled', (event, value) => handlers.enabled(value))
  const request = { id: 'x', title: 'T', body: 'B', target: { view: 'games', params: { tab: 'multiplayer', itemId: 'g' } } }
  assert.equal(await notify(request), 'shown')
  assert.equal(shown[0].id, 'u1:x')
  for (const bad of [{ ...request, target: { view: 'bogus' } }, { ...request, title: 'a'.repeat(121) }, { ...request, extra: 1 }, 'text']) await assert.rejects(notify(bad), code('NOTIFICATION_INVALID'))
  assert.equal(shown.length, 1)
  assert.equal(await enabled(false), false)
  await assert.rejects(enabled('yes'), code('NOTIFICATION_INVALID'))
  f.actor(null)
  await assert.rejects(notify(request), code('AUTH_REQUIRED'))
  await assert.rejects(enabled(), code('AUTH_REQUIRED'))
  assert.equal(shown.length, 1)
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
test('nobody can read another person\'s personal to-dos or notification state', async () => {
  const f = fixture(), get = f.register('kv:get'), many = f.register('kv:get-many')
  assert.equal(await get('todos-personal-user@example.test'), 'ok')
  await assert.rejects(get('todos-personal-other@example.test'), code('AUTH_FORBIDDEN'))
  await assert.rejects(many(['guides', 'hub-notifications-dismissed-other@example.test']), code('AUTH_FORBIDDEN'))
  f.actor({ role: 'manager' })
  await assert.rejects(get('todos-personal-other@example.test'), code('AUTH_FORBIDDEN'))
})
test('user management requires a manager and raw whole-user replacements remain forbidden', async () => {
  const f = fixture(), update = f.register('kv:update'), set = f.register('kv:set')
  await assert.rejects(update('users', {}), code('AUTH_FORBIDDEN'))
  f.actor({ role: 'manager' }); assert.equal(await update('users', {}), 'ok')
  await assert.rejects(set('users', {}), code('AUTH_FORBIDDEN'))
})
test('team switches must match a registered home, not arbitrary folders', async () => {
  const f = fixture(), call = f.register('registry:switch-to-team')
  assert.equal(await call('A'), 'ok')
  for (const folder of ['B', '../other', '_shared']) await assert.rejects(call(folder), code('AUTH_FORBIDDEN'))
})
test('a manager in an extra team may switch to it, read and write there and add users only to the open team', async () => {
  const f = fixture(), switchTeam = f.register('registry:switch-to-team'), get = f.register('kv:get'), assign = f.register('registry:assign-user')
  f.folder('B')
  await assert.rejects(get('shift-roles'), code('AUTH_FORBIDDEN'))
  f.actor({ role: 'manager', activeTeam: { teamId: 'b', folderName: 'B' }, teams: [{ teamId: 'a', folderName: 'A' }, { teamId: 'b', folderName: 'B' }] })
  assert.equal(await switchTeam('B'), 'ok')
  assert.equal(await get('shift-roles'), 'ok')
  assert.equal(await assign('new@example.test', 'b'), 'ok')
  await assert.rejects(assign('new@example.test', 'a'), code('AUTH_FORBIDDEN'))
})
test('a hub whose access was removed blocks the team data but still lets the person switch home', async () => {
  const f = fixture(), switchTeam = f.register('registry:switch-to-team'), get = f.register('kv:get')
  f.folder('B'); f.actor({ activeTeam: null })
  await assert.rejects(get('shift-roles'), code('AUTH_FORBIDDEN'))
  await assert.rejects(switchTeam('B'), code('AUTH_FORBIDDEN'))
  assert.equal(await switchTeam('A'), 'ok')
})
test('assistant must use the authenticated token', async () => {
  const f = fixture(), call = f.register('assistant:ask')
  await assert.rejects(call({ token: 'other' }), code('AUTH_FORBIDDEN'))
  assert.equal(await call({ token: 'verified' }), 'ok')
})
test('a client can consume its own forced-update request but cannot forge or delete another account request', async () => {
  const f = fixture(), call = f.register('kv:update')
  assert.equal(await call('force-update-requests', { op: 'deleteField', field: 'user@example.test' }), 'ok')
  await assert.rejects(call('force-update-requests', { op: 'deleteField', field: 'other@example.test' }), code('AUTH_FORBIDDEN'))
  await assert.rejects(call('force-update-requests', { op: 'setField', field: 'user@example.test', value: {} }), code('AUTH_FORBIDDEN'))
})
for (const change of ['logout', 'role', 'folder', 'token']) test(`an asynchronous result is discarded after ${change}`, async () => {
  const f = fixture(); let resolve
  const call = f.register('kv:get', () => new Promise(done => { resolve = done }))
  const pending = call('guides')
  await listenerStarted(() => resolve)
  if (change === 'logout') f.actor(null)
  else if (change === 'folder') f.folder('B')
  else f.actor(change === 'role' ? { role: 'manager' } : { token: 'new' })
  resolve('must not leak')
  await assert.rejects(pending, code(change === 'logout' ? 'AUTH_REQUIRED' : 'AUTH_CONTEXT_CHANGED'))
})
test('auth and the migration gate are awaited asynchronously and retired identities are prepared before a write', async () => {
  const calls = []
  const accounts = {
    context: () => { throw new Error('sync context must not be used') },
    contextAsync: async () => { calls.push('contextAsync'); return null },
    prepareReferenceChecksAsync: async () => { calls.push('prepare') },
    async runWriteAsync(callback) { calls.push('gate'); return callback() },
    assertReferences: () => { calls.push('references') },
  }
  const handlers = new Map(), event = { sender: { id: 1 } }
  const actor = { email: 'user@example.test', role: 'user', token: 't', home: { teamId: 'a', folderName: 'A' }, activeTeam: { teamId: 'a', folderName: 'A' }, teams: [{ teamId: 'a', folderName: 'A' }] }
  const service = { current: () => { throw new Error('sync current must not be used') }, currentAsync: async () => { calls.push('auth'); return structuredClone(actor) } }
  const ipc = createSecuredIpc({ handle: (key, handler) => handlers.set(key, handler) }, { auth: () => service, accounts: () => accounts, trusted: () => true, currentFolder: () => 'A', listTeams: () => [] })
  ipc.handle('kv:set', () => 'saved')
  assert.equal(await handlers.get('kv:set')(event, 'guides', []), 'saved')
  assert.deepEqual(calls, ['auth', 'contextAsync', 'prepare', 'gate', 'references', 'contextAsync', 'auth'])
})
