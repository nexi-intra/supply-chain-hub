import { describe, it, expect } from 'vitest'
import { runCampaign, type WaveResult } from './balanceKit'
import { campaignWave } from './campaign'
import type { Difficulty } from './config'
import type { TemplateId } from './waveTemplates'
import type { WeaponFamily } from './weapons'

/** Bot med menneskelig reaktionstid (150 ms); se balance.sim.test.ts for hele rapporten. */
const HUMAN = 9

function firstWave(seed: number, template: TemplateId): number {
  for (let wave = 1; wave <= 40; wave++) if (campaignWave(wave, seed).templateId === template) return wave
  throw new Error(`${template} findes ikke i første runde for seed ${seed}`)
}

function single(difficulty: Difficulty, wave: number, options: { seed?: number; family?: WeaponFamily; level?: number; reaction?: number } = {}): WaveResult {
  const [result] = runCampaign({
    difficulty,
    seed: options.seed ?? 11,
    fromWave: wave,
    toWave: wave,
    reaction: options.reaction ?? HUMAN,
    weapon: () => ({ family: options.family ?? 'blaster', level: options.level }),
  })
  return result
}

describe('balance (bot-simulation)', () => {
  it('gør sektor 1 blid på let: få træf gennem de første otte bølger', () => {
    const results = runCampaign({ difficulty: 'easy', seed: 11, toWave: 8, reaction: HUMAN, weapon: () => ({ family: 'blaster' }) })
    const hits = results.reduce((sum, result) => sum + result.hits, 0)
    expect(hits, JSON.stringify(results.map((r) => `${r.templateId}:${r.hits}`))).toBeLessThanOrEqual(4)
  }, 60_000)

  it('lader Mor Høne i Nyt+ være et skridt op, ikke en mur', () => {
    const result = single('medium', 48, { level: 4 })
    expect(result.timedOut).toBe(false)
    expect(result.seconds, `${result.seconds.toFixed(0)} s, ${result.hits} træf`).toBeLessThan(45)
    expect(result.hits, `${result.seconds.toFixed(0)} s, ${result.hits} træf`).toBeLessThanOrEqual(3)
  }, 60_000)

  it('holder ekspertens hovedbosser hårde, men inden for 90 s og 6 træf med et svagt niveau 2-våben', () => {
    const rows: string[] = []
    for (const wave of [8, 16, 24, 32, 40]) {
      const result = single('expert', wave, { level: 2 })
      rows.push(`${result.templateId}:${result.timedOut ? 'TIMEOUT' : result.seconds.toFixed(0)}s/${result.hits}`)
    }
    for (const row of rows) {
      const [, seconds, hits] = /:(\w+)s\/(\d+)/.exec(row)!
      expect(Number(seconds), rows.join(' ')).toBeLessThan(90)
      expect(Number(hits), rows.join(' ')).toBeLessThanOrEqual(6)
    }
  }, 120_000)

  it('lader kometstormen på ekspert være til at undvige', () => {
    for (const seed of [11, 29]) {
      const result = single('expert', firstWave(seed, 'cometStorm'), { seed, level: 3 })
      expect(result.causes['meteor:comet'] ?? 0, `seed ${seed}: ${JSON.stringify(result.causes)}`).toBeLessThanOrEqual(1)
      expect(result.hits, `seed ${seed}: ${JSON.stringify(result.causes)}`).toBeLessThanOrEqual(4)
    }
  }, 60_000)

  it('gør "Perfekt" i kyllingelårsregnen opnåelig', () => {
    const rain: string[] = []
    let perfect = 0
    for (const seed of [11, 29, 47]) {
      const result = single('medium', firstWave(seed, 'drumstickRain'), { seed, reaction: 2 })
      rain.push(`${result.bonus?.collected}/${result.bonus?.possible}`)
      if (result.bonus?.perfect) perfect++
    }
    expect(perfect, rain.join(' ')).toBeGreaterThanOrEqual(1)
  }, 60_000)
})
