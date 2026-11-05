import { DIFFICULTY_SETTINGS, FIELD } from '../config'
import { aimEgg, fanEggs } from './attacks'
import { livingParts, newBossState, PART, placePart, spawnPart, stepBoss, sway, type AttackSpec, type AttackTable, type BossState, type BossWorld, type Pattern } from './core'
import type { BossDef } from './types'

/** Kyllingekrydseren: bredt pansret skib, der krydser skærmen med tre tårne; MK II (variant 1) skyder hurtigere. */
export const CRUISER = { halfWidth: 172, halfHeight: 36, homeY: 132, turretHealth: 0.2, turretY: 40, turretRadius: 28, offsets: [-110, 0, 110], enterSeconds: 2.4 }

const mk2 = (w: BossWorld) => w.boss.variant === 1

function turrets(cooldown: number): AttackSpec {
  return {
    charge: 0.8,
    cooldown,
    begin: (w, a) => {
      a.x = w.state.ship.x
      a.y = w.state.ship.y
    },
    fire: (w, a) => {
      const speed = w.state.spec.eggSpeed
      for (const turret of livingParts(w.state, w.boss)) {
        const y = turret.y + 16
        if (turret.slotParam === 0) {
          fanEggs(w, turret.x, y, mk2(w) ? 5 : 3, 0.38, speed)
          continue
        }
        const shots = mk2(w) ? 3 : 2
        for (let k = 0; k < shots; k++) aimEgg(w, turret.x, y, a.x + (k - (shots - 1) / 2) * 46, a.y, speed * 1.05)
      }
    },
  }
}

/** Lugerne i skroget blinker og slipper en række æg lige ned. */
function broadside(cooldown: number): AttackSpec {
  return {
    charge: 0.85,
    cooldown,
    begin: (w, a) => {
      a.x = w.boss.x
      a.y = w.boss.y
    },
    fire: (w) => {
      const { boss } = w
      const count = mk2(w) ? 7 : 5
      for (let i = 0; i < count; i++) w.egg(boss.x - 150 + (300 * i) / (count - 1), boss.y + 22, 0, w.state.spec.eggSpeed * 0.82)
    },
  }
}

const attacks: AttackTable = { turrets: turrets(1.35), broadside: broadside(1.4) }
const attacksMk2: AttackTable = { turrets: turrets(0.85), broadside: broadside(0.9) }

const pattern: Pattern = {
  1: ['turrets', 'broadside', 'turrets'],
  2: ['turrets', 'turrets', 'broadside'],
  3: ['broadside', 'turrets', 'turrets', 'broadside'],
}

/** Glider ind fra venstre side. */
function enter(boss: BossState): void {
  const t = Math.min(1, boss.time / CRUISER.enterSeconds)
  boss.y = boss.homeY
  boss.x = -220 + (320 + 220) * (1 - (1 - t) ** 3)
  if (t >= 1) boss.entering = false
}

function move(w: BossWorld, dt: number): void {
  const { boss } = w
  boss.spin += dt
  sway(boss, mk2(w) ? 72 : 55, dt, 170, FIELD.width - 170)
  boss.y = boss.homeY + Math.sin(boss.spin * 1.8) * 4
}

function place(w: BossWorld): void {
  const { boss } = w
  for (const turret of livingParts(w.state, boss)) placePart(turret, boss.x + turret.slotParam, boss.y + CRUISER.turretY)
}

export const cruiserTurretHealth = (boss: Pick<BossState, 'difficulty' | 'round' | 'variant'>) =>
  Math.round(DIFFICULTY_SETTINGS[boss.difficulty].bossHealth * CRUISER.turretHealth * (1 + 0.5 * boss.round) * (boss.variant === 1 ? 1.25 : 1))

export const chickenCruiser: BossDef = {
  id: 'chickenCruiser',
  mini: true,
  points: 5_000,
  partsHealth: true,
  health: (difficulty, round, variant = 0) => CRUISER.offsets.length * cruiserTurretHealth({ difficulty, round, variant }),
  create: (setup) => {
    const boss = newBossState({
      id: 'chickenCruiser',
      mini: true,
      ...setup,
      maxHealth: CRUISER.offsets.length * cruiserTurretHealth(setup),
      halfWidth: CRUISER.halfWidth,
      halfHeight: CRUISER.halfHeight,
      homeY: CRUISER.homeY,
      x: -220,
      y: CRUISER.homeY,
    })
    boss.shielded = true
    return boss
  },
  setup: (w) => {
    const hp = cruiserTurretHealth(w.boss)
    for (const offset of CRUISER.offsets) spawnPart(w, w.boss.x + offset, w.boss.y + CRUISER.turretY, hp, CRUISER.turretRadius, PART.cruiser).slotParam = offset
  },
  update: (w, dt) => stepBoss(w, pattern, mk2(w) ? attacksMk2 : attacks, dt, { move, place, enter }),
  bonus: (boss) => (boss.variant === 1 ? 7_000 : 5_000) * (1 + boss.round),
  pattern,
  attacks,
}
