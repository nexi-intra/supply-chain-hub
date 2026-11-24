const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../store.cjs')
const { createRoles, createRoleCache } = require('./roles.cjs')

const MONA = { email: 'mona@example.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
const ANNA = { email: 'anna@example.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const BO = { email: 'bo@example.test', fullName: 'Bo', role: 'user', team: 'TCD' }
const TEAM_USERS = {
  TCD: [
    { email: 'anna@example.test', fullName: 'Anna', role: 'user' },
    { email: 'bo@example.test', fullName: 'Bo', role: 'user' },
    { email: 'mona@example.test', fullName: 'Mona', role: 'manager' },
  ],
  TRR: [{ email: 'trine@example.test', fullName: 'Trine', role: 'user' }],
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-roles-'))
  const stores = new Map()
  const storeFor = team => {
    if (!stores.has(team)) stores.set(team, createStore(path.join(root, team)))
    return stores.get(team)
  }
  const clock = { now: 1000 }
  return createRoles({ storeFor, listTeamUsers: async team => TEAM_USERS[team], now: () => clock.now })
}

test('a manager makes a user admin in the app; everyone sees it at once and the change is logged', async () => {
  const roles = setup()
  let list = await roles.list(ANNA)
  assert.equal(list.canEdit, false)
  assert.equal(list.team, 'TCD')
  assert.deepEqual(list.users.map(user => `${user.email}:${user.role}`), ['anna@example.test:user', 'bo@example.test:user', 'mona@example.test:manager'])

  await roles.setAdmin(MONA, { email: 'Anna@Example.test', admin: true })
  assert.equal(await roles.roleOf(ANNA), 'admin')
  assert.equal(await roles.roleOf(MONA), 'manager')
  list = await roles.list(ANNA)
  assert.equal(list.users.find(user => user.email === 'anna@example.test').role, 'admin')
  assert.deepEqual(list.log.map(entry => `${entry.action}:${entry.email}:${entry.by.name}`), ['admin-added:anna@example.test:Mona'])

  await roles.setAdmin(MONA, { email: 'anna@example.test', admin: false })
  assert.equal(await roles.roleOf(ANNA), 'user')
  assert.equal((await roles.list(MONA)).log[0].action, 'admin-removed', 'newest first')
})

test('only managers change roles, only for users of their own team, and managers are never made admin', async () => {
  const roles = setup()
  await assert.rejects(roles.setAdmin(ANNA, { email: 'bo@example.test', admin: true }), { code: 'MANAGER_ONLY' })
  await assert.rejects(roles.setAdmin(MONA, { email: 'trine@example.test', admin: true }), { code: 'ROLE_INVALID' })
  await assert.rejects(roles.setAdmin(MONA, { email: 'mona@example.test', admin: true }), { code: 'ROLE_INVALID' })
  await assert.rejects(roles.setAdmin(MONA, { email: 'x', admin: true }), { code: 'ROLE_INVALID' })
  await assert.rejects(roles.setRole(MONA, { email: 'bo@example.test', role: 'manager' }), { code: 'ROLE_INVALID' })
  assert.equal(await roles.roleOf({ ...ANNA, team: 'TRR' }), 'user', 'admin is per team')
})

test('only a real manager makes someone status manager; a status manager can appoint admins but not status managers', async () => {
  const roles = setup()
  await roles.setRole(MONA, { email: 'anna@example.test', role: 'status-manager' })
  assert.equal(await roles.roleOf(ANNA), 'status-manager')
  assert.equal((await roles.list(MONA)).log[0].action, 'status-manager-added')

  // How main.cjs passes a status manager on: as a manager, marked as status manager.
  const acting = { ...ANNA, role: 'manager', statusManager: true }
  assert.equal(await roles.roleOf(acting), 'status-manager')
  const list = await roles.list(acting)
  assert.deepEqual([list.canEdit, list.canGrantStatusManager], [true, false])
  assert.equal((await roles.list(MONA)).canGrantStatusManager, true)
  await roles.setRole(acting, { email: 'bo@example.test', role: 'admin' })
  assert.equal(await roles.roleOf(BO), 'admin')
  await assert.rejects(roles.setRole(acting, { email: 'bo@example.test', role: 'status-manager' }), { code: 'MANAGER_ONLY' })
  await assert.rejects(roles.setRole(acting, { email: 'anna@example.test', role: 'user' }), { code: 'MANAGER_ONLY' })

  await roles.setRole(MONA, { email: 'bo@example.test', role: 'status-manager' })
  assert.equal(await roles.roleOf(BO), 'status-manager', 'admin becomes status manager, never both')
  await roles.setRole(MONA, { email: 'anna@example.test', role: 'user' })
  assert.equal(await roles.roleOf(ANNA), 'user')
  assert.equal((await roles.list(MONA)).log[0].action, 'status-manager-removed')
})

test('a manager makes a colleague Placerings admin, independent of the Optælling role, and it is logged', async () => {
  const roles = setup()
  await roles.setRole(MONA, { email: 'anna@example.test', role: 'admin' })
  assert.deepEqual(await roles.setLocationAdmin(MONA, { email: 'ANNA@example.test', admin: true }), { email: 'anna@example.test', locationAdmin: true })
  let list = await roles.list(MONA)
  const anna = () => list.users.find(user => user.email === 'anna@example.test')
  assert.deepEqual([anna().role, anna().locationRole], ['admin', 'location-admin'])
  assert.equal(list.users.find(user => user.email === 'mona@example.test').locationRole, 'manager')
  assert.equal(list.log[0].action, 'location-admin-added')
  await roles.setRole(MONA, { email: 'anna@example.test', role: 'user' })
  list = await roles.list(MONA)
  assert.deepEqual([anna().role, anna().locationRole], ['user', 'location-admin'], 'the Optælling role does not touch Placeringer')
  await roles.setLocationAdmin(MONA, { email: 'anna@example.test', admin: false })
  list = await roles.list(MONA)
  assert.equal(anna().locationRole, 'user')
  assert.equal(list.log[0].action, 'location-admin-removed')
})

test('only a Hub manager grants Placerings admin; a status manager or admin cannot', async () => {
  const roles = setup()
  await roles.setRole(MONA, { email: 'anna@example.test', role: 'status-manager' })
  const statusManager = { ...ANNA, role: 'manager', statusManager: true }
  await assert.rejects(roles.setLocationAdmin(statusManager, { email: 'bo@example.test', admin: true }), { code: 'MANAGER_ONLY' })
  await assert.rejects(roles.setLocationAdmin(BO, { email: 'anna@example.test', admin: true }), { code: 'MANAGER_ONLY' })
  await assert.rejects(roles.setLocationAdmin(MONA, { email: 'mona@example.test', admin: true }), { code: 'ROLE_INVALID' }, 'managers already have every right')
  await assert.rejects(roles.setLocationAdmin(MONA, { email: 'trine@example.test', admin: true }), { code: 'ROLE_INVALID' }, 'not in the team')
})

test('isLocationAdmin: managers and Placerings admins yes; Optælling admin and status manager no', async () => {
  const roles = setup()
  await roles.setRole(MONA, { email: 'anna@example.test', role: 'admin' })
  await roles.setRole(MONA, { email: 'bo@example.test', role: 'status-manager' })
  assert.equal(await roles.isLocationAdmin(MONA), true)
  assert.equal(await roles.isLocationAdmin({ ...MONA, role: 'creator' }), true)
  assert.equal(await roles.isLocationAdmin(ANNA), false, 'Optælling admin')
  assert.equal(await roles.isLocationAdmin({ ...BO, role: 'manager', statusManager: true }), false, 'status manager (passed on as a manager)')
  await roles.setLocationAdmin(MONA, { email: 'anna@example.test', admin: true })
  assert.equal(await roles.isLocationAdmin(ANNA), true)
  await roles.setLocationAdmin(MONA, { email: 'bo@example.test', admin: true })
  assert.equal(await roles.isLocationAdmin({ ...BO, role: 'manager', statusManager: true }), true, 'a status manager can also be Placerings admin')
})

test('when M: is down, a role read fails as a storage error instead of "not a Placerings admin"', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-roles-down-'))
  const store = createStore(path.join(root, 'TCD'))
  const roles = createRoles({ storeFor: () => store, listTeamUsers: async team => TEAM_USERS[team] })
  assert.equal(await roles.isLocationAdmin(ANNA), false, 'reachable and no roles yet: not an admin')
  fs.rmSync(root, { recursive: true, force: true })
  store.invalidate()
  await assert.rejects(roles.isLocationAdmin(ANNA), { code: 'STORAGE_UNAVAILABLE' })
})

// The role cache in front of roleOf (register.cjs): 30 s fresh, then served while it is read again, but never past a hard
// limit; a removed status manager or admin must not keep the rights while the roles file cannot be read.
function cacheSetup() {
  const clock = { now: 1000 }
  const source = { role: 'admin', fail: false, hang: false, reads: 0 }
  const roleOf = async () => {
    source.reads++
    // A hanging read (M: not answering) until the test releases it.
    if (source.hang) await new Promise(resolve => { source.release = resolve })
    if (source.fail) throw Object.assign(new Error('EBUSY'), { code: 'STORAGE_UNAVAILABLE' })
    return source.role
  }
  const cache = createRoleCache({ roleOf, ttlMs: 30000, maxAgeMs: 60000, readLimitMs: 50, now: () => clock.now })
  return { clock, source, cache }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('role cache: a fresh entry is served without reading the roles file again', async () => {
  const { clock, source, cache } = cacheSetup()
  assert.equal(await cache.roleOf(ANNA), 'admin')
  clock.now += 29000
  source.role = 'user'
  assert.equal(await cache.roleOf(ANNA), 'admin')
  assert.equal(source.reads, 1)
})

test('role cache: a stale entry is served at once, and a slow M: does not hold the call up', async () => {
  const { clock, source, cache } = cacheSetup()
  await cache.roleOf(ANNA)
  clock.now += 31000
  source.hang = true
  const answer = await Promise.race([cache.roleOf(ANNA), new Promise(resolve => setTimeout(() => resolve('blocked'), 200))])
  assert.equal(answer, 'admin')
  assert.equal(source.reads, 2, 'read again in the background')
})

test('role cache: a failed refresh within the hard limit keeps the old role', async () => {
  const { clock, source, cache } = cacheSetup()
  await cache.roleOf(ANNA)
  clock.now += 31000
  source.fail = true
  assert.equal(await cache.roleOf(ANNA), 'admin')
  await settle()
  clock.now += 20000
  assert.equal(await cache.roleOf(ANNA), 'admin', 'still within 60 s of the last good read')
})

test('role cache: after the hard limit a failed read gives the role "user"', async () => {
  const { clock, source, cache } = cacheSetup()
  source.role = 'status-manager'
  await cache.roleOf(ANNA)
  clock.now += 31000
  source.fail = true
  assert.equal(await cache.roleOf(ANNA), 'status-manager')
  await settle()
  clock.now += 30000
  assert.equal(await cache.roleOf(ANNA), 'user', 'the failed refresh did not renew the old role')
  assert.equal(await cache.roleOf(ANNA), 'user', 'and it is not served again on the next call')
  source.fail = false
  assert.equal(await cache.roleOf(ANNA), 'status-manager', 'a good read is used again')
})

test('role cache: after the hard limit the call waits for the fresh read', async () => {
  const { clock, source, cache } = cacheSetup()
  await cache.roleOf(ANNA)
  clock.now += 60000
  source.role = 'user'
  assert.equal(await cache.roleOf(ANNA), 'user')
  assert.equal(source.reads, 2)
})

test('role cache: a successful refresh updates the role, and a role change through this Hub drops the cache', async () => {
  const { clock, source, cache } = cacheSetup()
  await cache.roleOf(ANNA)
  clock.now += 31000
  source.role = 'user'
  assert.equal(await cache.roleOf(ANNA), 'admin', 'the stale value while it is read again')
  await settle()
  assert.equal(await cache.roleOf(ANNA), 'user')
  source.role = 'status-manager'
  cache.drop()
  assert.equal(await cache.roleOf(ANNA), 'status-manager')
  assert.equal(await cache.roleOf({ ...ANNA, team: 'TRR' }), 'status-manager', 'per team')
  assert.equal(source.reads, 4)
})

const within = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve('blocked'), ms))])

test('role cache: a plain user is never held up by a hanging M:, also past the hard limit', async () => {
  const { clock, source, cache } = cacheSetup()
  source.role = 'user'
  await cache.roleOf(ANNA)
  clock.now += 61000
  source.hang = true
  source.role = 'admin'
  assert.equal(await within(cache.roleOf(ANNA), 20), 'user', 'answered at once, not after the read limit')
  assert.equal(source.reads, 2, 'read again in the background')
  source.release()
  await settle()
  assert.equal(await cache.roleOf(ANNA), 'admin', 'the background read is used once it lands')
})

test('role cache: a privileged role past the hard limit waits only the read limit for a hanging M:, then is "user"', async () => {
  const { clock, source, cache } = cacheSetup()
  source.role = 'status-manager'
  await cache.roleOf(ANNA)
  clock.now += 61000
  source.hang = true
  const startedAt = Date.now()
  assert.equal(await within(cache.roleOf(ANNA), 1000), 'user')
  assert.ok(Date.now() - startedAt < 500, 'answered after the read limit')
  assert.equal(await within(cache.roleOf(ANNA), 20), 'user', 'while the same read still hangs, later calls do not wait again')
  assert.equal(source.reads, 2, 'one read at a time')
  source.release()
  await settle()
  assert.equal(await cache.roleOf(ANNA), 'status-manager', 'the read that finished in the background updates the cache')
})

test('role cache: a privileged role past the hard limit is kept when M: answers within the read limit', async () => {
  const { clock, source, cache } = cacheSetup()
  source.role = 'status-manager'
  await cache.roleOf(ANNA)
  clock.now += 61000
  assert.equal(await cache.roleOf(ANNA), 'status-manager')
  assert.equal(source.reads, 2)
})

test('role cache: the first read fails closed', async () => {
  const { source, cache } = cacheSetup()
  source.fail = true
  assert.equal(await cache.roleOf(ANNA), 'user')
})
test('only the role cache reads the roles file outside the shared read slots; other callers stay throttled', async () => {
  const seen = []
  const store = { getAsync: async (key, options) => { seen.push(Boolean(options?.unthrottled)); return { admins: { 'anna@example.test': {} } } } }
  const roles = createRoles({ storeFor: () => store, listTeamUsers: async team => TEAM_USERS[team] })
  assert.equal(await roles.roleOf(ANNA), 'admin')
  assert.equal(await roles.roleOf(ANNA, { unthrottled: true }), 'admin')
  assert.deepEqual(seen, [false, true])
})