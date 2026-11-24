import { FIELD } from '../config'
import { fanAttack, tractorAttack, ufosAttack } from './attacks'
import { newBossState, scaledHealth, stepBoss, sway, type AttackTable, type BossWorld, type Pattern } from './core'
import type { BossDef } from './types'

/** UFO-moderskibet: stor UFO med bred, varslet traktorstråle, der stjæler et våbenniveau, og små UFO-kyllinger. */
export const MOTHERSHIP = { halfWidth: 124, halfHeight: 48, homeY: 112, health: 0.65 }

const rim = (w: BossWorld) => ({ x: w.boss.x, y: w.boss.y + w.boss.halfHeight * 0.6 })

const attacks: AttackTable = {
  ring: fanAttack({ count: 9, spread: 1.05, speed: 0.85, cooldown: 1.2, from: rim }),
  tractor: tractorAttack({ duration: 2.6, cooldown: 1.3 }),
  ufos: ufosAttack({ max: (w) => (w.boss.phase === 1 ? 1 : 2), cooldown: 1.2 }),
}

const pattern: Pattern = {
  1: ['ring', 'tractor', 'ufos', 'ring'],
  2: ['tractor', 'ring', 'ufos', 'ring'],
  3: ['tractor', 'ring', 'ring', 'ufos'],
}

function move(w: BossWorld, dt: number): void {
  const { boss } = w
  boss.spin += dt
  sway(boss, boss.phase === 3 ? 110 : 80, dt, boss.halfWidth + 20, FIELD.width - boss.halfWidth - 20)
  boss.y = boss.homeY + Math.sin(boss.spin * 2) * 5
}

export const ufoMothership: BossDef = {
  id: 'ufoMothership',
  mini: true,
  points: 6_000,
  health: (difficulty, round) => scaledHealth(difficulty, round, MOTHERSHIP.health),
  create: (setup) =>
    newBossState({
      id: 'ufoMothership',
      mini: true,
      ...setup,
      maxHealth: scaledHealth(setup.difficulty, setup.round, MOTHERSHIP.health),
      halfWidth: MOTHERSHIP.halfWidth,
      halfHeight: MOTHERSHIP.halfHeight,
      homeY: MOTHERSHIP.homeY,
      x: FIELD.width / 2,
    }),
  update: (w, dt) => stepBoss(w, pattern, attacks, dt, { move }),
  /** Hvert stjålet niveau kommer tilbage som en gave i det nuværende våbens farve. */
  drops: (w) => {
    for (let i = 0; i < w.boss.stolen; i++) w.drop('gift', w.boss.x + (i + 1) * 30, w.boss.y, w.state.weapon.family)
  },
  pattern,
  attacks,
}
