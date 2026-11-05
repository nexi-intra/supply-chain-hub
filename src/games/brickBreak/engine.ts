import { FIELD, SETTINGS, STEP_SECONDS, BALL_RADIUS, MAX_BALLS, MAX_LIVES, POWER_DURATION_SECONDS, type Difficulty } from './config'
import { buildLevel, type Brick, type BrickKind } from './levels'
import { reflectVelocity, sweepCircleRect } from './physics'
import { createRng, type Rng } from '../chickenInvaders/rng'

export type PowerKind = 'wide' | 'multiball' | 'fireball' | 'laser' | 'magnet' | 'slow' | 'shield' | 'life'
export type GameStatus = 'serve' | 'playing' | 'transition' | 'over'

export interface GameInput {
  left: boolean
  right: boolean
  launch: boolean
  fire: boolean
  pointerX: number | null
  aim?: number
}

export interface Ball {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  attached: boolean
  offset: number
}

export interface Pickup {
  id: number
  kind: PowerKind
  x: number
  y: number
}

export interface Laser {
  id: number
  x: number
  y: number
  vy: number
}

export interface GameStats {
  score: number
  level: number
  destroyed: number
  returns: number
  collected: number
  bestChain: number
  perfectLevels: number
}

export type GameEvent =
  | { type: 'levelStart'; level: number }
  | { type: 'levelClear'; level: number; bonus: number; perfect: boolean }
  | { type: 'launch' }
  | { type: 'paddleHit'; x: number; y: number }
  | { type: 'wallHit'; x: number; y: number }
  | { type: 'brickHit'; id: number; x: number; y: number; kind: BrickKind; colorIndex: number }
  | { type: 'brickBreak'; id: number; x: number; y: number; kind: BrickKind; colorIndex: number; points: number; multiplier: number }
  | { type: 'explosion'; x: number; y: number }
  | { type: 'pickup'; kind: PowerKind; x: number; y: number }
  | { type: 'lifeLost'; lives: number }
  | { type: 'extraLife'; lives: number }
  | { type: 'shieldBlock'; x: number; y: number }
  | { type: 'laser' }
  | { type: 'gameOver' }

export interface GameState {
  difficulty: Difficulty
  rng: Rng
  time: number
  status: GameStatus
  level: number
  lives: number
  score: number
  chain: number
  bestChain: number
  paddle: { x: number; y: number; width: number; height: number; vx: number }
  balls: Ball[]
  bricks: Brick[]
  pickups: Pickup[]
  lasers: Laser[]
  powers: { wideUntil: number; fireballUntil: number; laserUntil: number; magnetUntil: number; slowUntil: number; shield: boolean }
  transitionUntil: number
  levelHitTaken: boolean
  stats: Omit<GameStats, 'score' | 'level' | 'bestChain'>
  nextId: number
  baseBallSpeed: number
  basePaddleWidth: number
  pendingEvents: GameEvent[]
  launchHeld: boolean
  nextLaserAt: number
  guaranteedDropIndex: number
  nextExtraLifeScore: number
  returnsWithoutBreak: number
}

interface CollisionCandidate {
  time: number
  order: number
  type: 'wall' | 'paddle' | 'brick' | 'shield' | 'loss'
  x: number
  y: number
  normalX: number
  normalY: number
  brick?: Brick
}

const PADDLE_HEIGHT = 14
const PADDLE_SPEED = 600
const POINTER_SPEED = 900
const MAX_IMPACTS_PER_STEP = 8
const POSITION_EPSILON = 0.001
const EXTRA_LIFE_SCORE = 25_000
const LASER_INTERVAL_SECONDS = 0.22
const LASER_SPEED = 820
const PICKUP_SPEED = 115
const BRICK_POINTS: Record<BrickKind, number> = { glass: 100, armored: 220, crystal: 500, reactor: 150 }
const GUARANTEED_POWERS: PowerKind[] = ['wide', 'multiball', 'laser', 'fireball', 'magnet', 'slow', 'shield', 'life']
const STALL_RETURNS = 4
const STALL_DEFLECTION = 0.22

export function createGame(difficulty: Difficulty, options: { seed?: number } = {}): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32)
  const basePaddleWidth = SETTINGS[difficulty].paddleWidth
  const state: GameState = {
    difficulty,
    rng: createRng(seed),
    time: 0,
    status: 'serve',
    level: 0,
    lives: 3,
    score: 0,
    chain: 0,
    bestChain: 0,
    paddle: { x: FIELD.width / 2, y: 548, width: basePaddleWidth, height: PADDLE_HEIGHT, vx: 0 },
    balls: [],
    bricks: [],
    pickups: [],
    lasers: [],
    powers: { wideUntil: 0, fireballUntil: 0, laserUntil: 0, magnetUntil: 0, slowUntil: 0, shield: false },
    transitionUntil: 0,
    levelHitTaken: false,
    stats: { destroyed: 0, returns: 0, collected: 0, perfectLevels: 0 },
    nextId: 1,
    baseBallSpeed: SETTINGS[difficulty].ballSpeed,
    basePaddleWidth,
    pendingEvents: [],
    launchHeld: false,
    nextLaserAt: 0,
    guaranteedDropIndex: 0,
    nextExtraLifeScore: EXTRA_LIFE_SCORE,
    returnsWithoutBreak: 0,
  }
  startLevel(state, 1)
  return state
}

export function startLevel(state: GameState, level: number): void {
  state.level = Math.max(1, Math.floor(level))
  state.baseBallSpeed = Math.min(880, SETTINGS[state.difficulty].ballSpeed + (state.level - 1) * 20)
  state.bricks = buildLevel(state.level, state.difficulty)
  state.status = 'serve'
  state.transitionUntil = 0
  state.levelHitTaken = false
  state.paddle.width = state.powers.wideUntil > state.time ? state.basePaddleWidth * 1.45 : state.basePaddleWidth
  state.paddle.x = clamp(state.paddle.x, state.paddle.width / 2, FIELD.width - state.paddle.width / 2)
  state.balls = [createAttachedBall(state, 0)]
  state.pickups = []
  state.lasers = []
  state.pendingEvents.push({ type: 'levelStart', level: state.level })
}

export function stepGame(state: GameState, input: GameInput, seconds = STEP_SECONDS): GameEvent[] {
  if (state.status === 'over' || seconds <= 0) return []

  state.time += seconds
  const events = state.pendingEvents.splice(0)

  if (state.status === 'transition') {
    if (state.time >= state.transitionUntil) {
      clearPowers(state)
      startLevel(state, state.level + 1)
      events.push(...state.pendingEvents.splice(0))
    }
    state.launchHeld = input.launch
    return events
  }

  updatePaddle(state, input, seconds)
  updateAttachedBalls(state)
  const launchPressed = input.launch && !state.launchHeld
  state.launchHeld = input.launch
  if (launchPressed && state.balls.some((ball) => ball.attached)) launchAttachedBalls(state, input.aim, events)
  if (state.status === 'serve') return events

  updatePickups(state, events, seconds)
  if (state.status !== 'playing') return events
  updateLaserFire(state, input.fire, events)
  updateLasers(state, events, seconds)
  if (state.status !== 'playing') return events

  const slowFactor = state.powers.slowUntil > state.time ? 0.7 : 1
  for (const ball of [...state.balls]) {
    if (state.status !== 'playing' || ball.attached) continue
    moveBall(state, ball, seconds, slowFactor, events)
  }

  state.balls = state.balls.filter((ball) => ball.attached || ball.y - ball.radius <= FIELD.height + 1)
  if (state.status === 'playing' && state.balls.length === 0) loseLife(state, events)
  return events
}

export function getStats(state: GameState): GameStats {
  return {
    score: state.score,
    level: state.level,
    destroyed: state.stats.destroyed,
    returns: state.stats.returns,
    collected: state.stats.collected,
    bestChain: state.bestChain,
    perfectLevels: state.stats.perfectLevels,
  }
}

export function spawnPickup(state: GameState, kind: PowerKind, x: number, y: number): Pickup {
  const pickup = { id: state.nextId++, kind, x, y }
  state.pickups.push(pickup)
  return pickup
}

export function applyPower(state: GameState, kind: PowerKind, events: GameEvent[] = []): void {
  const until = state.time + POWER_DURATION_SECONDS
  if (kind === 'wide') {
    state.powers.wideUntil = until
    state.paddle.width = state.basePaddleWidth * 1.45
    state.paddle.x = clamp(state.paddle.x, state.paddle.width / 2, FIELD.width - state.paddle.width / 2)
  } else if (kind === 'multiball') {
    splitBalls(state)
  } else if (kind === 'fireball') {
    state.powers.fireballUntil = state.time + 8
  } else if (kind === 'laser') {
    state.powers.laserUntil = until
    state.nextLaserAt = Math.min(state.nextLaserAt, state.time)
  } else if (kind === 'magnet') {
    state.powers.magnetUntil = state.time + 8
  } else if (kind === 'slow') {
    state.powers.slowUntil = state.time + 8
  } else if (kind === 'shield') {
    state.powers.shield = true
  } else if (kind === 'life') {
    if (state.lives < MAX_LIVES) {
      state.lives++
      events.push({ type: 'extraLife', lives: state.lives })
    } else {
      addScore(state, 500, events)
    }
  }
}

function createAttachedBall(state: GameState, offset: number): Ball {
  return {
    id: state.nextId++,
    x: state.paddle.x + offset,
    y: state.paddle.y - state.paddle.height / 2 - BALL_RADIUS - 1,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
    attached: true,
    offset,
  }
}

function updatePaddle(state: GameState, input: GameInput, seconds: number): void {
  const halfWidth = state.paddle.width / 2
  const previousX = state.paddle.x
  if (input.pointerX !== null) {
    const targetX = clamp(input.pointerX, halfWidth, FIELD.width - halfWidth)
    state.paddle.x += clamp(targetX - state.paddle.x, -POINTER_SPEED * seconds, POINTER_SPEED * seconds)
  } else {
    const direction = Number(input.right) - Number(input.left)
    state.paddle.x += direction * PADDLE_SPEED * seconds
  }
  state.paddle.x = clamp(state.paddle.x, halfWidth, FIELD.width - halfWidth)
  state.paddle.vx = (state.paddle.x - previousX) / seconds
  state.paddle.width = state.powers.wideUntil > state.time ? state.basePaddleWidth * 1.45 : state.basePaddleWidth
}

function updateAttachedBalls(state: GameState): void {
  for (const ball of state.balls) {
    if (!ball.attached) continue
    ball.x = clamp(state.paddle.x + ball.offset, ball.radius, FIELD.width - ball.radius)
    ball.y = state.paddle.y - state.paddle.height / 2 - ball.radius - 1
  }
}

function launchAttachedBalls(state: GameState, aim: number | undefined, events: GameEvent[]): void {
  const angle = clamp(aim ?? 0.25, -Math.acos(0.28), Math.acos(0.28))
  for (const ball of state.balls) {
    if (!ball.attached) continue
    ball.attached = false
    ball.vx = Math.sin(angle) * state.baseBallSpeed
    ball.vy = -Math.cos(angle) * state.baseBallSpeed
    ball.offset = ball.x - state.paddle.x
  }
  state.status = 'playing'
  events.push({ type: 'launch' })
}

function moveBall(state: GameState, ball: Ball, seconds: number, speedFactor: number, events: GameEvent[]): void {
  let remaining = seconds
  let impactCount = 0

  while (remaining > 1e-8 && impactCount < MAX_IMPACTS_PER_STEP && state.status === 'playing') {
    const velocityX = ball.vx * speedFactor
    const velocityY = ball.vy * speedFactor
    const candidates: CollisionCandidate[] = []
    addBoundaryCandidates(ball, velocityX, velocityY, remaining, candidates)

    if (velocityY > 0) {
      const paddleHit = sweepCircleRect(
        { x: ball.x, y: ball.y, vx: velocityX, vy: velocityY, radius: ball.radius },
        { x: state.paddle.x - state.paddle.width / 2, y: state.paddle.y - state.paddle.height / 2, width: state.paddle.width, height: state.paddle.height },
        remaining,
      )
      if (paddleHit && paddleHit.normal.y < -0.05 && ball.y <= state.paddle.y - state.paddle.height / 2 + ball.radius + POSITION_EPSILON) {
        candidates.push({ time: paddleHit.time, order: 1, type: 'paddle', x: paddleHit.x, y: paddleHit.y, normalX: paddleHit.normal.x, normalY: paddleHit.normal.y })
      }

      if (state.powers.shield) {
        const shieldY = FIELD.height - ball.radius - 12
        const time = ball.y >= shieldY ? 0 : (shieldY - ball.y) / velocityY
        if (time >= 0 && time <= remaining) candidates.push({ time, order: 2, type: 'shield', x: ball.x + velocityX * time, y: shieldY, normalX: 0, normalY: -1 })
      }
    }

    for (const brick of state.bricks) {
      if (brick.dead) continue
      const hit = sweepCircleRect(
        { x: ball.x, y: ball.y, vx: velocityX, vy: velocityY, radius: ball.radius },
        brick,
        remaining,
      )
      if (hit) candidates.push({ time: hit.time, order: 10 + brick.id, type: 'brick', x: hit.x, y: hit.y, normalX: hit.normal.x, normalY: hit.normal.y, brick })
    }

    candidates.sort((first, second) => {
      if (Math.abs(first.time - second.time) <= 1e-9) return first.order - second.order
      return first.time - second.time
    })
    const hit = candidates[0]
    if (!hit) {
      ball.x += velocityX * remaining
      ball.y += velocityY * remaining
      remaining = 0
      break
    }

    ball.x = hit.x
    ball.y = hit.y
    remaining = Math.max(0, remaining - hit.time)
    impactCount++

    if (hit.type === 'loss') {
      ball.y = FIELD.height + ball.radius + 1
      state.balls = state.balls.filter((candidate) => candidate.id !== ball.id)
      break
    }
    if (hit.type === 'wall') {
      const reflected = reflectVelocity(ball.vx, ball.vy, { x: hit.normalX, y: hit.normalY })
      ball.vx = reflected.vx
      ball.vy = reflected.vy
      ball.x += hit.normalX * POSITION_EPSILON
      ball.y += hit.normalY * POSITION_EPSILON
      events.push({ type: 'wallHit', x: ball.x, y: ball.y })
    } else if (hit.type === 'paddle') {
      state.stats.returns++
      state.chain = 0
      if (state.powers.magnetUntil > state.time) {
        ball.attached = true
        ball.offset = clamp(ball.x - state.paddle.x, -state.paddle.width / 2, state.paddle.width / 2)
        ball.vx = 0
        ball.vy = 0
      } else {
        bounceFromPaddle(state, ball)
      }
      ball.x += hit.normalX * POSITION_EPSILON
      ball.y += hit.normalY * POSITION_EPSILON
      events.push({ type: 'paddleHit', x: ball.x, y: ball.y })
    } else if (hit.type === 'shield') {
      state.powers.shield = false
      ball.vy = -Math.abs(ball.vy)
      ball.y += hit.normalY * POSITION_EPSILON
      events.push({ type: 'shieldBlock', x: ball.x, y: ball.y })
    } else if (hit.type === 'brick' && hit.brick) {
      ball.x += hit.normalX * POSITION_EPSILON
      ball.y += hit.normalY * POSITION_EPSILON
      events.push({ type: 'brickHit', id: hit.brick.id, x: ball.x, y: ball.y, kind: hit.brick.kind, colorIndex: hit.brick.colorIndex })
      damageBrick(state, hit.brick, state.powers.fireballUntil > state.time ? hit.brick.hp : 1, events)
      if (state.powers.fireballUntil <= state.time) {
        const reflected = reflectVelocity(ball.vx, ball.vy, { x: hit.normalX, y: hit.normalY })
        ball.vx = reflected.vx
        ball.vy = reflected.vy
      } else {
        ball.x += Math.sign(velocityX) * POSITION_EPSILON
        ball.y += Math.sign(velocityY) * POSITION_EPSILON
      }
    }
  }

  if (remaining > 1e-8 && state.status === 'playing' && impactCount >= MAX_IMPACTS_PER_STEP) {
    ball.x += ball.vx * speedFactor * remaining
    ball.y += ball.vy * speedFactor * remaining
  }
}

function addBoundaryCandidates(ball: Ball, velocityX: number, velocityY: number, remaining: number, candidates: CollisionCandidate[]): void {
  if (velocityX < 0) {
    const time = ball.x <= ball.radius ? 0 : (ball.radius - ball.x) / velocityX
    if (time >= 0 && time <= remaining) candidates.push({ time, order: 0, type: 'wall', x: ball.radius, y: ball.y + velocityY * time, normalX: 1, normalY: 0 })
  } else if (velocityX > 0) {
    const right = FIELD.width - ball.radius
    const time = ball.x >= right ? 0 : (right - ball.x) / velocityX
    if (time >= 0 && time <= remaining) candidates.push({ time, order: 0, type: 'wall', x: right, y: ball.y + velocityY * time, normalX: -1, normalY: 0 })
  }
  if (velocityY < 0) {
    const time = ball.y <= ball.radius ? 0 : (ball.radius - ball.y) / velocityY
    if (time >= 0 && time <= remaining) candidates.push({ time, order: 0, type: 'wall', x: ball.x + velocityX * time, y: ball.radius, normalX: 0, normalY: 1 })
  } else if (velocityY > 0) {
    const lossY = FIELD.height + ball.radius
    const time = ball.y >= lossY ? 0 : (lossY - ball.y) / velocityY
    if (time >= 0 && time <= remaining) candidates.push({ time, order: 100_000, type: 'loss', x: ball.x + velocityX * time, y: lossY, normalX: 0, normalY: 0 })
  }
}

function bounceFromPaddle(state: GameState, ball: Ball): void {
  const speed = Math.hypot(ball.vx, ball.vy) || state.baseBallSpeed
  const offset = clamp((ball.x - state.paddle.x) / (state.paddle.width / 2), -1, 1)
  const paddleInfluence = clamp(state.paddle.vx / POINTER_SPEED, -1, 1) * (8 * Math.PI / 180)
  state.returnsWithoutBreak++
  // Bryder evige lodrette sløjfer, hvor bolden aldrig rammer en rude.
  const stallKick = state.returnsWithoutBreak > STALL_RETURNS ? (state.rng() < 0.5 ? -1 : 1) * STALL_DEFLECTION : 0
  const angle = clamp(offset * (64 * Math.PI / 180) + paddleInfluence + stallKick, -70 * Math.PI / 180, 70 * Math.PI / 180)
  ball.vx = Math.sin(angle) * speed
  ball.vy = -Math.cos(angle) * speed
}

function damageBrick(state: GameState, firstBrick: Brick, firstDamage: number, events: GameEvent[]): void {
  const queue: Array<{ brick: Brick; damage: number }> = [{ brick: firstBrick, damage: firstDamage }]
  const explodedReactors = new Set<number>()
  let cursor = 0

  while (cursor < queue.length) {
    const entry = queue[cursor++]
    const brick = entry.brick
    if (brick.dead) continue
    brick.hp = Math.max(0, brick.hp - entry.damage)
    if (brick.hp > 0) continue

    brick.dead = true
    state.returnsWithoutBreak = 0
    const multiplier = Math.min(5, 1 + Math.floor(state.chain / 5))
    const points = BRICK_POINTS[brick.kind]
    state.chain++
    state.bestChain = Math.max(state.bestChain, state.chain)
    state.stats.destroyed++
    addScore(state, points * multiplier, events)
    events.push({ type: 'brickBreak', id: brick.id, x: brick.x + brick.width / 2, y: brick.y + brick.height / 2, kind: brick.kind, colorIndex: brick.colorIndex, points, multiplier })
    maybeDropPickup(state, brick, events)

    if (brick.kind === 'reactor' && !explodedReactors.has(brick.id)) {
      explodedReactors.add(brick.id)
      const centerX = brick.x + brick.width / 2
      const centerY = brick.y + brick.height / 2
      events.push({ type: 'explosion', x: centerX, y: centerY })
      for (const neighbor of state.bricks) {
        if (neighbor.dead) continue
        const neighborX = neighbor.x + neighbor.width / 2
        const neighborY = neighbor.y + neighbor.height / 2
        if (Math.hypot(neighborX - centerX, neighborY - centerY) <= 115) queue.push({ brick: neighbor, damage: 1 })
      }
    }
  }

  if (state.status === 'playing' && state.bricks.every((brick) => brick.dead)) clearLevel(state, events)
}

function maybeDropPickup(state: GameState, brick: Brick, events: GameEvent[]): void {
  let kind: PowerKind | null = null
  if (state.stats.destroyed % 12 === 0) {
    kind = GUARANTEED_POWERS[state.guaranteedDropIndex % GUARANTEED_POWERS.length]
    state.guaranteedDropIndex++
  } else if (state.rng() < 0.2) {
    kind = GUARANTEED_POWERS[Math.floor(state.rng() * GUARANTEED_POWERS.length)]
  }
  if (kind) spawnPickup(state, kind, brick.x + brick.width / 2, brick.y + brick.height / 2)
}

function clearLevel(state: GameState, events: GameEvent[]): void {
  const perfect = !state.levelHitTaken
  const bonus = state.level * 1000 + (perfect ? 1000 : 0)
  state.stats.perfectLevels += Number(perfect)
  state.status = 'transition'
  state.transitionUntil = state.time + 1.6
  state.pickups = []
  state.lasers = []
  addScore(state, bonus, events)
  events.push({ type: 'levelClear', level: state.level, bonus, perfect })
}

function addScore(state: GameState, points: number, events: GameEvent[]): void {
  state.score += points
  while (state.score >= state.nextExtraLifeScore) {
    state.nextExtraLifeScore += EXTRA_LIFE_SCORE
    if (state.lives < MAX_LIVES) {
      state.lives++
      events.push({ type: 'extraLife', lives: state.lives })
    }
  }
}

function loseLife(state: GameState, events: GameEvent[]): void {
  state.lives = Math.max(0, state.lives - 1)
  state.levelHitTaken = true
  state.chain = 0
  state.powers = { wideUntil: 0, fireballUntil: 0, laserUntil: 0, magnetUntil: 0, slowUntil: 0, shield: false }
  state.paddle.width = state.basePaddleWidth
  state.pickups = []
  state.lasers = []
  events.push({ type: 'lifeLost', lives: state.lives })
  if (state.lives === 0) {
    state.balls = []
    state.status = 'over'
    events.push({ type: 'gameOver' })
  } else {
    state.status = 'serve'
    state.balls = [createAttachedBall(state, 0)]
  }
}

function clearPowers(state: GameState): void {
  state.powers = { wideUntil: 0, fireballUntil: 0, laserUntil: 0, magnetUntil: 0, slowUntil: 0, shield: false }
  state.paddle.width = state.basePaddleWidth
}

function splitBalls(state: GameState): void {
  const originals = [...state.balls]
  if (originals.length === 0) state.balls.push(createAttachedBall(state, 0))
  const sources = originals.length ? originals : [...state.balls]
  for (const source of sources) {
    for (const angleOffset of [-25, 25]) {
      if (state.balls.length >= MAX_BALLS) return
      if (source.attached) {
        const offset = state.balls.length % 2 === 0 ? 16 : -16
        state.balls.push(createAttachedBall(state, offset))
      } else {
        const speed = Math.hypot(source.vx, source.vy)
        const angle = Math.atan2(source.vx, -source.vy) + angleOffset * Math.PI / 180
        state.balls.push({
          id: state.nextId++,
          x: source.x,
          y: source.y,
          vx: Math.sin(angle) * speed,
          vy: -Math.cos(angle) * speed,
          radius: source.radius,
          attached: false,
          offset: source.offset,
        })
      }
    }
  }
}

function updatePickups(state: GameState, events: GameEvent[], seconds: number): void {
  for (const pickup of [...state.pickups]) {
    pickup.y += PICKUP_SPEED * seconds
    const paddleTop = state.paddle.y - state.paddle.height / 2
    const caught = pickup.y >= paddleTop - 14 && pickup.y <= state.paddle.y + 10 && Math.abs(pickup.x - state.paddle.x) <= state.paddle.width / 2 + 14
    if (caught) {
      state.pickups = state.pickups.filter((candidate) => candidate.id !== pickup.id)
      state.stats.collected++
      events.push({ type: 'pickup', kind: pickup.kind, x: pickup.x, y: pickup.y })
      applyPower(state, pickup.kind, events)
    } else if (pickup.y > FIELD.height + 16) {
      state.pickups = state.pickups.filter((candidate) => candidate.id !== pickup.id)
    }
  }
}

function updateLaserFire(state: GameState, fire: boolean, events: GameEvent[]): void {
  if (!fire || state.powers.laserUntil <= state.time) return
  let shots = 0
  while (state.time >= state.nextLaserAt && shots < 8) {
    const spread = state.paddle.width * 0.24
    state.lasers.push({ id: state.nextId++, x: state.paddle.x - spread, y: state.paddle.y - state.paddle.height / 2, vy: -LASER_SPEED })
    state.lasers.push({ id: state.nextId++, x: state.paddle.x + spread, y: state.paddle.y - state.paddle.height / 2, vy: -LASER_SPEED })
    events.push({ type: 'laser' })
    state.nextLaserAt = Math.max(state.nextLaserAt, state.time) + LASER_INTERVAL_SECONDS
    shots++
  }
}

function updateLasers(state: GameState, events: GameEvent[], seconds: number): void {
  for (const laser of [...state.lasers]) {
    const previousY = laser.y
    laser.y += laser.vy * seconds
    let hitBrick: Brick | undefined
    for (const brick of state.bricks) {
      if (brick.dead || laser.x < brick.x || laser.x > brick.x + brick.width) continue
      if (previousY >= brick.y + brick.height && laser.y <= brick.y + brick.height) {
        hitBrick = brick
        break
      }
    }
    if (hitBrick) {
      state.lasers = state.lasers.filter((candidate) => candidate.id !== laser.id)
      events.push({ type: 'brickHit', id: hitBrick.id, x: laser.x, y: hitBrick.y + hitBrick.height, kind: hitBrick.kind, colorIndex: hitBrick.colorIndex })
      damageBrick(state, hitBrick, 1, events)
    } else if (laser.y < -8) {
      state.lasers = state.lasers.filter((candidate) => candidate.id !== laser.id)
    }
    if (state.status !== 'playing') return
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}