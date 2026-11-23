// SAP physical inventory documents for approved materials: which materials may share a document, which
// transaction takes the count, short or long serials, and who may do which step. Pure rules; SAP is driven elsewhere.
const { approvedWithLinesText } = require('./countDoc.cjs')

const MANAGER_ROLES = new Set(['manager', 'status-manager'])
const ACTIVE = new Set(['created', 'printed', 'counted'])
/** Next step per status, and the role that does it. */
const NEXT = Object.freeze({ created: 'print', printed: 'count', counted: 'post' })
const ACTION_ROLE = Object.freeze({ create: 'manager', print: 'manager', post: 'manager', delete: 'manager', count: 'admin' })
// Same as MI31's "Maximum No. of Items" in the guide.
const MAX_LINES = 20

function codeError(code, message) {
  const error = new Error(`${code}: ${message}`)
  error.code = code
  return error
}

/** Everything with serial numbers goes through ZMS_COUNT_SERIAL; without serial numbers MI04 (quantity only). */
function transactionFor({ serialManaged }) {
  return serialManaged ? 'ZMS_COUNT_SERIAL' : 'MI04'
}

/** Blocked stock always takes the short serials; otherwise the serial rule of the material decides. */
function serialFormat({ stockType, rule }) {
  return stockType !== 'blocked' && rule?.unrestricted === true ? 'long' : 'short'
}

const lineKey = (material, sloc, stockType) => `${material}|${sloc}|${stockType}`

/**
 * Validates a new document and returns its lines. `rows` come from buildCountDoc; `docs` are the documents of the
 * count so far. New terminals (-0): one material per document. Used terminals (-0-R) and accessories: several, but only
 * of the same kind, and never with and without serial numbers together (each document goes through one transaction).
 * Never unrestricted and blocked together.
 */
function planDocument({ rows, docs = [], materials, sloc, stockType }) {
  const wanted = [...new Set((Array.isArray(materials) ? materials : []).map(value => String(value || '').trim().toUpperCase()).filter(Boolean))]
  if (!wanted.length) throw codeError('PIDOC_EMPTY', 'Vælg mindst ét materiale')
  if (wanted.length > MAX_LINES) throw codeError('PIDOC_TOO_MANY', `Højst ${MAX_LINES} materialer pr. optællingsdokument`)
  if (stockType !== 'unrestricted' && stockType !== 'blocked') throw codeError('PIDOC_INVALID', 'Ugyldig lagertype')
  const taken = new Set(docs.filter(doc => ACTIVE.has(doc.status) || doc.status === 'posted' || doc.status === 'creating').flatMap(doc => doc.lines.map(line => lineKey(line.material, doc.sloc, doc.stockType))))
  const lines = wanted.map(material => {
    const row = rows.find(item => item.material === material && item.sloc === sloc && item.stockType === stockType)
    if (!row) throw codeError('PIDOC_INVALID', `${material} er ikke talt i ${sloc} (${stockType})`)
    if (row.status !== 'approved') throw codeError('PIDOC_NOT_APPROVED', `${material} er ikke godkendt`)
    if (row.serialLinesAtApproval) throw codeError('APPROVED_WITH_SERIAL_LINES', approvedWithLinesText(material))
    if (taken.has(lineKey(material, sloc, stockType))) throw codeError('PIDOC_EXISTS', `${material} har allerede et SAP-dokument`)
    return { material, description: row.description || '', kind: row.kind, serialManaged: row.serialManaged === true, transaction: transactionFor(row) }
  })
  if (lines.some(line => line.kind === 'new') && lines.length > 1) throw codeError('PIDOC_ONE_NEW', 'Nye terminaler (-0) får ét dokument pr. materiale')
  if (new Set(lines.map(line => line.kind)).size > 1) throw codeError('PIDOC_MIXED', 'Brugte terminaler og tilbehør skal på hver sit dokument')
  if (new Set(lines.map(line => line.transaction)).size > 1) throw codeError('PIDOC_MIXED', 'Tilbehør med og uden serienumre skal på hver sit dokument')
  return { sloc, stockType, kind: lines[0].kind, transaction: lines[0].transaction, lines }
}

/** May `role` (manager | status-manager | admin | user) do `action` on `doc` now? Returns null or the reason. */
function refusal({ action, role, email, doc }) {
  const needs = ACTION_ROLE[action]
  if (!needs) return 'Ukendt handling'
  if (needs === 'manager' && !MANAGER_ROLES.has(role)) return 'Kun managers og status managers kan gøre det'
  if (needs === 'admin' && role !== 'admin') return 'Kun admins lægger antal og serienumre på'
  if (action === 'create') return null
  if (!doc) return 'Dokumentet findes ikke'
  if (action === 'delete') return doc.status === 'created' || doc.status === 'printed' ? null : 'Dokumentet kan ikke slettes, når der er lagt antal på'
  if (NEXT[doc.status] !== action) return 'Dokumentet er ikke klar til det trin'
  if (action === 'count' && String(email || '').toLowerCase() === doc.createdBy?.email) return 'Den der oprettede dokumentet må ikke lægge antal på'
  return null
}

module.exports = { transactionFor, serialFormat, planDocument, refusal, NEXT, ACTIVE, MAX_LINES }
