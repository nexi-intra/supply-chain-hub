import { FIELD, SHIP_HIT_RADIUS } from './config'
import { aimVelocity, eggRadius, ENEMY_DEFS, type EnemyWorld } from './enemies'
import type { Enemy, GameEvent, GameState, Pickup } from './engine'
import { pointsFactor } from './powerups'
import type { Rng } from './rng'
import type { TemplateId } from './waveTemplates'
import type { WaveSpec } from './waves'

export const BONUS_STAGES = ['drumstickRain', 'shootingGallery', 'eggDodge'] as const
export type BonusStageId = (typeof BONUS_STAGES)[number]
export const isBonusStage = (id: TemplateId | undefined): id is BonusStageId => id !== undefined && (BONUS_STAGES as readonly string[]).includes(id)

export const BONUS_SECONDS = 20
/** Pausen med resultat-banneret, før næste bølge starter. */
export const BONUS_RESULT_SECONDS = 3.2
/** Faste point uden combo; ganges med `bonusScale`. */
export const BONUS_POINTS = { drumstick: 100, coin: 250, hen: 200, perfect: 3000, survive: 8000 } as const

/** Bonusbanerne bliver mere værd for hver sektor og runde. */
export const bonusScale = (spec: Pick<WaveSpec, 'sector' | 'round'>): number => 1 + 0.25 * spec.sector + 0.5 * spec.round
const scaled = (base: number, scale: number) => Math.round((base * scale) / 10) * 10

const RAIN_SPEED = { min: 150, spread: 50 }
const GALLERY_SPEED = { min: 210, spread: 70 }
const COIN_FALL = 165
/** Under HUD'en, så hønsene ikke dækker timer, liv og point. */
export const DROPPER_Y = 128
const DROPPERS = 6
const COIN_CHANCE = { gallery: 0.18, dodge: 0.1 }

export interface BonusSpawn {
  at: number
  kind: 'drumstick' | 'coin' | 'hen'
  x: number
  y: number
  vx: number
  vy: number
  /** Guldhønens bane: udsving, frekvens, fase og form (0 = bølge, 1 = zigzag). */
  amp: number
  freq: number
  phase: number
  shape: number
}

/** Hønsene øverst i æggeregnen; de er pynt og kan ikke skydes. */
export interface Dropper {
  x: number
  y: number
  baseX: number
  phase: number
  /** Kort blink, når hønen lægger. */
  flash: number
}

export interface BonusState {
  stage: BonusStageId
  startedAt: number
  endsAt: number
  scale: number
  points: number
  collected: number
  possible: number
  hit: boolean
  done: boolean
  perfect: boolean
  queue: BonusSpawn[]
  droppers: Dropper[]
  nextEggAt: number
  lastDropper: number
  nextTick: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Regnen planlægges, så alt kan nås med tastaturet (480 px/s) med lidt luft: "Perfekt" skal være muligt. */
const RAIN_REACH_SPEED = 360

function planRain(bonus: BonusState, rng: Rng): void {
  let t = bonus.startedAt + 1
  const last = bonus.startedAt + BONUS_SECONDS - 5.2
  // Samme fart for hele regnen, så tiden mellem to stykker også er tiden mellem dem ved skibet.
  const vy = RAIN_SPEED.min + rng() * RAIN_SPEED.spread
  let lastX = FIELD.width / 2
  let lastAt = t
  const pattern: { dt: number; x: number; coin: boolean }[] = []
  const add = (dt: number, x: number, coin: boolean) => pattern.push({ dt, x: clamp(x, 30, FIELD.width - 30), coin })
  while (t <= last) {
    pattern.length = 0
    const cx = 140 + rng() * (FIELD.width - 280)
    const dir = rng() < 0.5 ? 1 : -1
    switch (Math.floor(rng() * 5)) {
      case 0:
        for (let k = 0; k < 5; k++) add(k * 0.16, cx + dir * (k - 2) * 60, k === 4)
        break
      case 1:
        for (let k = 0; k < 5; k++) add(k * 0.16, cx, k === 4)
        break
      case 2:
        for (let k = 0; k < 8; k++) add(k * 0.2, cx + Math.sin(k * 0.9) * 80, k === 7)
        break
      case 3:
        for (let k = 0; k < 7; k++) add(k * 0.13, cx + dir * (k - 3) * 44, k === 6)
        break
      default:
        for (let k = 0; k < 6; k++) add(k * 0.22, cx + dir * (k - 2.5) * 50 + (rng() - 0.5) * 24, rng() < 0.3)
    }
    // Første stykke kommer først, når skibet kan nå derhen fra det forrige mønsters sidste.
    t = Math.max(t, lastAt + Math.abs(pattern[0].x - lastX) / RAIN_REACH_SPEED + 0.2)
    if (t > last) break
    for (const item of pattern) {
      bonus.queue.push({ at: t + item.dt, kind: item.coin ? 'coin' : 'drumstick', x: item.x, y: -20, vx: 0, vy, amp: 0, freq: 0, phase: 0, shape: 0 })
    }
    const end = pattern[pattern.length - 1]
    lastX = end.x
    lastAt = t + end.dt
    t = lastAt + 0.7 + rng() * 0.5
  }
}

function planGallery(bonus: BonusState, rng: Rng): void {
  let t = bonus.startedAt + 0.9
  const last = bonus.startedAt + BONUS_SECONDS - 6.5
  let dir = rng() < 0.5 ? 1 : -1
  const hen = (at: number, side: number, y: number, speed: number, amp = 0, freq = 0, shape = 0) =>
    bonus.queue.push({ at, kind: 'hen', x: side > 0 ? -50 : FIELD.width + 50, y, vx: side * speed, vy: 0, amp, freq, phase: 0, shape })
  while (t <= last) {
    const speed = GALLERY_SPEED.min + rng() * GALLERY_SPEED.spread
    const y = 130 + rng() * 120
    switch (Math.floor(rng() * 4)) {
      case 0:
        for (let k = 0; k < 6; k++) hen(t + k * 0.3, dir, y, speed)
        break
      case 1:
        for (let k = 0; k < 8; k++) hen(t + k * 0.22, dir, y, speed, 55, 2.6)
        break
      case 2:
        for (let k = 0; k < 7; k++) hen(t + k * 0.26, dir, y, speed, 60, 1.7, 1)
        break
      default:
        for (let k = 0; k < 5; k++) {
          hen(t + k * 0.3, dir, 120, speed)
          hen(t + k * 0.3, -dir, 250, speed)
        }
    }
    t += 2.2 + rng() * 0.6
    dir = -dir
  }
}

function planDroppers(bonus: BonusState, rng: Rng): void {
  for (let i = 0; i < DROPPERS; i++) {
    const baseX = 90 + (i * (FIELD.width - 180)) / (DROPPERS - 1)
    bonus.droppers.push({ x: baseX, y: DROPPER_Y, baseX, phase: rng() * Math.PI * 2, flash: 0 })
  }
}

/** Hele banen planlægges ved start med spillets RNG. */
export function startBonus(state: GameState, stage: BonusStageId): BonusState {
  const bonus: BonusState = {
    stage,
    startedAt: state.time,
    endsAt: state.time + BONUS_SECONDS,
    scale: bonusScale(state.spec),
    points: 0,
    collected: 0,
    possible: 0,
    hit: false,
    done: false,
    perfect: false,
    queue: [],
    droppers: [],
    nextEggAt: state.time + 1.4,
    lastDropper: -1,
    nextTick: 3,
  }
  if (stage === 'drumstickRain') {
    // Kyllingelår fra bølgen før må ikke tælle med i "samlet/mulige".
    state.pickups = state.pickups.filter((pickup) => pickup.kind !== 'drumstick' && pickup.kind !== 'coin')
    planRain(bonus, state.rng)
  } else if (stage === 'shootingGallery') planGallery(bonus, state.rng)
  else planDroppers(bonus, state.rng)
  bonus.queue.sort((a, b) => a.at - b.at)
  bonus.possible = bonus.queue.length
  return bonus
}

export const weaponLocked = (state: GameState): boolean => state.bonus?.stage === 'eggDodge' && !state.bonus.done

function dropItem(state: GameState, kind: 'drumstick' | 'coin', x: number, y: number, vx: number, vy: number): void {
  state.pickups.push({ id: state.nextId++, kind, x, y, vx, vy })
}

function spawnItem(world: EnemyWorld, spawn: BonusSpawn): void {
  if (spawn.kind !== 'hen') {
    dropItem(world.state, spawn.kind, spawn.x, spawn.y, spawn.vx, spawn.vy)
    return
  }
  const hen = world.spawn('galleryHen', spawn.x, spawn.y, { vx: spawn.vx })
  hen.p0y = hen.slotY = spawn.y
  hen.p1x = spawn.amp
  hen.p1y = spawn.freq
  hen.p2x = spawn.phase
  hen.p2y = spawn.shape
  hen.pathT = 0
}

/** Guldhønens bane på skydebanen: lige hen over skærmen med bølge- eller zigzag-udsving. */
export function moveGalleryHen(enemy: Enemy, dt: number): void {
  enemy.pathT += dt
  enemy.x += enemy.vx * dt
  const phase = enemy.pathT * enemy.p1y + enemy.p2x
  const swing = enemy.p2y === 1 ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase)
  enemy.y = enemy.p0y + enemy.p1x * swing
}

function updateDroppers(world: EnemyWorld, bonus: BonusState, dt: number): void {
  const { state } = world
  const t = state.time - bonus.startedAt
  for (const dropper of bonus.droppers) {
    dropper.x = dropper.baseX + Math.sin(t * 0.9 + dropper.phase) * 42
    dropper.y = DROPPER_Y + Math.sin(t * 2.3 + dropper.phase) * 5
    dropper.flash = Math.max(0, dropper.flash - dt)
  }
  // Det sidste sekund er stille, så banen ender på et pust.
  if (state.time < bonus.nextEggAt || state.time > bonus.endsAt - 1) return
  const { rng } = state
  const count = bonus.droppers.length
  let index = Math.floor(rng() * (bonus.lastDropper < 0 ? count : count - 1))
  if (bonus.lastDropper >= 0 && index >= bonus.lastDropper) index++
  const dropper = bonus.droppers[index]
  bonus.lastDropper = index
  dropper.flash = 0.25
  const y = dropper.y + 16
  if (rng() < COIN_CHANCE.dodge) {
    dropItem(state, 'coin', dropper.x, y, 0, COIN_FALL)
  } else {
    const speed = state.spec.eggSpeed * (0.8 + rng() * 0.3)
    const velocity = rng() < 0.15 ? aimVelocity(dropper.x, y, state.ship.x, state.ship.y, speed) : { vx: (rng() - 0.5) * 40, vy: speed }
    state.eggs.push({ id: state.nextId++, x: dropper.x, y, ...velocity })
  }
  const progress = clamp(t / BONUS_SECONDS, 0, 1)
  const pace = clamp(state.spec.eggSpeed / 210, 0.8, 1.4)
  // 1,6 æg/s i starten, op til 4,2 æg/s til sidst på mellem (fase 7: lidt lavere top end før).
  const rate = (1.6 + 2.6 * progress) * pace
  bonus.nextEggAt = state.time + (0.7 + rng() * 0.6) / rate
}

/** Nedtælling, regn, guldhøns og æggelæggere. */
export function updateBonus(world: EnemyWorld, dt: number): void {
  const { state, events } = world
  const bonus = state.bonus
  if (!bonus || bonus.done) return
  if (bonus.nextTick >= 1 && bonus.endsAt - state.time <= bonus.nextTick) {
    events.push({ type: 'bonusTick', seconds: bonus.nextTick })
    bonus.nextTick--
  }
  while (bonus.queue.length > 0 && state.time >= bonus.queue[0].at) spawnItem(world, bonus.queue.shift()!)
  if (bonus.stage === 'eggDodge') updateDroppers(world, bonus, dt)
}

/** Point for et kyllingelår eller en mønt i en bonusbane; motoren lægger dem til scoren. */
export function bonusPickup(state: GameState, pickup: Pickup): number {
  const bonus = state.bonus!
  const points = scaled(pickup.kind === 'coin' ? BONUS_POINTS.coin : BONUS_POINTS.drumstick, bonus.scale) * pointsFactor(state)
  if (bonus.stage === 'drumstickRain') bonus.collected++
  bonus.points += points
  return points
}

/** Faste point uden combo for en guldhøne (eller andet) skudt i en bonusbane. */
export function bonusKill(world: EnemyWorld, enemy: Enemy): number {
  const { state } = world
  const bonus = state.bonus!
  const gallery = enemy.kind === 'galleryHen'
  const points = scaled(gallery ? BONUS_POINTS.hen : ENEMY_DEFS[enemy.kind].points, bonus.scale) * pointsFactor(state)
  if (gallery && !bonus.done) {
    bonus.collected++
    if (state.rng() < COIN_CHANCE.gallery) dropItem(state, 'coin', enemy.x, enemy.y, 0, COIN_FALL)
  }
  bonus.points += points
  return points
}

/** I bonusbaner koster intet et liv; i æggeregnen fjerner et træf kun bonussen. */
export function bonusCollisions(state: GameState, events: GameEvent[]): void {
  const bonus = state.bonus
  if (!bonus || bonus.done || bonus.stage !== 'eggDodge' || state.eggs.length === 0) return
  const { ship } = state
  state.eggs = state.eggs.filter((egg) => {
    const reach = eggRadius(egg) + SHIP_HIT_RADIUS
    if ((egg.x - ship.x) ** 2 + (egg.y - ship.y) ** 2 > reach * reach) return true
    events.push({ type: 'bonusMiss', x: ship.x, y: ship.y, first: !bonus.hit })
    bonus.hit = true
    return false
  })
}

/** Afslutter banen; returnerer den ekstra bonus for "Perfekt" eller for at klare æggeregnen uden træf. */
export function finishBonus(state: GameState, events: GameEvent[]): number {
  const bonus = state.bonus!
  bonus.done = true
  bonus.queue = []
  const perfect = bonus.stage === 'eggDodge' ? !bonus.hit : bonus.possible > 0 && bonus.collected >= bonus.possible
  const extra = perfect ? scaled(bonus.stage === 'eggDodge' ? BONUS_POINTS.survive : BONUS_POINTS.perfect, bonus.scale) : 0
  bonus.points += extra
  bonus.perfect = perfect
  state.eggs = []
  state.pickups = []
  events.push({ type: 'bonusResult', stage: bonus.stage, points: bonus.points, perfect, collected: bonus.collected, possible: bonus.possible })
  return extra
}
