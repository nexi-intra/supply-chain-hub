import {
  BOSS_ENTER_SECONDS,
  BOSS_HALF_HEIGHT,
  BOSS_HALF_WIDTH,
  BOSS_POINTS_PER_LEVEL,
  BOSS_Y,
  DIFFICULTY_SETTINGS,
  LASER_FIRING_SECONDS,
  LASER_HALF_WIDTH,
  LASER_INTERVAL_SECONDS,
  LASER_WARNING_SECONDS,
  type Difficulty,
} from '../config'
import type { Rng } from '../rng'
import { newBossState, type BossState, type BossWorld } from './core'
import type { BossDef } from './types'

export interface EggSpawn {
  x: number
  y: number
  vx: number
  vy: number
}

export type BossAction =
  | { type: 'eggs'; eggs: EggSpawn[] }
  | { type: 'chicks'; count: number; x: number; y: number }
  | { type: 'laserWarning'; x: number }
  | { type: 'laserFire'; x: number }
  | { type: 'laserEnd' }

export interface BossContext {
  shipX: number
  fieldWidth: number
  eggSpeed: number
  rng: Rng
}

const ENTER_FROM_Y = -BOSS_HALF_HEIGHT * 2
const PHASE_SPEED: Record<BossState['phase'], number> = { 1: 70, 2: 110, 3: 150 }

export function bossMaxHealth(level: number, difficulty: Difficulty): number {
  return DIFFICULTY_SETTINGS[difficulty].bossHealth * (1 + 0.5 * (level - 1))
}

/** Liv og fart følger runden (som de andre bosser); `level` giver kun point. */
export function createBoss(level: number, difficulty: Difficulty, fieldWidth: number, round = 0): BossState {
  return newBossState({
    id: 'motherHen',
    mini: false,
    variant: 0,
    level,
    round,
    difficulty,
    maxHealth: bossMaxHealth(1 + round, difficulty),
    halfWidth: BOSS_HALF_WIDTH,
    halfHeight: BOSS_HALF_HEIGHT,
    homeY: BOSS_Y,
    x: fieldWidth / 2,
    y: ENTER_FROM_Y,
  })
}

const laserTop = (boss: BossState) => boss.y + BOSS_HALF_HEIGHT - 6

/** Strålen går lodret fra Mor Hønes underside til gulvet; uden `shipY` tæller kun x. */
export function laserHits(boss: BossState, shipX: number, shipRadius: number, shipY = Infinity): boolean {
  if (boss.laser.state !== 'firing' || shipY + shipRadius < laserTop(boss)) return false
  return Math.abs(shipX - boss.laser.x) < LASER_HALF_WIDTH + shipRadius
}

function fan(boss: BossState, count: number, spread: number, speed: number): EggSpawn[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = -spread + (2 * spread * i) / (count - 1)
    return { x: boss.x, y: boss.y + BOSS_HALF_HEIGHT - 10, vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed }
  })
}

function rain(boss: BossState, count: number, speed: number, rng: Rng): EggSpawn[] {
  return Array.from({ length: count }, () => ({
    x: boss.x + (rng() - 0.5) * 2 * BOSS_HALF_WIDTH,
    y: boss.y + BOSS_HALF_HEIGHT - 10,
    vx: (rng() - 0.5) * 60,
    vy: speed * (0.8 + rng() * 0.4),
  }))
}

function updateEntrance(boss: BossState): void {
  const t = Math.min(1, boss.time / BOSS_ENTER_SECONDS)
  const eased = 1 - (1 - t) ** 3
  boss.y = ENTER_FROM_Y + (BOSS_Y - ENTER_FROM_Y) * eased
  if (t < 1) return
  boss.y = BOSS_Y
  boss.entering = false
  boss.nextVolleyAt = boss.time + 0.8
  boss.nextChicksAt = boss.time + 3
  boss.nextLaserAt = boss.time + 2
}

// Nyt+ tempo rule shared by all bosses (×(1 + 0.2·round), capped at round 4); as the very first boss she eases off in phases 2-3.
const roundTempo = (boss: BossState) => (boss.round === 0 && boss.phase >= 2 ? 0.9 : 1 + 0.2 * Math.min(boss.round, 4))

function move(boss: BossState, dt: number, fieldWidth: number): void {
  if (boss.laser.state !== 'idle') return
  const speed = PHASE_SPEED[boss.phase] * (1 + 0.1 * boss.round)
  boss.x += boss.dir * speed * dt
  if (boss.x - BOSS_HALF_WIDTH <= 0) {
    boss.x = BOSS_HALF_WIDTH
    boss.dir = 1
  } else if (boss.x + BOSS_HALF_WIDTH >= fieldWidth) {
    boss.x = fieldWidth - BOSS_HALF_WIDTH
    boss.dir = -1
  }
}

function updateLaser(boss: BossState, context: BossContext, actions: BossAction[]): void {
  const { laser } = boss
  if (laser.state === 'idle') {
    if (boss.phase < 3 || boss.time < boss.nextLaserAt) return
    const x = Math.min(context.fieldWidth - LASER_HALF_WIDTH, Math.max(LASER_HALF_WIDTH, context.shipX))
    boss.laser = { state: 'warning', x, until: boss.time + LASER_WARNING_SECONDS }
    actions.push({ type: 'laserWarning', x })
  } else if (boss.time >= laser.until) {
    if (laser.state === 'warning') {
      boss.laser = { state: 'firing', x: laser.x, until: boss.time + LASER_FIRING_SECONDS }
      actions.push({ type: 'laserFire', x: laser.x })
    } else {
      boss.laser = { state: 'idle', x: laser.x, until: 0 }
      boss.nextLaserAt = boss.time + LASER_INTERVAL_SECONDS / roundTempo(boss)
      actions.push({ type: 'laserEnd' })
    }
  }
}

export function updateBoss(boss: BossState, dt: number, context: BossContext): BossAction[] {
  boss.time += dt
  if (boss.entering) {
    updateEntrance(boss)
    return []
  }

  const actions: BossAction[] = []
  const tempo = roundTempo(boss)
  move(boss, dt, context.fieldWidth)

  if (boss.time >= boss.nextVolleyAt) {
    if (boss.phase === 1) {
      actions.push({ type: 'eggs', eggs: fan(boss, 5, 0.5, context.eggSpeed) })
      boss.nextVolleyAt = boss.time + 1.6 / tempo
    } else if (boss.phase === 2) {
      actions.push({ type: 'eggs', eggs: rain(boss, 6, context.eggSpeed, context.rng) })
      boss.nextVolleyAt = boss.time + 1.1 / tempo
    } else {
      actions.push({ type: 'eggs', eggs: fan(boss, 7, 0.6, context.eggSpeed) })
      boss.nextVolleyAt = boss.time + 1.4 / tempo
    }
  }

  if (boss.phase >= 2 && boss.time >= boss.nextChicksAt) {
    actions.push({ type: 'chicks', count: 3, x: boss.x, y: boss.y + 40 })
    boss.nextChicksAt = boss.time + 6 / tempo
  }

  updateLaser(boss, context, actions)
  return actions
}

function update(w: BossWorld, dt: number): void {
  const { state } = w
  const actions = updateBoss(w.boss, dt, { shipX: state.ship.x, fieldWidth: 960, eggSpeed: state.spec.eggSpeed, rng: state.rng })
  for (const action of actions) {
    switch (action.type) {
      case 'eggs':
        for (const egg of action.eggs) w.egg(egg.x, egg.y, egg.vx, egg.vy)
        break
      case 'chicks':
        w.chicks(action.count, action.x, action.y)
        break
      default:
        w.events.push(action)
    }
  }
}

export const motherHen: BossDef = {
  id: 'motherHen',
  mini: false,
  points: BOSS_POINTS_PER_LEVEL,
  health: (difficulty, round) => bossMaxHealth(round + 1, difficulty),
  create: (setup) => createBoss(setup.level, setup.difficulty, 960, setup.round),
  update,
  bonus: (boss) => BOSS_POINTS_PER_LEVEL * boss.level,
}
