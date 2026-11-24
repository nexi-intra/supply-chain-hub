const test = require('node:test')
const assert = require('node:assert/strict')
const { findSapErrors, followUp, summarize, ERROR_TYPES, reportErrors, mergeWithReport, previousErrorsFor, scopeSlocs, teamOfSloc } = require('./sapCheck.cjs')

const stock = (material, sloc, unrestricted, blocked = 0, plant = 'D301') => ({ material, description: `${material} tekst`, plant, sloc, unrestricted, blocked })
const serial = (serialNo, material, sloc, stockType = 'unrestricted', plant = 'D301') => ({ serial: serialNo, material, description: material, plant, sloc, userStatus: '', stockType })
const many = (prefix, count, material, sloc, stockType) => Array.from({ length: count }, (_, i) => serial(`${prefix}${i}`, material, sloc, stockType))

test('finds the four kinds of SAP errors for the team storage locations only', () => {
  const mb52 = [
    stock('INT4100-4921-0', 'D000', 3, 0),          // A: 3 in stock, 4 serials
    stock('INT4300-4921-0-R', 'D005', 2, 0),        // C: stock, no serials there
    stock('INT4300-4921-0-R', 'D004', 1, 0),        // ok
    stock('R162-0717', 'D000', 100),                // not serial-managed: ignored
    stock('331-0194', 'D000', 5),                   // not INT/R: ignored
    stock('INT4100-4921-0', 'D001', 7),             // TRR storage location: ignored for TCD
    stock('INT4100-4921-0', 'D000', 9, 0, 'D302'),  // other plant: ignored
  ]
  const serials = [
    ...many('N', 4, 'INT4100-4921-0', 'D000', 'unrestricted'),
    serial('B1', 'INT4100-4921-0', 'D000', 'blocked'), // D: blocked serial, no blocked stock
    serial('U1', 'INT4300-4921-0-R', 'D004'),
    serial('U1', 'INT4300-4921-0-R', 'D001'),          // B: same serial in D004 and (TRR) D001
    serial('X1', '331-0194', 'D000'),
  ]
  const errors = findSapErrors({ slocs: ['D000', 'D004', 'D005'], mb52, serials })
  assert.deepEqual(errors.map(error => error.id), [
    'count-mismatch|INT4100-4921-0|D000|unrestricted',
    'duplicate-serial|U1',
    'stock-without-serials|INT4300-4921-0-R|D005|unrestricted',
    'serials-without-stock|INT4100-4921-0|D000|blocked',
  ])
  const [a, b, c, d] = errors
  assert.deepEqual([a.sapQty, a.serialCount, a.serials], [3, 4, []])
  assert.deepEqual(b.locations, [{ material: 'INT4300-4921-0-R', sloc: 'D004', stockType: 'unrestricted' }, { material: 'INT4300-4921-0-R', sloc: 'D001', stockType: 'unrestricted' }])
  assert.deepEqual([b.material, b.sloc, b.serials], ['INT4300-4921-0-R', 'D004', ['U1']])
  assert.deepEqual([c.sapQty, c.serialCount], [2, 0])
  assert.deepEqual([d.sapQty, d.serialCount, d.serials, d.description], [0, 1, ['B1'], 'INT4100-4921-0 tekst'])
  assert.deepEqual(Object.keys(ERROR_TYPES), ['count-mismatch', 'duplicate-serial', 'stock-without-serials', 'serials-without-stock'])
})

test('a duplicate only outside the team storage locations is not the team error', () => {
  const errors = findSapErrors({ slocs: ['D000'], mb52: [], serials: [serial('Z', 'INT1-0', 'D001'), serial('Z', 'INT1-0', 'D002')] })
  assert.deepEqual(errors, [])
})

test('scope: TCD, TRR or the whole of D301; every storage location belongs to one team', () => {
  assert.deepEqual(scopeSlocs('TRR'), ['D001', 'D002', 'D003'])
  assert.equal(scopeSlocs('D301').length, 12)
  assert.throws(() => scopeSlocs('X'), { code: 'SAP_CHECK_SCOPE_INVALID' })
  assert.deepEqual([teamOfSloc('D004'), teamOfSloc('D002'), teamOfSloc('D999')], ['TCD', 'TRR', null])
})

test('ZMS_STOCK_SER_CHK2 rows become errors of the same kinds, in the chosen storage locations only', () => {
  const row = (material, sloc, unrestricted, serialsUnrestricted, blocked = 0, serialsBlocked = 0) => ({ material, plant: 'D301', sloc, unrestricted, serialsUnrestricted, blocked, serialsBlocked })
  const errors = reportErrors([row('A1', 'D000', 5, 4, 2, 0), row('A2', 'D000', 0, 3), row('A3', 'D001', 1, 2), row('A4', 'D000', 7, 7)], ['D000'])
  assert.deepEqual(errors.map(error => `${error.id}:${error.sapQty}/${error.serialCount}`), [
    'count-mismatch|A1|D000|unrestricted:5/4',
    'stock-without-serials|A1|D000|blocked:2/0',
    'serials-without-stock|A2|D000|unrestricted:0/3',
  ])
})

test('CountPoint and SAP\'s own report are merged: found by both, only by CountPoint, or only by the SAP report', () => {
  const ours = [
    { id: 'count-mismatch|M1|D000|unrestricted', type: 'count-mismatch', material: 'M1', description: 'Terminal', sloc: 'D000', stockType: 'unrestricted', sapQty: 3, serialCount: 4, serials: [], locations: [] },
    { id: 'count-mismatch|M2|D004|unrestricted', type: 'count-mismatch', material: 'M2', description: '', sloc: 'D004', stockType: 'unrestricted', sapQty: 1, serialCount: 2, serials: [], locations: [] },
    { id: 'duplicate-serial|S1', type: 'duplicate-serial', material: 'M3', description: '', sloc: 'D000', stockType: 'unrestricted', sapQty: null, serialCount: 2, serials: ['S1'], locations: [] },
  ]
  const report = [
    { material: 'M1', plant: 'D301', sloc: 'D000', unrestricted: 3, serialsUnrestricted: 4, blocked: 0, serialsBlocked: 0 },
    { material: 'M9', plant: 'D301', sloc: 'D005', unrestricted: 5, serialsUnrestricted: 4, blocked: 0, serialsBlocked: 0 },
  ]
  const merged = mergeWithReport(ours, report, ['D000', 'D004', 'D005'])
  assert.deepEqual(merged.errors.map(error => `${error.material}:${error.source}`), ['M1:both', 'M2:countpoint', 'M9:sap-report', 'M3:countpoint'])
  assert.deepEqual(merged.comparison, { ran: true, error: null, rows: 2, both: 1, onlyCountPoint: 1, onlyReport: 1 }, 'duplicates are not part of the SAP report')
  const failed = mergeWithReport(ours, null, ['D000'], 'SAP-rapporten fejlede')
  assert.deepEqual([failed.errors.every(error => error.source === 'countpoint'), failed.comparison.ran, failed.comparison.error], [true, false, 'SAP-rapporten fejlede'])
})

test('follow-up per storage location: each location is compared with the newest check that covered it', () => {
  const error = (material, sloc) => ({ id: `count-mismatch|${material}|${sloc}|unrestricted`, type: 'count-mismatch', material, sloc, stockType: 'unrestricted', firstSeen: 1 })
  const checks = [
    { slocs: ['D001', 'D002', 'D003'], errors: [error('T1', 'D002')] },
    { slocs: ['D000', 'D001'], errors: [error('X1', 'D000'), error('X2', 'D001')] },
  ]
  assert.deepEqual(previousErrorsFor(checks, ['D000', 'D001', 'D002']).map(item => item.material).sort(), ['T1', 'X1'], 'D001 comes from the newest check that covered it (no errors there any more)')
})

test('follow-up: new, still open (first seen kept) and fixed since the previous check', () => {
  const error = (id, extra = {}) => ({ id, type: 'count-mismatch', material: id, description: '', sloc: 'D000', stockType: 'unrestricted', sapQty: 1, serialCount: 2, serials: [], locations: [], ...extra })
  const previous = [{ ...error('A'), status: 'new', firstSeen: 100 }, { ...error('B'), status: 'open', firstSeen: 50 }]
  const result = followUp(previous, [error('A'), error('C')], 200)
  assert.deepEqual(result.errors.map(item => `${item.id}:${item.status}:${item.firstSeen}`), ['A:open:100', 'C:new:200'])
  assert.deepEqual(result.fixed.map(item => `${item.id}:${item.firstSeen}`), ['B:50'])
  assert.deepEqual(followUp(null, [error('A')], 300).errors[0].status, 'new')
  assert.deepEqual(summarize(result), {
    total: 2, new: 1, open: 1, fixed: 1,
    byType: { 'count-mismatch': 2, 'duplicate-serial': 0, 'stock-without-serials': 0, 'serials-without-stock': 0 },
  })
})
