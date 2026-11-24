import { describe, expect, it } from 'vitest'
import { formatShiftTime, resolveShiftTime, shiftTimeError, toShiftTime } from './shiftTimes'

describe('shiftTimeError', () => {
  it('accepts no time, a start only, and a start before the end', () => {
    expect(shiftTimeError('', '')).toBeNull()
    expect(shiftTimeError('07:00', '')).toBeNull()
    expect(shiftTimeError('07:00', '15:00')).toBeNull()
  })

  it('rejects an end without a start, an end not after the start, and malformed times', () => {
    expect(shiftTimeError('', '15:00')).toMatch(/starttid/i)
    expect(shiftTimeError('15:00', '15:00')).toMatch(/efter/i)
    expect(shiftTimeError('15:00', '07:00')).toMatch(/efter/i)
    expect(shiftTimeError('7', '')).toMatch(/ugyldig/i)
    expect(shiftTimeError('24:00', '')).toMatch(/ugyldig/i)
  })
})

describe('toShiftTime', () => {
  it('drops empty parts so nothing is stored for "no time"', () => {
    expect(toShiftTime(' ', '')).toEqual({ startTime: undefined, endTime: undefined })
    expect(toShiftTime('07:00', ' 15:00 ')).toEqual({ startTime: '07:00', endTime: '15:00' })
  })
})

describe('resolveShiftTime', () => {
  const role = { startTime: '07:00', endTime: '15:00' }

  it('prefers the shift its own time over the role default', () => {
    expect(resolveShiftTime({ startTime: '09:30', endTime: '11:00' }, role)).toEqual({ startTime: '09:30', endTime: '11:00' })
    expect(resolveShiftTime({ startTime: '09:30' }, role)).toEqual({ startTime: '09:30', endTime: undefined })
  })

  it('falls back to the role default, and to nothing when neither has a time', () => {
    expect(resolveShiftTime({}, role)).toEqual(role)
    expect(resolveShiftTime(undefined, undefined)).toBeNull()
    expect(resolveShiftTime({}, { startTime: '' })).toBeNull()
  })

  it('ignores a stored time that is not valid', () => {
    expect(resolveShiftTime({ startTime: 'bad' }, role)).toEqual(role)
    expect(resolveShiftTime({ startTime: '10:00', endTime: '09:00' }, undefined)).toEqual({ startTime: '10:00', endTime: undefined })
  })
})

describe('formatShiftTime', () => {
  it('shows a range or a start only', () => {
    expect(formatShiftTime({ startTime: '07:00', endTime: '15:00' })).toBe('07:00–15:00')
    expect(formatShiftTime({ startTime: '07:00' })).toBe('07:00')
    expect(formatShiftTime(null)).toBe('')
  })
})
