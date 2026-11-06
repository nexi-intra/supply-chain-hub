const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAuthService, hashPassword, verifyPassword, sessionKey, loadDeviceSecret } = require('./authService.cjs')

function memory() {
  const values = new Map()
  const get = key => structuredClone(values.get(key))
  const mutate = (key, callback) => { const next = callback(structuredClone(values.get(key))); if (next !== undefined) values.set(key, structuredClone(next)); return structuredClone(next) }
  const update = (key, operation) => mutate(key, current => {
    const next = { ...(current || {}) }
    if (operation.op === 'deleteField') delete next[operation.field]
    else next[operation.field] = structuredClone(operation.value)
    return next
  })
  return {
    get, mutate, update,
    async getAsync(key) { return get(key) },
    async mutateAsync(key, callback) { return mutate(key, callback) },
    async updateAsync(key, operation) { return update(key, operation) },
  }
}
function fixture() {
  const team = { teamId: 'a', folderName: 'A' }, second = { teamId: 'b', folderName: 'B' }
  const teams = [team], assignments = new Map([['user@example.test', 'a'], ['creator@example.test', 'a']])
  const stores = new Map([['a', memory()], ['b', memory()]]), sessions = memory()
  let clock = 1000000, root = 'synthetic-root', selected
  stores.get('a').mutate('users', () => ({
    'user@example.test': { email: 'user@example.test', username: 'sample', fullName: 'Synthetic User', password: 'secret123', status: 'approved', role: 'user', phone: '123' },
    'creator@example.test': { email: 'creator@example.test', password: 'creator123', status: 'approved', role: 'creator' },
  }))
  const deps = {
    registry: {
      listTeams: () => structuredClone(teams),
      lookupTeamForEmail: (_, email) => teams.find(item => item.teamId === assignments.get(email)),
      getCreatorEmail: () => 'creator@example.test',
      assignUserToTeam: (_, email, id) => assignments.set(email, id),
    },
    getRoot: () => root, openTeam: item => stores.get(item.teamId), openSessions: () => sessions,
    switchTeam: item => { selected = item.teamId }, deviceSecret: Buffer.alloc(32, 7), now: () => clock,
  }
  return { auth: createAuthService(deps), deps, sessions, teams, second, assignments, users: stores.get('a'), stores,
    changeUser(change) { stores.get('a').mutate('users', users => ({ ...users, 'user@example.test': { ...users['user@example.test'], ...change } })) },
    advance: value => { clock += value }, changeRoot: () => { root = 'other-root' }, selected: () => selected,
    login: { email: 'user@example.test', password: 'secret123' },
  }
}
const code = expected => error => error.code === expected
test('recovery login does not upgrade a creator password, expire other sessions or remove a previous affected-user session', async () => {
  const f = fixture(), previous = await f.auth.login(1, f.login)
  const originalPassword = f.users.get('users')['creator@example.test'].password
  const auth = createAuthService({ ...f.deps, runAuthentication: (_, callback) => callback({ recovering: true }), runAuthenticationAsync: async (_, callback) => callback({ recovering: true }) })
  const user = await auth.login(2, f.login)
  const expired = { authVersion: 1, email: 'user@example.test', expiresAt: 1 }
  f.sessions.mutate('active-sessions', sessions => ({ ...sessions, expired }))
  const creator = await auth.login(2, { email: 'creator@example.test', password: 'creator123' })
  assert.equal(creator.role, 'creator'); assert.equal(f.users.get('users')['creator@example.test'].password, originalPassword)
  assert.ok(f.sessions.get('active-sessions')[sessionKey(previous.token)])
  assert.ok(f.sessions.get('active-sessions')[sessionKey(user.token)])
  assert.deepEqual(f.sessions.get('active-sessions').expired, expired)
})

test('native login upgrades a legacy password and persists only a signed token hash', async () => {
  const f = fixture(), actor = await f.auth.login(1, { ...f.login, role: 'creator' })
  assert.equal(actor.role, 'user'); assert.equal(f.selected(), 'a')
  assert.equal(actor.password, undefined); assert.equal(actor.signature, undefined)
  assert.match(f.users.get('users')[actor.email].password, /^pbkdf2\$/)
  assert.equal(await verifyPassword('secret123', f.users.get('users')[actor.email].password), true)
  const persisted = f.sessions.get('active-sessions')
  assert.equal(persisted[actor.token], undefined)
  assert.match(persisted[sessionKey(actor.token)].signature, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(persisted).includes(actor.token), false)
})
test('password hashing is compatible and rejects malformed or excessive-cost hashes', async () => {
  const hash = await hashPassword('test123')
  assert.equal(await verifyPassword('test123', hash), true)
  assert.equal(await verifyPassword('wrong', hash), false)
  for (const invalid of [null, '', 'pbkdf2$999999999$AAAA$AAAA', 'pbkdf2$150000$bad!$bad!']) assert.equal(await verifyPassword('test123', invalid), false)
})
test('unknown sender, bad credentials and caller-supplied roles grant no identity', async () => {
  const f = fixture()
  assert.throws(() => f.auth.current(1), code('AUTH_REQUIRED'))
  await assert.rejects(f.auth.login(1, { ...f.login, password: 'bad', role: 'creator' }), code('AUTH_CREDENTIALS'))
  assert.throws(() => f.auth.current(1), code('AUTH_REQUIRED'))
})
for (const status of ['pending', 'rejected']) test(`native login rejects ${status} accounts`, async () => {
  const f = fixture(); f.changeUser({ status })
  await assert.rejects(f.auth.login(1, f.login), code(status === 'pending' ? 'AUTH_PENDING' : 'AUTH_REJECTED'))
})
for (const [role, isManager, expected] of [['creator', false, 'user'], ['user', true, 'user'], ['manager', false, 'manager'], ['admin', false, 'manager'], [undefined, true, 'manager']]) {
  test(`stored role ${role}/${isManager} resolves to ${expected}, without creator impersonation`, async () => {
    const f = fixture(); f.changeUser({ role, isManager })
    assert.equal((await f.auth.login(1, f.login)).role, expected)
  })
}
test('only the configured creator identity receives creator privileges', async () => {
  const f = fixture()
  await f.auth.login(1, { email: 'creator@example.test', password: 'creator123' })
  assert.equal(f.auth.requireRole(1, 'creator').role, 'creator')
})
test('username login rejects ambiguity across teams', async () => {
  const f = fixture()
  assert.equal((await f.auth.login(1, { ...f.login, email: 'SAMPLE' })).email, f.login.email)
  f.teams.push(f.second); f.assignments.set('other@example.test', 'b')
  f.stores.get('b').mutate('users', () => ({ 'other@example.test': { email: 'other@example.test', username: 'sample', password: 'secret123' } }))
  await assert.rejects(f.auth.login(2, { ...f.login, email: 'sample' }), code('AUTH_CREDENTIALS'))
})
test('a session can resume on the same device but not a different device', async () => {
  const f = fixture(), actor = await f.auth.login(1, f.login)
  f.auth.forget(1)
  assert.equal((await f.auth.resume(2, actor.token)).email, f.login.email)
  const foreign = createAuthService({ ...f.deps, deviceSecret: Buffer.alloc(32, 8) })
  await assert.rejects(foreign.resume(3, actor.token), code('AUTH_REQUIRED'))
})
test('unsigned legacy tokens and fabricated records cannot resume', async () => {
  const f = fixture(), token = `session_${'a'.repeat(64)}`
  f.sessions.update('active-sessions', { op: 'setField', field: sessionKey(token), value: { email: f.login.email, expiresAt: 999999999, authVersion: 1 } })
  await assert.rejects(f.auth.resume(1, token), code('AUTH_REQUIRED'))
  await assert.rejects(f.auth.resume(1, 'session_old'), code('AUTH_REQUIRED'))
})
for (const change of [{ email: 'creator@example.test' }, { expiresAt: 999999999999 }, { teamId: 'b' }]) test(`editing a shared session ${Object.keys(change)[0]} invalidates its signature`, async () => {
  const f = fixture(), actor = await f.auth.login(1, f.login), key = sessionKey(actor.token)
  f.sessions.mutate('active-sessions', records => ({ ...records, [key]: { ...records[key], ...change } }))
  f.advance(500); assert.throws(() => f.auth.current(1), code('AUTH_REQUIRED'))
})
test('roles are reloaded and password reset, expiry and root changes revoke access within the snapshot window', async () => {
  const f = fixture(); await f.auth.login(1, f.login)
  f.changeUser({ role: 'manager' }); f.advance(500); assert.equal(f.auth.current(1).role, 'manager')
  f.changeUser({ role: 'user' }); f.advance(500); assert.throws(() => f.auth.requireRole(1, 'manager'), code('AUTH_FORBIDDEN'))
  f.changeUser({ password: undefined }); f.advance(500); assert.throws(() => f.auth.current(1), code('AUTH_REQUIRED'))
  const g = fixture(); await g.auth.login(1, g.login); g.advance(24 * 60 * 60 * 1000)
  assert.throws(() => g.auth.current(1), code('AUTH_REQUIRED'))
  const h = fixture(); await h.auth.login(1, h.login); h.changeRoot()
  assert.throws(() => h.auth.current(1), code('AUTH_REQUIRED'))
})
test('local account migration invalidates cached actors in every open window immediately', async () => {
  const f = fixture(), actor = await f.auth.login(1, f.login)
  await f.auth.resume(2, actor.token)
  f.sessions.update('active-sessions', { op: 'deleteField', field: sessionKey(actor.token) })
  assert.equal(f.auth.current(1).email, f.login.email)
  assert.equal(f.auth.current(2).email, f.login.email)
  f.auth.invalidateAll()
  assert.throws(() => f.auth.current(1), code('AUTH_REQUIRED'))
  assert.throws(() => f.auth.current(2), code('AUTH_REQUIRED'))
})
test('bursts of authorization checks reuse one session snapshot until the window elapses', async () => {
  const f = fixture(); await f.auth.login(1, f.login)
  let reads = 0; const real = f.sessions.get.bind(f.sessions)
  f.sessions.get = key => { if (key === 'active-sessions') reads++; return real(key) }
  for (let i = 0; i < 10; i++) f.auth.current(1)
  assert.equal(reads, 0)
  f.advance(500); f.auth.current(1); assert.equal(reads, 1)
})
test('logout during asynchronous login prevents a late login from recreating the session', async () => {
  const f = fixture(), pending = f.auth.login(1, f.login)
  f.auth.logout(1)
  await assert.rejects(pending, code('AUTH_REQUIRED'))
  assert.throws(() => f.auth.current(1), code('AUTH_REQUIRED'))
  assert.equal(f.sessions.get('active-sessions'), undefined)
})
test('only one concurrent authentication per sender is allowed', async () => {
  const f = fixture(), pending = f.auth.login(1, f.login)
  await assert.rejects(f.auth.login(1, f.login), code('AUTH_BUSY'))
  await pending
})
test('signup ignores requested privileges and creates only a pending regular user', async () => {
  const f = fixture(), email = 'new@example.test'
  await f.auth.signup(1, { email, password: 'test123', fullName: 'New User', phone: '123', role: 'creator', status: 'approved', isManager: true })
  const user = f.users.get('users')[email]
  assert.equal(user.role, 'user'); assert.equal(user.status, 'pending'); assert.equal(user.isManager, false)
  assert.equal(await verifyPassword('test123', user.password), true)
  await assert.rejects(f.auth.login(1, { email, password: 'test123' }), code('AUTH_PENDING'))
})
test('signup rejects reserved creator, duplicate email and invalid typed fields', async () => {
  const f = fixture(), request = { email: f.login.email, password: 'test123', fullName: 'Test', phone: '123' }
  await assert.rejects(f.auth.signup(1, { ...request, email: 'creator@example.test' }), code('AUTH_RESERVED'))
  await assert.rejects(f.auth.signup(1, request), code('AUTH_EMAIL_EXISTS'))
  for (const change of [{ fullName: {} }, { phone: 123 }, { email: {} }]) await assert.rejects(f.auth.signup(1, { ...request, ...change }), code('AUTH_INVALID_SIGNUP'))
})
test('profile changes are limited to own phone; password change requires old password and invalidates sessions', async () => {
  const f = fixture(); const actor = await f.auth.login(1, f.login)
  await f.auth.resume(2, actor.token)
  await f.auth.profile(1, { phone: '456', email: 'creator@example.test', role: 'creator' })
  assert.equal(f.users.get('users')[f.login.email].phone, '456'); assert.equal(f.auth.current(1).role, 'user')
  await assert.rejects(f.auth.profile(1, { phone: '456', currentPassword: 'wrong', newPassword: 'changed123' }), code('AUTH_CREDENTIALS'))
  await f.auth.profile(1, { phone: '789', currentPassword: f.login.password, newPassword: 'changed123' })
  f.advance(500); assert.throws(() => f.auth.current(1), code('AUTH_REQUIRED')); assert.throws(() => f.auth.current(2), code('AUTH_REQUIRED'))
  assert.equal(await verifyPassword('changed123', f.users.get('users')[f.login.email].password), true)
})
test('logout removes its token only; remember renewal remains signed', async () => {
  const f = fixture(), first = await f.auth.login(1, f.login), second = await f.auth.login(2, f.login)
  f.advance(1000); assert.ok((await f.auth.renew(1)).expiresAt > first.expiresAt)
  await f.auth.logout(1)
  assert.equal(f.sessions.get('active-sessions')[sessionKey(first.token)], undefined)
  assert.equal(f.auth.current(2).token, second.token)
})
test('a replacement login atomically replaces its previous token and cleans expired native sessions only', async () => {
  const f = fixture(), first = await f.auth.login(1, f.login)
  f.sessions.mutate('active-sessions', sessions => ({ ...sessions, expired: { authVersion: 1, expiresAt: 0 }, legacy: { expiresAt: 0 }, other: { authVersion: 1, expiresAt: 999999999 } }))
  const second = await f.auth.login(1, f.login), persisted = f.sessions.get('active-sessions')
  assert.equal(persisted[sessionKey(first.token)], undefined); assert.ok(persisted[sessionKey(second.token)])
  assert.equal(persisted.expired, undefined); assert.ok(persisted.legacy); assert.ok(persisted.other)
})
test('device secret is persisted without overwrite and malformed existing secret fails closed', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-auth-secret-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const target = path.join(directory, 'key'), first = loadDeviceSecret(target)
  assert.equal(first.length, 32); assert.deepEqual(loadDeviceSecret(target), first)
  const invalid = path.join(directory, 'invalid'); fs.writeFileSync(invalid, 'invalid')
  assert.throws(() => loadDeviceSecret(invalid), code('AUTH_DEVICE_KEY_INVALID'))
  assert.equal(fs.readFileSync(invalid, 'utf8'), 'invalid')
})

function asyncSessions(f) {
  // Mirrors store.getAsync: the read resolves later, so tests can act while it is in flight.
  let reads = 0, gate = null
  f.sessions.getAsync = async key => { if (key === 'active-sessions') reads++; if (gate) await gate.promise; return f.sessions.get(key) }
  return {
    reads: () => reads,
    hold() { let release; gate = { promise: new Promise(resolve => { release = resolve }) }; return () => { const open = gate; gate = null; release(); return open } },
  }
}
test('currentAsync reads the shared drive asynchronously, caches for contextTtlMs and shares one resolve per window', async () => {
  const f = fixture(), auth = createAuthService({ ...f.deps, contextTtlMs: 15000 })
  await auth.login(1, f.login)
  const io = asyncSessions(f)
  f.advance(15000)
  const [a, b, c] = await Promise.all([auth.currentAsync(1), auth.currentAsync(1), auth.currentAsync(1)])
  assert.equal(io.reads(), 1, 'concurrent calls share one read')
  assert.deepEqual([a.email, b.email, c.email], [f.login.email, f.login.email, f.login.email])
  f.advance(14000); await auth.currentAsync(1); auth.current(1)
  assert.equal(io.reads(), 1, 'within the window nothing is read again, sync current() included')
  f.advance(1000); await auth.currentAsync(1)
  assert.equal(io.reads(), 2)
})
test('a role change seen by the watcher (invalidateAll) during an asynchronous resolve is never cached', async () => {
  const f = fixture(), auth = createAuthService({ ...f.deps, contextTtlMs: 15000 })
  await auth.login(1, f.login)
  const io = asyncSessions(f)
  f.advance(15000)
  const release = io.hold()
  const pending = auth.currentAsync(1)
  f.changeUser({ role: 'manager' }); auth.invalidateAll()
  release()
  await pending
  assert.equal((await auth.currentAsync(1)).role, 'manager')
  assert.equal(io.reads(), 2, 'the result of a resolve that overlapped an invalidation was not cached')
})
test('logout while an asynchronous resolve is in flight fails it and caches nothing', async () => {
  const f = fixture(), auth = createAuthService({ ...f.deps, contextTtlMs: 15000 })
  await auth.login(1, f.login)
  const io = asyncSessions(f)
  f.advance(15000)
  const release = io.hold()
  const pending = auth.currentAsync(1)
  const loggedOut = auth.logout(1)
  release()
  await assert.rejects(pending, code('AUTH_REQUIRED'))
  await assert.rejects(auth.currentAsync(1), code('AUTH_REQUIRED'))
  await loggedOut
})
function syncForbidden(store) {
  for (const name of ['get', 'mutate', 'update', 'set']) store[name] = () => { throw new Error('SYNC_CALLED') }
}
test('login, resume, renew and logout never call synchronous store methods', async () => {
  const f = fixture(), peek = f.sessions.get
  syncForbidden(f.sessions); for (const store of f.stores.values()) syncForbidden(store)
  let prefetches = 0
  const auth = createAuthService({ ...f.deps, registry: { ...f.deps.registry, prefetchAsync: async () => { prefetches++ } } })
  const actor = await auth.login(1, { ...f.login, email: 'sample' })
  assert.equal(actor.email, f.login.email)
  assert.equal((await auth.resume(2, actor.token)).email, f.login.email)
  f.advance(1000)
  assert.ok((await auth.renew(1)).expiresAt > actor.expiresAt)
  assert.ok(peek('active-sessions')[sessionKey(actor.token)])
  await auth.logout(1)
  assert.equal(peek('active-sessions')[sessionKey(actor.token)], undefined)
  assert.ok(prefetches >= 2)
  await assert.rejects(auth.currentAsync(1), code('AUTH_REQUIRED'))
})
function gatedAuthentication() {
  let release, entered
  const reached = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  return { reached, release: () => release(), runAuthenticationAsync: async (_, callback) => { entered(); await gate; return callback({ recovering: false }) } }
}
test('logout while login waits for the account lock prevents the login from creating a session or binding', { timeout: 10000 }, async () => {
  const f = fixture(), lock = gatedAuthentication()
  f.changeUser({ password: await hashPassword(f.login.password) })
  const auth = createAuthService({ ...f.deps, runAuthenticationAsync: lock.runAuthenticationAsync })
  const pending = auth.login(1, f.login)
  await lock.reached
  await auth.logout(1)
  lock.release()
  await assert.rejects(pending, code('AUTH_REQUIRED'))
  assert.deepEqual(f.sessions.get('active-sessions') || {}, {})
  await assert.rejects(auth.currentAsync(1), code('AUTH_REQUIRED'))
})
test('logout while resume waits for the account lock is not undone by restoring the previous binding', { timeout: 10000 }, async () => {
  const f = fixture(), first = await f.auth.login(1, f.login), second = await f.auth.login(2, f.login)
  let lock = null
  const auth = createAuthService({ ...f.deps, runAuthenticationAsync: (email, callback) => lock ? lock.runAuthenticationAsync(email, callback) : callback({ recovering: false }) })
  await auth.resume(1, first.token)
  lock = gatedAuthentication()
  const pending = auth.resume(1, second.token)
  await lock.reached
  await auth.logout(1)
  lock.release()
  await assert.rejects(pending, code('AUTH_REQUIRED'))
  await assert.rejects(auth.currentAsync(1), code('AUTH_REQUIRED'))
  assert.ok(f.sessions.get('active-sessions')[sessionKey(first.token)], 'only the token bound at logout is removed')
})
test('renew and logout are asynchronous and logout clears the binding before its first await', async () => {
  const f = fixture(), actor = await f.auth.login(1, f.login)
  const renewing = f.auth.renew(1)
  assert.equal(typeof renewing.then, 'function'); await renewing
  const loggingOut = f.auth.logout(1)
  assert.equal(typeof loggingOut.then, 'function')
  assert.throws(() => f.auth.current(1), code('AUTH_REQUIRED'))
  await loggingOut
  assert.equal(f.sessions.get('active-sessions')[sessionKey(actor.token)], undefined)
})
test('reads made while holding the account lock during login and renew skip the read-slot queue', async () => {
  const f = fixture(), reads = []
  let locked = false
  for (const store of [f.sessions, ...f.stores.values()]) {
    const real = store.getAsync
    store.getAsync = async (key, options) => { reads.push({ key, locked, unthrottled: options?.unthrottled === true }); return real(key, options) }
  }
  const auth = createAuthService({ ...f.deps, runAuthenticationAsync: async (_email, callback) => { locked = true; try { return await callback({ recovering: false }) } finally { locked = false } } })
  const actor = await auth.login(1, f.login)
  f.advance(1000)
  await auth.renew(1)
  const inside = reads.filter(read => read.locked)
  assert.ok(inside.some(read => read.key === 'users') && inside.some(read => read.key === 'active-sessions'), JSON.stringify(reads))
  assert.deepEqual(inside.filter(read => !read.unthrottled), [], 'every read under the account lock is unthrottled')
  assert.ok(reads.filter(read => !read.locked).every(read => !read.unthrottled), 'reads outside the lock keep the queue')
  assert.ok(actor.token)
})
