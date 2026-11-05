import { describe, it, expect } from 'vitest'
import type { CrossTeamEntry } from '@/hooks/useCrossTeamLeaderboard'
import { arcadeLabels, countUpValue, fitStage, hallOfFameRows, personalBest, radioKeyTarget } from './arcadeCabinet'

const entry = (email: string, score: number, teamCode?: string): CrossTeamEntry => ({ id: email, email, score, timestamp: 0, displayName: email.split('@')[0], teamCode })

describe('hallOfFameRows', () => {
  const board = Array.from({ length: 14 }, (_, i) => entry(`p${i}@x`, 1000 - i * 10))

  it('viser top 10 med placering og markerer den aktuelle spiller', () => {
    const { top, own } = hallOfFameRows(board, 'p2@x')
    expect(top).toHaveLength(10)
    expect(top.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(top[2].isCurrentUser).toBe(true)
    expect(own).toBeNull()
  })

  it('viser egen placering separat når man er uden for top 10', () => {
    const { top, own } = hallOfFameRows(board, 'p12@x')
    expect(top.some((row) => row.isCurrentUser)).toBe(false)
    expect(own).toMatchObject({ rank: 13, isCurrentUser: true })
  })

  it('forveksler ikke en spiller fra et andet team med samme e-mail', () => {
    const { top } = hallOfFameRows([entry('me@x', 50, 'TRR')], 'me@x')
    expect(top[0].isCurrentUser).toBe(false)
  })
})

describe('personalBest', () => {
  it('finder kun spillerens egen score i eget team', () => {
    expect(personalBest([entry('me@x', 900, 'TRR'), entry('me@x', 400), entry('you@x', 300)], 'me@x')).toBe(400)
    expect(personalBest([entry('you@x', 300)], 'me@x')).toBeNull()
  })
})

describe('radioKeyTarget', () => {
  it('flytter med piletaster og ruller rundt', () => {
    expect(radioKeyTarget(0, 'ArrowRight', 4)).toBe(1)
    expect(radioKeyTarget(3, 'ArrowDown', 4)).toBe(0)
    expect(radioKeyTarget(0, 'ArrowLeft', 4)).toBe(3)
    expect(radioKeyTarget(2, 'ArrowUp', 4)).toBe(1)
    expect(radioKeyTarget(2, 'Home', 4)).toBe(0)
    expect(radioKeyTarget(1, 'End', 4)).toBe(3)
    expect(radioKeyTarget(1, 'a', 4)).toBeNull()
  })
})

describe('countUpValue', () => {
  it('tæller fra 0 op til slutscoren og stopper der', () => {
    expect(countUpValue(12450, 0, 1000)).toBe(0)
    const mid = countUpValue(12450, 500, 1000)
    expect(mid).toBeGreaterThan(6000)
    expect(mid).toBeLessThan(12450)
    expect(countUpValue(12450, 1000, 1000)).toBe(12450)
    expect(countUpValue(12450, 5000, 1000)).toBe(12450)
  })

  it('viser slutscoren straks når varigheden er 0', () => {
    expect(countUpValue(300, 0, 0)).toBe(300)
  })
})

describe('fitStage', () => {
  it('fylder bredden når der er højde nok', () => {
    expect(fitStage({ width: 1000, height: 900 }, 1.6)).toEqual({ width: 1000, height: 625 })
  })

  it('fylder højden på en bred skærm og har intet loft på størrelsen', () => {
    expect(fitStage({ width: 2400, height: 1000 }, 1.6)).toEqual({ width: 1600, height: 1000 })
  })

  it('bliver aldrig mindre end minimum og tåler ugyldige mål', () => {
    expect(fitStage({ width: 100, height: 50 }, 1.6)).toEqual({ width: 280, height: 175 })
    expect(fitStage({ width: Number.NaN, height: 0 }, 1.6)).toEqual({ width: 280, height: 175 })
  })
})

describe('arcadeLabels', () => {
  it('har alle tekster på dansk, engelsk, finsk og svensk', () => {
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = arcadeLabels(language)
      for (const [key, value] of Object.entries(labels)) {
        if (typeof value === 'string') expect(value.length, `${language}.${key}`).toBeGreaterThan(0)
      }
      expect(labels.rank(13)).toContain('13')
    }
  })
})
