// One-off import of TCD's placement sheet (Placeringsark_*.xlsm) into Placeringer. Read only: the workbook is read into
// memory, macros never run and the file is never written. Descriptions are SAP's – the sheet's text is only compared.
const ExcelJS = require('exceljs')
const { normalizeMatdoc } = require('../core/sapParsers.cjs')
const { locationKey, areaFromName, TYPES, shelfOf } = require('./model.cjs')
const { putStock } = require('./shelves.cjs')

const COLUMNS = {
  area: ['Område'], name: ['Placering'], type: ['Type'], material: ['SAP mat. No.', 'SAP mat. no.', 'SAP Mat. No.'],
  description: ['SAP Description'], quantity: ['Antal'], date: ['Dato'], supplier: ['Leverandør mat. no.'], comment: ['Kommentarer', 'Kommentar'],
}
const RESERVED_MATERIAL = '999-999'
// Comments that become tags; matched without regard to case, the rest of the comment goes to the note.
const KNOWN_TAGS = ['Sluse oppe', 'Sluse nede', 'Brandskab', 'Kasse', 'Retur til Ingenico block stock', 'Retur til Newland block stock', 'Retur til Castles block stock', 'Husk serienr.']
const DAY_MS = 86400000

function cellValue(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value !== 'object') return value
  if ('error' in value) return null
  if ('result' in value) return cellValue(value.result)
  if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('')
  if ('text' in value) return value.text
  return null
}
const text = value => { const result = cellValue(value); return result === null ? '' : String(result).trim() }
function noteText(note) {
  if (!note) return ''
  const raw = typeof note === 'string' ? note : (note.texts || []).map(part => part.text).join('')
  // Excel notes start with the author ("Jens …:"); only the text is kept.
  return raw.replace(/^[^:\n]{2,40}:\s*/, '').replace(/\s+/g, ' ').trim()
}

/** The rows of the sheet "Data" (or the first sheet with a "Placering" column). */
async function readSheet(file) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  const sheet = workbook.getWorksheet('Data') || workbook.worksheets.find(item => item.getRow(1).values.includes('Placering'))
  if (!sheet) throw Object.assign(new Error('PLACEMENTS_INVALID: Arket "Data" mangler'), { code: 'PLACEMENTS_INVALID' })
  const header = sheet.getRow(1).values.map(value => text(value))
  const at = Object.fromEntries(Object.entries(COLUMNS).map(([field, names]) => [field, header.findIndex(name => names.includes(name))]))
  if (at.name < 1) throw Object.assign(new Error('PLACEMENTS_INVALID: Kolonnen "Placering" mangler'), { code: 'PLACEMENTS_INVALID' })
  const rows = []
  sheet.eachRow((row, number) => {
    if (number === 1) return
    const get = field => (at[field] > 0 ? row.getCell(at[field]).value : null)
    const name = text(get('name'))
    if (!name) return
    const quantity = cellValue(get('quantity'))
    const date = cellValue(get('date'))
    let cellNote = ''
    row.eachCell(cell => { if (!cellNote && cell.note) cellNote = noteText(cell.note) })
    rows.push({
      row: number, name, area: text(get('area')).toUpperCase(), type: text(get('type')), material: text(get('material')).toUpperCase(),
      sheetDescription: text(get('description')), quantity: typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null,
      date: date instanceof Date ? date.getTime() : null, supplier: text(get('supplier')), comment: text(get('comment')), cellNote,
    })
  })
  return rows
}

const typeOf = value => (/^reol/i.test(value) ? 'Reol' : TYPES.find(type => type.toLowerCase() === value.toLowerCase()) || null)
const same = (a, b) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase()

/** Tags, purpose markers and the rest of a comment. */
function readComment(comment) {
  const upper = comment.toUpperCase()
  let rest = comment
  const tags = KNOWN_TAGS.filter(tag => upper.includes(tag.toUpperCase().replace(/\.$/, '')))
  for (const tag of tags) rest = rest.replace(new RegExp(tag.replace(/\.$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
  rest = rest.replace(/fast\s*plads|pluk/gi, ' ').replace(/^[\s\-–/.]+|[\s\-–/.]+$/g, '').replace(/\s+/g, ' ').trim()
  return { pick: /PLUK/.test(upper), fixed: /FAST/.test(upper), tags, rest }
}

/** The sheet's rows translated into places and pallets (spec, section 3). Pure. */
function planImport(rows, { sapTexts = {}, unchecked = [], now = Date.now() } = {}) {
  const warnings = []
  const warn = (row, code, detail) => warnings.push({ row: row.row, name: row.name, code, detail })
  const groups = new Map()
  for (const row of rows) {
    const key = locationKey(row.name)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  // Materials SAP could not be asked about (MM60 failed) are imported anyway, without a description, and warned about.
  const notChecked = new Set(unchecked)
  const known = material => Object.hasOwn(sapTexts, material) || notChecked.has(material)
  const locations = []
  const pallets = []
  const stock = {}
  const tagsUsed = new Set()
  for (const [id, group] of groups) {
    const first = group[0]
    const area = group.find(row => row.area)?.area || areaFromName(first.name)
    if (!group.some(row => row.area)) warn(first, 'AREA_FROM_NAME', `Område ${area} ud fra navnet`)
    let type = typeOf(first.type)
    if (!type) { type = 'Palle'; if (first.type) warn(first, 'UNKNOWN_TYPE', `Typen "${first.type}" er sat til Palle`) }
    const comments = group.map(row => ({ row, ...readComment(row.comment) }))
    for (const row of group) {
      if (!row.material || row.material === RESERVED_MATERIAL) continue
      if (notChecked.has(row.material) && !Object.hasOwn(sapTexts, row.material)) warn(row, 'NOT_CHECKED', `${row.material} kunne ikke slås op i SAP (MM60) – importeres uden beskrivelse`)
      else if (!known(row.material)) warn(row, 'NOT_IN_SAP', `${row.material} findes ikke i SAP`)
      else if (row.sheetDescription && sapTexts[row.material] && !same(row.sheetDescription, sapTexts[row.material])) warn(row, 'DESCRIPTION_DIFFERS', `Arket: "${row.sheetDescription}" · SAP: "${sapTexts[row.material]}"`)
    }
    const reserved = group.find(row => row.material === RESERVED_MATERIAL)
    const pickRows = comments.filter(item => item.pick && item.row.material && known(item.row.material))
    // Rows of real stock next to PLUK rows or a 999-999 row: the place stays a reserve place that keeps every pallet, and the
    // preview asks for its purpose to be checked – the sheet's data is never dropped for the sake of the purpose.
    const otherRows = comments.filter(item => !item.pick && item.row.material && item.row.material !== RESERVED_MATERIAL && known(item.row.material))
    const mixed = (reserved || pickRows.length > 0) && otherRows.length > 0
    if (mixed) warn(first, 'MIXED_PLACE', `${first.name} har både ${reserved ? '999-999' : 'PLUK'} og paller – importeret som reserveplads; ret formålet bagefter`)
    const purpose = mixed ? 'reserve' : reserved ? 'reserved' : pickRows.length ? (area === 'I' ? 'station' : 'pick') : 'reserve'
    // On a reserve place a material without quantity is a fixed place for it (the sheet's "faste pladser"), like "FAST PLADS";
    // on a mixed place the PLUK materials are fixed there too.
    const fixedRows = purpose === 'pick' || purpose === 'station' ? pickRows : purpose === 'reserve' ? comments.filter(item => item.row.material && known(item.row.material) && (item.fixed || item.pick || item.row.quantity === null)) : []
    const fixedMaterials = [...new Set(fixedRows.map(item => item.row.material))]
    const becomesPallet = row => purpose === 'reserve' && row.material && row.quantity !== null && known(row.material)
    // Every row either becomes something or is shown in the preview: nothing disappears silently.
    for (const item of comments) {
      const { row } = item
      if ((!row.material && row.quantity === null) || row.material === RESERVED_MATERIAL || (row.material && !known(row.material))) continue
      const used = becomesPallet(row) || fixedRows.includes(item)
      if (!used) warn(row, 'ROW_SKIPPED', row.material ? `${row.material}${row.quantity === null ? '' : ` (${row.quantity})`} står på en ${purpose === 'pick' ? 'pluk-plads' : purpose === 'station' ? 'arbejdsstation' : 'reserveret plads'} og bliver ikke til en palle` : `Antal ${row.quantity} uden materiale`)
    }
    // Comments and cell notes of rows that do not become pallets go to the place's note.
    const noteParts = [reserved?.sheetDescription, ...comments.filter(item => !becomesPallet(item.row)).flatMap(item => [item.rest, item.row.cellNote])].filter(Boolean)
    // The type decides the capacity (a pallet place 1, a floor 0 = no limit); a Hylde named "E9 H5" gets rack and shelf.
    const capacity = type === 'Palle' ? 1 : type === 'Gulv' ? 0 : Math.max(1, group.length)
    const rack = type === 'Hylde' ? shelfOf(first.name) : null
    locations.push({ id, name: first.name, area, type, purpose, capacity, fixedMaterials, ...(rack || {}), active: true, note: [...new Set(noteParts)].join(' · ').slice(0, 500), updatedAt: now, updatedBy: { email: '', name: 'Import' } })
    if (purpose !== 'reserve') continue
    // A lagerhylde holds material + quantity: its rows are summed per material, their 49/50 numbers and notes kept in the line's note.
    if (type === 'Hylde') {
      for (const { row, rest } of comments) {
        if (!becomesPallet(row)) continue
        const document = normalizeMatdoc(row.supplier)
        const note = [rest, document ? `49/50: ${document}` : row.supplier ? `Leverandør mat. no.: ${row.supplier}` : '', row.cellNote].filter(Boolean).join(' · ')
        putStock(stock, { location: id, material: row.material, quantity: row.quantity, by: { email: '', name: 'Import' }, at: now, note })
      }
      continue
    }
    // Several rows on a pallet place (pallets or free rows): it holds one pallet now, so the preview asks to check its type.
    if (type === 'Palle' && group.length > 1) warn(first, 'PALLET_PLACE_MANY', `${first.name} har ${group.length} rækker på en palleplads – ret typen til Gulv, hvis der kan stå flere paller, eller flyt pallerne`)
    for (const { row, tags, rest } of comments) {
      if (!becomesPallet(row)) continue
      tags.forEach(tag => tagsUsed.add(tag))
      const document = normalizeMatdoc(row.supplier)
      const note = [rest, row.supplier && !document ? `Leverandør mat. no.: ${row.supplier}` : '', row.cellNote].filter(Boolean).join(' · ')
      pallets.push({ id: `imp-${row.row}`, location: id, material: row.material, quantity: row.quantity, receivedAt: row.date || now, document: document || null, serials: [], sloc: 'D000', tags, note, createdAt: now, createdBy: { email: '', name: 'Import' } })
    }
  }
  const count = (list, field) => list.reduce((result, item) => ({ ...result, [item[field]]: (result[item[field]] || 0) + 1 }), {})
  return {
    locations, pallets, stock: Object.values(stock), tags: [...tagsUsed].sort(), warnings,
    stats: { locations: locations.length, pallets: pallets.length, stock: Object.keys(stock).length, materials: new Set(pallets.map(pallet => pallet.material).concat(locations.flatMap(location => location.fixedMaterials))).size, byArea: count(locations, 'area'), byPurpose: count(locations, 'purpose') },
  }
}

module.exports = { readSheet, planImport, KNOWN_TAGS, DAY_MS }
