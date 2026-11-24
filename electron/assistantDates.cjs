// Calendar arithmetic belongs to the application, not to a language model.
const day = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
function isoWeek(number, year) {
  if (!Number.isInteger(number) || number < 1 || number > 53 || !Number.isInteger(year) || year < 1900 || year > 2200) return null
  const jan4 = new Date(year, 0, 4, 12)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - (jan4.getDay() + 6) % 7 + (number - 1) * 7)
  const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3)
  if (thursday.getFullYear() !== year) return null
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  return { start: day(monday), end: day(sunday) }
}
function extraDates(question, now) {
  const q = String(question).toLowerCase()
  const week = q.match(/(?:uge|week|viik(?:ko|olla|on)|vecka|veckan)\s*(\d{1,2})(?!\d)/u)
  const year = Number(q.match(/\b(19\d{2}|20\d{2}|21\d{2}|2200)\b/)?.[1] || now.getFullYear())
  if (week) return { matched: true, range: isoWeek(Number(week[1]), year) }
  if (/sidste uge|forrige uge|last week|viime viik|förra veckan|förra vecka/u.test(q)) {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7 - 7, 12)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    return { matched: true, range: { start: day(monday), end: day(sunday) } }
  }
  // A person's name can also be a month (e.g. Maj). Relative weeks take priority.
  if (/næste uge|denne uge|next week|this week|ensi viik|tällä viik|nästa vecka|denna vecka|den här veckan|i veckan/u.test(q)) return { matched: false, range: null }
  const months = [['januar', 'january', 'tammi', 'januari'], ['februar', 'february', 'helmi', 'februari'], ['marts', 'march', 'maalis', 'mars'], ['april', 'april', 'huhti'], ['maj', 'may', 'touko'], ['juni', 'june', 'kesä'], ['juli', 'july', 'heinä'], ['august', 'august', 'elo', 'augusti'], ['september', 'september', 'syys'], ['oktober', 'october', 'loka'], ['november', 'november', 'marras'], ['december', 'december', 'joulu']]
  let month = months.findIndex(names => names.some(name => new RegExp(`(?:^|[^\\p{L}])${name}(?:kuu[^\\s]*)?(?=$|[^\\p{L}])`, 'u').test(q)))
  let monthYear = year
  if (/denne måned|this month|tässä kuussa|denna månad|den här månaden/u.test(q)) month = now.getMonth()
  if (/næste måned|next month|ensi kuussa|nästa månad/u.test(q)) { const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12); month = next.getMonth(); monthYear = next.getFullYear() }
  if (/sidste måned|last month|viime kuussa|förra månaden/u.test(q)) { const last = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12); month = last.getMonth(); monthYear = last.getFullYear() }
  if (month >= 0) return { matched: true, range: { start: day(new Date(monthYear, month, 1, 12)), end: day(new Date(monthYear, month + 1, 0, 12)) } }
  if (/hele året|this year|i år|tänä vuonna|hela året/u.test(q)) return { matched: true, range: { start: `${year}-01-01`, end: `${year}-12-31` } }
  return { matched: false, range: null }
}
// One calendar day written the way people write it: 17/9, 17.9., 17.09.26, 17. september, October 5th, 17 syyskuuta.
const MONTH_FORMS = [
  ['januar', 'januari', 'january', 'jan', 'tammikuu'], ['februar', 'februari', 'february', 'feb', 'helmikuu'], ['marts', 'mars', 'march', 'mar', 'maaliskuu'],
  ['april', 'apr', 'huhtikuu'], ['maj', 'may', 'toukokuu'], ['juni', 'june', 'jun', 'kesakuu'], ['juli', 'july', 'jul', 'heinakuu'], ['august', 'augusti', 'aug', 'elokuu'],
  ['september', 'sept', 'sep', 'syyskuu'], ['oktober', 'october', 'okt', 'oct', 'lokakuu'], ['november', 'nov', 'marraskuu'], ['december', 'dec', 'des', 'joulukuu'],
]
const foldMonth = word => word.toLowerCase().replace(/\.$/, '').replace(/ä/g, 'a').replace(/ö/g, 'o')
const monthOf = word => {
  const folded = foldMonth(word)
  return MONTH_FORMS.findIndex(forms => forms.some(form => form === folded || (form.endsWith('kuu') && folded.startsWith(form) && folded.length <= form.length + 4)))
}
const isMonthWord = word => monthOf(word) >= 0 || /^\d{1,2}(?:st|nd|rd|th|:e|:a)$/u.test(word)
const validDay = (year, month, day) => {
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
}
// "tredje oktober", "the third of October", "den sjätte september": the ordinal word becomes "3." (same length, so spans stay valid).
const ORDINAL_DAYS = {
  første: 1, anden: 2, andet: 2, tredje: 3, fjerde: 4, femte: 5, sjette: 6, syvende: 7, ottende: 8, niende: 9, tiende: 10, ellevte: 11, tolvte: 12, trettende: 13, fjortende: 14, femtende: 15, sekstende: 16, syttende: 17, attende: 18, nittende: 19, tyvende: 20,
  enogtyvende: 21, toogtyvende: 22, treogtyvende: 23, fireogtyvende: 24, femogtyvende: 25, seksogtyvende: 26, syvogtyvende: 27, otteogtyvende: 28, niogtyvende: 29, tredivte: 30, enogtredivte: 31,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  'twenty-first': 21, 'twenty-second': 22, 'twenty-third': 23, 'twenty-fourth': 24, 'twenty-fifth': 25, 'twenty-sixth': 26, 'twenty-seventh': 27, 'twenty-eighth': 28, 'twenty-ninth': 29, thirtieth: 30, 'thirty-first': 31,
  första: 1, andra: 2, sjunde: 7, åttonde: 8, nionde: 9, tionde: 10, elfte: 11, tolfte: 12, trettonde: 13, fjortonde: 14, femtonde: 15, sextonde: 16, sjuttonde: 17, artonde: 18, nittonde: 19, tjugonde: 20,
  tjugoförsta: 21, tjugoandra: 22, tjugotredje: 23, tjugofjärde: 24, tjugofemte: 25, tjugosjätte: 26, tjugosjunde: 27, tjugoåttonde: 28, tjugonionde: 29, trettionde: 30, trettioförsta: 31, fjärde: 4, sjätte: 6,
}
const ORDINAL_PATTERN = new RegExp(`(?<![\\p{L}-])(${Object.keys(ORDINAL_DAYS).join('|')})(?=\\s+(?:of\\s+|den\\s+)?([\\p{L}]{3,12}))`, 'giu')
const spellOutOrdinals = text => text.replace(ORDINAL_PATTERN, (word, ordinal, month) => (monthOf(month) >= 0 ? `${ORDINAL_DAYS[ordinal.toLowerCase()]}.`.padEnd(word.length, ' ') : word))
const CALENDAR_PATTERNS = [
  { kind: 'numeric', pattern: /(?<![\d.\/:-])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/gu },
  { kind: 'dayMonth', pattern: /(?<![\d.\/:-])(\d{1,2})(?:st|nd|rd|th|:e|:a)?\.?\s*(?:of\s+|den\s+)?([\p{L}]{3,12})\.?(?:,?\s*(\d{4}))?(?![\p{L}\d])/gu },
  { kind: 'monthDay', pattern: /([\p{L}]{3,12})\.?\s+(\d{1,2})(?:st|nd|rd|th|:e|:a)?(?![\d:.\/-])(?:,?\s+(\d{4}))?/gu },
  { kind: 'slash', pattern: /(?<![\d.\/:-])(\d{1,2})\/(\d{1,2})(?![\d\/])/gu },
  { kind: 'dot', pattern: /(?<![\d.\/:-])(\d{1,2})\.(\d{1,2})\.?(?![\d.:\/])/gu },
]
// Every calendar day found in the text, in the order of the patterns, with the text span it came from.
function calendarMatches(question, now = new Date()) {
  const q = spellOutOrdinals(String(question).toLowerCase())
  if (/version|\bv\d|\bip\b|build|release/u.test(q)) return []
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const pick = (day, month, yearText) => {
    let year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : today.getFullYear()
    if (yearText && Math.abs(year - today.getFullYear()) > 5) return null
    let date = validDay(year, month, day)
    // Without a year, a date well in the past means the coming year.
    if (date && !yearText && new Date(`${date}T12:00:00`) < new Date(today.getTime() - 120 * 86400000)) date = validDay(year + 1, month, day)
    return date
  }
  const found = []
  for (const { kind, pattern } of CALENDAR_PATTERNS) {
    for (const match of q.matchAll(pattern)) {
      let date = null
      if (kind === 'dayMonth') { const month = monthOf(match[2]); date = month >= 0 ? pick(Number(match[1]), month + 1, match[3]) : null }
      else if (kind === 'monthDay') { const month = monthOf(match[1]); date = month >= 0 ? pick(Number(match[2]), month + 1, match[3]) : null }
      else {
        let [first, second] = [Number(match[1]), Number(match[2])]
        // Day first, except 9/17 which can only be month first.
        if (second > 12 && first <= 12) [first, second] = [second, first]
        date = pick(first, second, match[3])
      }
      if (date && !found.some(item => item.index < match.index + match[0].length && match.index < item.index + item.length)) found.push({ index: match.index, length: match[0].length, date })
    }
  }
  return found
}
const calendarDate = (question, now) => calendarMatches(question, now)[0]?.date || null
const stripCalendarDates = (text, now) => calendarMatches(text, now).sort((a, b) => b.index - a.index).reduce((value, item) => `${value.slice(0, item.index)} ${value.slice(item.index + item.length)}`, String(text).toLowerCase())
// Words that ask for a period. When they are present but unresolvable the user is asked; when absent a default applies.
const PERIOD_WORDS = /uge\s*\d|week\s*\d|viik(?:ko|olla|on)\s*\d|veckan?\s*\d|(?:næste|denne|sidste|next|this|last|nästa|denna|förra)\s+(?:uge|week|måned|month|år|year|dag|day|vecka|veckan|månad|månaden|weekend|weekenden|helg|helgen|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|monday|tuesday|wednesday|thursday|friday|saturday|sunday|måndag|tisdag|lördag|söndag)|today|tomorrow|i dag|i morgen|i morgon|imorgon|\d{4}-\d{2}-\d{2}/u
const mentionsPeriod = question => PERIOD_WORDS.test(String(question)) || calendarMatches(question).length > 0
const thisWeek = now => {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7, 12)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  return { start: day(monday), end: day(sunday) }
}
module.exports = { isoWeek, extraDates, mentionsPeriod, thisWeek, calendarDate, calendarMatches, stripCalendarDates, isMonthWord, monthOf }
