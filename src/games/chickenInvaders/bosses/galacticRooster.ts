import { FIELD } from '../config'
import {
  blackHoleAttack,
  burstAttack,
  chunksAttack,
  fanAttack,
  gridAttack,
  shardsAttack,
  spiralAttack,
  sweepAttack,
  teleportAttack,
  ufosAttack,
} from './attacks'
import { newBossState, scaledHealth, stepBoss, sway, type AttackTable, type BossWorld, type Pattern } from './core'
import type { BossDef } from './types'

/** Den Galaktiske Hane: finalen. Teleporterer og låner de andre bossers angreb, fase for fase. */
export const GALACTIC = { halfWidth: 100, halfHeight: 82, homeY: 160, health: 1.4 }

const beak = (w: BossWorld) => ({ x: w.boss.x, y: w.boss.y + w.boss.halfHeight * 0.45 })
const core = (w: BossWorld) => [{ x: w.boss.x, y: w.boss.y + w.boss.halfHeight * 0.6 }]

const attacks: AttackTable = {
  teleport: teleportAttack({ cooldown: 0.9 }),
  fan: fanAttack({ count: 7, spread: 0.6, cooldown: 1.2 }),
  chunks: chunksAttack({ count: 3, types: ['fire', 'ice', 'metal', 'rock'], cooldown: 1.5 }),
  ufos: ufosAttack({ max: (w) => (w.boss.phase === 3 ? 2 : 1), cooldown: 1.1 }),
  spiral: spiralAttack({ arms: 3, rate: 2.4, every: 0.14, duration: 2.4, speed: 0.5, kind: 'fire', cooldown: 1.4 }),
  frostLaser: sweepAttack({ span: FIELD.width * 0.44, fire: 1.6, style: 'plasma', halfWidth: 16, cooldown: 1.4, origin: beak }),
  burst: burstAttack({ shots: 4, gap: 0.12, cooldown: 1.2, sources: core }),
  grid: gridAttack({ count: (w) => (w.boss.difficulty === 'easy' ? 2 : 3), fire: 0.75, cooldown: 1.3, style: 'plasma' }),
  blackHole: blackHoleAttack({ duration: 3.4, ringEvery: 1.2, cooldown: 1.6 }),
  shards: shardsAttack({ count: 16, bursts: 2, gap: 0.35, cooldown: 1.2 }),
}

const pattern: Pattern = {
  1: ['teleport', 'fan', 'chunks', 'ufos', 'teleport', 'chunks', 'fan'],
  2: ['teleport', 'spiral', 'frostLaser', 'burst', 'ufos', 'teleport', 'burst'],
  3: ['blackHole', 'grid', 'teleport', 'shards', 'ufos', 'grid', 'burst'],
}

function move(w: BossWorld, dt: number): void {
  const { boss } = w
  boss.spin += dt
  sway(boss, boss.phase === 1 ? 60 : 80, dt, boss.halfWidth + 30, FIELD.width - boss.halfWidth - 30)
  boss.y = boss.homeY + Math.sin(boss.spin * 1.3) * 12
}

export const galacticRooster: BossDef = {
  id: 'galacticRooster',
  mini: false,
  points: 25_000,
  health: (difficulty, round) => scaledHealth(difficulty, round, GALACTIC.health),
  create: (setup) =>
    newBossState({
      id: 'galacticRooster',
      mini: false,
      ...setup,
      maxHealth: scaledHealth(setup.difficulty, setup.round, GALACTIC.health),
      halfWidth: GALACTIC.halfWidth,
      halfHeight: GALACTIC.halfHeight,
      homeY: GALACTIC.homeY,
      x: FIELD.width / 2,
    }),
  update: (w, dt) => stepBoss(w, pattern, attacks, dt, { move }),
  pattern,
  attacks,
}
