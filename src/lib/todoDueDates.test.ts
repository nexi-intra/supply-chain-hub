import { describe, expect, it } from 'vitest'
import { todoDueStatus } from './todoDueDates'

const now = new Date('2026-09-17T12:00:00')

describe('todoDueStatus', () => {
  it('returns null when there is no due date', () => {
    expect(todoDueStatus(undefined, false, now)).toBeNull()
  })

  it('returns null when the to-do is already completed, regardless of date', () => {
    expect(todoDueStatus('2026-09-01', true, now)).toBeNull()
    expect(todoDueStatus('2026-09-17', true, now)).toBeNull()
    expect(todoDueStatus('2026-12-01', true, now)).toBeNull()
  })

  it('returns overdue when the due date is in the past', () => {
    expect(todoDueStatus('2026-09-16', false, now)).toBe('overdue')
    expect(todoDueStatus('2026-01-01', false, now)).toBe('overdue')
  })

  it('returns today when the due date is today', () => {
    expect(todoDueStatus('2026-09-17', false, now)).toBe('today')
  })

  it('returns upcoming when the due date is in the future', () => {
    expect(todoDueStatus('2026-09-18', false, now)).toBe('upcoming')
    expect(todoDueStatus('2026-12-01', false, now)).toBe('upcoming')
  })
})
