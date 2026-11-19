import { FIELD } from '../config'
import { blizzardAttack, fanAttack, summonAttack, sweepAttack } from './attacks'
import { clamp, livingMinions, newBossState, scaledHealth, stepBoss, sway, type AttackTable, type BossWorld, type Pattern } from './core'
import type { BossDef } from './types'

/** Isdronningen: ishønsedronning med isvifte, fejende frostlaser, skjoldhøns og snestorm. */
export const ICE_QUEEN = { halfWidth: 92, halfHeight: 70, homeY: 150, health: 1.1 }
const GUARD_SPACING = 82
const GUARD_SPEED = 260

const scepter = (w: BossWorld) => ({ x: w.boss.x, y: w.boss.y + w.boss.halfHeight * 0.55 })

const attacks: AttackTable = {
  iceFan: fanAttack({ count: 7, spread: 0.62, speed: 0.95, kind: 'ice', cooldown: 1.35 }),
  wideFan: fanAttack({ count: 9, spread: 0.8, speed: 0.95, kind: 'ice', cooldown: 1.3 }),
  frostLaser: sweepAttack({ span: FIELD.width * 0.42, fire: 1.7, style: 'frost', halfWidth: 15, cooldown: 1.5, origin: scepter }),
  summon: summonAttack({ kind: 'shield', count: (w) => (w.boss.difficulty === 'easy' ? 1 : 2), max: 3, cooldown: 1.2 }),
  blizzard: blizzardAttack({ duration: 3.2, rate: 7, cooldown: 1.6 }),
}

const pattern: Pattern = {
  1: ['iceFan', 'frostLaser', 'iceFan'],
  2: ['summon', 'iceFan', 'frostLaser', 'wideFan'],
  3: ['blizzard', 'frostLaser', 'wideFan', 'summon', 'blizzard', 'iceFan'],
}

function move(w: BossWorld, dt: number): void {
  const { boss } = w
  boss.spin += dt
  sway(boss, boss.phase === 3 ? 85 : 60, dt, boss.halfWidth + 30, FIELD.width - boss.halfWidth - 30)
  boss.y = boss.homeY + Math.sin(boss.spin * 1.6) * 6
}

/** Skjoldhønsene flyver ud og holder vagt i en bue under dronningen. */
function placeGuards(w: BossWorld, dt: number): void {
  const { state, boss } = w
  const guards = livingMinions(state, boss).filter((enemy) => enemy.kind === 'shield')
  guards.forEach((guard, i) => {
    const tx = clamp(boss.x + (i - (guards.length - 1) / 2) * GUARD_SPACING, 30, FIELD.width - 30)
    const ty = boss.y + boss.halfHeight + 42 + Math.sin(boss.time * 2.2 + i) * 6
    const dx = tx - guard.x
    const dy = ty - guard.y
    const d = Math.hypot(dx, dy)
    const step = Math.min(d, GUARD_SPEED * dt)
    guard.dx = d > 0 ? (dx / d) * step : 0
    if (d > 0) {
      guard.x += (dx / d) * step
      guard.y += (dy / d) * step
    }
  })
}

export const iceQueen: BossDef = {
  id: 'iceQueen',
  mini: false,
  points: 15_000,
  health: (difficulty, round) => scaledHealth(difficulty, round, ICE_QUEEN.health),
  create: (setup) =>
    newBossState({
      id: 'iceQueen',
      mini: false,
      ...setup,
      maxHealth: scaledHealth(setup.difficulty, setup.round, ICE_QUEEN.health),
      halfWidth: ICE_QUEEN.halfWidth,
      halfHeight: ICE_QUEEN.halfHeight,
      homeY: ICE_QUEEN.homeY,
      x: FIELD.width / 2,
    }),
  update: (w, dt) => stepBoss(w, pattern, attacks, dt, { move, place: placeGuards }),
  pattern,
  attacks,
}
