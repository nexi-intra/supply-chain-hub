import { expandShiftPatterns } from './shiftPatterns'
import type { ShiftAssignment, ShiftPatternRule, ShiftRole } from './types'
import { t } from './warehouse/text'
import type { TimeclockEntry } from '@/types/warehouse'

const pad = (value: number) => String(value).padStart(2, '0')
export const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
/** A moment as the value of an `<input type="datetime-local">` (local time, minutes), and back. */
export const toLocalInput = (ms: number) => { const date = new Date(ms); return `${isoDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}` }
export const fromLocalInput = (value: string) => new Date(value).getTime()

/** After this long, Stempelkort and a softwareload task ask when the work really stopped. */
export const LONG_RUN_MS = 10 * 60 * 60 * 1000
const SUGGESTED_RUN_MS = 8 * 60 * 60 * 1000

/** Whether a running clock or task has run past LONG_RUN_MS, counted on from the main process's answer by this PC's clock. */
export const ranTooLong = (running: { startedAt: number; now: number }, sinceAnswer: number) => running.now - running.startedAt + sinceAnswer > LONG_RUN_MS

/** The end the "Hvornår stoppede du?" dialog suggests: 8 hours after the start, never before `earliest` nor after now. */
export const suggestedEnd = ({ startedAt, earliest = startedAt, now }: { startedAt: number; earliest?: number; now: number }) =>
  Math.max(earliest, Math.min(now, startedAt + SUGGESTED_RUN_MS))

/**
 * What Stempelkort tells after a start or resume that paused the running softwareload task, so the same time is not
 * counted twice; when the pause failed, both clocks run and the person must pause the task. Null when there was none.
 */
export function softwareloadPauseNotice(result: { pausedSoftwareload?: unknown; softwareloadPauseFailed?: boolean }): { failed: boolean; text: string } | null {
  if (result.softwareloadPauseFailed) return { failed: true, text: t('Softwareload-opgaven kunne ikke sættes på pause. Sæt den på pause selv', 'The softwareload task could not be paused. Pause it yourself') }
  if (result.pausedSoftwareload) return { failed: false, text: t('Din softwareload-opgave er sat på pause', 'Your softwareload task is paused') }
  return null
}

/** "1 t 23 min" (Danish) or "1 h 23 min"; under an hour only minutes. */
export function formatDuration(ms: number, language: 'da' | 'en'): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} ${language === 'da' ? 't' : 'h'} ${minutes % 60} min` : `${minutes} min`
}

/** The running clock as "01:23:45". */
export function formatClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}

export type PeriodKind = 'today' | 'week' | 'month' | 'lastMonth'

/** The days of a period around `now`; a week runs Monday to Sunday. */
export function periodRange(kind: PeriodKind, now: Date): { from: string; to: string } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (kind === 'today') return { from: isoDay(day), to: isoDay(day) }
  if (kind === 'week') {
    const monday = new Date(day)
    monday.setDate(day.getDate() - ((day.getDay() + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: isoDay(monday), to: isoDay(sunday) }
  }
  const offset = kind === 'lastMonth' ? -1 : 0
  return { from: isoDay(new Date(day.getFullYear(), day.getMonth() + offset, 1)), to: isoDay(new Date(day.getFullYear(), day.getMonth() + offset + 1, 0)) }
}

export interface TimeclockSummary {
  totalMs: number
  pausedMs: number
  count: number
  people: number
  averageMs: number
  byTask: { taskId: string; taskName: string; taskColor: string; ms: number; count: number }[]
  byPerson: { email: string; name: string; ms: number; count: number }[]
  byDay: { date: string; ms: number }[]
}

/** The statistics of a set of registrations: totals, and the time per task, per person and per day. */
export function summarizeEntries(entries: readonly TimeclockEntry[]): TimeclockSummary {
  const byTask = new Map<string, TimeclockSummary['byTask'][number]>()
  const byPerson = new Map<string, TimeclockSummary['byPerson'][number]>()
  const byDay = new Map<string, number>()
  let totalMs = 0
  let pausedMs = 0
  for (const entry of entries) {
    totalMs += entry.workedMs
    pausedMs += entry.pausedMs
    const task = byTask.get(entry.taskId) || { taskId: entry.taskId, taskName: entry.taskName, taskColor: entry.taskColor, ms: 0, count: 0 }
    task.ms += entry.workedMs
    task.count += 1
    byTask.set(entry.taskId, task)
    const person = byPerson.get(entry.email) || { email: entry.email, name: entry.name, ms: 0, count: 0 }
    person.ms += entry.workedMs
    person.count += 1
    byPerson.set(entry.email, person)
    byDay.set(entry.date, (byDay.get(entry.date) || 0) + entry.workedMs)
  }
  const largest = <T extends { ms: number }>(list: T[]) => list.sort((a, b) => b.ms - a.ms)
  return {
    totalMs, pausedMs, count: entries.length, people: byPerson.size,
    averageMs: entries.length ? Math.round(totalMs / entries.length) : 0,
    byTask: largest([...byTask.values()]),
    byPerson: largest([...byPerson.values()]),
    byDay: [...byDay].map(([date, ms]) => ({ date, ms })).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/** The user's tasks of the day in the shift schedule (assigned and recurring), as in Min uge. */
export function todaysTasks({ userEmail, date, roles, assignments, patterns }: {
  userEmail: string
  date: string
  roles: readonly ShiftRole[] | undefined
  assignments: readonly ShiftAssignment[] | undefined
  patterns: readonly ShiftPatternRule[] | undefined
}): ShiftRole[] {
  const me = userEmail.trim().toLowerCase()
  const mine = (assignments || []).filter(entry => entry.employeeId.trim().toLowerCase() === me && entry.date === date)
  const derived = expandShiftPatterns([...(patterns || [])].filter(entry => entry.employeeId.trim().toLowerCase() === me), [...(assignments || [])], date)
  const byId = new Map((roles || []).map(role => [role.id, role]))
  const result: ShiftRole[] = []
  for (const shift of [...mine, ...derived]) {
    const role = byId.get(shift.roleId)
    if (role && !result.includes(role)) result.push(role)
  }
  return result
}
