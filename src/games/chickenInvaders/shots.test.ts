import { describe, it, expect } from 'vitest'
import { BOSS_Y, FIELD, STEP_SECONDS } from './config'
import { createGame, spawnEnemy, startWave, stepGame, type Enemy, type GameEvent, type GameInput, type GameState } from './engine'
import { findChain, LIGHTNING_CONE, LIGHTNING_HOP, LIGHTNING_RANGE, ROCKET_TURN_RATE } from './shots'
import { fireInterval, SPREAD_RANGE, type WeaponFamily } from './weapons'

const idle: GameInput = { left: false, right: false, up: false, down: false, fire: false, missile: false, pointerX: null, pointerY: null }

function run(state: GameState, seconds: number, input: Partial<GameInput> = {}): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < Math.round(seconds / STEP_SECONDS); i++) events.push(...stepGame(state, { ...idle, ...input }))
  return events
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)

function armed(family: WeaponFamily, level: number, seed = 1): GameState {
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
  state.weapon.family = family
  state.weapon.level = level
  return state
}

/** En robust fjende, der står stille, så skaden kan tælles. */
function dummy(state: GameState, x: number, y: number, hp = 50): Enemy {
  const enemy = spawnEnemy(state, 'helmet', x, y)
  enemy.hp = enemy.maxHp = hp
  return enemy
}

describe('lyn', () => {
  it('rammer den nærmeste fjende i keglen foran skibet, ikke en nærmere ved siden af', () => {
    const state = armed('lightning', 1)
    const { x, y } = state.ship
    const beside = dummy(state, x + 150, y - 40)
    const ahead = dummy(state, x + 20, y - 260)
    const chain = findChain(state, x, y - 24, 0)
    expect(chain.map((link) => link.enemy)).toEqual([ahead])
    expect(Math.atan2(150, 40 - 24)).toBeGreaterThan(LIGHTNING_CONE)
    expect(beside.hp).toBe(50)
  })

  it('kæder til N forskellige fjender inden for hop-afstanden og aldrig samme to gange', () => {
    const state = armed('lightning', 3)
    const { x, y } = state.ship
    const first = dummy(state, x, y - 250)
    const hops = [dummy(state, x + 90, y - 280), dummy(state, x + 180, y - 300), dummy(state, x + 270, y - 280), dummy(state, x + 360, y - 260)]
    const far = dummy(state, 60, 130)
    const events = stepGame(state, { ...idle, fire: true })
    const hit = [first, ...hops, far].filter((enemy) => enemy.hp < 50)
    expect(hit).toEqual([first, hops[0], hops[1], hops[2]])
    for (const enemy of hit) expect(enemy.hp).toBe(49)
    const [bolt] = ofType(events, 'lightning')
    expect(bolt.points).toHaveLength(2 * 5)
    expect(LIGHTNING_HOP).toBeGreaterThanOrEqual(120)
  })

  it('kæder til op til 5 ekstra på niveau 5 og rækker ikke længere end sin rækkevidde', () => {
    const state = armed('lightning', 5)
    state.ship.x = 150
    const { x, y } = state.ship
    const row = Array.from({ length: 8 }, (_, i) => dummy(state, 150 + i * 100, y - 300))
    const chain = findChain(state, x, y - 24, 5)
    expect(chain).toHaveLength(6)
    expect(new Set(chain.map((link) => link.enemy)).size).toBe(6)
    state.enemies = []
    dummy(state, x, y - 24 - LIGHTNING_RANGE - 30)
    expect(findChain(state, x, y - 24, 5)).toHaveLength(0)
    expect(row.length).toBe(8)
  })

  it('rammer også Mor Høne', () => {
    const state = armed('lightning', 1)
    startWave(state, 8)
    state.transitionUntil = Infinity
    state.enemies = []
    const boss = state.boss!
    boss.entering = false
    boss.y = BOSS_Y
    boss.x = state.ship.x
    boss.nextVolleyAt = boss.nextChicksAt = boss.nextLaserAt = Infinity
    state.ship.y = BOSS_Y + 260
    const health = boss.health
    const events = stepGame(state, { ...idle, fire: true })
    expect(boss.health).toBe(health - 1)
    expect(ofType(events, 'bossHit')).toHaveLength(1)
  })

  it('jorder de ubrugte led i bossen, så et højt niveau også kan fælde bosser, og når den fra bunden', () => {
    for (const [level, damage] of [[1, 1], [3, 2], [5, 3]] as const) {
      const state = armed('lightning', level)
      startWave(state, 8)
      state.transitionUntil = Infinity
      state.enemies = []
      const boss = state.boss!
      boss.entering = false
      boss.y = BOSS_Y
      boss.x = state.ship.x + 60
      boss.nextVolleyAt = boss.nextChicksAt = boss.nextLaserAt = Infinity
      state.ship.y = 544
      const health = boss.health
      stepGame(state, { ...idle, fire: true })
      expect(health - boss.health, `niveau ${level}`).toBe(damage)
    }
  })

  it('slår ud i luften uden mål, men koster stadig varme', () => {
    const state = armed('lightning', 1)
    const events = stepGame(state, { ...idle, fire: true })
    expect(ofType(events, 'lightning')).toHaveLength(1)
    expect(state.weapon.heat).toBeGreaterThan(0)
    expect(state.projectiles).toHaveLength(0)
  })
})

describe('laser', () => {
  const damageInOneSecond = (level: number) => {
    const state = armed('laser', level)
    const { x, y } = state.ship
    const column = [dummy(state, x, y - 100, 200), dummy(state, x + 4, y - 250, 200), dummy(state, x - 4, 140, 200)]
    const outside = dummy(state, x + 80, y - 200, 200)
    run(state, 1, { fire: true })
    return { column: column.map((enemy) => 200 - enemy.hp), outside: 200 - outside.hp }
  }

  it('skader alt i sin kolonne hvert tik og intet uden for den', () => {
    const { column, outside } = damageInOneSecond(1)
    const expected = Math.floor(1 / fireInterval(1, 'laser')) + 1
    for (const damage of column) expect(Math.abs(damage - expected)).toBeLessThanOrEqual(1)
    expect(outside).toBe(0)
  })

  it('giver mere skade pr. sekund og bredere stråle på højere niveau', () => {
    expect(damageInOneSecond(5).column[0]).toBeGreaterThan(damageInOneSecond(1).column[0])
    const wide = armed('laser', 5)
    const side = dummy(wide, wide.ship.x + 36, wide.ship.y - 200)
    const narrow = armed('laser', 1)
    const miss = dummy(narrow, narrow.ship.x + 30, narrow.ship.y - 200)
    run(wide, 0.3, { fire: true })
    run(narrow, 0.3, { fire: true })
    expect(side.hp).toBeLessThan(50)
    expect(miss.hp).toBe(50)
  })

  it('melder strålen hvert tik og rammer kun over skibet', () => {
    const state = armed('laser', 2)
    const below = dummy(state, state.ship.x, state.ship.y - 300)
    state.ship.y = 300
    const under = dummy(state, state.ship.x, 420)
    const events = run(state, 0.5, { fire: true })
    expect(ofType(events, 'beam').length).toBeGreaterThanOrEqual(3)
    expect(below.hp).toBeLessThan(50)
    expect(under.hp).toBe(50)
  })
  it('brænder dobbelt så hårdt på bosser og deres tårne som på høns', () => {
    const state = armed('laser', 1)
    startWave(state, 8)
    state.transitionUntil = Infinity
    state.enemies = []
    const boss = state.boss!
    boss.entering = false
    boss.y = BOSS_Y
    boss.x = state.ship.x
    boss.nextVolleyAt = boss.nextChicksAt = boss.nextLaserAt = Infinity
    const health = boss.health
    stepGame(state, { ...idle, fire: true })
    expect(health - boss.health).toBe(2)
    const part = spawnEnemy(state, 'bossPart', state.ship.x, 300)
    part.hp = part.maxHp = 50
    state.weapon.lastShotAt = -Infinity
    stepGame(state, { ...idle, fire: true })
    expect(50 - part.hp).toBe(2)
  })
})

describe('fjer-hagl', () => {
  it('lader haglkornene forsvinde efter rækkevidden', () => {
    const state = armed('spread', 3)
    const startY = state.ship.y - 24
    stepGame(state, { ...idle, fire: true })
    expect(state.projectiles.length).toBe(7)
    let travelled = 0
    for (let i = 0; i < 120 && state.projectiles.length > 0; i++) {
      for (const pellet of state.projectiles) travelled = Math.max(travelled, Math.hypot(pellet.x - state.ship.x, pellet.y - startY))
      stepGame(state, idle)
    }
    expect(state.projectiles).toHaveLength(0)
    expect(travelled).toBeLessThanOrEqual(SPREAD_RANGE + 20)
    expect(travelled).toBeGreaterThan(SPREAD_RANGE - 40)
  })

  it('rammer tæt på, men ikke langt væk', () => {
    const state = armed('spread', 1)
    const near = dummy(state, state.ship.x, state.ship.y - 200)
    const far = dummy(state, state.ship.x + 200, state.ship.y - 520)
    stepGame(state, { ...idle, fire: true })
    run(state, 1.5)
    expect(near.hp).toBeLessThan(50)
    expect(far.hp).toBe(50)
  })
})

describe('målsøgende raketter', () => {
  it('drejer mod målet med begrænset drejehastighed og rammer det', () => {
    const state = armed('homing', 1)
    const target = spawnEnemy(state, 'hen', state.ship.x + 260, state.ship.y - 260)
    stepGame(state, { ...idle, fire: true })
    const [rocket] = state.projectiles
    expect(rocket.kind).toBe('rocket')
    let heading = Math.atan2(rocket.vx, -rocket.vy)
    for (let i = 0; i < 10; i++) {
      stepGame(state, idle)
      const next = Math.atan2(rocket.vx, -rocket.vy)
      expect(Math.abs(next - heading)).toBeLessThanOrEqual(ROCKET_TURN_RATE * STEP_SECONDS + 1e-6)
      heading = next
    }
    expect(rocket.vx).toBeGreaterThan(0)
    const kills = ofType(run(state, 2), 'kill')
    expect(kills).toHaveLength(1)
    expect(target.dead).toBe(true)
  })

  it('finder et nyt mål, når målet dør', () => {
    const state = armed('homing', 1)
    const first = dummy(state, state.ship.x - 200, 200)
    const second = dummy(state, state.ship.x + 300, 180)
    stepGame(state, { ...idle, fire: true })
    const [rocket] = state.projectiles
    stepGame(state, idle)
    expect(rocket.targetId).toBe(first.id)
    first.dead = true
    stepGame(state, idle)
    expect(rocket.targetId).toBe(second.id)
    run(state, 2.5)
    expect(second.hp).toBe(48)
  })

  it('fordeler en salve på forskellige mål i stedet for at spilde dem på samme høne', () => {
    const state = armed('homing', 5)
    const hens = [spawnEnemy(state, 'hen', 300, 200), spawnEnemy(state, 'hen', 480, 180), spawnEnemy(state, 'hen', 660, 200), spawnEnemy(state, 'hen', 480, 90)]
    stepGame(state, { ...idle, fire: true })
    const targets = state.projectiles.map((rocket) => rocket.targetId)
    expect(new Set(targets).size).toBe(4)
    run(state, 2.5)
    expect(hens.every((hen) => hen.dead)).toBe(true)
  })

  it('flyver lige op uden mål og forsvinder igen', () => {
    const state = armed('homing', 4)
    stepGame(state, { ...idle, fire: true })
    expect(state.projectiles).toHaveLength(3)
    run(state, 4)
    expect(state.projectiles).toHaveLength(0)
    expect(state.time).toBeGreaterThan(0)
    expect(FIELD.width).toBe(960)
  })
})
