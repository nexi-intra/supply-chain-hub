const path = require('node:path')
const crypto = require('node:crypto')
const { guideAccessIds } = require('./guideGrants.cjs')
const { LIBRARIES, KINDS, libraryForItemsKey, libraryForRequestsKey } = require('./libraryKeys.cjs')
const normalize = value => String(value || '').trim().toLowerCase()
function fail(code = 'AUTH_FORBIDDEN') { const error = new Error(code); error.code = code; throw error }
const OVERVIEW_KEYS = new Set(['users', 'vacation-entries', 'sick-leave-entries', 'home-office-patterns', 'home-office-exceptions'])
const LEADERBOARDS = new Set(['brickbreak-global-leaderboard', 'brickbreak-v2-global-leaderboard', 'chicken-invaders-global-leaderboard', 'endless-dodger-global-leaderboard', 'neon-snake-global-leaderboard', 'nexi-flyer-global-leaderboard', 'parcel-pilot-global-leaderboard', 'cargo-stack-global-leaderboard', 'route-runner-global-leaderboard', 'tetris-global-leaderboard'])
// Kun version/platform/tidsstempel pr. e-mail - ingen personfoelsomme data -
// bruges af Creator Panelets cross-hub "brugernes app-versioner"-overblik.
const CLIENT_VERSION_KEYS = new Set(['client-versions'])
const FILE_KEY = /^(file_[a-zA-Z0-9_-]+)_(?:meta|chunk_\d+)$/
const pick = (value, fields) => Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]))
function registeredTeamDir(root, teams, folderName) {
  const team = teams.find(item => item.folderName === folderName)
  if (!team || typeof folderName !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(folderName) || folderName.length > 100) fail()
  const parent = path.resolve(root), target = path.resolve(parent, folderName)
  if (path.dirname(target) !== parent) fail()
  return { team, directory: target }
}
// Lagerstyring's folders: a registry without a single team is the Hub's local fallback folder (M: was away at the
// start), so that is unavailable storage, kept for a retry; an unknown team in a real registry is still refused.
function registeredWarehouseTeamDir(root, teams, folderName) {
  if (!teams.length) fail('STORAGE_UNAVAILABLE')
  return registeredTeamDir(root, teams, folderName)
}
function overview(key, value) {
  if (key === 'users') return Object.fromEntries(Object.entries(value || {}).map(([email, user]) => [email, pick(user || {}, ['email', 'fullName', 'phone', 'role', 'isManager', 'status'])]))
  if (key === 'vacation-entries') return (value || []).filter(row => row.status === 'approved').map(row => pick(row, ['id', 'userId', 'userEmail', 'startDate', 'endDate', 'status', 'isSingleDay', 'type']))
  if (key === 'sick-leave-entries') return (value || []).filter(row => row.status === 'approved').map(row => pick(row, ['id', 'userEmail', 'userName', 'startDate', 'endDate', 'status']))
  if (key === 'home-office-exceptions') return (value || []).map(row => pick(row, ['id', 'userEmail', 'date', 'isHomeOffice']))
  if (key === 'home-office-patterns') return Object.fromEntries(Object.entries(value || {}).map(([email, pattern]) => {
    const safe = pick(pattern || {}, ['weekdays'])
    if (pattern?.repeat && typeof pattern.repeat === 'object' && !Array.isArray(pattern.repeat)) {
      const entries = Object.entries(pattern.repeat).filter(([weekday, rule]) => /^[0-6]$/.test(weekday) && rule && typeof rule === 'object' && !Array.isArray(rule))
        .map(([weekday, rule]) => [weekday, {
          intervalWeeks: Number.isInteger(rule.intervalWeeks) && rule.intervalWeeks >= 1 && rule.intervalWeeks <= 52 ? rule.intervalWeeks : 0,
          startDate: typeof rule.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rule.startDate) ? rule.startDate : '',
        }])
      if (entries.length) safe.repeat = Object.fromEntries(entries)
    }
    return [email, safe]
  }))
  return value
}
function createTeamReader({ getRoot, listTeams, openStore, now = Date.now }) {
  const target = (folder, teams = listTeams()) => registeredTeamDir(getRoot(), teams, folder)
  // Uden cache lavede HVER cross-team-laesning (fx en highscore-liste med 6
  // andre teams) en frisk store pr. kald - synkron mkdirSync mod M: pr. kald,
  // og INGEN genbrug af laesecachen, saa selv gentagne aabninger af samme
  // Game Corner-skaerm altid ramte netvaerket forfra. Cache pr. mappe fjerner
  // begge; sikkerheds-kritiske laesninger (users/guides/adgangsanmodninger)
  // bruger fortsat skipCache saa de aldrig er stale.
  const storeCache = new Map()
  const storeFor = (folder, teams) => {
    const directory = target(folder, teams).directory
    if (!storeCache.has(directory)) storeCache.set(directory, openStore(directory))
    return storeCache.get(directory)
  }
  const sharedStore = () => {
    const directory = path.join(path.resolve(getRoot()), '_shared')
    if (!storeCache.has(directory)) storeCache.set(directory, openStore(directory))
    return storeCache.get(directory)
  }
  function requests(store, actor, kind = 'guides') {
    return store.getAsync(LIBRARIES[kind].requests, { skipCache: true }).then(rows => (rows || []).filter(row => normalize(row.requestingUserEmail) === actor.email && row.requestingTeamCode === actor.home.folderName))
  }
  async function guides(store, actor, kind = 'guides') {
    const { items, requests: grants } = LIBRARIES[kind]
    const allowed = guideAccessIds(await store.getAsync(grants, { skipCache: true }), actor.email, actor.home.folderName, now())
    return ((await store.getAsync(items, { skipCache: true })) || []).map(guide => {
      if (allowed.has(guide.id)) return guide
      // Explicit allowlist: no sections, content, embedded Word data, asset IDs
      // or revision snapshots are included in an access-request catalogue.
      return { ...pick(guide, ['id', 'title', 'category', 'tags', 'language', 'version', 'author', 'createdAt', 'updatedAt']), content: '', sections: [] }
    })
  }
  async function readTeam(actor, folder, key, batchStore) {
    const store = batchStore || storeFor(folder)
    if (OVERVIEW_KEYS.has(key)) return overview(key, await store.getAsync(key, { skipCache: true }))
    // Highscores er ikke adgangs-kritiske - et par sekunders forsinkelse er
    // fint, og den normale cache goer gentagne visninger (skift af
    // svaerhedsgrad, genaabning af Game Corner) oejeblikkelige i stedet for
    // altid at ramme M: forfra.
    if (LEADERBOARDS.has(key)) return store.getAsync(key)
    if (CLIENT_VERSION_KEYS.has(key)) return store.getAsync(key)
    const requestKind = libraryForRequestsKey(key)
    if (requestKind) return requests(store, actor, requestKind)
    const itemKind = libraryForItemsKey(key)
    if (itemKind) return guides(store, actor, itemKind)
    const file = typeof key === 'string' && key.match(FILE_KEY)
    if (file && await ownsGrantedFile(store, actor, file[1])) return store.getAsync(key, { skipCache: true })
    fail()
  }
  async function ownsGrantedFile(store, actor, id) {
    for (const kind of KINDS) if ((await guides(store, actor, kind)).some(item => ownsFile(item, id))) return true
    return false
  }
  async function readTeamMany(actor, folder, keys, teams) {
    if (!Array.isArray(keys) || !keys.length || keys.length > 20) fail()
    const batchStore = storeFor(folder, teams)
    return Promise.all(keys.map(key => readTeam(actor, folder, key, batchStore)))
  }
  async function readTeamsMany(actor, requests) {
    if (!Array.isArray(requests) || !requests.length || requests.length > 20) fail()
    // Valider ALLE requests FOER noget I/O startes: en fail() midt i et
    // Promise.all-kald ville ellers efterlade allerede-startede laesninger for
    // tidligere (gyldige) requests koerende uden nogen der afventer dem.
    for (const request of requests) if (!request || typeof request.folderName !== 'string') fail()
    const teams = listTeams()
    for (const request of requests) {
      if (!Array.isArray(request.keys) || !request.keys.length || request.keys.length > 20) fail()
      registeredTeamDir(getRoot(), teams, request.folderName)
    }
    return Promise.all(requests.map(request => readTeamMany(actor, request.folderName, request.keys, teams)))
  }
  // Images of a shared guide live in the store of the team that uploaded them; only teams the guide is shared with are searched.
  async function readSharedFile(actor, kind, guideId, key) {
    if (!KINDS.includes(kind) || typeof guideId !== 'string') fail()
    const file = typeof key === 'string' && key.match(FILE_KEY)
    if (!file) fail()
    const shared = (await sharedStore().getAsync(LIBRARIES[kind].shared, { skipCache: true })) || []
    const guide = shared.find(item => item?.id === guideId)
    const teamCodes = Array.isArray(guide?.sharedWithTeamCodes) ? guide.sharedWithTeamCodes : []
    if (!guide || !teamCodes.includes(actor.home.folderName) || !ownsFile(guide, file[1])) fail()
    const teams = listTeams()
    const order = [actor.home.folderName, ...teamCodes.filter(code => code !== actor.home.folderName)]
    for (const folder of order) {
      if (!teams.some(team => team.folderName === folder)) continue
      const value = await storeFor(folder, teams).getAsync(key, { skipCache: true })
      if (value !== undefined && value !== null) return value
    }
    return undefined
  }
  function submitRequest(actor, folder, input, kind = 'guides') {
    if (!KINDS.includes(kind) || folder === actor.home.folderName || typeof input?.guideId !== 'string') fail()
    const { items, requests: grants } = LIBRARIES[kind]
    const store = storeFor(folder), guide = (store.get(items, { skipCache: true }) || []).find(item => item.id === input.guideId)
    if (!guide) fail()
    const users = storeFor(actor.home.folderName).get('users', { skipCache: true }) || {}
    const user = Object.entries(users).find(([key, value]) => normalize(value?.email || key) === actor.email)?.[1]
    const request = { id: crypto.randomUUID(), guideId: guide.id, guideTitle: guide.title, requestingTeamCode: actor.home.folderName, requestingUserEmail: actor.email, requestingUserName: user?.fullName || actor.email, status: 'pending', requestedAt: new Date(now()).toISOString() }
    let own
    store.mutate(grants, value => {
      const rows = value || []
      const existing = rows.find(row => row.guideId === guide.id && normalize(row.requestingUserEmail) === actor.email && row.requestingTeamCode === actor.home.folderName && row.status === 'pending')
      const next = existing ? rows : [...rows, request]
      own = next.filter(row => normalize(row.requestingUserEmail) === actor.email && row.requestingTeamCode === actor.home.folderName)
      return next
    })
    return own
  }
  return { readTeam, readTeamMany, readTeamsMany, readSharedFile, submitRequest }
}
function ownsFile(guide, id) {
  return guide.fileUrl === `kv://${id}` || guide.previewPdfUrl === `kv://${id}` || guide.originalPdfUrl === `kv://${id}` || guide.coverImageId === id || (guide.sections || []).some(section => (section.steps || []).some(step => (step.imageIds || []).includes(id)))
}
module.exports = { createTeamReader, registeredTeamDir, registeredWarehouseTeamDir, overview }
