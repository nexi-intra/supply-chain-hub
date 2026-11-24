// Periods that need calendar arithmetic: "in two weeks", "this weekend", "the last Friday of the month", Christmas, Easter, "today and tomorrow".
const { monthOf } = require('./assistantDates.cjs')

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const at = (year, month, dayOfMonth) => new Date(year, month, dayOfMonth, 12)
const plus = (date, days) => at(date.getFullYear(), date.getMonth(), date.getDate() + days)
const mondayOf = date => plus(date, -((date.getDay() + 6) % 7))
const range = (from, to = from) => ({ start: iso(from), end: iso(to) })
const startOfToday = now => at(now.getFullYear(), now.getMonth(), now.getDate())

const NUMBER_WORDS = {
  a: 1, an: 1, en: 1, ett: 1, one: 1, yksi: 1, yhden: 1, to: 2, two: 2, kaksi: 2, kahden: 2, två: 2, tre: 3, three: 3, kolme: 3, kolmen: 3, fire: 4, four: 4, neljä: 4, neljän: 4, fyra: 4,
  fem: 5, five: 5, viisi: 5, viiden: 5, seks: 6, six: 6, kuusi: 6, kuuden: 6, sex: 6, syv: 7, seven: 7, seitsemän: 7, sju: 7, otte: 8, eight: 8, kahdeksan: 8, åtta: 8,
  ni: 9, nine: 9, yhdeksän: 9, nio: 9, ti: 10, ten: 10, kymmenen: 10, tio: 10, elleve: 11, eleven: 11, elva: 11, tolv: 12, twelve: 12,
}
const UNITS = {
  dag: 'd', dage: 'd', day: 'd', days: 'd', päivän: 'd', päivää: 'd', dagar: 'd',
  uge: 'w', uger: 'w', week: 'w', weeks: 'w', viikon: 'w', viikkoa: 'w', vecka: 'w', veckor: 'w',
  måned: 'm', måneder: 'm', month: 'm', months: 'm', kuukauden: 'm', kuukautta: 'm', månad: 'm', månader: 'm',
}
const NUM = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')})`
const UNIT = `(${Object.keys(UNITS).join('|')})`
const AHEAD = [
  new RegExp(`(?<![\\p{L}])(?:om|in)\\s+${NUM}\\s+${UNIT}(?![\\p{L}])`, 'iu'),
  new RegExp(`(?<![\\p{L}])${NUM}\\s+(päivän|viikon|kuukauden)\\s+(?:päästä|kuluttua)`, 'iu'),
]
const AGO = [
  new RegExp(`(?<![\\p{L}])(?:for|för)\\s+${NUM}\\s+${UNIT}\\s+(?:siden|sedan)(?![\\p{L}])`, 'iu'),
  new RegExp(`(?<![\\p{L}])${NUM}\\s+${UNIT}\\s+(?:ago|sitten)(?![\\p{L}])`, 'iu'),
]
const amount = text => (/^\d+$/.test(text) ? Number(text) : NUMBER_WORDS[text.toLowerCase()])

function offsetPeriod(match, direction, now) {
  const count = amount(match[1]) * direction
  const unit = UNITS[match[2].toLowerCase()]
  const today = startOfToday(now)
  if (unit === 'd') return range(plus(today, count))
  if (unit === 'w') { const monday = mondayOf(plus(today, 7 * count)); return range(monday, plus(monday, 6)) }
  const first = at(today.getFullYear(), today.getMonth() + count, 1)
  return range(first, at(first.getFullYear(), first.getMonth() + 1, 0))
}

const WEEKEND = /(?<![\p{L}])((?:(?:i|på|this|denne|næste|next|ensi|nästa|kommende)\s+)?(?:weekend(?:en)?|viikonlopp\p{L}*|helg(?:en)?))(?![\p{L}])/iu
function weekendPeriod(match, now) {
  const today = startOfToday(now)
  const saturday = today.getDay() === 0 ? plus(today, -1) : plus(today, (6 - today.getDay() + 7) % 7)
  const shifted = /^(?:næste|next|ensi|nästa)\s/iu.test(match[1]) ? plus(saturday, 7) : saturday
  return range(shifted, plus(shifted, 1))
}

const WEEKDAY_WORDS = {
  0: 'søndag|sunday|sunnuntai|söndag', 1: 'mandag|monday|maanantai|måndag', 2: 'tirsdag|tuesday|tiistai|tisdag', 3: 'onsdag|wednesday|keskiviikko',
  4: 'torsdag|thursday|torstai', 5: 'fredag|friday|perjantai', 6: 'lørdag|saturday|lauantai|lördag',
}
const ORDINAL_WORDS = {
  sidste: -1, last: -1, viimeinen: -1, sista: -1, første: 1, first: 1, ensimmäinen: 1, första: 1, anden: 2, andet: 2, second: 2, toinen: 2, andra: 2,
  tredje: 3, third: 3, kolmas: 3, fjerde: 4, fourth: 4, neljäs: 4, fjärde: 4,
}
const NTH = new RegExp(`(?<![\\p{L}])(${Object.keys(ORDINAL_WORDS).join('|')})\\s+(${Object.values(WEEKDAY_WORDS).join('|')})\\p{L}*`, 'iu')
const IN_MONTH = /^\s+(?:(?:i|of|in|av)\s+(?:(måneden|the month|månaden)|(denne måned|this month|denna månad)|(næste måned|next month|nästa månad)|([\p{L}]{3,12}))|(kuussa|tässä kuussa)|(ensi kuussa))/iu

function nthWeekdayPeriod(text, now) {
  const match = NTH.exec(text)
  if (!match) return null
  const where = IN_MONTH.exec(text.slice(match.index + match[0].length))
  if (!where) return null
  const weekday = Number(Object.entries(WEEKDAY_WORDS).find(([, words]) => new RegExp(`^(?:${words})`, 'iu').test(match[2]))?.[0])
  const today = startOfToday(now)
  let year = today.getFullYear(); let month = today.getMonth()
  if (where[3] || where[6]) { month += 1 } else if (where[4]) {
    const named = monthOf(where[4])
    if (named < 0) return null
    month = named
    if (at(year, month + 1, 0) < today) year += 1
  }
  const first = at(year, month, 1)
  const ordinal = ORDINAL_WORDS[match[1].toLowerCase()]
  let found
  if (ordinal < 0) {
    const last = at(year, month + 1, 0)
    found = plus(last, -((last.getDay() - weekday + 7) % 7))
  } else found = plus(first, (weekday - first.getDay() + 7) % 7 + 7 * (ordinal - 1))
  if (found.getMonth() !== at(year, month, 1).getMonth()) return null
  return { ...range(found), text: text.slice(match.index, match.index + match[0].length + where[0].length) }
}

// Gregorian Easter Sunday (Meeus/Jones/Butcher).
function easterSunday(year) {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31); const dayOfMonth = ((h + l - 7 * m + 114) % 31) + 1
  return at(year, month - 1, dayOfMonth)
}
const word = pattern => new RegExp(`(?<![\\p{L}\\d])(?:${pattern})(?![\\p{L}])`, 'iu')
// First match wins, so the specific days come before the general season.
const HOLIDAYS = [
  { re: word("2\\.?\\s*påskedag|påskemandag|easter monday|toinen pääsiäispäivä|annandag påsk"), span: y => [plus(easterSunday(y), 1)] },
  { re: word('skærtorsdag|maundy thursday|kiirastorstai|skärtorsdag'), span: y => [plus(easterSunday(y), -3)] },
  { re: word('langfredag|good friday|pitkäperjantai|långfredag'), span: y => [plus(easterSunday(y), -2)] },
  { re: word('påskedag|easter sunday|pääsiäispäivä|påskdagen|påskdag'), span: y => [easterSunday(y)] },
  { re: word('påske\\p{L}*|easter|pääsiäi\\p{L}*|påsk\\p{L}*'), span: y => [plus(easterSunday(y), -3), plus(easterSunday(y), 1)] },
  { re: word('kristi himmelfartsdag|himmelfart|ascension day|helatorstai|kristi himmelsfärd\\p{L}*'), span: y => [plus(easterSunday(y), 39)] },
  { re: word('2\\.?\\s*pinsedag|whit monday|helluntai\\p{L}*'), span: y => [plus(easterSunday(y), 50)] },
  { re: word('pinsedag|pinse\\p{L}*|whit sunday|pentecost|pingst\\p{L}*'), span: y => [plus(easterSunday(y), 49)] },
  { re: word("2\\.?\\s*juledag|boxing day|tapaninpäivä|annandag jul"), span: y => [at(y, 11, 26)] },
  { re: word('juleaften|christmas eve|jouluaatto\\p{L}*|julafton'), span: y => [at(y, 11, 24)] },
  { re: word("1\\.?\\s*juledag|juledag|christmas day|joulupäivä\\p{L}*|juldagen|juldag"), span: y => [at(y, 11, 25)] },
  { re: word('nytårsaften|new year\\W?s eve|uudenvuodenaatto\\p{L}*|nyårsafton'), span: y => [at(y, 11, 31)] },
  { re: word('nytårsdag|new year\\W?s day|uudenvuodenpäivä\\p{L}*|nyårsdagen|nyårsdag'), span: y => [at(y + 1, 0, 1)] },
  { re: word('nytår\\p{L}*|new year|uusivuosi|uuden vuoden\\p{L}*|nyår\\p{L}*'), span: y => [at(y, 11, 31), at(y + 1, 0, 1)] },
  { re: word('jul|julen|juleferie\\p{L}*|christmas|xmas|joulu(?!kuu)\\p{L}*'), span: y => [at(y, 11, 24), at(y, 11, 26)] },
]
function holidayPeriod(text, now) {
  const today = startOfToday(now)
  for (const holiday of HOLIDAYS) {
    const match = holiday.re.exec(text)
    if (!match) continue
    // The coming occurrence (or the one that is on right now).
    const spans = [-1, 0, 1].map(shift => holiday.span(today.getFullYear() + shift))
    const span = spans.find(candidate => candidate[candidate.length - 1] >= today) || spans[2]
    return { ...range(span[0], span[span.length - 1]), text: match[0] }
  }
  return null
}

const DAY_WORDS = [
  [/(?<![\p{L}])(?:i\s+)?(?:overmorgen|day after tomorrow|ylihuomenna|övermorgon)(?![\p{L}])/iu, 2],
  [/(?<![\p{L}])(?:i\s+morgen|imorgen|tomorrow|huomenna|i\s+morgon|imorgon)(?![\p{L}])/iu, 1],
  [/(?<![\p{L}])(?:i\s+går|igår|yesterday|eilen)(?![\p{L}])/iu, -1],
  [/(?<![\p{L}])(?:i\s+dag|idag|today|tänään)(?![\p{L}])/iu, 0],
]
// "today and tomorrow": two or more relative days make one range.
function dayRangePeriod(text, now) {
  let rest = text
  const offsets = []
  for (const [pattern, offset] of DAY_WORDS) {
    const match = pattern.exec(rest)
    if (match) { offsets.push(offset); rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}` }
  }
  if (offsets.length < 2) return null
  const today = startOfToday(now)
  return { ...range(plus(today, Math.min(...offsets)), plus(today, Math.max(...offsets))), text }
}

// "who is sick right now?" means today; a bare "nu"/"now" counts only at the end of the question.
const NOW_WORD = /(?<![\p{L}])(?:lige nu|right now|just now|just nu|juuri nyt)(?![\p{L}])|(?<![\p{L}])(?:nu|now)(?=\s*[?!.]*$)/iu

/** The first period in `text` (already lower-cased) that needs calendar arithmetic, with the text it came from; null when none. `holidays: false` keeps only "today and tomorrow" (used for write intents, where a vague holiday must be asked about). */
function relativeMatch(text, now = new Date(), { holidays = true } = {}) {
  const q = String(text).toLowerCase()
  if (holidays) {
    for (const pattern of AGO) { const match = pattern.exec(q); if (match) return { ...offsetPeriod(match, -1, now), text: match[0] } }
    for (const pattern of AHEAD) { const match = pattern.exec(q); if (match) return { ...offsetPeriod(match, 1, now), text: match[0] } }
    const nth = nthWeekdayPeriod(q, now)
    if (nth) return nth
    const weekend = WEEKEND.exec(q)
    if (weekend) return { ...weekendPeriod(weekend, now), text: weekend[0] }
    const holiday = holidayPeriod(q, now)
    if (holiday) return holiday
  }
  const days = dayRangePeriod(q, now)
  if (days) return { ...days, text: '' }
  const nowWord = NOW_WORD.exec(q)
  if (nowWord) return { ...range(startOfToday(now)), text: nowWord[0] }
  return null
}
const relativeDates = (text, now, options) => { const found = relativeMatch(text, now, options); return found && { start: found.start, end: found.end } }

/** `text` without the relative periods in it (used when a follow-up swaps the period). */
function stripRelative(text, now = new Date()) {
  let result = String(text).toLowerCase()
  for (let guard = 0; guard < 4; guard++) {
    const found = relativeMatch(result, now)
    if (!found) break
    if (found.text) result = result.replace(found.text, ' ')
    else for (const [pattern] of DAY_WORDS) result = result.replace(pattern, ' ')
  }
  return result.replace(/\s+(?:og|and|ja|och)(?=\s*[?!.]*$)/u, '').replace(/\s+/g, ' ').trim()
}

module.exports = { relativeMatch, relativeDates, stripRelative, easterSunday }
