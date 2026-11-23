// A team's counts on the shared drive. Every team has its own folder, so TCD and TRR never see each other's data.
// Shared keys change field by field (setField/deleteField under the store's file lock), so clients never overwrite
// each other. Per-user scan journals live in journal.cjs.
const crypto = require('node:crypto')
const { TEAMS, isAllowedTeam } = require('./teams.cjs')
const { normalizeKinds, materialKind } = require('./core/classify.cjs')
const { MATERIAL_PATTERN } = require('./core/snapshot.cjs')
const { normalizeSerial } = require('./core/countState.cjs')

const INDEX_KEY = 'counts-index'
const STATUSES_KEY = 'statusser'
const OWN_PLACEMENTS_KEY = 'placeringer'
const RULES_KEY = 'lagerregler'
const SERIAL_RULES_KEY = 'serienummerregler'
const LONG_SERIALS_KEY = 'lange-serienumre'
const COUNT_ID = /^[a-z0-9]{6,32}$/
const NAME_MAX = 80
const PLACEMENT_NAME_MAX = 60

function codeError(code, message) {
  return Object.assign(new Error(message || code), { code })
}

const isCountId = value => typeof value === 'string' && COUNT_ID.test(value)
const collapse = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
const defaultId = () => `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`

function createCountRepository({ storeFor, now = Date.now, newId = defaultId }) {
  function store(team) {
    if (!isAllowedTeam(team)) throw codeError('TEAM_NOT_ALLOWED')
    return storeFor(team)
  }
  function key(id, part) {
    if (!isCountId(id)) throw codeError('COUNT_NOT_FOUND')
    return `count-${id}-${part}`
  }
  const indexEntry = meta => ({ id: meta.id, name: meta.name, scope: meta.scope, status: meta.status, owner: meta.owner, createdAt: meta.createdAt, fetchedAt: meta.fetchedAt, statusId: meta.statusId || null })

  async function createCount(team, { name, snapshot, placements = [], owner, statusId = null }) {
    const cleanName = collapse(name)
    if (!cleanName || cleanName.length > NAME_MAX) throw codeError('COUNT_INVALID', 'Giv optællingen et navn (højst 80 tegn)')
    const id = newId()
    const createdAt = now()
    const meta = { id, team, name: cleanName, scope: snapshot.scope, status: 'open', owner: { email: owner.email, name: owner.name }, createdAt, fetchedAt: snapshot.fetchedAt, snapshotVersion: 1, statusId }
    const target = store(team)
    // Each write to M: takes 15–90 s, so the count's own files are written at once; the index entry comes last,
    // so no other PC sees the count before its files are there.
    await Promise.all([
      target.setAsync(key(id, 'expected'), snapshot),
      target.setAsync(key(id, 'placements'), placements),
      target.updateAsync(key(id, 'members'), { op: 'setField', field: owner.email, value: { email: owner.email, name: owner.name, role: 'owner', status: 'approved', requestedAt: createdAt, decidedAt: createdAt } }),
      target.setAsync(key(id, 'meta'), meta),
    ])
    await target.updateAsync(INDEX_KEY, { op: 'setField', field: id, value: indexEntry(meta) })
    return meta
  }

  async function listCounts(team) {
    const index = (await store(team).getAsync(INDEX_KEY)) || {}
    return Object.values(index).filter(entry => entry && isCountId(entry.id) && !entry.deleted).sort((a, b) => b.createdAt - a.createdAt)
  }

  async function isDeleted(team, id) {
    const index = (await store(team).getAsync(INDEX_KEY)) || {}
    return Boolean(index[id]?.deleted)
  }

  /** The tombstone is written first, so other PCs stop using the count even if removing its files is interrupted. */
  async function deleteCount(team, id, by) {
    await deleteCounts(team, [id], by)
  }

  /** Several counts at once: one write of the index with all tombstones, then their files are removed in parallel. */
  async function deleteCounts(team, ids, by) {
    await markDeleted(team, ids, by)
    await removeCountFiles(team, ids)
  }

  async function markDeleted(team, ids, by) {
    if (!ids.length) return
    for (const id of ids) key(id, '')
    const at = now()
    const deletedBy = { email: by.email, name: by.name }
    await store(team).mutateAsync(INDEX_KEY, index => {
      const next = index && typeof index === 'object' ? index : {}
      for (const id of ids) next[id] = { id, deleted: true, deletedAt: at, deletedBy }
      return next
    })
  }

  async function removeCountFiles(team, ids) {
    if (!ids.length) return
    const target = store(team)
    const prefixes = ids.map(id => key(id, ''))
    const names = (await target.keysAsync()).filter(item => prefixes.some(prefix => item.startsWith(prefix)))
    await Promise.all(names.map(name => target.deleteAsync(name)))
  }

  async function getMeta(team, id) {
    const meta = await store(team).getAsync(key(id, 'meta'))
    if (!meta) throw codeError('COUNT_NOT_FOUND')
    return meta
  }

  /**
   * All changed fields in one locked write of the meta file, and the index entry in parallel with it. The entry only
   * takes the changed fields, merged under the index's lock: another PC changing other fields meanwhile is kept.
   * A `check` sees the stored meta under its lock: it throws to refuse (nothing is written) or returns more changes;
   * the index entry is then written after the meta.
   */
  async function updateMeta(team, id, changes, { check } = {}) {
    const fields = Object.entries(changes)
    if (fields.some(([field]) => ['id', 'team', 'owner', 'createdAt'].includes(field))) throw codeError('COUNT_INVALID')
    if (!fields.length) return undefined
    const target = store(team)
    const metaKey = key(id, 'meta')
    const current = await target.getAsync(metaKey, { skipCache: true })
    if (!current) throw codeError('COUNT_NOT_FOUND')
    const listed = Object.keys(indexEntry({})).filter(field => field in changes)
    const writeMeta = () => target.mutateAsync(metaKey, stored => {
      if (!stored) throw codeError('COUNT_NOT_FOUND')
      return { ...stored, ...changes, ...(check ? check(stored) : null) }
    })
    const writeIndex = () => (listed.length ? target.mutateAsync(INDEX_KEY, index => {
      const next = index && typeof index === 'object' ? index : {}
      const entry = next[id]
      if (entry?.deleted) return next
      const merged = entry ? { ...entry } : indexEntry(current)
      for (const field of listed) merged[field] = indexEntry(changes)[field]
      next[id] = merged
      return next
    }) : null)
    if (check) {
      const meta = await writeMeta()
      await writeIndex()
      return meta
    }
    const [meta] = await Promise.all([writeMeta(), writeIndex()])
    return meta
  }

  const getObject = (team, id, part) => store(team).getAsync(key(id, part)).then(value => value || {})
  const setField = (team, id, part, field, value) => store(team).updateAsync(key(id, part), { op: 'setField', field, value })
  const deleteField = (team, id, part, field) => store(team).updateAsync(key(id, part), { op: 'deleteField', field })

  async function replaceSnapshot(team, id, snapshot) {
    const target = store(team)
    const current = await target.getAsync(key(id, 'expected'), { skipCache: true })
    // Two different files: the backup of the old snapshot and the new one are written at the same time.
    await Promise.all([
      current ? target.setAsync(key(id, 'expected-prev'), current) : null,
      target.setAsync(key(id, 'expected'), snapshot),
    ])
  }

  async function saveOwnPlacement(team, { name, area = '', type = '', createdBy }) {
    const cleanName = collapse(name)
    if (!cleanName || cleanName.length > PLACEMENT_NAME_MAX) throw codeError('PLACEMENT_INVALID', 'Skriv et navn til placeringen (højst 60 tegn)')
    const field = cleanName.toLowerCase()
    const target = store(team)
    const existing = ((await target.getAsync(OWN_PLACEMENTS_KEY, { skipCache: true })) || {})[field]
    const value = {
      name: existing?.name || cleanName,
      area: collapse(area).toUpperCase().slice(0, 12),
      type: collapse(type).slice(0, 20),
      createdBy: existing?.createdBy || { email: createdBy.email, name: createdBy.name },
      createdAt: existing?.createdAt || now(),
      active: true,
    }
    await target.updateAsync(OWN_PLACEMENTS_KEY, { op: 'setField', field, value })
    return value
  }

  async function getOwnPlacements(team) {
    const all = (await store(team).getAsync(OWN_PLACEMENTS_KEY)) || {}
    return Object.values(all).filter(entry => entry?.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'da'))
  }

  /** compare-and-set on the whole status list, so two managers can never both open a status. */
  async function changeStatuses(team, change) {
    return changeKey(team, STATUSES_KEY, change)
  }

  /**
   * Read-change-write under the key's file lock (the same lock 1.6.6 uses for compareAndSet), so nobody can write in
   * between: no extra read before the write and no retried 20-s write after a conflict. A throwing `change` writes nothing.
   */
  async function changeKey(team, storeKey, change) {
    let result
    await store(team).mutateAsync(storeKey, current => {
      const outcome = change(current && typeof current === 'object' ? current : {})
      result = outcome.result
      return outcome.all
    })
    return result
  }

  async function listStatuses(team) {
    const all = (await store(team).getAsync(STATUSES_KEY)) || {}
    return Object.values(all).filter(item => item && isCountId(item.id)).sort((a, b) => b.startedAt - a.startedAt)
  }

  async function getStatus(team, id) {
    if (!isCountId(id)) throw codeError('STATUS_NOT_FOUND')
    const status = ((await store(team).getAsync(STATUSES_KEY)) || {})[id]
    if (!status) throw codeError('STATUS_NOT_FOUND')
    return status
  }

  async function getActiveStatus(team) {
    return (await listStatuses(team)).find(item => item.state === 'open') || null
  }

  function startStatus(team, { name, year, quarter, by }) {
    const cleanName = collapse(name)
    if (!cleanName || cleanName.length > NAME_MAX || !Number.isInteger(year) || year < 2000 || year > 2100 || ![1, 2, 3, 4].includes(quarter)) throw codeError('STATUS_INVALID', 'Ugyldigt navn, år eller kvartal')
    const person = { email: by.email, name: by.name }
    return changeStatuses(team, all => {
      if (Object.values(all).some(item => item?.state === 'open')) throw codeError('STATUS_ALREADY_OPEN', 'Der er allerede en igangværende status')
      const at = now()
      const status = { id: newId(), team, name: cleanName, year, quarter, state: 'open', startedBy: person, startedAt: at, history: [{ at, by: person, action: 'started' }], reports: [] }
      all[status.id] = status
      return { all, result: status }
    })
  }

  function deleteStatus(team, id) {
    if (!isCountId(id)) return Promise.reject(codeError('STATUS_NOT_FOUND'))
    return changeStatuses(team, all => {
      if (!all[id]) throw codeError('STATUS_NOT_FOUND', 'Statussen findes ikke')
      delete all[id]
      return { all, result: true }
    })
  }

  /** `expectState` and `soleOpen` are checked inside the compare-and-set, so two managers cannot both lock or open. */
  function updateStatus(team, id, changes, entry, { expectState = null, soleOpen = false } = {}) {
    if (!isCountId(id)) return Promise.reject(codeError('STATUS_NOT_FOUND'))
    return changeStatuses(team, all => {
      const current = all[id]
      if (!current) throw codeError('STATUS_NOT_FOUND')
      if (expectState && current.state !== expectState) throw codeError(current.state === 'locked' ? 'STATUS_LOCKED' : 'STATUS_NOT_LOCKED', current.state === 'locked' ? 'Statussen er allerede låst' : 'Statussen er ikke låst')
      const otherOpen = soleOpen && Object.values(all).find(item => item && item.id !== id && item.state === 'open')
      if (otherOpen) throw codeError('STATUS_ALREADY_OPEN', `"${otherOpen.name}" er i gang – den skal låses, før en tidligere status kan låses op`)
      const { id: _id, team: _team, startedAt: _startedAt, history: _history, ...allowed } = changes
      const next = { ...current, ...allowed, history: [...(current.history || []), { ...entry, at: now(), by: { email: entry.by.email, name: entry.by.name } }] }
      all[id] = next
      return { all, result: next }
    })
  }

  async function setRule(team, sloc, { kinds, by }) {
    const normalized = normalizeKinds(kinds)
    if (!TEAMS[team]?.storageLocations.includes(sloc) || !normalized) throw codeError('RULE_INVALID')
    return store(team).updateAsync(RULES_KEY, { op: 'setField', field: sloc, value: { kinds: normalized, updatedBy: { email: by.email, name: by.name }, updatedAt: now() } })
  }

  /** Which new terminals need the long serial number (SAP ZMS_LONG_SERNO) in the count document. TCD only. */
  async function setSerialRule(team, material, { unrestricted, by }) {
    if (team !== 'TCD') throw codeError('SERIAL_RULES_TCD_ONLY', 'Serienummerregler bruges kun af TCD')
    const code = String(material || '').trim().toUpperCase()
    if (!MATERIAL_PATTERN.test(code) || materialKind(code) !== 'new') throw codeError('RULE_INVALID', 'Kun nye terminaler (INT…, ikke -R)')
    const target = store(team)
    if (!unrestricted) {
      await target.updateAsync(SERIAL_RULES_KEY, { op: 'deleteField', field: code })
      return null
    }
    // Blocked stock is only counted in D000 and always uses the short serials.
    const value = { unrestricted: true, blocked: false, updatedBy: { email: by.email, name: by.name }, updatedAt: now() }
    await target.updateAsync(SERIAL_RULES_KEY, { op: 'setField', field: code, value })
    return { material: code, ...value }
  }

  function saveLongSerials(team, entries) {
    const at = now()
    return changeKey(team, LONG_SERIALS_KEY, all => {
      let saved = 0
      for (const entry of entries) {
        const short = normalizeSerial(entry?.short)
        const long = normalizeSerial(entry?.long)
        if (!short || !long || short !== String(entry.short) || long !== String(entry.long)) continue
        all[short] = { long, material: String(entry.material || '').slice(0, 40), at }
        saved += 1
      }
      return { all, result: saved }
    })
  }

  return {
    createCount,
    listCounts,
    listStatuses,
    getStatus,
    getActiveStatus,
    startStatus,
    updateStatus,
    deleteStatus,
    isDeleted,
    deleteCount,
    deleteCounts,
    markDeleted,
    removeCountFiles,
    getMeta,
    updateMeta,
    /** `fresh`: past the read cache (another PC may just have fetched SAP again). */
    getSnapshot: (team, id, { fresh = false } = {}) => store(team).getAsync(key(id, 'expected'), fresh ? { skipCache: true } : undefined),
    getPreviousSnapshot: (team, id) => store(team).getAsync(key(id, 'expected-prev')),
    replaceSnapshot,
    getPlacements: (team, id) => store(team).getAsync(key(id, 'placements')).then(value => value || []),
    getMembers: (team, id) => getObject(team, id, 'members'),
    setMember: (team, id, email, value) => setField(team, id, 'members', email, value),
    getClaims: (team, id) => getObject(team, id, 'claims'),
    setClaim: (team, id, area, value) => setField(team, id, 'claims', area, value),
    deleteClaim: (team, id, area) => deleteField(team, id, 'claims', area),
    getApprovals: (team, id) => getObject(team, id, 'approvals'),
    setApproval: (team, id, material, value) => setField(team, id, 'approvals', material, value),
    /** Several approvals in one locked write (same file and format as setApproval): `change(all)` returns { all, result }. */
    changeApprovals: (team, id, change) => changeKey(team, key(id, 'approvals'), change),
    getMaterialLocks: (team, id) => getObject(team, id, 'materiallaase'),
    /** compare-and-set on all locks of a count: `change(all)` returns { all, result }. */
    changeMaterialLocks: (team, id, change) => changeKey(team, key(id, 'materiallaase'), change),
    getPiDocs: (team, id) => getObject(team, id, 'sap-dokumenter'),
    /** compare-and-set on all SAP documents of a count (keyed by CountPoint id): `change(all)` returns { all, result }. */
    changePiDocs: (team, id, change) => changeKey(team, key(id, 'sap-dokumenter'), change),
    getSummary: (team, id) => store(team).getAsync(key(id, 'summary')),
    setSummary: (team, id, value) => store(team).setAsync(key(id, 'summary'), value),
    getCountDoc: (team, id) => store(team).getAsync(key(id, 'doc')).then(value => value || null),
    setCountDoc: (team, id, value) => store(team).setAsync(key(id, 'doc'), value),
    saveOwnPlacement,
    getOwnPlacements,
    getRules: team => store(team).getAsync(RULES_KEY).then(value => value || {}),
    setRule,
    getSerialRules: team => store(team).getAsync(SERIAL_RULES_KEY).then(value => value || {}),
    setSerialRule,
    getLongSerials: team => store(team).getAsync(LONG_SERIALS_KEY).then(value => value || {}),
    saveLongSerials,
  }
}

module.exports = { createCountRepository, isCountId }
