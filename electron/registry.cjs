// Det centrale Supply Chain Hub-register: en lille samling JSON-filer der ligger
// UDEN FOR alle teams' egne lukkede datamapper, direkte under lagerroden
// (platformRoot/_registry/). Bruges til at slå en emails TEAM op FØR den
// rigtige per-team KV-store overhovedet oprettes (se main.cjs: switchToTeamDir).
// Skriver sjældent (kun ved team-/bruger-oprettelse), så det bruger ikke den
// tunge polling-watcher-infrastruktur fra store.cjs — bare simple atomiske writes.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { withFileLock } = require('./fileLock.cjs')

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

function accessViewsPath(platformRoot) {
  return path.join(registryDir(platformRoot), 'access-views.json')
}

function readJsonSafe(filePath, fallback) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Registret har et ugyldigt format')
    return value
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  // Windows/antivirus kan holde destinationsfilen ganske kort efter en læsning.
  // Bevar den atomiske replace og prøv få gange, før fejlen sendes videre.
  let lastError
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmp, filePath)
      return
    } catch (error) {
      lastError = error
      if (!['EPERM', 'EACCES'].includes(error.code)) break
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1))
    }
  }
  try { fs.unlinkSync(tmp) } catch { /* behold den oprindelige fejl */ }
  throw lastError
}

/** @returns {Record<string, { name: string, abbreviation?: string, folderName: string, createdAt: string }>} */
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

/**
 * Skrivebeskyttede samlevisninger. De er ikke teams og har derfor ingen egen
 * datamappe eller brugerliste. En person kan være tildelt flere visninger uden
 * at blive oprettet som medlem i de teams, visningen læser fra.
 * @returns {Record<string, { name: string, teamIds: string[], userEmails: string[], createdAt: string, updatedAt: string }>}
 */
function readAccessViews(platformRoot) {
  return readJsonSafe(accessViewsPath(platformRoot), {})
}

function writeAccessViews(platformRoot, views) {
  writeJsonAtomic(accessViewsPath(platformRoot), views)
}

function normalizeAccessViewInput(platformRoot, input, existing) {
  const name = String(input?.name || '').trim()
  if (!name) throw new Error('Samlevisningen skal have et navn')

  const teams = readTeams(platformRoot)
  const teamIds = [...new Set((input?.teamIds || []).map((id) => String(id).trim()).filter(Boolean))]
  if (teamIds.length < 2) throw new Error('En samlevisning skal indeholde mindst to teams')
  const unknownTeam = teamIds.find((teamId) => !teams[teamId])
  if (unknownTeam) throw new Error(`Ukendt team: ${unknownTeam}`)

  const userEmails = [...new Set((input?.userEmails || [])
    .map((email) => String(email).trim().toLowerCase())
    .filter(Boolean))]

  const now = new Date().toISOString()
  return {
    name,
    teamIds,
    userEmails,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

function listAccessViews(platformRoot) {
  return Object.entries(readAccessViews(platformRoot)).map(([viewId, view]) => ({ viewId, ...view }))
}

function listAccessViewsForEmail(platformRoot, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return []
  return listAccessViews(platformRoot).filter((view) => Array.isArray(view.userEmails) && view.userEmails.includes(normalizedEmail))
}

function createAccessView(platformRoot, input) {
  const views = readAccessViews(platformRoot)
  const viewId = String(input?.viewId || crypto.randomUUID())
  if (views[viewId]) throw new Error(`Samlevisningen "${viewId}" findes allerede`)
  views[viewId] = normalizeAccessViewInput(platformRoot, input)
  writeAccessViews(platformRoot, views)
  return { viewId, ...views[viewId] }
}

function updateAccessView(platformRoot, viewId, input) {
  const views = readAccessViews(platformRoot)
  if (!views[viewId]) throw new Error('Samlevisningen findes ikke')
  views[viewId] = normalizeAccessViewInput(platformRoot, input, views[viewId])
  writeAccessViews(platformRoot, views)
  return { viewId, ...views[viewId] }
}

function deleteAccessView(platformRoot, viewId) {
  const views = readAccessViews(platformRoot)
  if (!views[viewId]) return false
  delete views[viewId]
  writeAccessViews(platformRoot, views)
  return true
}

function normalizeTeam(teamId, team) {
  return {
    teamId,
    ...team,
    // Ældre teams har ikke feltet endnu. Team-id'et var tidligere både stabil
    // nøgle, forkortelse og mappenavn, så det er den sikre bagudkompatible værdi.
    abbreviation: team.abbreviation || teamId,
  }
}

/** Slår en email op og returnerer dens team, eller null. */
function lookupTeamForEmail(platformRoot, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null
  const userDirectory = readUserDirectory(platformRoot)
  const teamId = userDirectory[normalizedEmail]
  if (!teamId) return null
  const team = readTeams(platformRoot)[teamId]
  if (!team) return null
  return normalizeTeam(teamId, team)
}

function listTeams(platformRoot) {
  const teams = readTeams(platformRoot)
  return Object.entries(teams).map(([teamId, team]) => normalizeTeam(teamId, team))
}

/** Registrerer en email under et eksisterende team. Kaldes ved auto-tildeling og fremtidig Creator-oprettelse. */
function assignUserToTeam(platformRoot, email, teamId) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  // Existing internal accounts may use a local domain without a dot.
  if (!/^[^\s@]+@[^\s@]+$/.test(normalizedEmail)) throw new Error('Ugyldig email')
  if (!Object.hasOwn(readTeams(platformRoot), teamId)) throw new Error('Teamet findes ikke')
  const userDirectory = readUserDirectory(platformRoot)
  if (Object.hasOwn(userDirectory, normalizedEmail) && userDirectory[normalizedEmail] !== teamId) throw new Error('Emailen er allerede tilknyttet et andet team')
  userDirectory[normalizedEmail] = teamId
  writeUserDirectory(platformRoot, userDirectory)
}

/** Opretter et nyt team i registret og returnerer dets teamId. */
function createTeam(platformRoot, { teamId, name, folderName }) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(teamId || '')) || ['__proto__', 'constructor', 'prototype'].includes(teamId)) throw new Error('Ugyldigt team-id')
  if (!String(name || '').trim()) throw new Error('Teamnavnet mangler')
  if (!String(folderName || '').trim() || /[\\/<>:"|?*]/.test(folderName) || /^\./.test(folderName) || /[ .]$/.test(folderName) || ['_registry', '_shared'].includes(folderName.toLowerCase())) throw new Error('Ugyldigt mappenavn')
  const teams = readTeams(platformRoot)
  if (Object.values(teams).some(team => team.folderName.toLowerCase() === folderName.toLowerCase())) throw new Error('Mappen er allerede knyttet til et team')
  if (teams[teamId]) throw new Error(`Team "${teamId}" findes allerede i registret`)
  teams[teamId] = { name, abbreviation: teamId, folderName, createdAt: new Date().toISOString() }
  writeTeams(platformRoot, teams)
  return teamId
}

/**
 * Redigerer kun teamets visningsdata. teamId og folderName er bevidst stabile,
 * så en ændret forkortelse aldrig flytter/splitter teamets eksisterende data.
 */
function updateTeam(platformRoot, teamId, input) {
  const teams = readTeams(platformRoot)
  const existing = teams[teamId]
  if (!existing) throw new Error('Teamet findes ikke')

  const name = String(input?.name || '').trim()
  const abbreviation = String(input?.abbreviation || '').trim().toUpperCase()
  if (!name || !abbreviation) throw new Error('Udfyld navn og forkortelse')
  if (!/^[A-Z0-9_-]{1,12}$/.test(abbreviation)) {
    throw new Error('Forkortelsen må kun indeholde bogstaver, tal, _ og - (maks. 12 tegn)')
  }

  const duplicate = Object.entries(teams).find(([candidateId, team]) =>
    candidateId !== teamId && String(team.abbreviation || candidateId).trim().toUpperCase() === abbreviation)
  if (duplicate) throw new Error(`Forkortelsen "${abbreviation}" bruges allerede af et andet team`)

  teams[teamId] = { ...existing, name, abbreviation }
  writeTeams(platformRoot, teams)
  return normalizeTeam(teamId, teams[teamId])
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

// Account migrations share the ordinary registry mutation lock. The
// capability expires after the synchronous callback and is never exposed to IPC.
function withIdentityTransaction(platformRoot, callback) {
  if (typeof callback !== 'function' || require('node:util').types.isAsyncFunction(callback)) throw new Error('Registry transaction must be synchronous')
  return withFileLock(path.join(registryDir(platformRoot), 'mutation.lock'), () => {
    let active = true
    const files = { directory: userDirectoryPath(platformRoot), views: accessViewsPath(platformRoot) }
    const target = key => { if (!active || !Object.hasOwn(files, key)) throw new Error('Invalid registry transaction capability'); return files[key] }
    try {
      const result = callback({ get: key => readJsonSafe(target(key), {}), set: (key, value) => writeJsonAtomic(target(key), value) })
      if (result && typeof result.then === 'function') throw new Error('Registry transaction must be synchronous')
      return result
    } finally { active = false }
  })
}
const locked = mutate => (platformRoot, ...args) => withFileLock(path.join(registryDir(platformRoot), 'mutation.lock'), () => mutate(platformRoot, ...args))
module.exports = {
  registryDir,
  teamsPath,
  userDirectoryPath,
  platformConfigPath,
  accessViewsPath,
  readTeams,
  writeTeams: locked(writeTeams),
  readUserDirectory,
  writeUserDirectory: locked(writeUserDirectory),
  readAccessViews,
  writeAccessViews: locked(writeAccessViews),
  listAccessViews,
  listAccessViewsForEmail,
  createAccessView: locked(createAccessView),
  updateAccessView: locked(updateAccessView),
  deleteAccessView: locked(deleteAccessView),
  lookupTeamForEmail,
  listTeams,
  assignUserToTeam: locked(assignUserToTeam),
  createTeam: locked(createTeam),
  updateTeam: locked(updateTeam),
  getCreatorEmail,
  setCreatorEmail: locked(setCreatorEmail),
  withIdentityTransaction,
}
