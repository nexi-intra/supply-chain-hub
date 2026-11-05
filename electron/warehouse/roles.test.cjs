const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../store.cjs')
const { createRoles } = require('./roles.cjs')

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
