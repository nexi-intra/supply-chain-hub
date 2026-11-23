// SAP physical inventory documents of a count: create (MI31) and print (MI21) through the SAP writer, with the rules of
// core/piDocs.cjs. While SAP waits for the user's F8 the materials are reserved ('creating') so nobody creates them twice.
// What a script did is written to this PC's journal (piDocJournal.cjs) before M:, and merged into M: on the next look
// at the documents when the drive failed. A step SAP may have taken without the app knowing marks the document unknown
// (`sapUnknown`) until a manager resolves it.
const crypto = require('node:crypto')
const { planDocument, refusal, statusOf, NEXT, RESERVATION_MS } = require('./core/piDocs.cjs')
const { approvedWithLinesText, confirmedAll } = require('./core/countDoc.cjs')
const { createPiDocJournal } = require('./piDocJournal.cjs')

function codeError(code, message) {
  const error = new Error(`${code}: ${message}`)
  error.code = code
  return error
}

const UNKNOWN_TEXT = 'Optælling ved ikke, om SAP har gemt. Tjek dokumentet i SAP (MI03).'
const saveFailed = what => codeError('PIDOC_SAVE_FAILED', `SAP har gemt ${what}, men det kunne ikke gemmes på M:. Det er gemt på denne PC og kommer med, næste gang SAP-dokumenterne vises på denne PC.`)
const changed = () => codeError('PIDOC_CHANGED', 'Dokumentet er ændret i mellemtiden')
const DOC_NO = /^\d{9,10}$/
const RESOLUTIONS = new Set(['saved', 'missing'])
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
/** The status each step of a PI document leads to. */
const LEADS_TO = Object.freeze({ create: 'created', count: 'counted', post: 'posted' })

/**
 * Applies what a step did to the stored documents. Used for the write right after SAP and again when this PC's journal is
 * merged later, so both give the same result; a document whose state has moved on since is left as it is.
 * - created: the documents MI31 made replace the reservation.
 * - unknown-create: the reservation becomes a kept entry SAP may have created (when it is still the reservation).
 * - unknown: the step on an existing document may have happened (when it still has the status it had).
 * - step: fields of a step on one document, `from` the stored statuses it may have (null: any); `entered` adds materials
 *   entered. A step that moves the status to the one an unknown mark's step leads to settles the mark; any other status
 *   move leaves the mark (no longer in force) and logs it as superseded. Both are logged in `sapResolutions`.
 */
function applyChanges(all, changes) {
  for (const change of changes) {
    const current = all[change.docId]
    if (change.kind === 'created') {
      for (const doc of change.docs) if (!all[doc.id]) all[doc.id] = doc
      if (all[change.reference]?.status === 'creating') delete all[change.reference]
    } else if (change.kind === 'unknown-create') {
      if (!current || current.status === 'creating') all[change.docId] = change.doc
    } else if (change.kind === 'unknown') {
      if (current && current.status === change.sapUnknown.status) all[change.docId] = { ...current, sapUnknown: change.sapUnknown }
    } else if (change.kind === 'step') {
      // The stored status decides, not the unknown mark: SAP's real answer replaces a mark made since (another try, another PC).
      if (!current || (change.from && !change.from.includes(current.status))) continue
      const marked = Boolean(change.set?.status) && current.sapUnknown && current.sapUnknown.status === current.status
      // Only the status the unknown step leads to says SAP did it; another step (a delete) supersedes the mark, which stays.
      const settles = marked && LEADS_TO[current.sapUnknown.step] === change.set.status
      const { sapUnknown, ...rest } = current
      const log = marked ? {
        ...sapUnknown, outcome: settles ? 'saved' : 'superseded', ...(settles ? {} : { status: change.set.status }), docNo: current.docNo || null,
        reason: 'løst af journalen', resolvedBy: change.by || sapUnknown.by || null,
      } : null
      all[change.docId] = {
        ...(settles ? rest : current),
        ...change.set,
        ...(change.entered ? { entered: { ...(current.entered || {}), ...change.entered } } : {}),
        ...(log ? { sapResolutions: [...(current.sapResolutions || []), log] } : {}),
      }
    }
  }
  return all
}

const lower = value => String(value || '').trim().toLowerCase()
const by = (user, at) => ({ email: lower(user.email), name: user.fullName || user.email, at })
const defaultReference = () => `CP${crypto.randomBytes(6).toString('hex').toUpperCase()}`
const pad = value => String(value).padStart(2, '0')
// Same as formatDateTime in the count screens (src/lib/warehouse/format.ts).
const dateTime = ms => { const date = new Date(ms); return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}` }

/**
 * The quantities entered come from the SAP figures of the day; old ones would post SAP's movements since then as a
 * difference. They must be from today (local date) and not older than the ones the document was made from
 * (`docFetchedAt`; documents of older clients do not have it).
 */
function staleFigures({ fetchedAt, docFetchedAt, at }) {
  if (!fetchedAt) return 'Hent dagens SAP-tal, før antallet lægges på.'
  const fromToday = new Date(fetchedAt).toDateString() === new Date(at).toDateString()
  const olderThanDoc = typeof docFetchedAt === 'number' && fetchedAt < docFetchedAt
  return fromToday && !olderThanDoc ? null : `Hent dagens SAP-tal igen, før antallet lægges på. Tallene er fra ${dateTime(fetchedAt)}.`
}

function createPiDocService({ counts, repo, roles, writer, system, writeEnabled = true, now = Date.now, newReference = defaultReference, journalDir = null }) {
  const journal = createPiDocJournal(journalDir)
  /** Documents that count: everything except stale reservations of a crashed app. */
  const live = (all, at) => Object.values(all || {}).filter(doc => doc.status !== 'creating' || at - doc.startedAt < RESERVATION_MS)

  /**
   * Writes `changes` to this PC's journal first, then to M: (after `check`, which may refuse with PIDOC_CHANGED: then
   * nothing is kept). False when M: failed: the journal keeps the changes for the next look at the documents.
   */
  async function persist(user, id, changes, check = () => {}) {
    const name = journal.nameFor('pidoc')
    journal.hold(name)
    await journal.put(name, { team: user.team, countId: id, changes })
    try {
      await repo.changePiDocs(user.team, id, all => {
        check(all)
        return { all: applyChanges(all, changes) }
      })
    } catch (error) {
      journal.release(name)
      if (error?.code === 'PIDOC_CHANGED') {
        await journal.remove(name)
        throw error
      }
      console.error('CountPoint: PI document kept on this PC until M: answers', id, error?.code || error?.message)
      return false
    }
    await journal.remove(name)
    return true
  }

  /**
   * Merges what this PC's journal holds into M:, one write per count: for `id` only, or (`id` null) for every count of
   * the user's team. A deleted count's entries are kept; a count M: refuses does not hold up the others.
   */
  async function mergeJournal(user, id = null) {
    const entries = (await journal.list()).filter(({ entry }) => entry?.team === user.team && typeof entry.countId === 'string' && (id === null || entry.countId === id) && Array.isArray(entry.changes))
    if (!entries.length) return
    const byCount = new Map()
    for (const item of entries) byCount.set(item.entry.countId, [...(byCount.get(item.entry.countId) || []), item])
    let failure = null
    for (const [countId, items] of byCount) {
      try {
        if (repo.isDeleted && await repo.isDeleted(user.team, countId)) continue
        await repo.changePiDocs(user.team, countId, all => {
          for (const { entry } of items) applyChanges(all, entry.changes)
          return { all }
        })
        for (const { name } of items) await journal.remove(name)
      } catch (error) {
        failure = failure || error
      }
    }
    if (failure) throw failure
  }

  /** The documents SAP may have changed in `step` without the app knowing: kept as unknown, never lost to M: failing. */
  async function markUnknown(user, id, docs, step, status, error) {
    const at = now()
    const sapUnknown = { step, status, by: by(user, at), detail: clean(error?.detail || error?.code || 'unknown', 200) }
    await persist(user, id, docs.map(doc => ({ kind: 'unknown', docId: doc.id, sapUnknown }))).catch(() => false)
  }

  async function context(user, id) {
    await mergeJournal(user, id).catch(error => console.error('CountPoint: PI document journal not merged yet', id, error?.code || error?.message))
    const [doc, all, role] = await Promise.all([counts.countDoc(user, id), repo.getPiDocs(user.team, id), roles.roleOf(user)])
    return { rows: doc.rows, fetchedAt: doc.fetchedAt || null, confirmedMissing: doc.confirmedMissing || null, docs: live(all, now()), role }
  }

  function view(user, role, doc) {
    const status = statusOf(doc)
    const action = NEXT[status] || null
    return {
      ...doc,
      status,
      next: action,
      canNext: writeEnabled && action ? refusal({ action, role, email: user.email, doc }) === null : false,
      canDelete: writeEnabled && refusal({ action: 'delete', role, email: user.email, doc }) === null,
      canResolve: refusal({ action: 'resolve', role, doc }) === null,
    }
  }

  async function list(user, id) {
    // Every count of the team, not only this one: a journalled result must not wait for its own count to be opened.
    await mergeJournal(user).catch(error => console.error('CountPoint: PI document journal not merged yet', error?.code || error?.message))
    const { docs, role } = await context(user, id)
    return {
      system,
      writeEnabled,
      role,
      canCreate: writeEnabled && refusal({ action: 'create', role }) === null,
      docs: docs.sort((a, b) => (b.createdBy?.at || b.startedAt || 0) - (a.createdBy?.at || a.startedAt || 0)).map(doc => view(user, role, doc)),
    }
  }

  async function create(user, id, { materials, sloc, stockType } = {}) {
    const { rows, fetchedAt, docs, role } = await context(user, id)
    const reason = refusal({ action: 'create', role })
    if (reason) throw codeError('PIDOC_FORBIDDEN', reason)
    const plan = planDocument({ rows, docs, materials, sloc, stockType })
    const reference = newReference()
    const startedAt = now()
    await repo.changePiDocs(user.team, id, all => {
      planDocument({ rows, docs: live(all, startedAt), materials, sloc, stockType })
      return { all: { ...all, [reference]: { id: reference, reference, status: 'creating', startedAt, sloc: plan.sloc, stockType: plan.stockType, kind: plan.kind, lines: plan.lines, createdBy: by(user, startedAt) } } }
    })
    // Takes the reservation back; nothing is written when it is gone already (a deleted count's files may be removed).
    const takeBack = () => repo.changePiDocs(user.team, id, all => {
      if (!all[reference]) return { all: undefined }
      delete all[reference]
      return { all }
    }).catch(() => {})
    // Deleted meanwhile: a document made now could not be found from the app. Read past the read cache. A delete re-reads
    // the documents after its tombstone (removeCounts' recheck), so either it sees this reservation and stops, or this sees
    // its tombstone (both may refuse). The reservation is taken back, also when the index cannot be read: SAP is not asked.
    let deleted = false
    try {
      deleted = repo.isDeleted ? await repo.isDeleted(user.team, id, { fresh: true }) : false
    } catch (error) {
      await takeBack()
      throw error
    }
    if (deleted) {
      await takeBack()
      throw codeError('COUNT_DELETED', 'Optællingen er slettet')
    }
    /**
     * After the user's F8 SAP may have created documents with the reference: the reservation becomes a kept entry that
     * holds its materials until a manager resolves it. Stored 'created' without a document number, so 1.6.7 shows it.
     */
    const keepUnknown = async error => {
      const at = now()
      const doc = {
        id: reference, reference, status: 'created', year: String(new Date(at).getFullYear()), system, sloc: plan.sloc, stockType: plan.stockType, kind: plan.kind, transaction: plan.transaction,
        lines: plan.lines, createdBy: by(user, startedAt), startedAt, docFetchedAt: fetchedAt,
        sapUnknown: { step: 'create', status: 'created', by: by(user, at), detail: clean(error?.detail || error?.code || 'unknown', 200) },
      }
      await persist(user, id, [{ kind: 'unknown-create', docId: reference, doc }]).catch(() => false)
    }
    let result
    try {
      result = await writer.createDocument({ sloc: plan.sloc, stockType: plan.stockType, reference, materials: plan.lines.map(line => line.material) })
    } catch (error) {
      if (error?.code !== 'PIDOC_UNKNOWN') {
        await takeBack()
        throw error
      }
      await keepUnknown(error)
      throw error
    }
    // MI31 said Created, but MI22 lists nothing under the reference: what SAP made cannot be found from here.
    if (!result.docs.length) {
      const error = Object.assign(codeError('PIDOC_UNKNOWN', UNKNOWN_TEXT), { detail: `created-but-not-listed: ${result.missing.join(', ')}` })
      console.error('CountPoint: PI document state unknown', 'pidoc-create', error.detail)
      await keepUnknown(error)
      throw error
    }
    const at = now()
    const year = String(new Date(at).getFullYear())
    const made = result.docs.map(created => ({
      id: created.docNo, docNo: created.docNo, year, system, reference, status: 'created', sloc: plan.sloc, stockType: plan.stockType, kind: plan.kind, transaction: plan.transaction,
      lines: plan.lines.filter(line => created.materials.includes(line.material)), createdBy: by(user, at), docFetchedAt: fetchedAt,
    }))
    if (!(await persist(user, id, [{ kind: 'created', reference, docs: made }]))) throw saveFailed(`dokument ${made.map(doc => doc.docNo).join(', ')}`)
    return { ...(await list(user, id)), created: result.docs.map(doc => doc.docNo), missing: result.missing }
  }

  async function print(user, id, docId) {
    const { docs, role } = await context(user, id)
    const doc = docs.find(item => item.id === docId)
    const reason = refusal({ action: 'print', role, email: user.email, doc })
    if (reason) throw codeError('PIDOC_FORBIDDEN', reason)
    const result = await writer.printDocument({ docNo: doc.docNo, year: doc.year, sloc: doc.sloc })
    const at = now()
    const change = { kind: 'step', docId, from: ['created'], by: by(user, at), set: { status: 'printed', printedBy: { ...by(user, at), message: result.message } } }
    if (!(await persist(user, id, [change], all => { if (statusOf(all[docId]) !== 'created') throw changed() }))) throw saveFailed(`udskriften af ${doc.docNo}`)
    return list(user, id)
  }

  /**
   * The admin step: the serial list of the day (SAP's serials minus the ones missing at approval) goes through
   * ZMS_COUNT_SERIAL one material at a time, quantities through MI04
   * ("Antal til dokument"). Every material entered is remembered, so a later failure can be retried without repeating it.
   * The quantities are worked out again from the SAP figures of the day on every call, so these must be fresh (staleFigures).
   * An empty serial list is a Zero Count in MI04, which posts the whole book stock as a loss: unless SAP has none today
   * either, the material must be on `confirmZero` (the list the user was shown), else PIDOC_ZERO_CONFIRM. Checked
   * before anything goes into SAP.
   * A quantity line (MI04) of an approved material that SAP had stock of at approval, but that has no line in the stored
   * day figures, is entered only when it is on `confirmMissing` (as "Hent dagens SAP-tal" asks, DOC_STOCK_MISSING): the
   * figures may be an empty export saved by an older client, else PIDOC_MISSING_CONFIRM. Materials confirmed at "Hent
   * dagens SAP-tal" for these very figures (`confirmedMissing` with the same fetchedAt) are not asked about again.
   */
  async function count(user, id, docId, { confirmZero = [], confirmMissing = [] } = {}) {
    const { rows, fetchedAt, confirmedMissing, docs, role } = await context(user, id)
    const doc = docs.find(item => item.id === docId)
    const reason = refusal({ action: 'count', role, email: user.email, doc })
    if (reason) throw codeError('PIDOC_FORBIDDEN', reason)
    const stale = staleFigures({ fetchedAt, docFetchedAt: doc.docFetchedAt, at: now() })
    if (stale) throw codeError('PIDOC_DOC_STALE', stale)
    const done = { ...(doc.entered || {}) }
    const isPrinted = all => { if (statusOf(all[docId]) !== 'printed') throw changed() }
    const remember = async (material, value) => {
      done[material] = { ...value, by: lower(user.email), at: now() }
      if (!(await persist(user, id, [{ kind: 'step', docId, from: ['printed'], entered: { [material]: done[material] } }], isPrinted))) throw saveFailed(`serienumrene for ${material} på ${doc.docNo}`)
    }
    // SAP may have saved what it was given: the document waits for a manager instead of being entered again.
    const inSap = async step => {
      try {
        return await step()
      } catch (error) {
        if (error?.code === 'PIDOC_UNKNOWN') await markUnknown(user, id, [doc], 'count', 'printed', error)
        throw error
      }
    }
    const quantities = []
    const pending = doc.lines.filter(item => !done[item.material])
    // Checked for every material before anything goes into SAP, so a document is never half entered for this reason.
    const flagged = pending.find(line => rows.some(item => item.material === line.material && item.sloc === doc.sloc && item.stockType === doc.stockType && item.serialLinesAtApproval))
    if (flagged) throw codeError('APPROVED_WITH_SERIAL_LINES', approvedWithLinesText(flagged.material))
    const rowOf = material => rows.find(item => item.material === material && item.sloc === doc.sloc && item.stockType === doc.stockType)
    // "<material> <sloc>[ blocked]", as DOC_STOCK_MISSING lists them.
    const confirmedAtFetch = new Set(confirmedMissing && confirmedMissing.fetchedAt === fetchedAt && Array.isArray(confirmedMissing.materials) ? confirmedMissing.materials : [])
    const missing = pending.filter(line => line.transaction !== 'ZMS_COUNT_SERIAL').map(line => rowOf(line.material))
      .filter(row => row?.status === 'approved' && row.sapAtApproval > 0 && row.sapToday === 0)
      .map(row => `${row.material} ${row.sloc}${row.stockType === 'blocked' ? ' blocked' : ''}`)
      .filter(key => !confirmedAtFetch.has(key))
    if (!confirmedAll(missing, confirmMissing)) throw codeError('PIDOC_MISSING_CONFIRM', `Dagens SAP-tal har ingen linje for godkendte materialer, som SAP havde på lager ved godkendelsen. Det sker, hvis eksporten fra SAP fejlede. Hent dagens SAP-tal igen, eller bekræft antallet. Gælder: ${missing.join(', ')}`)
    const serialLists = new Map()
    for (const line of pending) {
      if (line.transaction !== 'ZMS_COUNT_SERIAL') continue
      const { serials } = await counts.copySerials(user, id, { material: line.material, sloc: doc.sloc, stockType: doc.stockType, forDoc: true })
      serialLists.set(line.material, serials)
    }
    const zero = [...serialLists].filter(([material, serials]) => !serials.length && rowOf(material)?.sapToday !== 0).map(([material]) => material)
    if (!confirmedAll(zero, confirmZero)) throw codeError('PIDOC_ZERO_CONFIRM', `Serienummerlisten er tom, men SAP har lager i dag. Antallet bliver 0, og hele lageret bogføres som tab. Gælder: ${zero.join(', ')}`)
    for (const line of pending) {
      if (line.transaction === 'ZMS_COUNT_SERIAL') {
        const serials = serialLists.get(line.material)
        if (!serials.length) { quantities.push({ material: line.material, qty: 0 }); continue }
        const result = await inSap(() => writer.enterSerials({ docNo: doc.docNo, year: doc.year, material: line.material, serials }))
        // SAP's own count must be the list sent; anything else would go on to MI20 unnoticed.
        if (result.counted !== serials.length) throw codeError('PIDOC_NOT_COUNTED', `SAP har talt ${result.counted} på ${line.material}, men der blev sendt ${serials.length} serienumre. Tjek dokumentet i SAP (MI03)`)
        await remember(line.material, { serials: result.serials, qty: result.counted })
      } else {
        const row = rowOf(line.material)
        if (!row || row.docQty === null) throw codeError('PIDOC_NO_QTY', `Hent dagens SAP-tal, før antallet for ${line.material} lægges på`)
        if (row.docQty < 0) throw codeError('PIDOC_NO_QTY', `Antallet for ${line.material} er negativt (${row.docQty}) – tjek materialet`)
        quantities.push({ material: line.material, qty: row.docQty })
      }
    }
    if (quantities.length) {
      await inSap(() => writer.enterCounts({ docNo: doc.docNo, year: doc.year, entries: quantities }))
      // One write for every quantity entered (was one 20-s write per material).
      const enteredAt = now()
      for (const entry of quantities) done[entry.material] = { qty: entry.qty, by: lower(user.email), at: enteredAt }
    }
    const at = now()
    const change = { kind: 'step', docId, from: ['printed'], by: by(user, at), set: { status: 'counted', countedBy: by(user, at) }, entered: done }
    if (!(await persist(user, id, [change], isPrinted))) throw saveFailed(`antallet på ${doc.docNo}`)
    return list(user, id)
  }

  /**
   * MI20 for one or more counted documents. MI22 decides which ones were really posted; those get the differences from the
   * MI20 list and the material document, and their materials are marked "Bogført i SAP" in CountPoint.
   * A document holding a material approved with quantity lines is refused (PIDOC_SERIAL_LINES) unless it is on
   * `confirmSerialLines.docIds` with a reason: the manager has corrected the count in SAP with MI05. The confirmation is
   * logged on the document.
   * `marked` tells which materials became "Bogført i SAP" and which were skipped (not approved, or `failed`: the mark
   * could not be written), so the screen only says "markeret" for those that were.
   */
  async function post(user, id, docIds = [], { confirmSerialLines = null } = {}) {
    const { rows, docs, role } = await context(user, id)
    const chosen = [...new Set(docIds)].map(docId => docs.find(item => item.id === docId))
    for (const doc of chosen) {
      const reason = refusal({ action: 'post', role, email: user.email, doc })
      if (reason) throw codeError('PIDOC_FORBIDDEN', reason)
    }
    if (!chosen.length) throw codeError('PIDOC_INVALID', 'Vælg mindst ét dokument')
    if (new Set(chosen.map(doc => doc.year)).size > 1) throw codeError('PIDOC_INVALID', 'Dokumenterne skal være fra samme år')
    // Counted before this rule (or by an older client): MI20 would post a quantity the manager never approved.
    const flagged = chosen.filter(doc => doc.lines.some(line => rows.some(item => item.material === line.material && item.sloc === doc.sloc && item.stockType === doc.stockType && item.serialLinesAtApproval)))
    const listed = new Set(Array.isArray(confirmSerialLines?.docIds) ? confirmSerialLines.docIds.filter(docId => typeof docId === 'string') : [])
    const unconfirmed = flagged.filter(doc => !listed.has(doc.id))
    if (unconfirmed.length) throw codeError('PIDOC_SERIAL_LINES', `Dokumentet kan ikke bogføres, fordi et materiale blev godkendt med tællelinjer med antal. Ret antallet i SAP med MI05. Bagefter kan en manager bogføre dokumentet her med en begrundelse. Gælder: ${unconfirmed.map(doc => doc.docNo).join(', ')}`)
    const confirmReason = String(confirmSerialLines?.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
    if (flagged.length && !confirmReason) throw codeError('PIDOC_INVALID', 'Skriv hvorfor dokumentet bogføres alligevel')
    const confirmed = new Set(flagged.map(doc => doc.id))
    let result
    try {
      result = await writer.postDocuments({ docNos: chosen.map(doc => doc.docNo), year: chosen[0].year })
    } catch (error) {
      // The user may have posted any of them: they wait for a manager, never "Antal lagt på" to be posted again.
      if (error?.code === 'PIDOC_UNKNOWN') await markUnknown(user, id, chosen, 'post', 'counted', error)
      throw error
    }
    const at = now()
    const unknown = result.unknown || []
    const postedMaterials = chosen.filter(item => result.posted.includes(item.docNo)).flatMap(doc => doc.lines.map(line => line.material))
    const confirmedMaterials = new Set(flagged.flatMap(doc => doc.lines.map(line => line.material)))
    // The documents and the approvals are different files: both are written at the same time. The approvals are one
    // write for every material of the posted documents ("Bogført i SAP"), not one write per material. Also after the
    // status is locked: posting is the follow-up of the approval. Which materials were marked is returned for the screen.
    const markPosted = async () => {
      if (!postedMaterials.length) return { posted: [], skipped: [] }
      try {
        const marked = await counts.markPosted(user, id, postedMaterials)
        for (const material of marked.skipped) console.error('CountPoint: could not mark as posted', material, 'APPROVAL_INVALID')
        for (const material of marked.serialLines || []) if (!confirmedMaterials.has(material)) console.error('CountPoint: posted although approved with quantity lines', material, 'APPROVED_WITH_SERIAL_LINES')
        // Marked by an earlier document of the same material (another sloc or stock type): marked, not skipped.
        return { posted: [...marked.posted, ...(marked.already || [])], skipped: marked.skipped }
      } catch (error) {
        console.error('CountPoint: could not mark as posted', postedMaterials.join(', '), error.code || error.message)
        return { posted: [], skipped: [...new Set(postedMaterials)], failed: true }
      }
    }
    // Who confirmed it, when and why: also when SAP did not post it this time. Not listed by MI22 at all: unknown.
    const changes = chosen.flatMap(doc => [
      ...(confirmed.has(doc.id) ? [{ kind: 'step', docId: doc.id, from: null, set: { serialLinesConfirmedBy: by(user, at), serialLinesConfirmedAt: at, serialLinesReason: confirmReason } }] : []),
      ...(result.posted.includes(doc.docNo) ? [{
        kind: 'step', docId: doc.id, from: ['counted'], by: by(user, at),
        set: { status: 'posted', postedBy: by(user, at), materialDoc: result.materialDocs[doc.docNo] || null, differences: result.differences.filter(item => item.docNo === doc.docNo).map(({ material, book, counted, diff, amount }) => ({ material, book, counted, diff, amount })) },
      }] : unknown.includes(doc.docNo) ? [{ kind: 'unknown', docId: doc.id, sapUnknown: { step: 'post', status: 'counted', by: by(user, at), detail: 'not-listed-in-mi22' } }] : []),
    ])
    const [saved, marked] = await Promise.all([changes.length ? persist(user, id, changes) : true, markPosted()])
    if (!saved && result.posted.length) throw saveFailed(`bogføringen af ${result.posted.join(', ')}`)
    return { ...(await list(user, id)), posted: result.posted, open: result.open, unknown, marked }
  }

  /** MI02 for a wrong document (created or printed); it frees the materials for a new document. */
  async function remove(user, id, docId) {
    const { docs, role } = await context(user, id)
    const doc = docs.find(item => item.id === docId)
    const reason = refusal({ action: 'delete', role, email: user.email, doc })
    if (reason) throw codeError('PIDOC_FORBIDDEN', reason)
    const result = await writer.deleteDocument({ docNo: doc.docNo, year: doc.year, reference: doc.reference })
    const at = now()
    const change = { kind: 'step', docId, from: null, by: by(user, at), set: { status: 'deleted', deletedBy: { ...by(user, at), message: result.message } } }
    if (!(await persist(user, id, [change]))) throw saveFailed(`sletningen af ${doc.docNo}`)
    return list(user, id)
  }

  /**
   * A manager's decision on a document SAP may or may not have (status unknown), after looking in SAP (MI03/MI22):
   * `saved` with the document number typed in (an unknown create gets that number; a count or posting must name the
   * document itself) makes it created, counted or posted as the step it came from; `missing` releases an unknown create
   * (kept as deleted) and takes a count or posting back to the step before, so it can be done again. SAP is not touched.
   * Who, when, why and the step it came from are added to `sapResolutions`. A resolved posting marks its materials
   * "Bogført i SAP" as a posting does.
   */
  async function resolve(user, id, docId, { outcome, docNo, reason } = {}) {
    const { docs, role } = await context(user, id)
    const doc = docs.find(item => item.id === docId)
    const refused = refusal({ action: 'resolve', role, email: user.email, doc })
    if (refused) throw codeError('PIDOC_FORBIDDEN', refused)
    if (!RESOLUTIONS.has(outcome)) throw codeError('PIDOC_INVALID', 'Vælg om dokumentet findes i SAP')
    const text = clean(reason, 300)
    if (!text) throw codeError('PIDOC_INVALID', 'Skriv hvad SAP viser')
    const step = doc.sapUnknown?.step || 'create'
    const number = String(docNo ?? '').trim()
    if (outcome === 'saved' && !DOC_NO.test(number)) throw codeError('PIDOC_INVALID', 'Skriv SAP-dokumentnummeret (9 eller 10 cifre)')
    if (outcome === 'saved' && step !== 'create' && number !== doc.docNo) throw codeError('PIDOC_INVALID', `Dokumentnummeret er ${doc.docNo}`)
    const at = now()
    let resolvedTo = null
    await repo.changePiDocs(user.team, id, all => {
      const current = all[docId]
      if (statusOf(current) !== 'unknown') throw changed()
      const { sapUnknown = {}, ...rest } = current
      const sapResolutions = [...(current.sapResolutions || []), { ...sapUnknown, step, outcome, docNo: outcome === 'saved' ? number : null, reason: text, resolvedBy: by(user, at) }]
      const doer = sapUnknown.by || by(user, at)
      if (step === 'create' && outcome === 'saved') {
        if (all[number] && number !== docId) throw codeError('PIDOC_INVALID', `${number} er allerede et SAP-dokument i optællingen`)
        delete all[docId]
        resolvedTo = { ...rest, id: number, docNo: number, year: rest.year || String(new Date(rest.createdBy?.at || at).getFullYear()), system: rest.system || system, status: 'created', sapResolutions }
        all[number] = resolvedTo
      } else if (step === 'create') {
        resolvedTo = { ...rest, status: 'deleted', sapResolutions }
        all[docId] = resolvedTo
      } else if (step === 'count') {
        resolvedTo = { ...rest, status: outcome === 'saved' ? 'counted' : 'printed', ...(outcome === 'saved' ? { countedBy: doer } : {}), sapResolutions }
        all[docId] = resolvedTo
      } else {
        resolvedTo = { ...rest, status: outcome === 'saved' ? 'posted' : 'counted', ...(outcome === 'saved' ? { postedBy: doer, materialDoc: rest.materialDoc || null, differences: rest.differences || [] } : {}), sapResolutions }
        all[docId] = resolvedTo
      }
      return { all }
    })
    if (resolvedTo?.status === 'posted') {
      const materials = resolvedTo.lines.map(line => line.material)
      await counts.markPosted(user, id, materials).catch(error => console.error('CountPoint: could not mark as posted', materials.join(', '), error?.code || error?.message))
    }
    return list(user, id)
  }

  return { list, create, print, count, post, remove, resolve }
}

module.exports = { createPiDocService }
