// Det centrale Supply Chain Hub-register: en lille samling JSON-filer der ligger
// UDEN FOR alle teams' egne lukkede datamapper, direkte under lagerroden
// (platformRoot/_registry/). Bruges til at slå en emails TEAM op FØR den
// rigtige per-team KV-store overhovedet oprettes (se main.cjs: switchToTeamDir).
// Skriver sjældent (kun ved team-/bruger-oprettelse), så det bruger ikke den
// tunge polling-watcher-infrastruktur fra store.cjs — bare simple atomiske writes.
const fs = require('fs')
const path = require('path')

function registryDir(platformRoot) {
  return path.join(platformRoot, '_registry')
}

function teamsPath(platformRoot) {
  return path.join(registryDir(platformRoot), 'teams.json')
}

function userDirectoryPath(platformRoot) {
  return path.join(registryDir(platformRoot), 'user-directory.json')
}

function platformConfigPath(platformRoot) {
  return path.join(registryDir(platformRoot), 'platform-config.json')
}

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, filePath)
}

/** @returns {Record<string, { name: string, folderName: string, createdAt: string }>} */
function readTeams(platformRoot) {
  return readJsonSafe(teamsPath(platformRoot), {})
}

function writeTeams(platformRoot, teams) {
  writeJsonAtomic(teamsPath(platformRoot), teams)
}

/** @returns {Record<string, string>} normaliseret email -> teamId */
function readUserDirectory(platformRoot) {
  return readJsonSafe(userDirectoryPath(platformRoot), {})
}

function writeUserDirectory(platformRoot, userDirectory) {
  writeJsonAtomic(userDirectoryPath(platformRoot), userDirectory)
}

/** Slår en email op og returnerer dens team ({teamId, name, folderName, createdAt}), eller null. */
function lookupTeamForEmail(platformRoot, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null
  const userDirectory = readUserDirectory(platformRoot)
  const teamId = userDirectory[normalizedEmail]
  if (!teamId) return null
  const team = readTeams(platformRoot)[teamId]
  if (!team) return null
  return { teamId, ...team }
}

function listTeams(platformRoot) {
  const teams = readTeams(platformRoot)
  return Object.entries(teams).map(([teamId, team]) => ({ teamId, ...team }))
}

/** Registrerer en email under et eksisterende team. Kaldes ved auto-tildeling og fremtidig Creator-oprettelse. */
function assignUserToTeam(platformRoot, email, teamId) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail || !teamId) return
  const userDirectory = readUserDirectory(platformRoot)
  userDirectory[normalizedEmail] = teamId
  writeUserDirectory(platformRoot, userDirectory)
}

/** Opretter et nyt team i registret og returnerer dets teamId. */
function createTeam(platformRoot, { teamId, name, folderName }) {
  const teams = readTeams(platformRoot)
  if (teams[teamId]) throw new Error(`Team "${teamId}" findes allerede i registret`)
  teams[teamId] = { name, folderName, createdAt: new Date().toISOString() }
  writeTeams(platformRoot, teams)
  return teamId
}

/**
 * Creatorens email gemmes som DATA i registret (platform-config.json), IKKE hardcodet i
 * kildekoden — så rollen kan overdrages til en anden konto uden ny build af appen.
 */
function getCreatorEmail(platformRoot) {
  const config = readJsonSafe(platformConfigPath(platformRoot), {})
  return config.creatorEmail || null
}

function setCreatorEmail(platformRoot, email) {
  const config = readJsonSafe(platformConfigPath(platformRoot), {})
  config.creatorEmail = String(email || '').trim().toLowerCase()
  writeJsonAtomic(platformConfigPath(platformRoot), config)
}

module.exports = {
  registryDir,
  teamsPath,
  userDirectoryPath,
  platformConfigPath,
  readTeams,
  writeTeams,
  readUserDirectory,
  writeUserDirectory,
  lookupTeamForEmail,
  listTeams,
  assignUserToTeam,
  createTeam,
  getCreatorEmail,
  setCreatorEmail,
}
