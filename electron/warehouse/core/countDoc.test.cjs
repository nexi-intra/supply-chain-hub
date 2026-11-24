const test = require('node:test')
const assert = require('node:assert/strict')
const { docLinesFromSnapshot, missingAtApproval, linesAtApproval, buildCountDoc } = require('./countDoc.cjs')
const { buildSnapshot } = require('./snapshot.cjs')

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

test('the SAP stock of the day carries the serials of each serial-managed line; a serial without stock still gets a line', () => {
  const stock = (material, sloc, unrestricted, blocked = 0) => ({ material, description: material, plant: 'D301', sloc, unrestricted, blocked, valueUnrestricted: 0, valueBlocked: 0 })
  const serial = (serialNo, material, sloc, stockType = 'unrestricted') => ({ serial: serialNo, material, sloc, plant: 'D301', description: material, userStatus: '', stockType })
  const snapshot = buildSnapshot({
    team: 'TCD', scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['unrestricted'] }, rulesByTeam: {}, fetchedAt: 1, fetchedBy: 'x',
    mb52: [stock('INT4300-4921-0', 'D000', 2), stock('INT4300-4921-0', 'D006', 1), stock('R162-0717', 'D000', 80)],
    serials: [serial('N3', 'INT4300-4921-0', 'D000'), serial('N1', 'INT4300-4921-0', 'D000'), serial('N9', 'INT4300-4921-0', 'D006'), serial('B1', 'INT4300-4921-0', 'D000', 'blocked'), serial('U7', 'INT4300-4921-0-R', 'D000')],
  })
  assert.deepEqual(docLinesFromSnapshot(snapshot), [
    { material: 'INT4300-4921-0', sloc: 'D000', stockType: 'unrestricted', qty: 2, serials: ['N1', 'N3'] },
    { material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 80 },
    { material: 'INT4300-4921-0-R', sloc: 'D000', stockType: 'unrestricted', qty: 0, serials: ['U7'] },
  ], 'other locations and blocked stock stay out; no serials on a material without them')
})

test('serials missing at approval: the frozen list, or rebuilt from the scan times of an older approval', () => {
  const row = { material: 'INT1-0', sloc: 'D000', stockType: 'unrestricted' }
  const index = { serials: new Map([['N1', { ...row, inScope: true }], ['N2', { ...row, inScope: true }], ['N3', { ...row, inScope: true }], ['X1', { ...row, sloc: 'D006', inScope: false }]]) }
  const found = new Map([['N1', { at: 10 }], ['N3', { at: 50 }]])
  assert.deepEqual(missingAtApproval({ approval: { at: 20, frozen: [{ ...row, missingSerials: ['N2'] }] }, row, index, found }), ['N2'])
  assert.deepEqual(missingAtApproval({ approval: { at: 20, frozen: [{ sloc: 'D000', stockType: 'unrestricted' }] }, row, index, found }), ['N2', 'N3'], 'N3 was scanned after the approval')
})

test('serial-managed: the list of the day = SAP serials today minus the ones missing at approval; the list decides the quantity', () => {
  const row = (material, sapQty, counted, extra = {}) => ({ material, description: '', kind: 'new', sloc: 'D000', stockType: 'unrestricted', serialManaged: true, countedSerials: counted, sapQty, counted, diff: counted - sapQty, ...extra })
  const line = (material, serials, qty = serials.length) => ({ material, sloc: 'D000', stockType: 'unrestricted', qty, serials })
  const rows = [row('ZERO', 2, 2), row('DIFF', 3, 2), row('GONE', 3, 2), row('OPEN', 1, 0)]
  const approvals = { ZERO: { status: 'approved' }, DIFF: { status: 'approved' }, GONE: { status: 'posted' }, OPEN: { status: 'open' } }
  const missing = { ZERO: [], DIFF: ['D2'], GONE: ['G2'] }
  const doc = { fetchedAt: 9, withSerials: true, lines: [line('ZERO', ['Z1', 'Z3']), line('DIFF', ['D1', 'D2', 'D3', 'D4']), line('GONE', ['G1', 'G3']), line('OPEN', ['O1'])] }
  const result = buildCountDoc({ rows, approvals, doc, missingOf: item => missing[item.material] })
  const by = material => result.rows.find(item => item.material === material)
  assert.deepEqual([by('ZERO').docSerials, by('ZERO').docQty, by('ZERO').expectedQty], [['Z1', 'Z3'], 2, 2], 'zero difference = the live list of SAP')
  assert.deepEqual([by('DIFF').docSerials, by('DIFF').docQty, by('DIFF').expectedQty], [['D1', 'D3', 'D4'], 3, 3], 'a new terminal since approval is on the list, the missing one is not')
  assert.deepEqual([by('GONE').docSerials, by('GONE').docQty, by('GONE').expectedQty], [['G1', 'G3'], 2, 1], 'the missing one was booked out since: the list decides, the expected quantity shows the mismatch')
  assert.deepEqual([by('OPEN').docSerials, by('OPEN').docQty, by('OPEN').needsSerials], [null, null, false])
  assert.equal(result.withSerials, true)

  const old = buildCountDoc({ rows, approvals, doc: { ...doc, withSerials: undefined }, missingOf: item => missing[item.material] })
  assert.deepEqual([old.rows[0].needsSerials, old.rows[0].docQty, old.rows[0].docSerials, old.rows[0].sapToday], [true, null, null, 2], 'fetched before serials were included: fetch again')
})

test('quantity lines active at approval: saved at or before it and not deleted (or undone) before it', () => {
  const line = (id, at, material = 'INT1-0', lineId = `ln-${id}`) => ({ id, at, type: 'line', lineId, material, qty: 1 })
  const approvals = { 'INT1-0': { status: 'approved', at: 100 }, 'INT2-0': { status: 'posted', at: 100 }, 'INT3-0': { status: 'open', at: 100 }, R1: { status: 'approved', at: 100 } }
  const serialManaged = material => material !== 'R1'
  const check = events => [...linesAtApproval({ approvals, events, serialManaged })].sort()
  assert.deepEqual(check([line('a', 50), line('b', 50, 'INT2-0'), line('c', 50, 'INT3-0'), line('d', 50, 'R1')]), ['INT1-0', 'INT2-0'], 'only approved or posted serial-managed materials')
  assert.deepEqual(check([line('a', 100)]), ['INT1-0'], 'saved at the approval time counts')
  assert.deepEqual(check([line('a', 101)]), [], 'saved after the approval')
  assert.deepEqual(check([line('a', 50), { id: 'x', at: 90, type: 'line-delete', lineId: 'ln-a' }]), [], 'deleted before the approval')
  assert.deepEqual(check([line('a', 50), { id: 'x', at: 150, type: 'line-delete', lineId: 'ln-a' }]), ['INT1-0'], 'deleted after the approval: the frozen numbers still hold it')
  assert.deepEqual(check([line('a', 50), { id: 'u', at: 60, type: 'undo', target: 'a' }]), [], 'undone before the approval')
  assert.deepEqual(check([line('a', 50), { id: 'u', at: 150, type: 'undo', target: 'a' }]), ['INT1-0'], 'undone after the approval')
  assert.deepEqual(check([line('a', 50), { id: 'x', at: 60, type: 'line-delete', lineId: 'ln-a' }, { id: 'u', at: 70, type: 'undo', target: 'x' }]), ['INT1-0'], 'a deletion undone before the approval')
  assert.deepEqual(check([line('a', 50, 'INT1-0', 'ln-same'), line('b', 60, 'R1', 'ln-same')]), [], 'the line was changed to another material before the approval')
})

test('a serial-managed row approved with quantity lines gets no quantity and no serial list for the document', () => {
  const row = { material: 'INT1-0', description: '', kind: 'new', sloc: 'D000', stockType: 'unrestricted', serialManaged: true, countedSerials: 8, sapQty: 10, counted: 10, diff: 0 }
  const doc = { fetchedAt: 9, withSerials: true, lines: [{ material: 'INT1-0', sloc: 'D000', stockType: 'unrestricted', qty: 10, serials: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'] }] }
  const missingOf = () => ['S9', 'S10']
  const flagged = buildCountDoc({ rows: [row], approvals: { 'INT1-0': { status: 'approved' } }, doc, missingOf, withLinesAtApproval: item => item.material === 'INT1-0' }).rows[0]
  assert.deepEqual([flagged.docQty, flagged.docSerials, flagged.serialLinesAtApproval, flagged.expectedQty], [null, null, true, 10], 'never 8 serials for an approved 10')
  const clean = buildCountDoc({ rows: [row], approvals: { 'INT1-0': { status: 'approved' } }, doc, missingOf }).rows[0]
  assert.deepEqual([clean.docQty, clean.serialLinesAtApproval], [8, false])
  const unfetched = buildCountDoc({ rows: [row], approvals: { 'INT1-0': { status: 'approved' } }, doc: null, missingOf, withLinesAtApproval: () => true }).rows[0]
  assert.deepEqual([unfetched.docQty, unfetched.serialLinesAtApproval], [null, true], 'shown before the SAP figures of the day are fetched')
})

test('a serial missing at approval but found in another count of the status is marked on its row', () => {
  const row = { material: 'INT1-0', description: '', kind: 'new', sloc: 'D006', stockType: 'unrestricted', serialManaged: true, countedSerials: 1, sapQty: 3, counted: 1, diff: -2 }
  const line = { material: 'INT1-0', sloc: 'D006', stockType: 'unrestricted', qty: 3, serials: ['S1', 'S2', 'S3'] }
  const found = new Map([['S2', { countId: 'c1', countName: 'D000 terminaler', place: 'P14', by: 'anna@x', byName: 'Anna', at: 5, source: 'scan', document: '' }], ['S9', { countId: 'c1', countName: 'D000 terminaler', place: 'P1', by: 'anna@x', byName: 'Anna', at: 6, source: 'scan', document: '' }]])
  const missingOf = () => ['S2', 'S3']
  const build = (doc, approvals = { 'INT1-0': { status: 'approved' } }) => buildCountDoc({ rows: [row], approvals, doc, missingOf, foundElsewhere: found }).rows[0]
  const marked = build({ fetchedAt: 9, withSerials: true, lines: [line] })
  assert.deepEqual(marked.foundElsewhere, [{ serial: 'S2', countId: 'c1', countName: 'D000 terminaler', place: 'P14', byName: 'Anna', at: 5 }])
  assert.deepEqual(marked.docSerials, ['S1'], 'the list itself is unchanged: the mark is a warning')
  assert.deepEqual(build(null).foundElsewhere.map(item => item.serial), ['S2'], 'also before the SAP figures of the day are fetched')
  assert.deepEqual(build({ fetchedAt: 9, withSerials: true, lines: [{ ...line, serials: ['S1', 'S3'] }] }).foundElsewhere, [], 'moved in SAP since: nothing is written off here')
  assert.deepEqual(build({ fetchedAt: 9, withSerials: true, lines: [line] }, { 'INT1-0': { status: 'open' } }).foundElsewhere, [], 'not approved: nothing is frozen as missing')
  assert.deepEqual(buildCountDoc({ rows: [row], approvals: { 'INT1-0': { status: 'approved' } }, doc: null, missingOf }).rows[0].foundElsewhere, [], 'nothing found elsewhere')
})
