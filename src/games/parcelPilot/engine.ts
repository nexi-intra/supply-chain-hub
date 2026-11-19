import {
  BOTTOM_MARGIN,
  DRONE_RADIUS,
  DRONE_X,
  FIELD,
  GATE_WIDTH,
  GATES_PER_ZONE,
  GRAVITY,
  LIFT_VELOCITY,
  MAX_FALL_SPEED,
  MAX_MULTIPLIER,
  MAX_SPEEDUP,
  PARCEL_RADIUS,
  PERFECT_RATIO,
  READY_Y,
  SETTINGS,
  SHIELD_GRACE_SECONDS,
  STEP_SECONDS,
  TOP_MARGIN,
  WATER_Y,
  ZONE_SPEEDUP,
  type Difficulty,
} from './config'
import { createRng, type Rng } from '../chickenInvaders/rng'

export type GameStatus = 'ready' | 'flying' | 'crashed' | 'over'

export interface GameInput {
  /** Et nyt tryk i dette skridt. */
  lift: boolean
}

export interface Gate {
  id: number
  x: number
  baseY: number
  gapY: number
  gap: number
  amplitude: number
  phase: number
  passed: boolean
}

export interface Parcel {
  id: number
  x: number
  y: number
  golden: boolean
}

export interface GameStats {
  score: number
  gates: number
  parcels: number
  perfect: number
  bestStreak: number
  zone: number
}

export type GameEvent =
  | { type: 'start' }
  | { type: 'lift' }
  | { type: 'gatePass'; x: number; y: number; perfect: boolean; points: number; multiplier: number; streak: number }
  | { type: 'parcel'; x: number; y: number; points: number; golden: boolean }
  | { type: 'shieldGain' }
  | { type: 'shieldBreak'; x: number; y: number }
  | { type: 'zone'; zone: number }
  | { type: 'crash'; x: number; y: number; cause: 'stack' | 'water' }
  | { type: 'splash'; x: number; y: number }
  | { type: 'gameOver' }

export interface GameState {
  difficulty: Difficulty
  rng: Rng
  time: number
  status: GameStatus
  drone: { y: number; vy: number; spin: number }
  gates: Gate[]
  parcels: Parcel[]
  scroll: number
  nextGateIn: number
  lastGapY: number | null
  gatesSpawned: number
  gatesPassed: number
  zone: number
  speedFactor: number
  score: number
  streak: number
  bestStreak: number
  multiplier: number
  shield: boolean
  invulnerableUntil: number
  crashedAt: number
  stats: { parcels: number; perfect: number }
  nextId: number
}

const MOVING_CHANCE = 0.45
const PARCEL_CHANCE = 0.4
const GOLDEN_INDEX = 6
const GATE_POINTS = 10
const PARCEL_POINTS = 25
const GOLDEN_POINTS = 100
const SWAY_SPEED = (Math.PI * 2) / 2.6
const READY_BOB = 8
const CRASH_TIMEOUT_SECONDS = 3

export function createGame(difficulty: Difficulty, options: { seed?: number } = {}): GameState {
  return {
    difficulty,
    rng: createRng(options.seed ?? Math.floor(Math.random() * 2 ** 31)),
    time: 0,
    status: 'ready',
    drone: { y: READY_Y, vy: 0, spin: 0 },
    gates: [],
    parcels: [],
    scroll: 0,
    nextGateIn: 0,
    lastGapY: null,
    gatesSpawned: 0,
    gatesPassed: 0,
    zone: 1,
    speedFactor: 1,
    score: 0,
    streak: 0,
    bestStreak: 0,
    multiplier: 1,
    shield: false,
    invulnerableUntil: 0,
    crashedAt: 0,
    stats: { parcels: 0, perfect: 0 },
    nextId: 1,
  }
}

export function getStats(state: GameState): GameStats {
  return {
    score: state.score,
    gates: state.gatesPassed,
    parcels: state.stats.parcels,
    perfect: state.stats.perfect,
    bestStreak: state.bestStreak,
    zone: state.zone,
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Lægger en ny port (og evt. en pakke mellem den og den forrige) ved `x`. */
export function spawnGate(state: GameState, x = FIELD.width): Gate {
  const settings = SETTINGS[state.difficulty]
  const { gap, maxShift } = settings
  const moving = state.zone >= settings.movingFromZone && state.rng() < MOVING_CHANCE
  const amplitude = moving ? 36 + state.rng() * 24 : 0
  const min = TOP_MARGIN + gap / 2 + amplitude
  const max = WATER_Y - BOTTOM_MARGIN - gap / 2 - amplitude
  const previous = state.lastGapY
  const low = previous === null ? min : Math.max(min, previous - maxShift)
  const high = previous === null ? max : Math.min(max, previous + maxShift)
  const baseY = low + state.rng() * Math.max(0, high - low)
  const phase = state.rng() * Math.PI * 2
  const gate: Gate = { id: state.nextId++, x, baseY, gapY: baseY + amplitude * Math.sin(phase + state.time * SWAY_SPEED), gap, amplitude, phase, passed: false }

  if (previous !== null) {
    const golden = state.gatesSpawned % GATES_PER_ZONE === GOLDEN_INDEX
    if (golden || state.rng() < PARCEL_CHANCE) {
      const y = clamp((previous + baseY) / 2 + (state.rng() - 0.5) * 40, TOP_MARGIN + 20, WATER_Y - 60)
      state.parcels.push({ id: state.nextId++, x: x - settings.spacing / 2 + GATE_WIDTH / 2, y, golden })
    }
  }
  state.gates.push(gate)
  state.lastGapY = baseY
  state.gatesSpawned++
  return gate
}

function hitsRect(cx: number, cy: number, radius: number, left: number, top: number, right: number, bottom: number): boolean {
  const nearestX = clamp(cx, left, right)
  const nearestY = clamp(cy, top, bottom)
  return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 < radius * radius
}

function hitsGate(state: GameState, gate: Gate): boolean {
  const { y } = state.drone
  const top = gate.gapY - gate.gap / 2
  const bottom = gate.gapY + gate.gap / 2
  const right = gate.x + GATE_WIDTH
  return hitsRect(DRONE_X, y, DRONE_RADIUS, gate.x, -1000, right, top) || hitsRect(DRONE_X, y, DRONE_RADIUS, gate.x, bottom, right, WATER_Y + 200)
}

function breakShield(state: GameState, events: GameEvent[]): void {
  state.shield = false
  state.invulnerableUntil = state.time + SHIELD_GRACE_SECONDS
  events.push({ type: 'shieldBreak', x: DRONE_X, y: state.drone.y })
}

function endGame(state: GameState, events: GameEvent[]): void {
  state.status = 'over'
  events.push({ type: 'splash', x: DRONE_X, y: WATER_Y }, { type: 'gameOver' })
}

function passGate(state: GameState, gate: Gate, events: GameEvent[]): void {
  gate.passed = true
  const perfect = Math.abs(state.drone.y - gate.gapY) <= gate.gap * PERFECT_RATIO
  if (perfect) {
    state.streak++
    state.stats.perfect++
    state.bestStreak = Math.max(state.bestStreak, state.streak)
  } else {
    state.streak = 0
  }
  state.multiplier = Math.min(MAX_MULTIPLIER, 1 + Math.floor(state.streak / 3))
  const points = GATE_POINTS * state.multiplier
  state.score += points
  state.gatesPassed++
  events.push({ type: 'gatePass', x: DRONE_X, y: state.drone.y, perfect, points, multiplier: state.multiplier, streak: state.streak })
  if (state.gatesPassed % GATES_PER_ZONE === 0) {
    state.zone++
    state.speedFactor = 1 + Math.min(MAX_SPEEDUP, (state.zone - 1) * ZONE_SPEEDUP)
    events.push({ type: 'zone', zone: state.zone })
  }
}

export function stepGame(state: GameState, input: GameInput, seconds = STEP_SECONDS): GameEvent[] {
  if (state.status === 'over' || !Number.isFinite(seconds) || seconds <= 0) return []
  const events: GameEvent[] = []
  state.time += seconds
  const drone = state.drone

  if (state.status === 'ready') {
    state.scroll += SETTINGS[state.difficulty].speed * 0.5 * seconds
    drone.y = READY_Y + Math.sin(state.time * 3) * READY_BOB
    if (input.lift) {
      state.status = 'flying'
      drone.vy = LIFT_VELOCITY
      state.nextGateIn = 0
      events.push({ type: 'start' }, { type: 'lift' })
    }
    return events
  }

  if (state.status === 'crashed') {
    drone.vy = Math.min(MAX_FALL_SPEED, drone.vy + GRAVITY * seconds)
    drone.y += drone.vy * seconds
    drone.spin += seconds * 9
    if (drone.y + DRONE_RADIUS >= WATER_Y || state.time - state.crashedAt > CRASH_TIMEOUT_SECONDS) endGame(state, events)
    return events
  }

  if (input.lift) {
    drone.vy = LIFT_VELOCITY
    events.push({ type: 'lift' })
  }
  drone.vy = Math.min(MAX_FALL_SPEED, drone.vy + GRAVITY * seconds)
  drone.y += drone.vy * seconds
  if (drone.y - DRONE_RADIUS < 0) {
    drone.y = DRONE_RADIUS
    drone.vy = Math.max(0, drone.vy)
  }

  const settings = SETTINGS[state.difficulty]
  const dx = settings.speed * state.speedFactor * seconds
  state.scroll += dx
  for (const gate of state.gates) {
    gate.x -= dx
    gate.gapY = gate.baseY + gate.amplitude * Math.sin(gate.phase + state.time * SWAY_SPEED)
  }
  for (const parcel of state.parcels) parcel.x -= dx
  state.nextGateIn -= dx
  while (state.nextGateIn <= 0) {
    spawnGate(state, FIELD.width + state.nextGateIn)
    state.nextGateIn += settings.spacing
  }

  if (state.time >= state.invulnerableUntil && state.gates.some((gate) => hitsGate(state, gate))) {
    if (state.shield) {
      breakShield(state, events)
    } else {
      state.status = 'crashed'
      state.crashedAt = state.time
      drone.vy = -260
      events.push({ type: 'crash', x: DRONE_X, y: drone.y, cause: 'stack' })
      return events
    }
  }

  if (drone.y + DRONE_RADIUS >= WATER_Y) {
    if (state.shield) {
      breakShield(state, events)
      drone.y = WATER_Y - DRONE_RADIUS - 1
      drone.vy = LIFT_VELOCITY * 1.1
    } else {
      drone.y = WATER_Y - DRONE_RADIUS
      events.push({ type: 'crash', x: DRONE_X, y: drone.y, cause: 'water' })
      endGame(state, events)
      return events
    }
  }

  for (const gate of state.gates) {
    if (!gate.passed && gate.x + GATE_WIDTH / 2 <= DRONE_X) passGate(state, gate, events)
  }

  const reach = (DRONE_RADIUS + PARCEL_RADIUS) ** 2
  state.parcels = state.parcels.filter((parcel) => {
    if ((parcel.x - DRONE_X) ** 2 + (parcel.y - drone.y) ** 2 >= reach) return parcel.x > -40
    const points = (parcel.golden ? GOLDEN_POINTS : PARCEL_POINTS) * state.multiplier
    state.score += points
    state.stats.parcels++
    events.push({ type: 'parcel', x: parcel.x, y: parcel.y, points, golden: parcel.golden })
    if (parcel.golden && !state.shield) {
      state.shield = true
      events.push({ type: 'shieldGain' })
    }
    return false
  })
  state.gates = state.gates.filter((gate) => gate.x + GATE_WIDTH > -40)
  return events
}
