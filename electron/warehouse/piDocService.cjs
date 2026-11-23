// SAP physical inventory documents of a count: create (MI31) and print (MI21) through the SAP writer, with the rules of
// core/piDocs.cjs. While SAP waits for the user's F8 the materials are reserved ('creating') so nobody creates them twice.
const crypto = require('node:crypto')
const { planDocument, refusal, NEXT } = require('./core/piDocs.cjs')
const { approvedWithLinesText } = require('./core/countDoc.cjs')

const RESERVATION_MS = 20 * 60 * 1000

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
    return { rows: doc.rows, fetchedAt: doc.fetchedAt || null, docs: live(all, now()), role }
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
    let result
    try {
      result = await writer.createDocument({ sloc: plan.sloc, stockType: plan.stockType, reference, materials: plan.lines.map(line => line.material) })
    } catch (error) {
      await repo.changePiDocs(user.team, id, all => { delete all[reference]; return { all } }).catch(() => {})
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
   */
  async function count(user, id, docId) {
    const { rows, fetchedAt, docs, role } = await context(user, id)
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
    for (const line of pending) {
      if (line.transaction === 'ZMS_COUNT_SERIAL') {
        const { serials } = await counts.copySerials(user, id, { material: line.material, sloc: doc.sloc, stockType: doc.stockType, forDoc: true })
        if (!serials.length) { quantities.push({ material: line.material, qty: 0 }); continue }
        const result = await writer.enterSerials({ docNo: doc.docNo, year: doc.year, material: line.material, serials })
        await remember(line.material, { serials: result.serials, qty: result.counted })
      } else {
        const row = rows.find(item => item.material === line.material && item.sloc === doc.sloc && item.stockType === doc.stockType)
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
   */
  async function post(user, id, docIds = []) {
    const { docs, role } = await context(user, id)
    const chosen = [...new Set(docIds)].map(docId => docs.find(item => item.id === docId))
    for (const doc of chosen) {
      const reason = refusal({ action: 'post', role, email: user.email, doc })
      if (reason) throw codeError('PIDOC_FORBIDDEN', reason)
    }
    if (!chosen.length) throw codeError('PIDOC_INVALID', 'Vælg mindst ét dokument')
    if (new Set(chosen.map(doc => doc.year)).size > 1) throw codeError('PIDOC_INVALID', 'Dokumenterne skal være fra samme år')
    const result = await writer.postDocuments({ docNos: chosen.map(doc => doc.docNo), year: chosen[0].year })
    const at = now()
    const postedMaterials = chosen.filter(item => result.posted.includes(item.docNo)).flatMap(doc => doc.lines.map(line => line.material))
    // The documents and the approvals are different files: both are written at the same time. The approvals are one
    // write for every material of the posted documents ("Bogført i SAP"), not one write per material.
    const markPosted = async () => {
      if (!postedMaterials.length) return
      try {
        const marked = await counts.markPosted(user, id, postedMaterials)
        for (const material of marked.skipped) console.error('CountPoint: could not mark as posted', material, 'APPROVAL_INVALID')
        for (const material of marked.serialLines || []) console.error('CountPoint: could not mark as posted', material, 'APPROVED_WITH_SERIAL_LINES')
      } catch (error) {
        console.error('CountPoint: could not mark as posted', postedMaterials.join(', '), error.code || error.message)
      }
    }
    await Promise.all([
      repo.changePiDocs(user.team, id, all => {
        for (const doc of chosen) {
          if (!result.posted.includes(doc.docNo) || all[doc.id]?.status !== 'counted') continue
          const differences = result.differences.filter(item => item.docNo === doc.docNo).map(({ material, book, counted, diff, amount }) => ({ material, book, counted, diff, amount }))
          all[doc.id] = { ...all[doc.id], status: 'posted', postedBy: by(user, at), materialDoc: result.materialDocs[doc.docNo] || null, differences }
        }
        return { all }
      }),
      markPosted(),
    ])
    return { ...(await list(user, id)), posted: result.posted, open: result.open }
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
