// Test-side reference for dates in answers. It is written separately from assistantDateFormat.cjs (own tables, own weekday arithmetic),
// so a bank expectation written as an ISO day is compared with the independently derived natural text. Today in the fixture is Tuesday 2026-09-15.
const DAY_NAMES = {
  da: { 0: 'lørdag', 1: 'søndag', 2: 'mandag', 3: 'tirsdag', 4: 'onsdag', 5: 'torsdag', 6: 'fredag' },
  en: { 0: 'Sat', 1: 'Sun', 2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri' },
  fi: { 0: 'lauantai', 1: 'sunnuntai', 2: 'maanantai', 3: 'tiistai', 4: 'keskiviikko', 5: 'torstai', 6: 'perjantai' },
  sv: { 0: 'lördag', 1: 'söndag', 2: 'måndag', 3: 'tisdag', 4: 'onsdag', 5: 'torsdag', 6: 'fredag' },
}
const FI_ON = { lauantai: 'lauantaina', sunnuntai: 'sunnuntaina', maanantai: 'maanantaina', tiistai: 'tiistaina', keskiviikko: 'keskiviikkona', torstai: 'torstaina', perjantai: 'perjantaina' }
const MONTH_NAMES = {
  da: 'jan. feb. mar. apr. maj jun. jul. aug. sep. okt. nov. dec.'.split(' '),
  en: 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' '),
  sv: 'jan. feb. mars apr. maj juni juli aug. sep. okt. nov. dec.'.split(' '),
}
const WORDS = {
  da: { '-1': 'i går', 0: 'i dag', 1: 'i morgen' },
  en: { '-1': 'yesterday', 0: 'today', 1: 'tomorrow' },
  fi: { '-1': 'eilen', 0: 'tänään', 1: 'huomenna' },
  sv: { '-1': 'igår', 0: 'idag', 1: 'imorgon' },
}
const TODAY = '2026-09-15'
const split = iso => iso.split('-').map(Number)
// Zeller's congruence (0 = Saturday); independent of Date.
function zeller(iso) {
  const [year, month, day] = split(iso)
  const m = month < 3 ? month + 12 : month
  const y = month < 3 ? year - 1 : year
  return (day + Math.floor(13 * (m + 1) / 5) + (y % 100) + Math.floor((y % 100) / 4) + Math.floor(Math.floor(y / 100) / 4) + 5 * Math.floor(y / 100)) % 7
}
const serial = iso => { const [year, month, day] = split(iso); return Math.round(Date.UTC(year, month - 1, day) / 86400000) }
const yearText = (iso, mode = 'auto') => (mode === 'always' || (mode === 'auto' && split(iso)[0] !== split(TODAY)[0]) ? split(iso)[0] : '')

// Per language: one day and month, a same-month range, and how a year is attached.
const STYLE = {
  da: { dm: (d, m) => `${d}. ${MONTH_NAMES.da[m - 1]}`, same: (a, b, m) => `${a}.–${b}. ${MONTH_NAMES.da[m - 1]}`, withYear: (text, y) => `${text} ${y}` },
  en: { dm: (d, m) => `${d} ${MONTH_NAMES.en[m - 1]}`, same: (a, b, m) => `${a}–${b} ${MONTH_NAMES.en[m - 1]}`, withYear: (text, y) => `${text} ${y}` },
  fi: { dm: (d, m) => `${d}.${m}.`, same: (a, b, m) => `${a}.–${b}.${m}.`, withYear: (text, y) => `${text}${y}` },
  sv: { dm: (d, m) => `${d} ${MONTH_NAMES.sv[m - 1]}`, same: (a, b, m) => `${a}–${b} ${MONTH_NAMES.sv[m - 1]}`, withYear: (text, y) => `${text} ${y}` },
}

function dm(iso, lang, mode = 'auto') {
  const [, month, day] = split(iso)
  const year = yearText(iso, mode)
  const text = STYLE[lang].dm(day, month)
  return year ? STYLE[lang].withYear(text, year) : text
}
function refDay(iso, lang, { weekday = true, essive = false } = {}) {
  const name = DAY_NAMES[lang][zeller(iso)]
  const word = essive ? FI_ON[name] || name : name
  return weekday ? `${word} ${dm(iso, lang)}` : dm(iso, lang)
}
function refRange(start, end, lang) {
  if (start === end) return refDay(start, lang)
  const [y1, m1, d1] = split(start); const [y2, m2, d2] = split(end)
  if (y1 !== y2) return `${dm(start, lang, 'always')}–${dm(end, lang, 'always')}`
  const suffix = yearText(end)
  if (m1 === m2) {
    const text = STYLE[lang].same(d1, d2, m2)
    return suffix ? STYLE[lang].withYear(text, suffix) : text
  }
  return `${dm(start, lang, 'never')}–${dm(end, lang, suffix ? 'always' : 'never')}`
}
function refHeading(iso, lang) {
  const distance = serial(iso) - serial(TODAY)
  return Math.abs(distance) <= 1 ? `${WORDS[lang][distance]}, ${refDay(iso, lang)}` : refDay(iso, lang)
}
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ISO = '(\\d{4}-\\d{2}-\\d{2})'

/**
 * A bank expectation written with ISO days ("Godkendt ferie \(2026-09-21 – 2026-09-27\)") becomes the natural text:
 * a range "A – B" -> "21.–27. sep.", "\(A\)" -> the heading form, any other day -> weekday + date (Finnish "palaa X" takes the essive weekday).
 */
function localize(regex, lang) {
  if (!(regex instanceof RegExp)) return regex
  let source = regex.source
  source = source.replace(new RegExp(`${ISO} – ${ISO}`, 'g'), (_, a, b) => escape(refRange(a, b, lang)))
  source = source.replace(new RegExp(`\\\\\\(${ISO}\\\\\\)`, 'g'), (_, a) => `\\(${escape(refHeading(a, lang))}\\)`)
  source = source.replace(new RegExp(ISO, 'g'), (match, a, offset) => escape(refDay(a, lang, { essive: /palaa\s*$/.test(source.slice(Math.max(0, offset - 8), offset)) })))
  return new RegExp(source, regex.flags)
}

module.exports = { refDay, refRange, refHeading, localize }
