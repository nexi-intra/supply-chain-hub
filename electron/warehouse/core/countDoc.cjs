/**
 * The count document is created in SAP on another day than the count. CountPoint only prepares it (read-only):
 * quantity for the document = SAP stock of the day + the difference the manager approved.
 */

const keyOf = (material, sloc, stockType) => `${material}|${sloc}|${stockType}`

/** In-scope stock of the day per material, storage location and stock type of the count. */
function docLinesFromSnapshot(snapshot) {
  const types = snapshot.scope.stockTypes || ['unrestricted']
  const lines = []
  for (const line of snapshot.stock) {
    if (!line.inScope) continue
    for (const stockType of types) {
      if (line[stockType] > 0) lines.push({ material: snapshot.materials[line.m].material, sloc: line.sloc, stockType, qty: line[stockType] })
    }
  }
  return lines
}

/** `rows` are the result rows with the approved numbers frozen (applyApprovals). `doc` is the stock of the day or null. */
function buildCountDoc({ rows, approvals = {}, doc = null }) {
  const today = doc ? new Map(doc.lines.map(line => [keyOf(line.material, line.sloc, line.stockType), line.qty])) : null
  const missing = new Set()
  const result = rows.map(row => {
    const status = approvals[row.material]?.status || 'open'
    const approved = status === 'approved' || status === 'posted'
    if (!approved) missing.add(row.material)
    const sapToday = today ? today.get(keyOf(row.material, row.sloc, row.stockType)) || 0 : null
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
      docQty: approved && sapToday !== null ? sapToday + row.diff : null,
    }
  })
  return { rows: result, missingApproval: missing.size }
}

module.exports = { docLinesFromSnapshot, buildCountDoc }
