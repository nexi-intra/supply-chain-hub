import { DIFFICULTY_SETTINGS, FIELD } from '../config'
import { burstAttack, gridAttack, homingAttack } from './attacks'
import { livingParts, newBossState, PART, placePart, scaledHealth, spawnPart, stepBoss, sway, type AttackTable, type BossWorld, type Pattern } from './core'
import type { BossDef } from './types'

/** Robo-Hanen: mekanisk hane med to kanontårne; kernen er skærmet, til begge tårne er skudt ned. */
export const ROBO = { halfWidth: 100, halfHeight: 74, homeY: 150, health: 0.95, turretHealth: 0.3, turretX: 122, turretY: 40, turretRadius: 26 }

/** Tårnenes mundinger, eller kernens brystkanon når tårnene er væk. */
function muzzles(w: BossWorld): { x: number; y: number }[] {
  const turrets = livingParts(w.state, w.boss)
  if (turrets.length > 0) return turrets.map((turret) => ({ x: turret.x, y: turret.y + 18 }))
  return [{ x: w.boss.x, y: w.boss.y + w.boss.halfHeight * 0.6 }]
}

const hatch = (w: BossWorld) => ({ x: w.boss.x, y: w.boss.y + w.boss.halfHeight * 0.95 })

const attacks: AttackTable = {
  burst: burstAttack({ shots: 3, gap: 0.14, cooldown: 1.25, sources: muzzles }),
  homing: homingAttack({ count: (w) => (w.boss.phase === 3 || w.boss.difficulty === 'hard' || w.boss.difficulty === 'expert' ? 3 : 2), cooldown: 1.5, from: hatch }),
  grid: gridAttack({ count: (w) => (w.boss.difficulty === 'easy' ? 2 : 3), fire: 0.75, cooldown: 1.4 }),
}

const pattern: Pattern = {
  1: ['burst', 'homing', 'burst'],
  2: ['burst', 'homing', 'burst', 'burst', 'homing'],
  3: ['grid', 'burst', 'homing', 'grid', 'burst'],
}

function move(w: BossWorld, dt: number): void {
  const { boss } = w
  boss.spin += dt
  sway(boss, boss.phase === 3 ? 78 : 55, dt, ROBO.turretX + 30, FIELD.width - ROBO.turretX - 30)
  boss.y = boss.homeY + Math.sin(boss.spin * 2.4) * 4
}

function place(w: BossWorld): void {
  const { boss } = w
  for (const turret of livingParts(w.state, boss)) {
    placePart(turret, boss.x + turret.slotParam * ROBO.turretX, boss.y + ROBO.turretY + Math.sin(boss.time * 3 + turret.slotParam) * 3)
  }
}

function update(w: BossWorld, dt: number): void {
  stepBoss(w, pattern, attacks, dt, { move, place })
  const { boss } = w
  if (!boss.shielded || livingParts(w.state, boss).length > 0) return
  boss.shielded = false
  boss.attack = null
  boss.beams = []
  boss.nextAttackAt = boss.time + 1.6
  w.events.push({ type: 'bossShieldDown', x: boss.x, y: boss.y })
}

export const roboRooster: BossDef = {
  id: 'roboRooster',
  mini: false,
  points: 18_000,
  health: (difficulty, round) => scaledHealth(difficulty, round, ROBO.health),
  create: (setup) => {
    const boss = newBossState({
      id: 'roboRooster',
      mini: false,
      ...setup,
      maxHealth: scaledHealth(setup.difficulty, setup.round, ROBO.health),
      halfWidth: ROBO.halfWidth,
      halfHeight: ROBO.halfHeight,
      homeY: ROBO.homeY,
      x: FIELD.width / 2,
    })
    boss.shielded = true
    return boss
  },
  setup: (w) => {
    const { boss } = w
    const hp = Math.round(DIFFICULTY_SETTINGS[boss.difficulty].bossHealth * ROBO.turretHealth * (1 + 0.5 * boss.round))
    for (const side of [-1, 1]) spawnPart(w, boss.x + side * ROBO.turretX, boss.y + ROBO.turretY, hp, ROBO.turretRadius, PART.turret).slotParam = side
  },
  update,
  pattern,
  attacks,
}
