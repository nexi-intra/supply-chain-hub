// Dates and month math for Finlandsforsendelser's calendars, from Finland T&T's app/renderer/dates.js and calendar.js.
// Dates travel as yyyy-mm-dd and are read in local time.
import { t } from './text'

const WEEKDAYS_SHORT: [string, string][] = [['sø', 'Sun'], ['ma', 'Mon'], ['ti', 'Tue'], ['on', 'Wed'], ['to', 'Thu'], ['fr', 'Fri'], ['lø', 'Sat']]
const WEEKDAYS: [string, string][] = [['søndag', 'Sunday'], ['mandag', 'Monday'], ['tirsdag', 'Tuesday'], ['onsdag', 'Wednesday'], ['torsdag', 'Thursday'], ['fredag', 'Friday'], ['lørdag', 'Saturday']]
const MONTHS: [string, string][] = [
  ['januar', 'January'], ['februar', 'February'], ['marts', 'March'], ['april', 'April'], ['maj', 'May'], ['juni', 'June'],
  ['juli', 'July'], ['august', 'August'], ['september', 'September'], ['oktober', 'October'], ['november', 'November'], ['december', 'December'],
]

const pad = (n: number) => String(n).padStart(2, '0')
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export const isoOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const isoDay = (year: number, monthIndex: number, day: number) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** '' for empty input, null when it cannot be read, otherwise yyyy-mm-dd. A date without a year is in `today`'s year. */
export function parseDate(text: string, today: Date = new Date()): string | null {
  const value = String(text || '').trim()
  if (!value) return ''
  const m = /^(\d{1,2})[-./](\d{1,2})(?:[-./](\d{4}))?$/.exec(value)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = m[3] ? Number(m[3]) : today.getFullYear()
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** yyyy-mm-dd as dd-mm-yyyy, as the sheet's dates are typed. */
export const formatDate = (iso: string) => (iso ? iso.split('-').reverse().join('-') : '')

/** yyyy-mm-dd as dd.mm.yyyy. */
export const dottedDate = (iso: string) => iso.split('-').reverse().join('.')

/** "ti 24": a date button. */
export function shortChoice(iso: string): string {
  const d = parseIso(iso)
  return `${t(...WEEKDAYS_SHORT[d.getDay()])} ${d.getDate()}`
}

/** "Tirsdag 24. november" / "Tuesday 24 November". */
export function dayTitle(iso: string): string {
  const d = parseIso(iso)
  const weekday = capital(t(...WEEKDAYS[d.getDay()]))
  return t(`${weekday} ${d.getDate()}. ${MONTHS[d.getMonth()][0]}`, `${weekday} ${d.getDate()} ${MONTHS[d.getMonth()][1]}`)
}

/** "24. november" / "24 November". */
export function shortDay(iso: string): string {
  const d = parseIso(iso)
  return t(`${d.getDate()}. ${MONTHS[d.getMonth()][0]}`, `${d.getDate()} ${MONTHS[d.getMonth()][1]}`)
}

/** "November 2026". */
export const monthTitle = (year: number, monthIndex: number) => `${capital(t(...MONTHS[monthIndex]))} ${year}`

/** Monday first, as the calendar's columns. */
export const weekdayHeaders = () => [1, 2, 3, 4, 5, 6, 0].map(day => t(...WEEKDAYS_SHORT[day]))

/** Today and the six workdays before it. */
export function dateChoices(today: Date = new Date()): string[] {
  const out: string[] = []
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  while (out.length < 7) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(isoOf(d))
    d.setDate(d.getDate() - 1)
  }
  return out
}

/** The month's weeks, Monday first; days outside the month are null. */
export function monthGrid(year: number, monthIndex: number): (number | null)[][] {
  const days = new Date(year, monthIndex + 1, 0).getDate()
  const lead = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const cells: (number | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  while (cells.length % 7) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Every month from `fromIso`'s to `toIso`'s, both included. */
export function monthRange(fromIso: string, toIso: string): { year: number; month: number }[] {
  const [fy, fm] = fromIso.split('-').map(Number)
  const [ty, tm] = toIso.split('-').map(Number)
  const out: { year: number; month: number }[] = []
  for (let y = fy, m = fm - 1; y < ty || (y === ty && m <= tm - 1); m === 11 ? (y++, m = 0) : m++) out.push({ year: y, month: m })
  return out
}
