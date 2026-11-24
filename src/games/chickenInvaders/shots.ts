import { FIELD, PROJECTILE_SPEED } from './config'
import { bossAimPoint, bossVulnerable } from './bosses/core'
import type { Enemy, GameEvent, GameState, Projectile } from './engine'
import type { ShotSpec } from './weapons'

/** Lynet søger kun fremad: højst så mange radianer fra lodret. */
export const LIGHTNING_CONE = 0.7
/** Rækkevidden på niveau 5; hvert niveau under koster 20 px. Niveau 1 når stadig en boss fra bunden. */
export const LIGHTNING_RANGE = 460
/** Største spring mellem to led i kæden. */
export const LIGHTNING_HOP = 170
/** Laserens tik brænder så meget hårdere på bosser og deres tårne/høns (ellers taber den til ionkanonen). */
export const BEAM_BOSS_FACTOR = 2
export const ROCKET_TURN_RATE = 5
export const ROCKET_LIFE = 3.2
const ROCKET_SPEED = { start: 300, max: 640, accel: 900 }
const PELLET_SPEED = 680
/** Skud kommer ud fra skibets næse. */
export const MUZZLE = 24
export const BOSS_TARGET_ID = -1

export const PROJECTILE_RADIUS: Record<Projectile['kind'], number> = { bolt: 4, ion: 7, pellet: 4, rocket: 6, drone: 3 }

/** Motorens hjælpere, så skudlogikken ikke selv skal kende til point, skjolde og drops. */
export interface ShotWorld {
  state: GameState
  events: GameEvent[]
  hitEnemy: (enemy: Enemy, damage: number) => void
  hitBoss: (damage: number, x: number, y: number) => void
}

export interface ChainLink {
  x: number
  y: number
  /** null = Mor Høne. */
  enemy: Enemy | null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const targetable = (enemy: Enemy) => !enemy.dead && enemy.y > -10 && enemy.x > -20 && enemy.x < FIELD.width + 20

/** Det punkt på bossens underside, der ligger nærmest x; null når bossen ikke kan rammes (skjold, teleport, ingen krop). */
function bossPoint(state: GameState, x: number): { x: number; y: number } | null {
  return state.boss ? bossAimPoint(state.boss, x) : null
}

/** Første mål er det nærmeste i keglen foran skibet; derefter springer lynet til det nærmeste nye mål. */
export function findChain(state: GameState, fromX: number, fromY: number, links: number): ChainLink[] {
  const chain: ChainLink[] = []
  let best: Enemy | null = null
  const range = LIGHTNING_RANGE - Math.max(0, 5 - links) * 20
  let bestDistance = range * range
  const inCone = (x: number, y: number) => {
    const dy = fromY - y
    return dy > 0 && Math.atan2(Math.abs(x - fromX), dy) <= LIGHTNING_CONE
  }
  for (const enemy of state.enemies) {
    if (!targetable(enemy) || !inCone(enemy.x, enemy.y)) continue
    const d = (enemy.x - fromX) ** 2 + (enemy.y - fromY) ** 2
    if (d < bestDistance) {
      bestDistance = d
      best = enemy
    }
  }
  let boss = bossPoint(state, fromX)
  if (boss && inCone(boss.x, boss.y) && (boss.x - fromX) ** 2 + (boss.y - fromY) ** 2 < bestDistance) {
    chain.push({ x: boss.x, y: boss.y, enemy: null })
    boss = null
  } else if (best) {
    chain.push({ x: best.x, y: best.y, enemy: best })
  } else {
    return chain
  }
  const hop = LIGHTNING_HOP * LIGHTNING_HOP
  for (let link = 0; link < links; link++) {
    const last = chain[chain.length - 1]
    let next: Enemy | null = null
    let nextDistance = hop
    for (const enemy of state.enemies) {
      if (!targetable(enemy) || chain.some((other) => other.enemy === enemy)) continue
      const d = (enemy.x - last.x) ** 2 + (enemy.y - last.y) ** 2
      if (d < nextDistance) {
        nextDistance = d
        next = enemy
      }
    }
    const bossHop = boss && last.enemy ? bossPoint(state, last.x) : null
    if (bossHop && (bossHop.x - last.x) ** 2 + (bossHop.y - last.y) ** 2 < nextDistance) {
      chain.push({ x: bossHop.x, y: bossHop.y, enemy: null })
      boss = null
    } else if (next) {
      chain.push({ x: next.x, y: next.y, enemy: next })
    } else {
      break
    }
  }
  return chain
}

function fireChain(world: ShotWorld, shot: ShotSpec): boolean {
  const { state } = world
  const x = state.ship.x
  const y = state.ship.y - MUZZLE
  const chain = findChain(state, x, y, shot.links ?? 1)
  const points = [x, y]
  if (chain.length === 0) points.push(x + Math.sin(state.time * 37) * 26, y - 110)
  for (const link of chain) points.push(link.x, link.y)
  world.events.push({ type: 'lightning', points, level: state.weapon.level })
  // En boss eller et boss-tårn tager også de led, der ellers ville springe videre: 1, 2 eller 3 skade.
  const grounded = shot.damage * Math.ceil((1 + (shot.links ?? 1)) / 2)
  for (const link of chain) {
    if (link.enemy) world.hitEnemy(link.enemy, link.enemy.kind === 'bossPart' ? grounded : shot.damage)
    else world.hitBoss(grounded, link.x, link.y)
  }
  return chain.length > 0
}

/** Laserens tik: rammer alt i kolonnen over skibet. */
function fireBeam(world: ShotWorld, shot: ShotSpec): boolean {
  const { state } = world
  const x = state.ship.x
  const bottom = state.ship.y - MUZZLE + 4
  const halfWidth = shot.halfWidth ?? 6
  let hit = false
  const count = state.enemies.length
  for (let i = 0; i < count; i++) {
    const enemy = state.enemies[i]
    if (enemy.dead || Math.abs(enemy.x - x) > halfWidth + enemy.radius) continue
    if (enemy.y - enemy.radius >= bottom || enemy.y < -enemy.radius) continue
    hit = true
    world.hitEnemy(enemy, enemy.kind === 'bossPart' ? shot.damage * BEAM_BOSS_FACTOR : shot.damage)
  }
  const boss = state.boss
  if (boss && bossVulnerable(boss) && boss.y < bottom && Math.abs(boss.x - x) <= boss.halfWidth * 0.8 + halfWidth) {
    hit = true
    world.hitBoss(shot.damage * BEAM_BOSS_FACTOR, x, boss.y + boss.halfHeight * 0.6)
  }
  world.events.push({ type: 'beam', x, y: bottom, halfWidth, level: state.weapon.level })
  return hit
}

function launch(state: GameState, shot: ShotSpec): void {
  const kind = shot.kind === 'pellet' || shot.kind === 'rocket' || shot.kind === 'ion' ? shot.kind : 'bolt'
  const speed = kind === 'pellet' ? PELLET_SPEED : kind === 'rocket' ? ROCKET_SPEED.start : PROJECTILE_SPEED
  const projectile: Projectile = {
    id: state.nextId++,
    kind,
    x: state.ship.x + shot.dx,
    y: state.ship.y - MUZZLE,
    vx: Math.sin(shot.angle) * speed,
    vy: -Math.cos(shot.angle) * speed,
    damage: shot.damage,
    pierce: shot.pierce,
    hitIds: [],
    dead: false,
  }
  if (kind === 'pellet') projectile.range = shot.range
  if (kind === 'rocket') {
    projectile.age = 0
    projectile.targetId = 0
  }
  state.projectiles.push(projectile)
}

/** Sender et skudmønster af sted: projektiler, lynkæder eller laserstrålens tik. */
export function fireShots(world: ShotWorld, shots: ShotSpec[]): void {
  const { stats } = world.state
  for (const shot of shots) {
    if (shot.kind === 'chain' || shot.kind === 'beam') {
      stats.shotsFired++
      if (shot.kind === 'chain' ? fireChain(world, shot) : fireBeam(world, shot)) stats.shotsHit++
    } else {
      stats.shotsFired++
      launch(world.state, shot)
    }
  }
}

function claimed(state: GameState, rocket: Projectile, id: number): boolean {
  for (const other of state.projectiles) if (other !== rocket && !other.dead && other.kind === 'rocket' && other.targetId === id) return true
  return false
}

function rocketTarget(state: GameState, rocket: Projectile): { x: number; y: number } | null {
  const id = rocket.targetId ?? 0
  if (id === BOSS_TARGET_ID) {
    if (state.boss && bossVulnerable(state.boss)) return state.boss
  } else if (id > 0) {
    for (const enemy of state.enemies) if (enemy.id === id && !enemy.dead) return enemy
  }
  let best: Enemy | null = null
  let bestDistance = Infinity
  // Første gennemløb springer mål over, som en anden raket allerede jager.
  for (let pass = 0; pass < 2 && !best; pass++) {
    for (const enemy of state.enemies) {
      if (!targetable(enemy) || (pass === 0 && claimed(state, rocket, enemy.id))) continue
      const d = (enemy.x - rocket.x) ** 2 + (enemy.y - rocket.y) ** 2
      if (d < bestDistance) {
        bestDistance = d
        best = enemy
      }
    }
  }
  const boss = state.boss
  if (boss && bossVulnerable(boss) && (boss.x - rocket.x) ** 2 + (boss.y - rocket.y) ** 2 < bestDistance) {
    rocket.targetId = BOSS_TARGET_ID
    return boss
  }
  rocket.targetId = best ? best.id : 0
  return best
}

/** Raketten drejer mod sit mål med begrænset drejehastighed og accelererer. */
function steerRocket(state: GameState, rocket: Projectile, dt: number): void {
  const target = rocketTarget(state, rocket)
  let heading = Math.atan2(rocket.vx, -rocket.vy)
  if (target) {
    let diff = Math.atan2(target.x - rocket.x, -(target.y - rocket.y)) - heading
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    heading += clamp(diff, -ROCKET_TURN_RATE * dt, ROCKET_TURN_RATE * dt)
  }
  const speed = Math.min(ROCKET_SPEED.max, Math.hypot(rocket.vx, rocket.vy) + ROCKET_SPEED.accel * dt)
  rocket.vx = Math.sin(heading) * speed
  rocket.vy = -Math.cos(heading) * speed
}

/** Flytter et projektil ét trin; haglkorn falmer efter rækkevidden og raketter brænder ud. */
export function advanceProjectile(state: GameState, projectile: Projectile, dt: number): void {
  if (projectile.kind === 'rocket') {
    steerRocket(state, projectile, dt)
    projectile.age = (projectile.age ?? 0) + dt
    if (projectile.age > ROCKET_LIFE) projectile.dead = true
  }
  projectile.x += projectile.vx * dt
  projectile.y += projectile.vy * dt
  if (projectile.range !== undefined) {
    projectile.range -= Math.hypot(projectile.vx, projectile.vy) * dt
    if (projectile.range <= 0) projectile.dead = true
  }
  if (projectile.y < -30 || projectile.y > FIELD.height + 30 || projectile.x < -30 || projectile.x > FIELD.width + 30) projectile.dead = true
}
