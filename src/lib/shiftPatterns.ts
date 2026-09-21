import { matchesShiftInterval, parseLocalDate } from '@/lib/dateUtils'
import type { ShiftAssignment, ShiftPatternRule } from '@/lib/types'

/** En vagt udfoldet fra et gentaget moenster - findes ikke som gemt registrering. */
export type DerivedShiftAssignment = ShiftAssignment & { isPattern: true }

/**
 * Udfolder gentagne vagter til konkrete vagter paa én dato.
 *
 * Der gemmes ALDRIG raekker for hver fremtidig uge; moenstre udfoldes ved
 * visning. Derfor skal alle steder der viser vagter kalde denne funktion -
 * ellers bliver gentagne vagter usynlige netop dér (som forsidens widget var,
 * hvor opgaven kom med, men personen bag et moenster manglede).
 *
 * `isUnavailable` faar medarbejderens e-mail og skal returnere true ved ferie,
 * sygdom eller anden grund til at dagen er spaerret.
 */
export function expandShiftPatterns(
  patterns: ShiftPatternRule[] | undefined,
  assignments: ShiftAssignment[] | undefined,
  dateString: string,
  isUnavailable: (employeeEmail: string) => boolean = () => false,
): DerivedShiftAssignment[] {
  const weekday = parseLocalDate(dateString).getDay()
  const sameDay = (assignments || []).filter(assignment => assignment.date === dateString)
  return (patterns || [])
    .filter(pattern =>
      pattern.weekdays.includes(weekday)
      && dateString >= pattern.anchorDate
      && (!pattern.endDate || dateString <= pattern.endDate)
      && matchesShiftInterval(dateString, pattern.anchorDate, pattern.intervalWeeks)
      // En rigtig tildeling for samme person+opgave vinder altid over moensteret.
      && !sameDay.some(assignment => assignment.employeeId === pattern.employeeId && assignment.roleId === pattern.roleId)
      && !isUnavailable(pattern.employeeId))
    .map(pattern => ({
      id: `pattern-${pattern.id}-${dateString}`,
      employeeId: pattern.employeeId,
      employeeName: pattern.employeeName,
      roleId: pattern.roleId,
      date: dateString,
      comment: pattern.comment,
      isPattern: true as const,
    }))
}
