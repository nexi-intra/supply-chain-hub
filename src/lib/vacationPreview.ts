import { parseLocalDate } from './dateUtils'
import type { VacationEntry } from './types'

export function vacationPreviewEntries(vacations: VacationEntry[], selected: VacationEntry, month: number, year: number): VacationEntry[] {
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const entries = vacations.some((vacation) => vacation.id === selected.id)
    ? vacations
    : [...vacations, selected]

  return entries.filter((vacation) => {
    if (vacation.status !== 'approved' && vacation.status !== 'pending') return false
    const start = parseLocalDate(vacation.startDate)
    const end = parseLocalDate(vacation.endDate)
    return !isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= monthEnd && end >= monthStart
  })
}