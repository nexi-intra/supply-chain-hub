import { describe, it, expect } from 'vitest'
import { expandShiftPatterns } from './shiftPatterns'
import type { ShiftAssignment, ShiftPatternRule } from './types'

// 2026-09-21 er en mandag, 2026-09-28 den foelgende mandag.
const pattern = (overrides: Partial<ShiftPatternRule> = {}): ShiftPatternRule => ({
  id: 'p1',
  employeeId: 'oliver@test',
  employeeName: 'Oliver Bosse',
  roleId: 'rma',
  weekdays: [1],
  intervalWeeks: 1,
  anchorDate: '2026-09-21',
  ...overrides,
})

describe('expandShiftPatterns', () => {
  it('shows the person behind a recurring shift', () => {
    // Praecis fejlen fra TRR: opgaven blev vist, men personen bag moensteret ikke.
    const derived = expandShiftPatterns([pattern()], [], '2026-09-21')
    expect(derived).toHaveLength(1)
    expect(derived[0].employeeName).toBe('Oliver Bosse')
    expect(derived[0].roleId).toBe('rma')
    expect(derived[0].isPattern).toBe(true)
  })

  it('only matches the pattern weekdays', () => {
    expect(expandShiftPatterns([pattern({ weekdays: [2] })], [], '2026-09-21')).toHaveLength(0)
  })

  it('respects the interval', () => {
    const every2 = [pattern({ intervalWeeks: 2 })]
    expect(expandShiftPatterns(every2, [], '2026-09-21')).toHaveLength(1)
    expect(expandShiftPatterns(every2, [], '2026-09-28')).toHaveLength(0)
    expect(expandShiftPatterns(every2, [], '2026-10-05')).toHaveLength(1)
  })

  it('never starts before the anchor or runs past the end date', () => {
    expect(expandShiftPatterns([pattern()], [], '2026-09-14')).toHaveLength(0)
    expect(expandShiftPatterns([pattern({ endDate: '2026-09-21' })], [], '2026-09-28')).toHaveLength(0)
  })

  it('lets a real assignment win over the pattern for the same person and task', () => {
    const real: ShiftAssignment[] = [{ id: 'a1', employeeId: 'oliver@test', employeeName: 'Oliver Bosse', roleId: 'rma', date: '2026-09-21' }]
    expect(expandShiftPatterns([pattern()], real, '2026-09-21')).toHaveLength(0)
  })

  it('does not let another persons assignment hide the pattern', () => {
    const other: ShiftAssignment[] = [{ id: 'a1', employeeId: 'someone@test', employeeName: 'Someone', roleId: 'rma', date: '2026-09-21' }]
    expect(expandShiftPatterns([pattern()], other, '2026-09-21')).toHaveLength(1)
  })

  it('skips people who are on vacation or sick', () => {
    expect(expandShiftPatterns([pattern()], [], '2026-09-21', email => email === 'oliver@test')).toHaveLength(0)
  })

  it('handles missing input without throwing', () => {
    expect(expandShiftPatterns(undefined, undefined, '2026-09-21')).toEqual([])
  })
})
