import { describe, it, expect } from 'vitest'
import {
  BOSS_POINTS_PER_LEVEL,
  BOSS_Y,
  DANGER_PUSHBACK,
  DANGER_ZONE_Y,
  ENTRY_CONTACT_GRACE_SECONDS,
  EXTRA_LIFE_EVERY,
  FIELD,
  INVULNERABLE_SECONDS,
  MAX_MISSILES,
  MAX_WEAPON_LEVEL,
  SHIP_HALF_WIDTH,
  SHIP_MAX_Y,
  SHIP_MIN_Y,
  SHIP_POINTER_SPEED,
  SHIP_SPEED,
  SHIP_Y,
  STARTING_LIVES,
  STEP_SECONDS,
  WAVE_TRANSITION_SECONDS,
} from './config'
import {
  createGame,
  getStats,
  jumpToWave,
  spawnEnemy,
  spawnPickup,
  startWave,
  stepGame,
  type GameEvent,
  type GameInput,
  type GameState,
} from './engine'
import { buildWaveSpec } from './waves'
import { campaignWave } from './campaign'
import { bossVulnerable } from './bosses'
import { ENEMY_DEFS } from './enemies'
import { activatePowerup, TIMED_POWERUPS } from './powerups'
import { WEAPON_FAMILIES } from './weapons'
import type { TemplateId } from './waveTemplates'

const idle: GameInput = { left: false, right: false, up: false, down: false, fire: false, missile: false, pointerX: null, pointerY: null }

function run(state: GameState, seconds: number, input: Partial<GameInput> = {}): GameEvent[] {
  const events: GameEvent[] = []
  const steps = Math.round(seconds / STEP_SECONDS)
  for (let i = 0; i < steps; i++) events.push(...stepGame(state, { ...idle, ...input }))
  return events
}

/** Tom bane uden bølgeflow, så én mekanik kan testes isoleret. */
function isolated(seed = 1): GameState {
  const state = createGame('medium', { seed })
  stepGame(state, idle)
  state.enemies = []
  state.eggs = []
  state.boss = null
  state.meteorsToSpawn = 0
  state.goldenAt = Infinity
  state.flybys = []
  state.transitionUntil = Infinity
  return state
}

function dropEgg(state: GameState, x = state.ship.x, y = state.ship.y - 30) {
  state.eggs.push({ id: state.nextId++, x, y, vx: 0, vy: 240 })
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)

describe('øvebane (udviklerhop)', () => {
  it('hopper rent til en bølge og markerer spillet som øvelse, så scoren ikke tæller', () => {
    const state = createGame('medium', { seed: 4 })
    run(state, 3, { fire: true })
    expect(state.practice).toBe(false)
    jumpToWave(state, 24)
    expect(state.practice).toBe(true)
    expect(state.wave).toBe(24)
    expect(state.boss?.id).toBe('iceQueen')
    expect(state.eggs).toEqual([])
    expect(state.pickups).toEqual([])
    expect(state.enemies.every((enemy) => enemy.kind === 'bossPart' || state.boss!.parts.includes(enemy.id))).toBe(true)
    const events = run(state, 0.1)
    expect(ofType(events, 'bossIntro')[0]?.boss).toBe('iceQueen')
  })

  it('kan hoppe til en hazard- og en bonusbane', () => {
    const state = createGame('easy', { seed: 4 })
    jumpToWave(state, 3)
    expect(state.hazard).not.toBeNull()
    jumpToWave(state, 4)
    expect(state.hazard).toBeNull()
    expect(state.bonus).not.toBeNull()
    jumpToWave(state, 0)
    expect(state.wave).toBe(1)
  })
})

describe('start', () => {
  it('starter bølge 1 med 3 liv og skibet i midten', () => {
    const state = createGame('medium', { seed: 1 })
    expect(state.lives).toBe(STARTING_LIVES)
    expect(state.ship.x).toBe(FIELD.width / 2)
    expect(state.enemies).toHaveLength(state.spec.rows * state.spec.cols)
    const events = stepGame(state, idle)
    expect(events).toContainEqual({ type: 'waveStart', wave: 1, kind: 'formation', templateId: 'classic' })
    expect(events).toContainEqual({ type: 'sectorStart', sector: 0, theme: 'farm', round: 0 })
  })

  it('gemmer seedet og bygger bølgerne ud fra det', () => {
    const state = createGame('medium', { seed: 1234 })
    expect(state.seed).toBe(1234)
    expect(state.spec).toEqual(buildWaveSpec(1, 'medium', 1234))
  })

  it('er deterministisk for samme seed', () => {
    const play = () => {
      const state = createGame('hard', { seed: 9 })
      for (let i = 0; i < 1200; i++) stepGame(state, { ...idle, fire: true, left: i % 240 < 120, right: i % 240 >= 120 })
      return { score: state.scoring.score, enemies: state.enemies.length, lives: state.lives }
    }
    expect(play()).toEqual(play())
  })
})

describe('skibet', () => {
  it('flytter med tastaturet og stopper ved kanten', () => {
    const state = isolated()
    run(state, 0.5, { right: true })
    expect(state.ship.x).toBeGreaterThan(FIELD.width / 2)
    run(state, 5, { right: true })
    expect(state.ship.x).toBe(FIELD.width - SHIP_HALF_WIDTH)
  })

  it('følger musen uden at skyde forbi', () => {
    const state = isolated()
    run(state, 2, { pointerX: 200 })
    expect(state.ship.x).toBe(200)
    run(state, 2, { pointerX: -500 })
    expect(state.ship.x).toBe(SHIP_HALF_WIDTH)
  })

  it('starter nederst i midten og flyver frit op og ned inden for banen', () => {
    const state = isolated()
    expect(state.ship.y).toBe(SHIP_Y)
    run(state, 0.25, { up: true })
    expect(state.ship.y).toBeCloseTo(SHIP_Y - SHIP_SPEED * 0.25, 6)
    expect(state.ship.x).toBe(FIELD.width / 2)
    expect(state.ship.vy).toBeLessThan(0)
    run(state, 5, { up: true })
    expect(state.ship.y).toBe(SHIP_MIN_Y)
    run(state, 5, { down: true })
    expect(state.ship.y).toBe(SHIP_MAX_Y)
    expect(state.ship.vy).toBe(0)
  })

  it('holder skibet helt synligt og under HUD-linjen', () => {
    expect(SHIP_MIN_Y).toBeGreaterThanOrEqual(110)
    expect(SHIP_MAX_Y).toBeLessThanOrEqual(FIELD.height - 50)
    expect(SHIP_MAX_Y).toBeGreaterThanOrEqual(SHIP_Y)
  })

  it('normaliserer diagonal fart med tastaturet', () => {
    const state = isolated()
    const { x, y } = state.ship
    run(state, 0.25, { up: true, right: true })
    expect(Math.hypot(state.ship.x - x, state.ship.y - y)).toBeCloseTo(SHIP_SPEED * 0.25, 6)
    expect(state.ship.x - x).toBeCloseTo(y - state.ship.y, 6)
  })

  it('følger musen i 2D med fartloft og uden at teleportere', () => {
    const state = isolated()
    const { x, y } = state.ship
    stepGame(state, { ...idle, pointerX: 100, pointerY: 150 })
    const dx = state.ship.x - x
    const dy = state.ship.y - y
    expect(Math.hypot(dx, dy)).toBeCloseTo(SHIP_POINTER_SPEED * STEP_SECONDS, 6)
    expect(dy / dx).toBeCloseTo((150 - y) / (100 - x), 6)
    run(state, 2, { pointerX: 100, pointerY: 150 })
    expect(state.ship).toMatchObject({ x: 100, y: 150 })
    run(state, 2, { pointerX: 5000, pointerY: -5000 })
    expect(state.ship).toMatchObject({ x: FIELD.width - SHIP_HALF_WIDTH, y: SHIP_MIN_Y })
    run(state, 2, { pointerX: 300, pointerY: 5000 })
    expect(state.ship).toMatchObject({ x: 300, y: SHIP_MAX_Y })
  })

  it('lader tastaturet overstyre musen mens en tast holdes', () => {
    const state = isolated()
    run(state, 0.25, { up: true, pointerX: 100, pointerY: SHIP_MAX_Y })
    expect(state.ship.x).toBe(FIELD.width / 2)
    expect(state.ship.y).toBeCloseTo(SHIP_Y - SHIP_SPEED * 0.25, 6)
  })

  it('skyder fra skibets aktuelle position', () => {
    const state = isolated()
    run(state, 0.5, { up: true, left: true })
    const events = stepGame(state, { ...idle, fire: true })
    expect(ofType(events, 'shot')).toHaveLength(1)
    expect(state.projectiles.length).toBeGreaterThan(0)
    for (const projectile of state.projectiles) {
      expect(Math.abs(projectile.x - state.ship.x)).toBeLessThan(30)
      expect(Math.abs(projectile.y - (state.ship.y - 24))).toBeLessThan(20)
    }
  })
})

describe('skud og træffere', () => {
  it('skyder opad i det tempo våbnet tillader', () => {
    const state = isolated()
    const shots = ofType(run(state, 1, { fire: true }), 'shot')
    expect(shots.length).toBeGreaterThanOrEqual(4)
    expect(shots.length).toBeLessThanOrEqual(5)
    expect(state.projectiles.every((projectile) => projectile.vy < 0)).toBe(true)
  })

  it('dræber en høne og giver point', () => {
    const state = isolated()
    spawnEnemy(state, 'hen', state.ship.x, 300)
    const kills = ofType(run(state, 1, { fire: true }), 'kill')
    expect(kills).toHaveLength(1)
    expect(kills[0]).toMatchObject({ kind: 'hen', points: 100, multiplier: 1 })
    expect(state.scoring.score).toBe(100)
    expect(getStats(state).kills).toBe(1)
  })

  it('kræver tre træffere for en hjelmhøne', () => {
    const state = isolated()
    spawnEnemy(state, 'helmet', state.ship.x, 300)
    const events = run(state, 1.5, { fire: true })
    expect(ofType(events, 'hit')).toHaveLength(2)
    expect(ofType(events, 'kill')).toHaveLength(1)
  })

  it('lader ionlaseren gennembore flere høns med ét skud', () => {
    const state = isolated()
    state.weapon.level = MAX_WEAPON_LEVEL
    spawnEnemy(state, 'hen', state.ship.x, 200)
    spawnEnemy(state, 'hen', state.ship.x, 300)
    stepGame(state, { ...idle, fire: true })
    const events = run(state, 1)
    expect(ofType(events, 'kill')).toHaveLength(2)
    expect(getStats(state)).toMatchObject({ shotsFired: 1, accuracy: 1 })
  })

  it('splitter en stor meteor i to små', () => {
    const state = isolated()
    const meteor = spawnEnemy(state, 'meteor', state.ship.x, 250, { large: true })
    meteor.hp = 1
    const events = run(state, 0.5, { fire: true })
    expect(ofType(events, 'kill')[0]).toMatchObject({ kind: 'meteor' })
    expect(state.enemies.filter((enemy) => enemy.kind === 'meteor' && !enemy.large)).toHaveLength(2)
  })
})

describe('liv og skade', () => {
  it('koster et liv, giver usårlighed og sænker våbnet', () => {
    const state = isolated()
    state.weapon.level = 3
    dropEgg(state)
    const events = run(state, 0.3)
    expect(ofType(events, 'playerHit')).toHaveLength(1)
    expect(state.lives).toBe(STARTING_LIVES - 1)
    expect(state.weapon.level).toBe(2)
    dropEgg(state)
    run(state, 0.3)
    expect(state.lives).toBe(STARTING_LIVES - 1)
    run(state, INVULNERABLE_SECONDS)
    dropEgg(state)
    run(state, 0.3)
    expect(state.lives).toBe(STARTING_LIVES - 2)
  })

  it('lader skjoldet tage ét træf', () => {
    const state = isolated()
    state.ship.shield = true
    dropEgg(state)
    const events = run(state, 0.3)
    expect(ofType(events, 'shieldBlock')).toHaveLength(1)
    expect(state.lives).toBe(STARTING_LIVES)
    expect(state.ship.shield).toBe(false)
  })

  it('slutter spillet ved 0 liv og står derefter stille', () => {
    const state = isolated()
    state.lives = 1
    dropEgg(state)
    expect(ofType(run(state, 0.3), 'gameOver')).toHaveLength(1)
    expect(state.status).toBe('over')
    const time = state.time
    expect(stepGame(state, idle)).toEqual([])
    expect(state.time).toBe(time)
  })

  it('koster et liv når en dykker rammer skibet, uden at give point', () => {
    const state = isolated()
    spawnEnemy(state, 'diver', state.ship.x, state.ship.y - 10)
    const events = run(state, 0.1)
    expect(ofType(events, 'playerHit')).toHaveLength(1)
    expect(state.enemies).toHaveLength(0)
    expect(state.scoring.score).toBe(0)
  })

  it('koster et liv når Mor Hønes laser rammer', () => {
    const state = isolated()
    startWave(state, 8)
    state.transitionUntil = Infinity
    const boss = state.boss!
    boss.entering = false
    boss.y = BOSS_Y
    boss.laser = { state: 'firing', x: state.ship.x, until: boss.time + 1 }
    expect(ofType(run(state, 0.1), 'playerHit')).toHaveLength(1)
  })

  it('koster et liv og skubber formationen op, når den når skibets zone', () => {
    const state = createGame('medium', { seed: 2 })
    for (const enemy of state.enemies) enemy.mode = 'formation'
    state.formation.descent = DANGER_ZONE_Y
    const events = stepGame(state, idle)
    expect(ofType(events, 'playerHit')).toHaveLength(1)
    expect(state.formation.descent).toBe(DANGER_ZONE_Y - DANGER_PUSHBACK)
  })

  it('måler invasionen ved bunden af banen, uanset hvor skibet er', () => {
    const state = createGame('medium', { seed: 2 })
    for (const enemy of state.enemies) enemy.mode = 'formation'
    state.ship.x = SHIP_HALF_WIDTH
    state.ship.y = SHIP_MIN_Y
    state.formation.descent = DANGER_ZONE_Y
    expect(ofType(stepGame(state, idle), 'playerHit')).toHaveLength(1)
    expect(state.formation.descent).toBe(DANGER_ZONE_Y - DANGER_PUSHBACK)

    const calm = createGame('medium', { seed: 2 })
    for (const enemy of calm.enemies) enemy.mode = 'formation'
    calm.ship.x = FIELD.width / 2
    calm.ship.y = 420
    expect(ofType(run(calm, 0.2), 'playerHit')).toHaveLength(0)
  })

  it('koster et liv når skibet flyver ind i en høne i formationen, og hønen dør', () => {
    const state = isolated()
    const hen = spawnEnemy(state, 'hen', 300, 220)
    hen.mode = 'formation'
    state.ship.x = 300
    state.ship.y = 220 + hen.radius
    const events = run(state, 0.1)
    expect(ofType(events, 'playerHit')).toHaveLength(1)
    expect(state.lives).toBe(STARTING_LIVES - 1)
    expect(state.enemies).toHaveLength(0)
    expect(state.scoring.score).toBe(0)
  })

  it('lader skjoldet tage et sammenstød med en høne', () => {
    const state = isolated()
    state.ship.shield = true
    const hen = spawnEnemy(state, 'hen', 300, 220)
    hen.mode = 'formation'
    state.ship.x = 300
    state.ship.y = 220
    expect(ofType(run(state, 0.1), 'shieldBlock')).toHaveLength(1)
    expect(state.lives).toBe(STARTING_LIVES)
  })

  it('giver indflyvende høns et kort frirum før de kan ramme skibet', () => {
    const state = isolated()
    const hen = spawnEnemy(state, 'hen', state.ship.x, state.ship.y)
    hen.mode = 'entering'
    hen.pathT = 0
    hen.pathDuration = 2
    expect(ENTRY_CONTACT_GRACE_SECONDS).toBeGreaterThanOrEqual(0.4)
    expect(ofType(run(state, 0.35), 'playerHit')).toHaveLength(0)
    expect(ofType(run(state, ENTRY_CONTACT_GRACE_SECONDS), 'playerHit')).toHaveLength(1)
  })

  it('koster et liv ved sammenstød med Mor Hønes krop, men ikke mens hun flyver ind', () => {
    const state = isolated()
    startWave(state, 8)
    state.transitionUntil = Infinity
    state.enemies = []
    const boss = state.boss!
    state.ship.x = boss.x
    state.ship.y = SHIP_MIN_Y
    // Sent i indflyvningen, hvor kroppen allerede er nede ved skibets højde.
    boss.time = 1.2
    expect(ofType(run(state, 0.1), 'playerHit')).toHaveLength(0)
    expect(Math.abs(boss.y - state.ship.y)).toBeLessThan(40)
    boss.entering = false
    boss.y = BOSS_Y
    boss.nextVolleyAt = boss.nextChicksAt = boss.nextLaserAt = Infinity
    state.ship.y = BOSS_Y + 40
    const health = boss.health
    expect(ofType(run(state, 0.1), 'playerHit')).toHaveLength(1)
    expect(state.boss?.health).toBe(health)
  })

  it('lader laseren ramme i hele strålens højde, men ikke over den', () => {
    const state = isolated()
    startWave(state, 8)
    state.transitionUntil = Infinity
    state.enemies = []
    const boss = state.boss!
    boss.entering = false
    boss.y = BOSS_Y
    boss.x = 200
    boss.nextVolleyAt = boss.nextChicksAt = Infinity
    boss.laser = { state: 'firing', x: 760, until: boss.time + 1 }
    state.ship.x = 760
    state.ship.y = SHIP_MIN_Y
    expect(ofType(stepGame(state, idle), 'playerHit')).toHaveLength(0)
    state.ship.y = 320
    expect(ofType(stepGame(state, idle), 'playerHit')).toHaveLength(1)
  })

  it('lader aldrig indflyvende høns ramme et skib der holder nederst ved bølgestart', () => {
    for (let wave = 1; wave <= 48; wave++) {
      for (const x of [120, FIELD.width / 2, FIELD.width - 120]) {
        const state = createGame('medium', { seed: 5 })
        startWave(state, wave)
        state.boss = null
        state.meteorsToSpawn = 0
        state.flybys = []
        state.goldenAt = Infinity
        state.spec = { ...state.spec, eggRate: 0, diveRate: 0 }
        for (const enemy of state.enemies) enemy.kind = 'hen'
        state.ship.x = x
        let hits = 0
        for (let i = 0; i < 600 && state.enemies.some((enemy) => enemy.mode === 'entering'); i++) {
          hits += ofType(stepGame(state, idle), 'playerHit').length
        }
        expect(hits, `bølge ${wave}, x ${x}`).toBe(0)
      }
    }
  })
})

describe('power-ups', () => {
  it('opgraderer våbnet med en gave og giver point på max', () => {
    const state = isolated()
    spawnPickup(state, 'gift', state.ship.x, state.ship.y).family = 'blaster'
    expect(ofType(run(state, 0.1), 'weaponUp')).toEqual([{ type: 'weaponUp', level: 2, family: 'blaster', switched: false }])
    state.weapon.level = MAX_WEAPON_LEVEL
    spawnPickup(state, 'gift', state.ship.x, state.ship.y).family = 'blaster'
    run(state, 0.1)
    expect(state.scoring.score).toBe(1000)
  })

  it('skifter våbenfamilie og beholder niveauet med en gave i en anden farve', () => {
    const state = isolated()
    state.weapon.level = 3
    spawnPickup(state, 'gift', state.ship.x, state.ship.y).family = 'lightning'
    expect(ofType(run(state, 0.1), 'weaponUp')).toEqual([{ type: 'weaponUp', level: 3, family: 'lightning', switched: true }])
    expect(state.weapon).toMatchObject({ family: 'lightning', level: 3 })
  })

  it('farver hver gave med en familie: oftest den nuværende', () => {
    const state = isolated()
    state.weapon.family = 'homing'
    const families = Array.from({ length: 400 }, () => spawnPickup(state, 'gift', 100, 100).family)
    const same = families.filter((family) => family === 'homing').length / families.length
    expect(same).toBeGreaterThan(0.5)
    expect(same).toBeLessThan(0.7)
    expect(new Set(families).size).toBe(5)
  })

  it('beholder familien, når et liv koster et niveau', () => {
    const state = isolated()
    state.weapon.family = 'spread'
    state.weapon.level = 3
    state.ship.invulnerableUntil = 0
    dropEgg(state)
    run(state, 0.3)
    expect(state.weapon).toMatchObject({ family: 'spread', level: 2 })
  })

  it('giver skjold, køling og missiler med loft', () => {
    const state = isolated()
    spawnPickup(state, 'shield', state.ship.x, state.ship.y)
    spawnPickup(state, 'coolant', state.ship.x, state.ship.y)
    run(state, 0.1)
    expect(state.ship.shield).toBe(true)
    expect(state.weapon.coolantUntil).toBeGreaterThan(state.time)
    state.missiles = MAX_MISSILES
    spawnPickup(state, 'missile', state.ship.x, state.ship.y)
    run(state, 0.1)
    expect(state.missiles).toBe(MAX_MISSILES)
    expect(state.scoring.score).toBe(500)
  })

  it('giver et ekstra liv når pointgrænsen passeres', () => {
    const state = isolated()
    state.scoring.score = EXTRA_LIFE_EVERY - 10
    spawnPickup(state, 'drumstick', state.ship.x, state.ship.y)
    expect(ofType(run(state, 0.1), 'extraLife')).toEqual([{ type: 'extraLife', lives: STARTING_LIVES + 1 }])
  })
})

describe('missil', () => {
  it('rydder høns og æg og bruger et missil', () => {
    const state = createGame('medium', { seed: 4 })
    stepGame(state, idle)
    dropEgg(state, 100, 100)
    state.missiles = 1
    const events = stepGame(state, { ...idle, missile: true })
    expect(ofType(events, 'missile')).toHaveLength(1)
    expect(state.enemies).toHaveLength(0)
    expect(state.eggs).toHaveLength(0)
    expect(state.missiles).toBe(0)
    expect(state.scoring.score).toBeGreaterThan(0)
    expect(ofType(stepGame(state, { ...idle, missile: true }), 'missile')).toHaveLength(0)
  })

  it('tager 15 % af Mor Hønes liv', () => {
    const state = isolated()
    startWave(state, 8)
    state.transitionUntil = Infinity
    state.boss!.entering = false
    state.missiles = 1
    stepGame(state, { ...idle, missile: true })
    expect(state.boss!.health).toBeCloseTo(state.boss!.maxHealth * 0.85, 0)
  })
})

describe('bølgeflow', () => {
  it('giver bølgebonus og starter næste bølge efter en pause', () => {
    const state = createGame('medium', { seed: 5 })
    stepGame(state, idle)
    state.enemies = []
    const clear = ofType(stepGame(state, idle), 'waveClear')
    expect(clear).toEqual([{ type: 'waveClear', wave: 1, bonus: 1500, perfect: true }])
    const next = ofType(run(state, WAVE_TRANSITION_SECONDS + 0.1), 'waveStart')
    expect(next).toEqual([{ type: 'waveStart', wave: 2, kind: state.spec.kind, templateId: state.spec.templateId }])
    expect(state.spec).toEqual(buildWaveSpec(2, 'medium', 5))
    expect(state.enemies.length).toBeGreaterThan(0)
  })

  it('annoncerer en ny sektor og skifter tema når sektoren er færdig', () => {
    const state = isolated()
    state.pendingEvents = []
    startWave(state, 9)
    expect(state.spec).toMatchObject({ sector: 1, slot: 0, theme: 'asteroids' })
    expect(ofType(stepGame(state, idle), 'sectorStart')).toEqual([{ type: 'sectorStart', sector: 1, theme: 'asteroids', round: 0 }])
    startWave(state, 10)
    expect(ofType(stepGame(state, idle), 'sectorStart')).toHaveLength(0)
    startWave(state, 41)
    expect(ofType(stepGame(state, idle), 'sectorStart')).toEqual([{ type: 'sectorStart', sector: 0, theme: 'farm', round: 1 }])
  })

  it('lader bølgeplanen være uafhængig af hvad spilleren har gjort', () => {
    const state = createGame('medium', { seed: 3 })
    const planned = buildWaveSpec(12, 'medium', 3)
    for (let i = 0; i < 300; i++) stepGame(state, { ...idle, fire: true, left: i % 120 < 60, right: i % 120 >= 60 })
    startWave(state, 12)
    expect(state.spec).toEqual(planned)
  })

  it('giver ingen perfekt-bonus hvis man er blevet ramt i bølgen', () => {
    const state = createGame('medium', { seed: 5 })
    stepGame(state, idle)
    state.waveHitTaken = true
    state.enemies = []
    expect(ofType(stepGame(state, idle), 'waveClear')[0]).toMatchObject({ bonus: 500, perfect: false })
  })

  it('giver bosspoint når Mor Høne besejres og rydder derefter bølgen', () => {
    const state = isolated()
    startWave(state, 8)
    state.transitionUntil = 0
    const boss = state.boss!
    boss.entering = false
    boss.y = BOSS_Y
    boss.health = 1
    state.ship.x = boss.x
    const events = run(state, 1, { fire: true })
    expect(ofType(events, 'bossDefeated')).toHaveLength(1)
    expect(state.scoring.score).toBeGreaterThanOrEqual(BOSS_POINTS_PER_LEVEL)
    expect(getStats(state).bossesDefeated).toBe(1)
    expect(ofType(events, 'waveClear')).toHaveLength(1)
  })
})

describe('simulation', () => {
  it('kan spilles igennem hele første sektor og forbi Mor Høne uden at gå i stå', () => {
    for (const difficulty of ['easy', 'expert'] as const) {
      const state = createGame(difficulty, { seed: 11 })
      const maxSteps = Math.round(900 / STEP_SECONDS)
      for (let i = 0; i < maxSteps && state.wave < 9; i++) {
        state.ship.invulnerableUntil = Infinity
        const lowest = state.enemies.reduce<{ x: number; y: number } | null>((low, enemy) => (!low || enemy.y > low.y ? enemy : low), null)
        const target = (state.boss && bossVulnerable(state.boss) ? state.boss : null) ?? lowest
        stepGame(state, { ...idle, fire: true, pointerX: target ? target.x : null })
        const positions = [state.ship.x, ...state.enemies.flatMap((enemy) => [enemy.x, enemy.y]), ...state.eggs.flatMap((egg) => [egg.x, egg.y])]
        if (!positions.every(Number.isFinite)) throw new Error(`Ugyldig position i bølge ${state.wave} efter ${state.time.toFixed(2)} s`)
      }
      expect(state.wave).toBe(9)
      expect(state.spec.theme).toBe('asteroids')
      expect(state.stats.defeated).toEqual(['eggTrio', 'motherHen'])
    }
  })

  it('kan rydde hele kampagnen (bølge 1-48) uden NaN og møder alle de nye kyllinger, hazards og bonusbaner', () => {
    for (const difficulty of ['easy', 'expert'] as const) {
      const state = createGame(difficulty, { seed: 11 })
      const seen = new Set<string>()
      const specials = new Set<string>()
      const maxSteps = Math.round(2400 / STEP_SECONDS)
      let startedAt = 0
      for (let i = 0; i < maxSteps && state.wave < 49; i++) {
        state.ship.invulnerableUntil = Infinity
        for (const enemy of state.enemies) seen.add(enemy.kind)
        if (state.wave <= 40) specials.add(state.spec.hazard ?? state.spec.bonus ?? '')
        // Venter 8 s i hver bølge, så flyvere som ninja og UFO når at dukke op.
        if (i % 3 === 0 && state.time - startedAt > 8) snipeAll(state)
        const boss = state.boss
        if (boss && !boss.entering) state.projectiles.push({ id: state.nextId++, kind: 'bolt', x: boss.x, y: boss.y, vx: 0, vy: -1, damage: 5, pierce: false, hitIds: [], dead: false })
        const events = stepGame(state, { ...idle, fire: true, pointerX: state.enemies[0]?.x ?? null })
        if (events.some((event) => event.type === 'waveStart')) startedAt = state.time
        if (!allFinite(state)) throw new Error(`${difficulty}: ugyldigt tal i bølge ${state.wave} efter ${state.time.toFixed(2)} s`)
      }
      expect(state.wave, difficulty).toBe(49)
      expect(state.status).toBe('playing')
      for (const kind of ['shield', 'sniper', 'bomber', 'ninja', 'balloon', 'medic', 'ufo', 'turkey']) expect(seen.has(kind), `${difficulty}: ${kind}`).toBe(true)
      for (const id of ['meteorShower', 'goldRush', 'asteroidBelt', 'cometStorm', 'blackHole', 'drumstickRain', 'shootingGallery', 'eggDodge']) {
        expect(specials.has(id), `${difficulty}: ${id}`).toBe(true)
      }
    }
  }, 60_000)

  it('kan spille en hel runde (bølge 1-41) med hver våbenfamilie og alle power-ups uden NaN', () => {
    for (const family of WEAPON_FAMILIES) {
      const state = createGame('hard', { seed: 21 })
      const maxSteps = Math.round(1600 / STEP_SECONDS)
      let startedAt = 0
      let fired = 0
      for (let i = 0; i < maxSteps && state.wave < 41; i++) {
        state.ship.invulnerableUntil = Infinity
        state.weapon.family = family
        state.weapon.level = 3 + (state.wave % 3)
        if (i % 1800 === 0) for (const kind of TIMED_POWERUPS) activatePowerup(state, kind)
        // Våbnet får 10 s til selv at arbejde, før snyde-botten hjælper.
        if (i % 3 === 0 && state.time - startedAt > 10) snipeAll(state)
        const boss = state.boss
        if (boss && !boss.entering && i % 4 === 0) state.projectiles.push({ id: state.nextId++, kind: 'bolt', x: boss.x, y: boss.y, vx: 0, vy: -1, damage: 5, pierce: false, hitIds: [], dead: false })
        const lowest = state.enemies.reduce<{ x: number; y: number } | null>((low, enemy) => (!low || enemy.y > low.y ? enemy : low), null)
        const events = stepGame(state, { ...idle, fire: true, pointerX: lowest?.x ?? null })
        fired += ofType(events, 'shot').length
        if (events.some((event) => event.type === 'waveStart')) startedAt = state.time
        const extra = [...state.projectiles.flatMap((p) => [p.x, p.y, p.vx, p.vy]), state.powerups.drone.x, state.powerups.drone.y]
        if (!allFinite(state) || !extra.every(Number.isFinite)) throw new Error(`${family}: ugyldigt tal i bølge ${state.wave} efter ${state.time.toFixed(2)} s`)
      }
      expect(state.wave, family).toBe(41)
      expect(fired, family).toBeGreaterThan(100)
      expect(getStats(state).kills, family).toBeGreaterThan(300)
    }
  }, 120_000)
})

const NEW_TEMPLATES: TemplateId[] = [
  'vSquadron',
  'carousel',
  'conga',
  'pinballFlock',
  'diamondDance',
  'loopSquad',
  'twinFlanks',
  'checkerWall',
  'columnDrop',
  'arrowhead',
  'sniperNest',
  'medicSquad',
  'turkeyRaid',
  'ufoAmbush',
]

/** Finder en kampagnebølge med den ønskede skabelon, så motoren kører den helt almindeligt. */
function findWave(id: TemplateId): { seed: number; wave: number } {
  for (let seed = 1; seed < 400; seed++) {
    for (let wave = 1; wave <= 80; wave++) if (campaignWave(wave, seed).templateId === id) return { seed, wave }
  }
  throw new Error(`Ingen bølge med ${id}`)
}

function gameWith(id: TemplateId, difficulty: 'easy' | 'expert' = 'expert') {
  const { seed, wave } = findWave(id)
  const state = createGame(difficulty, { seed })
  startWave(state, wave)
  state.ship.invulnerableUntil = Infinity
  return state
}

function allFinite(state: GameState): boolean {
  const values = [
    ...state.pickups.flatMap((pickup) => [pickup.x, pickup.y]),
    ...(state.hazard?.blackHole ? [state.hazard.blackHole.x, state.hazard.blackHole.y, state.hazard.blackHole.strength] : []),
    state.ship.x,
    ...state.enemies.flatMap((enemy) => [enemy.x, enemy.y, enemy.vx, enemy.vy, enemy.dx, enemy.slotX, enemy.slotY]),
    ...state.eggs.flatMap((egg) => [egg.x, egg.y]),
    state.formation.offsetX,
    state.formation.descent,
    state.formation.t,
  ]
  return values.every(Number.isFinite)
}

/** Snyde-bot: lægger et dødbringende skud oven i hver fjende, så den rigtige drabslogik kører. */
function snipeAll(state: GameState): void {
  for (const enemy of state.enemies) {
    state.projectiles.push({ id: state.nextId++, kind: 'bolt', x: enemy.x, y: enemy.y, vx: 0, vy: -1, damage: 99, pierce: false, hitIds: [], dead: false })
  }
}

describe('formationsbølger i motoren', () => {
  it('rydder hver ny skabelon når snyde-botten skyder alle høns', () => {
    for (const id of NEW_TEMPLATES) {
      const state = gameWith(id)
      const wave = state.wave
      expect(state.enemies.length, id).toBeGreaterThanOrEqual(12)
      run(state, 6)
      expect(state.enemies.length, `${id} efter indflyvning`).toBeGreaterThan(0)
      const events: GameEvent[] = []
      for (let i = 0; i < 40 && state.enemies.length > 0; i++) {
        snipeAll(state)
        events.push(...stepGame(state, idle))
      }
      expect(state.enemies, id).toHaveLength(0)
      expect(ofType(events, 'waveClear'), id).toHaveLength(1)
      events.push(...run(state, WAVE_TRANSITION_SECONDS + 0.2))
      expect(state.wave, id).toBe(wave + 1)
    }
  })

  it('rydder også en ny skabelon med et missil', () => {
    for (const id of NEW_TEMPLATES) {
      const state = gameWith(id)
      run(state, 3)
      state.missiles = 1
      const events = run(state, 0.1, { missile: true })
      expect(ofType(events, 'waveClear'), id).toHaveLength(1)
    }
  })

  it('giver ingen NaN efter to minutters spil på ekspert', () => {
    for (const id of NEW_TEMPLATES) {
      const state = gameWith(id)
      for (let i = 0; i < Math.round(120 / STEP_SECONDS); i++) {
        state.ship.invulnerableUntil = Infinity
        const lowest = state.enemies.reduce<{ x: number; y: number } | null>((low, enemy) => (!low || enemy.y > low.y ? enemy : low), null)
        stepGame(state, { ...idle, fire: true, pointerX: lowest ? lowest.x : null })
        if (!allFinite(state)) throw new Error(`${id}: ugyldigt tal i bølge ${state.wave} efter ${state.time.toFixed(2)} s`)
      }
    }
  }, 30_000)

  it('lader hver ny skabelon kaste æg inden for 30 sekunder, fra levende høns', () => {
    for (const id of NEW_TEMPLATES) {
      const state = gameWith(id)
      state.spec.diveRate = 0
      const seen = new Set<number>()
      for (let i = 0; i < Math.round(30 / STEP_SECONDS); i++) {
        stepGame(state, idle)
        for (const egg of state.eggs) {
          if (seen.has(egg.id)) continue
          seen.add(egg.id)
          // Bombens splinter opstår midt på skærmen, langt fra hønsene.
          if (egg.kind === 'shard') continue
          const nearest = Math.min(...state.enemies.map((enemy) => Math.hypot(enemy.x - egg.x, enemy.y - egg.y)))
          expect(nearest, `${id}: ægget kom ikke fra en høne`).toBeLessThan(60)
        }
        if (state.status !== 'playing' || state.awaitingWave) break
      }
      expect(seen.size, id).toBeGreaterThan(0)
    }
  })

  it('bruger kun forreste høne pr. kolonne i gitterlignende bølger og frie medlemmer i ring og pinball', () => {
    const state = gameWith('columnDrop')
    state.spec.diveRate = 0
    run(state, 8)
    const spec = state.spec
    expect(spec.motion).toBe('bob')
    const layers = state.enemies.filter((enemy) => ENEMY_DEFS[enemy.kind].shootsEggs && enemy.mode !== 'free')
    const frontByColumn = new Map<number, number>()
    for (const enemy of layers) frontByColumn.set(enemy.slotX, Math.max(frontByColumn.get(enemy.slotX) ?? -Infinity, enemy.slotY))
    const fronts = new Set(layers.filter((enemy) => frontByColumn.get(enemy.slotX) === enemy.slotY).map((enemy) => enemy.id))
    const seen = new Set<number>()
    for (let i = 0; i < Math.round(40 / STEP_SECONDS) && state.status === 'playing'; i++) {
      stepGame(state, idle)
      for (const egg of state.eggs) {
        if (seen.has(egg.id)) continue
        seen.add(egg.id)
        // Bombehønens bomber og deres splinter har deres egen rytme.
        if (egg.kind) continue
        const shooter = layers.filter((enemy) => !enemy.dead).reduce((best, enemy) => (Math.hypot(enemy.x - egg.x, enemy.y - egg.y) < Math.hypot(best.x - egg.x, best.y - egg.y) ? enemy : best))
        expect(fronts.has(shooter.id)).toBe(true)
      }
    }
    expect(seen.size).toBeGreaterThan(0)

    const ring = gameWith('carousel')
    run(ring, 6)
    const shooters = new Set<number>()
    const eggIds = new Set<number>()
    for (let i = 0; i < Math.round(60 / STEP_SECONDS) && ring.status === 'playing'; i++) {
      stepGame(ring, idle)
      for (const egg of ring.eggs) {
        if (eggIds.has(egg.id)) continue
        eggIds.add(egg.id)
        const shooter = ring.enemies.reduce((best, enemy) => (Math.hypot(enemy.x - egg.x, enemy.y - egg.y) < Math.hypot(best.x - egg.x, best.y - egg.y) ? enemy : best))
        shooters.add(shooter.slotRow)
      }
    }
    expect(shooters.size).toBeGreaterThan(1)
  })

  it('lader løkke-dyk køre, tabe æg og bringe hønsene hjem til formationen', () => {
    const state = gameWith('loopSquad')
    run(state, 6)
    let looping = 0
    let deepest = 0
    let eggsFromLoop = 0
    for (let i = 0; i < Math.round(40 / STEP_SECONDS); i++) {
      stepGame(state, idle)
      const loopers = state.enemies.filter((enemy) => enemy.mode === 'looping')
      looping = Math.max(looping, loopers.length)
      for (const enemy of loopers) {
        deepest = Math.max(deepest, enemy.y - enemy.slotY)
        eggsFromLoop += state.eggs.filter((egg) => Math.abs(egg.x - enemy.x) < 12 && egg.y - enemy.y < 40 && egg.y - enemy.y > 0).length > 0 ? 1 : 0
      }
    }
    expect(looping).toBeGreaterThanOrEqual(1)
    expect(looping).toBeLessThanOrEqual(6)
    expect(deepest).toBeGreaterThan(80)
    expect(eggsFromLoop).toBeGreaterThan(0)
    state.spec.diveRate = 0
    run(state, 6)
    expect(state.enemies.every((enemy) => enemy.mode === 'formation')).toBe(true)
  })

  it('lader slangen og pinball-hønsene blive i spil uden at rykke ned og uden at forlade banen', () => {
    for (const id of ['conga', 'pinballFlock'] as const) {
      const state = gameWith(id)
      state.spec.eggRate = 0
      run(state, 60)
      expect(state.formation.descent, id).toBe(0)
      expect(state.enemies.length, id).toBeGreaterThanOrEqual(12)
      for (const enemy of state.enemies) {
        expect(enemy.mode, id).toBe('formation')
        expect(enemy.x).toBeGreaterThan(0)
        expect(enemy.x).toBeLessThan(FIELD.width)
        expect(enemy.y).toBeLessThan(FIELD.height * 0.6 + 1)
      }
    }
  })

  it('lader pinball-hønsene prelle af hinanden i motoren', () => {
    const state = gameWith('pinballFlock')
    state.spec.eggRate = 0
    run(state, 6)
    let worst = Infinity
    for (let i = 0; i < Math.round(30 / STEP_SECONDS); i++) {
      stepGame(state, idle)
      const flock = state.enemies.filter((enemy) => enemy.mode === 'formation')
      for (let a = 0; a < flock.length; a++) {
        for (let b = a + 1; b < flock.length; b++) {
          worst = Math.min(worst, Math.hypot(flock[a].x - flock[b].x, flock[a].y - flock[b].y) - flock[a].radius - flock[b].radius)
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(-1)
  })

  it('lader farezonen virke for bevægelser der rykker ned', () => {
    for (const id of ['vSquadron', 'carousel', 'diamondDance', 'twinFlanks', 'columnDrop'] as const) {
      const state = gameWith(id)
      state.ship.invulnerableUntil = 0
      for (const enemy of state.enemies) enemy.mode = 'formation'
      state.formation.descent = DANGER_ZONE_Y
      const events = stepGame(state, idle)
      expect(ofType(events, 'playerHit'), id).toHaveLength(1)
      expect(state.formation.descent, id).toBe(DANGER_ZONE_Y - DANGER_PUSHBACK)
    }
  })

  it('er deterministisk pr. seed for hver ny skabelon', () => {
    for (const id of NEW_TEMPLATES) {
      const play = () => {
        const state = gameWith(id)
        for (let i = 0; i < 1500; i++) stepGame(state, { ...idle, fire: true, left: i % 200 < 100, right: i % 200 >= 100 })
        return { score: state.scoring.score, positions: state.enemies.map((enemy) => [enemy.x, enemy.y]), eggs: state.eggs.length }
      }
      expect(play(), id).toEqual(play())
    }
  })
})
