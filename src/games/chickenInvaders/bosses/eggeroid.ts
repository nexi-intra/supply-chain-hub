import { FIELD } from '../config'
import { chunksAttack, fanAttack, shardsAttack, spiralAttack } from './attacks'
import { clamp, newBossState, scaledHealth, stepBoss, type AttackTable, type BossWorld, type Pattern } from './core'
import type { BossDef } from './types'

/** Æggeroiden: en kæmpe ægformet asteroide, der driver langsomt og revner mere og mere. */
export const EGGEROID = { halfWidth: 104, halfHeight: 92, homeY: 176, health: 1.15 }

const attacks: AttackTable = {
  chunks: chunksAttack({ count: 3, types: ['rock', 'rock', 'metal'], cooldown: 1.7 }),
  fan: fanAttack({ count: 5, spread: 0.55, cooldown: 1.3 }),
  spiral: spiralAttack({ arms: 3, rate: 2.1, every: 0.13, duration: 2.6, speed: 0.5, cooldown: 1.5 }),
  bigChunks: chunksAttack({ count: 4, types: ['rock', 'metal', 'fire'], cooldown: 1.6 }),
  shards: shardsAttack({ count: 14, bursts: 3, gap: 0.32, cooldown: 1.3 }),
}

const pattern: Pattern = {
  1: ['chunks', 'fan', 'chunks', 'fan'],
  2: ['spiral', 'bigChunks', 'fan', 'spiral', 'chunks'],
  3: ['shards', 'spiral', 'bigChunks', 'shards', 'fan'],
}

/** Langsom drift i en bred bue; fase 3 driver lidt hurtigere. */
function move(w: BossWorld, dt: number): void {
  const { boss } = w
  boss.spin += dt * (boss.phase === 3 ? 0.9 : 0.45)
  const speed = boss.phase === 3 ? 62 : 40
  boss.x = clamp(boss.x + boss.dir * speed * dt, boss.halfWidth + 20, FIELD.width - boss.halfWidth - 20)
  if (boss.x <= boss.halfWidth + 20) boss.dir = 1
  else if (boss.x >= FIELD.width - boss.halfWidth - 20) boss.dir = -1
  boss.y = boss.homeY + Math.sin(boss.spin * 1.3) * 16
}

export const eggeroid: BossDef = {
  id: 'eggeroid',
  mini: false,
  points: 12_000,
  health: (difficulty, round) => scaledHealth(difficulty, round, EGGEROID.health),
  create: (setup) =>
    newBossState({
      id: 'eggeroid',
      mini: false,
      ...setup,
      maxHealth: scaledHealth(setup.difficulty, setup.round, EGGEROID.health),
      halfWidth: EGGEROID.halfWidth,
      halfHeight: EGGEROID.halfHeight,
      homeY: EGGEROID.homeY,
      x: FIELD.width / 2,
    }),
  update: (w, dt) => stepBoss(w, pattern, attacks, dt, { move }),
  pattern,
  attacks,
}
