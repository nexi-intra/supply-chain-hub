import { describe, expect, it } from 'vitest'
import {
  DIFFICULTIES,
  DRONE_RADIUS,
  DRONE_X,
  GATE_WIDTH,
  LIFT_VELOCITY,
  MAX_FALL_SPEED,
  READY_Y,
  SETTINGS,
  STEP_SECONDS,
  TOP_MARGIN,
  BOTTOM_MARGIN,
  WATER_Y,
  zoneTheme,
  type Difficulty,
} from './config'
import { createGame, getStats, spawnGate, stepGame, type GameEvent, type GameState } from './engine'

const idle = { lift: false }
const lift = { lift: true }

function run(state: GameState, seconds: number, input = idle): GameEvent[] {
  const events: GameEvent[] = []
  for (let t = 0; t < seconds - 1e-9; t += STEP_SECONDS) events.push(...stepGame(state, input))
  return events
}

function flying(difficulty: Difficulty = 'medium', seed = 1): GameState {
  const state = createGame(difficulty, { seed })
  stepGame(state, lift)
  state.gates = []
  state.parcels = []
  state.nextGateIn = 1e9
  state.drone.y = 300
  state.drone.vy = 0
  return state
}

function ofType<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)
}

/** Placerer en port, så dronens midte passerer portens midte i næste skridt. */
function gateAtDrone(state: GameState, gapY: number) {
  const gate = spawnGate(state)
  gate.x = DRONE_X - GATE_WIDTH / 2 + 0.5
  gate.baseY = gapY
  gate.gapY = gapY
  gate.amplitude = 0
  return gate
}

describe('klar til start', () => {
  it('svæver på stedet uden porte, indtil spilleren løfter', () => {
    const state = createGame('medium', { seed: 3 })
    expect(state.status).toBe('ready')
    run(state, 3)
    expect(state.status).toBe('ready')
    expect(state.gates).toHaveLength(0)
    expect(Math.abs(state.drone.y - READY_Y)).toBeLessThanOrEqual(8.01)
  })

  it('første løft starter flyvningen', () => {
    const state = createGame('medium', { seed: 3 })
    const events = stepGame(state, lift)
    expect(state.status).toBe('flying')
    expect(ofType(events, 'start')).toHaveLength(1)
    expect(ofType(events, 'lift')).toHaveLength(1)
    expect(state.drone.vy).toBeLessThan(0)
  })
})

describe('flyvning', () => {
  it('trækkes ned af tyngden og falder højst med maks fart', () => {
    const state = flying()
    state.drone.y = 60
    run(state, 0.2)
    expect(state.drone.vy).toBeGreaterThan(0)
    expect(state.drone.y).toBeGreaterThan(60)
    state.drone.y = -5000
    run(state, 1)
    expect(state.drone.vy).toBe(MAX_FALL_SPEED)
  })

  it('løft sætter farten opad uanset fald', () => {
    const state = flying()
    state.drone.vy = 600
    stepGame(state, lift)
    expect(state.drone.vy).toBeLessThan(LIFT_VELOCITY / 2)
  })

  it('stopper ved loftet uden at styrte', () => {
    const state = flying()
    for (let i = 0; i < 40; i++) run(state, 0.1, i % 2 === 0 ? lift : idle)
    expect(state.status).toBe('flying')
    expect(state.drone.y).toBeGreaterThanOrEqual(DRONE_RADIUS - 0.001)
  })

  it('ignorerer ugyldige tidstrin uden at ødelægge tilstanden', () => {
    const state = flying()
    const before = JSON.stringify({ drone: state.drone, time: state.time, scroll: state.scroll })
    expect(stepGame(state, lift, Number.NaN)).toEqual([])
    expect(stepGame(state, lift, Number.POSITIVE_INFINITY)).toEqual([])
    expect(JSON.stringify({ drone: state.drone, time: state.time, scroll: state.scroll })).toBe(before)
  })

  it('styrter i vandet: én gang game over med plask', () => {
    const state = flying()
    const events = run(state, 4)
    expect(state.status).toBe('over')
    expect(ofType(events, 'crash')[0]).toMatchObject({ cause: 'water' })
    expect(ofType(events, 'splash')).toHaveLength(1)
    expect(ofType(events, 'gameOver')).toHaveLength(1)
    expect(run(state, 1)).toEqual([])
  })
})

describe('porte', () => {
  it('lægger huller inden for kanterne med begrænset spring og fast afstand', () => {
    for (const difficulty of DIFFICULTIES) {
      const state = flying(difficulty, 9)
      const { gap, maxShift } = SETTINGS[difficulty]
      let previous: number | null = null
      for (let i = 0; i < 300; i++) {
        const gate = spawnGate(state)
        expect(gate.baseY - gap / 2 - gate.amplitude).toBeGreaterThanOrEqual(TOP_MARGIN - 0.001)
        expect(gate.baseY + gap / 2 + gate.amplitude).toBeLessThanOrEqual(WATER_Y - BOTTOM_MARGIN + 0.001)
        if (previous !== null) expect(Math.abs(gate.baseY - previous)).toBeLessThanOrEqual(maxShift + 0.001)
        previous = gate.baseY
      }
    }
  })

  it('spawner porte løbende med sværhedsgradens afstand', () => {
    const state = createGame('hard', { seed: 5 })
    stepGame(state, lift)
    state.invulnerableUntil = Infinity
    for (let i = 0; i < 300 && state.gates.length < 3; i++) {
      state.drone.y = 300
      state.drone.vy = 0
      run(state, 0.05)
    }
    expect(state.gates.length).toBeGreaterThanOrEqual(3)
    const xs = state.gates.map((gate) => gate.x)
    expect(xs[1] - xs[0]).toBeCloseTo(SETTINGS.hard.spacing, 0)
  })

  it('lader kun porte bevæge sig fra den rette zone', () => {
    const easy = flying('easy')
    easy.zone = 6
    expect(Array.from({ length: 60 }, () => spawnGate(easy)).every((gate) => gate.amplitude === 0)).toBe(true)
    const expertEarly = flying('expert')
    expect(Array.from({ length: 60 }, () => spawnGate(expertEarly)).every((gate) => gate.amplitude === 0)).toBe(true)
    const expert = flying('expert')
    expert.zone = 2
    const moving = Array.from({ length: 60 }, () => spawnGate(expert)).filter((gate) => gate.amplitude > 0)
    expect(moving.length).toBeGreaterThan(5)
    expect(moving.every((gate) => gate.amplitude >= 36 && gate.amplitude <= 60)).toBe(true)
  })

  it('styrter ved sammenstød med en containerstak og falder i vandet', () => {
    const state = flying()
    gateAtDrone(state, 450)
    state.drone.y = 200
    const events = stepGame(state, idle)
    expect(state.status).toBe('crashed')
    expect(ofType(events, 'crash')[0]).toMatchObject({ cause: 'stack' })
    const after = run(state, 3)
    expect(state.status).toBe('over')
    expect(ofType(after, 'gameOver')).toHaveLength(1)
  })

  it('skjoldet tager ét sammenstød og giver kort usårlighed', () => {
    const state = flying()
    state.shield = true
    gateAtDrone(state, 450)
    state.drone.y = 200
    const events = stepGame(state, idle)
    expect(ofType(events, 'shieldBreak')).toHaveLength(1)
    expect(state.status).toBe('flying')
    expect(state.shield).toBe(false)
    gateAtDrone(state, 450)
    state.drone.y = 200
    stepGame(state, idle)
    expect(state.status).toBe('flying')
    state.time += 2
    gateAtDrone(state, 450)
    state.drone.y = 200
    stepGame(state, idle)
    expect(state.status).toBe('crashed')
  })

  it('skjoldet redder også fra vandet med et hop opad', () => {
    const state = flying()
    state.shield = true
    state.drone.y = WATER_Y - DRONE_RADIUS - 0.5
    state.drone.vy = 400
    const events = stepGame(state, idle)
    expect(ofType(events, 'shieldBreak')).toHaveLength(1)
    expect(state.status).toBe('flying')
    expect(state.drone.vy).toBeLessThan(0)
  })
})

describe('point', () => {
  it('giver 10 point for en port og bygger en perfekt række op til en gange-faktor', () => {
    const state = flying()
    const points: number[] = []
    for (let i = 0; i < 4; i++) {
      gateAtDrone(state, 300)
      state.drone.y = 300
      state.drone.vy = 0
      const pass = ofType(stepGame(state, idle), 'gatePass')[0]
      expect(pass.perfect).toBe(true)
      points.push(pass.points)
    }
    expect(points).toEqual([10, 10, 20, 20])
    expect(state.streak).toBe(4)
    expect(state.multiplier).toBe(2)
  })

  it('nulstiller rækken ved en passage langt fra midten', () => {
    const state = flying()
    state.streak = 7
    state.multiplier = 3
    gateAtDrone(state, 300)
    state.drone.y = 300 + SETTINGS.medium.gap / 2 - DRONE_RADIUS - 4
    state.drone.vy = 0
    const pass = ofType(stepGame(state, idle), 'gatePass')[0]
    expect(pass).toMatchObject({ perfect: false, points: 10, multiplier: 1 })
    expect(state.streak).toBe(0)
  })

  it('samler pakker med faktor, og den gyldne giver skjold', () => {
    const state = flying()
    state.multiplier = 2
    state.parcels.push({ id: 900, x: DRONE_X, y: 300, golden: false })
    state.parcels.push({ id: 901, x: DRONE_X + 4, y: 302, golden: true })
    state.drone.y = 300
    const events = stepGame(state, idle)
    const parcels = ofType(events, 'parcel')
    expect(parcels.map((event) => event.points).sort((a, b) => a - b)).toEqual([50, 200])
    expect(state.shield).toBe(true)
    expect(ofType(events, 'shieldGain')).toHaveLength(1)
    expect(state.parcels).toHaveLength(0)
    expect(getStats(state).parcels).toBe(2)
  })

  it('placerer præcis én gylden pakke pr. zone', () => {
    const state = flying('medium', 4)
    const parcels: Array<{ golden: boolean }> = []
    for (let i = 0; i < 30; i++) {
      const before = state.parcels.length
      spawnGate(state)
      parcels.push(...state.parcels.slice(before))
    }
    expect(parcels.filter((parcel) => parcel.golden)).toHaveLength(3)
    expect(parcels.length).toBeGreaterThan(8)
  })
})

describe('zoner', () => {
  it('skifter zone hver 10. port, øger farten med loft og skifter tema', () => {
    const state = flying()
    const zones: number[] = []
    for (let i = 0; i < 80; i++) {
      gateAtDrone(state, 300)
      state.drone.y = 300
      state.drone.vy = 0
      zones.push(...ofType(stepGame(state, idle), 'zone').map((event) => event.zone))
    }
    expect(zones).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    expect(state.speedFactor).toBeCloseTo(1.24)
    expect(zoneTheme(4)).toBe('storm')
    expect(zoneTheme(5)).toBe('harbour')
    expect(getStats(state)).toMatchObject({ gates: 80, zone: 9 })
  })
})

describe('simulation', () => {
  const autopilot = (state: GameState) => {
    const next = state.gates.find((gate) => gate.x + GATE_WIDTH > DRONE_X - DRONE_RADIUS)
    const target = next ? next.gapY + 26 : 320
    return { lift: state.status === 'ready' || (state.drone.y > target && state.drone.vy > -80) }
  }

  it('er deterministisk for samme seed og samme input', () => {
    const play = () => {
      const state = createGame('hard', { seed: 77 })
      for (let i = 0; i < 120 * 40 && state.status !== 'over'; i++) stepGame(state, autopilot(state))
      return getStats(state)
    }
    expect(play()).toEqual(play())
  })

  it('kan gennemflyves af en simpel autopilot på alle sværhedsgrader', () => {
    for (const difficulty of DIFFICULTIES) {
      const gates: number[] = []
      let finite = true
      for (let seed = 1; seed <= 6; seed++) {
        const state = createGame(difficulty, { seed })
        for (let i = 0; i < 120 * 90 && state.status !== 'over'; i++) {
          stepGame(state, autopilot(state))
          finite &&= Number.isFinite(state.drone.y)
        }
        gates.push(getStats(state).gates)
      }
      expect(finite).toBe(true)
      gates.sort((a, b) => a - b)
      expect(gates[3], `${difficulty}: ${gates.join(',')}`).toBeGreaterThanOrEqual(15)
    }
  }, 20000)
})
