// The one place that turns an ISO day into the text a person reads: "onsdag 16. sep.", "Wed 16 Sep", "keskiviikko 16.9.", "onsdag 16 sep.".
// "Current" (for the year rule and today/tomorrow/yesterday) is always the `now` the caller passes in, never the real clock.
const WEEKDAYS = {
  da: ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  fi: ['sunnuntai', 'maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai'],
  sv: ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'],
}
// Finnish "on"-phrases ("palaa maanantaina 21.9.") need the essive weekday; lists and headings use the nominative above.
const ESSIVE = {
  da: null,
  en: null,
  fi: ['sunnuntaina', 'maanantaina', 'tiistaina', 'keskiviikkona', 'torstaina', 'perjantaina', 'lauantaina'],
  sv: null,
}
// numeric: day.month. (Finnish); dot: the full stop after the day number (Danish "16. sep.").
const LAYOUT = {
  da: { numeric: false, dot: '.' },
  en: { numeric: false, dot: '' },
  fi: { numeric: true, dot: '.' },
  sv: { numeric: false, dot: '' },
}
const MONTHS = {
  da: ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  sv: ['jan.', 'feb.', 'mars', 'apr.', 'maj', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'],
}
const RELATIVE = { da: ['i går', 'i dag', 'i morgen'], en: ['yesterday', 'today', 'tomorrow'], fi: ['eilen', 'tänään', 'huomenna'], sv: ['igår', 'idag', 'imorgon'] }
const DASH = '–'
const lang = language => (WEEKDAYS[language] ? language : 'da')

// Strict ISO day (a time of day is ignored); null for anything that is not a real calendar day.
function parse(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})(?![\d])/.exec(value.trim())
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day, 12)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return { year, month: month - 1, day, weekday: date.getDay(), date }
}
const nowYear = now => (now instanceof Date && !Number.isNaN(now.getTime()) ? now.getFullYear() : null)
// The year is written when it differs from the current one; without a usable `now` it is always written.
const showsYear = (year, now) => year !== nowYear(now)

// The day and month part of one date ("16. sep.", "16 sep.", "16.9."), with the year appended when asked for.
function dayMonth(language, parts, year) {
  const layout = LAYOUT[language]
  if (layout.numeric) return `${parts.day}.${parts.month + 1}.${year ? parts.year : ''}`
  const text = `${parts.day}${layout.dot} ${MONTHS[language][parts.month]}`
  return year ? `${text} ${parts.year}` : text
}

/**
 * One day, e.g. "onsdag 16. sep.". Options: now (year rule), weekday=false (no weekday), inflect='essive' (Finnish "on"-phrases),
 * year=false (never the year, for recurring dates). Unparsable input is returned as it was given.
 */
function formatDay(value, language = 'da', { now, weekday = true, inflect, year } = {}) {
  if (value === undefined || value === null || value === '') return ''
  const parts = parse(value)
  if (!parts) return String(value)
  const l = lang(language)
  const text = dayMonth(l, parts, year === false ? false : showsYear(parts.year, now))
  if (!weekday) return text
  const name = inflect === 'essive' && ESSIVE[l] ? ESSIVE[l][parts.weekday] : WEEKDAYS[l][parts.weekday]
  return `${name} ${text}`
}

/** A period: "16.–20. sep." inside one month, "28. sep.–2. okt." across months, both years across a year change; one day keeps its weekday. */
function formatRange(start, end, language = 'da', { now } = {}) {
  const from = parse(start)
  const to = end === undefined || end === null || end === '' ? from : parse(end)
  if (!from || !to) return [formatDay(start, language, { now }), formatDay(end, language, { now })].filter(Boolean).join(` ${DASH} `)
  const l = lang(language)
  if (from.year === to.year && from.month === to.month && from.day === to.day) return formatDay(start, l, { now })
  if (to.date < from.date) return `${formatDay(start, l, { now, weekday: false })}${DASH}${formatDay(end, l, { now, weekday: false })}`
  const acrossYears = from.year !== to.year
  const trailingYear = !acrossYears && showsYear(to.year, now)
  if (from.year === to.year && from.month === to.month) {
    const layout = LAYOUT[l]
    if (layout.numeric) return `${from.day}.${DASH}${to.day}.${to.month + 1}.${trailingYear ? to.year : ''}`
    const text = `${from.day}${layout.dot}${DASH}${to.day}${layout.dot} ${MONTHS[l][to.month]}`
    return trailingYear ? `${text} ${to.year}` : text
  }
  if (acrossYears) return `${dayMonth(l, from, true)}${DASH}${dayMonth(l, to, true)}`
  return `${dayMonth(l, from, false)}${DASH}${dayMonth(l, to, trailingYear)}`
}

/** The label in a heading, "Madplan (i morgen, onsdag 16. sep.)": today, tomorrow and yesterday get the word, a period never does. */
function formatHeading(start, end, language = 'da', { now } = {}) {
  const from = parse(start)
  const single = from && (end === undefined || end === null || end === '' || end === start)
  if (!single || !(now instanceof Date) || Number.isNaN(now.getTime())) return formatRange(start, end, language, { now })
  const l = lang(language)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const distance = Math.round((from.date - today) / 86400000)
  const day = formatDay(start, l, { now })
  return distance >= -1 && distance <= 1 ? `${RELATIVE[l][distance + 1]}, ${day}` : day
}

/** A recurring day stored as "MM-DD" (a birthday): "25. sep.", without weekday or year. */
function formatMonthDay(value, language = 'da') {
  const match = /^(\d{2})-(\d{2})$/.exec(String(value ?? ''))
  if (!match) return String(value ?? '')
  // 2000 is a leap year, so 02-29 is valid.
  const text = formatDay(`2000-${match[1]}-${match[2]}`, language, { weekday: false, year: false })
  return text.startsWith('2000-') ? String(value) : text
}

/** Ends a sentence with a full stop unless the last date already ended in one ("… mandag 21. sep." is not followed by a second dot). */
const closeSentence = text => (String(text).endsWith('.') ? String(text) : `${text}.`)

module.exports = { formatDay, formatRange, formatHeading, formatMonthDay, closeSentence }
