import { describe, it, expect } from 'vitest'
import { getWeekNumber, toIsoDateString, parseLocalDate, isSameLocalDay, isDanishHoliday } from './dateUtils'

describe('getWeekNumber', () => {
  it('returns ISO week 1 for a date early in January that belongs to week 1', () => {
    expect(getWeekNumber(new Date(2026, 0, 5))).toBe(2) // 5. jan 2026 er en mandag i uge 2
  })

  it('returns the correct week number for a known mid-year date', () => {
    // 1. juli 2026 er en onsdag i ISO-uge 27.
    expect(getWeekNumber(new Date(2026, 6, 1))).toBe(27)
  })
})

describe('toIsoDateString', () => {
  it('formats a local date as yyyy-MM-dd without timezone shifting', () => {
    expect(toIsoDateString(new Date(2026, 8, 3))).toBe('2026-09-03')
  })

  it('pads single-digit months and days', () => {
    expect(toIsoDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('parseLocalDate', () => {
  it('parses a plain yyyy-MM-dd string as local midnight', () => {
    const date = parseLocalDate('2026-09-03')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(3)
  })

  it('parses a full ISO string by only using the date part', () => {
    const date = parseLocalDate('2026-09-03T00:00:00.000Z')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(3)
  })
})

describe('isSameLocalDay', () => {
  it('treats different times on the same date as the same day', () => {
    expect(isSameLocalDay(new Date(2026, 8, 3, 8, 0), new Date(2026, 8, 3, 22, 0))).toBe(true)
  })

  it('treats different dates as different days', () => {
    expect(isSameLocalDay(new Date(2026, 8, 3), new Date(2026, 8, 4))).toBe(false)
  })
})

describe('isDanishHoliday', () => {
  it('recognizes fixed Danish holidays', () => {
    expect(isDanishHoliday('2026-12-25')).toBe(true) // 1. juledag
    expect(isDanishHoliday('2026-01-01')).toBe(true) // Nytårsdag
  })

  it('returns false for an ordinary working day', () => {
    expect(isDanishHoliday('2026-09-03')).toBe(false)
  })

  it('returns false for an invalid date string', () => {
    expect(isDanishHoliday('not-a-date')).toBe(false)
  })
})
