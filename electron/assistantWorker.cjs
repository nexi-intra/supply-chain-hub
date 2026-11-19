// Separate Node process: synchronous SMB reads and indexing never run in the
// Electron UI/main event loop. Only allowlisted assistant operations are exposed.
const path = require('node:path')
const registry = require('./registry.cjs')
const { keyToFilename } = require('./store.cjs')
const { createReadCache } = require('./assistantReadCache.cjs')
const { createAssistantContext } = require('./assistantContext.cjs')
const { indexGuide } = require('./assistantGuideIndex.cjs')
const { PLATFORM_SHARED_KV_KEYS: SHARED, LIBRARIES } = require('./libraryKeys.cjs')
// Published library content is stamp-validated and reused; access-request keys are always read fresh.
const REUSABLE = new Set(Object.values(LIBRARIES).flatMap(keys => [keys.items, keys.shared]))
const METHODS = new Set(['authorize', 'query', 'getGuide', 'getImage', 'getRecord', 'moduleCatalog', 'revalidateSources', 'prepare'])

function createWorkerRuntime() {
  const cache = createReadCache()
  let scope = ''
  let config
  let memo
  function once(key, load) {
    if (!memo.has(key)) memo.set(key, load())
    return memo.get(key)
  }
  const teams = () => once('registry:teams', () => registry.listTeams(config.platformRoot))
  function read(dir, key) {
    const file = path.join(dir, keyToFilename(key))
    if (memo.has(file)) return memo.get(file)
    const value = cache.get(file, REUSABLE.has(key))
    memo.set(file, value)
    return value
  }
  const readShared = key => read(path.join(config.platformRoot, '_shared'), key)
  const context = createAssistantContext({
    listTeams: teams,
    lookupTeam: email => {
      const directory = once('registry:users', () => registry.readUserDirectory(config.platformRoot))
      return teams().find(team => team.teamId === directory[String(email || '').trim().toLowerCase()]) || null
    },
    creatorEmail: () => once('registry:creator', () => registry.getCreatorEmail(config.platformRoot)),
    managerTeams: email => once(`registry:manager-access:${email}`, () => registry.managerTeamsForEmail(config.platformRoot, email)),
    currentFolder: () => config.currentFolder,
    readShared,
    readTeam: (team, key) => {
      const dir = path.resolve(config.platformRoot, team.folderName)
      const relative = path.relative(config.platformRoot, dir)
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Ugyldig teammappe')
      if (SHARED.has(key)) return readShared(key)
      return read(team.folderName === config.currentFolder ? config.activeDir : dir, key)
    },
    getDiagnostics: () => ({ ...config.diagnostics, pendingSync: (read(config.localDir, '__offline-queue__') || []).length }),
  })
  function call(method, args, state) {
    if (!METHODS.has(method) || !Array.isArray(args)) throw new Error('Ukendt chatbot-operation')
    const nextScope = JSON.stringify([state.platformRoot, state.activeDir, state.currentFolder])
    if (scope !== nextScope) cache.clear()
    scope = nextScope; config = state; memo = new Map()
    if (method === 'revalidateSources') {
      const [request, answer] = args
      const principal = context.authorize(request.token)
      for (const source of answer.sources) {
        if (source.kind === 'guide') {
          const { guide } = context.getGuide(request.token, source.teamId, source.guideId, source.library || 'guides')
          if (source.revision && indexGuide(guide)[0]?.revision !== source.revision) throw new Error('En guide blev ændret under svaret. Stil spørgsmålet igen, så du får de nyeste oplysninger.')
        }
        if (source.kind === 'module') {
          const record = context.getRecord({ ...request, moduleId: source.moduleId, recordId: source.recordId, teamId: source.teamId })
          if (source.history && source.text !== record.text) throw new Error('Guidehistorikken blev ændret under svaret. Stil spørgsmålet igen.')
        }
      }
      return principal
    }
    return context[method](...args)
  }
  return { call, invalidate: keys => cache.invalidate(keys), stats: cache.stats }
}

if (require.main === module) {
  try { const os = require('node:os'); os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL) } catch { /* optional OS scheduling hint */ }
  const runtime = createWorkerRuntime()
  process.on('message', message => {
    if (message?.kind === 'invalidate' && Array.isArray(message.keys)) { runtime.invalidate(message.keys); return }
    if (message?.kind !== 'call') return
    try { process.send?.({ id: message.id, result: runtime.call(message.method, message.args, message.config) }) }
    catch (error) { process.send?.({ id: message.id, error: { message: String(error.message).slice(0, 500) } }) }
  })
  process.on('disconnect', () => process.exit(0))
}
module.exports = { createWorkerRuntime }
