const test = require('node:test')
const assert = require('node:assert/strict')
const { differenceTotals, archiveLines } = require('./archive.cjs')

test('difference: over and under both count (|over| + |under|) as a share of the SAP stock, in pieces and DKK', () => {
  const totals = differenceTotals([
    { sapQty: 100, counted: 97, diff: -3, unitPrice: 5 },
    { sapQty: 50, counted: 52, diff: 2, unitPrice: 10 },
    { sapQty: 50, counted: 50, diff: 0, unitPrice: 1 },
  ])
  assert.deepEqual([totals.sapQty, totals.counted, totals.over, totals.under, totals.absDiff, totals.absPercent], [200, 199, 2, 3, 5, 2.5], 'net would be -1 (0,5 %), but the difference is 5 (2,5 %)')
  assert.deepEqual([totals.sapValue, totals.valueOver, totals.valueUnder, totals.valueAbs, totals.valuePercent], [1050, 20, 15, 35, 3.33])
  assert.equal(totals.priced, true)
  assert.deepEqual([differenceTotals([]).absPercent, differenceTotals([{ sapQty: 0, counted: 4, diff: 4, unitPrice: null }]).absPercent], [0, 100])
  assert.equal(differenceTotals([{ sapQty: 1, counted: 1, diff: 0, unitPrice: null }]).priced, false)
})

test('archive lines: counted lines with approval and the SAP document; deleted documents are left out', () => {
  const row = (material, extra = {}) => ({ material, description: `${material} tekst`, kind: 'accessory', sloc: 'D000', stockType: 'unrestricted', sapQty: 10, counted: 9, diff: -1, unitPrice: 2, valueDiff: -2, ...extra })
  const rows = [row('R2'), row('R1'), row('R3', { sapQty: 0, counted: 0, diff: 0 })]
  const docs = [
    { docNo: '105000894', year: '2026', status: 'posted', system: 'QS4', materialDoc: '4905204847', postedBy: { at: new Date(2027, 0, 2).getTime() }, sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R1' }] },
    { docNo: '105000903', status: 'deleted', sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R2' }] },
  ]
  const lines = archiveLines({ count: { id: 'c1', name: 'Tilbehør' }, rows, approvals: { R1: { status: 'posted', by: { name: 'Mona' }, at: 5 } }, docs })
  assert.deepEqual(lines.map(line => line.material), ['R1', 'R2'], 'nothing counted and nothing in SAP is left out')
  assert.deepEqual(lines[0].doc, { docNo: '105000894', year: '2026', status: 'posted', system: 'QS4', materialDoc: '4905204847', materialYear: '2027' }, 'the material document belongs to the posting year')
  assert.deepEqual([lines[0].approval.status, lines[0].approval.by, lines[0].countName], ['posted', 'Mona', 'Tilbehør'])
  assert.equal(lines[1].doc, null, 'a deleted document is not shown')
})

test('a document SAP may or may not have is archived as unknown', () => {
  const rows = [{ material: 'R1', description: '', kind: 'accessory', sloc: 'D000', stockType: 'unrestricted', sapQty: 5, counted: 4, diff: -1 }]
  const docs = [{ docNo: '105000894', year: '2026', status: 'counted', sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R1' }], sapUnknown: { step: 'post', status: 'counted' } }]
  assert.equal(archiveLines({ count: { id: 'c1', name: 'Tilbehør' }, rows, docs })[0].doc.status, 'unknown')
})