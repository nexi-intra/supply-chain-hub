import { EGG_RADIUS, ENEMY_POINTS, FIELD } from './config'
import type { Egg, Enemy, GameEvent, GameState, PickupKind } from './engine'
import { planReentry, type Point } from './formations'
import type { MeteorType } from './hazards'
import { rollRainbowDrop } from './powerups'
import type { WeaponFamily } from './weapons'

/** Nye kyllinger, der står i formationen. */
export const FORMATION_SPECIALS = ['shield', 'sniper', 'bomber', 'balloon', 'medic', 'turkey'] as const
/** Nye kyllinger, der flyver frit hen over skærmen og ikke skal skydes for at rydde bølgen. */
export const FLYBY_KINDS = ['ninja', 'ufo', 'rainbow'] as const
export const SPECIAL_KINDS = ['shield', 'sniper', 'bomber', 'ninja', 'balloon', 'medic', 'ufo', 'turkey', 'rainbow'] as const

export type FormationSpecial = (typeof FORMATION_SPECIALS)[number]
export type FlybyKind = (typeof FLYBY_KINDS)[number]
export type SpecialKind = (typeof SPECIAL_KINDS)[number]
/** `galleryHen` er skydebanens guldhøne i bonusbanerne; `bossPart` er en bosses tårn eller trioens høns. */
export type EnemyKind = 'hen' | 'helmet' | 'diver' | 'golden' | 'chick' | 'meteor' | 'galleryHen' | 'bossPart' | SpecialKind

export interface EnemyDef {
  radius: number
  hp: number
  points: number
  /** Skal være skudt ned, før bølgen er ryddet. */
  requiredForClear: boolean
  /** Kan trækkes i formationens fælles æggeregn. */
  shootsEggs: boolean
  /** Skjoldboble, der tager de første træf. */
  shield: number
}

const def = (radius: number, hp: number, points: number, requiredForClear: boolean, shootsEggs: boolean, shield = 0): EnemyDef => ({
  radius,
  hp,
  points,
  requiredForClear,
  shootsEggs,
  shield,
})

export const SHIELD_HITS = 4

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  hen: def(18, 1, ENEMY_POINTS.hen, true, true),
  helmet: def(19, 3, ENEMY_POINTS.helmet, true, true),
  diver: def(18, 1, ENEMY_POINTS.diver, true, true),
  golden: def(18, 1, ENEMY_POINTS.golden, false, false),
  chick: def(12, 1, ENEMY_POINTS.chick, true, false),
  meteor: def(14, 1, ENEMY_POINTS.meteorSmall, true, false),
  galleryHen: def(18, 1, 200, false, false),
  bossPart: def(24, 1, 750, false, false),
  shield: def(19, 1, 300, true, true, SHIELD_HITS),
  sniper: def(18, 2, 300, true, true),
  bomber: def(20, 2, 350, true, false),
  ninja: def(16, 1, 300, false, false),
  balloon: def(18, 2, 200, true, true),
  medic: def(18, 2, 400, true, false),
  ufo: def(30, 6, 800, false, false),
  turkey: def(22, 3, 450, true, false),
  rainbow: def(18, 1, 2000, false, false),
}

export const isSpecial = (kind: EnemyKind): kind is SpecialKind => (SPECIAL_KINDS as readonly string[]).includes(kind)
export const isFlyby = (kind: EnemyKind): kind is FlybyKind => (FLYBY_KINDS as readonly string[]).includes(kind)

export const SNIPER_MAX_ANGLE = 0.6
const SNIPER_FRONT_INTERVAL = 2.6
const SNIPER_RECHECK_SECONDS = 0.4
/** Så længe før skuddet tegnes snigskyttens røde sigtelinje. */
export const SNIPER_AIM_SECONDS = 0.45
const SNIPER_COLUMN = 28
/** Flere sigtede æg end dette i luften på én gang bliver ufærdigt; snigskytterne venter på tur. */
export const MAX_AIMED_EGGS = 3

const BOMBER_INTERVAL = 6.5
export const BOMBER_WINDUP_SECONDS = 0.6
const MAX_BOMBS = 2
export const BOMB_SHARDS = 6
const BOMB_FALL = 0.55
const SHARD_SPEED = 0.8
export const BOMB_RADIUS = 12
export const SHARD_RADIUS = 5
const BOSS_EGG_RADIUS = { fire: 7, ice: 6, homing: 9 }

export const MEDIC_INTERVAL = 3
export const MEDIC_RANGE = 120

export const UFO_Y = 64
const UFO_SPEED = 85
export const UFO_WARNING_SECONDS = 0.9
export const UFO_ACTIVE_SECONDS = 2.4
const UFO_COOLDOWN_SECONDS = 3.2
export const UFO_STEAL_SECONDS = 1
export const UFO_BEAM_HALF_WIDTH = 44
const UFO_BEAM_SLOWDOWN = 0.2

export const TURKEY_WOBBLE_SECONDS = 0.8
const TURKEY_INTERVAL = 7
const MAX_CHARGING_TURKEYS = 2

const NINJA_SPEED = 290
const NINJA_ZIGZAG = 48
const NINJA_ZIGZAG_RATE = 1.2
const RAINBOW_SPEED = 210

/** UFO-ens faser i `stage`. */
export const UFO_CRUISE = 0
export const UFO_WARNING = 1
export const UFO_BEAM = 2

/** Motorens hjælpere, så adfærden ikke selv skal kende til opbygningen af nye fjender og pickups. */
export interface EnemyWorld {
  state: GameState
  events: GameEvent[]
  spawn: (kind: EnemyKind, x: number, y: number, options?: { vx?: number; vy?: number; large?: boolean; meteorType?: MeteorType }) => Enemy
  drop: (kind: PickupKind, x: number, y: number, family?: WeaponFamily) => void
  chicks: (count: number, x: number, y: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Hvor hurtigt de nye kyllinger angriber i forhold til en almindelig bølge på mellem. */
const pace = (state: GameState) => clamp(state.spec.eggRate / 0.9, 0.6, 2)

/** Sætter skjold og en seedet første nedtælling for kyllinger med egen rytme. */
export function initEnemy(enemy: Enemy, rng: () => number): void {
  enemy.shield = ENEMY_DEFS[enemy.kind].shield
  switch (enemy.kind) {
    case 'sniper':
      enemy.cooldown = 1 + rng() * 2.5
      break
    case 'bomber':
      enemy.cooldown = 2.5 + rng() * 4
      break
    case 'medic':
      enemy.cooldown = MEDIC_INTERVAL * (0.5 + rng() * 0.5)
      break
    case 'turkey':
      enemy.cooldown = 3 + rng() * 5
      break
    case 'ufo':
      enemy.cooldown = 1.5
      break
  }
}

/** Sigtet æggefart mod et punkt; vinklen holdes inden for ±SNIPER_MAX_ANGLE fra lodret, så ægget kan læses. */
export function aimVelocity(fromX: number, fromY: number, toX: number, toY: number, speed: number): { vx: number; vy: number } {
  const angle = clamp(Math.atan2(toX - fromX, Math.max(1, toY - fromY)), -SNIPER_MAX_ANGLE, SNIPER_MAX_ANGLE)
  return { vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed }
}

export function eggRadius(egg: Egg): number {
  if (egg.kind === 'fire' || egg.kind === 'ice' || egg.kind === 'homing') return BOSS_EGG_RADIUS[egg.kind]
  return egg.kind === 'bomb' ? BOMB_RADIUS : egg.kind === 'shard' ? SHARD_RADIUS : EGG_RADIUS
}

/** Skjoldet tager træffet; returnerer true hvis boblen tog det. */
export function absorbShield(enemy: Enemy): boolean {
  if (enemy.shield <= 0) return false
  enemy.shield--
  return true
}

/** Ingen anden formationshøne står under snigskytten i samme kolonne. */
export function isFrontMost(enemy: Enemy, enemies: readonly Enemy[]): boolean {
  for (const other of enemies) {
    if (other === enemy || other.dead || isFlyby(other.kind) || other.kind === 'meteor' || other.kind === 'chick' || other.kind === 'golden' || other.kind === 'galleryHen' || other.kind === 'bossPart') continue
    if (other.y > enemy.y + 8 && Math.abs(other.x - enemy.x) < SNIPER_COLUMN) return false
  }
  return true
}

export function aimedEgg(state: GameState, enemy: Enemy): Egg {
  const y = enemy.y + enemy.radius
  return { id: state.nextId++, x: enemy.x, y, ...aimVelocity(enemy.x, y, state.ship.x, state.ship.y, state.spec.eggSpeed), kind: 'aimed' }
}

export const aimedInAir = (state: GameState) => state.eggs.filter((egg) => egg.kind === 'aimed').length

function sniperTick(world: EnemyWorld, enemy: Enemy, dt: number): void {
  const { state } = world
  enemy.cooldown -= dt
  const front = isFrontMost(enemy, state.enemies)
  enemy.stage = front && enemy.cooldown <= SNIPER_AIM_SECONDS ? 1 : 0
  if (enemy.cooldown > 0) return
  if (!front || aimedInAir(state) >= MAX_AIMED_EGGS) {
    enemy.cooldown = SNIPER_RECHECK_SECONDS
    return
  }
  state.eggs.push(aimedEgg(state, enemy))
  enemy.cooldown = (SNIPER_FRONT_INTERVAL / pace(state)) * (0.8 + state.rng() * 0.4)
  enemy.stage = 0
}

function bomberTick(world: EnemyWorld, enemy: Enemy, dt: number): void {
  const { state } = world
  enemy.cooldown -= dt
  enemy.stage = enemy.cooldown <= BOMBER_WINDUP_SECONDS ? 1 : 0
  if (enemy.cooldown > 0) return
  if (state.eggs.filter((egg) => egg.kind === 'bomb').length >= MAX_BOMBS) {
    enemy.cooldown = 0.5
    return
  }
  const y = enemy.y + enemy.radius
  const burstY = clamp(FIELD.height * 0.45 + (state.rng() - 0.5) * 50, y + 90, FIELD.height * 0.62)
  state.eggs.push({ id: state.nextId++, x: enemy.x, y, vx: 0, vy: state.spec.eggSpeed * BOMB_FALL, kind: 'bomb', burstY })
  world.events.push({ type: 'bombDrop', x: enemy.x, y })
  enemy.cooldown = (BOMBER_INTERVAL / pace(state)) * (0.8 + state.rng() * 0.4)
  enemy.stage = 0
}

/** Bomben sprænger i en ring af splinter; én splint går altid lige ned. */
export function burstBomb(state: GameState, bomb: Egg, events: GameEvent[]): void {
  const speed = state.spec.eggSpeed * SHARD_SPEED
  for (let i = 0; i < BOMB_SHARDS; i++) {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / BOMB_SHARDS
    state.eggs.push({ id: state.nextId++, x: bomb.x, y: bomb.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, kind: 'shard' })
  }
  events.push({ type: 'bombBurst', x: bomb.x, y: bomb.y })
}

function medicTick(world: EnemyWorld, enemy: Enemy, dt: number): void {
  enemy.cooldown -= dt
  if (enemy.cooldown > 0) return
  enemy.cooldown = Math.max(enemy.cooldown + MEDIC_INTERVAL, MEDIC_INTERVAL * 0.5)
  const targets: Point[] = []
  for (const other of world.state.enemies) {
    if (other.dead || Math.hypot(other.x - enemy.x, other.y - enemy.y) > MEDIC_RANGE) continue
    if (other.kind === 'helmet' && other.hp < other.maxHp) other.hp++
    else if (other.kind === 'shield' && other.shield > 0 && other.shield < SHIELD_HITS) other.shield++
    else continue
    targets.push({ x: other.x, y: other.y })
  }
  if (targets.length > 0) world.events.push({ type: 'heal', x: enemy.x, y: enemy.y, targets })
}

const turkeySpeed = (state: GameState) => Math.max(360, state.spec.eggSpeed * 1.8)

function turkeyTick(world: EnemyWorld, enemy: Enemy, dt: number): void {
  if (enemy.mode !== 'formation') return
  const { state } = world
  enemy.cooldown -= dt
  if (enemy.cooldown > 0) return
  const charging = state.enemies.filter((other) => other.kind === 'turkey' && (other.mode === 'wobble' || other.mode === 'kamikaze')).length
  if (charging >= MAX_CHARGING_TURKEYS || enemy.y > state.ship.y - 160) {
    enemy.cooldown = 0.5
    return
  }
  enemy.mode = 'wobble'
  enemy.stageT = 0
  world.events.push({ type: 'turkeyWarn', x: enemy.x, y: enemy.y })
}

/** Vrikke-varslet og selve styrtdykket; ender med at kalkunen flyver ind i formationen igen oppefra. */
export function stepTurkey(world: EnemyWorld, enemy: Enemy, target: Point, dt: number): void {
  const { state } = world
  if (enemy.mode === 'wobble') {
    enemy.stageT += dt
    enemy.x = target.x + Math.sin(enemy.stageT * 48) * 3.5
    enemy.y = target.y
    if (enemy.stageT < TURKEY_WOBBLE_SECONDS) return
    const dx = state.ship.x - enemy.x
    const dy = state.ship.y - enemy.y
    const distance = Math.max(1, Math.hypot(dx, dy))
    const speed = turkeySpeed(state)
    enemy.vx = (dx / distance) * speed
    enemy.vy = (dy / distance) * speed
    enemy.mode = 'kamikaze'
    return
  }
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt
  if (enemy.y < FIELD.height + 50 && enemy.x > -60 && enemy.x < FIELD.width + 60) return
  enemy.mode = 'entering'
  enemy.delay = 0
  enemy.vx = 0
  enemy.vy = 0
  planReentry(enemy, target)
  enemy.cooldown = (TURKEY_INTERVAL / pace(state)) * (0.8 + state.rng() * 0.4)
}

function ufoTick(world: EnemyWorld, enemy: Enemy, dt: number): void {
  const { state } = world
  enemy.stageT += dt
  switch (enemy.stage) {
    case UFO_CRUISE:
      enemy.cooldown -= dt
      if (enemy.cooldown > 0 || enemy.x < 60 || enemy.x > FIELD.width - 60) return
      enemy.stage = UFO_WARNING
      enemy.stageT = 0
      world.events.push({ type: 'tractorBeam', x: enemy.x })
      return
    case UFO_WARNING:
      if (enemy.stageT < UFO_WARNING_SECONDS) return
      enemy.stage = UFO_BEAM
      enemy.stageT = 0
      enemy.beam = 0
      return
    default: {
      const inBeam = Math.abs(state.ship.x - enemy.x) <= UFO_BEAM_HALF_WIDTH
      enemy.beam = inBeam ? enemy.beam + dt : 0
      if (!enemy.stolen && enemy.beam >= UFO_STEAL_SECONDS - 1e-9 && state.weapon.level > 1) {
        state.weapon.level--
        enemy.stolen = true
        enemy.stolenFamily = state.weapon.family
        world.events.push({ type: 'weaponStolen', x: enemy.x, y: enemy.y, level: state.weapon.level })
        enemy.stageT = UFO_ACTIVE_SECONDS
      }
      if (enemy.stageT < UFO_ACTIVE_SECONDS) return
      enemy.stage = UFO_CRUISE
      enemy.stageT = 0
      enemy.beam = 0
      enemy.cooldown = UFO_COOLDOWN_SECONDS
    }
  }
}

/** Kyllingernes egen rytme: sigtede skud, bomber, heling, kalkunvarsler og traktorstråle. */
export function updateSpecials(world: EnemyWorld, dt: number): void {
  if (world.state.awaitingWave) return
  for (const enemy of world.state.enemies) {
    if (enemy.dead || enemy.mode === 'entering') continue
    switch (enemy.kind) {
      case 'sniper':
        sniperTick(world, enemy, dt)
        break
      case 'bomber':
        bomberTick(world, enemy, dt)
        break
      case 'medic':
        medicTick(world, enemy, dt)
        break
      case 'turkey':
        turkeyTick(world, enemy, dt)
        break
      case 'ufo':
        ufoTick(world, enemy, dt)
        break
    }
  }
}

const triangle = (phase: number) => 1 - 4 * Math.abs(phase - Math.floor(phase) - 0.5)

/** Flyvernes bane; `slotY` er grundlinjen og `pathT` deres eget ur (`stageT` er UFO'ens stråleur). */
export function moveFlyby(enemy: Enemy, dt: number): void {
  enemy.pathT += dt
  switch (enemy.kind) {
    case 'ninja':
      enemy.x += enemy.vx * dt
      enemy.y = enemy.slotY + NINJA_ZIGZAG * triangle(enemy.pathT * NINJA_ZIGZAG_RATE)
      break
    case 'ufo': {
      const slow = enemy.stage === UFO_CRUISE ? 1 : UFO_BEAM_SLOWDOWN
      enemy.x += enemy.vx * slow * dt
      enemy.y = enemy.slotY + Math.sin(enemy.pathT * 2) * 4
      break
    }
    default:
      enemy.x += enemy.vx * dt
      enemy.y = enemy.slotY + Math.sin(enemy.pathT * 3) * 26
  }
}

/** Første gang en ny type dukker op i spillet, får spilleren et lille introkort. */
export function introduce(state: GameState, kind: EnemyKind, events: GameEvent[]): void {
  if (!isSpecial(kind) || state.introduced.includes(kind)) return
  state.introduced.push(kind)
  events.push({ type: 'newEnemy', kind })
}

export function launchFlyby(world: EnemyWorld, kind: FlybyKind): Enemy {
  const { state } = world
  const fromLeft = state.rng() < 0.5
  const dir = fromLeft ? 1 : -1
  let enemy: Enemy
  switch (kind) {
    case 'ninja':
      enemy = world.spawn('ninja', fromLeft ? -60 : FIELD.width + 60, 110 + state.rng() * 130, { vx: dir * NINJA_SPEED * (1 + 0.04 * state.spec.sector) })
      enemy.pathT = state.rng()
      break
    case 'ufo':
      enemy = world.spawn('ufo', fromLeft ? -70 : FIELD.width + 70, UFO_Y, { vx: dir * UFO_SPEED })
      break
    default:
      enemy = world.spawn('rainbow', fromLeft ? -60 : FIELD.width + 60, 92, { vx: dir * RAINBOW_SPEED })
  }
  enemy.slotY = enemy.y
  moveFlyby(enemy, 0)
  introduce(state, kind, world.events)
  return enemy
}

/** Særlige følger af et drab; returnerer true når kyllingen selv bestemmer sine drops. */
export function onKilled(world: EnemyWorld, enemy: Enemy, viaMissile: boolean): boolean {
  switch (enemy.kind) {
    case 'balloon':
      if (!viaMissile) world.chicks(3, enemy.x, enemy.y)
      return false
    case 'golden':
      world.drop('gift', enemy.x, enemy.y)
      return true
    case 'ufo':
      world.drop('gift', enemy.x, enemy.y, enemy.stolenFamily)
      return true
    case 'rainbow':
      world.drop(rollRainbowDrop(world.state.rng), enemy.x, enemy.y)
      return true
    case 'galleryHen':
    case 'bossPart':
      return true
    default:
      return false
  }
}
