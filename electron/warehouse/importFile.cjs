// Reads serial numbers from a file the user picked for import: Excel (xlsx/xlsm), CSV or plain text.
const fs = require('node:fs')
const path = require('node:path')
const ExcelJS = require('exceljs')

const MAX_BYTES = 20 * 1024 * 1024
const SERIAL_HEADER = /^(serial( ?(no\.?|number))?|serienummer|serienr\.?|sernr|serial no\.?)$/i

function codeError(code, message) {
  return Object.assign(new Error(message || code), { code })
}

function cellText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if (value instanceof Date) return ''
    if ('result' in value) return cellText(value.result)
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('').trim()
    if ('text' in value) return String(value.text).trim()
    return ''
  }
  return String(value).trim()
}

function pickColumn(rows) {
  const header = rows[0] || []
  const index = header.findIndex(cell => SERIAL_HEADER.test(String(cell).trim()))
  return index === -1 ? { column: 0, skipHeader: false } : { column: index, skipHeader: true }
}

function fromRows(rows) {
  const { column, skipHeader } = pickColumn(rows)
  return rows.slice(skipHeader ? 1 : 0).map(row => String(row[column] ?? '').trim()).filter(Boolean)
}

async function readSerialFile(file, { maxBytes = MAX_BYTES } = {}) {
  const extension = path.extname(file).toLowerCase()
  if (!['.xlsx', '.xlsm', '.csv', '.txt'].includes(extension)) throw codeError('IMPORT_FILE_TYPE', 'Vælg en Excel-, CSV- eller tekstfil')
  const stat = await fs.promises.stat(file)
  if (stat.size > maxBytes) throw codeError('IMPORT_FILE_TOO_LARGE', 'Filen er for stor')
  let rows
  if (extension === '.xlsx' || extension === '.xlsm') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await fs.promises.readFile(file))
    const sheet = workbook.worksheets.find(item => item.state !== 'hidden' && item.rowCount > 0) || workbook.worksheets[0]
    rows = []
    sheet?.eachRow({ includeEmpty: false }, row => rows.push(row.values.slice(1).map(cellText)))
  } else {
    const text = (await fs.promises.readFile(file, 'utf8')).replace(/^\uFEFF/, '')
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    const delimiter = [';', '\t', ','].find(candidate => lines[0]?.includes(candidate))
    rows = lines.map(line => (delimiter ? line.split(delimiter) : [line]).map(cell => cell.replace(/^"|"$/g, '').trim()))
  }
  return { fileName: path.basename(file), serials: fromRows(rows) }
}

module.exports = { readSerialFile }
