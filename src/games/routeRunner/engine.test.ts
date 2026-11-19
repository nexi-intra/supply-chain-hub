import { describe, expect, it } from 'vitest'
import { COLS, COMBO_WINDOW_SECONDS, DIFFICULTIES, MAX_QUEUED_TURNS, ROWS, SETTINGS, START, START_LENGTH, STEP_SECONDS } from './config'
import { createGame, getStats, stepGame, tickInterval, type Direction, type GameEvent, type GameState } from './engine'

const none = { turns: [] as Direction[] }

function run(state: GameState, seconds: number, turns: Direction[] = []): GameEvent[] {
  const events: GameEvent[] = []
  let first = true
  for (let t = 0; t < seconds - 1e-9; t += STEP_SECONDS) {
    events.push(...stepGame(state, { turns: first ? turns : [] }))
    first = false
  }
  return events
}

/** Kører præcis ét tick frem. */
function tick(state: GameState, turns: Direction[] = []): GameEvent[] {
  const before = state.ticks
  const events: GameEvent[] = []
  let first = true
  while (state.ticks === before && state.status === 'playing') {
    events.push(...stepGame(state, { turns: first ? turns : [] }))
    first = false
  }
  return events
}

function playing(difficulty: (typeof DIFFICULTIES)[number] = 'easy', seed = 1): GameState {
  const state = createGame(difficulty, { seed })
  stepGame(state, { turns: [], start: true })
  state.parcel = { x: 0, y: 0 }
  return state
}

function ofType<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)
}

describe('start', () => {
  it('venter i klar-tilstand med et tog på fire vogne mod højre', () => {
    const state = createGame('easy', { seed: 2 })
    expect(state.status).toBe('ready')
    expect(state.segments).toHaveLength(START_LENGTH)
    expect(state.segments[0]).toEqual(START)
    expect(state.direction).toBe('right')
    run(state, 2)
    expect(state.segments[0]).toEqual(START)
  })

  it('starter ved et drej eller mellemrum, men ikke ved en vending', () => {
    const reversed = createGame('easy', { seed: 2 })
    run(reversed, 0.1, ['left'])
    expect(reversed.status).toBe('ready')
    const turned = createGame('easy', { seed: 2 })
    const events = run(turned, 0.01, ['up'])
    expect(turned.status).toBe('playing')
    expect(ofType(events, 'start')).toHaveLength(1)
  })

  it('lægger den første pakke på startbanen lige foran toget', () => {
    for (const difficulty of DIFFICULTIES) {
      const state = createGame(difficulty, { seed: 5 })
      expect(state.parcel).toEqual({ x: START.x + 6, y: START.y })
    }
  })

  it('placerer pakken og forhindringerne frit og holder startbanen tom', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed++) {
        const state = createGame(difficulty, { seed })
        expect(state.obstacles).toHaveLength(SETTINGS[difficulty].obstacles)
        const blocked = new Set(state.obstacles.flatMap((o) => o.cells).map(([x, y]) => `${x},${y}`))
        expect(blocked.size).toBeGreaterThanOrEqual(SETTINGS[difficulty].obstacles)
        for (const [key] of blocked.entries()) {
          const [x, y] = key.split(',').map(Number)
          expect(x).toBeGreaterThanOrEqual(2)
          expect(x).toBeLessThanOrEqual(COLS - 3)
          expect(y).toBeGreaterThanOrEqual(2)
          expect(y).toBeLessThanOrEqual(ROWS - 3)
          expect(Math.abs(y - START.y) <= 1).toBe(false)
        }
        expect(blocked.has(`${state.parcel.x},${state.parcel.y}`)).toBe(false)
        expect(state.segments.some((s) => s.x === state.parcel.x && s.y === state.parcel.y)).toBe(false)
      }
    }
  })
})

describe('bevægelse og drej', () => {
  it('flytter én celle pr. tick og glider imellem', () => {
    const state = playing()
    const interval = tickInterval(state)
    run(state, interval * 0.5)
    expect(state.segments[0]).toEqual(START)
    expect(state.progress).toBeGreaterThan(0.4)
    tick(state)
    expect(state.segments[0]).toEqual({ x: START.x + 1, y: START.y })
    expect(state.segments).toHaveLength(START_LENGTH)
  })

  it('udfører to hurtige drej på hver sit tick, så intet drej går tabt', () => {
    const state = playing()
    tick(state, ['up', 'left'])
    expect(state.segments[0]).toEqual({ x: START.x, y: START.y - 1 })
    tick(state)
    expect(state.segments[0]).toEqual({ x: START.x - 1, y: START.y - 1 })
  })

  it('ignorerer vendinger, gentagelser og drej ud over køen', () => {
    const state = playing()
    stepGame(state, { turns: ['left', 'right', 'up', 'up', 'right', 'down', 'right'] })
    expect(state.queue.length).toBeLessThanOrEqual(MAX_QUEUED_TURNS)
    expect(state.queue).toEqual(['up', 'right', 'down'])
  })
})

describe('pakker og point', () => {
  it('vokser med én vogn, giver 10 point og lægger en ny pakke', () => {
    const state = playing()
    state.parcel = { x: START.x + 1, y: START.y }
    const events = tick(state)
    expect(ofType(events, 'eat')[0]).toMatchObject({ kind: 'parcel', points: 10, multiplier: 1 })
    expect(state.score).toBe(10)
    tick(state)
    expect(state.segments).toHaveLength(START_LENGTH + 1)
    expect(state.parcel).not.toEqual({ x: START.x + 1, y: START.y })
  })

  it('bygger en kombo op, når pakkerne tages hurtigt efter hinanden', () => {
    const state = playing()
    const multipliers: number[] = []
    for (let i = 1; i <= 5; i++) {
      state.parcel = { x: state.segments[0].x + 1, y: START.y }
      multipliers.push(ofType(tick(state), 'eat')[0].multiplier)
    }
    expect(multipliers).toEqual([1, 1, 2, 2, 3])
    state.time += COMBO_WINDOW_SECONDS + 0.1
    state.parcel = { x: state.segments[0].x + 1, y: START.y }
    expect(ofType(tick(state), 'eat')[0].multiplier).toBe(1)
  })

  it('giver 50 point for en ekspres-pakke, som forsvinder efter sin tid', () => {
    const state = playing()
    state.express = { x: START.x + 1, y: START.y, expiresAt: state.time + 5 }
    expect(ofType(tick(state), 'eat')[0]).toMatchObject({ kind: 'express', points: 50 })
    expect(state.express).toBeNull()
    state.express = { x: 0, y: ROWS - 1, expiresAt: state.time + 0.05 }
    const events = run(state, 0.1)
    expect(ofType(events, 'expressExpired')).toHaveLength(1)
    expect(state.express).toBeNull()
  })

  it('bliver hurtigere for hver pakke, men kun op til loftet', () => {
    const state = playing('medium')
    const start = tickInterval(state)
    state.parcels = 5
    expect(tickInterval(state)).toBeLessThan(start)
    state.parcels = 1000
    expect(tickInterval(state)).toBeCloseTo(SETTINGS.medium.tick * 0.55)
  })
})

describe('styrt', () => {
  it('styrter i væggen, én gang', () => {
    const state = playing()
    const events = run(state, 10)
    expect(state.status).toBe('over')
    expect(ofType(events, 'crash')[0]).toMatchObject({ cause: 'wall' })
    expect(ofType(events, 'gameOver')).toHaveLength(1)
    expect(stepGame(state, none)).toEqual([])
  })

  it('styrter i sine egne vogne, men må køre ind i halens tomme plads', () => {
    const chase = playing()
    chase.segments = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }]
    chase.direction = 'right'
    tick(chase)
    expect(chase.status).toBe('playing')
    const bite = playing()
    bite.segments = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }, { x: 7, y: 5 }]
    bite.direction = 'right'
    const events = tick(bite)
    expect(ofType(events, 'crash')[0]).toMatchObject({ cause: 'self' })
  })

  it('styrter i en palle', () => {
    const state = playing()
    state.obstacles = [{ kind: 'pallet', cells: [[START.x + 1, START.y]] }]
    expect(ofType(tick(state), 'crash')[0]).toMatchObject({ cause: 'obstacle' })
  })
})

describe('determinisme', () => {
  it('giver samme resultat for samme seed og samme drej', () => {
    const play = () => {
      const state = createGame('hard', { seed: 13 })
      const turns: Direction[] = ['up', 'right', 'down', 'right']
      for (let i = 0; i < 3000 && state.status !== 'over'; i++) stepGame(state, { turns: i % 90 === 0 ? [turns[(i / 90) % 4]] : [], start: true })
      return getStats(state)
    }
    expect(play()).toEqual(play())
  })
})
