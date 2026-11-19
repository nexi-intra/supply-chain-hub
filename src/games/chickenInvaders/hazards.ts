import { FIELD, LARGE_METEOR_CHANCE, METEOR_SPAWN_INTERVAL, SHIP_HALF_WIDTH, SHIP_HIT_RADIUS, SHIP_MAX_Y, SHIP_MIN_Y } from './config'
import { eggRadius, type EnemyWorld } from './enemies'
import type { Enemy, GameEvent, GameState } from './engine'
import type { Rng } from './rng'
import type { ThemeId } from './themes'
import type { TemplateId } from './waveTemplates'
import type { WaveSpec } from './waves'

export const METEOR_TYPES = ['rock', 'fire', 'ice', 'metal', 'gold', 'comet'] as const
export type MeteorType = (typeof METEOR_TYPES)[number]

export const HAZARD_KINDS = ['meteorShower', 'goldRush', 'asteroidBelt', 'cometStorm', 'blackHole'] as const
export type HazardKind = (typeof HAZARD_KINDS)[number]
export const isHazardKind = (id: TemplateId | undefined): id is HazardKind => id !== undefined && (HAZARD_KINDS as readonly string[]).includes(id)

export interface MeteorStats {
  radius: number
  hp: number
  points: number
  largeRadius: number
  largeHp: number
  largePoints: number
  /** Fart i forhold til en almindelig stenmeteor. */
  speed: number
  /** Antal stykker en stor meteor deler sig i (0 = kan ikke være stor). */
  splits: number
  giftChance: number
}

const stats = (radius: number, hp: number, points: number, speed: number, large?: [number, number, number, number]): MeteorStats => ({
  radius,
  hp,
  points,
  largeRadius: large?.[0] ?? radius,
  largeHp: large?.[1] ?? hp,
  largePoints: large?.[2] ?? points,
  speed,
  splits: large?.[3] ?? 0,
  giftChance: 0,
})

export const METEOR_STATS: Record<MeteorType, MeteorStats> = {
  rock: stats(14, 1, 50, 1, [28, 3, 150, 2]),
  fire: stats(13, 1, 100, 1.6, [24, 2, 200, 2]),
  ice: stats(12, 1, 60, 0.6, [30, 4, 200, 3]),
  metal: { ...stats(21, 6, 300, 0.75), giftChance: 0.15 },
  gold: stats(16, 2, 250, 0.8),
  comet: stats(13, 1, 200, 1.7),
}

const LARGE_CHANCE: Record<MeteorType, number> = { rock: LARGE_METEOR_CHANCE, fire: 0.25, ice: 0.45, metal: 0, gold: 0, comet: 0 }

/** Al fart for meteorer og hazards samlet ét sted, så fase 5's slowmo kan skalere den. */
export const HAZARD_SPEED = {
  /** Faldende meteorer: andel af bølgens æggefart. */
  fallMin: 0.55,
  fallMax: 0.9,
  /** Vandret drift for faldende meteorer (px/s). */
  drift: 80,
  /** Asteroidebæltets baner: andel af æggefarten. */
  lane: 0.95,
  /** Mindste fart for stykkerne fra en stor meteor (px/s). */
  split: 110,
  /** Meteorer på vej mod det sorte hul: andel af æggefarten. */
  inbound: 0.62,
  /** Tangentiel fart i kredsløbet om det sorte hul (px/s). */
  orbit: 150,
  /** Hvor hurtigt kredsløbet snævrer ind (px/s). */
  spiral: 18,
}

export const COMET_WARNING_SECONDS = 0.9
/** Kometerne bliver aldrig hurtigere end dette (px/s), så varslet kan nå at virke på ekspert. */
export const COMET_MAX_SPEED = 500
/** Andelen af kometer, der sigter efter skibet, når varslet tændes. */
export const COMET_AIM_CHANCE = 0.4
const COMET_ANGLE_MIN = 0.35
const COMET_ANGLE_MAX = 1.05
export const LANE_WARNING_SECONDS = 1.3
/** Bæltets baner; den nederste ligger på skibets startplads, så man ikke bare kan gemme sig dér. */
export const LANE_YS = [160, 256, 352, 448, 540]
/** Højst så mange baner er i brug på én gang, så der altid er mindst to frie. */
export const MAX_ACTIVE_LANES = 3
const LANE_GAP = { min: 110, spread: 70 }

export const BLACK_HOLE = {
  /** Kernen koster et liv. */
  coreRadius: 22,
  /** Æg, skud og meteorer inden for denne radius bliver slugt. */
  swallowRadius: 32,
  /** Meteorer inden for denne (fladtrykte) radius går i kredsløb. */
  captureRadius: 170,
  gravity: 9000,
  /** Største træk i skibet (px/s) – skibet flyver 480 px/s, så det kan altid kæmpe imod. */
  pullMax: 80,
  pullRange: 520,
  growSeconds: 1.2,
  collapseSeconds: 1,
  /** Kredsløbene er fladtrykte som akkretionsskiven. */
  orbitSquash: 0.72,
}
const ORBIT = 1
const EDGE = 16

export interface MeteorSpawn {
  at: number
  type: MeteorType
  large: boolean
  x: number
  y: number
  vx: number
  vy: number
  /** Kometen sigter efter skibet, når varslet tændes. */
  aim?: boolean
}

export interface HazardWarning {
  kind: 'comet' | 'lane'
  /** Hvor faren kommer ind på skærmen. */
  x: number
  y: number
  dirX: number
  dirY: number
  from: number
  until: number
  /** Banen tegnes svagt, indtil den sidste sten er ude. */
  end?: number
  announced: boolean
  spawn?: MeteorSpawn
}

export interface BlackHole {
  x: number
  y: number
  age: number
  /** 0–1: vokser ind, kollapser til sidst. */
  strength: number
  collapsing: boolean
  collapseT: number
}

export interface HazardState {
  kind: HazardKind
  /** Kommende meteorer sorteret efter tid. */
  queue: MeteorSpawn[]
  warnings: HazardWarning[]
  blackHole: BlackHole | null
}

type Mix = Partial<Record<MeteorType, number>>

const SHOWER_MIX: Record<ThemeId, Mix> = {
  farm: { rock: 0.8, gold: 0.12, fire: 0.08 },
  asteroids: { rock: 0.5, metal: 0.38, gold: 0.12 },
  ice: { ice: 0.72, rock: 0.18, comet: 0.1 },
  volcano: { fire: 0.64, rock: 0.28, metal: 0.08 },
  mothership: { rock: 0.24, fire: 0.2, ice: 0.18, metal: 0.16, gold: 0.1, comet: 0.12 },
}

/** Meteortyperne i en hazard-bølge; meteorregnen følger temaet. */
export function meteorMix(kind: HazardKind, theme: ThemeId): Mix {
  switch (kind) {
    case 'goldRush':
      return theme === 'mothership' ? { gold: 0.36, rock: 0.4, metal: 0.12, fire: 0.12 } : { gold: 0.38, rock: 0.62 }
    case 'asteroidBelt':
      if (theme === 'asteroids') return { rock: 0.7, metal: 0.3 }
      if (theme === 'volcano') return { rock: 0.6, fire: 0.3, metal: 0.1 }
      return theme === 'mothership' ? { rock: 0.5, metal: 0.2, ice: 0.15, gold: 0.15 } : { rock: 0.85, metal: 0.15 }
    case 'cometStorm':
      return theme === 'ice' ? { comet: 0.7, ice: 0.3 } : { comet: 0.7, rock: 0.15, ice: 0.1, fire: 0.05 }
    case 'blackHole':
      if (theme === 'volcano') return { fire: 0.55, rock: 0.45 }
      return theme === 'mothership' ? { rock: 0.3, fire: 0.2, ice: 0.2, metal: 0.15, gold: 0.15 } : { rock: 0.6, ice: 0.2, gold: 0.2 }
    default:
      return SHOWER_MIX[theme]
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function pickType(mix: Mix, rng: Rng, exclude?: MeteorType): MeteorType {
  const entries = (Object.entries(mix) as [MeteorType, number][]).filter(([type]) => type !== exclude)
  const total = entries.reduce((sum, [, share]) => sum + share, 0)
  let roll = rng() * total
  for (const [type, share] of entries) {
    roll -= share
    if (roll < 0) return type
  }
  return entries[entries.length - 1][0]
}

interface Plan {
  spec: WaveSpec
  rng: Rng
  start: number
  mix: Mix
  hazard: HazardState
}

function falling(p: Plan, type: MeteorType, at: number): MeteorSpawn {
  const { rng } = p
  const fall = HAZARD_SPEED.fallMin + rng() * (HAZARD_SPEED.fallMax - HAZARD_SPEED.fallMin)
  return {
    at,
    type,
    large: rng() < LARGE_CHANCE[type],
    x: 40 + rng() * (FIELD.width - 80),
    y: -40,
    vx: (rng() - 0.5) * HAZARD_SPEED.drift,
    vy: p.spec.eggSpeed * fall * METEOR_STATS[type].speed,
  }
}

/** Hvor kometens bane krydser ind på skærmen, holdt lidt inde fra kanten. */
function setCometWarning(warning: HazardWarning, spawn: MeteorSpawn): void {
  let t = 0
  if (spawn.x < 0 && spawn.vx > 0) t = Math.max(t, -spawn.x / spawn.vx)
  if (spawn.x > FIELD.width && spawn.vx < 0) t = Math.max(t, (FIELD.width - spawn.x) / spawn.vx)
  if (spawn.y < 0 && spawn.vy > 0) t = Math.max(t, -spawn.y / spawn.vy)
  const speed = Math.hypot(spawn.vx, spawn.vy) || 1
  warning.x = clamp(spawn.x + spawn.vx * t, EDGE, FIELD.width - EDGE)
  warning.y = clamp(spawn.y + spawn.vy * t, EDGE, FIELD.height - EDGE)
  warning.dirX = spawn.vx / speed
  warning.dirY = spawn.vy / speed
}

function addComet(p: Plan, at: number, aim: boolean): void {
  const { rng } = p
  const fromLeft = rng() < 0.5
  const angle = 0.45 + rng() * 0.4
  const speed = Math.min(COMET_MAX_SPEED, p.spec.eggSpeed * METEOR_STATS.comet.speed)
  const spawn: MeteorSpawn = {
    at,
    type: 'comet',
    large: false,
    x: fromLeft ? -26 : FIELD.width + 26,
    y: -20 + rng() * 160,
    vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    aim,
  }
  const warning: HazardWarning = { kind: 'comet', x: 0, y: 0, dirX: 0, dirY: 0, from: at - COMET_WARNING_SECONDS, until: at, announced: false, spawn }
  setCometWarning(warning, spawn)
  p.hazard.queue.push(spawn)
  p.hazard.warnings.push(warning)
}

/** Drejer kometen mod skibets position i det øjeblik varslet tændes; vinklen holdes skrå og læsbar. */
function aimComet(warning: HazardWarning, ship: { x: number; y: number }): void {
  const spawn = warning.spawn!
  const dir = spawn.x < 0 ? 1 : -1
  const angle = clamp(Math.atan2(ship.y - spawn.y, Math.max(1, Math.abs(ship.x - spawn.x))), COMET_ANGLE_MIN, COMET_ANGLE_MAX)
  const speed = Math.hypot(spawn.vx, spawn.vy)
  spawn.vx = dir * Math.cos(angle) * speed
  spawn.vy = Math.sin(angle) * speed
  setCometWarning(warning, spawn)
}

function planShower(p: Plan): void {
  let t = p.start + 0.5
  for (let i = 0; i < p.spec.meteorCount; i++) {
    const type = pickType(p.mix, p.rng)
    if (type === 'comet') addComet(p, Math.max(t, p.start + COMET_WARNING_SECONDS + 0.4), p.rng() < COMET_AIM_CHANCE)
    else p.hazard.queue.push(falling(p, type, t))
    t += METEOR_SPAWN_INTERVAL * (0.6 + p.rng() * 0.8)
  }
}

/** Kometer i små byger fra skiftende hjørner og lidt løst affald imellem. */
function planComets(p: Plan): void {
  let t = p.start + 1.4
  for (let i = 0; i < p.spec.meteorCount; i++) {
    addComet(p, t, p.rng() < COMET_AIM_CHANCE)
    if (p.rng() < 0.4) p.hazard.queue.push(falling(p, pickType(p.mix, p.rng, 'comet'), t + 0.3))
    t += i % 3 === 2 ? 1.6 + p.rng() * 0.6 : 0.55 + p.rng() * 0.4
  }
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/** Pulser af vandrette baner; en bane er optaget fra varslet til den sidste sten er ude. */
function planBelt(p: Plan): void {
  const { rng, spec } = p
  const pulses = Math.max(4, Math.round(spec.meteorCount / 3))
  const busyUntil = LANE_YS.map(() => -Infinity)
  let t = p.start + 1.6
  for (let pulse = 0; pulse < pulses; pulse++) {
    const warnAt = t - LANE_WARNING_SECONDS
    const free = shuffle(LANE_YS.map((_, lane) => lane).filter((lane) => busyUntil[lane] <= warnAt), rng)
    // Første puls tager altid den nederste bane, så man lærer at man ikke kan gemme sig på startpladsen.
    const bottom = free.indexOf(LANE_YS.length - 1)
    if (pulse === 0 && bottom > 0) free.unshift(...free.splice(bottom, 1))
    const active = LANE_YS.length - free.length
    const want = Math.min(free.length, MAX_ACTIVE_LANES - active, 1 + (rng() < 0.5 ? 1 : 0))
    for (const lane of free.slice(0, Math.max(0, want))) {
      const dir = rng() < 0.5 ? 1 : -1
      const speed = spec.eggSpeed * HAZARD_SPEED.lane * (0.85 + rng() * 0.3)
      const count = 3 + Math.floor(rng() * 2) + Math.min(spec.round, 2)
      let at = t
      let last = t
      for (let k = 0; k < count; k++) {
        const type = pickType(p.mix, rng, 'comet')
        p.hazard.queue.push({ at, type, large: rng() < LARGE_CHANCE[type] * 0.8, x: dir > 0 ? -50 : FIELD.width + 50, y: LANE_YS[lane], vx: dir * speed, vy: 0 })
        last = at
        at += (LANE_GAP.min + rng() * LANE_GAP.spread) / speed
      }
      busyUntil[lane] = last + (FIELD.width + 160) / speed
      p.hazard.warnings.push({ kind: 'lane', x: dir > 0 ? 0 : FIELD.width, y: LANE_YS[lane], dirX: dir, dirY: 0, from: warnAt, until: t + 0.3, end: busyUntil[lane], announced: false })
    }
    t += 2.8 + rng() * 0.8
  }
}

function planBlackHole(p: Plan): void {
  const { rng, spec } = p
  const hole: BlackHole = { x: 300 + rng() * 360, y: 220 + rng() * 50, age: 0, strength: 0, collapsing: false, collapseT: 0 }
  p.hazard.blackHole = hole
  let t = p.start + BLACK_HOLE.growSeconds + 0.5
  for (let i = 0; i < spec.meteorCount; i++) {
    const type = pickType(p.mix, rng, 'comet')
    // Hver fjerde falder løst langt fra hullet, så man både skal kæmpe mod suget og undvige.
    if (i % 4 === 3) {
      const stray = falling(p, type, t)
      const side = hole.x < FIELD.width / 2 ? 1 : -1
      const reach = BLACK_HOLE.captureRadius + 60
      stray.x = side > 0 ? clamp(hole.x + reach + rng() * (FIELD.width - hole.x - reach), hole.x + reach, FIELD.width - 40) : clamp(rng() * (hole.x - reach), 40, hole.x - reach)
      stray.vx = 0
      p.hazard.queue.push(stray)
      t += 0.65 + rng() * 0.5
      continue
    }
    const fromTop = rng() < 0.55
    const x = fromTop ? 40 + rng() * (FIELD.width - 80) : rng() < 0.5 ? -40 : FIELD.width + 40
    const y = fromTop ? -40 : 90 + rng() * 160
    // Sigter forbi hullet med en sideforskydning, så meteoren går i kredsløb i stedet for at styrte lige ind.
    const dx = hole.x - x
    const dy = hole.y - y
    const d = Math.hypot(dx, dy)
    const offset = (rng() < 0.5 ? -1 : 1) * (50 + rng() * 70)
    const tx = hole.x + (-dy / d) * offset - x
    const ty = hole.y + (dx / d) * offset - y
    const length = Math.hypot(tx, ty)
    const speed = spec.eggSpeed * HAZARD_SPEED.inbound * Math.sqrt(METEOR_STATS[type].speed)
    p.hazard.queue.push({ at: t, type, large: rng() < LARGE_CHANCE[type] * 0.6, x, y, vx: (tx / length) * speed, vy: (ty / length) * speed })
    t += 0.65 + rng() * 0.5
  }
}

/** Hele bølgens forløb planlægges ved start med spillets RNG, så den er deterministisk pr. seed. */
export function planHazard(spec: WaveSpec, rng: Rng, start: number): HazardState {
  const kind: HazardKind = isHazardKind(spec.hazard) ? spec.hazard : 'meteorShower'
  const hazard: HazardState = { kind, queue: [], warnings: [], blackHole: null }
  const plan: Plan = { spec, rng, start, mix: meteorMix(kind, spec.theme), hazard }
  switch (kind) {
    case 'asteroidBelt':
      planBelt(plan)
      break
    case 'cometStorm':
      planComets(plan)
      break
    case 'blackHole':
      planBlackHole(plan)
      break
    default:
      planShower(plan)
  }
  hazard.queue.sort((a, b) => a.at - b.at)
  return hazard
}

export function initMeteor(enemy: Enemy, type: MeteorType, large: boolean): void {
  const meteor = METEOR_STATS[type]
  enemy.meteorType = type
  enemy.large = large && meteor.splits > 0
  enemy.radius = enemy.large ? meteor.largeRadius : meteor.radius
  enemy.hp = enemy.maxHp = enemy.large ? meteor.largeHp : meteor.hp
}

export function meteorPoints(enemy: Enemy): number {
  const meteor = METEOR_STATS[enemy.meteorType]
  return enemy.large ? meteor.largePoints : meteor.points
}

/** Metal lader skuddet prelle af (synligt), indtil det går i stykker. */
export function meteorHitEvent(enemy: Enemy): GameEvent {
  return enemy.meteorType === 'metal' ? { type: 'meteorDeflect', x: enemy.x, y: enemy.y } : { type: 'hit', x: enemy.x, y: enemy.y, kind: 'meteor' }
}

/** En stor meteor deler sig i vifte langs sin egen fartretning: is i 3 skår, resten i 2. */
export function splitMeteor(world: EnemyWorld, enemy: Enemy): void {
  if (!enemy.large) return
  const pieces = METEOR_STATS[enemy.meteorType].splits
  let { vx, vy } = enemy
  if (Math.hypot(vx, vy) < 60) {
    vx = 0
    vy = 120
  }
  const speed = Math.max(HAZARD_SPEED.split, Math.hypot(vx, vy))
  const base = Math.atan2(vx, vy)
  const spread = pieces === 3 ? 0.55 : 1
  for (let i = 0; i < pieces; i++) {
    const angle = base + (i - (pieces - 1) / 2) * spread
    world.spawn('meteor', enemy.x + Math.sin(angle - base) * 20, enemy.y, { vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed, meteorType: enemy.meteorType })
  }
}

export function meteorDrops(world: EnemyWorld, enemy: Enemy): void {
  const { giftChance } = METEOR_STATS[enemy.meteorType]
  if (giftChance > 0 && world.state.rng() < giftChance) world.drop('gift', enemy.x, enemy.y)
  if (enemy.meteorType === 'gold') {
    world.drop('drumstick', enemy.x - 12, enemy.y)
    world.drop('coin', enemy.x + 12, enemy.y)
  }
}

export function pullShip(ship: { x: number; y: number }, hole: BlackHole, dt: number): void {
  const dx = hole.x - ship.x
  const dy = hole.y - ship.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1 || distance >= BLACK_HOLE.pullRange || hole.strength <= 0) return
  const speed = BLACK_HOLE.pullMax * Math.min(1, hole.strength) * (1 - distance / BLACK_HOLE.pullRange) ** 0.6
  const step = Math.min(speed * dt, distance)
  ship.x = clamp(ship.x + (dx / distance) * step, SHIP_HALF_WIDTH, FIELD.width - SHIP_HALF_WIDTH)
  ship.y = clamp(ship.y + (dy / distance) * step, SHIP_MIN_Y, SHIP_MAX_Y)
}

const holeActive = (hole: BlackHole | null | undefined): hole is BlackHole => !!hole && !hole.collapsing && hole.strength > 0

function swallow(world: EnemyWorld, enemy: Enemy): void {
  enemy.dead = true
  world.events.push({ type: 'swallow', x: enemy.x, y: enemy.y, what: 'meteor' })
}

/** Meteorens bane; nær det sorte hul bøjer den af og går i en indsnævrende spiral. */
export function moveMeteor(world: EnemyWorld, enemy: Enemy, dt: number): void {
  if (enemy.dead) return
  const hole = world.state.hazard?.blackHole
  if (holeActive(hole)) {
    const squash = BLACK_HOLE.orbitSquash
    if (enemy.stage !== ORBIT) {
      const rx = enemy.x - hole.x
      const ry = enemy.y - hole.y
      const r = Math.hypot(rx, ry / squash)
      if (r < BLACK_HOLE.captureRadius) {
        enemy.stage = ORBIT
        enemy.stageT = r
        enemy.slotParam = Math.atan2(ry / squash, rx)
        enemy.p1x = rx * enemy.vy - ry * enemy.vx >= 0 ? 1 : -1
      } else {
        const d = Math.hypot(rx, ry)
        const accel = (BLACK_HOLE.gravity * hole.strength) / Math.max(60, d)
        enemy.vx -= (rx / d) * accel * dt
        enemy.vy -= (ry / d) * accel * dt
      }
    }
    if (enemy.stage === ORBIT) {
      const fromX = enemy.x
      const fromY = enemy.y
      enemy.stageT = Math.max(0, enemy.stageT - HAZARD_SPEED.spiral * (1 + 40 / Math.max(enemy.stageT, 20)) * dt)
      enemy.slotParam += enemy.p1x * (HAZARD_SPEED.orbit / Math.max(enemy.stageT, 30)) * dt
      enemy.x = hole.x + Math.cos(enemy.slotParam) * enemy.stageT
      enemy.y = hole.y + Math.sin(enemy.slotParam) * enemy.stageT * squash
      enemy.vx = (enemy.x - fromX) / dt
      enemy.vy = (enemy.y - fromY) / dt
      if (enemy.stageT <= BLACK_HOLE.swallowRadius) swallow(world, enemy)
      return
    }
  }
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt
}

function updateBlackHole(world: EnemyWorld, hole: BlackHole, dt: number): void {
  const { state, events } = world
  hole.age += dt
  if (hole.collapsing) {
    hole.collapseT += dt
    hole.strength = Math.max(0, 1 - hole.collapseT / BLACK_HOLE.collapseSeconds)
    return
  }
  hole.strength = Math.min(1, hole.age / BLACK_HOLE.growSeconds)
  const meteorsLeft = state.meteorsToSpawn > 0 || state.enemies.some((enemy) => !enemy.dead && enemy.kind === 'meteor')
  if (hole.age >= BLACK_HOLE.growSeconds && !meteorsLeft) {
    hole.collapsing = true
    events.push({ type: 'blackHoleCollapse', x: hole.x, y: hole.y })
    return
  }
  pullShip(state.ship, hole, dt)
  const reach = BLACK_HOLE.swallowRadius * hole.strength
  const inside = (x: number, y: number, radius: number) => (x - hole.x) ** 2 + (y - hole.y) ** 2 <= (reach + radius) ** 2
  if (state.eggs.length > 0) {
    state.eggs = state.eggs.filter((egg) => {
      if (!inside(egg.x, egg.y, eggRadius(egg) * 0.5)) return true
      events.push({ type: 'swallow', x: egg.x, y: egg.y, what: 'egg' })
      return false
    })
  }
  for (const projectile of state.projectiles) {
    if (projectile.dead || !inside(projectile.x, projectile.y, 0)) continue
    projectile.dead = true
    events.push({ type: 'swallow', x: projectile.x, y: projectile.y, what: 'shot' })
  }
  for (const enemy of state.enemies) if (!enemy.dead && enemy.kind === 'meteor' && inside(enemy.x, enemy.y, 0)) swallow(world, enemy)
}

/** Varsler, nye meteorer fra planen og det sorte hul. Kører også i pausen efter bølgen, så hullet kan kollapse. */
export function updateHazards(world: EnemyWorld, dt: number): void {
  const { state, events } = world
  const hazard = state.hazard
  if (!hazard) return
  if (state.meteorsToSpawn <= 0 && hazard.queue.length > 0) {
    hazard.queue = []
    hazard.warnings = []
  }
  if (!state.awaitingWave) {
    for (const warning of hazard.warnings) {
      if (warning.announced || state.time < warning.from) continue
      warning.announced = true
      if (warning.spawn?.aim) aimComet(warning, state.ship)
      events.push(warning.kind === 'comet' ? { type: 'cometWarning', x: warning.x, y: warning.y } : { type: 'laneWarning', y: warning.y, dir: warning.dirX })
    }
    while (hazard.queue.length > 0 && state.time >= hazard.queue[0].at) {
      const spawn = hazard.queue.shift()!
      world.spawn('meteor', spawn.x, spawn.y, { vx: spawn.vx, vy: spawn.vy, large: spawn.large, meteorType: spawn.type })
    }
    state.meteorsToSpawn = hazard.queue.length
    if (hazard.warnings.length > 0) hazard.warnings = hazard.warnings.filter((warning) => state.time < (warning.end ?? warning.until))
  }
  if (hazard.blackHole) updateBlackHole(world, hazard.blackHole, dt)
}

/** Skibet rører kernen (ikke mens hullet vokser ind eller kollapser). */
export function blackHoleCatches(state: GameState): boolean {
  const hole = state.hazard?.blackHole
  if (!hole || hole.collapsing || hole.strength < 0.5) return false
  const reach = BLACK_HOLE.coreRadius + SHIP_HIT_RADIUS * 0.5
  return (state.ship.x - hole.x) ** 2 + (state.ship.y - hole.y) ** 2 <= reach * reach
}

/** Hullet spytter skibet ud nederst, så det ikke bliver hængende i kernen. */
export function ejectShip(state: GameState): void {
  state.ship.y = SHIP_MAX_Y
}
