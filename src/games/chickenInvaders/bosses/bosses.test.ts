import { describe, it, expect } from 'vitest'
import { FIELD, SHIP_MAX_Y, SHIP_MIN_Y, STEP_SECONDS } from '../config'
import { beginWave, getStats, stepGame, type Enemy, type GameState } from '../engine'
import { activatePowerup } from '../powerups'
import { ALL_BOSS_IDS, beamEnd, beamHits, damageBoss, type BossState } from './index'
import { BOSS_WAVES, bossGame, idle, ofType, readyBoss, run, type BossKey } from './testKit'

const boss = (state: GameState): BossState => state.boss!
const parts = (state: GameState): Enemy[] => state.enemies.filter((enemy) => enemy.kind === 'bossPart' && !enemy.dead)

function shoot(state: GameState, x: number, y: number, damage = 1): void {
  state.projectiles.push({ id: state.nextId++, kind: 'bolt', x, y, vx: 0, vy: -1, damage, pierce: false, hitIds: [], dead: false })
}

function toPhase(state: GameState, phase: 2 | 3): void {
  const b = boss(state)
  damageBoss(b, b.health - b.maxHealth * (phase === 2 ? 0.5 : 0.2))
  expect(b.phase).toBe(phase)
}

/** Kører indtil bossen starter det ønskede angreb; returnerer varslets længde. */
function untilAttack(state: GameState, attack: string, seconds = 40): number {
  for (let i = 0; i < Math.round(seconds / STEP_SECONDS); i++) {
    state.ship.invulnerableUntil = Infinity
    const charge = ofType(stepGame(state, idle), 'bossCharge').find((event) => event.attack === attack)
    if (charge) return charge.seconds
  }
  throw new Error(`${attack} kom aldrig`)
}

const killParts = (state: GameState) => {
  for (const part of parts(state)) shoot(state, part.x, part.y, 999)
  run(state, STEP_SECONDS * 2)
}

describe('Æggeroiden', () => {
  it('kaster meteor-klumper fra skallen i fase 1', () => {
    const state = bossGame('eggeroid')
    readyBoss(state)
    const meteors = new Set<number>()
    const events = run(state, 10, (s) => {
      s.ship.invulnerableUntil = Infinity
      for (const enemy of s.enemies) if (enemy.kind === 'meteor') meteors.add(enemy.id)
      return {}
    })
    expect(ofType(events, 'bossCharge').map((event) => event.attack)).toContain('chunks')
    expect(meteors.size).toBeGreaterThanOrEqual(3)
  })

  it('skyder en roterende spiral af æg i fase 2', () => {
    const state = bossGame('eggeroid')
    readyBoss(state)
    toPhase(state, 2)
    untilAttack(state, 'spiral')
    const seen = new Set<number>()
    const angles: number[] = []
    run(state, 3, (s) => {
      s.ship.invulnerableUntil = Infinity
      for (const egg of s.eggs) {
        if (seen.has(egg.id)) continue
        seen.add(egg.id)
        angles.push(Math.atan2(egg.vy, egg.vx))
      }
      return {}
    })
    expect(angles.length).toBeGreaterThan(20)
    const sines = angles.map(Math.sin)
    expect(Math.min(...sines)).toBeLessThan(-0.5)
    expect(Math.max(...sines)).toBeGreaterThan(0.5)
  })

  it('revner i fase 3 og skyder skår i alle retninger', () => {
    const state = bossGame('eggeroid')
    readyBoss(state)
    toPhase(state, 3)
    untilAttack(state, 'shards')
    const shards: { vx: number; vy: number }[] = []
    run(state, 1.5, (s) => {
      s.ship.invulnerableUntil = Infinity
      for (const egg of s.eggs) if (egg.kind === 'shard') shards.push(egg)
      return {}
    })
    expect(shards.some((egg) => egg.vy < -10)).toBe(true)
    expect(shards.some((egg) => egg.vy > 10)).toBe(true)
    expect(shards.some((egg) => egg.vx < -10)).toBe(true)
    expect(shards.some((egg) => egg.vx > 10)).toBe(true)
  })

  it('driver langsomt og bliver på banen', () => {
    const state = bossGame('eggeroid')
    readyBoss(state)
    let fastest = 0
    let last = boss(state).x
    run(state, 20, (s) => {
      s.ship.invulnerableUntil = Infinity
      const b = s.boss!
      fastest = Math.max(fastest, Math.abs(b.x - last) / STEP_SECONDS)
      last = b.x
      expect(b.x - b.halfWidth).toBeGreaterThanOrEqual(0)
      expect(b.x + b.halfWidth).toBeLessThanOrEqual(FIELD.width)
      return {}
    })
    expect(fastest).toBeLessThan(140)
  })
})

describe('Isdronningen', () => {
  it('varsler frostlaserens bane og fejer den hen over en del af skærmen', () => {
    const state = bossGame('iceQueen', 'expert')
    readyBoss(state)
    state.ship.x = 300
    const warn = untilAttack(state, 'frostLaser')
    expect(warn).toBeGreaterThanOrEqual(0.6)
    const beam = boss(state).beams[0]
    expect(beam).toBeDefined()
    expect(beam.sweep).toBe(true)
    const span = Math.abs(beam.toX - beam.x)
    expect(span).toBeGreaterThan(150)
    expect(span).toBeLessThanOrEqual(FIELD.width * 0.6)
    const ends: number[] = []
    run(state, 4, (s) => {
      s.ship.invulnerableUntil = Infinity
      const current = s.boss?.beams[0]
      if (current?.state === 'firing') ends.push(beamEnd(current).x)
      return {}
    })
    expect(ends.length).toBeGreaterThan(20)
    const dir = Math.sign(beam.toX - beam.x)
    for (let i = 1; i < ends.length; i++) expect((ends[i] - ends[i - 1]) * dir).toBeGreaterThanOrEqual(-1e-6)
    expect(Math.abs(ends[ends.length - 1] - beam.toX)).toBeLessThan(20)
  })

  it('rammer kun i strålen mens den skyder', () => {
    const beam = { ox: 480, oy: 200, x: 480, y: 600, toX: 480, toY: 600, halfWidth: 16, state: 'warning' as const, t: 0, warn: 1, fire: 1, sweep: false, style: 'frost' as const }
    expect(beamHits(beam, 480, 400, 16)).toBe(false)
    const firing = { ...beam, state: 'firing' as const, t: 1.2 }
    expect(beamHits(firing, 490, 400, 16)).toBe(true)
    expect(beamHits(firing, 560, 400, 16)).toBe(false)
  })

  it('indkalder skjoldhøns i fase 2, højst tre ad gangen', () => {
    const state = bossGame('iceQueen')
    readyBoss(state)
    toPhase(state, 2)
    let most = 0
    run(state, 30, (s) => {
      s.ship.invulnerableUntil = Infinity
      most = Math.max(most, s.enemies.filter((enemy) => enemy.kind === 'shield' && !enemy.dead).length)
      return {}
    })
    expect(most).toBeGreaterThanOrEqual(2)
    expect(most).toBeLessThanOrEqual(3)
  })

  it('sender en snestorm af skrå isæg med vinden i fase 3', () => {
    const state = bossGame('iceQueen')
    readyBoss(state)
    toPhase(state, 3)
    untilAttack(state, 'blizzard')
    const signs = new Set<number>()
    let count = 0
    const seen = new Set<number>()
    run(state, 3.5, (s) => {
      s.ship.invulnerableUntil = Infinity
      for (const egg of s.eggs) {
        if (egg.kind !== 'ice' || seen.has(egg.id) || egg.y > 60) continue
        seen.add(egg.id)
        count++
        signs.add(Math.sign(egg.vx))
      }
      return {}
    })
    expect(count).toBeGreaterThan(10)
    expect(signs.size).toBe(1)
    expect(boss(state).wind).not.toBe(0)
  })
})

describe('Robo-Hanen', () => {
  it('har to kanontårne med egne liv, og kernen er usårlig til begge er skudt', () => {
    const state = bossGame('roboRooster')
    readyBoss(state)
    const b = boss(state)
    expect(parts(state)).toHaveLength(2)
    for (const part of parts(state)) expect(part.hp).toBeGreaterThan(10)
    expect(b.shielded).toBe(true)
    const health = b.health
    shoot(state, b.x, b.y + 10, 5)
    const blocked = run(state, STEP_SECONDS)
    expect(b.health).toBe(health)
    expect(ofType(blocked, 'bossDeflect')).toHaveLength(1)

    shoot(state, parts(state)[0].x, parts(state)[0].y, 999)
    run(state, STEP_SECONDS)
    expect(parts(state)).toHaveLength(1)
    expect(b.shielded).toBe(true)
    shoot(state, parts(state)[0].x, parts(state)[0].y, 999)
    const down = run(state, STEP_SECONDS * 2)
    expect(ofType(down, 'bossShieldDown')).toHaveLength(1)
    expect(b.shielded).toBe(false)
    shoot(state, b.x, b.y + 10, 5)
    run(state, STEP_SECONDS)
    expect(b.health).toBe(health - 5)
  })

  it('lader lyn og raketter vælge tårnene, mens kernen er skærmet', () => {
    for (const family of ['lightning', 'homing'] as const) {
      const state = bossGame('roboRooster')
      readyBoss(state)
      const b = boss(state)
      state.weapon.family = family
      state.weapon.level = 2
      const before = parts(state).reduce((sum, part) => sum + part.hp, 0)
      run(state, 2.5, (s) => {
        s.ship.invulnerableUntil = Infinity
        return { fire: true, pointerX: b.x }
      })
      const after = parts(state).reduce((sum, part) => sum + part.hp, 0)
      expect(after, family).toBeLessThan(before)
      expect(b.health, family).toBe(b.maxHealth)
    }
  })

  it('sender langsomme målsøgende æg, der drejer mod skibet', () => {
    const state = bossGame('roboRooster')
    readyBoss(state)
    untilAttack(state, 'homing')
    run(state, 1.2, (s) => {
      s.ship.invulnerableUntil = Infinity
      return {}
    })
    const homing = state.eggs.filter((egg) => egg.kind === 'homing')
    expect(homing.length).toBeGreaterThanOrEqual(2)
    for (const egg of homing) expect(Math.hypot(egg.vx, egg.vy)).toBeLessThan(state.spec.eggSpeed * 0.7)
  })

  it('tænder et varslet lasergitter med 2-3 linjer og fri plads i fase 3', () => {
    const state = bossGame('roboRooster', 'expert')
    readyBoss(state)
    killParts(state)
    toPhase(state, 3)
    const warn = untilAttack(state, 'grid')
    expect(warn).toBeGreaterThanOrEqual(0.6)
    const beams = boss(state).beams
    expect(beams.length).toBeGreaterThanOrEqual(2)
    expect(beams.length).toBeLessThanOrEqual(3)
    const firing = beams.map((beam) => ({ ...beam, state: 'firing' as const, t: beam.warn + 0.01 }))
    let safe = 0
    for (let x = 40; x < FIELD.width; x += 40) {
      for (let y = SHIP_MIN_Y; y <= SHIP_MAX_Y; y += 40) if (!firing.some((beam) => beamHits(beam, x, y, 16))) safe++
    }
    expect(safe).toBeGreaterThan(30)
  })
})

describe('Den Galaktiske Hane', () => {
  it('varsler teleporten og lander langt fra skibet', () => {
    const state = bossGame('galacticRooster', 'expert')
    readyBoss(state)
    const warn = untilAttack(state, 'teleport')
    expect(warn).toBeGreaterThanOrEqual(0.6)
    const b = boss(state)
    const from = { x: b.x, y: b.y }
    const target = { x: b.attack!.x, y: b.attack!.y }
    expect(Math.abs(target.x - state.ship.x)).toBeGreaterThanOrEqual(200)
    run(state, warn * 0.8, (s) => {
      s.ship.invulnerableUntil = Infinity
      return {}
    })
    expect(Math.hypot(b.x - from.x, b.y - from.y)).toBeLessThan(40)
    const events = run(state, 1, (s) => {
      s.ship.invulnerableUntil = Infinity
      return {}
    })
    expect(ofType(events, 'bossTeleport')).toHaveLength(1)
    expect(Math.hypot(b.x - target.x, b.y - target.y)).toBeLessThan(40)
  })

  it('trækker skibet med begrænset kraft i fase 3, og man kan flyve fra suget', () => {
    const state = bossGame('galacticRooster')
    readyBoss(state)
    toPhase(state, 3)
    untilAttack(state, 'blackHole')
    run(state, boss(state).attack!.charge + 0.6, (s) => {
      s.ship.invulnerableUntil = Infinity
      return {}
    })
    expect(boss(state).pull).toBeGreaterThan(0.5)
    state.ship.x = 200
    state.ship.y = 480
    const start = { ...state.ship }
    run(state, 0.5, (s) => {
      s.ship.invulnerableUntil = Infinity
      return {}
    })
    const drift = Math.hypot(state.ship.x - start.x, state.ship.y - start.y)
    expect(drift).toBeGreaterThan(5)
    expect(drift).toBeLessThanOrEqual(0.5 * 90 + 1)
    const b = boss(state)
    const before = Math.hypot(state.ship.x - b.x, state.ship.y - b.y)
    run(state, 0.5, (s) => {
      s.ship.invulnerableUntil = Infinity
      return { down: true, left: true }
    })
    expect(Math.hypot(state.ship.x - b.x, state.ship.y - b.y)).toBeGreaterThan(before)
    run(state, 8, (s) => {
      s.ship.invulnerableUntil = Infinity
      return {}
    })
    expect(b.attack?.kind === 'blackHole' && b.attack.stage === 'active').toBe(false)
  })

  it('kombinerer de andre bossers angreb og indkalder UFO-kyllinger', () => {
    const state = bossGame('galacticRooster')
    readyBoss(state)
    const attacks = new Set<string>()
    let ufos = 0
    for (const phase of [1, 2, 3] as const) {
      if (phase > 1) toPhase(state, phase as 2 | 3)
      const events = run(state, 25, (s) => {
        s.ship.invulnerableUntil = Infinity
        ufos = Math.max(ufos, s.enemies.filter((enemy) => enemy.kind === 'ufo').length)
        return {}
      })
      for (const event of ofType(events, 'bossCharge')) attacks.add(event.attack)
    }
    for (const attack of ['teleport', 'chunks', 'spiral', 'frostLaser', 'burst', 'grid', 'blackHole', 'ufos']) expect(attacks.has(attack), attack).toBe(true)
    expect(ufos).toBeGreaterThanOrEqual(1)
  })
})

describe('mini-bosser', () => {
  it('Ægge-trioen er tre store høns á ca. 25 liv, der flyver i formation og skyder vifter', () => {
    const state = bossGame('eggTrio')
    readyBoss(state)
    const b = boss(state)
    expect(b.mini).toBe(true)
    const hens = parts(state)
    expect(hens).toHaveLength(3)
    for (const hen of hens) expect(hen.hp).toBe(25)
    expect(b.health).toBe(75)
    const startX = hens.map((hen) => hen.x)
    const events = run(state, 8, (s) => {
      s.ship.invulnerableUntil = Infinity
      return {}
    })
    expect(parts(state).some((hen, i) => Math.abs(hen.x - startX[i]) > 20)).toBe(true)
    expect(ofType(events, 'bossCharge').map((event) => event.attack)).toContain('fan')
    shoot(state, parts(state)[0].x, parts(state)[0].y, 10)
    run(state, STEP_SECONDS * 2)
    expect(b.health).toBe(65)
  })

  it('Ild-trioen i sektor 4 skyder ildæg', () => {
    const state = bossGame('eggTrioFire')
    readyBoss(state)
    expect(boss(state).variant).toBe(1)
    run(state, 8, (s) => {
      s.ship.invulnerableUntil = Infinity
      return {}
    })
    const kinds = new Set(state.eggs.map((egg) => egg.kind))
    expect(kinds.has('fire')).toBe(true)
  })

  it('Kyllingekrydseren krydser skærmen med tre tårne og et pansret skrog; MK II skyder hurtigere', () => {
    const counts: number[] = []
    for (const key of ['chickenCruiser', 'chickenCruiserMk2'] as const) {
      const state = bossGame(key)
      readyBoss(state)
      const b = boss(state)
      expect(parts(state)).toHaveLength(3)
      const health = b.health
      shoot(state, b.x, b.y - 10, 5)
      expect(ofType(run(state, STEP_SECONDS), 'bossDeflect')).toHaveLength(1)
      expect(b.health).toBe(health)
      let minX = Infinity
      let maxX = -Infinity
      const events = run(state, 20, (s) => {
        s.ship.invulnerableUntil = Infinity
        minX = Math.min(minX, s.boss!.x)
        maxX = Math.max(maxX, s.boss!.x)
        return {}
      })
      expect(maxX - minX).toBeGreaterThan(300)
      counts.push(ofType(events, 'bossCharge').length)
    }
    expect(counts[1]).toBeGreaterThan(counts[0])
  })

  it('UFO-moderskibets brede stråle varsles og stjæler ét våbenniveau', () => {
    const state = bossGame('ufoMothership')
    readyBoss(state)
    state.weapon.level = 3
    const warn = untilAttack(state, 'tractor')
    expect(warn).toBeGreaterThanOrEqual(0.6)
    const events = run(state, warn + 3, (s) => {
      s.ship.invulnerableUntil = Infinity
      s.ship.x = s.boss!.x
      s.ship.y = 420
      return {}
    })
    expect(ofType(events, 'weaponStolen')).toHaveLength(1)
    expect(state.weapon.level).toBe(2)
  })

  it('UFO-moderskibet sender små UFO-kyllinger', () => {
    const state = bossGame('ufoMothership')
    readyBoss(state)
    let ufos = 0
    run(state, 30, (s) => {
      s.ship.invulnerableUntil = Infinity
      ufos = Math.max(ufos, s.enemies.filter((enemy) => enemy.kind === 'ufo').length)
      return {}
    })
    expect(ufos).toBeGreaterThanOrEqual(1)
    expect(ufos).toBeLessThanOrEqual(2)
  })
})

describe('fælles for alle bosser', () => {
  const bodied: BossKey[] = ['motherHen', 'eggeroid', 'iceQueen', 'roboRooster', 'galacticRooster', 'chickenCruiser', 'ufoMothership']

  it('koster et liv ved sammenstød med kroppen, men ikke under indflyvningen', () => {
    for (const key of bodied) {
      const state = bossGame(key)
      state.enemies = state.enemies.filter((enemy) => enemy.kind === 'bossPart')
      const b = boss(state)
      state.ship.x = b.x
      state.ship.y = Math.max(SHIP_MIN_Y, b.y)
      expect(ofType(run(state, 0.1), 'playerHit'), key).toHaveLength(0)
      readyBoss(state)
      state.eggs = []
      b.attack = null
      b.nextAttackAt = Infinity
      b.nextVolleyAt = b.nextChicksAt = b.nextLaserAt = Infinity
      state.ship.invulnerableUntil = 0
      state.ship.x = b.x
      state.ship.y = Math.max(SHIP_MIN_Y, b.y + b.halfHeight * 0.6)
      expect(ofType(stepGame(state, idle), 'playerHit').length, key).toBe(1)
    }
  })

  it('giver point, gaver og en unik sejr ved nederlag og rydder bossens hjælpere', () => {
    const state = bossGame('motherHen')
    for (const key of Object.keys(BOSS_WAVES) as BossKey[]) {
      state.status = 'playing'
      state.lives = 3
      state.pendingEvents = []
      state.pickups = []
      state.awaitingWave = false
      state.transitionUntil = Infinity
      // Starter bossen direkte i det samme spil, så statistikken samles.
      const fresh = bossGame(key)
      state.spec = fresh.spec
      state.wave = fresh.wave
      state.enemies = []
      state.eggs = []
      state.boss = null
      beginWave(state, fresh.spec)
      state.transitionUntil = Infinity
      readyBoss(state)
      const score = state.scoring.score
      const events: ReturnType<typeof run> = []
      for (let i = 0; i < 400 && state.boss; i++) {
        state.ship.invulnerableUntil = Infinity
        for (const enemy of state.enemies) shoot(state, enemy.x, enemy.y, 999)
        const b = state.boss as BossState | null
        if (b && !b.shielded) damageBoss(b, b.health)
        events.push(...stepGame(state, idle))
      }
      const defeated = ofType(events, 'bossDefeated')
      expect(defeated, key).toHaveLength(1)
      expect(defeated[0].boss).toBe(key.replace(/Fire|Mk2/, ''))
      expect(state.scoring.score, key).toBeGreaterThan(score)
      expect(state.pickups.length, key).toBeGreaterThanOrEqual(2)
      expect(state.enemies.filter((enemy) => enemy.kind === 'bossPart' || enemy.kind === 'shield'), key).toHaveLength(0)
    }
    expect(getStats(state).bossesDefeated).toBe(10)
    expect(getStats(state).distinctBosses).toBe(ALL_BOSS_IDS.length)
  })

  it('varsler alle angreb i mindst 0,6 s i første runde og mindst 0,4 s i Nyt+', () => {
    for (const key of Object.keys(BOSS_WAVES) as BossKey[]) {
      if (key === 'motherHen') continue
      const state = bossGame(key, 'expert')
      readyBoss(state)
      const charges: number[] = []
      for (const phase of [1, 2, 3] as const) {
        if (phase > 1 && !boss(state).mini) {
          killParts(state)
          if (!state.boss) break
          toPhase(state, phase as 2 | 3)
        }
        const events = run(state, 20, (s) => {
          s.ship.invulnerableUntil = Infinity
          return {}
        })
        charges.push(...ofType(events, 'bossCharge').map((event) => event.seconds))
        if (!state.boss) break
      }
      expect(charges.length, key).toBeGreaterThan(3)
      expect(Math.min(...charges), key).toBeGreaterThanOrEqual(0.6 - 1e-9)
    }
    const late = bossGame('galacticRooster', 'expert')
    late.boss!.round = 6
    readyBoss(late)
    const events = run(late, 20, (s) => {
      s.ship.invulnerableUntil = Infinity
      return {}
    })
    for (const event of ofType(events, 'bossCharge')) expect(event.seconds).toBeGreaterThanOrEqual(0.4)
  })

  it('bremses af slowmo', () => {
    const normal = bossGame('eggeroid')
    const slow = bossGame('eggeroid')
    readyBoss(normal)
    readyBoss(slow)
    activatePowerup(slow, 'slowmo')
    const t0 = normal.boss!.time
    const s0 = slow.boss!.time
    run(normal, 2)
    run(slow, 2)
    expect(slow.boss!.time - s0).toBeLessThan((normal.boss!.time - t0) * 0.7)
  })
})
