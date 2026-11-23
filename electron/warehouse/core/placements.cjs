// TCD's placement sheet (Placeringsark_<date>.xlsm on M:). Read only: the newest copy is loaded into memory,
// macros are never run and the file is never written. The register is a suggestion, never the truth.
const fs = require('node:fs')
const path = require('node:path')
const ExcelJS = require('exceljs')

const SHEET_PATTERN = /^Placeringsark_.*\.xls[xm]$/i
const COLUMNS = {
  area: ['Område'],
  placement: ['Placering'],
  type: ['Type'],
  material: ['SAP mat. No.', 'SAP mat. no.', 'SAP Mat. No.'],
  description: ['SAP Description'],
  quantity: ['Antal'],
  comment: ['Kommentarer', 'Kommentar'],
}
const REQUIRED = ['placement', 'material']

// Async so a slow M: never holds up the main thread.
async function findNewestPlacementSheet(dir) {
  let names
  try { names = await fs.promises.readdir(dir) } catch { return null }
  const sheets = names.filter(name => SHEET_PATTERN.test(name))
  const times = await Promise.all(sheets.map(async name => (await fs.promises.stat(path.join(dir, name))).mtimeMs))
  let best = null
  sheets.forEach((name, index) => {
    if (!best || times[index] > best.time) best = { name, time: times[index] }
  })
  return best ? path.join(dir, best.name) : null
}

function cellValue(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || value instanceof Date) return value
  if ('error' in value) return null
  if ('result' in value) return cellValue(value.result)
  if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('')
  if ('text' in value) return value.text
  if ('formula' in value || 'sharedFormula' in value) return null
  return null
}

const text = value => { const result = cellValue(value); return result === null ? '' : String(result).trim() }

function areaFromPlacement(placement) {
  const match = /^([A-Za-zÆØÅæøå]+)/.exec(String(placement || '').trim())
  return match ? match[1].toUpperCase() : ''
}

async function readPlacementSheet(file) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await fs.promises.readFile(file))
  for (const sheet of [workbook.getWorksheet('Data'), ...workbook.worksheets].filter(Boolean)) {
    const header = sheet.getRow(1).values.map(value => text(value))
    const positions = {}
    for (const [key, names] of Object.entries(COLUMNS)) {
      const position = header.findIndex(cell => names.includes(cell))
      if (position !== -1) positions[key] = position
    }
    if (!REQUIRED.every(key => key in positions)) continue
    const placements = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const values = row.values
      const placement = text(values[positions.placement])
      if (!placement) return
      const quantity = cellValue(values[positions.quantity])
      placements.push({
        placement,
        area: (positions.area ? text(values[positions.area]) : '').toUpperCase() || areaFromPlacement(placement),
        type: positions.type ? text(values[positions.type]) : '',
        material: text(values[positions.material]).toUpperCase(),
        description: positions.description ? text(values[positions.description]) : '',
        quantity: typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null,
        comment: positions.comment ? text(values[positions.comment]) : '',
      })
    })
    const areas = [...new Set(placements.map(item => item.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'da'))
    return { file, placements, areas }
  }
  throw Object.assign(new Error('Placeringsarket har ikke de forventede kolonner'), { code: 'PLACEMENTS_FORMAT' })
}

module.exports = { findNewestPlacementSheet, readPlacementSheet, areaFromPlacement, SHEET_PATTERN }
