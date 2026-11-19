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
  assert.deepEqual(warehouseUser(actor('TCD', 'creator', 'boss@nexi.test'), users), { email: 'boss@nexi.test', fullName: 'boss@nexi.test', role: 'creator', team: 'TCD' })
})

test('any other hub (or none) is refused', () => {
  for (const teamId of ['PIM', 'tcd', null]) assert.throws(() => warehouseUser(actor(teamId), users), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' })
  assert.throws(() => warehouseUser(actor('TCD', 'admin'), users), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' }, 'unknown roles are not trusted')
})
