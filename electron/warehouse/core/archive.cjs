// The archive of a locked status: every counted line with its SAP documents, and the difference where over and under
// both count as difference (|over| + |under|), as a share of the SAP stock. Pure functions.
const { statusOf } = require('./piDocs.cjs')

const round2 = value => Math.round(value * 100) / 100
const lineKey = (material, sloc, stockType) => `${material}|${sloc}|${stockType}`

/** Totals of lines: SAP stock, counted, over, under, the absolute difference and its share of SAP, in pieces and DKK. */
function differenceTotals(lines) {
  const totals = { lines: 0, sapQty: 0, counted: 0, over: 0, under: 0, sapValue: 0, valueOver: 0, valueUnder: 0, priced: true }
  for (const line of lines) {
    totals.lines++
    totals.sapQty += line.sapQty
    totals.counted += line.counted
    if (line.diff > 0) totals.over += line.diff
    if (line.diff < 0) totals.under -= line.diff
    if (line.unitPrice === null || line.unitPrice === undefined) { totals.priced = false; continue }
    totals.sapValue += line.sapQty * line.unitPrice
    if (line.diff > 0) totals.valueOver += line.diff * line.unitPrice
    if (line.diff < 0) totals.valueUnder -= line.diff * line.unitPrice
  }
  const absDiff = totals.over + totals.under
  const valueAbs = totals.valueOver + totals.valueUnder
  return {
    ...totals,
    sapValue: round2(totals.sapValue),
    valueOver: round2(totals.valueOver),
    valueUnder: round2(totals.valueUnder),
    absDiff,
    absPercent: totals.sapQty ? round2((absDiff / totals.sapQty) * 100) : (absDiff ? 100 : 0),
    valueAbs: round2(valueAbs),
    valuePercent: totals.sapValue ? round2((valueAbs / totals.sapValue) * 100) : (valueAbs ? 100 : 0),
  }
}

/**
 * The lines of one count (rows with the approved numbers frozen), joined with the SAP documents that hold them.
 * Deleted documents are left out.
 */
function archiveLines({ count, rows, approvals = {}, docs = [] }) {
  const docOf = new Map()
  for (const doc of docs) {
    if (doc.status === 'deleted') continue
    for (const line of doc.lines || []) docOf.set(lineKey(line.material, doc.sloc, doc.stockType), doc)
  }
  return rows
    .filter(row => row.sapQty > 0 || row.counted > 0)
    .map(row => {
      const doc = docOf.get(lineKey(row.material, row.sloc, row.stockType)) || null
      const approval = approvals[row.material] || null
      return {
        countId: count.id,
        countName: count.name,
        material: row.material,
        description: row.description || '',
        kind: row.kind,
        sloc: row.sloc,
        stockType: row.stockType,
        sapQty: row.sapQty,
        counted: row.counted,
        diff: row.diff,
        unitPrice: row.unitPrice ?? null,
        valueDiff: row.valueDiff ?? null,
        approval: approval ? { status: approval.status, by: approval.by?.name || null, at: approval.at || null } : null,
        doc: doc ? {
          docNo: doc.docNo || null, year: doc.year || null, status: statusOf(doc), system: doc.system || null,
          materialDoc: doc.materialDoc || null, materialYear: doc.materialDoc ? String(doc.postedBy?.at ? new Date(doc.postedBy.at).getFullYear() : doc.year) : null,
        } : null,
      }
    })
    .sort((a, b) => a.material.localeCompare(b.material) || a.sloc.localeCompare(b.sloc) || a.stockType.localeCompare(b.stockType))
}

module.exports = { differenceTotals, archiveLines }
