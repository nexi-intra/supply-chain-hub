import { describe, it, expect } from 'vitest'
import { BOSS_Y, MAX_LIVES, PICKUP_FALL_SPEED, SHIP_SPEED, STARTING_LIVES, STEP_SECONDS } from './config'
import { beginWave, createGame, spawnEnemy, spawnPickup, startWave, stepGame, type GameEvent, type GameInput, type GameState } from './engine'
import { campaignWave } from './campaign'
import { createRng } from './rng'
import {
  activatePowerup,
  DRONE_RANGE,
  isActive,
  LIFE_FULL_POINTS,
  MAGNET_RADIUS,
  POWERUP_SECONDS,
  rollPowerup,
  rollRainbowDrop,
  SLOWMO_FACTOR,
  TIMED_POWERUPS,
} from './powerups'
import { buildSpecFromWave } from './waves'

const idle: GameInput = { left: false, right: false, up: false, down: false, fire: false, missile: false, pointerX: null, pointerY: null }

function run(state: GameState, seconds: number, input: Partial<GameInput> = {}): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < Math.round(seconds / STEP_SECONDS); i++) events.push(...stepGame(state, { ...idle, ...input }))
  return events
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)

function isolated(seed = 1): GameState {
  const state = createGame('medium', { seed })
  stepGame(state, idle)
  state.enemies = []
  state.eggs = []
  state.pickups = []
  state.boss = null
  state.meteorsToSpawn = 0
  state.goldenAt = Infinity
  state.flybys = []
  state.transitionUntil = Infinity
  state.spec.eggRate = 0
  state.spec.diveRate = 0
  state.ship.invulnerableUntil = Infinity
  return state
}

function grab(state: GameState, kind: Parameters<typeof spawnPickup>[1]): GameEvent[] {
  spawnPickup(state, kind, state.ship.x, state.ship.y)
  return stepGame(state, idle)
}

describe('tidsbegrænsede power-ups', () => {
  it('varer drone 15 s, slowmo 6 s, magnet 10 s og ×2 i 10 s og melder når de slutter', () => {
    expect(POWERUP_SECONDS).toEqual({ drone: 15, slowmo: 6, magnet: 10, double: 10 })
    for (const kind of TIMED_POWERUPS) {
      const state = isolated()
      const picked = ofType(grab(state, kind), 'pickup')
      expect(picked[0]).toMatchObject({ kind })
      expect(isActive(state, kind)).toBe(true)
      expect(state.powerups.until[kind]).toBeCloseTo(state.time + POWERUP_SECONDS[kind], 1)
      const events = run(state, POWERUP_SECONDS[kind] - 0.1)
      expect(isActive(state, kind), kind).toBe(true)
      expect(ofType(events, 'powerupEnd')).toHaveLength(0)
      const end = run(state, 0.2)
      expect(isActive(state, kind), kind).toBe(false)
      expect(ofType(end, 'powerupEnd')).toEqual([{ type: 'powerupEnd', kind }])
    }
  })

  it('genstarter uret, når samme power-up samles igen', () => {
    const state = isolated()
    activatePowerup(state, 'magnet')
    run(state, 8)
    grab(state, 'magnet')
    expect(state.powerups.until.magnet - state.time).toBeCloseTo(POWERUP_SECONDS.magnet, 1)
  })
})

describe('slowmo', () => {
  it('halverer farten for æg, fjender og meteorer, men ikke for skibet og skuddene', () => {
    const measure = (slow: boolean) => {
      const state = isolated()
      if (slow) activatePowerup(state, 'slowmo')
      state.eggs.push({ id: state.nextId++, x: 100, y: 150, vx: 0, vy: 240 })
      const hen = spawnEnemy(state, 'hen', 200, 200, { vx: 120 })
      const meteor = spawnEnemy(state, 'meteor', 800, 150, { vy: 200 })
      const egg = state.eggs[0]
      const ship = state.ship.x
      stepGame(state, { ...idle, right: true, fire: true })
      const shot = state.projectiles[0]
      const shotY = shot.y
      run(state, 0.5, { right: true })
      return { egg: egg.y - 150, hen: hen.x - 200, meteor: meteor.y - 150, ship: state.ship.x - ship, shot: shotY - shot.y }
    }
    const normal = measure(false)
    const slow = measure(true)
    expect(SLOWMO_FACTOR).toBe(0.5)
    expect(slow.egg / normal.egg).toBeCloseTo(0.5, 1)
    expect(slow.hen / normal.hen).toBeCloseTo(0.5, 1)
    expect(slow.meteor / normal.meteor).toBeCloseTo(0.5, 1)
    expect(slow.ship).toBeCloseTo(normal.ship, 5)
    expect(slow.ship).toBeCloseTo(SHIP_SPEED * (0.5 + STEP_SECONDS), 0)
    expect(slow.shot).toBeCloseTo(normal.shot, 5)
  })

  it('bremser også bonusregnen', () => {
    const fall = (slow: boolean) => {
      const state = isolated()
      if (slow) activatePowerup(state, 'slowmo')
      const pickup = spawnPickup(state, 'drumstick', 100, 150)
      pickup.vx = 0
      run(state, 0.5)
      return pickup.y - 150
    }
    expect(fall(true) / fall(false)).toBeCloseTo(0.5, 1)
    expect(fall(false)).toBeCloseTo(PICKUP_FALL_SPEED * 0.5, -1)
  })
})

describe('magnet', () => {
  it('trækker pickups inden for radius hen til skibet', () => {
    const collect = (magnet: boolean) => {
      const state = isolated()
      if (magnet) activatePowerup(state, 'magnet')
      const pickup = spawnPickup(state, 'drumstick', state.ship.x - 220, state.ship.y - 100)
      pickup.vx = 0
      return ofType(run(state, 1.5), 'pickup').length
    }
    expect(MAGNET_RADIUS).toBeGreaterThan(240)
    expect(collect(true)).toBe(1)
    expect(collect(false)).toBe(0)
  })

  it('lader pickups uden for radius være', () => {
    const state = isolated()
    activatePowerup(state, 'magnet')
    const pickup = spawnPickup(state, 'coin', state.ship.x - MAGNET_RADIUS - 150, 130)
    pickup.vx = 0
    run(state, 0.3)
    expect(pickup.x).toBeCloseTo(state.ship.x - MAGNET_RADIUS - 150, 5)
  })
})

describe('×2 point', () => {
  it('fordobler point for drab og kyllingelår', () => {
    const state = isolated()
    activatePowerup(state, 'double')
    spawnEnemy(state, 'hen', state.ship.x, 300)
    const kills = ofType(run(state, 1, { fire: true }), 'kill')
    expect(kills[0]).toMatchObject({ points: 200 })
    const before = state.scoring.score
    const picked = ofType(grab(state, 'drumstick'), 'pickup')
    expect(picked[0].points).toBe(state.scoring.score - before)
    expect(picked[0].points).toBeGreaterThanOrEqual(100)
  })

  it('fordobler også bonusbanens point', () => {
    const state = createGame('medium', { seed: 3 })
    stepGame(state, idle)
    beginWave(state, buildSpecFromWave({ ...campaignWave(4, 3), slotType: 'bonus', templateId: 'drumstickRain' }, 'medium'))
    activatePowerup(state, 'double')
    const picked = ofType(grab(state, 'drumstick'), 'pickup')
    expect(picked[0].points).toBe(200)
  })
})

describe('drone', () => {
  it('følger skibet og skyder små skud mod den nærmeste fjende', () => {
    const state = isolated()
    activatePowerup(state, 'drone')
    const target = spawnEnemy(state, 'helmet', state.ship.x + 150, 250)
    target.hp = target.maxHp = 50
    let fired = 0
    for (let i = 0; i < Math.round(2 / STEP_SECONDS); i++) {
      stepGame(state, { ...idle, right: i < 30 })
      fired = Math.max(fired, state.projectiles.filter((p) => p.kind === 'drone').length)
      const drone = state.powerups.drone
      expect(Math.hypot(drone.x - state.ship.x, drone.y - state.ship.y)).toBeLessThan(100)
    }
    expect(fired).toBeGreaterThan(0)
    expect(target.hp).toBeLessThan(50)
    expect(state.stats.shotsFired).toBe(0)
  })

  it('skyder ikke uden mål inden for rækkevidde og stopper når tiden er gået', () => {
    const state = isolated()
    activatePowerup(state, 'drone')
    spawnEnemy(state, 'helmet', 60, state.ship.y - DRONE_RANGE - 200)
    run(state, 1)
    expect(state.projectiles).toHaveLength(0)
    state.enemies = []
    const target = spawnEnemy(state, 'helmet', state.ship.x, 250)
    target.hp = target.maxHp = 500
    run(state, POWERUP_SECONDS.drone)
    const hp = target.hp
    expect(hp).toBeLessThan(500)
    run(state, 1)
    expect(target.hp).toBe(hp)
  })
})

describe('ekstra liv', () => {
  it('giver +1 liv op til 5 og point derefter', () => {
    const state = isolated()
    grab(state, 'life')
    expect(state.lives).toBe(STARTING_LIVES + 1)
    state.lives = MAX_LIVES
    const before = state.scoring.score
    const picked = ofType(grab(state, 'life'), 'pickup')
    expect(state.lives).toBe(MAX_LIVES)
    expect(picked[0].points).toBe(LIFE_FULL_POINTS)
    expect(state.scoring.score - before).toBe(LIFE_FULL_POINTS)
  })

  it('kommer fra Mor Høne, når hun besejres', () => {
    const state = isolated()
    startWave(state, 8)
    state.transitionUntil = Infinity
    const boss = state.boss!
    boss.entering = false
    boss.y = BOSS_Y
    boss.health = 1
    state.ship.x = boss.x
    run(state, 1, { fire: true })
    expect(state.pickups.map((pickup) => pickup.kind)).toEqual(expect.arrayContaining(['gift', 'life']))
  })
})

describe('drops', () => {
  it('trækker alle power-ups med vægte, hvor ekstra liv er meget sjældent', () => {
    const rng = createRng(5)
    const counts = new Map<string, number>()
    const rolls = 20000
    for (let i = 0; i < rolls; i++) {
      const kind = rollPowerup(rng)
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
    }
    for (const kind of ['shield', 'coolant', 'missile', 'drone', 'slowmo', 'magnet', 'double']) expect(counts.get(kind) ?? 0, kind).toBeGreaterThan(rolls * 0.05)
    expect((counts.get('life') ?? 0) / rolls).toBeLessThan(0.03)
    expect(counts.has('gift')).toBe(false)
  })

  it('lader regnbuehønen droppe fra det nye sæt, med en god chance for liv', () => {
    const rng = createRng(9)
    const counts = new Map<string, number>()
    for (let i = 0; i < 5000; i++) {
      const kind = rollRainbowDrop(rng)
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
    }
    for (const kind of ['drone', 'slowmo', 'magnet', 'double', 'life']) expect(counts.get(kind) ?? 0, kind).toBeGreaterThan(250)
    expect(counts.has('drumstick')).toBe(false)
  })
})
