import { BOSS_ENTER_SECONDS, DIFFICULTY_SETTINGS, FIELD, type Difficulty } from '../config'
import { fanEggs } from './attacks'
import { livingParts, newBossState, PART, placePart, spawnPart, stepBoss, type AttackSpec, type AttackTable, type BossWorld, type Pattern } from './core'
import type { BossDef } from './types'

/** Ægge-trioen: tre store høns, der flyver i en roterende trekant; Ild-trioen (variant 1) skyder ildæg. */
export const TRIO = { hens: 3, henHealth: 25, radius: 34, homeY: 150, orbitX: 125, orbitY: 44 }

export function trioHenHealth(difficulty: Difficulty, round: number): number {
  return Math.round(TRIO.henHealth * (DIFFICULTY_SETTINGS[difficulty].bossHealth / DIFFICULTY_SETTINGS.medium.bossHealth) * (1 + 0.5 * round))
}

const fiery = (w: BossWorld) => w.boss.variant === 1

function henFan(w: BossWorld, hen: { x: number; y: number }, count: number, spread: number): void {
  const speed = w.state.spec.eggSpeed * (fiery(w) ? 1.15 : 1)
  fanEggs(w, hen.x, hen.y + TRIO.radius * 0.8, count, spread, speed, fiery(w) ? 'fire' : undefined)
}

/** Én høne ad gangen på skift; den der skal skyde, gløder under varslet. */
const fan: AttackSpec = {
  charge: 0.8,
  cooldown: 1.1,
  begin: (w, a) => {
    const hens = livingParts(w.state, w.boss)
    const hen = hens[w.boss.cycle % Math.max(1, hens.length)]
    if (!hen) return
    a.source = hen.id
    a.x = hen.x
    a.y = hen.y
  },
  fire: (w, a) => {
    const hens = livingParts(w.state, w.boss)
    const hen = hens.find((part) => part.id === a.source) ?? hens[0]
    if (hen) henFan(w, hen, 5, fiery(w) ? 0.55 : 0.5)
  },
}

/** Alle høns på én gang. */
const volley: AttackSpec = {
  charge: 0.9,
  cooldown: 1.4,
  fire: (w) => {
    for (const hen of livingParts(w.state, w.boss)) henFan(w, hen, 4, 0.42)
  },
}

const attacks: AttackTable = { fan, volley }

const pattern: Pattern = {
  1: ['fan', 'fan', 'fan'],
  2: ['fan', 'volley', 'fan'],
  3: ['volley', 'fan', 'volley'],
}

function move(w: BossWorld): void {
  const { boss } = w
  const t = boss.time - BOSS_ENTER_SECONDS
  boss.x = FIELD.width / 2 + Math.sin(t * 0.45) * 230
  boss.y = boss.homeY + Math.sin(t * 0.9) * 22
}

/** Trekanten roterer og lukker rækkerne, når en høne falder; de sidste bliver hurtigere. */
function place(w: BossWorld, dt: number): void {
  const { boss } = w
  const hens = livingParts(w.state, boss)
  boss.spin += dt * (0.5 + (TRIO.hens - hens.length) * 0.35)
  hens.forEach((hen, i) => {
    const angle = boss.spin + (i * Math.PI * 2) / hens.length
    const rx = hens.length > 1 ? TRIO.orbitX : 0
    placePart(hen, boss.x + Math.cos(angle) * rx, boss.y + Math.sin(angle) * TRIO.orbitY)
  })
}

export const eggTrio: BossDef = {
  id: 'eggTrio',
  mini: true,
  points: 4_000,
  partsHealth: true,
  health: (difficulty, round) => TRIO.hens * trioHenHealth(difficulty, round),
  create: (setup) =>
    newBossState({
      id: 'eggTrio',
      mini: true,
      ...setup,
      maxHealth: TRIO.hens * trioHenHealth(setup.difficulty, setup.round),
      halfWidth: 0,
      halfHeight: 0,
      homeY: TRIO.homeY,
      x: FIELD.width / 2,
    }),
  setup: (w) => {
    const hp = trioHenHealth(w.boss.difficulty, w.boss.round)
    for (let i = 0; i < TRIO.hens; i++) spawnPart(w, w.boss.x, w.boss.y, hp, TRIO.radius, w.boss.variant === 1 ? PART.trioFire : PART.trio)
  },
  update: (w, dt) => stepBoss(w, pattern, attacks, dt, { move, place }),
  pattern,
  attacks,
}
