import {
  COLS,
  COMBO_WINDOW_SECONDS,
  EXPRESS_CHANCE,
  EXPRESS_LIFETIME_SECONDS,
  EXPRESS_POINTS,
  MAX_MULTIPLIER,
  MAX_QUEUED_TURNS,
  MAX_SPEEDUP,
  PARCEL_POINTS,
  ROWS,
  SETTINGS,
  SPEEDUP_PER_PARCEL,
  START,
  START_LENGTH,
  STEP_SECONDS,
  type Difficulty,
} from './config'
import { createRng, type Rng } from '../chickenInvaders/rng'

export type Direction = 'up' | 'down' | 'left' | 'right'
export interface Point {
  x: number
  y: number
}

export interface Obstacle {
  kind: 'pallet' | 'rack'
  cells: Array<[number, number]>
}

export interface GameInput {
  turns: Direction[]
  /** Starter fra klar-tilstand uden at dreje. */
  start?: boolean
}

export interface GameStats {
  score: number
  parcels: number
  express: number
  longest: number
  bestCombo: number
  seconds: number
}

export type GameEvent =
  | { type: 'start' }
  | { type: 'eat'; kind: 'parcel' | 'express'; x: number; y: number; points: number; multiplier: number; combo: number }
  | { type: 'expressSpawn'; x: number; y: number }
  | { type: 'expressExpired'; x: number; y: number }
  | { type: 'crash'; x: number; y: number; cause: 'wall' | 'self' | 'obstacle' }
  | { type: 'gameOver' }

export interface GameState {
  difficulty: Difficulty
  rng: Rng
  time: number
  playTime: number
  status: 'ready' | 'playing' | 'over'
  segments: Point[]
  previous: Point[]
  direction: Direction
  queue: Direction[]
  tickTimer: number
  progress: number
  ticks: number
  growPending: number
  parcel: Point
  express: (Point & { expiresAt: number }) | null
  obstacles: Obstacle[]
  score: number
  parcels: number
  combo: number
  lastEatAt: number
  multiplier: number
  stats: { express: number; longest: number; bestCombo: number }
}

export const VECTORS: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
export const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

const key = (x: number, y: number) => `${x},${y}`
const FIRST_PARCEL_DISTANCE = 6

export function createGame(difficulty: Difficulty, options: { seed?: number } = {}): GameState {
  const rng = createRng(options.seed ?? Math.floor(Math.random() * 2 ** 31))
  const segments = Array.from({ length: START_LENGTH }, (_, i) => ({ x: START.x - i, y: START.y }))
  const state: GameState = {
    difficulty,
    rng,
    time: 0,
    playTime: 0,
    status: 'ready',
    segments,
    previous: segments.map((s) => ({ ...s })),
    direction: 'right',
    queue: [],
    tickTimer: 0,
    progress: 0,
    ticks: 0,
    growPending: 0,
    parcel: { x: 0, y: 0 },
    express: null,
    obstacles: [],
    score: 0,
    parcels: 0,
    combo: 0,
    lastEatAt: -Infinity,
    multiplier: 1,
    stats: { express: 0, longest: START_LENGTH, bestCombo: 0 },
  }
  state.obstacles = placeObstacles(rng, SETTINGS[difficulty].obstacles)
  // Første pakke ligger på den altid frie startbane, så den første opsamling er nem.
  state.parcel = { x: START.x + FIRST_PARCEL_DISTANCE, y: START.y }
  return state
}

export function getStats(state: GameState): GameStats {
  return { score: state.score, parcels: state.parcels, express: state.stats.express, longest: state.stats.longest, bestCombo: state.stats.bestCombo, seconds: Math.floor(state.playTime) }
}

export function tickInterval(state: GameState): number {
  return SETTINGS[state.difficulty].tick * (1 - Math.min(MAX_SPEEDUP, state.parcels * SPEEDUP_PER_PARCEL))
}

/** Paller og reoler inde på gulvet: aldrig ved kanten, aldrig i startbanen og aldrig klods op ad hinanden. */
function placeObstacles(rng: Rng, count: number): Obstacle[] {
  const obstacles: Obstacle[] = []
  const used = new Set<string>()
  for (let attempt = 0; obstacles.length < count && attempt < 2000; attempt++) {
    const rack = rng() < 0.45
    const vertical = rng() < 0.5
    const length = rack ? 3 : rng() < 0.5 ? 1 : 2
    const x = 2 + Math.floor(rng() * (COLS - 4))
    const y = 2 + Math.floor(rng() * (ROWS - 4))
    const cells: Array<[number, number]> = Array.from({ length }, (_, i) => (vertical ? [x, y + i] : [x + i, y]))
    const valid = cells.every(([cx, cy]) => {
      if (cx < 2 || cx > COLS - 3 || cy < 2 || cy > ROWS - 3 || Math.abs(cy - START.y) <= 1) return false
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (used.has(key(cx + dx, cy + dy))) return false
      return true
    })
    if (!valid) continue
    for (const [cx, cy] of cells) used.add(key(cx, cy))
    obstacles.push({ kind: rack ? 'rack' : 'pallet', cells })
  }
  return obstacles
}

function blockedCells(state: GameState): Set<string> {
  const blocked = new Set<string>()
  for (const obstacle of state.obstacles) for (const [x, y] of obstacle.cells) blocked.add(key(x, y))
  return blocked
}

function freeCell(state: GameState): Point {
  const taken = blockedCells(state)
  for (const s of state.segments) taken.add(key(s.x, s.y))
  if (state.express) taken.add(key(state.express.x, state.express.y))
  taken.add(key(state.parcel.x, state.parcel.y))
  const free: Point[] = []
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!taken.has(key(x, y))) free.push({ x, y })
  return free.length > 0 ? free[Math.floor(state.rng() * free.length)] : { x: -1, y: -1 }
}

function queueTurns(state: GameState, turns: Direction[]): void {
  for (const turn of turns) {
    const reference = state.queue[state.queue.length - 1] ?? state.direction
    if (turn === reference || turn === OPPOSITE[reference] || state.queue.length >= MAX_QUEUED_TURNS) continue
    state.queue.push(turn)
  }
}

function eat(state: GameState, kind: 'parcel' | 'express', at: Point, events: GameEvent[]): void {
  state.combo = state.time - state.lastEatAt <= COMBO_WINDOW_SECONDS ? state.combo + 1 : 1
  state.lastEatAt = state.time
  state.multiplier = Math.min(MAX_MULTIPLIER, 1 + Math.floor((state.combo - 1) / 2))
  state.stats.bestCombo = Math.max(state.stats.bestCombo, state.combo)
  const points = (kind === 'parcel' ? PARCEL_POINTS : EXPRESS_POINTS) * state.multiplier
  state.score += points
  state.growPending++
  events.push({ type: 'eat', kind, x: at.x, y: at.y, points, multiplier: state.multiplier, combo: state.combo })
  if (kind === 'express') {
    state.express = null
    state.stats.express++
    return
  }
  state.parcels++
  state.parcel = freeCell(state)
  if (!state.express && state.rng() < EXPRESS_CHANCE) {
    const cell = freeCell(state)
    state.express = { ...cell, expiresAt: state.time + EXPRESS_LIFETIME_SECONDS }
    events.push({ type: 'expressSpawn', x: cell.x, y: cell.y })
  }
}

function crash(state: GameState, at: Point, cause: 'wall' | 'self' | 'obstacle', events: GameEvent[]): void {
  state.status = 'over'
  state.previous = state.segments.map((s) => ({ ...s }))
  state.progress = 0
  events.push({ type: 'crash', x: at.x, y: at.y, cause }, { type: 'gameOver' })
}

function advance(state: GameState, events: GameEvent[]): void {
  if (state.queue.length > 0) state.direction = state.queue.shift()!
  const head = state.segments[0]
  const vector = VECTORS[state.direction]
  const next = { x: head.x + vector.x, y: head.y + vector.y }
  if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) return crash(state, next, 'wall', events)
  if (blockedCells(state).has(key(next.x, next.y))) return crash(state, next, 'obstacle', events)
  // Halen flytter sig væk i samme tick, medmindre toget vokser.
  const body = state.growPending > 0 ? state.segments : state.segments.slice(0, -1)
  if (body.some((s) => s.x === next.x && s.y === next.y)) return crash(state, next, 'self', events)

  state.previous = state.segments.map((s) => ({ ...s }))
  state.segments.unshift(next)
  if (state.growPending > 0) {
    state.growPending--
    state.previous.push({ ...state.previous[state.previous.length - 1] })
  } else {
    state.segments.pop()
  }
  state.stats.longest = Math.max(state.stats.longest, state.segments.length)
  state.ticks++

  if (next.x === state.parcel.x && next.y === state.parcel.y) eat(state, 'parcel', next, events)
  else if (state.express && next.x === state.express.x && next.y === state.express.y) eat(state, 'express', next, events)
}

export function stepGame(state: GameState, input: GameInput, seconds = STEP_SECONDS): GameEvent[] {
  if (state.status === 'over' || !Number.isFinite(seconds) || seconds <= 0) return []
  const events: GameEvent[] = []
  if (state.status === 'ready') {
    const wantsToGo = input.start || input.turns.some((turn) => turn !== OPPOSITE[state.direction])
    if (!wantsToGo) return events
    state.status = 'playing'
    events.push({ type: 'start' })
    queueTurns(state, input.turns)
    return events
  }

  state.time += seconds
  state.playTime += seconds
  queueTurns(state, input.turns)
  if (state.express && state.time >= state.express.expiresAt) {
    events.push({ type: 'expressExpired', x: state.express.x, y: state.express.y })
    state.express = null
  }
  const interval = tickInterval(state)
  state.tickTimer += seconds
  if (state.tickTimer >= interval) {
    state.tickTimer -= interval
    advance(state, events)
  }
  state.progress = state.status === 'playing' ? Math.min(1, state.tickTimer / tickInterval(state)) : 0
  return events
}
