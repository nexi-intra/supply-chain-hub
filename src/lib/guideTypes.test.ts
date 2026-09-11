import { describe, it, expect } from 'vitest'
import { computeNextReviewAt, getReviewStatus, migrateGuide, type Guide } from './guideTypes'

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
