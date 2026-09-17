const path = require('node:path')
const crypto = require('node:crypto')
const { guideAccessIds } = require('./guideGrants.cjs')
const normalize = value => String(value || '').trim().toLowerCase()
function fail(code = 'AUTH_FORBIDDEN') { const error = new Error(code); error.code = code; throw error }
const OVERVIEW_KEYS = new Set(['users', 'vacation-entries', 'sick-leave-entries', 'home-office-patterns', 'home-office-exceptions'])
const LEADERBOARDS = new Set(['brickbreak-global-leaderboard', 'endless-dodger-global-leaderboard', 'neon-snake-global-leaderboard', 'nexi-flyer-global-leaderboard', 'tetris-global-leaderboard'])
const VIEW_KEYS = new Set([...OVERVIEW_KEYS, 'shift-roles', 'shift-assignments', 'employee-birthdays', 'guides'])
const FILE_KEY = /^(file_[a-zA-Z0-9_-]+)_(?:meta|chunk_\d+)$/
const pick = (value, fields) => Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]))
function registeredTeamDir(root, teams, folderName) {
  const team = teams.find(item => item.folderName === folderName)
  if (!team || typeof folderName !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(folderName) || folderName.length > 100) fail()
  const parent = path.resolve(root), target = path.resolve(parent, folderName)
  if (path.dirname(target) !== parent) fail()
  return { team, directory: target }
}
function overview(key, value) {
  if (key === 'users') return Object.fromEntries(Object.entries(value || {}).map(([email, user]) => [email, pick(user || {}, ['email', 'fullName', 'phone', 'role', 'isManager', 'status'])]))
  if (key === 'vacation-entries') return (value || []).filter(row => row.status === 'approved').map(row => pick(row, ['id', 'userId', 'userEmail', 'startDate', 'endDate', 'status', 'isSingleDay']))
  if (key === 'sick-leave-entries') return (value || []).filter(row => row.status === 'approved').map(row => pick(row, ['id', 'userEmail', 'userName', 'startDate', 'endDate', 'status']))
  if (key === 'home-office-exceptions') return (value || []).map(row => pick(row, ['id', 'userEmail', 'date', 'isHomeOffice']))
  if (key === 'home-office-patterns') return Object.fromEntries(Object.entries(value || {}).map(([email, pattern]) => [email, pick(pattern || {}, ['weekdays'])]))
  return value
}
function createTeamReader({ getRoot, listTeams, listViews, openStore, now = Date.now }) {
  const target = folder => registeredTeamDir(getRoot(), listTeams(), folder)
  const storeFor = folder => openStore(target(folder).directory)
  function requests(store, actor) {
    return store.getAsync('guide-access-requests', { skipCache: true }).then(rows => (rows || []).filter(row => normalize(row.requestingUserEmail) === actor.email && row.requestingTeamCode === actor.home.folderName))
  }
  async function guides(store, actor, fullView = false) {
    const allowed = fullView ? null : guideAccessIds(await store.getAsync('guide-access-requests', { skipCache: true }), actor.email, actor.home.folderName, now())
    return ((await store.getAsync('guides', { skipCache: true })) || []).map(guide => {
      if (fullView || allowed.has(guide.id)) return guide
      // Explicit allowlist: no sections, content, embedded Word data, asset IDs
      // or revision snapshots are included in an access-request catalogue.
      return { ...pick(guide, ['id', 'title', 'category', 'tags', 'language', 'version', 'author', 'createdAt', 'updatedAt']), content: '', sections: [] }
    })
  }
  async function readTeam(actor, folder, key) {
    const store = storeFor(folder)
    if (OVERVIEW_KEYS.has(key)) return overview(key, await store.getAsync(key, { skipCache: true }))
    if (LEADERBOARDS.has(key)) return store.getAsync(key, { skipCache: true })
    if (key === 'guide-access-requests') return requests(store, actor)
    if (key === 'guides') return guides(store, actor)
    const file = typeof key === 'string' && key.match(FILE_KEY)
    if (file && (await guides(store, actor)).some(guide => ownsFile(guide, file[1]))) return store.getAsync(key, { skipCache: true })
    fail()
  }
  async function readTeamMany(actor, folder, keys) {
    if (!Array.isArray(keys) || !keys.length || keys.length > 20) fail()
    const values = []
    for (const key of keys) values.push(await readTeam(actor, folder, key))
    return values
  }
  async function readTeamsMany(actor, requests) {
    if (!Array.isArray(requests) || !requests.length || requests.length > 20) fail()
    const values = []
    for (const request of requests) {
      if (!request || typeof request.folderName !== 'string') fail()
      values.push(await readTeamMany(actor, request.folderName, request.keys))
    }
    return values
  }
  async function readView(actor, viewId, teamId, key) {
    if (actor.viewId !== viewId) fail()
    const view = listViews(actor.email).find(item => item.viewId === viewId)
    if (!view || !view.teamIds.includes(teamId)) fail()
    const team = listTeams().find(item => item.teamId === teamId)
    if (!team) fail()
    const store = storeFor(team.folderName)
    if (VIEW_KEYS.has(key)) return OVERVIEW_KEYS.has(key) ? overview(key, await store.getAsync(key, { skipCache: true })) : store.getAsync(key, { skipCache: true })
    const file = typeof key === 'string' && key.match(FILE_KEY)
    if (file && (await guides(store, actor, true)).some(guide => ownsFile(guide, file[1]))) return store.getAsync(key, { skipCache: true })
    fail()
  }
  function submitRequest(actor, folder, input) {
    if (actor.viewId || folder === actor.home.folderName || typeof input?.guideId !== 'string') fail()
    const store = storeFor(folder), guide = (store.get('guides', { skipCache: true }) || []).find(item => item.id === input.guideId)
    if (!guide) fail()
    const users = storeFor(actor.home.folderName).get('users', { skipCache: true }) || {}
    const user = Object.entries(users).find(([key, value]) => normalize(value?.email || key) === actor.email)?.[1]
    const request = { id: crypto.randomUUID(), guideId: guide.id, guideTitle: guide.title, requestingTeamCode: actor.home.folderName, requestingUserEmail: actor.email, requestingUserName: user?.fullName || actor.email, status: 'pending', requestedAt: new Date(now()).toISOString() }
    let own
    store.mutate('guide-access-requests', value => {
      const rows = value || []
      const existing = rows.find(row => row.guideId === guide.id && normalize(row.requestingUserEmail) === actor.email && row.requestingTeamCode === actor.home.folderName && row.status === 'pending')
      const next = existing ? rows : [...rows, request]
      own = next.filter(row => normalize(row.requestingUserEmail) === actor.email && row.requestingTeamCode === actor.home.folderName)
      return next
    })
    return own
  }
  return { readTeam, readTeamMany, readTeamsMany, readView, submitRequest }
}
function ownsFile(guide, id) {
  return guide.fileUrl === `kv://${id}` || guide.coverImageId === id || (guide.sections || []).some(section => (section.steps || []).some(step => (step.imageIds || []).includes(id)))
}
module.exports = { createTeamReader, registeredTeamDir, overview }
