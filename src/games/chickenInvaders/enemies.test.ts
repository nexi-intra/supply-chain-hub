import { describe, it, expect } from 'vitest'
import { FIELD, SHIP_Y, STEP_SECONDS } from './config'
import { createGame, spawnEnemy, spawnFlyby, startWave, stepGame, type GameEvent, type GameInput, type GameState } from './engine'
import {
  BOMB_SHARDS,
  ENEMY_DEFS,
  MEDIC_INTERVAL,
  MEDIC_RANGE,
  SHIELD_HITS,
  SNIPER_MAX_ANGLE,
  SPECIAL_KINDS,
  TURKEY_WOBBLE_SECONDS,
  UFO_STEAL_SECONDS,
  UFO_WARNING_SECONDS,
  aimVelocity,
} from './enemies'

const idle: GameInput = { left: false, right: false, up: false, down: false, fire: false, missile: false, pointerX: null, pointerY: null }

function run(state: GameState, seconds: number, input: Partial<GameInput> | (() => Partial<GameInput>) = {}): GameEvent[] {
  const events: GameEvent[] = []
  const steps = Math.round(seconds / STEP_SECONDS)
  for (let i = 0; i < steps; i++) events.push(...stepGame(state, { ...idle, ...(typeof input === 'function' ? input() : input) }))
  return events
}

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
  state.spec.eggRate = 0
  state.spec.diveRate = 0
  state.ship.invulnerableUntil = Infinity
  return state
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)

describe('fjendetabellen', () => {
  it('har liv, point, radius og skjold for hver ny kylling', () => {
    const expected = {
      shield: { hp: 1, points: 300 },
      sniper: { hp: 2, points: 300 },
      bomber: { hp: 2, points: 350 },
      ninja: { hp: 1, points: 300 },
      balloon: { hp: 2, points: 200 },
      medic: { hp: 2, points: 400 },
      ufo: { hp: 6, points: 800 },
      turkey: { hp: 3, points: 450 },
      rainbow: { hp: 1, points: 2000 },
    }
    expect([...SPECIAL_KINDS].sort()).toEqual(Object.keys(expected).sort())
    for (const kind of SPECIAL_KINDS) {
      expect(ENEMY_DEFS[kind], kind).toMatchObject(expected[kind])
      expect(ENEMY_DEFS[kind].radius, kind).toBeGreaterThanOrEqual(14)
      expect(ENEMY_DEFS[kind].radius, kind).toBeLessThanOrEqual(34)
    }
    expect(ENEMY_DEFS.shield.shield).toBe(SHIELD_HITS)
    expect(SHIELD_HITS).toBe(4)
    expect(ENEMY_DEFS.hen).toMatchObject({ hp: 1, points: 100, radius: 18 })
    expect(ENEMY_DEFS.helmet).toMatchObject({ hp: 3, points: 250 })
  })

  it('kræver kun formationsfjender for at rydde bølgen', () => {
    for (const kind of ['ninja', 'ufo', 'rainbow', 'golden'] as const) expect(ENEMY_DEFS[kind].requiredForClear, kind).toBe(false)
    for (const kind of ['hen', 'helmet', 'diver', 'chick', 'meteor', 'shield', 'sniper', 'bomber', 'balloon', 'medic', 'turkey'] as const) {
      expect(ENEMY_DEFS[kind].requiredForClear, kind).toBe(true)
    }
  })

  it('lader sygeplejersker, bombehøns, kalkuner og flyvere holde sig fra den almindelige æggeregn', () => {
    for (const kind of ['medic', 'bomber', 'turkey', 'ninja', 'ufo', 'rainbow', 'golden', 'meteor', 'chick'] as const) expect(ENEMY_DEFS[kind].shootsEggs, kind).toBe(false)
    for (const kind of ['hen', 'helmet', 'diver', 'shield', 'sniper', 'balloon'] as const) expect(ENEMY_DEFS[kind].shootsEggs, kind).toBe(true)
  })

  it('giver nye fjender tabellens liv og radius i motoren', () => {
    const state = isolated()
    for (const kind of SPECIAL_KINDS) {
      const enemy = spawnEnemy(state, kind, 100, 100)
      expect(enemy.hp, kind).toBe(ENEMY_DEFS[kind].hp)
      expect(enemy.maxHp, kind).toBe(ENEMY_DEFS[kind].hp)
      expect(enemy.radius, kind).toBe(ENEMY_DEFS[kind].radius)
      expect(enemy.shield, kind).toBe(kind === 'shield' ? SHIELD_HITS : 0)
    }
  })
})

describe('skjoldhøne', () => {
  it('lader skjoldet tage 4 træf, der revner det synligt, og er derefter en almindelig høne', () => {
    const state = isolated()
    const hen = spawnEnemy(state, 'shield', state.ship.x, 300)
    const shields: number[] = []
    const events: GameEvent[] = []
    for (let i = 0; i < Math.round(2 / STEP_SECONDS); i++) {
      const step = stepGame(state, { ...idle, fire: true })
      events.push(...step)
      if (ofType(step, 'hit').length > 0) shields.push(hen.shield)
    }
    const hits = ofType(events, 'hit')
    expect(hits.filter((hit) => hit.shielded)).toHaveLength(SHIELD_HITS)
    expect(shields).toEqual([3, 2, 1, 0])
    expect(ofType(events, 'shieldBreak')).toHaveLength(1)
    const kills = ofType(events, 'kill')
    expect(kills).toHaveLength(1)
    expect(kills[0]).toMatchObject({ kind: 'shield', points: 300 })
  })

  it('lader ét kraftigt skud kun fjerne ét skjoldpunkt', () => {
    const state = isolated()
    const hen = spawnEnemy(state, 'shield', 300, 300)
    state.projectiles.push({ id: state.nextId++, kind: 'ion', x: 300, y: 300, vx: 0, vy: -1, damage: 99, pierce: false, hitIds: [], dead: false })
    stepGame(state, idle)
    expect(hen.shield).toBe(SHIELD_HITS - 1)
    expect(hen.hp).toBe(1)
    expect(hen.dead).toBe(false)
  })
})

describe('snigskytte', () => {
  it('sigter sine æg mod skibet med æggefarten', () => {
    const state = isolated()
    state.ship.x = 600
    const sniper = spawnEnemy(state, 'sniper', 480, 150)
    sniper.cooldown = 0
    stepGame(state, idle)
    expect(state.eggs).toHaveLength(1)
    const egg = state.eggs[0]
    expect(egg.vx).toBeGreaterThan(0)
    const expected = Math.atan2(600 - 480, SHIP_Y - (150 + sniper.radius))
    expect(Math.atan2(egg.vx, egg.vy)).toBeCloseTo(expected, 2)
    expect(Math.hypot(egg.vx, egg.vy)).toBeCloseTo(state.spec.eggSpeed, 3)
  })

  it('holder vinklen læselig, selv når skibet står langt ude til siden', () => {
    const velocity = aimVelocity(100, 100, 900, 140, 200)
    expect(Math.atan2(velocity.vx, velocity.vy)).toBeCloseTo(SNIPER_MAX_ANGLE, 5)
    expect(Math.hypot(velocity.vx, velocity.vy)).toBeCloseTo(200, 5)
    const left = aimVelocity(800, 100, 0, 600, 200)
    expect(Math.atan2(left.vx, left.vy)).toBeCloseTo(-SNIPER_MAX_ANGLE, 5)
    const straight = aimVelocity(300, 100, 300, 600, 250)
    expect(straight).toEqual({ vx: 0, vy: 250 })
  })

  it('skyder selv kun når den står forrest, og ellers venter den på den fælles æggeregn', () => {
    const eggs = (blocked: boolean) => {
      const state = isolated()
      spawnEnemy(state, 'sniper', 480, 150)
      if (blocked) spawnEnemy(state, 'hen', 485, 210)
      return ofType(run(state, 20), 'eggSplat').length + state.eggs.length
    }
    expect(eggs(false)).toBeGreaterThanOrEqual(5)
    expect(eggs(true)).toBe(0)
  })

  it('holder antallet af sigtede æg i luften nede, selv med en hel række snigskytter', () => {
    const state = isolated()
    for (let i = 0; i < 6; i++) spawnEnemy(state, 'sniper', 200 + i * 100, 150)
    let most = 0
    for (let i = 0; i < Math.round(15 / STEP_SECONDS); i++) {
      stepGame(state, idle)
      most = Math.max(most, state.eggs.filter((egg) => egg.kind === 'aimed').length)
    }
    expect(most).toBeGreaterThanOrEqual(2)
    expect(most).toBeLessThanOrEqual(3)
  })

  it('bruger sigtede æg, også når den trækkes i den fælles æggeregn', () => {
    const state = isolated()
    state.ship.x = 700
    const sniper = spawnEnemy(state, 'sniper', 400, 150)
    spawnEnemy(state, 'hen', 405, 210)
    sniper.mode = 'formation'
    sniper.slotX = 400
    sniper.slotY = 150
    sniper.cooldown = Infinity
    state.spec.eggRate = 1000
    state.enemies = [sniper]
    stepGame(state, idle)
    expect(state.eggs.length).toBeGreaterThan(0)
    expect(state.eggs[0].vx).toBeGreaterThan(0)
  })
})

describe('bombehøne', () => {
  it('taber et stort blinkende æg, der sprænger i 6 splinter midt på skærmen', () => {
    const state = isolated()
    state.ship.x = 100
    const bomber = spawnEnemy(state, 'bomber', 600, 120)
    bomber.cooldown = 0
    const dropEvents = stepGame(state, idle)
    expect(ofType(dropEvents, 'bombDrop')).toHaveLength(1)
    const bombs = state.eggs.filter((egg) => egg.kind === 'bomb')
    expect(bombs).toHaveLength(1)
    const bomb = bombs[0]
    expect(bomb.vx).toBe(0)
    expect(bomb.vy).toBeGreaterThan(0)
    expect(bomb.vy).toBeLessThan(state.spec.eggSpeed)
    bomber.cooldown = Infinity
    let burst: Extract<GameEvent, { type: 'bombBurst' }> | undefined
    for (let i = 0; i < Math.round(5 / STEP_SECONDS) && !burst; i++) burst = ofType(stepGame(state, idle), 'bombBurst')[0]
    expect(burst).toBeDefined()
    expect(burst!.y).toBeGreaterThan(FIELD.height * 0.35)
    expect(burst!.y).toBeLessThan(FIELD.height * 0.65)
    expect(state.eggs.filter((egg) => egg.kind === 'bomb')).toHaveLength(0)
    const shards = state.eggs.filter((egg) => egg.kind === 'shard')
    expect(shards).toHaveLength(BOMB_SHARDS)
    expect(BOMB_SHARDS).toBe(6)
    const speeds = shards.map((shard) => Math.hypot(shard.vx, shard.vy))
    for (const speed of speeds) expect(speed).toBeCloseTo(speeds[0], 5)
    const angles = shards.map((shard) => Math.atan2(shard.vy, shard.vx)).sort((a, b) => a - b)
    for (let i = 1; i < angles.length; i++) expect(angles[i] - angles[i - 1]).toBeCloseTo(Math.PI / 3, 5)
    expect(shards.some((shard) => Math.abs(shard.vx) < 1e-6 && shard.vy > 0)).toBe(true)
  })

  it('lader splinterne forsvinde ved kanten og ramme skibet', () => {
    const state = isolated()
    state.ship.invulnerableUntil = 0
    state.eggs.push({ id: state.nextId++, x: state.ship.x, y: 300, vx: 0, vy: 200, kind: 'bomb', burstY: 301 })
    const events = run(state, 2)
    expect(ofType(events, 'bombBurst')).toHaveLength(1)
    expect(ofType(events, 'playerHit')).toHaveLength(1)
    run(state, 4)
    expect(state.eggs).toHaveLength(0)
  })

  it('lægger ikke almindelige æg og har højst to bomber i luften', () => {
    const state = isolated()
    for (let i = 0; i < 5; i++) spawnEnemy(state, 'bomber', 100 + i * 150, 120).cooldown = 0
    stepGame(state, idle)
    expect(state.eggs.filter((egg) => egg.kind === 'bomb').length).toBeLessThanOrEqual(2)
    expect(state.eggs.filter((egg) => egg.kind === undefined)).toHaveLength(0)
  })
})

describe('ninja-kylling', () => {
  it('flyver hurtigt i zigzag tværs over skærmen og flygter, hvis den ikke bliver skudt', () => {
    const state = isolated()
    const ninja = spawnFlyby(state, 'ninja')
    const xs: number[] = []
    const ys: number[] = []
    const events: GameEvent[] = []
    for (let i = 0; i < Math.round(8 / STEP_SECONDS) && !ninja.dead && state.enemies.includes(ninja); i++) {
      events.push(...stepGame(state, idle))
      xs.push(ninja.x)
      ys.push(ninja.y)
    }
    const direction = Math.sign(xs[xs.length - 1] - xs[0])
    for (let i = 1; i < xs.length; i++) expect(Math.sign(xs[i] - xs[i - 1])).toBe(direction)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(40)
    let turns = 0
    for (let i = 2; i < ys.length; i++) if (Math.sign(ys[i] - ys[i - 1]) !== Math.sign(ys[i - 1] - ys[i - 2]) && ys[i] !== ys[i - 1]) turns++
    expect(turns).toBeGreaterThanOrEqual(3)
    expect(Math.abs(xs[1] - xs[0]) / STEP_SECONDS).toBeGreaterThanOrEqual(240)
    expect(ofType(events, 'escape')).toEqual([{ type: 'escape', kind: 'ninja' }])
    expect(state.enemies).not.toContain(ninja)
    expect(Math.max(...ys)).toBeLessThan(FIELD.height * 0.6)
  })

  it('blokerer ikke for at rydde bølgen', () => {
    const state = isolated()
    spawnFlyby(state, 'ninja')
    state.transitionUntil = 0
    const events = stepGame(state, idle)
    expect(ofType(events, 'waveClear')).toHaveLength(1)
  })
})

describe('ballonhøne', () => {
  it('deler sig i 3 kyllinger, når den dør', () => {
    const state = isolated()
    spawnEnemy(state, 'balloon', state.ship.x, 300)
    let killed = false
    for (let i = 0; i < Math.round(2 / STEP_SECONDS) && !killed; i++) killed = ofType(stepGame(state, { ...idle, fire: true }), 'kill').some((kill) => kill.kind === 'balloon')
    expect(killed).toBe(true)
    const chicks = state.enemies.filter((enemy) => enemy.kind === 'chick')
    expect(chicks).toHaveLength(3)
    expect(new Set(chicks.map((chick) => Math.round(chick.x))).size).toBe(3)
  })

  it('giver ingen kyllinger når et missil tager den', () => {
    const state = isolated()
    spawnEnemy(state, 'balloon', 300, 200)
    state.missiles = 1
    stepGame(state, { ...idle, missile: true })
    expect(state.enemies.filter((enemy) => enemy.kind === 'chick')).toHaveLength(0)
  })
})

describe('sygeplejerske', () => {
  it('heler hver 3. sekund +1 liv på nabo-hjelme og skjolde inden for 120 px, op til max', () => {
    expect(MEDIC_INTERVAL).toBe(3)
    expect(MEDIC_RANGE).toBe(120)
    const state = isolated()
    const medic = spawnEnemy(state, 'medic', 480, 150)
    medic.cooldown = MEDIC_INTERVAL
    const near = spawnEnemy(state, 'helmet', 580, 150)
    near.hp = 1
    const far = spawnEnemy(state, 'helmet', 480 + MEDIC_RANGE + 30, 150)
    far.hp = 1
    const full = spawnEnemy(state, 'helmet', 420, 150)
    const bubble = spawnEnemy(state, 'shield', 480, 230)
    bubble.shield = 2
    const sniper = spawnEnemy(state, 'sniper', 440, 200)
    sniper.hp = 1
    sniper.cooldown = Infinity

    expect(ofType(run(state, MEDIC_INTERVAL - 0.1), 'heal')).toHaveLength(0)
    expect(near.hp).toBe(1)
    const heals = ofType(run(state, 0.2), 'heal')
    expect(heals).toHaveLength(1)
    expect(heals[0]).toMatchObject({ x: medic.x, y: medic.y })
    expect(heals[0].targets).toHaveLength(2)
    expect(near.hp).toBe(2)
    expect(far.hp).toBe(1)
    expect(full.hp).toBe(full.maxHp)
    expect(bubble.shield).toBe(3)
    expect(sniper.hp).toBe(1)

    run(state, MEDIC_INTERVAL * 2)
    expect(near.hp).toBe(near.maxHp)
    expect(bubble.shield).toBe(SHIELD_HITS)
    expect(ofType(run(state, MEDIC_INTERVAL), 'heal')).toHaveLength(0)
  })

  it('reparerer ikke en boble, der allerede er sprængt', () => {
    const state = isolated()
    spawnEnemy(state, 'medic', 480, 150).cooldown = 0.01
    const broken = spawnEnemy(state, 'shield', 500, 160)
    broken.shield = 0
    run(state, 0.1)
    expect(broken.shield).toBe(0)
  })
})

describe('UFO-kylling', () => {
  it('flyver hen over toppen og varsler sin traktorstråle', () => {
    const state = isolated()
    const ufo = spawnFlyby(state, 'ufo')
    expect(ufo.y).toBeLessThan(110)
    expect(Math.abs(ufo.vx)).toBeGreaterThan(0)
    ufo.x = state.ship.x
    ufo.cooldown = 0
    state.weapon.level = 3
    const events = run(state, UFO_WARNING_SECONDS - 0.05, () => ({ pointerX: ufo.x }))
    expect(ofType(events, 'tractorBeam')).toHaveLength(1)
    expect(state.weapon.level).toBe(3)
  })

  it('stjæler præcis ét våbenniveau når skibet står i strålen i 1 s', () => {
    const state = isolated()
    const ufo = spawnFlyby(state, 'ufo')
    ufo.x = state.ship.x
    ufo.cooldown = 0
    state.weapon.level = 3
    const follow = () => ({ pointerX: ufo.x })
    run(state, UFO_WARNING_SECONDS + UFO_STEAL_SECONDS - 0.1, follow)
    expect(state.weapon.level).toBe(3)
    const events = run(state, 0.2, follow)
    expect(ofType(events, 'weaponStolen')).toHaveLength(1)
    expect(state.weapon.level).toBe(2)
    expect(ufo.stolen).toBe(true)
    run(state, 3, follow)
    expect(state.weapon.level).toBe(2)
  })

  it('kræver at skibet bliver i strålen hele sekundet', () => {
    const state = isolated()
    const ufo = spawnFlyby(state, 'ufo')
    ufo.x = state.ship.x
    ufo.cooldown = 0
    state.weapon.level = 3
    run(state, UFO_WARNING_SECONDS + 0.6, () => ({ pointerX: ufo.x }))
    run(state, 0.3, () => ({ pointerX: ufo.x + 300 }))
    run(state, 0.6, () => ({ pointerX: ufo.x }))
    expect(state.weapon.level).toBe(3)
  })

  it('husker den stjålne familie og giver den tilbage i gaven, når den skydes ned', () => {
    const state = isolated()
    const ufo = spawnFlyby(state, 'ufo')
    ufo.x = state.ship.x
    ufo.cooldown = 0
    state.weapon.family = 'laser'
    state.weapon.level = 4
    run(state, UFO_WARNING_SECONDS + UFO_STEAL_SECONDS + 0.1, () => ({ pointerX: ufo.x }))
    expect(state.weapon).toMatchObject({ family: 'laser', level: 3 })
    expect(ufo.stolenFamily).toBe('laser')
    state.weapon.family = 'blaster'
    ufo.vx = 0
    ufo.hp = 1
    ufo.cooldown = Infinity
    ufo.stage = 0
    run(state, 1.5, { fire: true, pointerX: ufo.x })
    expect(ufo.dead).toBe(true)
    const gifts = state.pickups.filter((pickup) => pickup.kind === 'gift')
    expect(gifts).toHaveLength(1)
    expect(gifts[0].family).toBe('laser')
  })

  it('giver en gave i en seedet farve, hvis den ikke nåede at stjæle', () => {
    const state = isolated()
    const ufo = spawnFlyby(state, 'ufo')
    ufo.x = state.ship.x
    ufo.vx = 0
    ufo.cooldown = Infinity
    ufo.hp = 1
    run(state, 1.5, { fire: true })
    const gift = state.pickups.find((pickup) => pickup.kind === 'gift')
    expect(gift?.family).toBeDefined()
  })

  it('går aldrig under våbenniveau 1', () => {
    const state = isolated()
    const ufo = spawnFlyby(state, 'ufo')
    ufo.x = state.ship.x
    ufo.cooldown = 0
    state.weapon.level = 1
    const events = run(state, UFO_WARNING_SECONDS + UFO_STEAL_SECONDS + 0.5, () => ({ pointerX: ufo.x }))
    expect(state.weapon.level).toBe(1)
    expect(ofType(events, 'weaponStolen')).toHaveLength(0)
  })

  it('dropper en gave, når den bliver skudt ned, og flygter ellers uden at blokere bølgen', () => {
    const state = isolated()
    const ufo = spawnFlyby(state, 'ufo')
    ufo.x = state.ship.x
    ufo.vx = 0
    ufo.cooldown = Infinity
    ufo.hp = 1
    const events = run(state, 1.5, { fire: true })
    expect(ofType(events, 'kill')[0]).toMatchObject({ kind: 'ufo', points: 800 })
    expect(state.pickups.some((pickup) => pickup.kind === 'gift')).toBe(true)

    const other = isolated()
    spawnFlyby(other, 'ufo')
    other.transitionUntil = 0
    expect(ofType(stepGame(other, idle), 'waveClear')).toHaveLength(1)
    const escaped = isolated()
    spawnFlyby(escaped, 'ufo')
    expect(ofType(run(escaped, 30), 'escape')).toEqual([{ type: 'escape', kind: 'ufo' }])
  })
})

describe('kamikaze-kalkun', () => {
  it('vrikker 0,8 s som varsel og styrtdykker så lige mod skibets position', () => {
    expect(TURKEY_WOBBLE_SECONDS).toBe(0.8)
    const state = isolated()
    state.ship.x = 300
    const turkey = spawnEnemy(state, 'turkey', 600, 150)
    turkey.mode = 'formation'
    turkey.slotX = 600
    turkey.slotY = 150
    turkey.cooldown = 0
    const warn = stepGame(state, idle)
    expect(ofType(warn, 'turkeyWarn')).toHaveLength(1)
    expect(turkey.mode).toBe('wobble')
    run(state, TURKEY_WOBBLE_SECONDS - 0.1)
    expect(turkey.mode).toBe('wobble')
    expect(Math.abs(turkey.y - 150)).toBeLessThan(6)
    run(state, 0.15)
    expect(turkey.mode).toBe('kamikaze')
    const angle = Math.atan2(turkey.vy, turkey.vx)
    expect(turkey.vx).toBeLessThan(0)
    const from = { x: turkey.x - turkey.vx * STEP_SECONDS, y: turkey.y - turkey.vy * STEP_SECONDS }
    expect(angle).toBeCloseTo(Math.atan2(state.ship.y - from.y, 300 - from.x), 1)
    state.ship.invulnerableUntil = 0
    expect(ofType(run(state, 2), 'playerHit')).toHaveLength(1)
  })

  it('vender tilbage til formationen, hvis den misser', () => {
    const state = isolated()
    const turkey = spawnEnemy(state, 'turkey', 600, 150)
    turkey.mode = 'formation'
    turkey.slotX = 600
    turkey.slotY = 150
    turkey.cooldown = 0
    run(state, TURKEY_WOBBLE_SECONDS + 0.1)
    state.ship.x = 900
    run(state, 8)
    expect(turkey.dead).toBe(false)
    expect(turkey.mode).toBe('formation')
  })
})

describe('regnbuehøne', () => {
  it('flyver tværs over og dropper en tilfældig power-up for 2.000 point', () => {
    const state = isolated()
    const rainbow = spawnFlyby(state, 'rainbow')
    expect(Math.abs(rainbow.vx)).toBeGreaterThan(0)
    rainbow.x = state.ship.x
    rainbow.vx = 0
    const events = run(state, 1.2, { fire: true })
    expect(ofType(events, 'kill')[0]).toMatchObject({ kind: 'rainbow', points: 2000 })
    const drops = state.pickups.filter((pickup) => pickup.kind !== 'drumstick')
    expect(drops).toHaveLength(1)
    expect(['gift', 'shield', 'missile', 'drone', 'slowmo', 'magnet', 'double', 'life']).toContain(drops[0].kind)
  })
})

describe('introduktion af nye fjender', () => {
  it('melder hver ny type én gang pr. spil, når den først dukker op', () => {
    const state = createGame('medium', { seed: 1 })
    expect(ofType(stepGame(state, idle), 'newEnemy')).toHaveLength(0)
    const seen = new Map<string, number>()
    for (let wave = 2; wave <= 40; wave++) {
      startWave(state, wave)
      for (const event of ofType(stepGame(state, idle), 'newEnemy')) seen.set(event.kind, (seen.get(event.kind) ?? 0) + 1)
      const present = new Set(state.enemies.map((enemy) => enemy.kind))
      for (const kind of present) if ((SPECIAL_KINDS as readonly string[]).includes(kind)) expect(seen.has(kind), `bølge ${wave}: ${kind}`).toBe(true)
    }
    expect(seen.size).toBeGreaterThanOrEqual(5)
    for (const count of seen.values()) expect(count).toBe(1)
  })

  it('melder også flyvere første gang de dukker op', () => {
    const state = isolated()
    spawnFlyby(state, 'ninja')
    expect(ofType(stepGame(state, idle), 'newEnemy')).toEqual([{ type: 'newEnemy', kind: 'ninja' }])
    spawnFlyby(state, 'ninja')
    expect(ofType(stepGame(state, idle), 'newEnemy')).toHaveLength(0)
  })
})
