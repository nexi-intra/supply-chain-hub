// SAP physical inventory documents of a count: create (MI31) and print (MI21) through the SAP writer, with the rules of
// core/piDocs.cjs. While SAP waits for the user's F8 the materials are reserved ('creating') so nobody creates them twice.
const crypto = require('node:crypto')
const { planDocument, refusal, NEXT, RESERVATION_MS } = require('./core/piDocs.cjs')
const { approvedWithLinesText, confirmedAll } = require('./core/countDoc.cjs')

function codeError(code, message) {
  const error = new Error(`${code}: ${message}`)
  error.code = code
  return error
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

function createPiDocService({ counts, repo, roles, writer, system, writeEnabled = true, now = Date.now, newReference = defaultReference }) {
  /** Documents that count: everything except stale reservations of a crashed app. */
  const live = (all, at) => Object.values(all || {}).filter(doc => doc.status !== 'creating' || at - doc.startedAt < RESERVATION_MS)

  async function context(user, id) {
    const [doc, all, role] = await Promise.all([counts.countDoc(user, id), repo.getPiDocs(user.team, id), roles.roleOf(user)])
    return { rows: doc.rows, fetchedAt: doc.fetchedAt || null, confirmedMissing: doc.confirmedMissing || null, docs: live(all, now()), role }
  }

  function view(user, role, doc) {
    const action = NEXT[doc.status] || null
    return { ...doc, next: action, canNext: writeEnabled && action ? refusal({ action, role, email: user.email, doc }) === null : false, canDelete: writeEnabled && refusal({ action: 'delete', role, email: user.email, doc }) === null }
  }

  async function list(user, id) {
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
    let result
    try {
      result = await writer.createDocument({ sloc: plan.sloc, stockType: plan.stockType, reference, materials: plan.lines.map(line => line.material) })
    } catch (error) {
      await takeBack()
      throw error
    }
    const at = now()
    const year = String(new Date(at).getFullYear())
    await repo.changePiDocs(user.team, id, all => {
      delete all[reference]
      for (const created of result.docs) {
        all[created.docNo] = {
          id: created.docNo, docNo: created.docNo, year, system, reference, status: 'created', sloc: plan.sloc, stockType: plan.stockType, kind: plan.kind, transaction: plan.transaction,
          lines: plan.lines.filter(line => created.materials.includes(line.material)), createdBy: by(user, at), docFetchedAt: fetchedAt,
        }
      }
      return { all }
    })
    if (!result.docs.length) throw codeError('PIDOC_NOT_CREATED', 'SAP oprettede ikke noget dokument')
    return { ...(await list(user, id)), created: result.docs.map(doc => doc.docNo), missing: result.missing }
  }

  async function print(user, id, docId) {
    const { docs, role } = await context(user, id)
    const doc = docs.find(item => item.id === docId)
    const reason = refusal({ action: 'print', role, email: user.email, doc })
    if (reason) throw codeError('PIDOC_FORBIDDEN', reason)
    const result = await writer.printDocument({ docNo: doc.docNo, year: doc.year, sloc: doc.sloc })
    const at = now()
    await repo.changePiDocs(user.team, id, all => {
      if (all[docId]?.status !== 'created') throw codeError('PIDOC_CHANGED', 'Dokumentet er ændret i mellemtiden')
      all[docId] = { ...all[docId], status: 'printed', printedBy: { ...by(user, at), message: result.message } }
      return { all }
    })
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
    const remember = async (material, value) => {
      done[material] = { ...value, by: lower(user.email), at: now() }
      await repo.changePiDocs(user.team, id, all => {
        if (all[docId]?.status !== 'printed') throw codeError('PIDOC_CHANGED', 'Dokumentet er ændret i mellemtiden')
        all[docId] = { ...all[docId], entered: { ...(all[docId].entered || {}), [material]: done[material] } }
        return { all }
      })
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
        const result = await writer.enterSerials({ docNo: doc.docNo, year: doc.year, material: line.material, serials })
        await remember(line.material, { serials: result.serials, qty: result.counted })
      } else {
        const row = rowOf(line.material)
        if (!row || row.docQty === null) throw codeError('PIDOC_NO_QTY', `Hent dagens SAP-tal, før antallet for ${line.material} lægges på`)
        if (row.docQty < 0) throw codeError('PIDOC_NO_QTY', `Antallet for ${line.material} er negativt (${row.docQty}) – tjek materialet`)
        quantities.push({ material: line.material, qty: row.docQty })
      }
    }
    if (quantities.length) {
      await writer.enterCounts({ docNo: doc.docNo, year: doc.year, entries: quantities })
      // One write for every quantity entered (was one 20-s write per material).
      const enteredAt = now()
      for (const entry of quantities) done[entry.material] = { qty: entry.qty, by: lower(user.email), at: enteredAt }
    }
    const at = now()
    await repo.changePiDocs(user.team, id, all => {
      if (all[docId]?.status !== 'printed') throw codeError('PIDOC_CHANGED', 'Dokumentet er ændret i mellemtiden')
      all[docId] = { ...all[docId], entered: { ...(all[docId].entered || {}), ...done }, status: 'counted', countedBy: by(user, at) }
      return { all }
    })
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
    const result = await writer.postDocuments({ docNos: chosen.map(doc => doc.docNo), year: chosen[0].year })
    const at = now()
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
    const [, marked] = await Promise.all([
      repo.changePiDocs(user.team, id, all => {
        for (const doc of chosen) {
          // Who confirmed it, when and why: also when SAP did not post it this time.
          if (confirmed.has(doc.id) && all[doc.id]) all[doc.id] = { ...all[doc.id], serialLinesConfirmedBy: by(user, at), serialLinesConfirmedAt: at, serialLinesReason: confirmReason }
          if (!result.posted.includes(doc.docNo) || all[doc.id]?.status !== 'counted') continue
          const differences = result.differences.filter(item => item.docNo === doc.docNo).map(({ material, book, counted, diff, amount }) => ({ material, book, counted, diff, amount }))
          all[doc.id] = { ...all[doc.id], status: 'posted', postedBy: by(user, at), materialDoc: result.materialDocs[doc.docNo] || null, differences }
        }
        return { all }
      }),
      markPosted(),
    ])
    return { ...(await list(user, id)), posted: result.posted, open: result.open, marked }
  }

  /** MI02 for a wrong document (created or printed); it frees the materials for a new document. */
  async function remove(user, id, docId) {
    const { docs, role } = await context(user, id)
    const doc = docs.find(item => item.id === docId)
    const reason = refusal({ action: 'delete', role, email: user.email, doc })
    if (reason) throw codeError('PIDOC_FORBIDDEN', reason)
    const result = await writer.deleteDocument({ docNo: doc.docNo, year: doc.year, reference: doc.reference })
    const at = now()
    await repo.changePiDocs(user.team, id, all => {
      all[docId] = { ...all[docId], status: 'deleted', deletedBy: { ...by(user, at), message: result.message } }
      return { all }
    })
    return list(user, id)
  }

  return { list, create, print, count, post, remove }
}

module.exports = { createPiDocService }
