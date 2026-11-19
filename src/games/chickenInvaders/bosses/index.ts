import { bossPhase, livingParts, type BossId, type BossState, type BossWorld } from './core'
import { chickenCruiser } from './chickenCruiser'
import { eggeroid } from './eggeroid'
import { eggTrio } from './eggTrio'
import { galacticRooster } from './galacticRooster'
import { iceQueen } from './iceQueen'
import { motherHen } from './motherHen'
import { roboRooster } from './roboRooster'
import type { BossCreate, BossDef } from './types'
import { ufoMothership } from './ufoMothership'
import type { Difficulty } from '../config'

export * from './core'
export { laserHits } from './motherHen'
export { TRACTOR_HALF_WIDTH } from './attacks'
export type { BossCreate, BossDef } from './types'

/** Registret: én definition pr. boss og mini-boss; motoren dispatcher kun herigennem. */
export const BOSS_DEFS: Record<BossId, BossDef> = {
  motherHen,
  eggeroid,
  iceQueen,
  roboRooster,
  galacticRooster,
  eggTrio,
  chickenCruiser,
  ufoMothership,
}

export function bossHealthFor(id: BossId, difficulty: Difficulty, round: number, variant = 0): number {
  return BOSS_DEFS[id].health(difficulty, round, variant)
}

export function createBossFor(id: BossId, setup: BossCreate): BossState {
  return BOSS_DEFS[id].create(setup)
}

export function setupBoss(w: BossWorld): void {
  BOSS_DEFS[w.boss.id].setup?.(w)
}

export function updateBossState(w: BossWorld, dt: number): void {
  BOSS_DEFS[w.boss.id].update(w, dt)
}

/** Lægger delenes liv sammen for trioen og krydseren; returnerer true når bossen er besejret. */
export function settleBoss(w: BossWorld): boolean {
  const { boss } = w
  if (BOSS_DEFS[boss.id].partsHealth) {
    const health = livingParts(w.state, boss).reduce((sum, part) => sum + Math.max(0, part.hp), 0)
    if (health !== boss.health) {
      boss.health = health
      const phase = bossPhase(health, boss.maxHealth)
      if (phase !== boss.phase && health > 0) {
        boss.phase = phase
        boss.cycle = 0
        w.events.push({ type: 'bossPhase', phase, boss: boss.id })
      }
    }
  }
  return boss.health <= 0
}

export function bossPoints(boss: BossState): number {
  const def = BOSS_DEFS[boss.id]
  return def.bonus ? def.bonus(boss) : def.points * (1 + boss.round)
}

export function bossDrops(w: BossWorld): void {
  BOSS_DEFS[w.boss.id].drops?.(w)
}
