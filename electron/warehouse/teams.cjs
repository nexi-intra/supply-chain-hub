// The two teams that use CountPoint. Each team has its own data folder so their
// counts are never mixed; the storage locations are the ones each team counts.
const path = require('node:path')

const TEAMS = Object.freeze({
  TCD: Object.freeze({ id: 'TCD', storageLocations: Object.freeze(['D000', 'D004', 'D005', 'D006', 'D102', 'D103', 'D104', 'D105', 'D106']) }),
  TRR: Object.freeze({ id: 'TRR', storageLocations: Object.freeze(['D001', 'D002', 'D003']) }),
})
const TEAM_IDS = Object.freeze(Object.keys(TEAMS))

function isAllowedTeam(teamId) {
  return typeof teamId === 'string' && Object.hasOwn(TEAMS, teamId)
}

function teamDataDir(dataDir, teamId) {
  if (!isAllowedTeam(teamId)) {
    const error = new Error('TEAM_NOT_ALLOWED')
    error.code = 'TEAM_NOT_ALLOWED'
    throw error
  }
  return path.join(dataDir, teamId)
}

module.exports = { TEAMS, TEAM_IDS, isAllowedTeam, teamDataDir }
