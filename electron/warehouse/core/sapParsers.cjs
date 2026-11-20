// Parsers for CountPoint's SAP exports (tab-separated "Text with Tabs", UTF-8).
// Columns are found by their header text, never by position.
function formatError(message) {
  const error = new Error(`SAP_FORMAT: ${message}`)
  error.code = 'SAP_FORMAT'
  return error
}

/** "2.240.469,51" -> 2240469.51, "12-" -> -12 (SAP writes the minus last). */
function parseSapNumber(value) {
  let text = String(value ?? '').trim()
  if (!text) return 0
  let sign = 1
  if (text.endsWith('-')) { sign = -1; text = text.slice(0, -1).trim() }
  else if (text.startsWith('-')) { sign = -1; text = text.slice(1).trim() }
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(text)) return NaN
  return sign * Number(text.replace(/\./g, '').replace(',', '.'))
}

function splitRows(text) {
  return String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.split('\t').map(cell => cell.trim()))
}

function findHeader(rows, columns) {
  for (let index = 0; index < rows.length; index++) {
    const cells = rows[index]
    const positions = {}
    for (const [key, names] of Object.entries(columns)) {
      const position = cells.findIndex(cell => names.includes(cell))
      if (position === -1) break
      positions[key] = position
    }
    if (Object.keys(positions).length === Object.keys(columns).length) return { index, positions }
  }
  return null
}

const MB52_COLUMNS = {
  material: ['Material', 'Materiale'],
  description: ['Material Description', 'Materialebeskrivelse', 'Materialetekst'],
  plant: ['Plnt', 'Plant', 'Fabr.', 'Fabrik'],
  sloc: ['Loca', 'SLoc', 'Stor. Loc.', 'Storage Location', 'Lagersted', 'LagSt'],
  unrestricted: ['Unrestricted', 'Fri anvendelse', 'Fri anv.'],
  blocked: ['Blocked', 'Spærret'],
  valueUnrestricted: ['Value Unrestricted', 'Værdi fri anv.', 'Værdi fri'],
  valueBlocked: ['Value BlockedStock', 'Value Blocked Stock', 'Værdi spærret'],
}

function parseMb52(text) {
  const rows = splitRows(text)
  const header = findHeader(rows, MB52_COLUMNS)
  if (!header) throw formatError('MB52-listen har ikke de forventede kolonner')
  const { positions } = header
  const result = []
  for (const cells of rows.slice(header.index + 1)) {
    const sloc = cells[positions.sloc] || ''
    const material = cells[positions.material] || ''
    if (!material || !/^[A-Z0-9]{4}$/i.test(sloc)) continue
    const numbers = ['unrestricted', 'blocked', 'valueUnrestricted', 'valueBlocked'].map(key => parseSapNumber(cells[positions[key]]))
    if (numbers.some(Number.isNaN)) throw formatError(`Ugyldigt tal i linjen for ${material}`)
    result.push({
      material: material.toUpperCase(),
      description: cells[positions.description] || '',
      plant: (cells[positions.plant] || '').toUpperCase(),
      sloc: sloc.toUpperCase(),
      unrestricted: numbers[0],
      blocked: numbers[1],
      valueUnrestricted: numbers[2],
      valueBlocked: numbers[3],
    })
  }
  return result
}

const IQ09_COLUMNS = {
  plant: ['Plnt', 'Plant', 'Fabr.', 'Fabrik'],
  sloc: ['Location', 'Loca', 'SLoc', 'Stor. Loc.', 'Lagersted'],
  serial: ['Serial Number', 'Serienummer', 'Serienr.'],
  material: ['Material', 'Materiale'],
  description: ['Material Description', 'Materialebeskrivelse', 'Materialetekst'],
}
const STOCK_TYPES = new Set(['unrestricted', 'blocked'])

function parseIq09(text, stockType) {
  if (!STOCK_TYPES.has(stockType)) throw formatError('Ukendt lagertype')
  const rows = splitRows(text)
  const header = findHeader(rows, IQ09_COLUMNS)
  if (!header) throw formatError('IQ09-listen har ikke de forventede kolonner')
  const { positions } = header
  const statusPosition = rows[header.index].findIndex(cell => ['UserStatus', 'User Status', 'Brugerstatus'].includes(cell))
  const result = []
  for (const cells of rows.slice(header.index + 1)) {
    const serial = (cells[positions.serial] || '').toUpperCase()
    const material = (cells[positions.material] || '').toUpperCase()
    const sloc = (cells[positions.sloc] || '').toUpperCase()
    if (!serial || !material || !/^[A-Z0-9]{4}$/.test(sloc)) continue
    result.push({
      serial,
      material,
      description: cells[positions.description] || '',
      plant: (cells[positions.plant] || '').toUpperCase(),
      sloc,
      userStatus: statusPosition === -1 ? '' : cells[statusPosition] || '',
      stockType,
    })
  }
  return result
}

/** "4900229137 2026 01" as typed in ZMS_REP/ZMS_PREP: 10-digit document, optional 4-digit year and item. */
function normalizeMatdoc(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  return /^\d{10}( \d{4}( \d{1,4})?)?$/.test(text) ? text : null
}

/** The serial list saved by scripts/sap/matdoc.vbs (column names from ZMS_REP or ZMS_PREP). */
function parseMatdoc(text) {
  const rows = splitRows(text)
  const header = rows[0] || []
  const at = name => header.indexOf(name)
  if (at('SERNR') === -1) throw formatError('Materialedokument-listen har ikke de forventede kolonner')
  const result = []
  for (const cells of rows.slice(1)) {
    const serial = (cells[at('SERNR')] || '').toUpperCase()
    if (!serial) continue
    let plant = at('WERKS') !== -1 ? cells[at('WERKS')] || '' : ''
    let sloc = at('LGORT') !== -1 ? cells[at('LGORT')] || '' : ''
    if (at('WERKS_LGORT') !== -1) [plant, sloc] = (cells[at('WERKS_LGORT')] || '').split('-')
    result.push({
      serial,
      material: (cells[at('MATNR')] || '').toUpperCase(),
      description: cells[at('MAKTX')] || '',
      plant: (plant || '').toUpperCase(),
      sloc: (sloc || '').toUpperCase(),
      userStatus: (at('USER_STAT_TXT') !== -1 ? cells[at('USER_STAT_TXT')] : cells[at('USER_STAT')]) || '',
    })
  }
  return result
}

/** The list saved by scripts/sap/longserno.vbs from SQ01 query ZMS_LONG_SERNO: SERGE is the long serial number. */
function parseLongSerno(text) {
  const rows = splitRows(text)
  const header = rows[0] || []
  const at = name => header.indexOf(name)
  if (at('SERNR') === -1 || at('SERGE') === -1) throw formatError('Listen over lange serienumre har ikke de forventede kolonner')
  const result = []
  for (const cells of rows.slice(1)) {
    const serial = (cells[at('SERNR')] || '').trim().toUpperCase()
    if (!serial) continue
    result.push({ serial, long: (cells[at('SERGE')] || '').trim().toUpperCase(), material: (at('MATNR') !== -1 ? cells[at('MATNR')] || '' : '').trim().toUpperCase() })
  }
  return result
}

/** ZMS_STOCK_SER_CHK2 as saved by scripts/sap/stockcheck.vbs: stock (LABST/SPEME) and serial counts (SNO_UNR/SNO_BLK) per material and location. */
function parseStockCheck(text) {
  const rows = splitRows(text)
  const header = rows[0] || []
  const at = name => header.indexOf(name)
  const columns = ['MATNR', 'WERKS', 'LGORT', 'LABST', 'SNO_UNR', 'SPEME', 'SNO_BLK']
  if (columns.some(name => at(name) === -1)) throw formatError('ZMS_STOCK_SER_CHK2-listen har ikke de forventede kolonner')
  const result = []
  let lastSloc = ''
  for (const cells of rows.slice(1)) {
    const material = (cells[at('MATNR')] || '').trim().toUpperCase()
    if (!material) continue
    // ALV can leave a repeated location blank; it is the one above.
    const sloc = (cells[at('LGORT')] || '').trim().toUpperCase() || lastSloc
    lastSloc = sloc
    const numbers = ['LABST', 'SNO_UNR', 'SPEME', 'SNO_BLK'].map(name => parseSapNumber(cells[at(name)]))
    if (numbers.some(Number.isNaN)) throw formatError(`Ugyldigt tal i ZMS_STOCK_SER_CHK2 for ${material}`)
    result.push({ material, plant: (cells[at('WERKS')] || '').trim().toUpperCase(), sloc, unrestricted: numbers[0], serialsUnrestricted: numbers[1], blocked: numbers[2], serialsBlocked: numbers[3] })
  }
  return result
}

/** MI31's log in test mode ("Select Data and Issue Log"): the items it would create and the number of errors. */
function parseMi31Log(text) {
  const rows = splitRows(text)
  const stat = label => {
    const line = rows.find(cells => cells.some(cell => cell.startsWith(label)))
    const match = line && line.join(' ').match(new RegExp(`${label}\\s+(\\d+)`))
    return match ? Number(match[1]) : 0
  }
  const header = findHeader(rows, { plant: ['Plnt', 'Plant', 'Fabr.'], sloc: ['Location', 'SLoc', 'Lager'], material: ['Material', 'Materiale'] })
  const statistics = rows.some(cells => cells.some(cell => cell.includes('S t a t i s t i c s')))
  if (!header && !statistics) throw formatError('MI31-loggen har ikke det forventede format')
  const items = []
  for (const cells of header ? rows.slice(header.index + 1) : []) {
    const plant = (cells[header.positions.plant] || '').toUpperCase()
    const material = (cells[header.positions.material] || '').toUpperCase()
    if (/^[A-Z]\d{3}$/.test(plant) && material) items.push({ plant, sloc: (cells[header.positions.sloc] || '').toUpperCase(), material, message: '' })
    else if (items.length && cells.some(Boolean) && !cells.includes('Msg.')) items[items.length - 1].message = cells.filter(Boolean).join(' ')
  }
  return { units: stat('Total Number of Stock Management Units for PI'), possible: stat('Number of Possible PID Items'), errors: stat('Number of Errors Found'), items }
}

/** MI22 (documents per material): a material line followed by its documents. */
function parseMi22(text) {
  const rows = splitRows(text)
  const top = findHeader(rows, { material: ['Material', 'Materiale'], plant: ['Plnt', 'Plant'], sloc: ['Location', 'SLoc'] })
  const docs = findHeader(rows, { docNo: ['PhysInvDoc'], item: ['Item'], planned: ['Plan. Date'], stockType: ['STy'], physInvNo: ['Phys. Inv. No.'], status: ['Doc. Status'] })
  if (!top || !docs) throw formatError('MI22-listen har ikke de forventede kolonner')
  const result = []
  let current = null
  for (const cells of rows.slice(Math.max(top.index, docs.index) + 1)) {
    const docNo = cells[docs.positions.docNo] || ''
    if (/^\d{9,10}$/.test(docNo)) {
      if (current) result.push({ ...current, docNo, item: Number(cells[docs.positions.item]) || 0, planned: cells[docs.positions.planned] || '', stockType: cells[docs.positions.stockType] || '', physInvNo: (cells[docs.positions.physInvNo] || '').toUpperCase(), status: cells[docs.positions.status] || '' })
    } else if (cells[top.positions.material]) {
      current = { material: cells[top.positions.material].toUpperCase(), plant: (cells[top.positions.plant] || '').toUpperCase(), sloc: (cells[top.positions.sloc] || '').toUpperCase() }
    }
  }
  return result
}

/** MI20 (list of inventory differences): book, counted and difference per document item. */
function parseMi20(text) {
  const rows = splitRows(text)
  const header = findHeader(rows, { docNo: ['PhysInvDoc'], item: ['Item'], material: ['Material'], book: ['Book Quantity'], counted: ['Qty Counted'], diff: ['Difference qty'], amount: ['Difference Amt.'] })
  if (!header) throw formatError('MI20-listen har ikke de forventede kolonner')
  const at = key => header.positions[key]
  const result = []
  for (const cells of rows.slice(header.index + 1)) {
    const docNo = cells[at('docNo')] || ''
    if (!/^\d{9,10}$/.test(docNo)) continue
    const numbers = ['book', 'counted', 'diff', 'amount'].map(key => parseSapNumber(cells[at(key)]))
    if (numbers.some(Number.isNaN)) throw formatError(`Ugyldigt tal i MI20 for ${docNo}`)
    result.push({ docNo, item: Number(cells[at('item')]) || 0, material: (cells[at('material')] || '').toUpperCase(), book: numbers[0], counted: numbers[1], diff: numbers[2], amount: numbers[3] })
  }
  return result
}

const MM60_COLUMNS = {
  material: ['MATNR', 'Material', 'Materiale'],
  description: ['MAKTX', 'Material Description', 'Materialebeskrivelse', 'Materialekorttekst', 'Materialetekst'],
}

/** MM60's material list as saved by sap/mm60.vbs: one row per material and plant, so the first row per material wins. */
function parseMm60(text) {
  const rows = splitRows(text)
  const header = findHeader(rows, MM60_COLUMNS)
  if (!header) throw formatError('MM60-listen har ikke de forventede kolonner')
  const seen = new Map()
  for (const cells of rows.slice(header.index + 1)) {
    const material = (cells[header.positions.material] || '').toUpperCase()
    const description = cells[header.positions.description] || ''
    if (!material || /^-+$/.test(material) || !description || seen.has(material)) continue
    seen.set(material, { material, description })
  }
  return [...seen.values()]
}

/**
 * Serial lookup saved by sap/sl-lookup.vbs from ZMS_PREP (LGORT, STOCK_TYPE_ICON, USER_STAT) or ZMS_REP
 * (WERKS_LGORT "D301-D000", STOCK_TYPE, USER_STAT_TXT). Blocked stock is icon @06@ or stock type 07.
 */
function parseSlLookup(text) {
  const rows = splitRows(text)
  const header = rows[0] || []
  const at = name => header.indexOf(name)
  if (at('SERNR') === -1 || at('MATNR') === -1) throw formatError('Softwareload-opslaget har ikke de forventede kolonner')
  const cell = (cells, name) => (at(name) !== -1 ? cells[at(name)] || '' : '')
  const result = []
  for (const cells of rows.slice(1)) {
    const serial = cell(cells, 'SERNR').toUpperCase()
    if (!serial) continue
    let plant = ''
    let sloc = cell(cells, 'LGORT')
    if (at('WERKS_LGORT') !== -1) [plant, sloc] = cell(cells, 'WERKS_LGORT').split('-')
    result.push({
      serial,
      material: cell(cells, 'MATNR').toUpperCase(),
      plant: (plant || '').trim().toUpperCase(),
      sloc: (sloc || '').trim().toUpperCase(),
      blocked: /^@06[@\\]/.test(cell(cells, 'STOCK_TYPE_ICON')) || cell(cells, 'STOCK_TYPE') === '07',
      userStatus: at('USER_STAT_TXT') !== -1 ? cell(cells, 'USER_STAT_TXT') : cell(cells, 'USER_STAT'),
    })
  }
  return result
}

/** The error log of a rejected ZMS_PREP/ZMS_REP Transfer as saved by sap/sl-transfer.vbs: MESSAGE, MESSAGE_V3 (material), MESSAGE_V4 (plant and location). */
function parseSlErrors(text) {
  return splitRows(text)
    .filter(cells => cells[0] && cells[0] !== 'MESSAGE')
    .map(([message, material = '', where = '']) => ({ message, material: material.toUpperCase(), where }))
}

module.exports = { parseSapNumber, parseMb52, parseIq09, parseMatdoc, normalizeMatdoc, parseLongSerno, parseStockCheck, parseMi31Log, parseMi22, parseMi20, parseMm60, parseSlLookup, parseSlErrors }
