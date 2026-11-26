import { afterEach, describe, expect, it } from 'vitest'
import { dateChoices, dayTitle, formatDate, monthGrid, monthRange, parseDate, shortChoice } from './finlandDates'
import { setWarehouseLanguage } from './text'

// Ported from Finland T&T's tests/dates.test.cjs and tests/calendar.test.cjs.
const today = new Date(2026, 10, 25)

describe('finlandDates: dates', () => {
  afterEach(() => setWarehouseLanguage('da'))

  it('datoer med bindestreg, punktum eller skråstreg', () => {
    expect(parseDate('25-11-2026', today)).toBe('2026-11-25')
    expect(parseDate('25.11.2026', today)).toBe('2026-11-25')
    expect(parseDate(' 5/1/2027 ', today)).toBe('2027-01-05')
  })

  it('uden år bruges året fra i dag', () => {
    expect(parseDate('24-11', today)).toBe('2026-11-24')
  })

  it('tom betyder tom, og forkerte datoer giver null', () => {
    expect(parseDate('', today)).toBe('')
    expect(parseDate('31-11-2026', today)).toBeNull()
    expect(parseDate('i går', today)).toBeNull()
  })

  it('visning og datoknapper', () => {
    expect(formatDate('2026-11-25')).toBe('25-11-2026')
    expect(formatDate('')).toBe('')
    expect(shortChoice('2026-11-24')).toBe('ti 24')
    expect(shortChoice('2026-11-30')).toBe('ma 30')
  })

  it('in English the weekday and the title are English', () => {
    setWarehouseLanguage('en')
    expect(shortChoice('2026-11-24')).toBe('Tue 24')
    expect(dayTitle('2026-11-24')).toBe('Tuesday 24 November')
    setWarehouseLanguage('da')
    expect(dayTitle('2026-11-24')).toBe('Tirsdag 24. november')
  })

  it('the date choices are today and the six workdays before it', () => {
    expect(dateChoices(new Date(2026, 10, 25))).toEqual(['2026-11-25', '2026-11-24', '2026-11-23', '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17'])
  })
})

describe('finlandDates: calendar', () => {
  it('november 2026 starter søndag, mandag først', () => {
    const weeks = monthGrid(2026, 10)
    expect(weeks[0]).toEqual([null, null, null, null, null, null, 1])
    expect(weeks[1]).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(weeks[weeks.length - 1].filter(Boolean).pop()).toBe(30)
  })

  it('december 2026 har 31 dage og fyldte uger', () => {
    const weeks = monthGrid(2026, 11)
    expect(weeks.flat().filter(Boolean).length).toBe(31)
    expect(weeks.every(w => w.length === 7)).toBe(true)
  })

  it('måneder fra SAP-listens start til i dag', () => {
    expect(monthRange('2026-09-25', '2026-11-25')).toEqual([{ year: 2026, month: 8 }, { year: 2026, month: 9 }, { year: 2026, month: 10 }])
  })

  it('over et årsskifte', () => {
    expect(monthRange('2026-12-10', '2027-01-05')).toEqual([{ year: 2026, month: 11 }, { year: 2027, month: 0 }])
  })
})
