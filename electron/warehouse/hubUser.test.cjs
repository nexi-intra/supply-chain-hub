const test = require('node:test')
const assert = require('node:assert/strict')
const { warehouseUser } = require('./hubUser.cjs')

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
