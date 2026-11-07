// Everything a CountPoint user can do with counts, with the permission checks in one place.
// No Electron imports: main.cjs wires it to IPC, tests drive it directly.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { TEAMS } = require('./teams.cjs')
const { storageRulesFor, suggestRulesFromStock, KINDS } = require('./core/classify.cjs')
const { buildSnapshot, indexSnapshot, summarizeSnapshot, normalizeMaterial, normalizeScope, MATERIAL_PATTERN } = require('./core/snapshot.cjs')
const { scopeStockTypes, scopeKinds, scopeOverlap, describeOverlap, TERMINAL_KINDS, ACCESSORY_KINDS } = require('./core/scopes.cjs')
const { normalizeSerial, matchSerial, activeEvents, aggregateCount, applyApprovals, freezeRows, buildCountLists, computeProgress } = require('./core/countState.cjs')
const { docLinesFromSnapshot, missingAtApproval, buildCountDoc } = require('./core/countDoc.cjs')
const { normalizeMatdoc } = require('./core/sapParsers.cjs')
const { differenceTotals, archiveLines } = require('./core/archive.cjs')
const { createJournal, readAllJournals } = require('./journal.cjs')

const CLAIM_IDLE_MS = 30 * 60 * 1000
const CLAIM_TOUCH_MS = 2 * 60 * 1000
const PENDING_TTL_MS = 30 * 60 * 1000
const IMPORT_MAX = 20000
const IMPORT_TEXT_MAX = 2_000_000
const QTY_MAX = 10000000
const REFRESH_MIN_MS = 1500
const OTHERS_REFRESH_MS = 10000
const LIST_LIMIT = 500
// Scanning svarer fra en cachet kontekst (rettigheder, låse, claims …): højst ~5 s gammel, samme princip som den
// offline journal. En ældre kontekst opfriskes i baggrunden; scanningen venter højst SCAN_CONTEXT_WAIT_MS på den.
const SCAN_CONTEXT_FRESH_MS = 5000
const SCAN_CONTEXT_WAIT_MS = 100
// Mens der scannes, opfriskes konteksten hvert 4. s i baggrunden, så næste scanning finder den frisk og aldrig venter.
// Opvarmningen stopper 2 min efter seneste scanning; en hængende opfriskning slippes efter 10 s.
const SCAN_CONTEXT_WARM_MS = 4000
const SCAN_CONTEXT_WARM_IDLE_MS = 120_000
const SCAN_CONTEXT_HUNG_MS = 10_000

function codeError(code, message) {
  return Object.assign(new Error(message || code), { code })
}

const lower = value => String(value || '').trim().toLowerCase()
const sameList = (list, wanted) => Array.isArray(list) && list.length === wanted.length && wanted.every(item => list.includes(item))
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

function createCountService({ repo, storeFor, fetcher, placementSource = null, reportWriter = null, peekRules = async () => ({}), localCache = null, journalsDir, deviceId, now = Date.now, newId = () => crypto.randomUUID(), emit = () => {}, journalOptions = {}, setTimer = setTimeout, clearTimer = clearTimeout, onScanContextRefreshed = () => {} }) {
  const pending = new Map()
  const opened = new Map()
  const archives = new Map()

  const isManager = user => user.role === 'manager' || user.role === 'creator'
  /** Who may fetch SAP for the count (again, or the stock of the day): the owner, a manager or an Optælling admin. */
  const canFetchDoc = (user, rights) => rights.isOwner || rights.isManager || user.countAdmin === true
  const me = user => ({ email: lower(user.email), name: user.fullName || user.email })

  function teamOf(user) {
    if (!TEAMS[user.team]) throw codeError('TEAM_NOT_ALLOWED')
    return user.team
  }

  /** The own team's rules through its store; other teams' rules are only peeked at (read only, never creates a folder). */
  async function rulesByTeam(ownTeam) {
    // In parallel: each team's rules is a round trip to M:.
    const teams = Object.keys(TEAMS)
    const stored = await Promise.all(teams.map(team => (team === ownTeam ? repo.getRules(team) : peekRules(team)).catch(() => ({}))))
    return Object.fromEntries(teams.map((team, index) => [team, storageRulesFor(team, stored[index] || {})]))
  }

  // ---------- Counts list ----------
  // Closed counts do not change until reopened, so their card details are read once.
  const closedDetails = new Map()
  async function listCounts(user) {
    const team = teamOf(user)
    const counts = await repo.listCounts(team)
    const email = lower(user.email)
    return Promise.all(counts.map(async entry => {
      const cacheKey = `${team}:${entry.id}:${email}`
      if (entry.status === 'closed' && closedDetails.has(cacheKey)) return { ...entry, ...closedDetails.get(cacheKey) }
      const [summary, members] = await Promise.all([repo.getSummary(team, entry.id).catch(() => null), repo.getMembers(team, entry.id).catch(() => ({}))])
      const details = { summary: summary || null, members: Object.values(members).filter(member => member.status === 'approved').length, requests: Object.values(members).filter(member => member.status === 'requested').length, myStatus: members[email]?.status || null }
      if (entry.status === 'closed') closedDetails.set(cacheKey, details)
      else closedDetails.delete(cacheKey)
      return { ...entry, ...details }
    }))
  }

  // ---------- Statuses: a manager starts a status, counts belong to it ----------
  async function requireActiveStatus(team) {
    const status = await repo.getActiveStatus(team)
    if (!status) throw codeError('STATUS_NONE', 'En manager skal starte en status, før der kan oprettes optællinger')
    return status
  }

  async function statusOverview(user) {
    const team = teamOf(user)
    const [statuses, counts] = await Promise.all([repo.listStatuses(team), listCounts(user)])
    const withCounts = statuses.map(status => {
      const own = counts.filter(item => item.statusId === status.id)
      const progress = statusProgress(own)
      if (status.state !== 'open') return { ...status, counts: own, progress }
      const taken = own.map(item => ({ countId: item.id, name: item.name, ownerName: item.owner.name, type: item.scope.type, slocs: item.scope.slocs, materials: item.scope.materials, stockTypes: scopeStockTypes(item.scope), kinds: scopeKinds(item.scope) }))
      return { ...status, counts: own, progress, taken }
    })
    return { active: withCounts.find(status => status.state === 'open') || null, statuses: withCounts, unassigned: counts.filter(item => !item.statusId), canManage: isManager(user) }
  }

  function statusProgress(counts) {
    const reached = counts.reduce((sum, item) => sum + (item.summary?.reached || 0), 0)
    const total = counts.reduce((sum, item) => sum + (item.summary?.total || 0), 0)
    const valueDiff = Math.round(counts.reduce((sum, item) => sum + (item.summary?.valueDiff || 0), 0) * 100) / 100
    return { counts: counts.length, closed: counts.filter(item => item.status === 'closed').length, reached, total, percent: total ? Math.round((reached / total) * 100) : 0, valueDiff }
  }

  /** Each storage location + stock type, and each material, is counted in one count of a status only. */
  async function assertScopeFree(team, statusId, scope) {
    for (const entry of await statusCounts(team, statusId)) {
      const overlap = scopeOverlap(scope, entry.scope)
      if (overlap) throw codeError('SCOPE_TAKEN', describeOverlap(overlap, entry))
    }
  }

  async function statusCounts(team, statusId, exceptId = null) {
    return (await repo.listCounts(team)).filter(entry => entry.statusId === statusId && entry.id !== exceptId)
  }

  // ---------- Approve and lock a status (managers) ----------
  /** What still stands between the status and "Godkend og lås": open counts and materials not approved or posted. */
  async function statusChecklist(user, statusId) {
    const team = teamOf(user)
    const status = await repo.getStatus(team, statusId)
    const items = []
    for (const entry of await statusCounts(team, statusId)) {
      const data = await reportData(user, entry.id)
      const materials = new Map()
      for (const row of data.aggregate.rows) if (row.sapQty > 0 || row.counted > 0) materials.set(row.material, row.description)
      const pending = [...materials]
        .filter(([material]) => !['approved', 'posted'].includes(data.approvals?.[material]?.status))
        .map(([material, description]) => ({ material, description, status: data.approvals?.[material]?.status || 'open' }))
      items.push({ id: entry.id, name: entry.name, owner: entry.owner, open: data.meta.status !== 'closed', materials: materials.size, pending })
    }
    return { statusId, state: status.state, ready: items.length > 0 && items.every(item => !item.open && !item.pending.length), counts: items }
  }

  /** The final reports are written in the language of the manager who locks (Danish unless English is asked for). */
  async function lockStatus(user, statusId, { language } = {}) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan godkende og låse en status')
    const team = teamOf(user)
    const status = await repo.getStatus(team, statusId)
    if (status.state !== 'open') throw lockedError()
    const checklist = await statusChecklist(user, statusId)
    if (!checklist.ready) throw codeError('STATUS_NOT_READY', checklist.counts.length ? 'Alle optællinger skal være afsluttet og alle materialer godkendt eller bogført' : 'Statussen har ingen optællinger')
    if (!reportWriter) throw codeError('REPORT_UNAVAILABLE')
    const counts = []
    const reportLanguage = language === 'en' ? 'en' : 'da'
    for (const item of checklist.counts) counts.push({ ...(await reportData(user, item.id)), language: reportLanguage })
    const by = me(user)
    const lockedAt = now()
    const version = (status.reports || []).length + 1
    const countFiles = []
    for (const data of counts) countFiles.push({ countId: data.meta.id, name: data.meta.name, file: path.basename(await reportWriter.count(team, data)) })
    const finalStatus = { ...status, state: 'locked', lockedBy: by, lockedAt, history: [...(status.history || []), { at: lockedAt, by, action: 'locked' }] }
    const file = path.basename(await reportWriter.status(team, { status: finalStatus, version, counts, language: reportLanguage }))
    const reports = [...(status.reports || []), { version, file, at: lockedAt, counts: countFiles }]
    return repo.updateStatus(team, statusId, { state: 'locked', lockedBy: by, lockedAt, reports }, { action: 'locked', by }, { expectState: 'open' })
  }

  /**
   * A locked status as an archive: every counted line with approval and SAP documents, and the difference (|over| + |under|)
   * per count and in total. Cached until the status is unlocked and locked again.
   */
  async function statusArchive(user, statusId) {
    const team = teamOf(user)
    const status = await repo.getStatus(team, statusId)
    if (status.state !== 'locked') throw codeError('STATUS_NOT_LOCKED', 'Arkivet viser kun låste statusser')
    const cacheKey = `${team}:${statusId}:${status.lockedAt}`
    if (archives.has(cacheKey)) return archives.get(cacheKey)
    const counts = []
    const lines = []
    for (const entry of await statusCounts(team, statusId)) {
      const [data, docs] = await Promise.all([reportData(user, entry.id), repo.getPiDocs(team, entry.id).catch(() => ({}))])
      const own = archiveLines({ count: { id: entry.id, name: entry.name }, rows: data.aggregate.rows, approvals: data.approvals, docs: Object.values(docs) })
      counts.push({ id: entry.id, name: entry.name, totals: differenceTotals(own) })
      lines.push(...own)
    }
    const result = { statusId, totals: differenceTotals(lines), counts, lines }
    archives.set(cacheKey, result)
    return result
  }

  async function unlockStatus(user, statusId, { reason } = {}) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan låse en status op')
    const text = clean(reason, 300)
    if (text.length < 3) throw codeError('UNLOCK_REASON', 'Skriv hvorfor statussen låses op')
    return repo.updateStatus(teamOf(user), statusId, { state: 'open', lockedBy: null, lockedAt: null }, { action: 'unlocked', by: me(user), reason: text }, { expectState: 'locked', soleOpen: true })
  }

  async function startStatus(user, { year, quarter, name } = {}) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan starte en status')
    const y = Number(year)
    const q = Number(quarter)
    return repo.startStatus(teamOf(user), { name: clean(name, 80) || `Status Q${q} ${y}`, year: y, quarter: q, by: me(user) })
  }

  // ---------- New count: SAP fetch + preview, then create ----------
  /** A new count is unblocked or blocked stock, and terminals or accessories; blocked stock and accessories belong in D000 only. */
  function newCountScope(team, scope) {
    const stockTypes = scope?.stockTypes ?? ['unrestricted']
    if (!Array.isArray(stockTypes) || stockTypes.length !== 1) throw codeError('SCOPE_INVALID', 'Vælg unblocked eller blocked')
    const kinds = scope?.kinds
    if (kinds !== undefined && !(sameList(kinds, TERMINAL_KINDS) || sameList(kinds, ACCESSORY_KINDS))) throw codeError('SCOPE_INVALID', 'Vælg terminaler eller tilbehør')
    const normalized = normalizeScope(team, { ...scope, stockTypes })
    const onlyD000 = normalized.type === 'slocs' && normalized.slocs.join(',') === 'D000'
    if (stockTypes[0] === 'blocked' && !onlyD000) throw codeError('SCOPE_INVALID', 'Blocked lager tælles kun i D000')
    if (kinds && sameList(kinds, ACCESSORY_KINDS) && !onlyD000) throw codeError('SCOPE_INVALID', 'Tilbehør tælles kun i D000')
    return normalized
  }

  /** Accessories belong in D000; any elsewhere in the team's storage locations is an error to show before counting. */
  function accessoriesOutsideD000(team, snapshot) {
    if (!sameList(scopeKinds(snapshot.scope), ACCESSORY_KINDS)) return []
    const bySloc = new Map()
    for (const line of snapshot.stock) {
      const entry = snapshot.materials[line.m]
      if (entry.kind !== 'accessory' || line.sloc === 'D000' || !TEAMS[team].storageLocations.includes(line.sloc)) continue
      const item = bySloc.get(line.sloc) || { sloc: line.sloc, materials: new Set(), quantity: 0 }
      item.materials.add(entry.material)
      item.quantity += line.unrestricted + line.blocked
      bySloc.set(line.sloc, item)
    }
    return [...bySloc.values()].map(item => ({ sloc: item.sloc, materials: item.materials.size, quantity: item.quantity })).sort((a, b) => a.sloc.localeCompare(b.sloc))
  }

  async function preview(user, { scope, exclusions = [] } = {}) {
    const team = teamOf(user)
    const status = await requireActiveStatus(team)
    const normalized = newCountScope(team, scope)
    await assertScopeFree(team, status.id, normalized)
    const fetched = await fetcher.fetchPlant({ onProgress: step => emit('sap:fetch-progress', { step }) })
    const snapshot = buildSnapshot({ team, scope: normalized, mb52: fetched.mb52, serials: fetched.serials, rulesByTeam: await rulesByTeam(team), exclusions, fetchedAt: fetched.fetchedAt, fetchedBy: lower(user.email) })
    let sheet = null
    if (team === 'TCD' && placementSource) {
      try { sheet = await placementSource.load() } catch (error) { console.error('CountPoint: placement sheet unavailable', error.code || error.message) }
    }
    const token = crypto.randomBytes(16).toString('hex')
    for (const [key, value] of pending) {
      if (now() - value.at > PENDING_TTL_MS || (value.email === lower(user.email) && !value.countId)) pending.delete(key)
    }
    pending.set(token, { at: now(), email: lower(user.email), team, snapshot, placements: sheet?.placements || [] })
    return { token, summary: summarizeSnapshot(snapshot), accessoryOutside: accessoriesOutsideD000(team, snapshot), placementSheet: sheet ? { file: path.basename(sheet.file), placements: sheet.placements.length } : null }
  }

  async function createCount(user, { token, name } = {}) {
    const team = teamOf(user)
    const entry = pending.get(token)
    if (!entry || entry.email !== lower(user.email) || entry.team !== team) throw codeError('PREVIEW_EXPIRED', 'Hent data fra SAP igen')
    const status = await requireActiveStatus(team)
    await assertScopeFree(team, status.id, entry.snapshot.scope)
    const index = indexSnapshot(entry.snapshot)
    const inScope = new Set(entry.snapshot.stock.filter(line => line.inScope).map(line => entry.snapshot.materials[line.m].material))
    const placements = entry.placements.filter(item => inScope.has(item.material) && !index.materials.get(item.material)?.serialManaged)
    const meta = await repo.createCount(team, { name, snapshot: entry.snapshot, placements, owner: me(user), statusId: status.id })
    pending.delete(token)
    return meta
  }

  // ---------- Open count state ----------
  /** Read from M: and keep a local copy; when M: is unreachable, use the local copy from the last time. */
  async function fromDriveOrCache(team, id, part, read) {
    let failure = null
    try {
      const value = await read()
      if (value !== undefined && value !== null) {
        if (localCache) await localCache.save(team, id, part, value).catch(error => console.error('CountPoint: local cache write failed', error.code))
        return value
      }
    } catch (error) {
      failure = error
    }
    const cached = localCache ? await localCache.load(team, id, part) : undefined
    if (cached !== undefined) return cached
    if (failure && failure.code !== 'COUNT_NOT_FOUND') throw codeError('STORAGE_UNAVAILABLE')
    throw codeError('COUNT_NOT_FOUND')
  }

  async function load(user, id) {
    const team = teamOf(user)
    const key = `${team}:${id}:${lower(user.email)}`
    let state = opened.get(key)
    if (!state) {
      // Every read is a round trip to M: (150–300 ms, more when it is busy), so they run in parallel.
      const [deleted, ...parts] = await Promise.allSettled([
        repo.isDeleted(team, id).catch(() => false),
        fromDriveOrCache(team, id, 'meta', () => repo.getMeta(team, id)),
        fromDriveOrCache(team, id, 'expected', () => repo.getSnapshot(team, id)),
        fromDriveOrCache(team, id, 'placements', () => repo.getPlacements(team, id)).catch(() => []),
        fromDriveOrCache(team, id, 'members', () => repo.getMembers(team, id).then(value => (Object.keys(value).length ? value : undefined))).catch(() => ({})),
      ])
      if (deleted.value) throw deletedError()
      const [meta, snapshot, placements, members] = parts.map(part => { if (part.status === 'rejected') throw part.reason; return part.value })
      const index = indexSnapshot(snapshot)
      const journal = createJournal({ countId: id, team, user: me(user), deviceId, localDir: journalsDir, remote: storeFor(team), now, ...journalOptions })
      await journal.load()
      state = { team, id, meta, snapshot, index, placements, members, countLists: buildCountLists({ snapshot, index, placements }), journal, chunkCache: new Map(), remoteEvents: [], aggregate: null, aggregateKey: '', found: new Map(), refreshedAt: 0, claimTouched: new Map(), othersAt: 0, othersKey: '[]' }
      opened.set(key, state)
      await refresh(state, true)
    }
    return state
  }

  async function refresh(state, force = false) {
    if (!force && now() - state.refreshedAt < REFRESH_MIN_MS) return state
    state.refreshedAt = now()
    const journals = readAllJournals({ remote: storeFor(state.team), countId: state.id, cache: state.chunkCache })
      .then(events => { state.remoteEvents = events })
      .catch(error => console.error('CountPoint: journals unavailable', error.code || error.message))
    const meta = repo.getMeta(state.team, state.id).then(value => {
      if (localCache && JSON.stringify(value) !== JSON.stringify(state.meta)) localCache.save(state.team, state.id, 'meta', value).catch(() => {})
      state.meta = value
    }).catch(() => {})
    await Promise.all([throwIfDeleted(state), journals, meta])
    await refreshOthers(state)
    const events = mergedEvents(state)
    const key = `${events.length}:${events.at(-1)?.id || ''}:${state.snapshot.fetchedAt}`
    if (key !== state.aggregateKey) {
      state.aggregate = aggregateCount({ snapshot: state.snapshot, index: state.index, events })
      state.found = new Map(state.aggregate.found)
      state.aggregateKey = key
      state.events = events
    }
    return state
  }

  /** The other counts of the status, so a scan that belongs to one of them says where it is counted. */
  async function refreshOthers(state) {
    if (!state.meta.statusId || now() - state.othersAt < OTHERS_REFRESH_MS) return
    try {
      const others = (await statusCounts(state.team, state.meta.statusId, state.id)).map(entry => ({ id: entry.id, name: entry.name, scope: entry.scope }))
      state.othersAt = now()
      const key = JSON.stringify(others)
      if (key === state.othersKey) return
      state.index.others = others
      state.othersKey = key
      state.aggregateKey = ''
    } catch (error) {
      console.error('CountPoint: other counts unavailable', error.code || error.message)
    }
  }

  function mergedEvents(state) {
    const byId = new Map(state.remoteEvents.map(event => [event.id, event]))
    for (const event of state.journal.events()) byId.set(event.id, event)
    return [...byId.values()].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
  }

  async function access(user, state) {
    const [members, locked] = await Promise.all([repo.getMembers(state.team, state.id).catch(() => null), statusLocked(state.team, state.meta.statusId)])
    adoptMembers(state, members)
    return rightsOf(user, state, locked)
  }

  // A count always has its owner as member, so an empty answer means the drive is unreachable:
  // keep using the last known members, so counting can go on locally.
  function adoptMembers(state, fresh) {
    if (fresh && Object.keys(fresh).length) {
      if (localCache && JSON.stringify(fresh) !== JSON.stringify(state.members)) localCache.save(state.team, state.id, 'members', fresh).catch(() => {})
      state.members = fresh
    }
  }

  function rightsOf(user, state, locked) {
    const members = state.members || {}
    const email = lower(user.email)
    const member = members[email]
    const isOwner = lower(state.meta.owner.email) === email
    return { members, member, isOwner, locked, canWrite: !locked && state.meta.status === 'open' && member?.status === 'approved', isManager: isManager(user) }
  }

  async function statusLocked(team, statusId) {
    if (!statusId) return false
    const status = await repo.getStatus(team, statusId).catch(() => null)
    return status?.state === 'locked'
  }

  function lockedError() {
    return codeError('STATUS_LOCKED', 'Statussen er godkendt og låst – intet kan ændres')
  }

  async function assertStatusOpen(team, meta) {
    if (await statusLocked(team, meta.statusId)) throw lockedError()
  }

  async function requireWriter(user, id) {
    const state = await load(user, id)
    await throwIfDeleted(state)
    const rights = await access(user, state)
    if (rights.locked) throw lockedError()
    if (state.meta.status !== 'open') throw codeError('COUNT_CLOSED', 'Optællingen er afsluttet')
    if (!rights.canWrite) throw codeError('COUNT_NOT_MEMBER', 'Du deltager ikke i optællingen')
    return { state, rights }
  }

  async function openCount(user, id) {
    const state = await load(user, id)
    const [rights, own, serialRules] = await Promise.all([
      access(user, state),
      repo.getOwnPlacements(state.team).catch(() => []),
      state.team === 'TCD' ? repo.getSerialRules(state.team).catch(() => ({})) : {},
    ])
    const areas = [...new Set([...state.countLists.map(line => line.area), ...own.map(item => item.area)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'da', { numeric: true }))
    return {
      meta: state.meta,
      statusLocked: rights.locked,
      summary: summarizeSnapshot(state.snapshot),
      me: { email: lower(user.email), isOwner: rights.isOwner, isManager: rights.isManager, canFetchSap: canFetchDoc(user, rights), status: rights.member?.status || null, canWrite: rights.canWrite },
      countLists: state.countLists,
      materials: materialsFor(state),
      areas,
      places: placesFor(state, own),
      serialRules,
    }
  }

  function materialsFor(state) {
    const result = []
    for (const line of state.snapshot.stock) {
      if (!line.inScope) continue
      const entry = state.snapshot.materials[line.m]
      result.push({ material: entry.material, description: entry.description, kind: entry.kind, serialManaged: entry.serialManaged, sloc: line.sloc, unrestricted: line.unrestricted, blocked: line.blocked })
    }
    return result
  }

  /** Read-only view of a count for Hubert: figures, differences, approvals, material locks and area claims. Writes nothing (not even the summary). */
  async function readCount(user, id) {
    const state = await refresh(await load(user, id))
    const [approvals, claims, locks] = await Promise.all([repo.getApprovals(state.team, state.id).catch(() => ({})), repo.getClaims(state.team, state.id).catch(() => ({})), materialLocks(state)])
    const aggregate = applyApprovals(state.aggregate, approvals)
    return {
      meta: state.meta,
      rows: aggregate.rows,
      approvals,
      claims: activeClaims(claims),
      materialLocks: Object.entries(locks).map(([material, lock]) => lockView(material, lock)),
      progress: computeProgress({ snapshot: state.snapshot, aggregate, countLists: state.countLists, events: state.events || [], approvals, now: now() }),
    }
  }

  function placesFor(state, own) {
    const places = new Map()
    for (const item of state.placements) places.set(item.placement.toLowerCase(), { name: item.placement, area: item.area, source: 'sheet' })
    for (const item of own) places.set(item.name.toLowerCase(), { name: item.name, area: item.area, source: 'own' })
    return [...places.values()].sort((a, b) => a.name.localeCompare(b.name, 'da', { numeric: true }))
  }

  async function getState(user, id) {
    const state = await refresh(await load(user, id))
    const [rights, claims, approvals, locks] = await Promise.all([
      access(user, state),
      repo.getClaims(state.team, state.id).catch(() => ({})),
      repo.getApprovals(state.team, state.id).catch(() => ({})),
      materialLocks(state),
    ])
    const aggregate = applyApprovals(state.aggregate, approvals)
    const progress = computeProgress({ snapshot: state.snapshot, aggregate, countLists: state.countLists, events: state.events || [], approvals, now: now() })
    // Not awaited: a write to M: can take 30 s, and the count must not wait for it.
    saveSummary(state, progress, aggregate)
    return {
      meta: state.meta,
      statusLocked: rights.locked,
      me: { email: lower(user.email), isOwner: rights.isOwner, isManager: rights.isManager, canFetchSap: canFetchDoc(user, rights), status: rights.member?.status || null, canWrite: rights.canWrite },
      progress,
      rows: aggregate.rows,
      totals: aggregate.totals,
      lines: aggregate.lines,
      moves: aggregate.moves.slice(0, LIST_LIMIT),
      movesTotal: aggregate.moves.length,
      duplicates: aggregate.duplicates.slice(-50).reverse(),
      serials: { found: aggregate.serials.found, expected: aggregate.serials.expected, missing: aggregate.serials.missing.length, extra: aggregate.serials.extra.length },
      members: Object.values(rights.members),
      claims: activeClaims(claims),
      materialLocks: Object.entries(locks).map(([material, lock]) => lockView(material, lock)),
      approvals,
      journal: state.journal.status(),
      myLastEvents: state.journal.events().filter(event => event.type !== 'undo').slice(-20).reverse(),
    }
  }

  function saveSummary(state, progress, aggregate, force = false) {
    const last = state.summarySavedAt || 0
    const changed = progress.overall.percent !== state.summaryPercent
    if (!force && !(changed && now() - last >= 10000) && now() - last < 120000) return
    state.summarySavedAt = now()
    state.summaryPercent = progress.overall.percent
    const valueDiff = Math.round(aggregate.rows.reduce((sum, row) => sum + (row.valueDiff || 0), 0) * 100) / 100
    return repo.setSummary(state.team, state.id, { percent: progress.overall.percent, reached: progress.overall.reached, total: progress.overall.total, valueDiff, updatedAt: now() }).catch(() => {})
  }

  function activeClaims(claims) {
    return Object.entries(claims).filter(([, claim]) => claim && now() - claim.lastActivity < CLAIM_IDLE_MS).map(([area, claim]) => ({ area, ...claim }))
  }

  async function listSerials(user, id, { kind = 'missing', query = '', limit = LIST_LIMIT } = {}) {
    const state = await refresh(await load(user, id))
    const source = kind === 'extra' ? state.aggregate.serials.extra : kind === 'duplicates' ? state.aggregate.duplicates : state.aggregate.serials.missing
    const needle = String(query || '').trim().toUpperCase()
    const filtered = needle ? source.filter(item => item.serial.includes(needle) || String(item.material || '').includes(needle) || String(item.sloc || '') === needle) : source
    return { total: filtered.length, items: filtered.slice(0, Math.min(Number(limit) || LIST_LIMIT, 2000)) }
  }

  // ---------- Scanning and counting ----------
  async function materialSerials(user, id, { material, query = '', limit = 1000 } = {}) {
    const state = await refresh(await load(user, id))
    const code = normalizeMaterial(material)
    const entry = state.index.materials.get(code)
    if (!entry) throw codeError('MATERIAL_NOT_FOUND', 'Materialet er ikke i optællingen')
    const needle = String(query || '').replace(/\s+/g, '').toUpperCase()
    const max = Math.min(Math.max(Number(limit) || 1000, 1), 5000)
    const found = []
    const missing = []
    for (const [serial, info] of state.index.serials) {
      if (info.material !== code || !info.inScope) continue
      const who = state.found.get(serial)
      const item = { serial, sloc: info.sloc, stockType: info.stockType }
      if (who) found.push({ ...item, place: who.place, byName: who.byName, at: who.at, source: who.source, document: who.document || '' })
      else missing.push(item)
    }
    const elsewhere = state.aggregate.serials.extra.filter(item => item.material === code)
    const matches = item => !needle || item.serial.includes(needle) || String(item.place || '').toUpperCase().includes(needle)
    found.sort((a, b) => b.at - a.at)
    missing.sort((a, b) => a.serial.localeCompare(b.serial))
    const pick = list => list.filter(matches).slice(0, max)
    return {
      material: code, description: entry.description, kind: entry.kind, serialManaged: entry.serialManaged,
      expected: found.length + missing.length,
      totals: { found: found.length, missing: missing.length, elsewhere: elsewhere.length },
      found: pick(found), missing: pick(missing),
      elsewhere: pick(elsewhere.map(item => ({ serial: item.serial, sloc: item.sloc, stockType: item.stockType, place: item.place, byName: item.byName, at: item.at, source: item.source, outcome: item.outcome }))),
    }
  }
  function areaOfPlace(state, place, own = []) {
    const name = String(place || '').toLowerCase()
    if (!name) return ''
    const sheet = state.placements.find(item => item.placement.toLowerCase() === name)
    if (sheet) return sheet.area
    const ownPlace = own.find(item => item.name.toLowerCase() === name)
    return ownPlace?.area || ''
  }

  function areaContext(user, state, place, context) {
    const area = areaOfPlace(state, place, context.own)
    if (!area) return { area: '', warning: null }
    const claim = context.claims[area]
    const email = lower(user.email)
    if (claim && now() - claim.lastActivity < CLAIM_IDLE_MS) {
      if (claim.email !== email) return { area, warning: { area, byName: claim.name } }
      const touched = state.claimTouched.get(area) || 0
      if (now() - touched > CLAIM_TOUCH_MS) {
        state.claimTouched.set(area, now())
        repo.setClaim(state.team, state.id, area, { ...claim, lastActivity: now() }).catch(() => {})
      }
    }
    return { area, warning: null }
  }

  // ---------- Scan context: what a scan needs from M:, cached per open count (and so per user) ----------
  // Afvisninger (slettet, låst status, afsluttet, ikke medlem) kommer med højst ~5 s forsinkelse; en kontekst, der
  // afviser, bruges aldrig fra cachen men hentes forfra, så en netop godkendt deltager kan scanne med det samme.
  let scanContextWarned = false
  let scanContextHungWarned = false

  const startTimer = (fn, ms) => {
    const timer = setTimer(fn, ms)
    timer?.unref?.()
    return timer
  }

  function fetchScanContext(state) {
    if (state.scanFetch && state.scanFetch.gen === state.scanGen) return state.scanFetch.promise
    const gen = state.scanGen
    const at = now()
    let hung = null
    const promise = Promise.all([
      repo.isDeleted(state.team, state.id).catch(() => false),
      repo.getMembers(state.team, state.id).catch(() => null),
      statusLocked(state.team, state.meta.statusId),
      repo.getOwnPlacements(state.team).catch(() => []),
      repo.getClaims(state.team, state.id).catch(() => ({})),
      materialLocks(state),
      repo.getApprovals(state.team, state.id).catch(() => ({})),
    ]).then(([deleted, members, locked, own, claims, locks, approvals]) => {
      const context = { at, deleted, locked, own, claims, locks, approvals }
      // Et sent svar (efter invalidering eller timeout) ignoreres.
      if (state.scanGen === gen) {
        adoptMembers(state, members)
        state.scanContext = context
      }
      return context
    }).finally(() => {
      clearTimer(hung)
      if (state.scanFetch?.promise === promise) state.scanFetch = null
      onScanContextRefreshed()
    })
    // Hænger drevet, slippes single-flight-pladsen efter 10 s, så en senere scanning kan starte en ny opfriskning.
    hung = startTimer(() => {
      if (state.scanFetch?.promise !== promise) return
      state.scanFetch = null
      state.scanGen = (state.scanGen || 0) + 1
      if (!scanContextHungWarned) console.error('CountPoint: scan context refresh hung, released after', SCAN_CONTEXT_HUNG_MS, 'ms')
      scanContextHungWarned = true
    }, SCAN_CONTEXT_HUNG_MS)
    state.scanFetch = { gen, promise }
    return promise
  }

  const refreshInBackground = state => fetchScanContext(state).catch(error => {
    if (!scanContextWarned) console.error('CountPoint: scan context refresh failed', error.code || error.message)
    scanContextWarned = true
    return null
  })

  /** Holder konteksten varm mens der scannes: én timer pr. åben optælling (= pr. bruger), stopper efter 2 min uden scanning. */
  function warmScanContext(state) {
    clearTimer(state.scanWarm)
    state.scanWarm = startTimer(() => {
      state.scanWarm = null
      if (state.scanWarmStopped || now() - state.lastScanAt >= SCAN_CONTEXT_WARM_IDLE_MS) return
      refreshInBackground(state)
      warmScanContext(state)
    }, SCAN_CONTEXT_WARM_MS)
  }

  function stopScanWarm(state) {
    clearTimer(state.scanWarm)
    state.scanWarm = null
    state.scanWarmStopped = true
  }

  const contextDenies = (user, state, context) => context.deleted || state.meta.status !== 'open' || !rightsOf(user, state, context.locked).canWrite

  async function scanContext(user, state) {
    const cached = state.scanContext
    if (cached && !contextDenies(user, state, cached)) {
      if (now() - cached.at < SCAN_CONTEXT_FRESH_MS) return cached
      // Kun første scanning efter en pause rammer en forældet kontekst (opvarmningen holder den ellers frisk).
      const refreshing = refreshInBackground(state)
      let timer
      const waited = new Promise(resolve => { timer = setTimeout(resolve, SCAN_CONTEXT_WAIT_MS, null) })
      const settled = await Promise.race([refreshing, waited]).finally(() => clearTimeout(timer))
      return settled || cached
    }
    return fetchScanContext(state)
  }

  /** The same checks, in the same order and with the same errors, as requireWriter – from the scan context. */
  function requireScanWriter(user, state, context) {
    if (context.deleted) {
      forget(state.team, state.id)
      throw deletedError()
    }
    const rights = rightsOf(user, state, context.locked)
    if (rights.locked) throw lockedError()
    if (state.meta.status !== 'open') throw codeError('COUNT_CLOSED', 'Optællingen er afsluttet')
    if (!rights.canWrite) throw codeError('COUNT_NOT_MEMBER', 'Du deltager ikke i optællingen')
    return rights
  }

  /** This client changed something the scan context holds: the next scan reads it again. */
  function dropScanContext(team, id = null) {
    for (const state of opened.values()) {
      if (state.team !== team || (id !== null && state.id !== id)) continue
      state.scanContext = null
      state.scanGen = (state.scanGen || 0) + 1
    }
  }

  async function scan(user, id, { serial, place } = {}) {
    const state = await load(user, id)
    const context = await scanContext(user, state)
    requireScanWriter(user, state, context)
    const normalized = normalizeSerial(serial)
    const cleanPlace = clean(place, 60)
    const result = matchSerial(normalized, state.index, state.found)
    if (result.outcome === 'invalid') return { ...result, saved: false }
    const { area, warning } = areaContext(user, state, cleanPlace, context)
    const event = await state.journal.append({ type: 'scan', serial: normalized, place: cleanPlace, area })
    if (result.outcome !== 'duplicate') state.found.set(normalized, { by: event.by, byName: event.byName, at: event.at, place: cleanPlace, source: 'scan', eventId: event.id })
    state.lastScanAt = now()
    if (!state.scanWarmStopped) warmScanContext(state)
    let materialWarning = null
    if (result.outcome === 'found' && result.material) {
      const lock = context.locks[result.material]
      if (isApprovedStatus(context.approvals[result.material])) materialWarning = { kind: 'approved', byName: '' }
      else if (lock && !mayCount(lock, lower(user.email))) materialWarning = { kind: 'locked', byName: lock.name }
    }
    return { ...result, saved: true, eventId: event.id, areaWarning: warning, materialWarning, journal: state.journal.status() }
  }

  /** Takes a found serial out again (wrong scan, item that is not really there). Logged in the journal and undoable. */
  async function removeSerial(user, id, { serial } = {}) {
    const { state, rights } = await requireWriter(user, id)
    await refresh(state, true)
    const normalized = normalizeSerial(serial)
    const previous = normalized && state.found.get(normalized)
    if (!previous) throw codeError('SERIAL_NOT_FOUND', 'Serienummeret er ikke registreret som fundet')
    const material = state.index.serials.get(normalized)?.material
    if (material) {
      const [locks, approvals] = await Promise.all([materialLocks(state), repo.getApprovals(state.team, state.id).catch(() => ({}))])
      if (isApprovedStatus(approvals[material])) throw codeError('MATERIAL_APPROVED', `${material} er godkendt – serienumre kan ikke fjernes`)
      const lock = locks[material]
      if (lock && !mayCount(lock, lower(user.email)) && !rights.isOwner) throw codeError('MATERIAL_LOCKED', `${lock.name} tæller ${material}`)
    }
    const event = await state.journal.append({ type: 'serial-remove', serial: normalized, material: material || '' })
    await refresh(state, true)
    return { serial: normalized, material: material || null, previous: { byName: previous.byName, at: previous.at, place: previous.place }, eventId: event.id }
  }

  async function undo(user, id, { eventId } = {}) {
    const { state } = await requireWriter(user, id)
    const own = state.journal.events()
    const undone = new Set(own.filter(event => event.type === 'undo').map(event => event.target))
    const target = eventId
      ? own.find(event => event.id === eventId && event.type !== 'undo')
      : [...own].reverse().find(event => ['scan', 'import', 'line', 'line-delete', 'serial-remove'].includes(event.type) && !undone.has(event.id))
    if (!target || undone.has(target.id)) throw codeError('UNDO_NOT_FOUND', 'Der er ikke noget at fortryde')
    await state.journal.append({ type: 'undo', target: target.id })
    await refresh(state, true)
    return { undone: target }
  }

  function validateLine(state, input) {
    const material = String(input.material || '').trim().toUpperCase()
    if (!MATERIAL_PATTERN.test(material)) throw codeError('LINE_INVALID', 'Ugyldigt materialenummer')
    const qty = Number(input.qty)
    if (!Number.isInteger(qty) || qty < 0 || qty > QTY_MAX) throw codeError('LINE_INVALID', 'Antal skal være et helt tal')
    const allowed = scopeStockTypes(state.snapshot.scope)
    const requested = ['unrestricted', 'blocked'].includes(input.stockType) ? input.stockType : null
    if (requested && !allowed.includes(requested)) throw codeError('LINE_INVALID', 'Lagertypen indgår ikke i optællingen')
    const stockType = requested || allowed[0]
    const known = state.snapshot.stock.filter(line => line.inScope && state.snapshot.materials[line.m].material === material).map(line => line.sloc)
    let sloc = String(input.sloc || '').trim().toUpperCase()
    if (!sloc) sloc = known[0] || state.snapshot.scope.slocs[0]
    if (!state.snapshot.scope.slocs.includes(sloc)) throw codeError('LINE_INVALID', 'Ugyldig storage location')
    const place = clean(input.place, 60)
    if (!place) throw codeError('LINE_INVALID', 'Vælg en placering')
    return { material, qty, stockType, sloc, place, status: input.status === 'error' ? 'error' : 'counted', comment: clean(input.comment, 200) }
  }

  async function saveLine(user, id, input = {}) {
    const { state } = await requireWriter(user, id)
    const line = validateLine(state, input)
    await takeMaterial(user, state, line.material)
    const lineId = typeof input.lineId === 'string' && /^[a-z0-9-]{3,64}$/i.test(input.lineId) ? input.lineId : `ln-${newId()}`
    const own = await repo.getOwnPlacements(state.team).catch(() => [])
    const area = clean(input.area, 12).toUpperCase() || areaOfPlace(state, line.place, own)
    const event = await state.journal.append({ type: 'line', lineId, ...line, area })
    await refresh(state, true)
    return { lineId, eventId: event.id }
  }

  async function deleteLine(user, id, { lineId } = {}) {
    const { state } = await requireWriter(user, id)
    if (typeof lineId !== 'string' || !lineId) throw codeError('LINE_INVALID')
    await state.journal.append({ type: 'line-delete', lineId })
    await refresh(state, true)
    return { ok: true }
  }

  function parseSerialList(text) {
    return String(text || '').split(/[\r\n\t,;]+/).map(item => item.trim()).filter(Boolean)
  }

  function checkSerials(state, raw) {
    const seen = new Set()
    const result = { total: raw.length, invalid: 0, repeated: 0, found: 0, blocked: 0, move: 0, duplicate: 0, otherSloc: 0, otherCount: 0, outside: 0, unknown: 0 }
    const accepted = []
    for (const value of raw) {
      const serial = normalizeSerial(value)
      if (!serial) { result.invalid += 1; continue }
      if (seen.has(serial)) { result.repeated += 1; continue }
      seen.add(serial)
      const match = matchSerial(serial, state.index, state.found)
      if (match.outcome === 'found') { result.found += 1; if (match.blocked) result.blocked += 1; if (match.move) result.move += 1 }
      else if (match.outcome === 'duplicate') result.duplicate += 1
      else if (match.outcome === 'other-sloc') result.otherSloc += 1
      else if (match.outcome === 'other-count') result.otherCount += 1
      else if (match.outcome === 'outside') result.outside += 1
      else result.unknown += 1
      if (match.outcome !== 'duplicate') accepted.push(serial)
    }
    return { result, accepted }
  }

  async function importSerials(user, id, { text, serials, place, document = null, dryRun = true } = {}) {
    const { state } = await requireWriter(user, id)
    const cleanPlace = clean(place, 60)
    if (!cleanPlace) throw codeError('IMPORT_INVALID', 'Angiv hvor serienumrene står (fx "Palle 14.2")')
    const matdoc = document ? normalizeMatdoc(document) : null
    if (document && !matdoc) throw codeError('IMPORT_INVALID', 'Ugyldigt materialedokument')
    if (typeof text === 'string' && text.length > IMPORT_TEXT_MAX) throw codeError('IMPORT_TOO_LARGE', `Højst ${IMPORT_MAX} serienumre ad gangen`)
    const raw = Array.isArray(serials) ? serials.map(String) : parseSerialList(text)
    if (raw.length > IMPORT_MAX) throw codeError('IMPORT_TOO_LARGE', `Højst ${IMPORT_MAX} serienumre ad gangen`)
    await refresh(state, true)
    const { result, accepted } = checkSerials(state, raw)
    if (dryRun) return { dryRun: true, ...result, toImport: accepted.length }
    if (!accepted.length) throw codeError('IMPORT_EMPTY', 'Der er ingen nye serienumre at importere')
    const own = await repo.getOwnPlacements(state.team).catch(() => [])
    const event = await state.journal.append({ type: 'import', importId: newId(), place: cleanPlace, area: areaOfPlace(state, cleanPlace, own), serials: accepted, ...(matdoc ? { document: matdoc } : {}) })
    await refresh(state, true)
    return { dryRun: false, ...result, imported: accepted.length, eventId: event.id }
  }

  /** Serial numbers of a material document from SAP (ZMS_REP/ZMS_PREP), checked against the count before import. */
  async function lookupMatdoc(user, id, { document } = {}) {
    const { state } = await requireWriter(user, id)
    const fetched = await fetcher.fetchMatdoc({ team: state.team, document })
    await refresh(state, true)
    const serials = [...new Set(fetched.rows.map(row => row.serial))]
    const materials = new Map()
    for (const row of fetched.rows) {
      const entry = materials.get(row.material) || { material: row.material, description: row.description, count: 0 }
      entry.count += 1
      materials.set(row.material, entry)
    }
    const previous = activeEvents(state.events || []).filter(event => event.type === 'import' && event.document === fetched.document).pop()
    const checked = checkSerials(state, serials)
    return {
      document: fetched.document,
      transaction: fetched.transaction,
      serials,
      materials: [...materials.values()].sort((a, b) => b.count - a.count || a.material.localeCompare(b.material)),
      check: { dryRun: true, ...checked.result, toImport: checked.accepted.length },
      alreadyImported: previous ? { byName: previous.byName, at: previous.at, place: previous.place } : null,
    }
  }

  // ---------- Members and areas ----------
  async function requestJoin(user, id) {
    const state = await load(user, id)
    const rights = await access(user, state)
    if (rights.locked) throw lockedError()
    if (rights.member?.status === 'approved') return rights.member
    const value = { email: lower(user.email), name: user.fullName || user.email, role: 'participant', status: 'requested', requestedAt: now() }
    await repo.setMember(state.team, state.id, value.email, value)
    return value
  }

  async function decideMember(user, id, { email, approve } = {}) {
    const state = await load(user, id)
    const rights = await access(user, state)
    if (rights.locked) throw lockedError()
    if (!rights.isOwner) throw codeError('COUNT_OWNER_ONLY', 'Kun den ansvarlige kan godkende deltagere')
    const target = rights.members[lower(email)]
    if (!target || target.role === 'owner') throw codeError('MEMBER_NOT_FOUND')
    const value = { ...target, status: approve ? 'approved' : 'rejected', decidedBy: me(user), decidedAt: now() }
    await repo.setMember(state.team, state.id, target.email, value)
    return value
  }

  async function claimArea(user, id, { area } = {}) {
    const { state } = await requireWriter(user, id)
    const name = clean(area, 12).toUpperCase()
    if (!name) throw codeError('CLAIM_INVALID')
    const claims = await repo.getClaims(state.team, state.id)
    const existing = claims[name]
    if (existing && existing.email !== lower(user.email) && now() - existing.lastActivity < CLAIM_IDLE_MS) throw codeError('CLAIM_TAKEN', `${existing.name} tæller allerede område ${name}`)
    const value = { email: lower(user.email), name: user.fullName || user.email, at: now(), lastActivity: now() }
    await repo.setClaim(state.team, state.id, name, value)
    return { area: name, ...value }
  }

  async function releaseArea(user, id, { area } = {}) {
    const state = await load(user, id)
    const rights = await access(user, state)
    if (rights.locked) throw lockedError()
    const name = clean(area, 12).toUpperCase()
    const claim = (await repo.getClaims(state.team, state.id))[name]
    if (!claim) return { ok: true }
    if (claim.email !== lower(user.email) && !rights.isOwner) throw codeError('COUNT_OWNER_ONLY', 'Kun den ansvarlige kan frigive andres områder')
    await repo.deleteClaim(state.team, state.id, name)
    return { ok: true }
  }

  // ---------- Material locks: one counter per material, plus the helpers they allow ----------
  const isApprovedStatus = approval => ['approved', 'posted'].includes(approval?.status)
  const mayCount = (lock, email) => !lock || lock.email === email || Boolean(lock.helpers?.[email])
  const peopleOf = map => Object.entries(map || {}).map(([email, entry]) => ({ email, name: entry.name, at: entry.at }))
  const lockView = (material, lock) => ({ material, holder: { email: lock.email, name: lock.name }, at: lock.at, helpers: peopleOf(lock.helpers), requests: peopleOf(lock.requests) })
  const materialLocks = state => repo.getMaterialLocks(state.team, state.id).catch(() => ({}))

  function materialCode(state, material) {
    const code = String(material || '').trim().toUpperCase()
    if (!MATERIAL_PATTERN.test(code) || !state.index.materials.has(code)) throw codeError('MATERIAL_NOT_FOUND', 'Materialet er ikke i optællingen')
    return code
  }

  /** Takes the material for the user, or lets them in when they already hold it or were allowed. */
  async function takeMaterial(user, state, code) {
    const email = lower(user.email)
    // Read first: a write to M: takes seconds, and most choices change nothing (already yours, or someone else's).
    const [approvals, locks] = await Promise.all([repo.getApprovals(state.team, state.id).catch(() => ({})), materialLocks(state)])
    if (isApprovedStatus(approvals[code])) throw codeError('MATERIAL_APPROVED', `${code} er godkendt og tælles ikke længere`)
    const known = locks[code]
    if (known && mayCount(known, email)) return lockView(code, known)
    if (known) throw codeError('MATERIAL_LOCKED', `${known.name} tæller ${code} – anmod om at tælle med`)
    return repo.changeMaterialLocks(state.team, state.id, all => {
      const lock = all[code]
      if (lock && !mayCount(lock, email)) throw codeError('MATERIAL_LOCKED', `${lock.name} tæller ${code} – anmod om at tælle med`)
      if (!lock) all[code] = { email, name: user.fullName || user.email, at: now(), helpers: {}, requests: {} }
      return { all, result: lockView(code, all[code]) }
    })
  }

  async function lockMaterial(user, id, { material } = {}) {
    const { state } = await requireWriter(user, id)
    return takeMaterial(user, state, materialCode(state, material))
  }

  async function requestMaterial(user, id, { material } = {}) {
    const { state } = await requireWriter(user, id)
    const code = materialCode(state, material)
    const email = lower(user.email)
    const result = await repo.changeMaterialLocks(state.team, state.id, all => {
      const lock = all[code]
      if (!lock || mayCount(lock, email)) return { all, result: null }
      lock.requests = { ...(lock.requests || {}), [email]: { name: user.fullName || user.email, at: now() } }
      return { all, result: lockView(code, lock) }
    })
    return result || takeMaterial(user, state, code)
  }

  async function answerMaterialRequest(user, id, { material, email, allow } = {}) {
    const state = await load(user, id)
    const rights = await access(user, state)
    if (rights.locked) throw lockedError()
    const code = materialCode(state, material)
    const asker = lower(email)
    return repo.changeMaterialLocks(state.team, state.id, all => {
      const lock = all[code]
      if (!lock?.requests?.[asker]) throw codeError('REQUEST_NOT_FOUND', 'Anmodningen findes ikke (længere)')
      if (lock.email !== lower(user.email) && !rights.isOwner) throw codeError('COUNT_OWNER_ONLY', 'Kun den, der tæller materialet, eller den ansvarlige kan svare')
      const request = lock.requests[asker]
      delete lock.requests[asker]
      if (allow === true) lock.helpers = { ...(lock.helpers || {}), [asker]: { name: request.name, at: now() } }
      return { all, result: lockView(code, lock) }
    })
  }

  async function releaseMaterial(user, id, { material } = {}) {
    const state = await load(user, id)
    const rights = await access(user, state)
    if (rights.locked) throw lockedError()
    const code = String(material || '').trim().toUpperCase()
    const email = lower(user.email)
    await repo.changeMaterialLocks(state.team, state.id, all => {
      const lock = all[code]
      if (!lock) return { all, result: null }
      if (lock.helpers?.[email] && lock.email !== email) delete lock.helpers[email]
      else if (lock.email === email || rights.isOwner || rights.isManager) delete all[code]
      else throw codeError('COUNT_OWNER_ONLY', 'Kun den, der tæller materialet, eller den ansvarlige kan frigive det')
      return { all, result: null }
    })
    return { ok: true }
  }

  /** "Send til godkendelse": everything is found (or the difference is accepted); the manager is told, the lock is released. */
  async function submitMaterial(user, id, { material, comment = '', acceptDiff = false } = {}) {
    const { state, rights } = await requireWriter(user, id)
    const code = materialCode(state, material)
    const email = lower(user.email)
    const lock = (await materialLocks(state))[code]
    if (lock && !mayCount(lock, email) && !rights.isOwner) throw codeError('MATERIAL_LOCKED', `${lock.name} tæller ${code}`)
    const approvals = await repo.getApprovals(state.team, state.id).catch(() => ({}))
    if (isApprovedStatus(approvals[code])) throw codeError('MATERIAL_APPROVED', `${code} er allerede godkendt`)
    await requireSynced(state)
    await refresh(state, true)
    const rows = state.aggregate.rows.filter(row => row.material === code)
    const sum = key => rows.reduce((total, row) => total + (row[key] || 0), 0)
    const diff = sum('diff')
    if (diff !== 0 && acceptDiff !== true) throw codeError('SUBMIT_HAS_DIFF', `Der er en difference på ${diff > 0 ? '+' : ''}${diff} stk. på ${code}`)
    const value = { status: 'submitted', by: me(user), at: now(), sapQty: sum('sapQty'), counted: sum('counted'), diff, comment: clean(comment, 300) }
    await repo.setApproval(state.team, state.id, code, value)
    await repo.changeMaterialLocks(state.team, state.id, all => { delete all[code]; return { all, result: null } }).catch(() => {})
    return value
  }

  // ---------- Close, reopen, re-fetch ----------
  /** This PC's scans must be on M: before others rely on them (approval, closing). */
  async function requireSynced(state) {
    const synced = await state.journal.flush()
    if (!synced.ok) throw codeError('STORAGE_UNAVAILABLE', `${synced.pending} registreringer fra denne PC er ikke sendt til M: endnu – prøv igen om lidt`)
  }

  async function ownerAction(user, id) {
    const state = await load(user, id)
    const rights = await access(user, state)
    if (rights.locked) throw lockedError()
    if (!rights.isOwner) throw codeError('COUNT_OWNER_ONLY', 'Kun den ansvarlige kan gøre det')
    return state
  }

  /** Fetching SAP again for the count: the owner, a manager or an Optælling admin. */
  async function sapAction(user, id) {
    const state = await load(user, id)
    const rights = await access(user, state)
    if (rights.locked) throw lockedError()
    if (!canFetchDoc(user, rights)) throw codeError('COUNT_OWNER_ONLY', 'Kun den ansvarlige, en admin eller en manager kan hente data fra SAP igen')
    return state
  }

  async function closeCount(user, id) {
    const state = await ownerAction(user, id)
    await requireSynced(state)
    await refresh(state, true)
    const approvals = await repo.getApprovals(state.team, state.id).catch(() => ({}))
    const aggregate = applyApprovals(state.aggregate, approvals)
    await saveSummary(state, computeProgress({ snapshot: state.snapshot, aggregate, countLists: state.countLists, events: state.events || [], approvals, now: now() }), aggregate, true)
    state.meta = await repo.updateMeta(state.team, state.id, { status: 'closed', closedAt: now(), closedBy: me(user) })
    return state.meta
  }

  async function reopenCount(user, id) {
    const state = await ownerAction(user, id)
    state.meta = await repo.updateMeta(state.team, state.id, { status: 'open', reopenedAt: now(), reopenedBy: me(user) })
    return state.meta
  }

  async function previewRefetch(user, id) {
    const state = await sapAction(user, id)
    if (state.meta.status !== 'open') throw codeError('COUNT_CLOSED', 'Genåbn optællingen først')
    const fetched = await fetcher.fetchPlant({ onProgress: step => emit('sap:fetch-progress', { step }) })
    const snapshot = buildSnapshot({ team: state.team, scope: state.snapshot.scope, mb52: fetched.mb52, serials: fetched.serials, rulesByTeam: await rulesByTeam(state.team), exclusions: state.snapshot.excluded.manual, fetchedAt: fetched.fetchedAt, fetchedBy: lower(user.email) })
    const token = crypto.randomBytes(16).toString('hex')
    for (const [key, value] of pending) if (value.countId === state.id || now() - value.at > PENDING_TTL_MS) pending.delete(key)
    pending.set(token, { at: now(), email: lower(user.email), team: state.team, countId: state.id, snapshot })
    const approvals = await repo.getApprovals(state.team, state.id).catch(() => ({}))
    const diff = diffSnapshots(state.snapshot, snapshot)
    for (const change of diff.changes) if (['approved', 'posted'].includes(approvals[change.material]?.status)) change.frozen = true
    return { token, diff }
  }

  async function applyRefetch(user, id, { token } = {}) {
    const state = await sapAction(user, id)
    const entry = pending.get(token)
    if (!entry || entry.countId !== state.id || entry.email !== lower(user.email)) throw codeError('PREVIEW_EXPIRED', 'Hent data fra SAP igen')
    await repo.replaceSnapshot(state.team, state.id, entry.snapshot)
    state.meta = await repo.updateMeta(state.team, state.id, { fetchedAt: entry.snapshot.fetchedAt, snapshotVersion: (state.meta.snapshotVersion || 1) + 1 })
    pending.delete(token)
    state.snapshot = entry.snapshot
    state.index = indexSnapshot(entry.snapshot)
    state.countLists = buildCountLists({ snapshot: state.snapshot, index: state.index, placements: state.placements })
    state.aggregateKey = ''
    await refresh(state, true)
    return state.meta
  }

  // ---------- Approval (managers) ----------
  async function setApproval(user, id, { material, status, comment = '' } = {}) {
    const state = status === 'approved' ? await refresh(await load(user, id), true) : await load(user, id)
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan godkende')
    await assertStatusOpen(state.team, state.meta)
    const code = normalizeMaterial(material)
    if (!['approved', 'returned', 'posted', 'reset'].includes(status)) throw codeError('APPROVAL_INVALID')
    const approvals = await repo.getApprovals(state.team, state.id)
    const current = approvals[code]
    if (status === 'posted' && current?.status !== 'approved') throw codeError('APPROVAL_INVALID', 'Materialet skal godkendes før det markeres som bogført')
    if (status === 'returned' && !clean(comment, 300)) throw codeError('APPROVAL_INVALID', 'Skriv hvorfor materialet sendes tilbage')
    if (status === 'returned' || status === 'reset') {
      // The numbers on an SAP count document must not change underneath it: delete the document first.
      const docs = Object.values(await repo.getPiDocs(state.team, state.id).catch(() => ({})))
      const active = docs.find(doc => doc.status !== 'deleted' && doc.lines?.some(line => line.material === code))
      if (active) throw codeError('PIDOC_ACTIVE', active.status === 'posted' ? `${code} er bogført i SAP (${active.docNo})` : `${code} har SAP-dokument ${active.docNo || ''} – slet det først`)
    }
    const by = me(user)
    const value = status === 'reset' ? { status: 'open', by, at: now() }
      : status === 'posted' ? { ...current, status: 'posted', postedBy: by, postedAt: now() }
      : status === 'approved' ? { status, comment: clean(comment, 300), by, at: now(), frozen: freezeRows(state.aggregate.rows, code, state.aggregate.serials.missing) }
      : { status, comment: clean(comment, 300), by, at: now() }
    await repo.setApproval(state.team, state.id, code, value)
    if (status === 'approved') await repo.changeMaterialLocks(state.team, state.id, all => { delete all[code]; return { all, result: null } }).catch(() => {})
    return value
  }

  async function approveAllWithoutDifference(user, id) {
    const state = await refresh(await load(user, id), true)
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan godkende')
    await assertStatusOpen(state.team, state.meta)
    const approvals = await repo.getApprovals(state.team, state.id)
    const byMaterial = new Map()
    for (const row of state.aggregate.rows) {
      const entry = byMaterial.get(row.material) || { diff: false }
      if (row.diff !== 0) entry.diff = true
      byMaterial.set(row.material, entry)
    }
    let approved = 0
    for (const [material, entry] of byMaterial) {
      if (entry.diff || ['approved', 'posted'].includes(approvals[material]?.status)) continue
      await repo.setApproval(state.team, state.id, material, { status: 'approved', comment: 'Ingen difference', by: me(user), at: now(), frozen: freezeRows(state.aggregate.rows, material, state.aggregate.serials.missing) })
      approved += 1
    }
    return { approved }
  }

  // ---------- Storage rules (managers) and placements ----------
  async function getRules(user) {
    const team = teamOf(user)
    const stored = await repo.getRules(team)
    const rules = storageRulesFor(team, stored)
    let suggestions = null
    const latest = (await repo.listCounts(team))[0]
    if (latest) {
      const snapshot = await repo.getSnapshot(team, latest.id).catch(() => null)
      if (snapshot) {
        const rows = snapshot.stock.map(line => ({ material: snapshot.materials[line.m].material, sloc: line.sloc, unrestricted: line.unrestricted, blocked: line.blocked }))
        suggestions = { fromCount: latest.name, fetchedAt: snapshot.fetchedAt, bySloc: suggestRulesFromStock(rows, TEAMS[team].storageLocations) }
      }
    }
    return { team, kinds: KINDS, rules, stored, suggestions, canEdit: isManager(user) }
  }

  async function setRule(user, { sloc, kinds } = {}) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan ændre lagerregler')
    return repo.setRule(teamOf(user), String(sloc || '').toUpperCase(), { kinds, by: me(user) })
  }

  // ---------- Serial number rules (TCD): long serials for the SAP count document ----------
  async function serialRules(user) {
    const team = teamOf(user)
    if (team !== 'TCD') return { supported: false, canEdit: false, rules: [] }
    const stored = await repo.getSerialRules(team)
    const rules = Object.entries(stored).map(([material, rule]) => ({ material, ...rule })).sort((a, b) => a.material.localeCompare(b.material))
    return { supported: true, canEdit: isManager(user), rules }
  }

  async function setSerialRule(user, { material, unrestricted } = {}) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan ændre serienummerregler')
    return repo.setSerialRule(teamOf(user), material, { unrestricted: unrestricted === true, by: me(user) })
  }

  /**
   * The serials of one row (material, storage location, stock type) to copy or enter in SAP; long where the rule says so.
   * Without `forDoc` the serials found in the count; with `forDoc` the list for the count document of the day
   * (SAP's serials of the day minus the ones missing at approval).
   */
  async function copySerials(user, id, { material, sloc, stockType, forDoc = false } = {}) {
    const state = await refresh(await load(user, id))
    const code = normalizeMaterial(material)
    const type = stockType === 'blocked' ? 'blocked' : 'unrestricted'
    let short = []
    if (forDoc) {
      const { result } = await docOf(state)
      const row = result.rows.find(item => item.material === code && item.sloc === sloc && item.stockType === type)
      if (!row?.approved) throw codeError('APPROVAL_INVALID', `${code} er ikke godkendt`)
      if (!row.docSerials) throw codeError('DOC_NOT_FETCHED', 'Hent dagens SAP-tal først – serienumrene til dokumentet kommer derfra')
      short = [...row.docSerials]
    } else {
      for (const [serial, info] of state.index.serials) {
        if (info.inScope && info.material === code && info.sloc === sloc && info.stockType === type && state.found.has(serial)) short.push(serial)
      }
      short.sort()
    }
    const rule = state.team === 'TCD' ? (await repo.getSerialRules(state.team).catch(() => ({})))[code] : null
    if (!rule?.[type] || !short.length) return { serials: short, long: false, total: short.length, withoutLong: [], lookedUp: 0 }
    const cache = await repo.getLongSerials(state.team).catch(() => ({}))
    const longOf = new Map(short.filter(serial => cache[serial]?.long).map(serial => [serial, cache[serial].long]))
    const missing = short.filter(serial => !longOf.has(serial))
    if (missing.length) {
      const fetched = await fetcher.fetchLongSerials({ material: code, serials: missing })
      for (const row of fetched) longOf.set(row.serial, row.long)
      if (fetched.length) await repo.saveLongSerials(state.team, fetched.map(row => ({ short: row.serial, long: row.long, material: code }))).catch(error => console.error('CountPoint: long serial cache not saved', error.code || error.message))
    }
    return { serials: short.map(serial => longOf.get(serial) || serial), long: true, total: short.length, withoutLong: short.filter(serial => !longOf.has(serial)), lookedUp: missing.length }
  }

  async function savePlacement(user, { name, area, type } = {}) {
    return repo.saveOwnPlacement(teamOf(user), { name, area, type, createdBy: me(user) })
  }

  // ---------- Count document (read-only preparation; the document itself is created in SAP) ----------
  async function docOf(state) {
    const [approvals, doc] = await Promise.all([repo.getApprovals(state.team, state.id).catch(() => ({})), repo.getCountDoc(state.team, state.id).catch(() => null)])
    const missingOf = row => missingAtApproval({ approval: approvals[row.material], row, index: state.index, found: state.found })
    return { doc, result: buildCountDoc({ rows: applyApprovals(state.aggregate, approvals).rows, approvals, doc, missingOf }) }
  }

  async function countDoc(user, id) {
    const state = await refresh(await load(user, id))
    const rights = await access(user, state)
    const { doc, result } = await docOf(state)
    // The serial lists stay in the main process (copySerials / SAP entry); the screen only needs the numbers.
    const rows = result.rows.map(({ docSerials, ...row }) => row)
    return { fetchedAt: doc?.fetchedAt || null, fetchedBy: doc?.by || null, canFetch: canFetchDoc(user, rights) && !rights.locked, ...result, rows }
  }

  async function fetchDocStock(user, id) {
    const state = await load(user, id)
    const rights = await access(user, state)
    if (rights.locked) throw lockedError()
    if (!canFetchDoc(user, rights)) throw codeError('COUNT_OWNER_ONLY', 'Kun den ansvarlige, en admin eller en manager kan hente dagens SAP-tal')
    const fetched = await fetcher.fetchPlant({ onProgress: step => emit('sap:fetch-progress', { step }) })
    const snapshot = buildSnapshot({ team: state.team, scope: state.snapshot.scope, mb52: fetched.mb52, serials: fetched.serials || [], rulesByTeam: await rulesByTeam(state.team), exclusions: state.snapshot.excluded.manual, fetchedAt: fetched.fetchedAt, fetchedBy: lower(user.email) })
    await repo.setCountDoc(state.team, state.id, { fetchedAt: fetched.fetchedAt, by: me(user), withSerials: true, lines: docLinesFromSnapshot(snapshot) })
    return countDoc(user, id)
  }

  async function reportData(user, id) {
    const state = await refresh(await load(user, id), true)
    await state.journal.flush()
    const [members, approvals] = await Promise.all([repo.getMembers(state.team, state.id), repo.getApprovals(state.team, state.id)])
    const aggregate = applyApprovals(state.aggregate, approvals)
    return { meta: state.meta, snapshot: state.snapshot, aggregate, members, approvals, progress: computeProgress({ snapshot: state.snapshot, aggregate, countLists: state.countLists, events: state.events || [], approvals, now: now() }) }
  }

  async function flush(user, id) {
    const state = await load(user, id)
    const result = await state.journal.flush()
    await refresh(state, true)
    return result
  }

  function deletedError() {
    return codeError('COUNT_DELETED', 'Optællingen er slettet')
  }

  function forget(team, id) {
    for (const [key, state] of opened) {
      if (state.team === team && state.id === id) { stopScanWarm(state); state.journal.stop(); opened.delete(key) }
    }
    for (const [key, value] of pending) if (value.countId === id) pending.delete(key)
  }

  async function throwIfDeleted(state) {
    if (!(await repo.isDeleted(state.team, state.id).catch(() => false))) return
    forget(state.team, state.id)
    throw deletedError()
  }

  async function deleteCount(user, id) {
    const team = teamOf(user)
    if (await repo.isDeleted(team, id).catch(() => false)) return { ok: true }
    const meta = await repo.getMeta(team, id)
    if (lower(meta.owner.email) !== lower(user.email) && !isManager(user)) throw codeError('COUNT_OWNER_ONLY', 'Kun den ansvarlige eller en manager kan slette optællingen')
    await assertStatusOpen(team, meta)
    await removeCount(team, id, me(user))
    return { ok: true }
  }

  async function removeCount(team, id, by) {
    forget(team, id)
    await repo.deleteCount(team, id, by)
    if (localCache) await localCache.remove(team, id).catch(() => {})
    const names = await fs.promises.readdir(journalsDir).catch(() => [])
    for (const name of names.filter(item => item.startsWith(`${team}-${id}-`))) await fs.promises.rm(path.join(journalsDir, name), { force: true }).catch(() => {})
  }

  /** Deletes a status and every count in it, locked or not. Saved Excel reports stay in the reports folder. */
  async function deleteStatus(user, statusId) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan slette en status')
    const team = teamOf(user)
    await repo.getStatus(team, statusId)
    const counts = await statusCounts(team, statusId)
    for (const entry of counts) await removeCount(team, entry.id, me(user))
    await repo.deleteStatus(team, statusId)
    return { ok: true, counts: counts.length }
  }

  async function closeAll() {
    for (const state of opened.values()) {
      stopScanWarm(state)
      await state.journal.close().catch(() => {})
    }
    opened.clear()
  }

  /**
   * Wraps a change made through this client so the scan contexts it can affect are read again by the next scan
   * (also after a failure: a change may have been half done). `scope` 'count' = this count, 'team' = all of the team.
   */
  const changes = (fn, scope = 'count') => async (user, ...args) => {
    try {
      return await fn(user, ...args)
    } finally {
      dropScanContext(user?.team, scope === 'count' ? args[0] : null)
    }
  }

  return {
    listCounts, statusOverview, startStatus, statusChecklist, lockStatus: changes(lockStatus, 'team'), statusArchive, unlockStatus: changes(unlockStatus, 'team'), deleteStatus: changes(deleteStatus, 'team'), preview, createCount, openCount, getState, listSerials, materialSerials,
    scan, undo, removeSerial, saveLine: changes(saveLine), deleteLine, importSerials, lookupMatdoc,
    lockMaterial: changes(lockMaterial), requestMaterial: changes(requestMaterial), answerMaterialRequest: changes(answerMaterialRequest), releaseMaterial: changes(releaseMaterial), submitMaterial: changes(submitMaterial),
    requestJoin: changes(requestJoin), decideMember: changes(decideMember), claimArea: changes(claimArea), releaseArea: changes(releaseArea),
    closeCount: changes(closeCount), reopenCount: changes(reopenCount), deleteCount: changes(deleteCount), previewRefetch, applyRefetch,
    setApproval: changes(setApproval), approveAllWithoutDifference: changes(approveAllWithoutDifference),
    getRules, setRule, serialRules, setSerialRule, copySerials, countDoc, fetchDocStock, savePlacement: changes(savePlacement, 'team'), reportData, readCount, flush, closeAll,
  }
}

function diffSnapshots(before, after) {
  const lines = snapshot => {
    const result = new Map()
    for (const line of snapshot.stock) if (line.inScope) result.set(`${snapshot.materials[line.m].material}|${line.sloc}`, line)
    return result
  }
  const a = lines(before)
  const b = lines(after)
  const changes = []
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const [material, sloc] = key.split('|')
    const old = a.get(key) || { unrestricted: 0, blocked: 0 }
    const next = b.get(key) || { unrestricted: 0, blocked: 0 }
    if (old.unrestricted !== next.unrestricted || old.blocked !== next.blocked) changes.push({ material, sloc, before: { unrestricted: old.unrestricted, blocked: old.blocked }, after: { unrestricted: next.unrestricted, blocked: next.blocked } })
  }
  const serialSet = snapshot => new Set([...indexSnapshot(snapshot).serials].filter(([, info]) => info.inScope).map(([serial]) => serial))
  const sa = serialSet(before)
  const sb = serialSet(after)
  let added = 0
  let removed = 0
  for (const serial of sb) if (!sa.has(serial)) added += 1
  for (const serial of sa) if (!sb.has(serial)) removed += 1
  return { changes: changes.sort((x, y) => x.material.localeCompare(y.material) || x.sloc.localeCompare(y.sloc)), serials: { added, removed } }
}

module.exports = { createCountService, diffSnapshots, CLAIM_IDLE_MS }
