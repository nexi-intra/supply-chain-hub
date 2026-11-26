// Runs Finland T&T's Excel scripts (excel/*.ps1, kept byte for byte as verified against the real sheet) against the
// workbook in Finlandsforsendelser's settings. Each script writes its answer as JSON to an -Out file in tmpDir.
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const READ_TIMEOUT_MS = 5 * 60 * 1000

// Writing takes about a second per row, so the limit grows with the batch.
function appendTimeoutMs(rowCount) {
  return 2 * 60 * 1000 + rowCount * 5000
}

const MESSAGES = Object.freeze({
  'excel-missing': 'Excel kunne ikke startes på PC\'en.',
  'open-failed': 'Arket kunne ikke åbnes fra SharePoint. Åbn det i Excel-programmet, og prøv igen.',
  'sheet-missing': 'Fanen findes ikke i arket. Tjek fanens navn under Arbejdsværktøjer, Administration, Finlandsforsendelser.',
  'table-missing': 'Tabellen findes ikke i arket. Tjek tabellens navn under Arbejdsværktøjer, Administration, Finlandsforsendelser.',
  'table-changed': 'Tabellen mangler en kolonne, programmet skal bruge.',
  'read-only': 'Arket er åbnet skrivebeskyttet. Tryk "Aktivér redigering" i Excel, og prøv igen.',
  'save-failed': 'Rækkerne er skrevet, men arket kunne ikke gemmes. Gem det selv i Excel.',
  'write-failed': 'Excel stoppede midt i skrivningen. Nogle rækker kan være skrevet ved dagens dato i arket. Tryk "Hent igen", så finder programmet dem og skriver kun resten.',
  'sheet-moved': 'Arket blev ændret, lige før programmet skulle skrive. Intet er skrevet. Tryk "Hent igen", og prøv så igen.',
  'fix-failed': 'Excel kunne ikke rette rækken. Åbn arket, og tjek T&T og Courier i rækken.',
  'followup-failed': 'Excel stoppede, mens opfølgningen blev skrevet. Dine ændringer er gemt i appen. Tryk "Gem i arket" igen, så skrives kun det, der mangler.',
  'row-not-unique': 'Kolliet står på flere rækker i arket. Intet er slettet. Slet den forkerte række i hånden.',
  'row-shared': 'T&T-cellen i rækken har også andre kolli. Intet er slettet. Ret rækken i hånden.',
  'delete-failed': 'Excel kunne ikke slette rækken. Intet er slettet. Tjek arket, og prøv igen.',
  'no-output': 'Excel-scriptet svarede ikke.',
  timeout: 'Excel brugte for lang tid. Prøv igen.',
  'write-timeout': 'Excel brugte for lang tid på at skrive. Nogle rækker kan være skrevet ved dagens dato i arket. Tryk "Hent igen", så finder programmet dem og skriver kun resten.',
})

function excelErrorText(code, detail) {
  const base = MESSAGES[code] || `Uventet fejl fra Excel-scriptet (${code}).`
  return detail ? `${base} (${detail})` : base
}

/** FINLAND_EXCEL_FAILED with the Danish text; `excelCode` keeps the script's own code (e.g. 'write-timeout'). */
function excelError(code, detail) {
  return Object.assign(new Error(`FINLAND_EXCEL_FAILED: ${excelErrorText(code, detail)}`), { code: 'FINLAND_EXCEL_FAILED', excelCode: code })
}

function readResultFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return { ok: false, error: 'no-output' }
  }
}

function sheetStateText({ wasOpen, filterRemoved }) {
  const lines = [wasOpen ? 'Arket er åbent i Excel' : 'Arket er åbnet fra SharePoint']
  if (filterRemoved) lines.push('Filteret i arket er fjernet, så alle rækker kan ses')
  return lines
}

/**
 * `scriptsDir` holds the .ps1 files (app.asar.unpacked when packaged). `workbook()` gives { workbookUrl, sheetName,
 * tableName } and is asked on every call, so a changed setting is used right away.
 */
function createFinlandExcel({ scriptsDir, tmpDir, workbook, execFile = childProcess.execFile }) {
  const tmpFile = name => path.join(tmpDir, `${name}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`)

  async function target() {
    const { workbookUrl, sheetName, tableName } = await workbook()
    return ['-Url', workbookUrl, '-Sheet', sheetName, '-Table', tableName]
  }

  async function runScript(name, args, timeoutMs = READ_TIMEOUT_MS, timeoutCode = 'timeout') {
    await fs.promises.mkdir(tmpDir, { recursive: true })
    const out = tmpFile(name)
    const fullArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptsDir, `${name}.ps1`), ...args, '-Out', out]
    return new Promise((resolve, reject) => {
      execFile('powershell.exe', fullArgs, { timeout: timeoutMs, windowsHide: true }, error => {
        if (error && error.killed) {
          fs.rmSync(out, { force: true })
          return reject(excelError(timeoutCode))
        }
        const result = readResultFile(out)
        fs.rmSync(out, { force: true })
        if (!result.ok) return reject(excelError(result.error, result.detail))
        resolve(result)
      })
    })
  }

  /** Runs `job(inputFile)` with `data` as JSON in a temp file that is removed afterwards. */
  async function withInput(name, data, job) {
    await fs.promises.mkdir(tmpDir, { recursive: true })
    const input = tmpFile(name)
    await fs.promises.writeFile(input, JSON.stringify(data), 'utf8')
    try {
      return await job(input)
    } finally {
      await fs.promises.rm(input, { force: true })
    }
  }

  async function readSheet() {
    const result = await runScript('read-table', await target())
    return { rows: result.rows || [], wasOpen: !!result.wasOpen, filterRemoved: !!result.filterRemoved }
  }

  async function appendRows(rows, placement = null) {
    const where = []
    if (placement) {
      where.push('-AfterRow', String(placement.afterRow))
      // PowerShell -File drops an empty argument, so an empty delivery (the top of the table) is left out.
      if (placement.afterDelivery) where.push('-AfterDelivery', String(placement.afterDelivery))
    }
    const book = await target()
    return withInput('rows', rows, input => runScript('append-rows', [...book, '-In', input, ...where], appendTimeoutMs(rows.length), 'write-timeout'))
  }

  async function replaceTracking(fix) {
    return runScript('fix-tracking', [...await target(),
      '-Row', String(fix.row), '-Delivery', String(fix.delivery), '-OldTracking', fix.oldTracking, '-NewTracking', fix.newTracking, '-Courier', fix.courier])
  }

  async function deleteRow({ row, delivery, tracking }) {
    return runScript('delete-row', [...await target(), '-Row', String(row), '-Delivery', String(delivery), '-Tracking', tracking])
  }

  async function writeFollowUp(writes) {
    const book = await target()
    return withInput('followup', writes, input => runScript('write-followup', [...book, '-In', input], appendTimeoutMs(writes.length), 'followup-failed'))
  }

  return { readSheet, appendRows, replaceTracking, deleteRow, writeFollowUp }
}

module.exports = { createFinlandExcel, excelErrorText, readResultFile, appendTimeoutMs, sheetStateText, MESSAGES }
