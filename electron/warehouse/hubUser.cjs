// The signed-in Hub person as an Optælling user. The open hub is the team; only TCD and TRR use Warehouse Management.
const { TEAM_IDS, isAllowedTeam } = require('./teams.cjs')

const ROLES = new Set(['user', 'manager', 'creator'])
const normalize = value => String(value || '').trim().toLowerCase()

function refused() {
  return Object.assign(new Error('WAREHOUSE_TEAM_NOT_ALLOWED'), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' })
}

/**
 * `actor` = authService.current(sender); `users` = the open team's public users. `otherTeams` lists the other warehouse
 * hubs the person belongs to (`actor.teams`: home and extra manager teams; the creator opens every hub), and is left
 * out when there are none.
 */
function warehouseUser(actor, users) {
  const team = actor?.activeTeam?.teamId
  if (!isAllowedTeam(team) || !ROLES.has(actor.role)) throw refused()
  const email = normalize(actor.email)
  const profile = Object.entries(users || {}).find(([key, user]) => normalize(user?.email || key) === email)?.[1]
  const fullName = typeof profile?.fullName === 'string' && profile.fullName.trim() ? profile.fullName.trim() : email
  const member = new Set(actor.role === 'creator' ? TEAM_IDS : (Array.isArray(actor.teams) ? actor.teams : []).map(item => item?.teamId))
  const otherTeams = TEAM_IDS.filter(id => id !== team && member.has(id))
  return { email, fullName, role: actor.role, team, ...(otherTeams.length ? { otherTeams } : {}) }
}

module.exports = { warehouseUser }
