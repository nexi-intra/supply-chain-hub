const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { TEAMS, TEAM_IDS, isAllowedTeam, teamDataDir } = require('./teams.cjs')

test('only TCD and TRR are CountPoint teams', () => {
  assert.deepEqual(TEAM_IDS, ['TCD', 'TRR'])
  assert.equal(isAllowedTeam('TCD'), true)
  assert.equal(isAllowedTeam('TRR'), true)
  for (const other of ['PIM', 'tcd', '', '__proto__', 'constructor', undefined, null, 42]) assert.equal(isAllowedTeam(other), false)
})

test('each team counts its own storage locations', () => {
  assert.deepEqual(TEAMS.TRR.storageLocations, ['D001', 'D002', 'D003'])
  assert.deepEqual(TEAMS.TCD.storageLocations, ['D000', 'D004', 'D005', 'D006', 'D102', 'D103', 'D104', 'D105', 'D106'])
  assert.throws(() => { TEAMS.TCD.storageLocations.push('D999') })
})

test('team data lives in its own folder and unknown teams are rejected', () => {
  const root = path.resolve('C:/CountPoint Storage')
  assert.equal(teamDataDir(root, 'TCD'), path.join(root, 'TCD'))
  assert.equal(teamDataDir(root, 'TRR'), path.join(root, 'TRR'))
  assert.throws(() => teamDataDir(root, '../TCD'), { code: 'TEAM_NOT_ALLOWED' })
  assert.throws(() => teamDataDir(root, 'PIM'), { code: 'TEAM_NOT_ALLOWED' })
})
