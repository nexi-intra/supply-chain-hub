// The e-mail to the SAP team about SAP errors, in Danish or English. Everything from SAP is escaped: it ends up as
// HTML in Outlook.
const STOCK = { unrestricted: 'Unblocked', blocked: 'Blocked' }
const TABLE_ROWS_MAX = 25
const pad = value => String(value).padStart(2, '0')

const TEXT = {
  da: {
    locale: 'da-DK',
    date: date => `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`,
    subject: (team, date, count, suffix) => `SAP-fejl D301 ${team} ${date} – ${count} fejl${suffix}`,
    onlyNew: ' (nye)',
    someNew: fresh => ` (${fresh} nye)`,
    types: { 'count-mismatch': 'Antal passer ikke med serienumre', 'duplicate-serial': 'Serienummer flere steder', 'stock-without-serials': 'Lager uden serienumre', 'serials-without-stock': 'Serienumre uden lager' },
    greeting: 'Hej SAP-team',
    intro: (team, slocs, date, count, mode) => `Vi har tjekket lagerbeholdning (MB52) mod serienumre (IQ09) for plant D301, ${team} (${slocs}) den ${date}. Vi har fundet ${count} ${mode === 'new' ? 'nye fejl siden sidste tjek' : 'fejl, der ikke er rettet'}. Vil I rette dem?`,
    countHeaders: ['Fejltype', 'Antal'],
    first: shown => `De første ${shown} fejl:`,
    all: 'Fejlene:',
    headers: ['Fejltype', 'Materiale', 'Beskrivelse', 'Sloc', 'Lagertype', 'Bemærkning'],
    attached: 'Hele listen med serienumre ligger i den vedhæftede Excel-fil.',
    thanks: 'På forhånd tak.',
    mismatch: (stock, serials) => `${stock} på lager, ${serials} serienumre`,
    noSerials: stock => `${stock} på lager, ingen serienumre`,
    noStock: (serials, type) => `${serials} serienumre, intet ${type} lager`,
    places: (serial, count, list) => `${serial} står ${count} steder: ${list}`,
  },
  en: {
    locale: 'en-GB',
    date: date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    subject: (team, date, count, suffix) => `SAP errors D301 ${team} ${date} – ${count} ${count === 1 ? 'error' : 'errors'}${suffix}`,
    onlyNew: ' (new)',
    someNew: fresh => ` (${fresh} new)`,
    types: { 'count-mismatch': 'Quantity does not match serial numbers', 'duplicate-serial': 'Serial number in several places', 'stock-without-serials': 'Stock without serial numbers', 'serials-without-stock': 'Serial numbers without stock' },
    greeting: 'Hello SAP team',
    intro: (team, slocs, date, count, mode) => `We have checked stock (MB52) against serial numbers (IQ09) for plant D301, ${team} (${slocs}) on ${date}. We found ${count} ${mode === 'new' ? 'new errors since the last check' : 'errors that have not been corrected'}. Could you please correct them?`,
    countHeaders: ['Error type', 'Count'],
    first: shown => `The first ${shown} errors:`,
    all: 'The errors:',
    headers: ['Error type', 'Material', 'Description', 'SLoc', 'Stock type', 'Details'],
    attached: 'The full list including serial numbers is in the attached Excel file.',
    thanks: 'Thank you in advance.',
    mismatch: (stock, serials) => `${stock} in stock, ${serials} serial numbers`,
    noSerials: stock => `${stock} in stock, no serial numbers`,
    noStock: (serials, type) => `${serials} serial numbers, no ${type} stock`,
    places: (serial, count, list) => `${serial} is in ${count} places: ${list}`,
  },
}

const languageOf = value => (value === 'en' ? 'en' : 'da')

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function remark(error, text, number) {
  if (error.type === 'count-mismatch') return text.mismatch(number(error.sapQty), number(error.serialCount))
  if (error.type === 'stock-without-serials') return text.noSerials(number(error.sapQty))
  if (error.type === 'serials-without-stock') return text.noStock(number(error.serialCount), STOCK[error.stockType].toLowerCase())
  return text.places(error.serials[0], error.locations.length, error.locations.map(place => `${place.material} ${place.sloc} ${STOCK[place.stockType]}`).join(', '))
}

const CELL = 'border:1px solid #c8d1dc;padding:4px 8px;font-family:Segoe UI,Arial,sans-serif;font-size:10pt'
const HEAD = `${CELL};background:#e8eef5;font-weight:bold;text-align:left`
const P = 'font-family:Segoe UI,Arial,sans-serif;font-size:11pt;margin:0 0 10px'

function table(headers, rows) {
  return `<table style="border-collapse:collapse;margin:8px 0">`
    + `<tr>${headers.map(title => `<th style="${HEAD}">${escapeHtml(title)}</th>`).join('')}</tr>`
    + rows.map(row => `<tr>${row.map(cell => `<td style="${CELL}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
    + '</table>'
}

/** Subject and HTML body for the Outlook draft; the full list is in the attached Excel file. */
function buildSapCheckMail({ team, check, errors, mode, language }) {
  const text = TEXT[languageOf(language)]
  const number = value => new Intl.NumberFormat(text.locale).format(value)
  const date = text.date(new Date(check.at))
  const fresh = errors.filter(error => error.status === 'new').length
  const subject = text.subject(team, date, errors.length, mode === 'new' ? text.onlyNew : fresh ? text.someNew(fresh) : '')
  const counts = Object.entries(text.types).map(([type, label]) => [label, errors.filter(error => error.type === type).length]).filter(row => row[1] > 0).map(([label, count]) => [label, number(count)])
  const shown = errors.slice(0, TABLE_ROWS_MAX)
  const html = [
    `<p style="${P}">${escapeHtml(text.greeting)}</p>`,
    `<p style="${P}">${escapeHtml(text.intro(team, (check.slocs || []).join(', '), date, number(errors.length), mode))}</p>`,
    table(text.countHeaders, counts),
    `<p style="${P}">${escapeHtml(errors.length > shown.length ? text.first(shown.length) : text.all)}</p>`,
    table(text.headers, shown.map(error => [text.types[error.type], error.material, error.description, error.sloc, STOCK[error.stockType], remark(error, text, number)])),
    `<p style="${P}">${escapeHtml(text.attached)}</p>`,
    `<p style="${P}">${escapeHtml(text.thanks)}</p>`,
  ].join('\n')
  return { subject, html }
}

module.exports = { buildSapCheckMail, escapeHtml, languageOf }
