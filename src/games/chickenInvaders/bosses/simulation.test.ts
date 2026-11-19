import { describe, it, expect } from 'vitest'
import { SHIP_MAX_Y, STEP_SECONDS, type Difficulty } from '../config'
import { createGame, getStats, stepGame, type GameInput, type GameState } from '../engine'
import { ALL_BOSS_IDS, bossVulnerable } from './index'
import { allFinite, BOSS_WAVES, bossGame, idle, readyBoss, type BossKey } from './testKit'

/** En ærlig bot med niveau 1-ionkanon: sigter på kernen, ellers på det nærmeste tårn eller den nærmeste høne, og sigter lidt foran det, der bevæger sig. */
function blasterBot(state: GameState): Partial<GameInput> {
  state.ship.invulnerableUntil = Infinity
  state.weapon.family = 'blaster'
  state.weapon.level = 1
  const boss = state.boss
  let x: number | null = null
  if (boss && !boss.entering) {
    if (bossVulnerable(boss)) {
      x = boss.x
    } else {
      let best = Infinity
      for (const enemy of state.enemies) {
        if (enemy.dead || enemy.kind === 'meteor' || enemy.kind === 'ufo') continue
        const d = Math.abs(enemy.x - state.ship.x) + (enemy.kind === 'bossPart' ? 0 : 400)
        if (d < best) {
          best = d
          const flight = (state.ship.y - enemy.y) / 720
          x = enemy.x + (enemy.dx / STEP_SECONDS) * flight
        }
      }
    }
  }
  return { fire: true, pointerX: x, pointerY: SHIP_MAX_Y }
}

function fightSeconds(key: BossKey, difficulty: Difficulty, limit: number): number {
  const state = bossGame(key, difficulty, 17)
  readyBoss(state)
  const start = state.time
  const steps = Math.round(limit / STEP_SECONDS)
  for (let i = 0; i < steps && state.boss; i++) {
    stepGame(state, { ...idle, ...blasterBot(state) })
    if (!allFinite(state)) throw new Error(`${key}: ugyldigt tal efter ${(state.time - start).toFixed(1)} s`)
  }
  return state.boss ? Infinity : state.time - start
}

describe('balance med niveau 1-ionkanon', () => {
  const limits: Record<Difficulty, number> = { easy: 150, medium: 180, hard: 210, expert: 240 }
  for (const difficulty of ['easy', 'expert'] as const) {
    it(`slår hver boss og mini-boss på ${difficulty} inden for ${limits[difficulty]} s`, () => {
      const times: Record<string, number> = {}
      for (const key of Object.keys(BOSS_WAVES) as BossKey[]) times[key] = fightSeconds(key, difficulty, limits[difficulty])
      for (const [key, seconds] of Object.entries(times)) {
        expect(seconds, `${key}: ${JSON.stringify(times)}`).toBeLessThan(limits[difficulty])
        // En boss skal være en kamp, ikke et øjebliks arbejde.
        expect(seconds, key).toBeGreaterThan(8)
      }
    }, 60_000)
  }
})

describe('hele kampagnen', () => {
  it('når gennem bølge 1-48 uden NaN og besejrer alle fem bosser og tre mini-bosser', () => {
    for (const difficulty of ['easy', 'expert'] as const) {
      const state = createGame(difficulty, { seed: 23 })
      const defeated = new Set<string>()
      const intros: string[] = []
      let startedAt = 0
      for (let i = 0; i < Math.round(2600 / STEP_SECONDS) && state.wave < 49; i++) {
        state.ship.invulnerableUntil = Infinity
        if (i % 3 === 0 && state.time - startedAt > 6) {
          for (const enemy of state.enemies) {
            state.projectiles.push({ id: state.nextId++, kind: 'bolt', x: enemy.x, y: enemy.y, vx: 0, vy: -1, damage: 99, pierce: false, hitIds: [], dead: false })
          }
        }
        const boss = state.boss
        if (boss && !boss.entering) state.projectiles.push({ id: state.nextId++, kind: 'bolt', x: boss.x, y: boss.y, vx: 0, vy: -1, damage: 5, pierce: false, hitIds: [], dead: false })
        const events = stepGame(state, { ...idle, fire: true, pointerX: state.enemies[0]?.x ?? null })
        for (const event of events) {
          if (event.type === 'waveStart') startedAt = state.time
          if (event.type === 'bossDefeated' && event.boss) defeated.add(event.boss)
          if (event.type === 'bossIntro') intros.push(event.boss)
        }
        if (!allFinite(state)) throw new Error(`${difficulty}: ugyldigt tal i bølge ${state.wave}`)
      }
      expect(state.wave, difficulty).toBe(49)
      expect([...defeated].sort(), difficulty).toEqual([...ALL_BOSS_IDS].sort())
      expect(intros.length, difficulty).toBeGreaterThanOrEqual(12)
      const stats = getStats(state)
      expect(stats.distinctBosses).toBe(8)
      expect(stats.sector).toBe(2)
      expect(stats.round).toBe(1)
    }
  }, 90_000)
})
