import { describe, expect, it } from 'vitest'
import { formatDuration, periodRange, ranTooLong, softwareloadPauseNotice, suggestedEnd, summarizeEntries, todaysTasks } from './timeclock'
import { setWarehouseLanguage } from './warehouse/text'
import type { TimeclockEntry } from '@/types/warehouse'

const MIN = 60_000
const entry = (overrides: Partial<TimeclockEntry>): TimeclockEntry => ({
  id: 'x', email: 'anna@example.test', name: 'Anna', taskId: 'r1', taskName: 'Pakning', taskColor: '#3b82f6',
  date: '2026-11-18', startedAt: 0, endedAt: 0, pauses: [], pausedMs: 0, workedMs: 60 * MIN, savedAt: 0, ...overrides,
})

describe('summarizeEntries', () => {
  it('sums the time per task, per person and per day, largest first', () => {
    const summary = summarizeEntries([
      entry({ id: 'a', workedMs: 30 * MIN }),
      entry({ id: 'b', email: 'bo@example.test', name: 'Bo', taskId: 'r2', taskName: 'Returvarer', taskColor: '#ef4444', workedMs: 90 * MIN, date: '2026-11-17' }),
      entry({ id: 'c', workedMs: 15 * MIN, pausedMs: 5 * MIN }),
    ])
    expect([summary.totalMs, summary.pausedMs, summary.count, summary.people, summary.averageMs]).toEqual([135 * MIN, 5 * MIN, 3, 2, 45 * MIN])
    expect(summary.byTask.map(item => [item.taskName, item.ms, item.count])).toEqual([['Returvarer', 90 * MIN, 1], ['Pakning', 45 * MIN, 2]])
    expect(summary.byPerson.map(item => [item.name, item.ms])).toEqual([['Bo', 90 * MIN], ['Anna', 45 * MIN]])
    expect(summary.byDay.map(item => [item.date, item.ms])).toEqual([['2026-11-17', 90 * MIN], ['2026-11-18', 45 * MIN]])
  })

  it('is empty without registrations', () => {
    expect(summarizeEntries([])).toMatchObject({ totalMs: 0, count: 0, people: 0, averageMs: 0, byTask: [], byPerson: [], byDay: [] })
  })
})

describe('formatDuration', () => {
  it('shows hours and minutes', () => {
    expect([formatDuration(0, 'da'), formatDuration(59_000, 'da'), formatDuration(83 * MIN, 'da'), formatDuration(120 * MIN, 'en'), formatDuration(45 * MIN, 'en')]).toEqual(['0 min', '0 min', '1 t 23 min', '2 h 0 min', '45 min'])
  })
})

describe('periodRange', () => {
  // Wednesday 18 November 2026.
  const now = new Date(2026, 10, 18, 12, 0)
  it('gives today, this week (Monday-Sunday), this month and last month', () => {
    expect(periodRange('today', now)).toEqual({ from: '2026-11-18', to: '2026-11-18' })
    expect(periodRange('week', now)).toEqual({ from: '2026-11-16', to: '2026-11-22' })
    expect(periodRange('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(periodRange('lastMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodRange('lastMonth', new Date(2026, 0, 5))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('todaysTasks', () => {
  const roles = [{ id: 'r1', name: 'Pakning', color: '#3b82f6' }, { id: 'r2', name: 'Returvarer', color: '#ef4444' }]
  it('finds the user\'s tasks of the day in the shift schedule, also from a recurring shift', () => {
    const tasks = todaysTasks({
      userEmail: 'Anna@example.test', date: '2026-11-18', roles,
      assignments: [{ id: 'a1', employeeId: 'anna@example.test', employeeName: 'Anna', roleId: 'r2', date: '2026-11-18' }, { id: 'a2', employeeId: 'bo@example.test', employeeName: 'Bo', roleId: 'r1', date: '2026-11-18' }],
      patterns: [{ id: 'p1', employeeId: 'anna@example.test', employeeName: 'Anna', roleId: 'r1', weekdays: [3], intervalWeeks: 1, anchorDate: '2026-11-04' } as never],
    })
    expect(tasks.map(role => role.name)).toEqual(['Returvarer', 'Pakning'])
  })

  it('is empty on a day without shifts or when the task is gone', () => {
    expect(todaysTasks({ userEmail: 'anna@example.test', date: '2026-11-18', roles, assignments: [{ id: 'a1', employeeId: 'anna@example.test', employeeName: 'Anna', roleId: 'gone', date: '2026-11-18' }], patterns: [] })).toEqual([])
  })
})

describe('ranTooLong', () => {
  const HOUR = 60 * MIN
  it('is true only past 10 hours, counted on from the answer by this PC', () => {
    expect(ranTooLong({ startedAt: 0, now: 10 * HOUR }, 0)).toBe(false)
    expect(ranTooLong({ startedAt: 0, now: 10 * HOUR }, 1)).toBe(true)
    expect(ranTooLong({ startedAt: 0, now: 9 * HOUR }, HOUR + 1)).toBe(true)
  })
})

describe('suggestedEnd', () => {
  const HOUR = 60 * MIN
  it('suggests 8 hours after the start, never after now and never before the last start or pause', () => {
    expect(suggestedEnd({ startedAt: 0, now: 66 * HOUR })).toBe(8 * HOUR)
    expect(suggestedEnd({ startedAt: 0, now: 5 * HOUR })).toBe(5 * HOUR)
    expect(suggestedEnd({ startedAt: 0, earliest: 9 * HOUR, now: 66 * HOUR })).toBe(9 * HOUR)
  })
})


describe('softwareloadPauseNotice', () => {
  it('says when Stempelkort paused the softwareload task, and when it could not', () => {
    expect(softwareloadPauseNotice({ pausedSoftwareload: null })).toBeNull()
    expect(softwareloadPauseNotice({})).toBeNull()
    expect(softwareloadPauseNotice({ pausedSoftwareload: { id: 't1' } })).toEqual({ failed: false, text: 'Din softwareload-opgave er sat på pause' })
    expect(softwareloadPauseNotice({ pausedSoftwareload: null, softwareloadPauseFailed: true })).toEqual({ failed: true, text: 'Softwareload-opgaven kunne ikke sættes på pause. Sæt den på pause selv' })
    setWarehouseLanguage('en')
    try {
      expect(softwareloadPauseNotice({ pausedSoftwareload: { id: 't1' } })?.text).toBe('Your softwareload task is paused')
    } finally {
      setWarehouseLanguage('da')
    }
  })
})