// The count report as a simple Excel workbook (exceljs). Cells hold plain text, numbers and dates only:
// no formulas, so nothing a counter typed can ever run as one.
const fs = require('node:fs')
const path = require('node:path')
const ExcelJS = require('exceljs')
const { scopeStockTypes } = require('./core/scopes.cjs')
const { teamOfSloc } = require('./core/sapCheck.cjs')

const STOCK_LABELS = { unrestricted: 'Unblocked', blocked: 'Blocked' }
const DATE_FORMAT = 'dd-mm-yyyy hh:mm'
const MONEY_FORMAT = '#,##0.00'
const KIND_ORDER = ['new', 'used', 'accessory', 'other']

const pad = value => String(value).padStart(2, '0')
const asDate = ms => (Number.isFinite(ms) && ms > 0 ? new Date(ms) : null)
const personName = value => (value && typeof value === 'object' ? value.name || value.email || '' : value || '')

function reportFileName(meta, date = new Date()) {
  const base = String(meta.name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\.{2,}/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .slice(0, 80) || 'Optælling'
  return `${base} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}.xlsx`
}

function addTable(sheet, headers, rows, formats = {}) {
  const header = sheet.addRow(headers)
  header.font = { bold: true }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } }
  for (const row of rows) sheet.addRow(row)
  sheet.views = [{ state: 'frozen', ySplit: sheet.rowCount - rows.length }]
  headers.forEach((title, index) => {
    const column = sheet.getColumn(index + 1)
    column.width = Math.min(Math.max(title.length + 2, 12), 45)
    if (formats[title]) column.numFmt = formats[title]
  })
  if (rows.length) sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number, column: headers.length } }
}

function approvalColumns(approval, text) {
  return [
    text.approvals[approval?.status] || text.counted,
    approval && approval.status !== 'open' ? personName(approval.by) : '',
    approval && approval.status !== 'open' ? asDate(approval.at) : null,
    approval?.status === 'posted' ? personName(approval.postedBy) : '',
    approval?.status === 'posted' ? asDate(approval.postedAt) : null,
    approval?.comment || '',
  ]
}

function rowValues(row, approvals, text) {
  return [row.material, row.description, text.kinds[row.kind] || row.kind, row.sloc, STOCK_LABELS[row.stockType], row.sapQty, row.counted, row.diff, row.unitPrice, row.valueDiff, ...approvalColumns(approvals[row.material], text)]
}

// Count and status reports in the language of the person who makes them (Danish unless English is asked for).
const REPORT_TEXT = {
  da: {
    kinds: { new: 'Nye terminaler', used: 'Brugte terminaler', accessory: 'Tilbehør', other: 'Andet' },
    approvals: { approved: 'Godkendt', posted: 'Bogført i SAP', returned: 'Sendt tilbage', submitted: 'Sendt til godkendelse', open: 'Åben' },
    counted: 'Talt',
    serialStatus: { missing: 'Mangler', 'other-sloc': 'Anden storage location', 'other-count': 'Tælles i anden optælling', outside: 'Uden for optællingen', unknown: 'Ukendt i SAP' },
    moveReasons: { misplaced: 'Hører ikke til på denne storage location', 'other-sloc': 'SAP har den på en anden storage location' },
    sources: { scanned: 'Scannet', imported: 'Importeret', matdoc: 'Matdok' },
    rowHeaders: ['Materiale', 'Beskrivelse', 'Gruppe', 'Storage location', 'Lagertype', 'SAP antal', 'Talt', 'Difference', 'Enhedspris (DKK)', 'Værdidifference (DKK)', 'Status', 'Godkendt af', 'Godkendt', 'Bogført af', 'Bogført', 'Kommentar'],
    serialHeaders: ['Serienummer', 'Materiale', 'Beskrivelse', 'Storage location (SAP)', 'Lagertype', 'Status', 'Fundet sted', 'Fundet af', 'Tidspunkt', 'Kilde'],
    moveHeaders: ['Materiale', 'Serienummer', 'Antal', 'Storage location (SAP)', 'Fundet placering', 'Foreslået storage location', 'Årsag', 'Fundet af', 'Tidspunkt'],
    lineHeaders: ['Placering', 'Område', 'Materiale', 'Storage location', 'Lagertype', 'Antal', 'Status', 'Kommentar', 'Talt af', 'Tidspunkt'],
    lineStatus: { error: 'Fejl', counted: 'Talt' },
    history: { started: 'Startet', locked: 'Godkendt og låst', unlocked: 'Låst op' },
    historyHeaders: ['Tidspunkt', 'Handling', 'Af', 'Begrundelse'],
    sheets: { summary: 'Resumé', differences: 'Differencer', all: 'Alle materialer', serials: 'Serienumre', moves: 'Skal flyttes', lines: 'Tællelinjer', history: 'Historik' },
    and: ' og ',
    total: 'I alt',
    materials: list => `Materialer: ${list}`,
    count: ['Optælling', 'Team', 'Plant', 'Udvalg', 'Lagertype', 'Hentet fra SAP', 'Hentet af', 'Ansvarlig', 'Status', 'Afsluttet', 'Afsluttet af', 'Deltagere', 'Fremdrift', 'Udeladt (andre materialer)', 'Udeladt (valgt)'],
    countStatus: { closed: 'Afsluttet', open: 'Åben' },
    progress: (percent, reached, total) => `${percent} % (${reached} af ${total})`,
    excluded: (materials, quantity) => `${materials} materialer, ${quantity} stk.`,
    totalsHeader: ['Gruppe', 'Lagertype', 'SAP antal', 'Talt', 'Difference', 'Værdidifference (DKK)'],
    status: ['Status', 'Team', 'Version', 'Startet', 'Startet af', 'Godkendt og låst', 'Låst af'],
    statusHeader: ['Optælling', 'Udvalg', 'Lagertype', 'Ansvarlig', 'Afsluttet', 'Fremdrift', 'Difference unblocked (stk.)', 'Værdidifference unblocked (DKK)', 'Difference blocked (stk.)', 'Værdidifference blocked (DKK)', 'Værdidifference i alt (DKK)'],
    countColumn: 'Optælling',
    finalName: (name, version) => `${name} endelig v${version}`,
  },
  en: {
    kinds: { new: 'New terminals', used: 'Used terminals', accessory: 'Accessories', other: 'Other' },
    approvals: { approved: 'Approved', posted: 'Posted in SAP', returned: 'Sent back', submitted: 'Sent for approval', open: 'Open' },
    counted: 'Counted',
    serialStatus: { missing: 'Missing', 'other-sloc': 'Other storage location', 'other-count': 'Counted in another count', outside: 'Outside the count', unknown: 'Unknown in SAP' },
    moveReasons: { misplaced: 'Does not belong on this storage location', 'other-sloc': 'SAP has it on another storage location' },
    sources: { scanned: 'Scanned', imported: 'Imported', matdoc: 'Mat. doc.' },
    rowHeaders: ['Material', 'Description', 'Group', 'Storage location', 'Stock type', 'SAP quantity', 'Counted', 'Difference', 'Unit price (DKK)', 'Value difference (DKK)', 'Status', 'Approved by', 'Approved', 'Posted by', 'Posted', 'Comment'],
    serialHeaders: ['Serial number', 'Material', 'Description', 'Storage location (SAP)', 'Stock type', 'Status', 'Found in', 'Found by', 'Time', 'Source'],
    moveHeaders: ['Material', 'Serial number', 'Quantity', 'Storage location (SAP)', 'Found location', 'Suggested storage location', 'Reason', 'Found by', 'Time'],
    lineHeaders: ['Location', 'Area', 'Material', 'Storage location', 'Stock type', 'Quantity', 'Status', 'Comment', 'Counted by', 'Time'],
    lineStatus: { error: 'Error', counted: 'Counted' },
    history: { started: 'Started', locked: 'Approved and locked', unlocked: 'Unlocked' },
    historyHeaders: ['Time', 'Action', 'By', 'Reason'],
    sheets: { summary: 'Summary', differences: 'Differences', all: 'All materials', serials: 'Serial numbers', moves: 'Must be moved', lines: 'Count lines', history: 'Status history' },
    and: ' and ',
    total: 'Total',
    materials: list => `Materials: ${list}`,
    count: ['Count', 'Team', 'Plant', 'Selection', 'Stock type', 'Fetched from SAP', 'Fetched by', 'Responsible', 'Status', 'Closed', 'Closed by', 'Participants', 'Progress', 'Left out (other materials)', 'Left out (chosen)'],
    countStatus: { closed: 'Closed', open: 'Open' },
    progress: (percent, reached, total) => `${percent} % (${reached} of ${total})`,
    excluded: (materials, quantity) => `${materials} materials, ${quantity} pcs`,
    totalsHeader: ['Group', 'Stock type', 'SAP quantity', 'Counted', 'Difference', 'Value difference (DKK)'],
    status: ['Status', 'Team', 'Version', 'Started', 'Started by', 'Approved and locked', 'Locked by'],
    statusHeader: ['Count', 'Selection', 'Stock type', 'Responsible', 'Closed', 'Progress', 'Difference unblocked (pcs)', 'Value difference unblocked (DKK)', 'Difference blocked (pcs)', 'Value difference blocked (DKK)', 'Value difference total (DKK)'],
    countColumn: 'Count',
    finalName: (name, version) => `${name} final v${version}`,
  },
}
const textFor = language => REPORT_TEXT[language === 'en' ? 'en' : 'da']
// Column formats by position in rowHeaders: unit price, value difference, approved, posted.
const rowFormats = text => ({ [text.rowHeaders[8]]: MONEY_FORMAT, [text.rowHeaders[9]]: MONEY_FORMAT, [text.rowHeaders[12]]: DATE_FORMAT, [text.rowHeaders[14]]: DATE_FORMAT })
const timeFormat = headers => ({ [headers[headers.length - 1]]: DATE_FORMAT })

function serialRowsOf(aggregate, text) {
  return [
    ...aggregate.serials.missing.map(item => [item.serial, item.material, item.description, item.sloc, STOCK_LABELS[item.stockType], text.serialStatus.missing, '', '', null, '']),
    ...aggregate.serials.extra.map(item => [item.serial, item.material || '', item.description || '', item.sloc || '', STOCK_LABELS[item.stockType] || '', item.otherCount ? `${text.serialStatus[item.outcome]}: ${item.otherCount}` : text.serialStatus[item.outcome] || item.outcome, item.place || '', item.byName || item.by || '', asDate(item.at), item.source === 'import' ? (item.document ? `${text.sources.matdoc} ${item.document}` : text.sources.imported) : text.sources.scanned]),
  ]
}

function moveRowsOf(aggregate, text) {
  return aggregate.moves.map(item => [item.material || '', item.serial || '', item.quantity, item.sloc || '', item.place || '', (item.suggestions || []).join(', '), text.moveReasons[item.reason] || item.reason, item.byName || item.by || '', asDate(item.at)])
}

const scopeTextOf = (scope, text) => (scope.type === 'materials' ? text.materials(scope.materials.join(', ')) : `Storage locations: ${scope.slocs.join(', ')}`)
const round2 = value => Math.round(value * 100) / 100 || 0

function buildWorkbook({ meta, snapshot, aggregate, members, approvals, progress, language }) {
  const text = textFor(language)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CountPoint'
  workbook.created = new Date()

  const summary = workbook.addWorksheet(text.sheets.summary)
  summary.getColumn(1).width = 26
  summary.getColumn(2).width = 48
  const values = [
    meta.name,
    meta.team,
    snapshot.plant || 'D301',
    scopeTextOf(meta.scope, text),
    scopeStockTypes(meta.scope).map(type => STOCK_LABELS[type]).join(text.and),
    asDate(snapshot.fetchedAt),
    snapshot.fetchedBy || '',
    personName(meta.owner),
    meta.status === 'closed' ? text.countStatus.closed : text.countStatus.open,
    asDate(meta.closedAt),
    personName(meta.closedBy),
    Object.values(members || {}).filter(member => member.status === 'approved').map(member => member.name).join(', '),
    text.progress(progress?.overall?.percent ?? 0, progress?.overall?.reached ?? 0, progress?.overall?.total ?? 0),
    text.excluded(snapshot.excluded.other.materials, snapshot.excluded.other.quantity),
    snapshot.excluded.manual.map(item => `${item.material}${item.reason ? ` (${item.reason})` : ''}`).join(', '),
  ]
  const info = text.count.map((label, index) => [label, values[index]])
  for (const [label, value] of info) {
    const row = summary.addRow([label, value])
    row.getCell(1).font = { bold: true }
    if (value instanceof Date) row.getCell(2).numFmt = DATE_FORMAT
  }
  summary.addRow([])
  const tableHeader = summary.addRow(text.totalsHeader)
  tableHeader.font = { bold: true }
  const total = { sapQty: 0, counted: 0, diff: 0, valueDiff: 0 }
  for (const kind of KIND_ORDER) {
    for (const stockType of ['unrestricted', 'blocked']) {
      const bucket = aggregate.totals?.[kind]?.[stockType]
      if (!bucket) continue
      summary.addRow([text.kinds[kind], STOCK_LABELS[stockType], bucket.sapQty, bucket.counted, bucket.diff, bucket.valueDiff]).getCell(6).numFmt = MONEY_FORMAT
      total.sapQty += bucket.sapQty
      total.counted += bucket.counted
      total.diff += bucket.diff
      total.valueDiff = Math.round((total.valueDiff + bucket.valueDiff) * 100) / 100
    }
  }
  const totalRow = summary.addRow([text.total, '', total.sapQty, total.counted, total.diff, total.valueDiff])
  totalRow.font = { bold: true }
  totalRow.getCell(6).numFmt = MONEY_FORMAT
  for (const column of [3, 4, 5, 6]) summary.getColumn(column).width = 18

  const differences = aggregate.rows
    .map((row, order) => ({ row, order }))
    .filter(({ row }) => row.diff !== 0)
    .sort((a, b) => Math.abs(b.row.valueDiff || 0) - Math.abs(a.row.valueDiff || 0) || a.order - b.order)
    .map(({ row }) => rowValues(row, approvals || {}, text))
  addTable(workbook.addWorksheet(text.sheets.differences), text.rowHeaders, differences, rowFormats(text))
  addTable(workbook.addWorksheet(text.sheets.all), text.rowHeaders, aggregate.rows.map(row => rowValues(row, approvals || {}, text)), rowFormats(text))

  addTable(workbook.addWorksheet(text.sheets.serials), text.serialHeaders, serialRowsOf(aggregate, text), timeFormat(text.serialHeaders.slice(0, 9)))

  addTable(workbook.addWorksheet(text.sheets.moves), text.moveHeaders, moveRowsOf(aggregate, text), timeFormat(text.moveHeaders))

  const lineRows = aggregate.lines.map(line => [line.place, line.area, line.material, line.sloc, STOCK_LABELS[line.stockType], line.qty, line.status === 'error' ? text.lineStatus.error : text.lineStatus.counted, line.comment, line.byName || line.by || '', asDate(line.at)])
  addTable(workbook.addWorksheet(text.sheets.lines), text.lineHeaders, lineRows, timeFormat(text.lineHeaders))
  return workbook
}

async function writeReport(data, dir, date = new Date()) {
  return writeWorkbook(buildWorkbook(data), dir, reportFileName(data.meta, date))
}

async function writeWorkbook(workbook, dir, name) {
  await fs.promises.mkdir(dir, { recursive: true })
  let target = path.join(dir, name)
  for (let attempt = 2; fs.existsSync(target); attempt++) target = path.join(dir, name.replace(/\.xlsx$/, ` (${attempt}).xlsx`))
  const temp = `${target}.${process.pid}.tmp`
  await workbook.xlsx.writeFile(temp)
  await fs.promises.rename(temp, target)
  return target
}

function stockTotals(aggregate) {
  const result = { unrestricted: { diff: 0, valueDiff: 0 }, blocked: { diff: 0, valueDiff: 0 } }
  for (const row of aggregate.rows) {
    result[row.stockType].diff += row.diff
    result[row.stockType].valueDiff = round2(result[row.stockType].valueDiff + (row.valueDiff || 0))
  }
  return result
}

/** The final report of a status: every count of it together, written when a manager locks the status. */
function buildStatusWorkbook({ status, version, counts, language }) {
  const text = textFor(language)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CountPoint'
  workbook.created = new Date()

  const summary = workbook.addWorksheet(text.sheets.summary)
  summary.getColumn(1).width = 30
  summary.getColumn(2).width = 40
  const values = [status.name, status.team, version, asDate(status.startedAt), personName(status.startedBy), asDate(status.lockedAt), personName(status.lockedBy)]
  const info = text.status.map((label, index) => [label, values[index]])
  for (const [label, value] of info) {
    const row = summary.addRow([label, value])
    row.getCell(1).font = { bold: true }
    if (value instanceof Date) row.getCell(2).numFmt = DATE_FORMAT
  }
  summary.addRow([])
  const header = summary.addRow(text.statusHeader)
  header.font = { bold: true }
  const total = { fri: 0, friValue: 0, blocked: 0, blockedValue: 0 }
  for (const data of counts) {
    const sums = stockTotals(data.aggregate)
    const row = summary.addRow([
      data.meta.name, scopeTextOf(data.meta.scope, text), scopeStockTypes(data.meta.scope).map(type => STOCK_LABELS[type]).join(text.and), personName(data.meta.owner), asDate(data.meta.closedAt),
      `${data.progress?.overall?.percent ?? 0} %`, sums.unrestricted.diff, sums.unrestricted.valueDiff, sums.blocked.diff, sums.blocked.valueDiff, round2(sums.unrestricted.valueDiff + sums.blocked.valueDiff),
    ])
    row.getCell(5).numFmt = DATE_FORMAT
    for (const column of [8, 10, 11]) row.getCell(column).numFmt = MONEY_FORMAT
    total.fri += sums.unrestricted.diff
    total.friValue = round2(total.friValue + sums.unrestricted.valueDiff)
    total.blocked += sums.blocked.diff
    total.blockedValue = round2(total.blockedValue + sums.blocked.valueDiff)
  }
  const totalRow = summary.addRow([text.total, '', '', '', null, '', total.fri, total.friValue, total.blocked, total.blockedValue, round2(total.friValue + total.blockedValue)])
  totalRow.font = { bold: true }
  for (const column of [8, 10, 11]) totalRow.getCell(column).numFmt = MONEY_FORMAT
  for (const column of [3, 4, 5, 6, 7, 8, 9, 10, 11]) summary.getColumn(column).width = 20

  const differences = []
  for (const stockType of ['unrestricted', 'blocked']) {
    const rows = counts.flatMap(data => data.aggregate.rows.filter(row => row.diff !== 0 && row.stockType === stockType).map(row => ({ name: data.meta.name, row, approvals: data.approvals || {} })))
    rows.sort((a, b) => Math.abs(b.row.valueDiff || 0) - Math.abs(a.row.valueDiff || 0))
    for (const item of rows) differences.push([item.name, ...rowValues(item.row, item.approvals, text)])
  }
  addTable(workbook.addWorksheet(text.sheets.differences), [text.countColumn, ...text.rowHeaders], differences, rowFormats(text))
  addTable(workbook.addWorksheet(text.sheets.serials), [text.countColumn, ...text.serialHeaders], counts.flatMap(data => serialRowsOf(data.aggregate, text).map(row => [data.meta.name, ...row])), timeFormat(text.serialHeaders.slice(0, 9)))
  addTable(workbook.addWorksheet(text.sheets.moves), [text.countColumn, ...text.moveHeaders], counts.flatMap(data => moveRowsOf(data.aggregate, text).map(row => [data.meta.name, ...row])), timeFormat(text.moveHeaders))
  const history = (status.history || []).map(entry => [asDate(entry.at), text.history[entry.action] || entry.action, personName(entry.by), entry.reason || ''])
  addTable(workbook.addWorksheet(text.sheets.history), text.historyHeaders, history, { [text.historyHeaders[0]]: DATE_FORMAT })
  return workbook
}

async function writeStatusReport(data, dir, date = new Date()) {
  const name = reportFileName({ name: textFor(data.language).finalName(data.status.name, data.version) }, date)
  return writeWorkbook(buildStatusWorkbook(data), dir, name)
}

const SAP_CHECK_TEXT = {
  da: {
    file: 'SAP-fejl',
    sheets: ['Resumé', 'Fejl', 'Serienumre', 'Rettet siden sidst'],
    types: { 'count-mismatch': 'Antal passer ikke', 'duplicate-serial': 'Serienummer flere steder', 'stock-without-serials': 'Lager uden serienumre', 'serials-without-stock': 'Serienumre uden lager' },
    status: { new: 'Ny', open: 'Stadig ikke rettet' },
    info: ['Team', 'Plant', 'Storage locations', 'Tjekket', 'Tjekket af', 'Med i filen', 'Fejl i filen', 'Nye siden sidste tjek', 'Stadig ikke rettet', 'Rettet siden sidste tjek'],
    modes: { new: 'Kun nye fejl', all: 'Alle åbne fejl' },
    errorHeaders: ['Type', 'Status', 'Først fundet', 'Materiale', 'Beskrivelse', 'Sloc', 'Lagertype', 'Lager (MB52)', 'Serienumre (IQ09)', 'Difference', 'Andre steder', 'Team', 'Fundet af'],
    sources: { both: 'CountPoint og ZMS_STOCK_SER_CHK2', countpoint: 'Kun CountPoint', 'sap-report': 'Kun ZMS_STOCK_SER_CHK2' },
    serialHeaders: ['Type', 'Serienummer', 'Materiale', 'Sloc', 'Lagertype', 'Bemærkning'],
    fixedHeaders: ['Type', 'Materiale', 'Beskrivelse', 'Sloc', 'Lagertype', 'Først fundet'],
    places: (count, list) => `Står ${count} steder: ${list}`,
    noStock: 'Serienummer uden lager på denne lagertype',
  },
  en: {
    file: 'SAP errors',
    sheets: ['Summary', 'Errors', 'Serial numbers', 'Fixed since last check'],
    types: { 'count-mismatch': 'Quantity does not match', 'duplicate-serial': 'Serial number in several places', 'stock-without-serials': 'Stock without serial numbers', 'serials-without-stock': 'Serial numbers without stock' },
    status: { new: 'New', open: 'Still not fixed' },
    info: ['Team', 'Plant', 'Storage locations', 'Checked', 'Checked by', 'In this file', 'Errors in this file', 'New since last check', 'Still not fixed', 'Fixed since last check'],
    modes: { new: 'Only new errors', all: 'All open errors' },
    errorHeaders: ['Error type', 'Status', 'First found', 'Material', 'Description', 'SLoc', 'Stock type', 'Stock (MB52)', 'Serial numbers (IQ09)', 'Difference', 'Other places', 'Team', 'Found by'],
    sources: { both: 'CountPoint and ZMS_STOCK_SER_CHK2', countpoint: 'CountPoint only', 'sap-report': 'ZMS_STOCK_SER_CHK2 only' },
    serialHeaders: ['Error type', 'Serial number', 'Material', 'SLoc', 'Stock type', 'Note'],
    fixedHeaders: ['Error type', 'Material', 'Description', 'SLoc', 'Stock type', 'First found'],
    places: (count, list) => `Is in ${count} places: ${list}`,
    noStock: 'Serial number without stock for this stock type',
  },
}
const placeText = place => `${place.material} ${place.sloc} ${STOCK_LABELS[place.stockType]}`

/** The SAP errors for the SAP team (Danish or English): the errors chosen for the mail, their serial numbers and what was fixed since. */
function buildSapCheckWorkbook({ team, check, errors, mode, language }) {
  const text = SAP_CHECK_TEXT[language === 'en' ? 'en' : 'da']
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CountPoint'
  workbook.created = new Date()
  const summary = workbook.addWorksheet(text.sheets[0])
  summary.getColumn(1).width = 32
  summary.getColumn(2).width = 50
  const counts = type => errors.filter(error => error.type === type).length
  const [teamLabel, plant, slocs, checked, checkedBy, inFile, total, fresh, open, fixed] = text.info
  const info = [
    [teamLabel, team],
    [plant, 'D301'],
    [slocs, (check.slocs || []).join(', ')],
    [checked, asDate(check.at)],
    [checkedBy, personName(check.by)],
    [inFile, mode === 'new' ? text.modes.new : text.modes.all],
    [total, errors.length],
    ...Object.entries(text.types).map(([type, label]) => [`  ${label}`, counts(type)]),
    [fresh, errors.filter(error => error.status === 'new').length],
    [open, errors.filter(error => error.status === 'open').length],
    [fixed, (check.fixed || []).length],
  ]
  for (const [label, value] of info) {
    const row = summary.addRow([label, value])
    row.getCell(1).font = { bold: true }
    if (value instanceof Date) row.getCell(2).numFmt = DATE_FORMAT
  }
  const firstFound = text.errorHeaders[2]
  addTable(workbook.addWorksheet(text.sheets[1]), text.errorHeaders, errors.map(error => [
    text.types[error.type], text.status[error.status] || '', asDate(error.firstSeen), error.material, error.description, error.sloc, STOCK_LABELS[error.stockType],
    error.sapQty, error.serialCount, error.sapQty === null ? null : error.serialCount - error.sapQty,
    error.locations.filter(place => place.sloc !== error.sloc || place.material !== error.material || place.stockType !== error.stockType).map(placeText).join('; '),
    teamOfSloc(error.sloc) || '', text.sources[error.source] || '',
  ]), { [firstFound]: DATE_FORMAT })
  const serialRows = errors.flatMap(error => error.serials.map(serial => [text.types[error.type], serial, error.material, error.sloc, STOCK_LABELS[error.stockType], error.type === 'duplicate-serial' ? text.places(error.locations.length, error.locations.map(placeText).join('; ')) : text.noStock]))
  addTable(workbook.addWorksheet(text.sheets[2]), text.serialHeaders, serialRows)
  addTable(workbook.addWorksheet(text.sheets[3]), text.fixedHeaders, (check.fixed || []).map(error => [text.types[error.type], error.material, error.description, error.sloc, STOCK_LABELS[error.stockType], asDate(error.firstSeen)]), { [text.fixedHeaders[5]]: DATE_FORMAT })
  return workbook
}

async function writeSapCheckReport(data, dir, date = new Date()) {
  const text = SAP_CHECK_TEXT[data.language === 'en' ? 'en' : 'da']
  return writeWorkbook(buildSapCheckWorkbook(data), dir, reportFileName({ name: `${text.file} ${data.team}` }, date))
}

module.exports = { writeReport, writeStatusReport, writeSapCheckReport, buildWorkbook, buildStatusWorkbook, buildSapCheckWorkbook, reportFileName }
