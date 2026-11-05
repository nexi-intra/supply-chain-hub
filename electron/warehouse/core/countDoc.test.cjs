const test = require('node:test')
const assert = require('node:assert/strict')
const { docLinesFromSnapshot, buildCountDoc } = require('./countDoc.cjs')

test('the SAP stock of the day: only in-scope lines and the stock types of the count', () => {
  const snapshot = {
    scope: { stockTypes: ['unrestricted'] },
    materials: [{ material: 'R162-0717' }, { material: 'R199-0001' }],
    stock: [
      { m: 0, sloc: 'D000', unrestricted: 80, blocked: 4, inScope: true },
      { m: 1, sloc: 'D000', unrestricted: 0, blocked: 2, inScope: false },
      { m: 1, sloc: 'D004', unrestricted: 9, blocked: 0, inScope: false },
    ],
  }
  assert.deepEqual(docLinesFromSnapshot(snapshot), [{ material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 80 }])
})

test('quantity for the count document = SAP today + the approved difference; not approved is marked', () => {
  const row = (material, sapQty, counted, extra = {}) => ({ material, description: `${material} tekst`, kind: 'accessory', sloc: 'D000', stockType: 'unrestricted', serialManaged: false, countedSerials: 0, sapQty, counted, diff: counted - sapQty, ...extra })
  const rows = [row('R1', 100, 97, { frozenAt: 5 }), row('R2', 10, 12), row('R3', 50, 47, { frozenAt: 6 })]
  const approvals = { R1: { status: 'posted' }, R2: { status: 'returned' }, R3: { status: 'approved' } }
  const doc = { fetchedAt: 9, by: { name: 'Mona' }, lines: [{ material: 'R1', sloc: 'D000', stockType: 'unrestricted', qty: 80 }, { material: 'R2', sloc: 'D000', stockType: 'unrestricted', qty: 11 }] }
  const result = buildCountDoc({ rows, approvals, doc })
  const by = material => result.rows.find(item => item.material === material)
  assert.deepEqual([by('R1').sapAtApproval, by('R1').diff, by('R1').sapToday, by('R1').docQty, by('R1').approved], [100, -3, 80, 77, true])
  assert.deepEqual([by('R2').approved, by('R2').diff, by('R2').sapToday, by('R2').docQty, by('R2').status], [false, null, 11, null, 'returned'])
  assert.deepEqual([by('R3').sapToday, by('R3').docQty], [0, -3], 'not in SAP today = 0; a negative quantity is shown, not hidden')
  assert.deepEqual(result.missingApproval, 1)
  assert.deepEqual(buildCountDoc({ rows, approvals, doc: null }).rows[0].sapToday, null, 'nothing fetched yet')
})
