import { describe, it, expect } from 'vitest'
import { DIFFICULTIES, DIFFICULTY_SETTINGS, FIELD } from './config'

describe('config', () => {
  it('har de fire sværhedsgrader som highscore-tavlerne bruger', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'medium', 'hard', 'expert'])
    for (const difficulty of DIFFICULTIES) expect(DIFFICULTY_SETTINGS[difficulty]).toBeDefined()
  })

  it('bliver strengt sværere fra let til ekspert', () => {
    const keys = ['enemySpeed', 'eggRate', 'eggSpeed', 'diveRate', 'bossHealth', 'descentStep'] as const
    for (const key of keys) {
      const values = DIFFICULTIES.map((difficulty) => DIFFICULTY_SETTINGS[difficulty][key])
      for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })

  it('bruger en fast logisk spilleflade, så skærmbredden ikke påvirker sværhedsgraden', () => {
    expect(FIELD).toEqual({ width: 960, height: 600 })
  })
})
