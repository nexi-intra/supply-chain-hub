import { isDanishHoliday, parseLocalDate, toIsoDateString } from './dateUtils'
import type { VacationEntry } from './types'

export type AbsenceKind = 'vacation' | 'parental'

export interface AbsenceRun {
  kind: AbsenceKind
  /** Første arbejdsdag efter den sammenhængende fraværsperiode ('yyyy-MM-dd'). */
  backDate: string
}

export interface AbsentPerson extends AbsenceRun {
  email: string
  name: string
}

export const isParentalEntry = (entry: Pick<VacationEntry, 'type'>): boolean => entry.type === 'parental'

export function isWorkingDay(isoDate: string): boolean {
  const day = parseLocalDate(isoDate).getDay()
  return day !== 0 && day !== 6 && !isDanishHoliday(isoDate.slice(0, 10))
}

/** Første arbejdsdag strengt efter `isoDate` (springer weekender og danske helligdage over). */
export function nextWorkingDay(isoDate: string): string {
  const date = parseLocalDate(isoDate)
  do {
    date.setDate(date.getDate() + 1)
  } while (!isWorkingDay(toIsoDateString(date)))
  return toIsoDateString(date)
}

const day = (value: string) => value.slice(0, 10)

/**
 * Dagens sammenhængende fraværsperiode for én person, eller null. Godkendte poster (ferie og barsel)
 * der overlapper eller grænser op til hinanden — også hen over weekender/helligdage — slås sammen.
 */
export function absenceRunFor(entries: VacationEntry[] | null | undefined, email: string, todayIso: string): AbsenceRun | null {
  const today = day(todayIso)
  const wanted = email.trim().toLowerCase()
  const pending = (entries || []).filter(entry => (
    entry.status === 'approved' && entry.userEmail?.trim().toLowerCase() === wanted && day(entry.startDate) <= day(entry.endDate)
  ))
  const covering = pending.filter(entry => day(entry.startDate) <= today && day(entry.endDate) >= today)
  if (covering.length === 0) return null

  const included = new Set(covering)
  let runEnd = covering.reduce((latest, entry) => (day(entry.endDate) > latest ? day(entry.endDate) : latest), today)
  for (;;) {
    const back = nextWorkingDay(runEnd)
    const next = pending.filter(entry => !included.has(entry) && day(entry.startDate) <= back && day(entry.endDate) > runEnd)
    if (next.length === 0) break
    for (const entry of next) {
      included.add(entry)
      if (day(entry.endDate) > runEnd) runEnd = day(entry.endDate)
    }
  }
  const kind: AbsenceKind = [...included].some(isParentalEntry) ? 'parental' : 'vacation'
  return { kind, backDate: nextWorkingDay(runEnd) }
}

/** Alle personer med godkendt ferie/barsel på `todayIso`, én række pr. person. */
export function absentPeopleOn(
  entries: VacationEntry[] | null | undefined,
  users: Record<string, { fullName?: string }> | null | undefined,
  todayIso: string,
): AbsentPerson[] {
  const result: AbsentPerson[] = []
  const seen = new Set<string>()
  for (const entry of entries || []) {
    const email = entry.userEmail
    if (!email || seen.has(email.trim().toLowerCase())) continue
    const run = absenceRunFor(entries, email, todayIso)
    if (!run) continue
    seen.add(email.trim().toLowerCase())
    result.push({ email, name: users?.[email]?.fullName || email, ...run })
  }
  return result
}
