import { describe, expect, it } from 'vitest'
import { BALL_RADIUS, FIELD, MAX_LIVES, SETTINGS, STEP_SECONDS } from './config'
import { applyPower, createGame, getStats, spawnPickup, startLevel, stepGame, type GameEvent, type GameInput, type GameState } from './engine'

const idle: GameInput = { left: false, right: false, launch: false, fire: false, pointerX: null }

function flyingState(seed = 1): GameState {
  const state = createGame('medium', { seed })
  state.status = 'playing'
  state.bricks = []
  state.balls = [{ id: state.nextId++, x: 480, y: 300, vx: 0, vy: -SETTINGS.medium.ballSpeed, radius: BALL_RADIUS, attached: false, offset: 0 }]
  return state
}

function eventOfType<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)
}

describe('createGame and input', () => {
  it('starts with three lives, one attached ball, and an explicit serve state', () => {
    const state = createGame('medium', { seed: 2 })

    expect(state.status).toBe('serve')
    expect(state.lives).toBe(MAX_LIVES - 2)
    expect(state.balls).toHaveLength(1)
    expect(state.balls[0].attached).toBe(true)
  })

  it('does not launch until the launch input is pressed', () => {
    const state = createGame('easy', { seed: 3 })
    stepGame(state, idle)

    expect(state.status).toBe('serve')
    expect(state.balls[0].attached).toBe(true)
  })

  it('launches at configured speed with a vertical component', () => {
    const state = createGame('easy', { seed: 4 })
    const events = stepGame(state, { ...idle, launch: true })
    const ball = state.balls[0]

    expect(eventOfType(events, 'launch')).toHaveLength(1)
    expect(state.status).toBe('playing')
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(SETTINGS.easy.ballSpeed)
    expect(Math.abs(ball.vy) / SETTINGS.easy.ballSpeed).toBeGreaterThanOrEqual(0.28)
  })

  it('does not retrigger a held launch input', () => {
    const state = createGame('medium', { seed: 5 })
    stepGame(state, { ...idle, launch: true })
    const events = stepGame(state, { ...idle, launch: true })

    expect(eventOfType(events, 'launch')).toHaveLength(0)
  })

  it('clamps pointer steering and limits paddle speed', () => {
    const state = createGame('medium', { seed: 6 })
    stepGame(state, { ...idle, pointerX: FIELD.width + 500 }, 0.1)

    expect(state.paddle.x).toBe(570)
    expect(state.paddle.vx).toBe(900)
  })
})

describe('ball collisions', () => {
  it('reflects from a side wall without changing speed', () => {
    const state = flyingState()
    state.balls[0].x = BALL_RADIUS + 1
    state.balls[0].y = 200
    state.balls[0].vx = -100
    state.balls[0].vy = 0
    const events = stepGame(state, idle, 0.02)

    expect(eventOfType(events, 'wallHit')).toHaveLength(1)
    expect(state.balls[0].vx).toBeGreaterThan(0)
    expect(Math.hypot(state.balls[0].vx, state.balls[0].vy)).toBeCloseTo(100)
  })

  it('hits a thin brick even when the ball crosses it in one step', () => {
    const state = flyingState()
    state.bricks = [{ id: 99, x: 450, y: 100, width: 60, height: 2, kind: 'glass', hp: 1, maxHp: 1, colorIndex: 0, dead: false }]
    state.balls[0].y = 120
    state.balls[0].vy = -900
    const events = stepGame(state, idle, 0.03)

    expect(eventOfType(events, 'brickBreak')).toHaveLength(1)
    expect(state.bricks[0].dead).toBe(true)
  })

  it('bounces descending balls from the paddle top', () => {
    const state = flyingState()
    state.balls[0].x = state.paddle.x
    state.balls[0].y = state.paddle.y - state.paddle.height / 2 - BALL_RADIUS - 2
    state.balls[0].vx = 0
    state.balls[0].vy = 500
    const events = stepGame(state, idle, 0.02)

    expect(eventOfType(events, 'paddleHit')).toHaveLength(1)
    expect(state.balls[0].vy).toBeLessThan(0)
  })

  it('breaks a vertical loop by deflecting after four returns without a broken pane', () => {
    const state = flyingState()
    const horizontal: number[] = []
    for (let bounce = 0; bounce < 6; bounce++) {
      state.balls[0].x = state.paddle.x
      state.balls[0].y = state.paddle.y - state.paddle.height / 2 - BALL_RADIUS - 2
      state.balls[0].vx = 0
      state.balls[0].vy = 500
      stepGame(state, idle, 0.02)
      horizontal.push(Math.abs(state.balls[0].vx) / Math.hypot(state.balls[0].vx, state.balls[0].vy))
    }
    expect(horizontal.slice(0, 4).every((ratio) => ratio < 0.01)).toBe(true)
    expect(horizontal[4]).toBeGreaterThan(0.15)
  })

  it('does not catch an ascending ball from below the paddle', () => {
    const state = flyingState()
    state.balls[0].x = state.paddle.x
    state.balls[0].y = state.paddle.y + state.paddle.height / 2 + 3
    state.balls[0].vx = 0
    state.balls[0].vy = -500
    const events = stepGame(state, idle, 0.02)

    expect(eventOfType(events, 'paddleHit')).toHaveLength(0)
    expect(state.balls[0].vy).toBe(-500)
  })
})

describe('scoring and level flow', () => {
  it('decrements a multi-hit brick once per ball contact', () => {
    const state = flyingState()
    state.bricks = [{ id: 30, x: 450, y: 100, width: 60, height: 20, kind: 'armored', hp: 3, maxHp: 3, colorIndex: 1, dead: false }]
    state.balls[0].x = 480
    state.balls[0].y = 90
    state.balls[0].vy = 300
    const events = stepGame(state, idle, 0.05)

    expect(eventOfType(events, 'brickHit')).toHaveLength(1)
    expect(state.bricks[0].hp).toBe(2)
  })

  it('awards the current chain multiplier and grows chain on breaks', () => {
    const state = flyingState()
    state.chain = 5
    state.bricks = [{ id: 31, x: 450, y: 100, width: 60, height: 20, kind: 'glass', hp: 1, maxHp: 1, colorIndex: 2, dead: false }]
    state.balls[0].x = 480
    state.balls[0].y = 90
    state.balls[0].vy = 300
    const events = stepGame(state, idle, 0.05)

    expect(eventOfType(events, 'brickBreak')[0]).toMatchObject({ points: 100, multiplier: 2 })
    expect(state.score).toBeGreaterThanOrEqual(200)
    expect(state.chain).toBe(6)
    expect(state.bestChain).toBe(6)
  })

  it('caps the chain multiplier at five', () => {
    const state = flyingState()
    state.chain = 100
    state.bricks = [{ id: 32, x: 450, y: 100, width: 60, height: 20, kind: 'glass', hp: 1, maxHp: 1, colorIndex: 2, dead: false }]
    state.balls[0].x = 480
    state.balls[0].y = 90
    state.balls[0].vy = 300
    const events = stepGame(state, idle, 0.05)

    expect(eventOfType(events, 'brickBreak')[0].multiplier).toBe(5)
  })

  it('resets the chain when the paddle returns a ball', () => {
    const state = flyingState()
    state.chain = 12
    state.balls[0].x = state.paddle.x
    state.balls[0].y = state.paddle.y - state.paddle.height / 2 - BALL_RADIUS - 2
    state.balls[0].vy = 500
    const events = stepGame(state, idle, 0.02)

    expect(eventOfType(events, 'paddleHit')).toHaveLength(1)
    expect(state.chain).toBe(0)
    expect(state.stats.returns).toBe(1)
  })

  it('clears projectiles and starts the next level only after the transition', () => {
    const state = flyingState()
    state.bricks = [{ id: 33, x: 450, y: 100, width: 60, height: 20, kind: 'glass', hp: 1, maxHp: 1, colorIndex: 0, dead: false }]
    state.balls[0].x = 480
    state.balls[0].y = 90
    state.balls[0].vy = 300
    state.lasers.push({ id: state.nextId++, x: 10, y: 10, vy: -820 })
    state.pickups.push({ id: state.nextId++, kind: 'life', x: 20, y: 20 })
    const clearEvents = stepGame(state, idle, 0.05)

    expect(eventOfType(clearEvents, 'levelClear')).toHaveLength(1)
    expect(state.status).toBe('transition')
    expect(state.level).toBe(1)
    expect(state.lasers).toHaveLength(0)
    expect(state.pickups).toHaveLength(0)
    const nextEvents = stepGame(state, idle, 1.7)
    expect(eventOfType(nextEvents, 'levelStart')).toEqual([{ type: 'levelStart', level: 2 }])
    expect(state.status).toBe('serve')
    expect(state.level).toBe(2)
    expect(state.balls).toHaveLength(1)
  })

  it('awards the perfect-level bonus only when no life was lost', () => {
    const clear = (hitTaken: boolean) => {
      const state = flyingState()
      state.levelHitTaken = hitTaken
      state.bricks = [{ id: 34, x: 450, y: 100, width: 60, height: 20, kind: 'glass', hp: 1, maxHp: 1, colorIndex: 0, dead: false }]
      state.balls[0].x = 480
      state.balls[0].y = 90
      state.balls[0].vy = 300
      return eventOfType(stepGame(state, idle, 0.05), 'levelClear')[0]
    }

    expect(clear(false)).toMatchObject({ bonus: 2000, perfect: true })
    expect(clear(true)).toMatchObject({ bonus: 1000, perfect: false })
  })

  it('awards multiple extra lives across score thresholds in one clear', () => {
    const state = flyingState()
    state.level = 50
    state.lives = 3
    state.bricks = [{ id: 35, x: 450, y: 100, width: 60, height: 20, kind: 'glass', hp: 1, maxHp: 1, colorIndex: 0, dead: false }]
    state.balls[0].x = 480
    state.balls[0].y = 90
    state.balls[0].vy = 300
    const events = stepGame(state, idle, 0.05)

    expect(eventOfType(events, 'extraLife')).toHaveLength(2)
    expect(state.lives).toBe(MAX_LIVES)
    expect(state.nextExtraLifeScore).toBe(75_000)
  })
})

describe('powers and projectiles', () => {
  it('refreshes the wide paddle timer without stacking width', () => {
    const state = flyingState()
    state.time = 2
    applyPower(state, 'wide')
    state.time = 5
    applyPower(state, 'wide')

    expect(state.paddle.width).toBeCloseTo(state.basePaddleWidth * 1.45)
    expect(state.powers.wideUntil).toBe(15)
  })

  it('splits into at most three balls and preserves speed', () => {
    const state = flyingState()
    applyPower(state, 'multiball')

    expect(state.balls).toHaveLength(3)
    for (const ball of state.balls) expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(SETTINGS.medium.ballSpeed)
  })

  it('lets fireball destroy and pierce multiple bricks in one step', () => {
    const state = flyingState()
    state.bricks = [100, 50].map((brickY, index) => ({ id: 40 + index, x: 450, y: brickY, width: 60, height: 20, kind: 'glass' as const, hp: 1, maxHp: 1, colorIndex: 0, dead: false }))
    state.balls[0].x = 480
    state.balls[0].y = 150
    state.balls[0].vy = -500
    applyPower(state, 'fireball')
    const events = stepGame(state, idle, 0.25)

    expect(eventOfType(events, 'brickBreak')).toHaveLength(2)
    expect(state.bricks.every((brick) => brick.dead)).toBe(true)
    expect(state.balls[0].vy).toBeLessThan(0)
  })

  it('applies slow movement without repeatedly shrinking base velocity', () => {
    const state = flyingState()
    state.balls[0].vx = 100
    state.balls[0].vy = -200
    applyPower(state, 'slow')
    const initialX = state.balls[0].x
    stepGame(state, idle, 0.1)
    const firstTravel = state.balls[0].x - initialX
    stepGame(state, idle, 0.1)
    const secondTravel = state.balls[0].x - initialX - firstTravel

    expect(firstTravel).toBeCloseTo(7)
    expect(secondTravel).toBeCloseTo(7)
    expect(state.balls[0].vx).toBe(100)
  })

  it('fires twin lasers at a fixed interval while held', () => {
    const state = flyingState()
    state.powers.laserUntil = 10
    const firstEvents = stepGame(state, { ...idle, fire: true })
    const secondEvents = stepGame(state, { ...idle, fire: true })

    expect(eventOfType(firstEvents, 'laser')).toHaveLength(1)
    expect(state.lasers.length).toBeGreaterThanOrEqual(2)
    expect(eventOfType(secondEvents, 'laser')).toHaveLength(0)
  })

  it('consumes each laser projectile after one hit', () => {
    const state = flyingState()
    state.bricks = [{ id: 50, x: 450, y: 100, width: 60, height: 20, kind: 'armored', hp: 3, maxHp: 3, colorIndex: 0, dead: false }]
    state.lasers = [{ id: 51, x: 480, y: 130, vy: -820 }]
    stepGame(state, idle, 0.02)
    stepGame(state, idle, 0.02)

    expect(state.bricks[0].hp).toBe(2)
    expect(state.lasers).toHaveLength(0)
  })

  it('catches descending balls with magnet and launches held balls again', () => {
    const state = flyingState()
    applyPower(state, 'magnet')
    state.balls[0].x = state.paddle.x
    state.balls[0].y = state.paddle.y - 20
    state.balls[0].vy = 300
    stepGame(state, idle, 0.03)

    expect(state.balls[0].attached).toBe(true)
    const launchEvents = stepGame(state, { ...idle, launch: true })
    expect(eventOfType(launchEvents, 'launch')).toHaveLength(1)
    expect(state.balls[0].attached).toBe(false)
    expect(state.status).toBe('playing')
  })

  it('collects a life pickup and converts it to score at the life cap', () => {
    const state = flyingState()
    state.lives = MAX_LIVES
    spawnPickup(state, 'life', state.paddle.x, state.paddle.y - 10)
    const events = stepGame(state, idle, 0.01)

    expect(eventOfType(events, 'pickup')).toHaveLength(1)
    expect(state.stats.collected).toBe(1)
    expect(state.score).toBe(500)
    expect(state.lives).toBe(MAX_LIVES)
  })

  it('spawns the rotating guaranteed power every twelfth brick destruction', () => {
    const state = flyingState()
    state.stats.destroyed = 11
    state.bricks = [
      { id: 60, x: 450, y: 100, width: 60, height: 20, kind: 'glass', hp: 1, maxHp: 1, colorIndex: 0, dead: false },
      { id: 61, x: 520, y: 100, width: 60, height: 20, kind: 'glass', hp: 1, maxHp: 1, colorIndex: 1, dead: false },
    ]
    state.balls[0].x = 480
    state.balls[0].y = 90
    state.balls[0].vy = 300
    stepGame(state, idle, 0.05)

    expect(state.pickups[0]?.kind).toBe('wide')
  })
})

describe('damage and life safety', () => {
  it('chains reactor explosions and respects brick health limits', () => {
    const state = flyingState()
    state.bricks = [
      { id: 70, x: 420, y: 100, width: 52, height: 20, kind: 'reactor', hp: 1, maxHp: 1, colorIndex: 0, dead: false },
      { id: 71, x: 478, y: 100, width: 52, height: 20, kind: 'reactor', hp: 1, maxHp: 1, colorIndex: 0, dead: false },
      { id: 72, x: 530, y: 100, width: 52, height: 20, kind: 'armored', hp: 3, maxHp: 3, colorIndex: 0, dead: false },
    ]
    state.balls[0].x = 446
    state.balls[0].y = 90
    state.balls[0].vy = 300
    const events = stepGame(state, idle, 0.05)

    expect(eventOfType(events, 'explosion').length).toBeGreaterThanOrEqual(1)
    expect(state.bricks.every((brick) => brick.maxHp <= 3)).toBe(true)
    expect(state.bricks[1].dead).toBe(true)
    expect(state.bricks[2].hp).toBeLessThan(3)
  })

  it('uses one shield block for one bottom-bound ball and reflects upward', () => {
    const state = flyingState()
    state.powers.shield = true
    state.balls[0].x = 300
    state.balls[0].y = FIELD.height - 30
    state.balls[0].vy = 500
    const events = stepGame(state, idle, 0.1)

    expect(eventOfType(events, 'shieldBlock')).toHaveLength(1)
    expect(state.powers.shield).toBe(false)
    expect(state.lives).toBe(3)
    expect(state.balls[0].vy).toBeLessThan(0)
  })

  it('loses one life only after the last of three balls falls', () => {
    const state = flyingState()
    state.lives = 1
    state.balls = [0, 1, 2].map((index) => ({ id: 80 + index, x: 100 + index * 100, y: FIELD.height + BALL_RADIUS - 1, vx: 0, vy: 200, radius: BALL_RADIUS, attached: false, offset: 0 }))
    const events = stepGame(state, idle, 0.02)

    expect(eventOfType(events, 'lifeLost')).toHaveLength(1)
    expect(eventOfType(events, 'gameOver')).toHaveLength(1)
    expect(state.status).toBe('over')
    expect(state.balls).toHaveLength(0)
  })

  it('keeps game over frozen after its single terminal event', () => {
    const state = flyingState()
    state.status = 'over'
    const time = state.time

    expect(stepGame(state, idle, 10)).toEqual([])
    expect(state.time).toBe(time)
  })
})

describe('deterministic simulation', () => {
  it('repeats finite autopaddle play for many seeds on easy and expert', () => {
    const play = (difficulty: 'easy' | 'expert', seed: number) => {
      const state = createGame(difficulty, { seed })
      for (let tick = 0; tick < 3000 && state.status !== 'over'; tick++) {
        const ball = state.balls.find((candidate) => !candidate.attached)
        const predictedX = ball && ball.vy > 0
          ? ball.x + ball.vx * Math.max(0, (state.paddle.y - ball.y) / ball.vy)
          : ball?.x ?? state.paddle.x
        stepGame(state, {
          ...idle,
          launch: state.status === 'serve',
          pointerX: predictedX,
          fire: true,
        }, STEP_SECONDS)
      }
      return {
        status: state.status,
        level: state.level,
        lives: state.lives,
        score: state.score,
        balls: state.balls.map((ball) => [ball.x, ball.y, ball.vx, ball.vy]),
      }
    }

    for (const difficulty of ['easy', 'expert'] as const) {
      for (const seed of [1, 7, 19, 41, 103, 997]) {
        const firstRun = play(difficulty, seed)
        expect(play(difficulty, seed)).toEqual(firstRun)
        expect(JSON.stringify(firstRun)).not.toMatch(/NaN|Infinity/)
      }
    }
  }, 20000)

  it('simulates six generated levels through actual brick hits and transitions', () => {
    const state = createGame('easy', { seed: 71 })
    const clearedLevels: number[] = []

    for (let level = 1; level <= 6; level++) {
      if (level > 1) {
        const startEvents = stepGame(state, idle, 1.7)
        expect(eventOfType(startEvents, 'levelStart')).toEqual([{ type: 'levelStart', level }])
      }
      expect(state.level).toBe(level)
      const target = state.bricks[state.bricks.length - 1]
      state.bricks = [{ ...target, kind: 'glass', hp: 1, maxHp: 1, dead: false }]
      state.status = 'playing'
      state.balls = [{
        id: state.nextId++,
        x: target.x + target.width / 2,
        y: target.y + target.height + BALL_RADIUS + 2,
        vx: 0,
        vy: -state.baseBallSpeed,
        radius: BALL_RADIUS,
        attached: false,
        offset: 0,
      }]
      const events = stepGame(state, { ...idle, pointerX: state.balls[0].x }, 0.05)
      expect(eventOfType(events, 'brickBreak')).toHaveLength(1)
      expect(eventOfType(events, 'levelClear')).toHaveLength(1)
      clearedLevels.push(state.level)
    }

    expect(clearedLevels).toEqual([1, 2, 3, 4, 5, 6])
    expect(state.level).toBe(6)
    expect(getStats(state)).toMatchObject({ level: 6, destroyed: 6 })
  })

  it('keeps all ball and paddle coordinates finite after many simulation steps', () => {
    const state = createGame('expert', { seed: 2026 })
    for (let tick = 0; tick < 12_000 && state.status !== 'over'; tick++) {
      const ball = state.balls.find((candidate) => !candidate.attached)
      stepGame(state, {
        ...idle,
        launch: state.status === 'serve',
        pointerX: ball?.x ?? state.paddle.x,
        fire: true,
      })
    }

    expect(Number.isFinite(state.time)).toBe(true)
    expect(Number.isFinite(state.paddle.x)).toBe(true)
    expect(state.balls.every((ball) => [ball.x, ball.y, ball.vx, ball.vy].every(Number.isFinite))).toBe(true)
  })

  it('does not scale ball speed beyond the cap as levels increase', () => {
    const state = createGame('expert', { seed: 81 })
    startLevel(state, 100)

    expect(state.baseBallSpeed).toBe(880)
    expect(state.bricks.length).toBeGreaterThan(0)
    expect(new Set(state.bricks.map((brick) => brick.y)).size).toBeLessThanOrEqual(8)
    expect(state.bricks.every((brick) => brick.maxHp <= 3)).toBe(true)
  })
})