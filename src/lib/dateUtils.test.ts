import { describe, it, expect } from 'vitest'
import { getWeekNumber, toIsoDateString, parseLocalDate, isSameLocalDay, isDanishHoliday, matchesShiftInterval } from './dateUtils'

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

describe('matchesShiftInterval', () => {
  // Anker: mandag 2026-09-07 (uge 37).
  const anchor = '2026-09-07'

  it('matches the anchor week itself for every interval', () => {
    for (const interval of [1, 2, 3, 4] as const) {
      expect(matchesShiftInterval('2026-09-09', anchor, interval)).toBe(true) // onsdag i ankerugen
    }
  })

  it('every-week interval (1) matches all following weeks', () => {
    expect(matchesShiftInterval('2026-09-14', anchor, 1)).toBe(true)
    expect(matchesShiftInterval('2026-09-21', anchor, 1)).toBe(true)
  })

  it('every-2nd-week interval only matches even offsets', () => {
    expect(matchesShiftInterval('2026-09-14', anchor, 2)).toBe(false) // +1 uge
    expect(matchesShiftInterval('2026-09-21', anchor, 2)).toBe(true) // +2 uger
    expect(matchesShiftInterval('2026-09-28', anchor, 2)).toBe(false) // +3 uger
  })

  it('every-3rd/4th-week interval matches only exact multiples', () => {
    expect(matchesShiftInterval('2026-09-28', anchor, 3)).toBe(true) // +3 uger
    expect(matchesShiftInterval('2026-10-05', anchor, 4)).toBe(true) // +4 uger
    expect(matchesShiftInterval('2026-10-05', anchor, 3)).toBe(false)
  })

  it('dates before the anchor week never match', () => {
    expect(matchesShiftInterval('2026-08-31', anchor, 1)).toBe(false)
  })

  it('is robust across a year boundary (does not reset like ISO week numbers do)', () => {
    // Anker i uge 51 2026 (14. dec, mandag); +3 uger lander i starten af 2027.
    const yearEndAnchor = '2026-12-14'
    expect(matchesShiftInterval('2027-01-04', yearEndAnchor, 3)).toBe(true) // +3 uger
    expect(matchesShiftInterval('2027-01-11', yearEndAnchor, 3)).toBe(false) // +4 uger
  })

  it('any weekday within a matching week returns true regardless of anchor weekday', () => {
    // Ankeren var en mandag, men selve mønsteret gælder alle ugedage i den matchende uge.
    expect(matchesShiftInterval('2026-09-25', anchor, 2)).toBe(true) // fredag, +2 uger
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
