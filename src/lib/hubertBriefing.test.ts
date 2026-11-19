import { describe, expect, it } from 'vitest'
import { BRIEFING_QUESTIONS, briefingDue, briefingMarkerKey, markBriefingShown, type BriefingStorage } from './hubertBriefing'

const memory = (initial: Record<string, string> = {}): BriefingStorage & { data: Record<string, string> } => {
  const data = { ...initial }
  return { data, getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value } }
}
const broken: BriefingStorage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
const MORNING = new Date(2026, 9, 13, 8, 30)

describe('Hubert morning briefing marker', () => {
  it('is per user: the key carries the lower-cased e-mail', () => {
    expect(briefingMarkerKey(' Jacob@Test ')).toBe('hubert-briefing-jacob@test')
  })

  it('is due the first time, and not again the same calendar day', () => {
    const storage = memory()
    expect(briefingDue('jacob@test', MORNING, storage)).toBe(true)
    markBriefingShown('jacob@test', MORNING, storage)
    expect(storage.data['hubert-briefing-jacob@test']).toBe('2026-10-13')
    expect(briefingDue('jacob@test', MORNING, storage)).toBe(false)
    expect(briefingDue('jacob@test', new Date(2026, 9, 13, 23, 59), storage)).toBe(false)
  })

  it('is due again the next calendar day, also just after midnight', () => {
    const storage = memory({ 'hubert-briefing-jacob@test': '2026-10-13' })
    expect(briefingDue('jacob@test', new Date(2026, 9, 14, 0, 1), storage)).toBe(true)
    expect(briefingDue('jacob@test', new Date(2026, 10, 1, 9, 0), storage)).toBe(true)
  })

  it('keeps one marker per user', () => {
    const storage = memory()
    markBriefingShown('jacob@test', MORNING, storage)
    expect(briefingDue('anne@test', MORNING, storage)).toBe(true)
  })

  it('is never due without a signed-in user or without usable storage, and never throws', () => {
    expect(briefingDue('', MORNING, memory())).toBe(false)
    expect(briefingDue('   ', MORNING, memory())).toBe(false)
    expect(briefingDue('jacob@test', MORNING, null)).toBe(false)
    expect(briefingDue('jacob@test', MORNING, broken)).toBe(false)
    expect(() => markBriefingShown('jacob@test', MORNING, broken)).not.toThrow()
    expect(() => markBriefingShown('jacob@test', MORNING, null)).not.toThrow()
    const storage = memory()
    markBriefingShown('', MORNING, storage)
    expect(storage.data).toEqual({})
  })

  it('asks the canonical greeting in each language', () => {
    expect(BRIEFING_QUESTIONS).toEqual({ da: 'godmorgen', en: 'good morning', fi: 'huomenta', sv: 'god morgon' })
  })
})
