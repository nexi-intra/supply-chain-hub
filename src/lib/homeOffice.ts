import type { HomeOfficeException, HomeOfficePattern } from '@/lib/types'
import { format } from 'date-fns'

/**
 * Afgør om en bruger arbejder hjemme på en given dato: en enkelt-dags-undtagelse
 * vinder altid over det faste mønster (begge veje — kan både TVINGE hjemme en dag
 * der ikke er i mønstret, og tvinge kontor en dag der ellers er).
 */
export function isHomeOfficeOnDate(
  userEmail: string,
  date: Date,
  patterns: Record<string, HomeOfficePattern> | null | undefined,
  exceptions: HomeOfficeException[] | null | undefined
): boolean {
  const dateStr = format(date, 'yyyy-MM-dd')
  const exception = (exceptions || []).find(e => e.userEmail === userEmail && e.date === dateStr)
  if (exception) return exception.isHomeOffice
  return (patterns?.[userEmail]?.weekdays || []).includes(date.getDay())
}

/** Alle brugere (af en given liste email'er) der arbejder hjemme på en given dato. */
export function getHomeOfficeUsersForDate(
  userEmails: string[],
  date: Date,
  patterns: Record<string, HomeOfficePattern> | null | undefined,
  exceptions: HomeOfficeException[] | null | undefined
): string[] {
  return userEmails.filter(email => isHomeOfficeOnDate(email, date, patterns, exceptions))
}
