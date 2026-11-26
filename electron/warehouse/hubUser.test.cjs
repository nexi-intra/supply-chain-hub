const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { warehouseUser, moduleUser, createTeamUsersReader } = require('./hubUser.cjs')
const { createStore } = require('../store.cjs')

const users = { 'anna@nexi.test': { email: 'Anna@Nexi.test', fullName: 'Anna Holm', role: 'user', status: 'approved' } }
const actor = (teamId, role = 'user', email = 'anna@nexi.test') => ({ email, role, activeTeam: teamId ? { teamId, folderName: teamId } : null })

test('a Hub user in the open TCD or TRR hub becomes an Optælling user with name, role and team', () => {
  assert.deepEqual(warehouseUser(actor('TCD'), users), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', team: 'TCD' })
  assert.deepEqual(warehouseUser(actor('TRR', 'manager'), users), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'manager', team: 'TRR' })
})

test('the creator and extra managers keep their Hub role; without a profile the e-mail is the name', () => {
  assert.deepEqual(warehouseUser(actor('TCD', 'creator', 'boss@nexi.test'), users), { email: 'boss@nexi.test', fullName: 'boss@nexi.test', role: 'creator', team: 'TCD', otherTeams: ['TRR'] })
})

test('the creator opens every hub, so the other warehouse hub is known also when only the home team is listed', () => {
  const creator = (teamId, home) => ({ ...actor(teamId, 'creator', 'boss@nexi.test'), teams: [{ teamId: home }] })
  assert.deepEqual(warehouseUser(creator('TCD', 'PIM'), users).otherTeams, ['TRR'])
  assert.deepEqual(warehouseUser(creator('TRR', 'TRR'), users).otherTeams, ['TCD'])
})

test('a person in both hubs knows the other hub; one hub (or another team only) adds nothing', () => {
  const both = { ...actor('TRR', 'manager'), teams: [{ teamId: 'TCD' }, { teamId: 'PIM' }, { teamId: 'TRR' }] }
  assert.deepEqual(warehouseUser(both, users), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'manager', team: 'TRR', otherTeams: ['TCD'] })
  assert.deepEqual(warehouseUser({ ...actor('TCD'), teams: [{ teamId: 'TCD' }, { teamId: 'PIM' }] }, users), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', team: 'TCD' })
})

test('any other hub (or none) is refused', () => {
  for (const teamId of ['PIM', 'tcd', null]) assert.throws(() => warehouseUser(actor(teamId), users), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' })
  assert.throws(() => warehouseUser(actor('TCD', 'admin'), users), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' }, 'unknown roles are not trusted')
})

test('every team opens the module and gets its own tools; a team without tools gets none', () => {
  assert.deepEqual(moduleUser(actor('BPO'), users), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'user', team: 'BPO', tools: ['finland'] })
  assert.deepEqual(moduleUser(actor('PIM', 'manager'), users), { email: 'anna@nexi.test', fullName: 'Anna Holm', role: 'manager', team: 'PIM', tools: [] })
  assert.deepEqual(moduleUser(actor('TCD', 'creator', 'boss@nexi.test'), users), { email: 'boss@nexi.test', fullName: 'boss@nexi.test', role: 'creator', team: 'TCD', tools: ['timeclock', 'locations', 'counts', 'softwareload', 'finland'] })
})

test('a malformed hub (or none) and unknown roles are refused by the module too', () => {
  for (const teamId of ['tcd', null, 'B', 'BPO-1', 'A'.repeat(17)]) assert.throws(() => moduleUser(actor(teamId), users), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' }, String(teamId))
  assert.throws(() => moduleUser(actor('BPO', 'admin'), users), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' })
  assert.throws(() => moduleUser(null, users), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' })
})

// main.cjs' teamUsers: every warehouse IPC call reads the team's users (serviceUser), so it must never block on M:.
test('the team users are read without a synchronous mkdir, and a missing team folder is never made', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-team-users-'))
  await createStore(path.join(root, 'TCD')).setAsync('users', users)
  const opened = []
  const openStore = (directory, options) => { opened.push(options); return createStore(directory, options) }
  const mkdirSync = t.mock.method(fs, 'mkdirSync')
  const teamUsers = createTeamUsersReader({ openStore, teamDir: team => path.join(root, team), publicUsers: list => list && Object.fromEntries(Object.entries(list).map(([key, user]) => [key, { email: user.email, fullName: user.fullName }])) })
  assert.deepEqual(await teamUsers('TCD'), { 'anna@nexi.test': { email: 'Anna@Nexi.test', fullName: 'Anna Holm' } })
  assert.deepEqual(await teamUsers('TRR'), {}, 'no users file is no users')
  assert.equal(fs.existsSync(path.join(root, 'TRR')), false, 'the folder is only read, never made')
  await teamUsers('TCD')
  assert.equal(opened.length, 2, 'one store per folder')
  assert.ok(opened.every(options => options?.createDir === false))
  assert.equal(mkdirSync.mock.callCount(), 0)
  await assert.rejects(createTeamUsersReader({ openStore, teamDir: () => { throw Object.assign(new Error('x'), { code: 'AUTH_FORBIDDEN' }) }, publicUsers: v => v })('TCD'), { code: 'AUTH_FORBIDDEN' })
})