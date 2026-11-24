import {
  ARR_SECONDS,
  COLS,
  DAS_SECONDS,
  gravityRowsPerSecond,
  HIDDEN_ROWS,
  LINES_PER_LEVEL,
  LOCK_DELAY_SECONDS,
  MAX_LOCK_RESETS,
  MIN_SOFT_DROP_ROWS_PER_SECOND,
  ROWS,
  SETTINGS,
  SOFT_DROP_FACTOR,
  STEP_SECONDS,
  type Difficulty,
} from './config'
import { createBag, kicksFor, pieceCells, type PieceType, type Rotation } from './pieces'
import { createRng, type Rng } from '../chickenInvaders/rng'

export type Action = 'left' | 'right' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold'
export type Cell = PieceType | null
export type TSpin = 'none' | 'mini' | 'full'

export interface GameInput {
  actions: Action[]
  held: { left: boolean; right: boolean; down: boolean }
}

export interface ActivePiece {
  type: PieceType
  x: number
  y: number
  rotation: Rotation
}

export interface GameStats {
  score: number
  level: number
  lines: number
  pieces: number
  tetrises: number
  tspins: number
  maxCombo: number
  perfectClears: number
}

export type GameEvent =
  | { type: 'spawn'; piece: PieceType }
  | { type: 'move'; dx: number }
  | { type: 'rotate'; rotation: Rotation; kick: number }
  | { type: 'hold'; piece: PieceType }
  | { type: 'hardDrop'; piece: PieceType; distance: number; cells: Array<[number, number]> }
  | { type: 'lock'; piece: PieceType; cells: Array<[number, number]> }
  | { type: 'lineClear'; rows: number[]; blocks: Cell[][]; count: number; tspin: TSpin; backToBack: boolean; combo: number; perfect: boolean; points: number }
  | { type: 'levelUp'; level: number }
  | { type: 'gameOver'; reason: 'blockOut' | 'lockOut' }

export interface GameState {
  difficulty: Difficulty
  rng: Rng
  nextFromBag: () => PieceType
  time: number
  status: 'playing' | 'over'
  board: Cell[][]
  active: ActivePiece | null
  queue: PieceType[]
  hold: PieceType | null
  holdUsed: boolean
  level: number
  lines: number
  score: number
  combo: number
  backToBackActive: boolean
  gravityAccumulator: number
  lockTimer: number
  lockResets: number
  lowestY: number
  lastMoveRotation: boolean
  lastKick: number
  das: { direction: -1 | 0 | 1; timer: number; repeat: number; charged: boolean }
  stats: { pieces: number; tetrises: number; tspins: number; maxCombo: number; perfectClears: number }
}

const QUEUE_LENGTH = 6
const LINE_POINTS = [0, 100, 300, 500, 800]
const TSPIN_POINTS = [400, 800, 1200, 1600]
const MINI_POINTS = [100, 200, 400]
const PERFECT_POINTS = [0, 800, 1200, 1800, 2000]
const CORNERS: Array<[number, number]> = [[0, 0], [2, 0], [0, 2], [2, 2]]
const FRONT_CORNERS: Record<Rotation, Array<[number, number]>> = {
  0: [[0, 0], [2, 0]],
  1: [[2, 0], [2, 2]],
  2: [[0, 2], [2, 2]],
  3: [[0, 0], [0, 2]],
}

export function createGame(difficulty: Difficulty, options: { seed?: number } = {}): GameState {
  const rng = createRng(options.seed ?? Math.floor(Math.random() * 2 ** 31))
  const nextFromBag = createBag(rng)
  const state: GameState = {
    difficulty,
    rng,
    nextFromBag,
    time: 0,
    status: 'playing',
    board: Array.from({ length: ROWS }, () => new Array<Cell>(COLS).fill(null)),
    active: null,
    queue: Array.from({ length: QUEUE_LENGTH }, () => nextFromBag()),
    hold: null,
    holdUsed: false,
    level: SETTINGS[difficulty].startLevel,
    lines: 0,
    score: 0,
    combo: -1,
    backToBackActive: false,
    gravityAccumulator: 0,
    lockTimer: 0,
    lockResets: 0,
    lowestY: 0,
    lastMoveRotation: false,
    lastKick: 0,
    das: { direction: 0, timer: 0, repeat: 0, charged: false },
    stats: { pieces: 0, tetrises: 0, tspins: 0, maxCombo: 0, perfectClears: 0 },
  }
  spawn(state, takeNext(state), [])
  return state
}

export function getStats(state: GameState): GameStats {
  return { score: state.score, level: state.level, lines: state.lines, ...state.stats }
}

function takeNext(state: GameState): PieceType {
  const next = state.queue.shift()!
  while (state.queue.length < QUEUE_LENGTH) state.queue.push(state.nextFromBag())
  return next
}

function fits(state: GameState, piece: ActivePiece): boolean {
  for (const [cx, cy] of pieceCells(piece.type, piece.rotation)) {
    const x = piece.x + cx
    const y = piece.y + cy
    if (x < 0 || x >= COLS || y >= ROWS) return false
    if (y >= 0 && state.board[y][x] !== null) return false
  }
  return true
}

function absoluteCells(piece: ActivePiece): Array<[number, number]> {
  return pieceCells(piece.type, piece.rotation).map(([cx, cy]) => [piece.x + cx, piece.y + cy])
}

/** Den række brikken lander på ved et hårdt drop. */
export function ghostY(state: GameState): number {
  const piece = state.active
  if (!piece) return 0
  let y = piece.y
  while (fits(state, { ...piece, y: y + 1 })) y++
  return y
}

function spawn(state: GameState, type: PieceType, events: GameEvent[]): void {
  const piece: ActivePiece = { type, x: type === 'O' ? 4 : 3, y: 0, rotation: 0 }
  if (!fits(state, piece)) {
    state.active = null
    state.status = 'over'
    events.push({ type: 'gameOver', reason: 'blockOut' })
    return
  }
  // Guideline: brikken dukker op over brættet og falder straks én række ned, hvis der er plads.
  if (fits(state, { ...piece, y: 1 })) piece.y = 1
  state.active = piece
  state.lockTimer = 0
  state.lockResets = 0
  state.lowestY = piece.y
  state.gravityAccumulator = 0
  state.lastMoveRotation = false
  state.lastKick = 0
  events.push({ type: 'spawn', piece: type })
}

function grounded(state: GameState): boolean {
  return !!state.active && !fits(state, { ...state.active, y: state.active.y + 1 })
}

function afterSuccessfulAction(state: GameState, wasGrounded: boolean): void {
  if (wasGrounded && state.lockResets < MAX_LOCK_RESETS) {
    state.lockTimer = 0
    state.lockResets++
  }
}

function shift(state: GameState, dx: number, events: GameEvent[]): boolean {
  const piece = state.active
  if (!piece) return false
  const moved = { ...piece, x: piece.x + dx }
  if (!fits(state, moved)) return false
  const wasGrounded = grounded(state)
  state.active = moved
  state.lastMoveRotation = false
  afterSuccessfulAction(state, wasGrounded)
  events.push({ type: 'move', dx })
  return true
}

function rotate(state: GameState, direction: 1 | -1, events: GameEvent[]): void {
  const piece = state.active
  if (!piece) return
  const to = (((piece.rotation + direction) % 4) + 4) % 4 as Rotation
  const kicks = kicksFor(piece.type, piece.rotation, to)
  for (let index = 0; index < kicks.length; index++) {
    const [dx, dy] = kicks[index]
    const candidate = { ...piece, rotation: to, x: piece.x + dx, y: piece.y + dy }
    if (!fits(state, candidate)) continue
    const wasGrounded = grounded(state)
    state.active = candidate
    state.lastMoveRotation = true
    state.lastKick = index
    afterSuccessfulAction(state, wasGrounded)
    trackLowest(state)
    events.push({ type: 'rotate', rotation: to, kick: index })
    return
  }
}

function trackLowest(state: GameState): void {
  if (state.active && state.active.y > state.lowestY) {
    state.lowestY = state.active.y
    state.lockResets = 0
    // Only real progress downwards earns a fresh lock delay; hopping up with a rotation kick does not.
    state.lockTimer = 0
  }
}

function holdPiece(state: GameState, events: GameEvent[]): void {
  if (!state.active || state.holdUsed) return
  const current = state.active.type
  const next = state.hold ?? takeNext(state)
  state.hold = current
  state.holdUsed = true
  events.push({ type: 'hold', piece: current })
  spawn(state, next, events)
}

function detectTSpin(state: GameState, piece: ActivePiece): TSpin {
  if (piece.type !== 'T' || !state.lastMoveRotation) return 'none'
  const occupied = ([cx, cy]: [number, number]) => {
    const x = piece.x + cx
    const y = piece.y + cy
    return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && state.board[y][x] !== null)
  }
  if (CORNERS.filter(occupied).length < 3) return 'none'
  return FRONT_CORNERS[piece.rotation].every(occupied) || state.lastKick === 4 ? 'full' : 'mini'
}

function lock(state: GameState, events: GameEvent[]): void {
  const piece = state.active
  if (!piece) return
  const tspin = detectTSpin(state, piece)
  const cells = absoluteCells(piece)
  for (const [x, y] of cells) if (y >= 0) state.board[y][x] = piece.type
  state.active = null
  state.stats.pieces++
  events.push({ type: 'lock', piece: piece.type, cells })

  if (cells.every(([, y]) => y < HIDDEN_ROWS)) {
    state.status = 'over'
    events.push({ type: 'gameOver', reason: 'lockOut' })
    return
  }

  const rows: number[] = []
  for (let y = 0; y < ROWS; y++) if (state.board[y].every((cell) => cell !== null)) rows.push(y)
  const count = rows.length
  const level = state.level
  if (count > 0 || tspin !== 'none') {
    const blocks = rows.map((y) => [...state.board[y]])
    for (const y of rows) {
      state.board.splice(y, 1)
      state.board.unshift(new Array<Cell>(COLS).fill(null))
    }
    const difficult = count === 4 || (tspin !== 'none' && count > 0)
    const backToBack = count > 0 && difficult && state.backToBackActive
    if (count > 0) state.backToBackActive = difficult
    const base = tspin === 'full' ? TSPIN_POINTS[count] : tspin === 'mini' ? MINI_POINTS[Math.min(count, 2)] : LINE_POINTS[count]
    state.combo = count > 0 ? state.combo + 1 : -1
    const comboBonus = count > 0 ? 50 * state.combo * level : 0
    const perfect = count > 0 && state.board.every((row) => row.every((cell) => cell === null))
    const points = Math.floor(base * level * (backToBack ? 1.5 : 1)) + comboBonus + (perfect ? PERFECT_POINTS[count] * level : 0)
    state.score += points
    if (count > 0) {
      state.lines += count
      if (count === 4) state.stats.tetrises++
      state.stats.maxCombo = Math.max(state.stats.maxCombo, state.combo)
      if (perfect) state.stats.perfectClears++
    }
    if (tspin !== 'none') state.stats.tspins++
    events.push({ type: 'lineClear', rows, blocks, count, tspin, backToBack, combo: Math.max(0, state.combo), perfect, points })
    const nextLevel = SETTINGS[state.difficulty].startLevel + Math.floor(state.lines / LINES_PER_LEVEL)
    if (nextLevel > state.level) {
      state.level = nextLevel
      events.push({ type: 'levelUp', level: nextLevel })
    }
  } else {
    state.combo = -1
  }

  state.holdUsed = false
  spawn(state, takeNext(state), events)
}

function hardDrop(state: GameState, events: GameEvent[]): void {
  const piece = state.active
  if (!piece) return
  const target = ghostY(state)
  const distance = target - piece.y
  const trail = absoluteCells(piece)
  state.active = { ...piece, y: target }
  if (distance > 0) state.lastMoveRotation = false
  state.score += distance * 2
  events.push({ type: 'hardDrop', piece: piece.type, distance, cells: trail })
  lock(state, events)
}

function applyAction(state: GameState, action: Action, held: GameInput['held'], events: GameEvent[]): void {
  switch (action) {
    case 'left':
    case 'right': {
      const direction = action === 'left' ? -1 : 1
      shift(state, direction, events)
      state.das = { direction, timer: 0, repeat: 0, charged: false }
      if (!(direction === -1 ? held.left : held.right)) state.das.direction = 0
      break
    }
    case 'rotateCW':
      rotate(state, 1, events)
      break
    case 'rotateCCW':
      rotate(state, -1, events)
      break
    case 'hardDrop':
      hardDrop(state, events)
      break
    case 'hold':
      holdPiece(state, events)
      break
  }
}

function updateAutoShift(state: GameState, held: GameInput['held'], seconds: number, events: GameEvent[]): void {
  const das = state.das
  const heldDirection = (direction: -1 | 1) => (direction === -1 ? held.left : held.right)
  if (das.direction !== 0 && !heldDirection(das.direction)) {
    const other = (-das.direction) as -1 | 1
    state.das = heldDirection(other) ? { direction: other, timer: 0, repeat: 0, charged: false } : { direction: 0, timer: 0, repeat: 0, charged: false }
    return
  }
  if (das.direction === 0) return
  das.timer += seconds
  if (!das.charged) {
    if (das.timer + 1e-9 < DAS_SECONDS) return
    das.charged = true
    das.repeat = 0
    shift(state, das.direction, events)
    return
  }
  das.repeat += seconds
  while (das.repeat + 1e-9 >= ARR_SECONDS) {
    das.repeat -= ARR_SECONDS
    if (!shift(state, das.direction, events)) {
      das.repeat = 0
      break
    }
  }
}

function updateGravity(state: GameState, held: GameInput['held'], seconds: number): void {
  const gravity = gravityRowsPerSecond(state.level)
  const rate = held.down ? Math.max(gravity * SOFT_DROP_FACTOR, MIN_SOFT_DROP_ROWS_PER_SECOND) : gravity
  state.gravityAccumulator += rate * seconds
  let moves = 0
  while (state.gravityAccumulator >= 1 && state.active && moves < ROWS) {
    if (grounded(state)) {
      state.gravityAccumulator = 0
      break
    }
    state.active = { ...state.active, y: state.active.y + 1 }
    state.gravityAccumulator -= 1
    state.lastMoveRotation = false
    if (held.down) state.score += 1
    trackLowest(state)
    moves++
  }
}

export function stepGame(state: GameState, input: GameInput, seconds = STEP_SECONDS): GameEvent[] {
  if (state.status === 'over' || !Number.isFinite(seconds) || seconds <= 0) return []
  const events: GameEvent[] = []
  state.time += seconds
  for (const action of input.actions) {
    if (state.status !== 'playing') break
    applyAction(state, action, input.held, events)
  }
  if (state.status !== 'playing' || !state.active) return events

  updateAutoShift(state, input.held, seconds, events)
  updateGravity(state, input.held, seconds)
  if (grounded(state)) {
    state.lockTimer += seconds
    if (state.lockTimer + 1e-9 >= LOCK_DELAY_SECONDS) lock(state, events)
  }
  return events
}
