const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createFinlandExcel, excelErrorText, readResultFile, appendTimeoutMs, sheetStateText } = require('./excel.cjs')

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'finland-excel-'))
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }))

const SCRIPTS = path.join(__dirname, 'excel')
const WORKBOOK = { workbookUrl: 'https://x.test/Ark.xlsx', sheetName: 'Sheet1', tableName: 'Table2' }

// A powershell.exe stand-in: records the call, then writes `result` to the -Out file like the scripts do.
function fakeExecFile(result, { killed = false } = {}) {
  const calls = []
  const execFile = (file, args, options, callback) => {
    const inIndex = args.indexOf('-In')
    calls.push({ file, args, options, input: inIndex >= 0 ? JSON.parse(fs.readFileSync(args[inIndex + 1], 'utf8')) : null })
    if (killed) return callback(Object.assign(new Error('killed'), { killed: true }))
    if (result) fs.writeFileSync(args[args.indexOf('-Out') + 1], `\uFEFF${JSON.stringify(result)}`, 'utf8')
    callback(null)
  }
  return { execFile, calls }
}

function excel(fake, workbook = async () => WORKBOOK) {
  const tmpDir = fs.mkdtempSync(path.join(ROOT, 'tmp-'))
  return { tmpDir, excel: createFinlandExcel({ scriptsDir: SCRIPTS, tmpDir, workbook, execFile: fake.execFile }) }
}

test('the Excel scripts are copied from Finland T&T', () => {
  for (const name of ['common', 'read-table', 'append-rows', 'fix-tracking', 'write-followup', 'delete-row']) {
    assert.ok(fs.existsSync(path.join(SCRIPTS, `${name}.ps1`)), name)
  }
})

test('excel error codes become the Danish texts', async () => {
  assert.equal(excelErrorText('read-only'), 'Arket er åbnet skrivebeskyttet. Tryk "Aktivér redigering" i Excel, og prøv igen.')
  assert.equal(excelErrorText('row-not-unique'), 'Kolliet står på flere rækker i arket. Intet er slettet. Slet den forkerte række i hånden.')
  assert.equal(excelErrorText('row-shared'), 'T&T-cellen i rækken har også andre kolli. Intet er slettet. Ret rækken i hånden.')
  assert.equal(excelErrorText('delete-failed'), 'Excel kunne ikke slette rækken. Intet er slettet. Tjek arket, og prøv igen.')
  assert.match(excelErrorText('noget-nyt'), /noget-nyt/)
  const { excel: sheet } = excel(fakeExecFile({ ok: false, error: 'read-only' }))
  await assert.rejects(sheet.readSheet(), error => {
    assert.equal(error.code, 'FINLAND_EXCEL_FAILED')
    assert.equal(error.excelCode, 'read-only')
    assert.equal(error.message, 'FINLAND_EXCEL_FAILED: Arket er åbnet skrivebeskyttet. Tryk "Aktivér redigering" i Excel, og prøv igen.')
    return true
  })
})

test('a changed table names the column', () => {
  assert.match(excelErrorText('table-changed', 'T&T'), /T&T/)
})

test('the result file from PowerShell is read, also with a BOM', () => {
  const file = path.join(ROOT, 'bom.json')
  fs.writeFileSync(file, '\uFEFF{"ok":true,"added":2}', 'utf8')
  assert.deepEqual(readResultFile(file), { ok: true, added: 2 })
})

test('a missing result file gives an error instead of a crash', () => {
  assert.deepEqual(readResultFile(path.join(ROOT, 'missing.json')), { ok: false, error: 'no-output' })
})

test('the write time limit grows with the number of rows', () => {
  assert.equal(appendTimeoutMs(0), 120000)
  assert.equal(appendTimeoutMs(300), 120000 + 300 * 5000)
})

test('a timeout while writing says rows may be written', () => {
  assert.match(excelErrorText('write-timeout'), /kan være skrevet/)
})

test('a sheet that moved says nothing is written', () => {
  assert.match(excelErrorText('sheet-moved'), /Intet er skrevet/)
})

test('a failure mid-write does not send the user to the bottom rows', () => {
  assert.doesNotMatch(excelErrorText('write-failed'), /nederste/)
  assert.doesNotMatch(excelErrorText('write-timeout'), /nederste/)
  assert.match(excelErrorText('write-failed'), /dagens dato/)
})

test('a failed fix names the row and says to check it', () => {
  assert.match(excelErrorText('fix-failed', 'raekke 1031: x'), /tjek T&T og Courier/)
  assert.match(excelErrorText('fix-failed', 'raekke 1031: x'), /1031/)
})

test('a failed follow-up says the changes are not lost', () => {
  assert.match(excelErrorText('followup-failed'), /ændringer er gemt i appen/)
})

test('the sheet indicator says whether the sheet was open', () => {
  assert.deepEqual(sheetStateText({ wasOpen: true, filterRemoved: false }), ['Arket er åbent i Excel'])
  assert.deepEqual(sheetStateText({ wasOpen: false, filterRemoved: false }), ['Arket er åbnet fra SharePoint'])
})

test('a removed filter is mentioned', () => {
  assert.deepEqual(sheetStateText({ wasOpen: true, filterRemoved: true }), ['Arket er åbent i Excel', 'Filteret i arket er fjernet, så alle rækker kan ses'])
})

test('reading runs read-table.ps1 against the workbook settings of the moment', async () => {
  const fake = fakeExecFile({ ok: true, rows: [{ row: 5 }], wasOpen: true, filterRemoved: false })
  const books = [WORKBOOK, { workbookUrl: 'C:\\Ark\\Kopi.xlsx', sheetName: 'Fane', tableName: 'Tabel' }]
  let reads = 0
  const { tmpDir, excel: sheet } = excel(fake, async () => books[reads++])
  assert.deepEqual(await sheet.readSheet(), { rows: [{ row: 5 }], wasOpen: true, filterRemoved: false })
  await sheet.readSheet()
  assert.equal(fake.calls[0].file, 'powershell.exe')
  assert.deepEqual(fake.calls[0].args.slice(0, 11), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(SCRIPTS, 'read-table.ps1'), '-Url', WORKBOOK.workbookUrl, '-Sheet', 'Sheet1', '-Table', 'Table2'])
  assert.deepEqual(fake.calls[1].args.slice(5, 11), ['-Url', 'C:\\Ark\\Kopi.xlsx', '-Sheet', 'Fane', '-Table', 'Tabel'])
  assert.equal(fake.calls[0].args.at(-2), '-Out')
  assert.equal(path.dirname(fake.calls[0].args.at(-1)), tmpDir)
  assert.equal(fake.calls[0].options.timeout, 5 * 60 * 1000)
  assert.deepEqual(fs.readdirSync(tmpDir), [], 'result files are removed')
})

test('appending leaves out an empty -AfterDelivery and gives time per row', async () => {
  const fake = fakeExecFile({ ok: true, added: 2 })
  const { tmpDir, excel: sheet } = excel(fake)
  const rows = [{ delivery: '1' }, { delivery: '2' }]
  assert.deepEqual(await sheet.appendRows(rows, { afterRow: 7, afterDelivery: '' }), { ok: true, added: 2 })
  const { args, options, input } = fake.calls[0]
  assert.equal(args[4], path.join(SCRIPTS, 'append-rows.ps1'))
  assert.deepEqual(input, rows)
  assert.equal(args[11], '-In')
  assert.equal(path.dirname(args[12]), tmpDir)
  assert.deepEqual(args.slice(13), ['-AfterRow', '7', '-Out', args.at(-1)])
  assert.equal(options.timeout, appendTimeoutMs(2))
  await sheet.appendRows(rows, { afterRow: 7, afterDelivery: '82006464' })
  assert.deepEqual(fake.calls[1].args.slice(13, 17), ['-AfterRow', '7', '-AfterDelivery', '82006464'])
  await sheet.appendRows(rows)
  assert.ok(!fake.calls[2].args.includes('-AfterRow'))
  assert.deepEqual(fs.readdirSync(tmpDir), [], 'input and result files are removed')
})

test('a write that runs out of time says rows may be written', async () => {
  const { tmpDir, excel: sheet } = excel(fakeExecFile(null, { killed: true }))
  await assert.rejects(sheet.appendRows([{ delivery: '1' }]), error => error.code === 'FINLAND_EXCEL_FAILED' && error.excelCode === 'write-timeout' && error.message === `FINLAND_EXCEL_FAILED: ${excelErrorText('write-timeout')}`)
  await assert.rejects(sheet.readSheet(), error => error.excelCode === 'timeout')
  await assert.rejects(sheet.writeFollowUp([{ row: 5 }]), error => error.excelCode === 'followup-failed')
  assert.deepEqual(fs.readdirSync(tmpDir), [])
})

test('fixing, deleting and following up pass their fields', async () => {
  const fake = fakeExecFile({ ok: true })
  const { excel: sheet } = excel(fake)
  await sheet.replaceTracking({ row: 12, delivery: 82006464, oldTracking: 'A', newTracking: 'B', courier: 'DHL' })
  await sheet.deleteRow({ row: 12, delivery: 82006464, tracking: 'B' })
  await sheet.writeFollowUp([{ row: 12, cells: { Comments: 'x' } }])
  assert.equal(fake.calls[0].args[4], path.join(SCRIPTS, 'fix-tracking.ps1'))
  assert.deepEqual(fake.calls[0].args.slice(11, 21), ['-Row', '12', '-Delivery', '82006464', '-OldTracking', 'A', '-NewTracking', 'B', '-Courier', 'DHL'])
  assert.equal(fake.calls[1].args[4], path.join(SCRIPTS, 'delete-row.ps1'))
  assert.deepEqual(fake.calls[1].args.slice(11, 17), ['-Row', '12', '-Delivery', '82006464', '-Tracking', 'B'])
  assert.equal(fake.calls[2].args[4], path.join(SCRIPTS, 'write-followup.ps1'))
  assert.deepEqual(fake.calls[2].input, [{ row: 12, cells: { Comments: 'x' } }])
  assert.equal(fake.calls[2].options.timeout, appendTimeoutMs(1))
})

test('a delete the sheet refuses gives its Danish text', async () => {
  const { excel: sheet } = excel(fakeExecFile({ ok: false, error: 'row-shared' }))
  await assert.rejects(sheet.deleteRow({ row: 12, delivery: '1', tracking: 'B' }), { code: 'FINLAND_EXCEL_FAILED', message: 'FINLAND_EXCEL_FAILED: T&T-cellen i rækken har også andre kolli. Intet er slettet. Ret rækken i hånden.' })
})
