import { describe, it, expect } from 'vitest'
import { campaignWave } from './campaign'
import { COIN_POINTS, FIELD, SHIP_MAX_Y, STEP_SECONDS, type Difficulty } from './config'
import { beginWave, createGame, spawnEnemy, stepGame, type Enemy, type GameEvent, type GameInput, type GameState } from './engine'
import type { EnemyWorld } from './enemies'
import {
  BLACK_HOLE,
  COMET_WARNING_SECONDS,
  HAZARD_KINDS,
  LANE_WARNING_SECONDS,
  LANE_YS,
  MAX_ACTIVE_LANES,
  METEOR_STATS,
  METEOR_TYPES,
  meteorDrops,
  meteorMix,
  planHazard,
  pullShip,
  type HazardKind,
  type HazardState,
} from './hazards'
import { createRng } from './rng'
import type { ThemeId } from './themes'
import { buildSpecFromWave, type WaveSpec } from './waves'

const idle: GameInput = { left: false, right: false, up: false, down: false, fire: false, missile: false, pointerX: null, pointerY: null }

function run(state: GameState, seconds: number, input: Partial<GameInput> | ((i: number) => Partial<GameInput>) = {}): GameEvent[] {
  const events: GameEvent[] = []
  const steps = Math.round(seconds / STEP_SECONDS)
  for (let i = 0; i < steps; i++) events.push(...stepGame(state, { ...idle, ...(typeof input === 'function' ? input(i) : input) }))
  return events
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)

/** Bølgen i hver sektors hazard-plads: 3 = gården, 11 = asteroider, 19 = is, 27 = vulkan, 35 = moderskib. */
const HAZARD_WAVE: Record<ThemeId, number> = { farm: 3, asteroids: 11, ice: 19, volcano: 27, mothership: 35 }

function hazardSpec(id: HazardKind, theme: ThemeId = 'farm', difficulty: Difficulty = 'medium'): WaveSpec {
  return buildSpecFromWave({ ...campaignWave(HAZARD_WAVE[theme], 3), slotType: 'hazard', templateId: id }, difficulty)
}

function plan(id: HazardKind, theme: ThemeId = 'farm', seed = 1): HazardState {
  return planHazard(hazardSpec(id, theme), createRng(seed), 0)
}

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

function hazardGame(id: HazardKind, theme: ThemeId = 'farm', difficulty: Difficulty = 'medium', seed = 3): GameState {
  const state = createGame(difficulty, { seed })
  stepGame(state, idle)
  state.pendingEvents = []
  beginWave(state, hazardSpec(id, theme, difficulty))
  return state
}

function shoot(state: GameState, target: Enemy, damage = 1) {
  state.projectiles.push({ id: state.nextId++, kind: 'bolt', x: target.x, y: target.y, vx: 0, vy: -1, damage, pierce: false, hitIds: [], dead: false })
}

function finite(state: GameState): boolean {
  const hole = state.hazard?.blackHole
  const values = [
    state.ship.x,
    state.ship.y,
    ...state.enemies.flatMap((enemy) => [enemy.x, enemy.y, enemy.vx, enemy.vy, enemy.radius]),
    ...state.eggs.flatMap((egg) => [egg.x, egg.y]),
    ...state.pickups.flatMap((pickup) => [pickup.x, pickup.y]),
    ...state.projectiles.flatMap((projectile) => [projectile.x, projectile.y]),
    ...(hole ? [hole.x, hole.y, hole.strength] : []),
  ]
  return values.every(Number.isFinite)
}

const speedOf = (spawn: { vx: number; vy: number }) => Math.hypot(spawn.vx, spawn.vy)
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)

describe('meteortyperne', () => {
  it('har stats pr. type: is er langsom og deler sig i 3, ild er hurtig, metal tåler 6 skud', () => {
    expect([...METEOR_TYPES]).toEqual(['rock', 'fire', 'ice', 'metal', 'gold', 'comet'])
    expect(METEOR_STATS.rock).toMatchObject({ radius: 14, hp: 1, points: 50, largeRadius: 28, largeHp: 3, largePoints: 150, speed: 1, splits: 2 })
    expect(METEOR_STATS.metal).toMatchObject({ hp: 6, points: 300, giftChance: 0.15, splits: 0 })
    expect(METEOR_STATS.ice.splits).toBe(3)
    expect(METEOR_STATS.ice.speed).toBeLessThan(METEOR_STATS.rock.speed)
    expect(METEOR_STATS.fire.speed).toBeGreaterThanOrEqual(1.5)
    expect(METEOR_STATS.comet.speed).toBeGreaterThan(METEOR_STATS.fire.speed)
    expect(METEOR_STATS.gold.points).toBeGreaterThan(METEOR_STATS.rock.points)
  })

  it('giver den spawnede meteor typens radius og liv', () => {
    const state = isolated()
    const metal = spawnEnemy(state, 'meteor', 200, 200, { meteorType: 'metal' })
    expect(metal).toMatchObject({ meteorType: 'metal', hp: 6, radius: METEOR_STATS.metal.radius, large: false })
    const ice = spawnEnemy(state, 'meteor', 300, 200, { meteorType: 'ice', large: true })
    expect(ice).toMatchObject({ meteorType: 'ice', large: true, hp: METEOR_STATS.ice.largeHp, radius: METEOR_STATS.ice.largeRadius })
    expect(spawnEnemy(state, 'meteor', 400, 200).meteorType).toBe('rock')
  })

  it('splitter en stor ismeteor i 3 isskår, der spreder sig', () => {
    const state = isolated()
    const ice = spawnEnemy(state, 'meteor', 400, 260, { meteorType: 'ice', large: true, vy: 90 })
    ice.hp = 1
    shoot(state, ice)
    const events = stepGame(state, idle)
    expect(ofType(events, 'kill')[0]).toMatchObject({ kind: 'meteor', meteorType: 'ice', large: true, points: METEOR_STATS.ice.largePoints })
    const shards = state.enemies.filter((enemy) => enemy.kind === 'meteor')
    expect(shards).toHaveLength(3)
    for (const shard of shards) expect(shard).toMatchObject({ meteorType: 'ice', large: false, hp: 1 })
    expect(new Set(shards.map((shard) => Math.sign(Math.round(shard.vx))))).toEqual(new Set([-1, 0, 1]))
  })

  it('lader skud prelle synligt af metalmeteoren, indtil den går i stykker', () => {
    const state = isolated()
    const metal = spawnEnemy(state, 'meteor', 400, 300, { meteorType: 'metal' })
    const deflects: GameEvent[] = []
    for (let i = 0; i < 5; i++) {
      shoot(state, metal)
      const events = stepGame(state, idle)
      deflects.push(...ofType(events, 'meteorDeflect'))
      expect(ofType(events, 'hit')).toHaveLength(0)
    }
    expect(deflects).toHaveLength(5)
    expect(metal.dead).toBe(false)
    expect(metal.hp).toBe(1)
    shoot(state, metal)
    const kill = ofType(stepGame(state, idle), 'kill')
    expect(kill[0]).toMatchObject({ meteorType: 'metal', points: 300 })
  })

  it('giver metalmeteoren 15 % chance for en gave', () => {
    const drops = (roll: number) => {
      const state = isolated()
      const metal = spawnEnemy(state, 'meteor', 400, 300, { meteorType: 'metal' })
      const dropped: string[] = []
      state.rng = () => roll
      const world: EnemyWorld = { state, events: [], spawn: () => metal, drop: (kind) => dropped.push(kind), chicks: () => {} }
      meteorDrops(world, metal)
      return dropped
    }
    expect(drops(0.1)).toEqual(['gift'])
    expect(drops(0.149)).toEqual(['gift'])
    expect(drops(0.2)).toEqual([])
  })

  it('dropper kyllingelår og mønter fra guldmeteoren, og mønten giver point', () => {
    const state = isolated()
    const gold = spawnEnemy(state, 'meteor', state.ship.x, 300, { meteorType: 'gold' })
    gold.hp = 1
    shoot(state, gold)
    stepGame(state, idle)
    const kinds = state.pickups.map((pickup) => pickup.kind)
    expect(kinds).toContain('drumstick')
    expect(kinds).toContain('coin')
    state.pickups = state.pickups.filter((pickup) => pickup.kind === 'coin').slice(0, 1)
    state.pickups[0].x = state.ship.x
    state.pickups[0].y = state.ship.y
    const before = state.scoring.score
    const picked = ofType(stepGame(state, idle), 'pickup')
    expect(picked[0]).toMatchObject({ kind: 'coin', points: COIN_POINTS })
    expect(state.scoring.score - before).toBe(COIN_POINTS)
  })

  it('sender kometer skråt ind fra de øverste hjørner med et varsel på kanten', () => {
    for (const seed of [1, 2, 3, 4]) {
      const storm = plan('cometStorm', 'ice', seed)
      const comets = storm.queue.filter((spawn) => spawn.type === 'comet')
      expect(comets.length).toBeGreaterThanOrEqual(8)
      for (const comet of comets) {
        const fromLeft = comet.x < 0
        expect(fromLeft || comet.x > FIELD.width).toBe(true)
        expect(comet.y).toBeLessThan(FIELD.height * 0.35)
        expect(Math.sign(comet.vx)).toBe(fromLeft ? 1 : -1)
        expect(comet.vy).toBeGreaterThan(0)
        expect(Math.abs(comet.vx)).toBeGreaterThan(comet.vy * 0.4)
        const warning = storm.warnings.find((w) => w.kind === 'comet' && w.spawn === comet)
        expect(warning, 'hver komet har sit varsel').toBeDefined()
        expect(warning!.until).toBeCloseTo(comet.at)
        expect(warning!.until - warning!.from).toBeCloseTo(COMET_WARNING_SECONDS)
        expect(warning!.x).toBeGreaterThanOrEqual(0)
        expect(warning!.x).toBeLessThanOrEqual(FIELD.width)
        expect(warning!.y).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('varsler hver komet i motoren, før den kommer', () => {
    const state = hazardGame('cometStorm', 'ice')
    state.ship.invulnerableUntil = Infinity
    let warnedAt = -1
    let spawnedAt = -1
    for (let i = 0; i < 600 && spawnedAt < 0; i++) {
      const events = stepGame(state, idle)
      if (warnedAt < 0 && ofType(events, 'cometWarning').length > 0) warnedAt = state.time
      if (state.enemies.some((enemy) => enemy.kind === 'meteor' && enemy.meteorType === 'comet')) spawnedAt = state.time
    }
    expect(warnedAt).toBeGreaterThan(0)
    expect(spawnedAt - warnedAt).toBeGreaterThanOrEqual(COMET_WARNING_SECONDS - 0.05)
  })

  it('gør ildmeteorerne tydeligt hurtigere end sten', () => {
    const showers = [1, 2, 3, 4, 5, 6].map((seed) => plan('meteorShower', 'volcano', seed).queue)
    const fire = showers.flat().filter((spawn) => spawn.type === 'fire').map(speedOf)
    const rock = showers.flat().filter((spawn) => spawn.type === 'rock').map(speedOf)
    expect(fire.length).toBeGreaterThan(rock.length)
    expect(average(fire)).toBeGreaterThan(average(rock) * 1.3)
  })
})

describe('temaernes blanding', () => {
  const share = (theme: ThemeId, type: string, kind: HazardKind = 'meteorShower') => meteorMix(kind, theme)[type as 'rock'] ?? 0

  it('giver hver sektor sin egen meteorregn', () => {
    expect(share('farm', 'rock')).toBeGreaterThan(0.6)
    expect(share('asteroids', 'metal')).toBeGreaterThanOrEqual(0.3)
    expect(share('ice', 'ice')).toBeGreaterThan(0.5)
    expect(share('volcano', 'fire')).toBeGreaterThan(0.5)
    expect(Object.keys(meteorMix('meteorShower', 'mothership')).length).toBeGreaterThanOrEqual(5)
    expect(share('farm', 'gold', 'goldRush')).toBeGreaterThanOrEqual(0.3)
  })

  it('er deterministisk pr. seed', () => {
    expect(plan('meteorShower', 'mothership', 9)).toEqual(plan('meteorShower', 'mothership', 9))
    expect(plan('asteroidBelt', 'asteroids', 9)).toEqual(plan('asteroidBelt', 'asteroids', 9))
  })
})

describe('asteroidebæltet', () => {
  it('sender asteroiderne vandret i faste baner ind fra siderne', () => {
    const belt = plan('asteroidBelt', 'asteroids', 2)
    expect(belt.queue.length).toBeGreaterThanOrEqual(15)
    for (const rock of belt.queue) {
      expect(rock.vy).toBe(0)
      expect(LANE_YS).toContain(rock.y)
      if (rock.vx > 0) expect(rock.x).toBeLessThan(0)
      else expect(rock.x).toBeGreaterThan(FIELD.width)
    }
    expect(Math.max(...belt.queue.map((rock) => rock.y))).toBeGreaterThanOrEqual(SHIP_MAX_Y - 20)
  })

  it('varsler hver bane i god tid og lader altid mindst to baner være fri', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const belt = plan('asteroidBelt', 'asteroids', seed)
      const lanes = belt.warnings.filter((w) => w.kind === 'lane')
      expect(lanes.length).toBeGreaterThanOrEqual(4)
      // En sten hører til det seneste varsel på dens bane.
      const owner = (rock: (typeof belt.queue)[number]) =>
        lanes.filter((lane) => lane.y === rock.y && lane.from <= rock.at).reduce((latest, lane) => (lane.from > latest.from ? lane : latest))
      const busy = lanes.map((lane) => {
        const rocks = belt.queue.filter((rock) => owner(rock) === lane)
        const first = Math.min(...rocks.map((rock) => rock.at))
        expect(first - lane.from, `seed ${seed}`).toBeGreaterThanOrEqual(LANE_WARNING_SECONDS - 1e-6)
        const end = Math.max(...rocks.map((rock) => rock.at + (FIELD.width + 120) / Math.abs(rock.vx)))
        return { from: lane.from, end }
      })
      expect(MAX_ACTIVE_LANES).toBeLessThanOrEqual(LANE_YS.length - 2)
      for (let t = 0; t < 40; t += 0.1) {
        const active = busy.filter((lane) => t >= lane.from && t < lane.end).length
        expect(active, `seed ${seed} t ${t.toFixed(1)}`).toBeLessThanOrEqual(MAX_ACTIVE_LANES)
      }
    }
  })

  it('melder banerne i motoren, før stenene kommer', () => {
    const state = hazardGame('asteroidBelt', 'asteroids')
    state.ship.invulnerableUntil = Infinity
    const events = run(state, 4)
    expect(ofType(events, 'laneWarning').length).toBeGreaterThan(0)
  })
})

describe('det sorte hul', () => {
  function holeGame(): GameState {
    const state = hazardGame('blackHole', 'volcano')
    state.ship.invulnerableUntil = Infinity
    state.hazard!.blackHole!.age = BLACK_HOLE.growSeconds
    state.hazard!.blackHole!.strength = 1
    return state
  }

  it('trækker skibet blidt og begrænset mod sig, og intet bliver NaN midt i hullet', () => {
    const hole = { x: 480, y: 240, age: 5, strength: 1, collapsing: false, collapseT: 0 }
    for (const [x, y] of [[480, 544], [100, 400], [860, 160], [470, 250], [480, 240]]) {
      const ship = { x, y }
      const before = Math.hypot(hole.x - x, hole.y - y)
      pullShip(ship, hole, STEP_SECONDS)
      expect(Number.isFinite(ship.x) && Number.isFinite(ship.y)).toBe(true)
      const moved = Math.hypot(ship.x - x, ship.y - y)
      expect(moved).toBeLessThanOrEqual(BLACK_HOLE.pullMax * STEP_SECONDS + 1e-9)
      if (before > 1) expect(Math.hypot(hole.x - ship.x, hole.y - ship.y)).toBeLessThanOrEqual(before)
    }
    expect(BLACK_HOLE.pullMax).toBeLessThan(200)
  })

  it('sender også løse meteorer ned langt fra hullet, så man skal undvige mens man kæmper mod suget', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const hazard = plan('blackHole', 'volcano', seed)
      const hole = hazard.blackHole!
      const strays = hazard.queue.filter((spawn) => spawn.y < 0 && spawn.vx === 0 && spawn.vy > 0 && Math.abs(spawn.x - hole.x) > BLACK_HOLE.captureRadius + 40)
      expect(strays.length, `seed ${seed}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('lader et skib i ro drive mod hullet, mens et skib der kæmper imod slipper væk', () => {
    const drifting = holeGame()
    const hole = drifting.hazard!.blackHole!
    const start = Math.hypot(hole.x - drifting.ship.x, hole.y - drifting.ship.y)
    run(drifting, 1)
    expect(Math.hypot(hole.x - drifting.ship.x, hole.y - drifting.ship.y)).toBeLessThan(start - 20)

    const fighting = holeGame()
    const other = fighting.hazard!.blackHole!
    fighting.ship.x = other.x - 160
    fighting.ship.y = other.y + 60
    const near = Math.hypot(other.x - fighting.ship.x, other.y - fighting.ship.y)
    run(fighting, 0.6, { left: true, down: true })
    expect(Math.hypot(other.x - fighting.ship.x, other.y - fighting.ship.y)).toBeGreaterThan(near + 100)
  })

  it('sluger æg, skud og meteorer, der rører det – uden point', () => {
    const state = holeGame()
    const hole = state.hazard!.blackHole!
    state.meteorsToSpawn = 0
    state.hazard!.queue = []
    state.transitionUntil = Infinity
    state.eggs.push({ id: state.nextId++, x: hole.x, y: hole.y, vx: 0, vy: 10 })
    state.projectiles.push({ id: state.nextId++, kind: 'bolt', x: hole.x + 5, y: hole.y + 5, vx: 0, vy: 0, damage: 1, pierce: false, hitIds: [], dead: false })
    const meteor = spawnEnemy(state, 'meteor', hole.x + 4, hole.y, { vy: 0 })
    const score = state.scoring.score
    const events = stepGame(state, idle)
    const swallowed = ofType(events, 'swallow').map((event) => event.what).sort()
    expect(swallowed).toEqual(['egg', 'meteor', 'shot'])
    expect(state.eggs).toHaveLength(0)
    expect(state.projectiles).toHaveLength(0)
    expect(meteor.dead).toBe(true)
    expect(ofType(events, 'kill')).toHaveLength(0)
    expect(state.scoring.score).toBe(score)
  })

  it('koster et liv at røre kernen og spytter skibet ud', () => {
    const state = holeGame()
    const hole = state.hazard!.blackHole!
    state.ship.invulnerableUntil = 0
    state.ship.x = hole.x
    state.ship.y = Math.max(hole.y, 130)
    hole.y = state.ship.y
    const lives = state.lives
    const events = stepGame(state, idle)
    expect(ofType(events, 'playerHit')).toHaveLength(1)
    expect(state.lives).toBe(lives - 1)
    expect(state.ship.y).toBe(SHIP_MAX_Y)
  })

  it('lader meteorerne kredse ind i hullet og varer, til meteorerne er væk', () => {
    const state = holeGame()
    let orbited = false
    let cleared = false
    let collapsed = false
    for (let i = 0; i < Math.round(80 / STEP_SECONDS) && !(cleared && collapsed); i++) {
      state.ship.x = 60
      state.ship.y = SHIP_MAX_Y
      const pending = state.meteorsToSpawn > 0 || state.enemies.some((enemy) => enemy.kind === 'meteor')
      const events = stepGame(state, idle)
      if (state.enemies.some((enemy) => enemy.kind === 'meteor' && enemy.stage === 1)) orbited = true
      if (pending) expect(state.hazard?.blackHole?.collapsing).toBe(false)
      if (ofType(events, 'blackHoleCollapse').length > 0) collapsed = true
      if (ofType(events, 'waveClear').length > 0) cleared = true
      if (!finite(state)) throw new Error(`NaN efter ${state.time.toFixed(2)} s`)
    }
    expect(orbited, 'kredsløb').toBe(true)
    expect(collapsed, 'kollaps').toBe(true)
    expect(cleared, 'ryddet').toBe(true)
  })
})

describe('alle hazard-bølger', () => {
  it('starter med en hazardStart-hændelse og kan spilles uden NaN på let og ekspert', () => {
    for (const difficulty of ['easy', 'expert'] as const) {
      for (const id of HAZARD_KINDS) {
        for (const theme of ['farm', 'volcano', 'mothership'] as const) {
          const state = createGame(difficulty, { seed: 8 })
          stepGame(state, idle)
          state.pendingEvents = []
          beginWave(state, hazardSpec(id, theme, difficulty))
          const first = stepGame(state, idle)
          expect(ofType(first, 'hazardStart')[0]).toMatchObject({ hazard: id, theme })
          for (let i = 0; i < Math.round(40 / STEP_SECONDS); i++) {
            state.ship.invulnerableUntil = Infinity
            const phase = Math.floor(i / 50) % 4
            stepGame(state, { ...idle, fire: true, left: phase === 0, up: phase === 1, right: phase === 2, down: phase === 3 })
            if (!finite(state)) throw new Error(`${difficulty} ${id} ${theme}: NaN efter ${state.time.toFixed(2)} s`)
          }
          expect(state.wave, `${difficulty} ${id} ${theme} bliver ryddet`).toBeGreaterThan(HAZARD_WAVE[theme])
        }
      }
    }
  }, 60_000)

  it('krydrer de sene sektorers hazard-bølger med ninjaer', () => {
    expect(hazardSpec('meteorShower', 'farm').flybys).toEqual([])
    expect(hazardSpec('meteorShower', 'volcano').flybys.some((flyby) => flyby.kind === 'ninja')).toBe(true)
    expect(hazardSpec('blackHole', 'mothership').flybys.filter((flyby) => flyby.kind === 'ninja').length).toBeGreaterThanOrEqual(2)
  })
})
