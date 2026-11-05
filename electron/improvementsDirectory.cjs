const { registeredTeamDir } = require('./teamReadPolicy.cjs')

function fail(code, message = code) { const error = new Error(message); error.code = code; throw error }
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
}
function directoryName(value) {
  return typeof value === 'string' && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value) && value.trim() ? value.trim() : null
}
function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\x00-\x1f\x7f]/.test(value)) return null
  const email = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function createImprovementsDirectory({ getRoot, listTeams, getCreatorEmail, openStore }) {
  const storeCache = new Map()
  return async function getDirectory() {
    const root = getRoot(), registry = listTeams()
    if (typeof root !== 'string' || !root.trim() || root.includes('\0') || !Array.isArray(registry) || registry.length > 100) fail('AUTH_FORBIDDEN')
    const teams = registry.map(team => {
      if (!plain(team) || typeof team.folderName !== 'string') fail('AUTH_FORBIDDEN')
      const name = directoryName(team.name)
      if (!name) fail('AUTH_FORBIDDEN')
      return { folderName: team.folderName, name }
    })
    const targets = teams.map(team => registeredTeamDir(root, teams, team.folderName))
    const directories = targets.map(target => process.platform === 'win32' ? target.directory.toLowerCase() : target.directory)
    if (new Set(directories).size !== targets.length) fail('AUTH_FORBIDDEN')
    const creatorEmail = normalizeEmail(getCreatorEmail()), people = [], emails = new Set()
    for (const { team, directory } of targets) {
      if (!storeCache.has(directory)) storeCache.set(directory, openStore(directory))
      const users = await storeCache.get(directory).getAsync('users')
      if (!plain(users)) continue
      for (const [key, user] of Object.entries(users)) {
        if (!plain(user) || (user.status && user.status !== 'approved')) continue
        const email = normalizeEmail(key) || normalizeEmail(user.email)
        if (!email) continue
        if (emails.has(email)) fail('IMPROVEMENTS_DIRECTORY', 'Duplicate approved email; registered home cannot be inferred from team stores')
        emails.add(email)
        const fullName = directoryName(user.fullName === undefined ? email : user.fullName)
        if (!fullName) continue
        const role = email === creatorEmail ? 'creator' : user.role === 'manager' || user.role === 'admin' || (!user.role && user.isManager) ? 'manager' : 'user'
        people.push({ email, fullName, teamCode: team.folderName, role })
      }
    }
    return { teams, people }
  }
}

module.exports = { createImprovementsDirectory }