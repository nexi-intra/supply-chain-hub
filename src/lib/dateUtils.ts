export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

/** Lokal dato → 'yyyy-MM-dd' (ingen tidszone-forskydning, i modsætning til toISOString). */
export function toIsoDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Parser en gemt dato som LOKAL dato uanset format ('yyyy-MM-dd' eller fuld
 * ISO-streng fra ældre data). new Date('yyyy-MM-dd')/parseISO tolker UTC og
 * kan forskyde dagen — denne tager altid dato-delen og bygger lokal midnat.
 */
export function parseLocalDate(value: string): Date {
  const datePart = value.slice(0, 10)
  const [year, month, day] = datePart.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

/** Samme dag (lokalt), uafhængigt af klokkeslæt. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// ISO-years with 53 weeks: years where 31 Dec (or 24 Dec) falls in week 53.
export function getWeeksInYear(year: number): number {
  return getWeekNumber(new Date(year, 11, 28)) // 28 Dec is always in the last ISO week
}

// Monday-based dates for an ISO week. Jan 4 is always in ISO week 1.
export function getWeekDates(weekNum: number, year: number, count = 5): string[] {
  const jan4 = new Date(year, 0, 4)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (weekNum - 1) * 7)
  const dates: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return dates
}

// Anonymous Gregorian algorithm for Easter Sunday.
function getEasterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const holidayCache = new Map<number, Set<string>>()

// Danish holidays incl. Grundlovsdag, juleaftensdag and nytårsaftensdag
// (treated as days off). Store bededag was abolished in 2024.
export function getDanishHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year)
  if (cached) return cached

  const easter = getEasterSunday(year)
  const offset = (days: number) => {
    const d = new Date(easter)
    d.setDate(easter.getDate() + days)
    return toDateString(d)
  }

  const holidays = new Set<string>([
    `${year}-01-01`,   // Nytårsdag
    offset(-3),        // Skærtorsdag
    offset(-2),        // Langfredag
    offset(0),         // Påskedag
    offset(1),         // 2. påskedag
    offset(39),        // Kristi himmelfartsdag
    offset(49),        // Pinsedag
    offset(50),        // 2. pinsedag
    `${year}-06-05`,   // Grundlovsdag
    `${year}-12-24`,   // Juleaftensdag
    `${year}-12-25`,   // 1. juledag
    `${year}-12-26`,   // 2. juledag
    `${year}-12-31`,   // Nytårsaftensdag
  ])
  holidayCache.set(year, holidays)
  return holidays
}

export function isDanishHoliday(dateString: string): boolean {
  const year = Number(dateString.slice(0, 4))
  if (!Number.isFinite(year)) return false
  return getDanishHolidays(year).has(dateString)
}

export function getStartOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

export function formatDate(date: Date): string {
  const day = date.getDate()
  const month = date.getMonth() + 1
  return `${day}/${month}`
}
