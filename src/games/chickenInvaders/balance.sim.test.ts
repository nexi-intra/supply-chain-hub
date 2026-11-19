import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { runCampaign, type WaveResult } from './balanceKit'
import { DIFFICULTIES, type Difficulty } from './config'
import { WEAPON_FAMILIES, type WeaponFamily } from './weapons'

/**
 * Balance-rapport (kører kun med CHICKEN_BALANCE_OUT=<fil.json>): botten spiller kampagnen pr. sværhedsgrad og
 * hver boss med hver våbenfamilie, så kurven kan aflæses i tal.
 */
const out = process.env.CHICKEN_BALANCE_OUT
const SEEDS = (process.env.CHICKEN_BALANCE_SEEDS ?? '11,29').split(',').map(Number)
const TO_WAVE = Number(process.env.CHICKEN_BALANCE_TO ?? 48)
const REACTION = Number(process.env.CHICKEN_BALANCE_REACTION ?? 2)
const FAMILY = (process.env.CHICKEN_BALANCE_FAMILY ?? 'blaster') as WeaponFamily
const natural = () => ({ family: FAMILY })

const mean = (values: number[]) => (values.length === 0 ? 0 : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100)

function summarize(results: WaveResult[]) {
  const bySector: Record<string, Record<string, unknown>> = {}
  for (const key of [...new Set(results.map((r) => `${r.round}:${r.sector}`))]) {
    const waves = results.filter((r) => `${r.round}:${r.sector}` === key)
    const of = (type: string) => waves.filter((r) => r.slotType === type)
    const rain = waves.filter((r) => r.bonus?.stage === 'drumstickRain')
    const dodge = waves.filter((r) => r.bonus?.stage === 'eggDodge')
    bySector[key] = {
      formationHits: mean(of('formation').map((r) => r.hits)),
      formationSeconds: mean(of('formation').map((r) => r.seconds)),
      level: mean(waves.map((r) => r.level)),
      hazardHits: mean(of('hazard').map((r) => r.hits)),
      hazards: of('hazard').map((r) => `${r.templateId}:${r.hits}`),
      miniboss: of('miniboss').map((r) => `${r.templateId}:${r.timedOut ? 'TIMEOUT' : r.seconds.toFixed(0)}s/${r.hits}h`),
      boss: of('boss').map((r) => `${r.templateId}:${r.timedOut ? 'TIMEOUT' : r.seconds.toFixed(0)}s/${r.hits}h`),
      rain: rain.map((r) => `${r.bonus!.collected}/${r.bonus!.possible}${r.bonus!.perfect ? ' P' : ''}`),
      dodge: dodge.map((r) => (r.bonus!.missed ? 'miss' : 'clean')),
      gallery: waves.filter((r) => r.bonus?.stage === 'shootingGallery').map((r) => `${r.bonus!.collected}/${r.bonus!.possible}`),
      hitsPerMinute: mean([(60 * waves.reduce((sum, r) => sum + r.hits, 0)) / Math.max(1, waves.reduce((sum, r) => sum + r.seconds, 0))]),
      causes: waves.reduce<Record<string, number>>((all, r) => {
        for (const [cause, count] of Object.entries(r.causes)) all[cause] = (all[cause] ?? 0) + count
        return all
      }, {}),
    }
  }
  return bySector
}

describe.runIf(!!out)('balance-rapport', () => {
  it('spiller kampagnen og bosserne', () => {
    const report: Record<string, unknown> = {}
    for (const difficulty of (process.env.CHICKEN_BALANCE_DIFFICULTIES?.split(',') ?? DIFFICULTIES) as Difficulty[]) {
      const runs = SEEDS.map((seed) => runCampaign({ difficulty, seed, toWave: TO_WAVE, weapon: natural, reaction: REACTION }))
      report[difficulty] = runs.map(summarize)
    }
    if (process.env.CHICKEN_BALANCE_WEAPONS) {
      const bosses: Record<string, Record<string, string>> = {}
      for (const difficulty of ['easy', 'expert'] as Difficulty[]) {
        for (const family of WEAPON_FAMILIES) {
          const row: Record<string, string> = {}
          for (const wave of [6, 8, 14, 16, 22, 24, 30, 32, 38, 40]) {
            const sector = Math.floor((wave - 1) / 8)
            const [result] = runCampaign({ difficulty, seed: 11, fromWave: wave, toWave: wave, reaction: REACTION, weapon: () => ({ family, level: Math.min(5, 2 + sector) }) })
            row[`${wave}:${result?.templateId}`] = result ? `${result.timedOut ? 'TIMEOUT' : result.seconds.toFixed(0)}s/${result.hits}h` : '?'
          }
          bosses[`${difficulty}:${family}`] = row
        }
      }
      report.bosses = bosses
    }
    writeFileSync(out!, JSON.stringify(report, null, 1))
  }, 1_200_000)
})
