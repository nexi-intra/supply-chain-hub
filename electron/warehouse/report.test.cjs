const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ExcelJS = require('exceljs')
const { buildSnapshot, indexSnapshot } = require('./core/snapshot.cjs')
const { storageRulesFor } = require('./core/classify.cjs')
const { aggregateCount, computeProgress } = require('./core/countState.cjs')
const { writeReport, reportFileName, writeStatusReport, writeSapCheckReport } = require('./report.cjs')

const rulesByTeam = { TCD: storageRulesFor('TCD', {}), TRR: storageRulesFor('TRR', {}) }
const stock = (material, sloc, unrestricted, blocked = 0, valueUnrestricted = 0, valueBlocked = 0) => ({ material, description: `${material} tekst`, plant: 'D301', sloc, unrestricted, blocked, valueUnrestricted, valueBlocked })
const serial = (serialNo, material, sloc, stockType = 'unrestricted') => ({ serial: serialNo, material, sloc, plant: 'D301', description: material, userStatus: '', stockType })

function reportData() {
  const snapshot = buildSnapshot({
    team: 'TCD', scope: { type: 'slocs', slocs: ['D000'] }, rulesByTeam, fetchedAt: Date.UTC(2026, 9, 15, 8, 0), fetchedBy: 'anna@example.test',
    mb52: [stock('INT4300-4921-0', 'D000', 2, 1, 2000, 1000), stock('INT4300-4921-0-R', 'D000', 1), stock('R162-0717', 'D000', 100, 0, 500)],
    serials: [serial('N1', 'INT4300-4921-0', 'D000'), serial('N2', 'INT4300-4921-0', 'D000'), serial('N3', 'INT4300-4921-0', 'D000', 'blocked'), serial('U1', 'INT4300-4921-0-R', 'D000'), serial('X1', 'INT4300-4921-0-R', 'D001')],
  })
  const index = indexSnapshot(snapshot)
  const events = [
    { id: 'e1', type: 'scan', serial: 'N1', place: 'A1.1', by: 'anna@example.test', byName: 'Anna', at: 1 },
    { id: 'e2', type: 'scan', serial: 'U1', place: 'A1.2', by: 'anna@example.test', byName: 'Anna', at: 2 },
    { id: 'e3', type: 'scan', serial: 'X1', place: 'A1.2', by: 'anna@example.test', byName: 'Anna', at: 3 },
    { id: 'e4', type: 'line', lineId: 'L1', place: 'A1.1', area: 'A', material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 97, status: 'counted', comment: '=HYPERLINK("x")', by: 'bo@example.test', byName: 'Bo', at: 4 },
  ]
  const aggregate = aggregateCount({ snapshot, index, events })
  const approvals = { 'R162-0717': { status: 'posted', by: { name: 'Mona' }, at: 10, postedBy: { name: 'Mona' }, postedAt: 20 } }
  return {
    meta: { id: 'count1abc', team: 'TCD', name: 'Status D000 / uge 42', scope: snapshot.scope, status: 'closed', owner: { email: 'anna@example.test', name: 'Anna' }, createdAt: 0, fetchedAt: snapshot.fetchedAt, closedAt: Date.UTC(2026, 9, 16, 12, 0), closedBy: { name: 'Anna' } },
    snapshot, aggregate, approvals,
    members: { 'anna@example.test': { name: 'Anna', role: 'owner', status: 'approved' }, 'bo@example.test': { name: 'Bo', role: 'participant', status: 'approved' } },
    progress: computeProgress({ snapshot, aggregate, events, approvals, now: 100 }),
  }
}

test('the final status report sums every count, keeps free and blocked stock apart and lists the history', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-status-report-'))
  const first = reportData()
  const second = { ...reportData(), meta: { ...first.meta, id: 'count2abc', name: 'D000 spærret' } }
  const mona = { email: 'mona@example.test', name: 'Mona' }
  const status = { id: 'st1abc', team: 'TCD', name: 'Status Q4 2026', state: 'locked', startedBy: mona, startedAt: Date.UTC(2026, 9, 1), lockedBy: mona, lockedAt: Date.UTC(2026, 9, 16), history: [{ at: Date.UTC(2026, 9, 1), by: mona, action: 'started' }, { at: Date.UTC(2026, 9, 10), by: mona, action: 'unlocked', reason: 'Rettelse af R162' }, { at: Date.UTC(2026, 9, 16), by: mona, action: 'locked' }] }
  const file = await writeStatusReport({ status, version: 2, counts: [first, second] }, dir, new Date(2026, 9, 16, 9, 5))
  assert.equal(path.basename(file), 'Status Q4 2026 endelig v2 2026-10-16 0905.xlsx')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumé', 'Differencer', 'Serienumre', 'Skal flyttes', 'Historik'])

  const values = sheet => { const rows = []; sheet.eachRow(row => rows.push(row.values.slice(1))); return rows }
  const summary = values(workbook.getWorksheet('Resumé'))
  assert.ok(summary.some(row => row[0] === 'Version' && row[1] === 2))
  assert.ok(summary.some(row => row[0] === 'D000 spærret'))
  assert.deepEqual(summary.find(row => row[0] === 'I alt').slice(6, 11), [-8, -2030, -2, -2000, -4030], 'free and blocked differences apart, then the total')

  const differences = values(workbook.getWorksheet('Differencer'))
  assert.equal(differences[0][0], 'Optælling')
  assert.equal(differences.length - 1, 6)
  assert.deepEqual(differences.slice(1).map(row => row[5]), ['Unblocked', 'Unblocked', 'Unblocked', 'Unblocked', 'Blocked', 'Blocked'])
  assert.equal(values(workbook.getWorksheet('Serienumre')).length - 1, 6)
  assert.equal(values(workbook.getWorksheet('Skal flyttes')).length - 1, 4)
  const history = values(workbook.getWorksheet('Historik'))
  assert.deepEqual(history.slice(1).map(row => `${row[1]}:${row[2]}:${row[3] ?? ''}`), ['Startet:Mona:', 'Låst op:Mona:Rettelse af R162', 'Godkendt og låst:Mona:'])
})

test('the SAP error file for the SAP team has the errors, their serial numbers and what was fixed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-sapcheck-report-'))
  const errors = [
    { id: 'a', type: 'count-mismatch', status: 'open', firstSeen: Date.UTC(2026, 9, 1), material: 'INT1-0', description: 'Terminal', sloc: 'D000', stockType: 'unrestricted', sapQty: 3303, serialCount: 3304, serials: [], locations: [] },
    { id: 'b', type: 'duplicate-serial', status: 'new', firstSeen: Date.UTC(2026, 9, 19), material: 'INT1-0-R', description: 'Brugt', sloc: 'D004', stockType: 'unrestricted', sapQty: null, serialCount: 2, serials: ['U1'], locations: [{ material: 'INT1-0-R', sloc: 'D004', stockType: 'unrestricted' }, { material: 'INT1-0-R', sloc: 'D001', stockType: 'blocked' }] },
  ]
  const check = { at: Date.UTC(2026, 9, 19, 8), by: { name: 'Mona' }, slocs: ['D000', 'D004'], fixed: [{ id: 'c', type: 'stock-without-serials', material: 'INT2-0', description: '', sloc: 'D005', stockType: 'unrestricted', firstSeen: Date.UTC(2026, 9, 1) }] }
  const file = await writeSapCheckReport({ team: 'TCD', check, errors, mode: 'all' }, dir, new Date(2026, 9, 19, 10, 15))
  assert.equal(path.basename(file), 'SAP-fejl TCD 2026-10-19 1015.xlsx')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumé', 'Fejl', 'Serienumre', 'Rettet siden sidst'])
  const values = sheet => { const rows = []; sheet.eachRow(row => rows.push(row.values.slice(1))); return rows }
  const rows = values(workbook.getWorksheet('Fejl'))
  assert.deepEqual(rows[1].slice(0, 2), ['Antal passer ikke', 'Stadig ikke rettet'])
  assert.deepEqual(rows[1].slice(7, 10), [3303, 3304, 1])
  assert.equal(rows[2][10], 'INT1-0-R D001 Blocked')
  assert.deepEqual(rows[1].slice(11, 13), ['TCD', ''])
  assert.deepEqual(values(workbook.getWorksheet('Serienumre'))[1].slice(0, 2), ['Serienummer flere steder', 'U1'])
  assert.equal(values(workbook.getWorksheet('Rettet siden sidst'))[1][1], 'INT2-0')

  const english = await writeSapCheckReport({ team: 'TCD', check, errors, mode: 'new', language: 'en' }, dir, new Date(2026, 9, 19, 10, 15))
  assert.equal(path.basename(english), 'SAP errors TCD 2026-10-19 1015.xlsx')
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(english)
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ['Summary', 'Errors', 'Serial numbers', 'Fixed since last check'])
  assert.deepEqual(values(book.getWorksheet('Errors'))[1].slice(0, 2), ['Quantity does not match', 'Still not fixed'])
  assert.ok(values(book.getWorksheet('Summary')).some(row => row[0] === 'In this file' && row[1] === 'Only new errors'))
})

test('report file names are safe and dated', () => {
  assert.equal(reportFileName({ name: 'Status D000 / uge 42' }, new Date(2026, 9, 16, 9, 5)), 'Status D000 - uge 42 2026-10-16 0905.xlsx')
  assert.equal(reportFileName({ name: '..\\..\\x:y*?' }, new Date(2026, 0, 1, 0, 0)), 'x-y 2026-01-01 0000.xlsx')
})

test('the Excel report has summary, differences, serial numbers, move list and count lines', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-report-'))
  const file = await writeReport(reportData(), dir, new Date(2026, 9, 16, 9, 5))
  assert.equal(path.dirname(file), dir)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumé', 'Differencer', 'Alle materialer', 'Serienumre', 'Skal flyttes', 'Tællelinjer'])

  const values = sheet => { const rows = []; sheet.eachRow(row => rows.push(row.values.slice(1))); return rows }
  const summary = values(workbook.getWorksheet('Resumé'))
  assert.ok(summary.some(row => row[0] === 'Optælling' && row[1] === 'Status D000 / uge 42'))
  const totalRow = summary.find(row => row[0] === 'I alt')
  assert.deepEqual(totalRow.slice(2, 6), [104, 99, -5, -2015])

  const differences = values(workbook.getWorksheet('Differencer'))
  assert.deepEqual(differences[0].slice(0, 10), ['Materiale', 'Beskrivelse', 'Gruppe', 'Storage location', 'Lagertype', 'SAP antal', 'Talt', 'Difference', 'Enhedspris (DKK)', 'Værdidifference (DKK)'])
  assert.deepEqual(differences[1].slice(0, 10), ['INT4300-4921-0', 'INT4300-4921-0 tekst', 'Nye terminaler', 'D000', 'Unblocked', 2, 1, -1, 1000, -1000], 'largest value difference first')
  const r162 = differences.find(row => row[0] === 'R162-0717')
  assert.equal(r162[10], 'Bogført i SAP')

  const serials = values(workbook.getWorksheet('Serienumre'))
  assert.deepEqual(serials.slice(1).map(row => `${row[0]}:${row[5]}`).sort(), ['N2:Mangler', 'N3:Mangler', 'X1:Anden storage location'])
  const moves = values(workbook.getWorksheet('Skal flyttes'))
  assert.deepEqual(moves.slice(1).map(row => `${row[1]}:${row[3]}:${row[5] ?? ''}`).sort(), ['U1:D000:D004, D005', 'X1:D001:'])
  const lines = values(workbook.getWorksheet('Tællelinjer'))
  assert.equal(lines[1][7], '=HYPERLINK("x")', 'text stays text')
  const commentCell = workbook.getWorksheet('Tællelinjer').getRow(2).getCell(8)
  assert.equal(commentCell.formula, undefined)
})

test('in English the count report and the final status report have English sheets, headings and labels – no Danish text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-report-en-'))
  const data = reportData()
  const mona = { email: 'mona@example.test', name: 'Mona' }
  const status = { id: 'st1abc', team: 'TCD', name: 'Status Q4 2026', state: 'locked', startedBy: mona, startedAt: 1, lockedBy: mona, lockedAt: 2, history: [{ at: 1, by: mona, action: 'started' }, { at: 2, by: mona, action: 'locked' }] }
  const countFile = await writeReport({ ...data, meta: { ...data.meta, name: 'D000 week 42' }, language: 'en' }, dir, new Date(2026, 9, 16, 9, 5))
  const statusFile = await writeStatusReport({ status, version: 1, counts: [{ ...data, meta: { ...data.meta, name: 'D000 week 42' } }], language: 'en' }, dir, new Date(2026, 9, 16, 9, 6))
  assert.equal(path.basename(statusFile), 'Status Q4 2026 final v1 2026-10-16 0906.xlsx')

  const read = async file => { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file); return workbook }
  const count = await read(countFile)
  const final = await read(statusFile)
  assert.deepEqual(count.worksheets.map(sheet => sheet.name), ['Summary', 'Differences', 'All materials', 'Serial numbers', 'Must be moved', 'Count lines'])
  assert.deepEqual(final.worksheets.map(sheet => sheet.name), ['Summary', 'Differences', 'Serial numbers', 'Must be moved', 'Status history'], 'Excel reserves the sheet name History')

  const texts = workbook => workbook.worksheets.flatMap(sheet => { const cells = []; sheet.eachRow(row => row.eachCell(cell => { if (typeof cell.value === 'string') cells.push(`${sheet.name}: ${cell.value}`) })); return cells })
  const danish = [...texts(count), ...texts(final)].filter(text => /[æøåÆØÅ]|\b(I alt|Godkendt|Bogført|Talt|Mangler|Materiale|Antal|Startet|og)\b/.test(text))
  assert.deepEqual(danish, [])
  const summary = []
  count.getWorksheet('Summary').eachRow(row => summary.push(row.values.slice(1)))
  assert.ok(summary.some(row => row[0] === 'Count' && row[1] === 'D000 week 42'))
  assert.ok(summary.some(row => row[0] === 'Total'))
  assert.ok(summary.some(row => row[0] === 'New terminals'))
})

test('reports are Danish unless English is asked for', async () => {
  const workbook = require('./report.cjs').buildWorkbook({ ...reportData(), language: 'sv' })
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name).slice(0, 2), ['Resumé', 'Differencer'])
})
