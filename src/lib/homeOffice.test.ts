import { describe, expect, it } from 'vitest'
import { getHomeOfficeUsersForDate, isHomeOfficeOnDate } from './homeOffice'
import type { HomeOfficeException, HomeOfficePattern } from './types'

const email = 'person@example.test'
const day = (value: string) => new Date(`${value}T12:00:00`)

describe('home-office week intervals', () => {
  it('keeps old weekday-only patterns weekly', () => {
    const patterns = { [email]: { weekdays: [3] } }
    expect(isHomeOfficeOnDate(email, day('2026-09-23'), patterns, [])).toBe(true)
    expect(isHomeOfficeOnDate(email, day('2026-09-30'), patterns, [])).toBe(true)
    expect(isHomeOfficeOnDate(email, day('2026-09-24'), patterns, [])).toBe(false)
  })

  it('combines every second Wednesday with every third Thursday independently', () => {
    const patterns: Record<string, HomeOfficePattern> = { [email]: {
      weekdays: [3, 4], repeat: {
        3: { intervalWeeks: 2, startDate: '2026-09-23' },
        4: { intervalWeeks: 3, startDate: '2026-09-24' },
      },
    } }
    for (const value of ['2026-09-23', '2026-10-07', '2026-09-24', '2026-10-15']) {
      expect(isHomeOfficeOnDate(email, day(value), patterns, [])).toBe(true)
    }
    for (const value of ['2026-09-16', '2026-09-30', '2026-10-01', '2026-10-08']) {
      expect(isHomeOfficeOnDate(email, day(value), patterns, [])).toBe(false)
    }
    expect(getHomeOfficeUsersForDate([email, 'other@example.test'], day('2026-10-07'), patterns, [])).toEqual([email])
  })

  it('continues over New Year and a daylight-saving change', () => {
    const patterns = { [email]: { weekdays: [3], repeat: { 3: { intervalWeeks: 2, startDate: '2026-12-30' } } } }
    expect(isHomeOfficeOnDate(email, day('2027-01-06'), patterns, [])).toBe(false)
    expect(isHomeOfficeOnDate(email, day('2027-01-13'), patterns, [])).toBe(true)
    const spring = { [email]: { weekdays: [3], repeat: { 3: { intervalWeeks: 2, startDate: '2026-03-25' } } } }
    expect(isHomeOfficeOnDate(email, day('2026-04-01'), spring, [])).toBe(false)
    expect(isHomeOfficeOnDate(email, day('2026-04-08'), spring, [])).toBe(true)
  })

  it('lets single-day exceptions override the interval in both directions', () => {
    const patterns = { [email]: { weekdays: [3], repeat: { 3: { intervalWeeks: 2, startDate: '2026-09-23' } } } }
    const exceptions: HomeOfficeException[] = [
      { id: 'office', userEmail: email, date: '2026-09-23', isHomeOffice: false },
      { id: 'home', userEmail: email, date: '2026-09-30', isHomeOffice: true },
    ]
    expect(isHomeOfficeOnDate(email, day('2026-09-23'), patterns, exceptions)).toBe(false)
    expect(isHomeOfficeOnDate(email, day('2026-09-30'), patterns, exceptions)).toBe(true)
  })

  it('rejects an invalid or mismatched first date instead of silently shifting the pattern', () => {
    const invalid = { [email]: { weekdays: [3], repeat: { 3: { intervalWeeks: 2, startDate: '2026-09-24' } } } }
    expect(isHomeOfficeOnDate(email, day('2026-09-30'), invalid, [])).toBe(false)
    const malformed = { [email]: { weekdays: [3], repeat: { 3: { intervalWeeks: 0, startDate: '2026-09-23' } } } }
    expect(isHomeOfficeOnDate(email, day('2026-09-23'), malformed, [])).toBe(false)
  })
})