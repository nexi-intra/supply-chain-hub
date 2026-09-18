import { describe, it, expect } from 'vitest'
import { computeNextReviewAt, getReviewStatus, migrateGuide, dateStringToTimestamp, timestampToDateString, type Guide } from './guideTypes'

function makeGuide(overrides: Partial<Guide> = {}): Guide {
  return {
    id: 'g1',
    title: 'Test guide',
    category: 'Procedures',
    tags: [],
    content: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('computeNextReviewAt', () => {
  it('returns null when no interval is set', () => {
    expect(computeNextReviewAt(Date.now(), null)).toBeNull()
    expect(computeNextReviewAt(Date.now(), undefined)).toBeNull()
    expect(computeNextReviewAt(Date.now(), 0)).toBeNull()
  })

  it('adds the given number of months', () => {
    const from = new Date(2026, 0, 15).getTime() // 15. januar 2026
    const next = computeNextReviewAt(from, 3)
    const nextDate = new Date(next!)
    expect(nextDate.getMonth()).toBe(3) // april (0-indeks)
    expect(nextDate.getDate()).toBe(15)
  })

  it('can start counting from a user-picked anchor date instead of always "now" — the actual staggering mechanism', () => {
    // Two guides created at the exact same moment, but with different chosen
    // anchor dates, must NOT end up with the same next-review date.
    const anchorA = dateStringToTimestamp('2026-10-01')
    const anchorB = dateStringToTimestamp('2026-11-15')
    const nextA = computeNextReviewAt(anchorA, 3)
    const nextB = computeNextReviewAt(anchorB, 3)
    expect(timestampToDateString(nextA!)).toBe('2027-01-01')
    expect(timestampToDateString(nextB!)).toBe('2027-02-15')
    expect(nextA).not.toBe(nextB)
  })
})

describe('dateStringToTimestamp / timestampToDateString', () => {
  it('round-trips a plain yyyy-MM-dd date without a timezone off-by-one', () => {
    for (const value of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(timestampToDateString(dateStringToTimestamp(value))).toBe(value)
    }
  })
})

describe('getReviewStatus', () => {
  it('returns "none" when no review interval is configured', () => {
    const guide = makeGuide({ reviewIntervalMonths: null, nextReviewAt: null })
    expect(getReviewStatus(guide)).toBe('none')
  })

  it('returns "overdue" when nextReviewAt has passed', () => {
    const guide = makeGuide({ reviewIntervalMonths: 3, nextReviewAt: Date.now() - 1000 })
    expect(getReviewStatus(guide)).toBe('overdue')
  })

  it('returns "due-soon" within the 14-day warning window', () => {
    const guide = makeGuide({ reviewIntervalMonths: 3, nextReviewAt: Date.now() + 7 * 24 * 60 * 60 * 1000 })
    expect(getReviewStatus(guide)).toBe('due-soon')
  })

  it('returns "ok" when far from the review date', () => {
    const guide = makeGuide({ reviewIntervalMonths: 3, nextReviewAt: Date.now() + 60 * 24 * 60 * 60 * 1000 })
    expect(getReviewStatus(guide)).toBe('ok')
  })
})

describe('migrateGuide', () => {
  it('is idempotent for already-v2 guides', () => {
    const guide = makeGuide({ schemaVersion: 2, sections: [] })
    const migrated = migrateGuide(guide)
    expect(migrated).toBe(guide)
  })

  it('migrates a v1 guide with content into a section/step', () => {
    const guide = makeGuide({ content: 'Gammel brødtekst' })
    const migrated = migrateGuide(guide)
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.sections).toHaveLength(1)
    expect(migrated.sections![0].steps[0].text).toBe('Gammel brødtekst')
  })

  it('migrates a v1 guide with empty content into zero sections', () => {
    const guide = makeGuide({ content: '' })
    const migrated = migrateGuide(guide)
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.sections).toHaveLength(0)
  })
})
