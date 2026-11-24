import { describe, it, expect } from 'vitest'
import { absenceRunFor, absentPeopleOn, nextWorkingDay } from './absence'
import type { VacationEntry } from './types'

const entry = (patch: Partial<VacationEntry>): VacationEntry => ({
  id: Math.random().toString(36).slice(2),
  userId: 'u1',
  userEmail: 'a@example.test',
  startDate: '2026-10-05',
  endDate: '2026-10-09',
  status: 'approved',
  ...patch,
})

describe('nextWorkingDay', () => {
  it('goes from Friday to Monday', () => {
    expect(nextWorkingDay('2026-10-09')).toBe('2026-10-12')
  })

  it('skips Easter holidays', () => {
    // 2026: skærtorsdag 2. apr, langfredag 3. apr, 2. påskedag 6. apr
    expect(nextWorkingDay('2026-04-01')).toBe('2026-04-07')
  })

  it('skips Christmas holidays and the weekend', () => {
    expect(nextWorkingDay('2026-12-23')).toBe('2026-12-28')
  })

  it('returns the next day on an ordinary weekday', () => {
    expect(nextWorkingDay('2026-10-07')).toBe('2026-10-08')
  })
})

describe('absenceRunFor', () => {
  it('returns null when nobody is absent today', () => {
    expect(absenceRunFor([entry({})], 'a@example.test', '2026-10-12')).toBeNull()
    expect(absenceRunFor([entry({})], 'other@example.test', '2026-10-07')).toBeNull()
  })

  it('ignores entries that are not approved', () => {
    expect(absenceRunFor([entry({ status: 'pending' })], 'a@example.test', '2026-10-07')).toBeNull()
  })

  it('uses the first working day after the end date, also on the last day', () => {
    expect(absenceRunFor([entry({})], 'a@example.test', '2026-10-09')).toEqual({ kind: 'vacation', backDate: '2026-10-12' })
  })

  it('treats a missing type as vacation and a parental type as parental', () => {
    expect(absenceRunFor([entry({})], 'a@example.test', '2026-10-07')?.kind).toBe('vacation')
    expect(absenceRunFor([entry({ type: 'parental' })], 'A@Example.test', '2026-10-07')?.kind).toBe('parental')
  })

  it('skips holidays after the end date', () => {
    const run = absenceRunFor([entry({ startDate: '2026-03-30', endDate: '2026-04-01' })], 'a@example.test', '2026-03-31')
    expect(run?.backDate).toBe('2026-04-07')
  })

  it('merges adjacent entries across a weekend and reports parental if any entry is parental', () => {
    const run = absenceRunFor([
      entry({}),
      entry({ type: 'parental', startDate: '2026-10-12', endDate: '2026-10-30' }),
    ], 'a@example.test', '2026-10-07')
    expect(run).toEqual({ kind: 'parental', backDate: '2026-11-02' })
  })

  it('merges overlapping entries', () => {
    const run = absenceRunFor([
      entry({}),
      entry({ type: 'parental', startDate: '2026-10-08', endDate: '2026-10-16' }),
    ], 'a@example.test', '2026-10-07')
    expect(run).toEqual({ kind: 'parental', backDate: '2026-10-19' })
  })

  it('does not merge entries separated by a working day', () => {
    const run = absenceRunFor([
      entry({}),
      entry({ startDate: '2026-10-13', endDate: '2026-10-16' }),
    ], 'a@example.test', '2026-10-07')
    expect(run).toEqual({ kind: 'vacation', backDate: '2026-10-12' })
  })

  it('ignores earlier entries that are not part of today\'s run', () => {
    const run = absenceRunFor([
      entry({ type: 'parental', startDate: '2026-09-01', endDate: '2026-09-04' }),
      entry({}),
    ], 'a@example.test', '2026-10-07')
    expect(run?.kind).toBe('vacation')
  })
})

describe('absentPeopleOn', () => {
  it('returns one row per absent person with name, kind and back date', () => {
    const rows = absentPeopleOn([
      entry({ userEmail: 'x@example.test', type: 'parental', startDate: '2026-09-01', endDate: '2026-10-09' }),
      entry({ userEmail: 'a@example.test' }),
      entry({ userEmail: 'a@example.test', startDate: '2026-10-06', endDate: '2026-10-07' }),
      entry({ userEmail: 'gone@example.test', startDate: '2026-08-01', endDate: '2026-08-02' }),
    ], { 'x@example.test': { fullName: 'Xuan Nguyen' } }, '2026-10-07')
    expect(rows).toEqual([
      { email: 'x@example.test', name: 'Xuan Nguyen', kind: 'parental', backDate: '2026-10-12' },
      { email: 'a@example.test', name: 'a@example.test', kind: 'vacation', backDate: '2026-10-12' },
    ])
  })
})
