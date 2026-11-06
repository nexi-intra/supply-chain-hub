// Warehouse Management (Optælling) inside the Hub: builds the services and registers every `warehouse:*` IPC channel.
// The person and team come from the Hub session (the open hub); data lives in "<team folder>\lagerstyring".
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { resolveWarehouseConfig } = require('./config.cjs')
const { warehouseUser } = require('./hubUser.cjs')
const { createSapBridge, createCscriptRunner, WRITE_SYSTEMS } = require('./sapBridge.cjs')
const { createSapFetcher } = require('./sapFetch.cjs')
const { createPiDocWriter } = require('./sapPiDocs.cjs')
const { createSapViewer } = require('./sapShow.cjs')
const { createPiDocService } = require('./piDocService.cjs')
const { createWarehouseAssistant } = require('../assistantWarehouse.cjs')
const { createLocationsAssistant } = require('../assistantLocations.cjs')
const { createFixtureRunner } = require('./sapFixtures.cjs')
const { TEAMS, isAllowedTeam } = require('./teams.cjs')
const { createStore, keyToFilename, parseFileContents } = require('../store.cjs')
const { createCountRepository } = require('./countRepository.cjs')
const { createCountService } = require('./countService.cjs')
const { createRoles } = require('./roles.cjs')
const { createSapCheckService } = require('./sapCheckService.cjs')
const { createOutlookDrafter, createFakeDrafter } = require('./outlookDraft.cjs')
const { createLocalCache } = require('./localCache.cjs')
const { findNewestPlacementSheet, readPlacementSheet } = require('./core/placements.cjs')
const { readSerialFile } = require('./importFile.cjs')
const { createMaterialCatalog, withLearning } = require('./locations/catalog.cjs')
const { createLocationRepository } = require('./locations/repository.cjs')
const { createLocationService } = require('./locations/service.cjs')
const { createLayoutService } = require('./locations/layoutService.cjs')
const { createOutbox, QUEUED_METHODS } = require('./locations/outbox.cjs')
const { writeReport, writeStatusReport, writeSapCheckReport } = require('./report.cjs')

const DATA_FOLDER = 'lagerstyring'
const SHARED_FOLDER = '_lagerstyring'
const USERS_TTL_MS = 30000
const CODE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/
const STORAGE_ERRORS = new Set(['ENOENT', 'EIO', 'EBUSY', 'ETIMEDOUT', 'EACCES', 'EPERM', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNRESET', 'EAGAIN', 'UNKNOWN'])

function codeError(code) {
  return Object.assign(new Error(code), { code })
}

/** IPC errors carry "CODE" or "CODE: Danish detail"; internal details (paths, stacks) never reach the window. */
function toIpcError(error) {
  const code = typeof error?.code === 'string' && CODE.test(error.code) ? error.code : STORAGE_ERRORS.has(error?.code) ? 'STORAGE_UNAVAILABLE' : 'UNEXPECTED_ERROR'
  if (code === 'UNEXPECTED_ERROR' || code === 'STORAGE_UNAVAILABLE') console.error('Lagerstyring: request failed', error)
  const detail = !['UNEXPECTED_ERROR', 'STORAGE_UNAVAILABLE'].includes(code) && error.message && error.message !== code ? String(error.message).replace(new RegExp(`^${code}:\\s*`), '') : ''
  return new Error(detail ? `${code}: ${detail}` : code)
}

function loadDeviceId(dir) {
  const file = path.join(dir, 'device-id')
  try {
    const value = fs.readFileSync(file, 'utf8').trim()
    if (/^[a-f0-9]{16,64}$/.test(value)) return value
  } catch {}
  const value = crypto.randomBytes(12).toString('hex')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, value)
  return value
}

/**
 * @param {object} deps
 * @param {{ handle(channel: string, listener: Function): void }} deps.ipcMain Hub's secured IPC (trusted window + session)
 * @param {(event) => Promise<object>} deps.currentActor authService.currentAsync(event.sender.id)
 * @param {(teamId: string) => Promise<object>} deps.teamUsers the team's public users (no secrets)
 * @param {(teamId: string) => string} deps.teamDir the registered folder of a team in the platform root
 * @param {() => string} deps.platformRoot
 */
function registerWarehouse({ ipcMain, currentActor, teamUsers, teamDir, platformRoot, userDataDir, electron, broadcast, isPackaged, configDirs = [], scriptsDir = __dirname, env = process.env }) {
  const { clipboard, dialog, shell, BrowserWindow } = electron
  const config = resolveWarehouseConfig({ env, configDirs })
  const localDir = path.join(userDataDir, 'warehouse')
  const unpacked = dir => dir.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  const sapExpected = { system: config.sapSystem, client: '100' }
  const fixturesDir = !isPackaged && env.TCD_HUB_SAP_FIXTURES_DIR ? path.resolve(env.TCD_HUB_SAP_FIXTURES_DIR) : null
  const runScript = fixturesDir
    ? createFixtureRunner(fixturesDir, { readClipboard: () => clipboard.readText(), system: config.sapSystem })
    : createCscriptRunner({ scriptDir: unpacked(path.join(scriptsDir, 'sap')), system: config.sapSystem })
  const sap = createSapBridge({ runScript, expected: sapExpected })
  const fetcher = createSapFetcher({ bridge: sap, runScript, clipboard, expected: sapExpected })
  const emit = (channel, payload) => broadcast(`warehouse:${channel}`, payload)

  const dataDirOf = team => {
    if (!isAllowedTeam(team)) throw codeError('WAREHOUSE_TEAM_NOT_ALLOWED')
    return path.join(teamDir(team), DATA_FOLDER)
  }
  const stores = new Map()
  const openStore = dir => {
    if (!stores.has(dir)) {
      try {
        stores.set(dir, createStore(dir))
      } catch (error) {
        console.error('Lagerstyring: storage unavailable', dir, error.code)
        throw codeError('STORAGE_UNAVAILABLE')
      }
    }
    return stores.get(dir)
  }
  const storeFor = team => openStore(dataDirOf(team))
  const reportsDir = team => path.resolve(dataDirOf(team), 'rapporter')
  const sharedStore = {
    getAsync: (...args) => openStore(path.join(platformRoot(), SHARED_FOLDER)).getAsync(...args),
    setAsync: (...args) => openStore(path.join(platformRoot(), SHARED_FOLDER)).setAsync(...args),
    updateAsync: (...args) => openStore(path.join(platformRoot(), SHARED_FOLDER)).updateAsync(...args),
    deleteAsync: (...args) => openStore(path.join(platformRoot(), SHARED_FOLDER)).deleteAsync(...args),
  }

  // SAP descriptions are learned from every MB52 fetch and material document lookup (Placeringer shows them).
  const catalog = createMaterialCatalog({ sharedStore, fetcher })
  const learningFetcher = withLearning(fetcher, catalog)

  const countRepo = createCountRepository({ storeFor })
  // Every call looks up the person's name; the team's user list changes rarely.
  const usersCache = new Map()
  const cachedUsers = async team => {
    const hit = usersCache.get(team)
    if (hit && Date.now() - hit.at < USERS_TTL_MS) return hit.value
    const value = (await teamUsers(team)) || {}
    usersCache.set(team, { at: Date.now(), value })
    return value
  }
  const counts = createCountService({
    repo: countRepo,
    storeFor,
    fetcher: learningFetcher,
    placementSource: {
      load: async () => {
        const file = findNewestPlacementSheet(config.placementsDir)
        if (!file) throw codeError('PLACEMENTS_NOT_FOUND')
        return readPlacementSheet(file)
      },
    },
    journalsDir: path.join(localDir, 'journals'),
    reportWriter: {
      count: (team, data) => writeReport(data, reportsDir(team)),
      status: (team, data) => writeStatusReport(data, reportsDir(team)),
    },
    localCache: createLocalCache(path.join(localDir, 'cache')),
    deviceId: loadDeviceId(localDir),
    emit,
    // Another team's storage rules (for "correct location" suggestions): read the file only, never create folders.
    peekRules: async team => {
      try {
        return parseFileContents(await fs.promises.readFile(path.join(dataDirOf(team), keyToFilename('lagerregler')), 'utf8')) || {}
      } catch {
        return {}
      }
    },
  })
  const listTeamUsers = async team => Object.entries(await cachedUsers(team))
    .filter(([, user]) => user && (!user.status || user.status === 'approved'))
    .map(([key, user]) => ({ email: String(user.email || key).trim().toLowerCase(), fullName: user.fullName || user.email || key, role: user.role === 'manager' || user.role === 'admin' || user.isManager ? 'manager' : 'user' }))
  const roles = createRoles({ storeFor, listTeamUsers })
  const piDocs = createPiDocService({ counts, repo: countRepo, roles, system: config.sapSystem, writeEnabled: WRITE_SYSTEMS.includes(config.sapSystem), writer: createPiDocWriter({ bridge: sap, runScript, clipboard, system: config.sapSystem }) })
  const sapViewer = createSapViewer({ bridge: sap, runScript })
  // Placeringer: one store per hub in <team>/lagerstyring/placeringer; the placement sheet is only read by the import.
  const locationRepo = createLocationRepository({ storeFor: team => openStore(path.join(dataDirOf(team), 'placeringer')), newId: () => crypto.randomUUID() })
  const locations = createLocationService({
    repo: locationRepo,
    catalog,
    fetcher: learningFetcher,
    sheetSource: { find: () => findNewestPlacementSheet(config.placementsDir) },
    isLocationAdmin: user => roles.isLocationAdmin(user),
    newId: () => crypto.randomUUID(),
  })
  // Tegningen shares the places' store: a publish writes the drawing and the places in one transaction.
  const layouts = createLayoutService({ repo: locationRepo, locations })
  const fakeOutlookDir = !isPackaged && env.TCD_HUB_OUTLOOK_FAKE_DIR ? path.resolve(env.TCD_HUB_OUTLOOK_FAKE_DIR) : null
  const sapChecks = createSapCheckService({
    sharedStore,
    storeFor,
    fetcher: learningFetcher,
    roles,
    reportWriter: { sapCheck: (team, data) => writeSapCheckReport(data, reportsDir(team)) },
    drafter: fakeOutlookDir ? createFakeDrafter(fakeOutlookDir) : createOutlookDrafter({ scriptPath: unpacked(path.join(scriptsDir, 'outlook', 'draft.vbs')) }),
    emit,
  })
  function reportFile(team, file) {
    const name = String(file || '')
    const target = path.isAbsolute(name) ? path.resolve(name) : path.resolve(reportsDir(team), name)
    if (path.dirname(target).toLowerCase() !== reportsDir(team).toLowerCase() || path.extname(target).toLowerCase() !== '.xlsx' || !fs.existsSync(target)) throw codeError('REPORT_NOT_FOUND')
    return target
  }

  /**
   * A status manager (appointed in Optælling) acts as a manager everywhere; marked so only real managers grant that role.
   * An Optælling admin is marked `countAdmin` (may fetch the SAP stock of the day for the count document).
   */
  async function serviceUser(event) {
    const actor = await currentActor(event)
    const user = warehouseUser(actor, isAllowedTeam(actor?.activeTeam?.teamId) ? await cachedUsers(actor.activeTeam.teamId).catch(() => ({})) : {})
    if (user.role !== 'user') return user
    const role = await roles.roleOf(user).catch(() => 'user')
    if (role === 'status-manager') return { ...user, role: 'manager', statusManager: true }
    return role === 'admin' ? { ...user, countAdmin: true } : user
  }
  const channels = []
  const handle = (channel, fn) => {
    channels.push(channel)
    ipcMain.handle(`warehouse:${channel}`, async (event, payload) => {
      try {
        return await fn(await serviceUser(event), payload && typeof payload === 'object' ? payload : {}, event)
      } catch (error) {
        throw toIpcError(error)
      }
    })
  }

  handle('me', user => ({ email: user.email, fullName: user.fullName, role: user.role, team: user.team, storageLocations: [...TEAMS[user.team].storageLocations] }))
  // The window has no clipboard permission; text copies go through here, plain text only and size-limited.
  handle('clipboard:write', async (user, p) => {
    if (typeof p.text !== 'string' || p.text.length > 2_000_000) throw codeError('CLIPBOARD_INVALID')
    await clipboard.writeText(p.text)
    return { ok: true }
  })
  handle('sap:status', async (user, p) => ({ ...(await sap.status({ fresh: p.fresh === true })), expectedSystem: config.sapSystem }))
  handle('statuses:overview', user => counts.statusOverview(user))
  handle('statuses:start', (user, p) => counts.startStatus(user, { year: p.year, quarter: p.quarter, name: p.name }))
  handle('statuses:checklist', (user, p) => counts.statusChecklist(user, p.id))
  handle('statuses:lock', (user, p) => counts.lockStatus(user, p.id, { language: p.language }))
  handle('statuses:unlock', (user, p) => counts.unlockStatus(user, p.id, { reason: p.reason }))
  handle('statuses:delete', (user, p) => counts.deleteStatus(user, p.id))
  handle('statuses:archive', (user, p) => counts.statusArchive(user, p.id))
  // Display only. Documents from before the system was stored on them belong to the configured system.
  handle('sap:show-doc', (user, p) => sapViewer.show({ system: p.system || config.sapSystem, kind: p.kind, docNo: p.docNo, year: p.year }))
  handle('counts:list', user => counts.listCounts(user))
  handle('counts:preview', (user, p) => counts.preview(user, { scope: p.scope, exclusions: Array.isArray(p.exclusions) ? p.exclusions : [] }))
  handle('counts:create', (user, p) => counts.createCount(user, { token: p.token, name: p.name }))
  handle('counts:open', (user, p) => counts.openCount(user, p.id))
  handle('counts:state', (user, p) => counts.getState(user, p.id))
  handle('counts:serials', (user, p) => counts.listSerials(user, p.id, { kind: p.kind, query: p.query, limit: p.limit }))
  handle('counts:material-serials', (user, p) => counts.materialSerials(user, p.id, { material: p.material, query: p.query, limit: p.limit }))
  handle('counts:scan', (user, p) => counts.scan(user, p.id, { serial: p.serial, place: p.place }))
  handle('counts:undo', (user, p) => counts.undo(user, p.id, { eventId: p.eventId }))
  handle('counts:remove-serial', (user, p) => counts.removeSerial(user, p.id, { serial: p.serial }))
  handle('counts:save-line', (user, p) => counts.saveLine(user, p.id, p.line && typeof p.line === 'object' ? p.line : {}))
  handle('counts:delete-line', (user, p) => counts.deleteLine(user, p.id, { lineId: p.lineId }))
  handle('counts:import', (user, p) => counts.importSerials(user, p.id, { text: p.text, serials: p.serials, place: p.place, document: p.document || null, dryRun: p.dryRun !== false }))
  handle('counts:matdoc-lookup', (user, p) => counts.lookupMatdoc(user, p.id, { document: p.document }))
  handle('counts:import-file', async (user, p, event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: p.title || 'Vælg fil med serienumre', properties: ['openFile'], filters: [{ name: 'Excel, CSV, txt', extensions: ['xlsx', 'xlsm', 'csv', 'txt'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    return readSerialFile(result.filePaths[0])
  })
  handle('counts:request-join', (user, p) => counts.requestJoin(user, p.id))
  handle('counts:decide-member', (user, p) => counts.decideMember(user, p.id, { email: p.email, approve: p.approve === true }))
  handle('counts:claim', (user, p) => counts.claimArea(user, p.id, { area: p.area }))
  handle('counts:release', (user, p) => counts.releaseArea(user, p.id, { area: p.area }))
  handle('counts:close', (user, p) => counts.closeCount(user, p.id))
  handle('counts:reopen', (user, p) => counts.reopenCount(user, p.id))
  handle('counts:delete', (user, p) => counts.deleteCount(user, p.id))
  handle('counts:refetch-preview', (user, p) => counts.previewRefetch(user, p.id))
  handle('counts:refetch-apply', (user, p) => counts.applyRefetch(user, p.id, { token: p.token }))
  handle('counts:approval', (user, p) => counts.setApproval(user, p.id, { material: p.material, status: p.status, comment: p.comment }))
  handle('counts:approve-clean', (user, p) => counts.approveAllWithoutDifference(user, p.id))
  handle('counts:material-lock', (user, p) => counts.lockMaterial(user, p.id, { material: p.material }))
  handle('counts:material-request', (user, p) => counts.requestMaterial(user, p.id, { material: p.material }))
  handle('counts:material-answer', (user, p) => counts.answerMaterialRequest(user, p.id, { material: p.material, email: p.email, allow: p.allow === true }))
  handle('counts:material-release', (user, p) => counts.releaseMaterial(user, p.id, { material: p.material }))
  handle('counts:material-submit', (user, p) => counts.submitMaterial(user, p.id, { material: p.material, comment: p.comment, acceptDiff: p.acceptDiff === true }))
  handle('counts:flush', (user, p) => counts.flush(user, p.id))
  handle('counts:report', async (user, p) => {
    const file = await writeReport({ ...(await counts.reportData(user, p.id)), language: p.language === 'en' ? 'en' : 'da' }, reportsDir(user.team))
    return { file, name: path.basename(file) }
  })
  handle('counts:open-report', async (user, p) => {
    const failure = await shell.openPath(reportFile(user.team, p.file))
    if (failure) throw codeError('REPORT_OPEN_FAILED')
    return { ok: true }
  })
  handle('counts:show-report', (user, p) => {
    shell.showItemInFolder(reportFile(user.team, p.file))
    return { ok: true }
  })
  handle('rules:get', user => counts.getRules(user))
  handle('rules:set', (user, p) => counts.setRule(user, { sloc: p.sloc, kinds: p.kinds }))
  handle('serial-rules:get', user => counts.serialRules(user))
  handle('serial-rules:set', (user, p) => counts.setSerialRule(user, { material: p.material, unrestricted: p.unrestricted === true }))
  handle('counts:copy-serials', async (user, p) => {
    const result = await counts.copySerials(user, p.id, { material: p.material, sloc: p.sloc, stockType: p.stockType, forDoc: p.forDoc === true })
    if (result.serials.length) await clipboard.writeText(result.serials.join('\r\n'))
    return { long: result.long, total: result.total, withoutLong: result.withoutLong.slice(0, 200), withoutLongTotal: result.withoutLong.length, lookedUp: result.lookedUp }
  })
  handle('placements:save', (user, p) => counts.savePlacement(user, { name: p.name, area: p.area, type: p.type }))
  handle('counts:doc', (user, p) => counts.countDoc(user, p.id))
  handle('counts:doc-fetch', (user, p) => counts.fetchDocStock(user, p.id))
  handle('pidocs:list', (user, p) => piDocs.list(user, p.id))
  handle('pidocs:create', (user, p) => piDocs.create(user, p.id, { materials: Array.isArray(p.materials) ? p.materials : [], sloc: p.sloc, stockType: p.stockType }))
  handle('pidocs:print', (user, p) => piDocs.print(user, p.id, p.docId))
  handle('pidocs:count', (user, p) => piDocs.count(user, p.id, p.docId))
  handle('pidocs:post', (user, p) => piDocs.post(user, p.id, Array.isArray(p.docIds) ? p.docIds : []))
  handle('pidocs:delete', (user, p) => piDocs.remove(user, p.id, p.docId))
  handle('roles:me', async user => ({ role: await roles.roleOf(user), locationAdmin: await roles.isLocationAdmin(user) }))
  handle('roles:list', user => roles.list(user))
  handle('roles:set-admin', (user, p) => roles.setAdmin(user, { email: p.email, admin: p.admin === true }))
  handle('roles:set-role', (user, p) => roles.setRole(user, { email: p.email, role: p.role }))
  handle('roles:set-location-admin', (user, p) => roles.setLocationAdmin(user, { email: p.email, admin: p.admin === true }))
  handle('sap-check:overview', user => sapChecks.overview(user))
  handle('sap-check:latest', user => sapChecks.latest(user))
  handle('sap-check:run', (user, p) => sapChecks.run(user, { scope: p.scope }))
  handle('sap-check:settings', (user, p) => sapChecks.setSettings(user, { to: p.to, cc: p.cc, language: p.language }))
  handle('sap-check:mail', (user, p) => sapChecks.createMail(user, { id: p.id, mode: p.mode, language: p.language, scope: p.scope }))

  // Placeringer: reads, then the changes; every change tells the open windows of that hub.
  const LOCATION_READS = { overview: 'overview', 'lookup-document': 'lookupDocument', suggest: 'suggest', search: 'search', 'material-card': 'materialCard', 'location-card': 'locationCard', 'pallet-card': 'palletCard', list: 'list', stamp: 'stamp', log: 'log', 'rack-card': 'rackCard', 'map-contents': 'mapContents' }
  const LOCATION_WRITES = { 'put-away': 'putAway', take: 'take', refill: 'refill', move: 'move', 'change-sloc': 'changeSloc', 'edit-pallet': 'editPallet', undo: 'undo', 'shelf-put': 'shelfPut', 'shelf-take': 'shelfTake', 'shelf-move': 'shelfMove', 'shelf-set': 'shelfSet', 'create-rack': 'createRack', 'add-shelf': 'addShelf', 'delete-locations': 'deleteLocations', 'set-active-many': 'setActiveMany', 'create-location': 'createLocation', 'create-series': 'createSeries', 'edit-location': 'editLocation', 'set-active': 'setActive', 'set-tags': 'setTags', 'apply-import': 'applyImport' }
  for (const [channel, method] of Object.entries(LOCATION_READS)) handle(`locations:${channel}`, (user, p) => locations[method](user, p))
  // The import reads the sheet and SAP for a few minutes; its steps are shown as a progress bar.
  handle('locations:preview-import', user => locations.previewImport(user, { onProgress: step => emit('locations:import-progress', { step }) }))
  const runLocations = async ({ method, user, request }) => {
    const result = await locations[method](user, request)
    emit('locations:changed', { team: user.team })
    return result
  }
  // The daily actions survive M: being down: kept on this PC and replayed in order when it is back.
  // A replayed action that is no longer possible is kept in the outbox file until a window of the same team has shown it.
  const outbox = createOutbox({
    dir: localDir,
    run: runLocations,
    isStorageError: error => error?.code === 'STORAGE_UNAVAILABLE' || STORAGE_ERRORS.has(error?.code),
    onFailed: failed => emit('locations:sync-failed', { teams: [...new Set(failed.map(item => item.team))] }),
  })
  const flushOutbox = async () => {
    if (outbox.pending()) await outbox.flush().catch(() => {})
  }
  const outboxTimer = setInterval(flushOutbox, 30000)
  outboxTimer.unref?.()
  setTimeout(flushOutbox, 0).unref?.()
  for (const [channel, method] of Object.entries(LOCATION_WRITES)) {
    handle(`locations:${channel}`, async (user, p) => {
      if (!QUEUED_METHODS.has(method)) return runLocations({ method, user, request: p })
      const { label, ...rest } = p
      // The id also goes to the service, which records it in the shared data so a replay is never applied twice.
      const request = { ...rest, actionId: typeof rest.actionId === 'string' && rest.actionId ? rest.actionId.slice(0, 100) : crypto.randomUUID() }
      const outcome = await outbox.submit({ id: request.actionId, method, user, request, label: typeof label === 'string' ? label.slice(0, 200) : '' })
      return outcome.queued ? { queued: true } : outcome.duplicate ? { duplicate: true } : outcome.result
    })
  }
  const ownTeam = user => item => item.team === user.team
  handle('locations:pending', user => ({ pending: outbox.pending(), failures: outbox.failures(ownTeam(user)).map(({ id, method, label, name, email, code, at }) => ({ id, method, label, name, email, code, at })) }))
  handle('locations:ack-failures', (user, p) => {
    const mine = new Set(outbox.failures(ownTeam(user)).map(item => item.id))
    outbox.acknowledge((Array.isArray(p.ids) ? p.ids : []).filter(id => mine.has(id)))
    return { ok: true }
  })
  // Tegningen needs M: (never queued); only a publish changes the places.
  handle('locations:layout', user => layouts.layout(user))
  handle('locations:layout-draft', user => layouts.draft(user))
  handle('locations:layout-preview', user => layouts.previewPublish(user))
  handle('locations:layout-versions', user => layouts.versions(user))
  handle('locations:layout-start-draft', user => layouts.startDraft(user))
  handle('locations:layout-save-draft', (user, p) => layouts.saveDraft(user, { draft: p.draft, takeOver: p.takeOver === true }))
  handle('locations:layout-discard-draft', user => layouts.discardDraft(user))
  handle('locations:layout-publish', async (user, p) => {
    const result = await layouts.publish(user, { rev: p.rev })
    emit('locations:changed', { team: user.team })
    return result
  })
  handle('locations:layout-open-version', (user, p) => layouts.openVersion(user, { version: p.version, takeOver: p.takeOver === true }))

  console.log('Lagerstyring: SAP', config.sapSystem, fixturesDir ? `| SAP fixtures ${fixturesDir}` : '', '| placeringsark', config.placementsDir)
  // Hubert's live answers read through the same services and the same Hub user as the module (TCD/TRR, own team, read only).
  const stockAssistant = createWarehouseAssistant({ userFor: serviceUser, counts, piDocs })
  const locationsAssistant = createLocationsAssistant({ userFor: serviceUser, service: locations })
  // Placeringer first ("hvor står R162-0717?"); questions about Optælling are left to it.
  const assistant = { answer: async request => (await locationsAssistant.answer(request)) || stockAssistant.answer(request) }
  return { channels, counts, locations, assistant, closeAll: () => { clearInterval(outboxTimer); return counts.closeAll() } }
}

module.exports = { registerWarehouse, DATA_FOLDER, SHARED_FOLDER }
