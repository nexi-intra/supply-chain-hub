const test = require('node:test')
const assert = require('node:assert/strict')
const { buildSnapshot, indexSnapshot } = require('./snapshot.cjs')
const { storageRulesFor } = require('./classify.cjs')
const { normalizeSerial, matchSerial, aggregateCount, buildCountLists, computeProgress, applyApprovals } = require('./countState.cjs')

const rulesByTeam = { TCD: storageRulesFor('TCD', {}), TRR: storageRulesFor('TRR', {}) }
const stock = (material, sloc, unrestricted, blocked = 0, valueUnrestricted = 0, valueBlocked = 0) => ({ material, description: `${material} tekst`, plant: 'D301', sloc, unrestricted, blocked, valueUnrestricted, valueBlocked })
const serial = (serialNo, material, sloc, stockType = 'unrestricted') => ({ serial: serialNo, material, sloc, plant: 'D301', description: material, userStatus: '', stockType })
const snapshot = buildSnapshot({
  team: 'TCD',
  scope: { type: 'slocs', slocs: ['D000', 'D004'] },
  rulesByTeam,
  fetchedAt: 1,
  fetchedBy: 'anna@example.test',
  mb52: [
    stock('INT4300-4921-0', 'D000', 2, 1, 2000, 1000),
    stock('INT4300-4921-0-R', 'D000', 1),
    stock('INT4300-4921-0-R', 'D004', 2),
    stock('INT4300-4921-0-R', 'D001', 1),
    stock('R162-0717', 'D000', 100, 10, 500, 50),
    stock('R162-0800', 'D000', 5, 0, 50),
  ],
  serials: [
    serial('N1', 'INT4300-4921-0', 'D000'), serial('N2', 'INT4300-4921-0', 'D000'), serial('N3', 'INT4300-4921-0', 'D000', 'blocked'),
    serial('U1', 'INT4300-4921-0-R', 'D000'), serial('U2', 'INT4300-4921-0-R', 'D004'), serial('U3', 'INT4300-4921-0-R', 'D004'),
    serial('X1', 'INT4300-4921-0-R', 'D001'),
  ],
})
const index = indexSnapshot(snapshot)
let ids = 0
const scan = (serialNo, by = 'anna@example.test', at = ++ids, place = 'A1.1') => ({ id: `s${at}`, type: 'scan', serial: serialNo, place, by, byName: by.split('@')[0], at })
const line = (lineId, fields, by = 'anna@example.test', at = ++ids) => ({ id: `l${at}`, type: 'line', lineId, by, byName: by.split('@')[0], at, ...fields })

test('serials are normalised: trimmed, upper case, no inner spaces, scanner noise removed', () => {
  assert.equal(normalizeSerial('  n1 \r'), 'N1')
  assert.equal(normalizeSerial('ab 12-3'), 'AB12-3')
  assert.equal(normalizeSerial(''), '')
  assert.equal(normalizeSerial('x'.repeat(41)), '')
  assert.equal(normalizeSerial('bad<script>'), '')
})

test('scan outcomes follow the rules of the design', () => {
  const found = new Map([['N2', { by: 'bo@example.test', byName: 'bo', at: 5, place: 'B1' }]])
  assert.deepEqual(pick(matchSerial('N1', index, found)), { outcome: 'found', blocked: false, move: false, material: 'INT4300-4921-0', sloc: 'D000' })
  assert.deepEqual(pick(matchSerial('N3', index, found)), { outcome: 'found', blocked: true, move: false, material: 'INT4300-4921-0', sloc: 'D000' })
  const moved = matchSerial('U1', index, found)
  assert.equal(moved.move, true)
  assert.deepEqual(moved.suggestions, ['D004', 'D005'])
  const duplicate = matchSerial('n2', index, found)
  assert.equal(duplicate.outcome, 'duplicate')
  assert.equal(duplicate.previous.byName, 'bo')
  assert.deepEqual(pick(matchSerial('X1', index, found)), { outcome: 'other-sloc', blocked: false, move: true, material: 'INT4300-4921-0-R', sloc: 'D001' })
  assert.equal(matchSerial('ZZZ', index, found).outcome, 'unknown')
  assert.equal(matchSerial('', index, found).outcome, 'invalid')
})

function pick(result) {
  return { outcome: result.outcome, blocked: result.blocked, move: result.move, material: result.material, sloc: result.sloc }
}

test('a removed serial is not found any more; scanning it again later counts it again; undoing the removal restores it', () => {
  const remove = (serialNo, at = ++ids) => ({ id: `r${at}`, type: 'serial-remove', serial: serialNo, by: 'anna@example.test', byName: 'anna', at })
  const imported = { id: `i${++ids}`, type: 'import', serials: ['N2', 'U2'], place: 'P1', by: 'bo@example.test', byName: 'bo', at: ids }
  const first = scan('N1')
  const twice = scan('N1', 'bo@example.test')
  const removal = remove('n1')
  const importRemoval = remove('U2')
  let result = aggregateCount({ snapshot, index, events: [first, twice, imported, removal, importRemoval] })
  assert.equal(result.found.has('N1'), false)
  assert.equal(result.found.has('U2'), false)
  assert.equal(result.found.has('N2'), true, 'only the removed serial of an import goes')
  assert.equal(result.duplicates.length, 0, 'the duplicate scan of a removed serial goes too')
  assert.equal(result.serials.missing.some(item => item.serial === 'N1'), true)

  result = aggregateCount({ snapshot, index, events: [first, removal, scan('N1', 'bo@example.test')] })
  assert.equal(result.found.get('N1').by, 'bo@example.test', 'scanned again after the removal')

  result = aggregateCount({ snapshot, index, events: [first, removal, { id: `u${++ids}`, type: 'undo', target: removal.id, by: 'anna@example.test', at: ids }] })
  assert.equal(result.found.get('N1').by, 'anna@example.test')
})

test('material scope: a known serial of another material in a counted location is outside the count', () => {
  const materialSnapshot = buildSnapshot({ team: 'TCD', scope: { type: 'materials', materials: ['INT4300-4921-0'] }, rulesByTeam, fetchedAt: 1, fetchedBy: 'x', mb52: snapshot.materials.length ? [stock('INT4300-4921-0', 'D000', 2), stock('INT4300-4921-0-R', 'D004', 2)] : [], serials: [serial('N1', 'INT4300-4921-0', 'D000'), serial('U2', 'INT4300-4921-0-R', 'D004')] })
  assert.equal(matchSerial('U2', indexSnapshot(materialSnapshot), new Map()).outcome, 'outside')
})

test('stock type: a serial of the other stock type is counted in the other count of the status', () => {
  const blocked = buildSnapshot({ team: 'TCD', scope: { type: 'slocs', slocs: ['D000'], stockTypes: ['blocked'] }, rulesByTeam, fetchedAt: 1, fetchedBy: 'x', mb52: [stock('INT4300-4921-0', 'D000', 2, 1, 2000, 1000), stock('R162-0717', 'D000', 100, 10, 500, 50)], serials: [serial('N1', 'INT4300-4921-0', 'D000'), serial('N3', 'INT4300-4921-0', 'D000', 'blocked')] })
  const blockedIndex = indexSnapshot(blocked)
  assert.equal(matchSerial('N1', blockedIndex, new Map()).outcome, 'outside')
  blockedIndex.others = [{ id: 'c2', name: 'D000 fri', scope: { type: 'slocs', slocs: ['D000'], materials: [], stockTypes: ['unrestricted'] } }]
  const elsewhere = matchSerial('N1', blockedIndex, new Map())
  assert.equal(elsewhere.outcome, 'other-count')
  assert.equal(elsewhere.otherCount, 'D000 fri')
  assert.equal(matchSerial('N3', blockedIndex, new Map()).outcome, 'found')
  const result = aggregateCount({ snapshot: blocked, index: blockedIndex, events: [scan('N1'), scan('N3')] })
  assert.deepEqual(result.rows.map(row => `${row.material}:${row.stockType}:${row.sapQty}:${row.counted}`), ['INT4300-4921-0:blocked:1:1', 'R162-0717:blocked:10:0'])
  assert.deepEqual(result.serials.extra.map(item => `${item.serial}:${item.outcome}:${item.otherCount}`), ['N1:other-count:D000 fri'])
  assert.equal(result.moves.length, 0)
})

test('approved materials keep the numbers frozen at approval; counting afterwards is shown apart', () => {
  const row = (material, sapQty, counted, unitPrice) => ({ material, description: material, kind: 'accessory', sloc: 'D000', stockType: 'unrestricted', serialManaged: false, unitPrice, sapQty, sapSerials: 0, countedSerials: 0, countedLines: counted, counted, diff: counted - sapQty, valueDiff: (counted - sapQty) * unitPrice, misplaced: false, suggestions: [], sapMismatch: false })
  const aggregate = { rows: [row('R1', 120, 119, 5), row('R2', 10, 10, 1)], totals: {}, lines: [] }
  const approvals = {
    R1: { status: 'posted', at: 50, frozen: [{ sloc: 'D000', stockType: 'unrestricted', sapQty: 100, counted: 97, diff: -3, valueDiff: -15 }] },
    R2: { status: 'returned', frozen: [{ sloc: 'D000', stockType: 'unrestricted', sapQty: 1, counted: 1, diff: 0, valueDiff: 0 }] },
  }
  const result = applyApprovals(aggregate, approvals)
  const r1 = result.rows.find(item => item.material === 'R1')
  assert.deepEqual([r1.sapQty, r1.counted, r1.diff, r1.valueDiff, r1.frozenAt, r1.countedAfter], [100, 97, -3, -15, 50, 22])
  assert.deepEqual(result.rows.find(item => item.material === 'R2').sapQty, 10, 'only approved or posted materials are frozen')
  assert.deepEqual(result.totals.accessory.unrestricted, { sapQty: 110, counted: 107, diff: -3, valueDiff: -15 })
  assert.equal(aggregate.rows[0].sapQty, 120, 'the live aggregate is not changed')
})

test('aggregate: serials and count lines become counted quantities per material, location and stock type', () => {
  const events = [
    scan('N1'), scan('N3'), scan('N1', 'bo@example.test'), scan('U2'), scan('X1'), scan('ZZZ'),
    line('L1', { place: 'A1.1', material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 60, status: 'counted' }),
    line('L2', { place: 'A1.2', material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 30, status: 'counted' }),
    line('L2', { place: 'A1.2', material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 35, status: 'counted' }),
    line('L3', { place: 'WS4', material: 'R162-0717', sloc: 'D000', stockType: 'blocked', qty: 10, status: 'counted' }),
    line('L4', { place: 'WS4', material: 'R999-0001', sloc: 'D000', stockType: 'unrestricted', qty: 2, status: 'counted' }),
  ]
  const result = aggregateCount({ snapshot, index, events })
  const row = (material, sloc, stockType) => result.rows.find(item => item.material === material && item.sloc === sloc && item.stockType === stockType)
  assert.deepEqual(only(row('INT4300-4921-0', 'D000', 'unrestricted')), { sapQty: 2, sapSerials: 2, counted: 1, diff: -1, unitPrice: 1000, valueDiff: -1000 })
  assert.deepEqual(only(row('INT4300-4921-0', 'D000', 'blocked')), { sapQty: 1, sapSerials: 1, counted: 1, diff: 0, unitPrice: 1000, valueDiff: 0 })
  assert.deepEqual(only(row('INT4300-4921-0-R', 'D004', 'unrestricted')), { sapQty: 2, sapSerials: 2, counted: 1, diff: -1, unitPrice: 0, valueDiff: 0 })
  assert.deepEqual(only(row('R162-0717', 'D000', 'unrestricted')), { sapQty: 100, sapSerials: 0, counted: 95, diff: -5, unitPrice: 5, valueDiff: -25 })
  assert.deepEqual(only(row('R162-0717', 'D000', 'blocked')), { sapQty: 10, sapSerials: 0, counted: 10, diff: 0, unitPrice: 5, valueDiff: 0 })
  assert.deepEqual(only(row('R162-0800', 'D000', 'unrestricted')), { sapQty: 5, sapSerials: 0, counted: 0, diff: -5, unitPrice: 10, valueDiff: -50 })
  const extra = row('R999-0001', 'D000', 'unrestricted')
  assert.equal(extra.sapQty, 0)
  assert.equal(extra.counted, 2)
  assert.equal(extra.unitPrice, null)
  assert.equal(result.serials.found, 3)
  assert.equal(result.serials.expected, 6)
  assert.deepEqual(result.serials.missing.map(item => item.serial).sort(), ['N2', 'U1', 'U3'])
  assert.deepEqual(result.serials.extra.map(item => `${item.serial}:${item.outcome}`).sort(), ['X1:other-sloc', 'ZZZ:unknown'])
  assert.equal(result.duplicates.length, 1)
  assert.equal(result.duplicates[0].byName, 'bo')
  assert.deepEqual(result.moves.map(item => `${item.serial || item.material}@${item.sloc}`), ['X1@D001'])
})

function only(row) {
  return { sapQty: row.sapQty, sapSerials: row.sapSerials, counted: row.counted, diff: row.diff, unitPrice: row.unitPrice, valueDiff: row.valueDiff }
}

test('undo removes a scan, a line or a whole import; deleting a line removes it', () => {
  const events = [
    scan('N1'),
    { id: 'imp1', type: 'import', importId: 'imp1', place: 'Palle 14.2', serials: ['N2', 'U2', 'U3'], by: 'anna@example.test', byName: 'anna', at: ++ids },
    line('L1', { place: 'A1.1', material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 60, status: 'counted' }),
    line('L2', { place: 'A1.2', material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 7, status: 'counted' }),
  ]
  const before = aggregateCount({ snapshot, index, events })
  assert.equal(before.serials.found, 4)
  const after = aggregateCount({ snapshot, index, events: [...events,
    { id: 'u1', type: 'undo', target: events[0].id, by: 'anna@example.test', at: ++ids },
    { id: 'u2', type: 'undo', target: 'imp1', by: 'anna@example.test', at: ++ids },
    { id: 'd1', type: 'line-delete', lineId: 'L2', by: 'anna@example.test', at: ++ids },
  ] })
  assert.equal(after.serials.found, 0)
  assert.equal(after.rows.find(item => item.material === 'R162-0717' && item.stockType === 'unrestricted').counted, 60)
  assert.equal(after.lines.length, 1)
})

test('misplaced stock counted on lines lands on the move list', () => {
  const result = aggregateCount({ snapshot, index, events: [scan('U1')] })
  assert.deepEqual(result.moves.map(item => ({ serial: item.serial, sloc: item.sloc, suggestions: item.suggestions })), [{ serial: 'U1', sloc: 'D000', suggestions: ['D004', 'D005'] }])
})

test('count lists come from the placement sheet: only in-scope materials without serial numbers', () => {
  const placements = [
    { placement: 'A1.1', area: 'A', material: 'R162-0717', quantity: 50 },
    { placement: 'A1.2', area: 'A', material: 'INT4300-4921-0', quantity: 2 },
    { placement: 'B2.1', area: 'B', material: '331-0194', quantity: 9 },
    { placement: 'B2.2', area: 'B', material: 'R162-0800', quantity: 5 },
  ]
  const lists = buildCountLists({ snapshot, index, placements })
  assert.deepEqual(lists.map(item => `${item.area}:${item.place}:${item.material}:${item.sloc}`), ['A:A1.1:R162-0717:D000', 'B:B2.2:R162-0800:D000'])
  assert.match(lists[0].lineId, /^pl-[a-f0-9]{12}$/)
})

test('progress: overall, terminals, accessories, per area and per counter', () => {
  const placements = [{ placement: 'A1.1', area: 'A', material: 'R162-0717', quantity: 50 }, { placement: 'B2.2', area: 'B', material: 'R162-0800', quantity: 5 }]
  const countLists = buildCountLists({ snapshot, index, placements })
  const events = [
    scan('N1', 'anna@example.test', 1000), scan('U2', 'bo@example.test', 2000),
    line(countLists[0].lineId, { place: 'A1.1', area: 'A', material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 50, status: 'counted' }, 'bo@example.test', 3000),
  ]
  const aggregate = aggregateCount({ snapshot, index, events, countLists })
  const progress = computeProgress({ snapshot, aggregate, countLists, events, approvals: { 'R162-0717': { status: 'approved' } }, now: 3600 * 1000 })
  assert.equal(progress.terminals.new.unrestricted.found, 1)
  assert.equal(progress.terminals.new.unrestricted.expected, 2)
  assert.equal(progress.terminals.used.unrestricted.found, 1)
  assert.equal(progress.terminals.used.unrestricted.expected, 3)
  assert.deepEqual(progress.accessory.lines, { counted: 1, total: 2 })
  assert.equal(progress.overall.reached, 3)
  assert.equal(progress.overall.total, 8)
  assert.equal(progress.overall.percent, 38)
  assert.deepEqual(progress.areas.find(item => item.area === 'A'), { area: 'A', counted: 1, total: 1 })
  assert.equal(progress.counters.find(item => item.email === 'bo@example.test').events, 2)
  assert.equal(progress.materials.approved, 1)
  assert.ok(progress.materials.total >= 4)
})
