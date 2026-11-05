import { describe, it, expect } from 'vitest'
import { prismLabels } from './labels'

const POWERS = ['wide', 'multiball', 'fireball', 'laser', 'magnet', 'slow', 'shield', 'life'] as const

describe('prismLabels', () => {
  it('har alle tekster på dansk, engelsk og finsk', () => {
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = prismLabels(language)
      const texts = [
        labels.menu.title,
        labels.menu.tagline,
        ...Object.values(labels.menu.difficultyDetail),
        ...Object.values(labels.menu.controls),
        labels.menu.spaceKey,
        labels.menu.mouseKey,
        ...Object.values(labels.hud),
        ...Object.values(labels.stats),
        labels.levelCleared,
        labels.perfectLevel,
        labels.lifeLost,
        labels.extraLife,
        labels.shieldHeld,
        labels.serveHint,
        ...POWERS.map((power) => labels.powers[power]),
      ]
      for (const value of texts) expect(value.length, language).toBeGreaterThan(0)
      expect(labels.level(4)).toContain('4')
      expect(Object.keys(labels.menu.difficultyDetail)).toEqual(['easy', 'medium', 'hard', 'expert'])
    }
  })

  it('formaterer point efter sproget og falder tilbage til dansk', () => {
    expect(prismLabels('da').points(12450)).toBe('12.450')
    expect(prismLabels('en').points(12450)).toBe('12,450')
    expect(prismLabels('xx').level(2)).toBe(prismLabels('da').level(2))
  })
})
