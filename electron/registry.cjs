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

// Laesninger mod M: koster 100-1500 ms og blev lavet SYNKRONT ved hvert IPC-kald
// (auth-opslag: teams, user-directory, manager-access, creator-email), hvilket
// frøs hele appen i sekunder. Registret aendres sjaeldent, saa laesninger deles i
// CACHE_TTL_MS. Mutationer (locked/withIdentityTransaction) laeser ALTID frisk,
// saa en skrivning aldrig bygger paa en foraeldet kopi og overskriver en kollegas
// aendring, og enhver skrivning fra denne klient rydder cachen for filen.
const CACHE_TTL_MS = 30000
const readCache = new Map()
let freshDepth = 0

function invalidateCache(filePath) {
  if (filePath === undefined) readCache.clear()
  else readCache.delete(path.resolve(filePath))
}

function readJsonSafe(filePath, fallback) {
  const key = path.resolve(filePath)
  const cached = freshDepth === 0 && readCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return structuredClone(cached.value ?? fallback)
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Registret har et ugyldigt format')
    readCache.set(key, { at: Date.now(), value: structuredClone(value) })
    return value
  } catch (error) {
    if (error.code === 'ENOENT') {
      readCache.set(key, { at: Date.now(), value: undefined })
      return fallback
    }
    readCache.delete(key)
    throw error
  }
}

function withFreshReads(callback) {
  freshDepth++
  try { return callback() } finally { freshDepth-- }
}

/** Loads the registry files the auth check needs without blocking the main thread; the synchronous readers then hit the cache. */
async function prefetchAsync(platformRoot) {
  const files = [teamsPath(platformRoot), userDirectoryPath(platformRoot), managerAccessPath(platformRoot), platformConfigPath(platformRoot)]
  await Promise.all(files.map(async filePath => {
    const key = path.resolve(filePath)
    const cached = readCache.get(key)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return
    try {
      const value = JSON.parse(await fs.promises.readFile(filePath, 'utf8'))
      if (value && typeof value === 'object' && !Array.isArray(value)) readCache.set(key, { at: Date.now(), value })
    } catch (error) {
      if (error.code === 'ENOENT') readCache.set(key, { at: Date.now(), value: undefined })
      // Anything else is left to the synchronous reader, which reports it exactly as before.
    }
  }))
}

function writeJsonAtomic(filePath, data) {
  invalidateCache(filePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  // Windows/antivirus kan holde destinationsfilen ganske kort efter en læsning.
  // Bevar den atomiske replace og prøv få gange, før fejlen sendes videre.
  let lastError
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmp, filePath)
      readCache.set(path.resolve(filePath), { at: Date.now(), value: structuredClone(data) })
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
  const found = findTeamForEmail(platformRoot, normalizedEmail)
  // A colleague may have assigned this person seconds ago on another PC; a miss is always confirmed fresh.
  return found || withFreshReads(() => findTeamForEmail(platformRoot, normalizedEmail))
}

function findTeamForEmail(platformRoot, normalizedEmail) {
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

function forgetUser(platformRoot, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return false
  const access = readManagerAccess(platformRoot)
  if (Object.hasOwn(access, normalizedEmail)) {
    delete access[normalizedEmail]
    writeJsonAtomic(managerAccessPath(platformRoot), access)
  }
  const userDirectory = readUserDirectory(platformRoot)
  if (!Object.hasOwn(userDirectory, normalizedEmail)) return false
  delete userDirectory[normalizedEmail]
  writeUserDirectory(platformRoot, userDirectory)
  return true
}

// Manager rights in teams other than the person's home team. Only the creator writes this;
// the person's account, password and profile stay in the home team.
function managerAccessPath(platformRoot) {
  return path.join(registryDir(platformRoot), 'manager-access.json')
}

/** @returns {Record<string, { teamIds: string[], updatedAt: string }>} */
function readManagerAccess(platformRoot) {
  return readJsonSafe(managerAccessPath(platformRoot), {})
}

function listManagerAccess(platformRoot) {
  return Object.entries(readManagerAccess(platformRoot))
    .map(([email, entry]) => ({ email, teamIds: Array.isArray(entry?.teamIds) ? entry.teamIds : [], updatedAt: entry?.updatedAt || null }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

function managerTeamsForEmail(platformRoot, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const teamIds = readManagerAccess(platformRoot)[normalizedEmail]?.teamIds
  if (!normalizedEmail || !Array.isArray(teamIds)) return []
  const home = readUserDirectory(platformRoot)[normalizedEmail]
  return listTeams(platformRoot).filter(team => team.teamId !== home && teamIds.includes(team.teamId))
}

function setManagerAccess(platformRoot, email, teamIds) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const home = readUserDirectory(platformRoot)[normalizedEmail]
  if (!normalizedEmail || !home) throw new Error('Personen er ikke oprettet i et team')
  const wanted = [...new Set((Array.isArray(teamIds) ? teamIds : []).map(id => String(id).trim()).filter(Boolean))]
  const teams = readTeams(platformRoot)
  const unknown = wanted.find(teamId => !Object.hasOwn(teams, teamId))
  if (unknown) throw new Error(`Ukendt team: ${unknown}`)
  if (wanted.includes(home)) throw new Error('Personens eget team kan ikke tilføjes som ekstra team')
  const access = readManagerAccess(platformRoot)
  if (wanted.length) access[normalizedEmail] = { teamIds: wanted, updatedAt: new Date().toISOString() }
  else delete access[normalizedEmail]
  writeJsonAtomic(managerAccessPath(platformRoot), access)
  return { email: normalizedEmail, teamIds: wanted }
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
  return withFileLock(path.join(registryDir(platformRoot), 'mutation.lock'), () => withFreshReads(() => {
    let active = true
    const files = { directory: userDirectoryPath(platformRoot), managerAccess: managerAccessPath(platformRoot) }
    const target = key => { if (!active || !Object.hasOwn(files, key)) throw new Error('Invalid registry transaction capability'); return files[key] }
    try {
      const result = callback({ get: key => readJsonSafe(target(key), {}), set: (key, value) => writeJsonAtomic(target(key), value) })
      if (result && typeof result.then === 'function') throw new Error('Registry transaction must be synchronous')
      return result
    } finally { active = false }
  }))
}
const locked = mutate => (platformRoot, ...args) => withFileLock(path.join(registryDir(platformRoot), 'mutation.lock'), () => withFreshReads(() => mutate(platformRoot, ...args)))
module.exports = {
  invalidateCache,
  prefetchAsync,
  registryDir,
  teamsPath,
  userDirectoryPath,
  platformConfigPath,
  readTeams,
  writeTeams: locked(writeTeams),
  readUserDirectory,
  writeUserDirectory: locked(writeUserDirectory),
  lookupTeamForEmail,
  listTeams,
  assignUserToTeam: locked(assignUserToTeam),
  /** Removes a deleted account from the e-mail -> team directory and its extra manager access. */
  forgetUser: locked(forgetUser),
  managerAccessPath,
  listManagerAccess,
  managerTeamsForEmail,
  setManagerAccess: locked(setManagerAccess),
  createTeam: locked(createTeam),
  updateTeam: locked(updateTeam),
  getCreatorEmail,
  setCreatorEmail: locked(setCreatorEmail),
  withIdentityTransaction,
}
