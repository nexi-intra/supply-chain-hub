import type { GameEvent, GameState, Pickup, PickupKind } from './engine'
import type { Rng } from './rng'

export const TIMED_POWERUPS = ['drone', 'slowmo', 'magnet', 'double'] as const
export type TimedPowerup = (typeof TIMED_POWERUPS)[number]

export const POWERUP_SECONDS: Record<TimedPowerup, number> = { drone: 15, slowmo: 6, magnet: 10, double: 10 }
/** Fjender, æg, meteorer, hazards og bonusregn kører med denne fart under slowmo. */
export const SLOWMO_FACTOR = 0.5
export const MAGNET_RADIUS = 320
const MAGNET_SPEED = 620
/** Point for et ekstra liv, når man allerede har max. */
export const LIFE_FULL_POINTS = 2500

export const DRONE_RANGE = 480
const DRONE_INTERVAL = 0.3
export const DRONE_SHOT_SPEED = 760
const DRONE_ORBIT = { rx: 52, ry: 12, rate: 2.4, lift: 32, follow: 22 }

export interface DroneState {
  x: number
  y: number
  phase: number
  cooldown: number
}

export interface PowerupState {
  /** Spilletid hvor hver power-up slutter (0 = ikke aktiv). */
  until: Record<TimedPowerup, number>
  drone: DroneState
}

export function createPowerups(): PowerupState {
  return { until: { drone: 0, slowmo: 0, magnet: 0, double: 0 }, drone: { x: 0, y: 0, phase: 0, cooldown: 0 } }
}

export const isActive = (state: GameState, kind: TimedPowerup): boolean => state.time < state.powerups.until[kind]

/** 0–1 af tiden tilbage; bruges til nedtællingsringene i HUD'en. */
export const remainingShare = (state: GameState, kind: TimedPowerup): number =>
  Math.max(0, Math.min(1, (state.powerups.until[kind] - state.time) / POWERUP_SECONDS[kind]))

export function activatePowerup(state: GameState, kind: TimedPowerup): void {
  const { powerups, ship } = state
  if (kind === 'drone' && !isActive(state, 'drone')) {
    powerups.drone.x = ship.x
    powerups.drone.y = ship.y
    powerups.drone.cooldown = 0.2
  }
  powerups.until[kind] = state.time + POWERUP_SECONDS[kind]
}

export const timeScale = (state: GameState): number => (isActive(state, 'slowmo') ? SLOWMO_FACTOR : 1)
export const pointsFactor = (state: GameState): number => (isActive(state, 'double') ? 2 : 1)

type Weights = readonly (readonly [PickupKind, number])[]

/** Almindelige drops fra kyllinger; ekstra liv er meget sjældent. */
export const DROP_WEIGHTS: Weights = [
  ['shield', 20],
  ['coolant', 16],
  ['missile', 14],
  ['drone', 13],
  ['slowmo', 11],
  ['magnet', 12],
  ['double', 13],
  ['life', 1],
]

export const RAINBOW_WEIGHTS: Weights = [
  ['drone', 16],
  ['slowmo', 14],
  ['magnet', 14],
  ['double', 16],
  ['life', 12],
  ['shield', 12],
  ['missile', 8],
  ['gift', 8],
]

function weighted(weights: Weights, rng: Rng): PickupKind {
  let total = 0
  for (const [, weight] of weights) total += weight
  let roll = rng() * total
  for (const [kind, weight] of weights) {
    roll -= weight
    if (roll < 0) return kind
  }
  return weights[weights.length - 1][0]
}

export const rollPowerup = (rng: Rng): PickupKind => weighted(DROP_WEIGHTS, rng)
export const rollRainbowDrop = (rng: Rng): PickupKind => weighted(RAINBOW_WEIGHTS, rng)

/** Magneten trækker pickups ind mod skibet, hårdere jo tættere de er. */
export function attractPickup(state: GameState, pickup: Pickup, dt: number): void {
  const dx = state.ship.x - pickup.x
  const dy = state.ship.y - pickup.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1 || distance > MAGNET_RADIUS) return
  const step = Math.min(distance, MAGNET_SPEED * (0.35 + 0.65 * (1 - distance / MAGNET_RADIUS)) * dt)
  pickup.x += (dx / distance) * step
  pickup.y += (dy / distance) * step
}

/** Nærmeste levende fjende (eller Mor Høne) inden for dronens rækkevidde. */
function droneTarget(state: GameState, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null
  let bestDistance = DRONE_RANGE * DRONE_RANGE
  for (const enemy of state.enemies) {
    if (enemy.dead || enemy.y < 0 || enemy.y > y + 40) continue
    const d = (enemy.x - x) ** 2 + (enemy.y - y) ** 2
    if (d < bestDistance) {
      bestDistance = d
      best = enemy
    }
  }
  const boss = state.boss
  if (!best && boss && !boss.entering && (boss.x - x) ** 2 + (boss.y - y) ** 2 < bestDistance) best = boss
  return best
}

function updateDrone(state: GameState, dt: number): void {
  const drone = state.powerups.drone
  const { ship } = state
  drone.phase += DRONE_ORBIT.rate * dt
  const tx = ship.x + Math.cos(drone.phase) * DRONE_ORBIT.rx
  const ty = ship.y - DRONE_ORBIT.lift + Math.sin(drone.phase) * DRONE_ORBIT.ry
  const follow = Math.min(1, DRONE_ORBIT.follow * dt)
  drone.x += (tx - drone.x) * follow
  drone.y += (ty - drone.y) * follow
  drone.cooldown -= dt
  if (drone.cooldown > 0) return
  const locked = state.bonus?.stage === 'eggDodge' && !state.bonus.done
  const target = locked ? null : droneTarget(state, drone.x, drone.y)
  if (!target) {
    drone.cooldown = 0.1
    return
  }
  const dx = target.x - drone.x
  const dy = target.y - drone.y
  const distance = Math.max(1, Math.hypot(dx, dy))
  state.projectiles.push({
    id: state.nextId++,
    kind: 'drone',
    x: drone.x,
    y: drone.y - 6,
    vx: (dx / distance) * DRONE_SHOT_SPEED,
    vy: (dy / distance) * DRONE_SHOT_SPEED,
    damage: 1,
    pierce: false,
    hitIds: [],
    dead: false,
  })
  drone.cooldown = DRONE_INTERVAL
}

/** Udløbne ure og dronen; kører med ægte tid, så slowmo ikke bremser spillerens egne hjælpere. */
export function updatePowerups(state: GameState, events: GameEvent[], dt: number): void {
  const { until } = state.powerups
  for (const kind of TIMED_POWERUPS) {
    if (until[kind] > 0 && state.time >= until[kind]) {
      until[kind] = 0
      events.push({ type: 'powerupEnd', kind })
    }
  }
  if (isActive(state, 'drone')) updateDrone(state, dt)
}
