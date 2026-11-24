const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ExcelJS = require('exceljs')
const { findNewestPlacementSheet, readPlacementSheet, areaFromPlacement } = require('./placements.cjs')

async function makeSheet(file, rows) {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Søg')
  const sheet = workbook.addWorksheet('Data')
  sheet.addRow(['Lokation 1/0', 'Alder - dage', 'Område', 'Placering', 'Type', 'Højde', 'SAP mat. No.', 'SAP Description', 'Antal', 'Dato', 'Leverandør mat. no.', 'Kommentarer'])
  for (const row of rows) sheet.addRow(row)
  await workbook.xlsx.writeFile(file)
}

test('the newest placement sheet is chosen by modification time, without synchronous file calls (M:)', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-placements-'))
  for (const [name, time] of [['Placeringsark_13_10_2026_15_08.xlsm', 1000], ['Placeringsark_15_10_2026_15_29.xlsm', 3000], ['Placeringsark_14_10_2026_14_48.xlsm', 2000], ['Andet.xlsm', 9000]]) {
    fs.writeFileSync(path.join(dir, name), 'x')
    fs.utimesSync(path.join(dir, name), time, time)
  }
  const readdirSync = t.mock.method(fs, 'readdirSync')
  const statSync = t.mock.method(fs, 'statSync')
  const found = findNewestPlacementSheet(dir)
  assert.ok(found instanceof Promise, 'async')
  assert.equal(await found, path.join(dir, 'Placeringsark_15_10_2026_15_29.xlsm'))
  assert.equal(await findNewestPlacementSheet(path.join(dir, 'missing')), null)
  assert.equal(readdirSync.mock.callCount() + statSync.mock.callCount(), 0)
})

test('placements are read by header; formula results are used and a missing area comes from the code', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-placements-'))
  const file = path.join(dir, 'Placeringsark_15_10_2026_15_29.xlsx')
  await makeSheet(file, [
    [1, 212, { formula: 'VLOOKUP(LEFT(D2,2),Sheet2!C:D,2,0)', result: 'A' }, 'A1.1', 'Palle', null, 'R133-0056', 'N950 PSU', 500, new Date('2026-03-17'), null, 'FAST  PLADS'],
    [0, '', { formula: 'VLOOKUP(LEFT(D3,2),Sheet2!C:D,2,0)', result: { error: '#N/A' } }, 'K1.GULV', 'Palle'],
    [1, 3, 'RE', 'RE12', 'Reol', 2, 'int4300-4921-0', 'N950', { formula: 'SUM(1,1)', result: 2 }],
    [null, null, null, null, 'Palle'],
  ])
  const result = await readPlacementSheet(file)
  assert.equal(result.file, file)
  assert.equal(result.placements.length, 3)
  assert.deepEqual(result.placements[0], { placement: 'A1.1', area: 'A', type: 'Palle', material: 'R133-0056', description: 'N950 PSU', quantity: 500, comment: 'FAST  PLADS' })
  assert.deepEqual(result.placements[1], { placement: 'K1.GULV', area: 'K', type: 'Palle', material: '', description: '', quantity: null, comment: '' })
  assert.equal(result.placements[2].material, 'INT4300-4921-0')
  assert.equal(result.placements[2].quantity, 2)
  assert.deepEqual(result.areas, ['A', 'K', 'RE'])
})

test('a workbook without the expected columns is rejected', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-placements-'))
  const file = path.join(dir, 'bad.xlsx')
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Data').addRow(['Noget', 'Andet'])
  await workbook.xlsx.writeFile(file)
  await assert.rejects(readPlacementSheet(file), { code: 'PLACEMENTS_FORMAT' })
})

test('the area of a placement code is its leading letters', () => {
  assert.equal(areaFromPlacement('A1.1'), 'A')
  assert.equal(areaFromPlacement('pr3'), 'PR')
  assert.equal(areaFromPlacement('Reol X 1'), 'REOL')
  assert.equal(areaFromPlacement('12'), '')
})
