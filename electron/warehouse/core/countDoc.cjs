/**
 * The count document is created in SAP on another day than the count. CountPoint only prepares it (read-only):
 * quantity for the document = SAP stock of the day + the difference the manager approved.
 * Serial numbers: the list for the document = SAP's serials of the day minus the ones missing at approval; the list
 * decides the quantity, and a quantity that differs from "SAP today + difference" is flagged.
 */
const { indexSnapshot } = require('./snapshot.cjs')
const { activeEvents } = require('./countState.cjs')

const keyOf = (material, sloc, stockType) => `${material}|${sloc}|${stockType}`

/** In-scope stock of the day per material, storage location and stock type of the count, with SAP's serials of the day. */
function docLinesFromSnapshot(snapshot) {
  const types = snapshot.scope.stockTypes || ['unrestricted']
  const lines = []
  const byKey = new Map()
  for (const line of snapshot.stock) {
    if (!line.inScope) continue
    for (const stockType of types) {
      if (!(line[stockType] > 0)) continue
      const entry = { material: snapshot.materials[line.m].material, sloc: line.sloc, stockType, qty: line[stockType] }
      if (snapshot.materials[line.m].serialManaged) entry.serials = []
      lines.push(entry)
      byKey.set(keyOf(entry.material, entry.sloc, stockType), entry)
    }
  }
  if (snapshot.serials?.length) {
    for (const [serial, info] of indexSnapshot(snapshot).serials) {
      if (!info.inScope || !types.includes(info.stockType)) continue
      const key = keyOf(info.material, info.sloc, info.stockType)
      if (!byKey.has(key)) {
        const entry = { material: info.material, sloc: info.sloc, stockType: info.stockType, qty: 0, serials: [] }
        lines.push(entry)
        byKey.set(key, entry)
      }
      byKey.get(key).serials.push(serial)
    }
    for (const entry of lines) entry.serials?.sort()
  }
  return lines
}

/**
 * The serials of one row that were missing when the material was approved. Approvals since this rule carry the list;
 * older ones are rebuilt from the scan times: a serial counts as found if its first active scan came at or before the
 * approval (scans of an approved material cannot be removed, so this is what the manager saw).
 */
function missingAtApproval({ approval, row, index, found }) {
  const frozen = approval?.frozen?.find(item => item.sloc === row.sloc && item.stockType === row.stockType)
  if (Array.isArray(frozen?.missingSerials)) return frozen.missingSerials
  const missing = []
  for (const [serial, info] of index.serials) {
    if (!info.inScope || info.material !== row.material || info.sloc !== row.sloc || info.stockType !== row.stockType) continue
    const first = found.get(serial)
    if (!first || first.at > approval.at) missing.push(serial)
  }
  return missing.sort()
}

const LINE_EVENTS = new Set(['line', 'line-delete', 'undo'])
/** APPROVED_WITH_SERIAL_LINES: what to do about a material linesAtApproval found. */
const approvedWithLinesText = material => `${material} er godkendt med tællelinjer med antal. Nulstil materialet, slet linjen og godkend igen.`

/**
 * The approved (or posted) serial-managed materials that had a quantity line when they were approved (older clients
 * allowed it). Their frozen count includes the line, but the serial list of the document does not, so neither can be
 * trusted. Worked out from the journal as it stood at `approval.at`: lines saved at or before it, not deleted or undone
 * before it. Deleting the line afterwards does not change the frozen numbers, so it does not clear this either.
 */
function linesAtApproval({ approvals = {}, events = [], serialManaged }) {
  const result = new Set()
  const relevant = events.filter(event => LINE_EVENTS.has(event.type))
  // Most approvals never had a line: only materials named in some line event are replayed.
  const named = new Set(relevant.filter(event => event.type === 'line').map(event => String(event.material || '').toUpperCase()))
  for (const [material, approval] of Object.entries(approvals)) {
    if (!named.has(material) || !['approved', 'posted'].includes(approval?.status) || typeof approval.at !== 'number' || !serialManaged(material)) continue
    const lines = new Map()
    for (const event of activeEvents(relevant.filter(item => item.at <= approval.at))) {
      if (typeof event.lineId !== 'string') continue
      if (event.type === 'line') lines.set(event.lineId, event)
      else if (event.type === 'line-delete') lines.delete(event.lineId)
    }
    if ([...lines.values()].some(event => String(event.material || '').toUpperCase() === material)) result.add(material)
  }
  return result
}

/**
 * `rows` are the result rows with the approved numbers frozen (applyApprovals). `doc` is the stock of the day or null.
 * `missingOf(row)` gives the serials missing at approval of an approved serial-managed row. `withLinesAtApproval(row)`
 * is true when that approval also held quantity lines (linesAtApproval): such a row gets no quantity and no list.
 */
function buildCountDoc({ rows, approvals = {}, doc = null, missingOf = () => [], withLinesAtApproval = () => false }) {
  const today = doc ? new Map(doc.lines.map(line => [keyOf(line.material, line.sloc, line.stockType), line])) : null
  const withSerials = doc?.withSerials === true
  const missing = new Set()
  const result = rows.map(row => {
    const status = approvals[row.material]?.status || 'open'
    const approved = status === 'approved' || status === 'posted'
    if (!approved) missing.add(row.material)
    const line = today ? today.get(keyOf(row.material, row.sloc, row.stockType)) : null
    const sapToday = today ? line?.qty || 0 : null
    const expectedQty = approved && sapToday !== null ? sapToday + row.diff : null
    let docQty = expectedQty
    let docSerials = null
    let needsSerials = false
    const serialLinesAtApproval = Boolean(row.serialManaged && approved && withLinesAtApproval(row))
    if (serialLinesAtApproval) {
      // The approved count includes quantity lines the serial list cannot hold: approve again without them.
      docQty = null
    } else if (row.serialManaged && approved && today) {
      if (!withSerials) {
        // Fetched before serials were part of the stock of the day: no list, so no quantity either.
        needsSerials = true
        docQty = null
      } else {
        const gone = new Set(missingOf(row))
        docSerials = (line?.serials || []).filter(serial => !gone.has(serial))
        docQty = docSerials.length
      }
    }
    return {
      material: row.material,
      description: row.description,
      kind: row.kind,
      sloc: row.sloc,
      stockType: row.stockType,
      serialManaged: row.serialManaged,
      foundSerials: row.serialManaged ? row.countedSerials : 0,
      status,
      approved,
      sapAtApproval: approved ? row.sapQty : null,
      diff: approved ? row.diff : null,
      sapToday,
      expectedQty,
      docQty,
      docSerials,
      needsSerials,
      serialLinesAtApproval,
    }
  })
  return { rows: result, missingApproval: missing.size, withSerials }
}

/**
 * A confirmation covers only what the user was shown: true when every item of `current` is on the confirmed list
 * (anything that is not an array of strings confirms nothing).
 */
function confirmedAll(current, confirmed) {
  const list = new Set(Array.isArray(confirmed) ? confirmed.filter(item => typeof item === 'string') : [])
  return current.every(item => list.has(item))
}

module.exports = { docLinesFromSnapshot, missingAtApproval, linesAtApproval, approvedWithLinesText, buildCountDoc, confirmedAll }
