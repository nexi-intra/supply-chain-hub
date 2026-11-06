/**
 * The count document is created in SAP on another day than the count. CountPoint only prepares it (read-only):
 * quantity for the document = SAP stock of the day + the difference the manager approved.
 * Serial numbers: the list for the document = SAP's serials of the day minus the ones missing at approval; the list
 * decides the quantity, and a quantity that differs from "SAP today + difference" is flagged.
 */
const { indexSnapshot } = require('./snapshot.cjs')

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

/**
 * `rows` are the result rows with the approved numbers frozen (applyApprovals). `doc` is the stock of the day or null.
 * `missingOf(row)` gives the serials missing at approval of an approved serial-managed row.
 */
function buildCountDoc({ rows, approvals = {}, doc = null, missingOf = () => [] }) {
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
    if (row.serialManaged && approved && today) {
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
    }
  })
  return { rows: result, missingApproval: missing.size, withSerials }
}

module.exports = { docLinesFromSnapshot, missingAtApproval, buildCountDoc }
