import { describe, it, expect } from 'vitest'
import { COOLANT_SECONDS, HEAT_COOL_PER_SECOND, HEAT_PER_SHOT, MAX_WEAPON_LEVEL, OVERHEAT_LOCK_SECONDS } from './config'
import { createRng } from './rng'
import {
  activateCoolant,
  collectGift,
  coolWeapon,
  createWeaponState,
  downgradeWeapon,
  FAMILY_COLORS,
  fire,
  fireInterval,
  GIFT_SAME_FAMILY_CHANCE,
  heatPerSecond,
  isOverheated,
  rollGiftFamily,
  shotPattern,
  SPREAD_RANGE,
  upgradeWeapon,
  WEAPON_FAMILIES,
  type WeaponFamily,
} from './weapons'

const LEVELS = [1, 2, 3, 4, 5]

describe('våbenfamilier', () => {
  it('har fem familier med hver sin farve', () => {
    expect([...WEAPON_FAMILIES]).toEqual(['blaster', 'lightning', 'laser', 'spread', 'homing'])
    expect(new Set(WEAPON_FAMILIES.map((family) => FAMILY_COLORS[family])).size).toBe(5)
    expect(createWeaponState()).toMatchObject({ family: 'blaster', level: 1 })
  })

  it('giver +1 niveau for en gave i samme familie og point-signal på max', () => {
    const weapon = createWeaponState('laser')
    expect(collectGift(weapon, 'laser')).toBe('up')
    expect(weapon).toMatchObject({ family: 'laser', level: 2 })
    weapon.level = MAX_WEAPON_LEVEL
    expect(collectGift(weapon, 'laser')).toBe('max')
    expect(weapon.level).toBe(MAX_WEAPON_LEVEL)
  })

  it('skifter familie og beholder niveauet for en gave i en anden farve', () => {
    const weapon = createWeaponState('blaster')
    weapon.level = 4
    expect(collectGift(weapon, 'homing')).toBe('switch')
    expect(weapon).toMatchObject({ family: 'homing', level: 4 })
    weapon.level = MAX_WEAPON_LEVEL
    expect(collectGift(weapon, 'spread')).toBe('switch')
    expect(weapon).toMatchObject({ family: 'spread', level: MAX_WEAPON_LEVEL })
  })

  it('beholder familien når et liv koster et niveau', () => {
    const weapon = createWeaponState('lightning')
    weapon.level = 3
    downgradeWeapon(weapon)
    expect(weapon).toMatchObject({ family: 'lightning', level: 2 })
  })

  it('farver gaverne 60 % i den nuværende familie og 40 % i en anden (seedet)', () => {
    expect(GIFT_SAME_FAMILY_CHANCE).toBe(0.6)
    const rng = createRng(42)
    const counts = new Map<WeaponFamily, number>()
    const rolls = 20000
    for (let i = 0; i < rolls; i++) {
      const family = rollGiftFamily('laser', rng)
      counts.set(family, (counts.get(family) ?? 0) + 1)
    }
    expect((counts.get('laser') ?? 0) / rolls).toBeCloseTo(0.6, 1)
    for (const family of WEAPON_FAMILIES.filter((other) => other !== 'laser')) expect((counts.get(family) ?? 0) / rolls).toBeCloseTo(0.1, 1)
    const a = createRng(7)
    const b = createRng(7)
    expect(Array.from({ length: 30 }, () => rollGiftFamily('blaster', a))).toEqual(Array.from({ length: 30 }, () => rollGiftFamily('blaster', b)))
  })
})

describe('skudmønstre pr. familie', () => {
  it('lader lynet kæde til 1-5 ekstra fjender med 1 skade pr. led', () => {
    for (const level of LEVELS) {
      const shots = shotPattern(level, 'lightning')
      expect(shots).toHaveLength(1)
      expect(shots[0]).toMatchObject({ kind: 'chain', links: level, damage: 1 })
    }
  })

  it('gør laserstrålen bredere og hurtigere tikkende for hvert niveau', () => {
    const widths = LEVELS.map((level) => shotPattern(level, 'laser')[0].halfWidth ?? 0)
    const ticks = LEVELS.map((level) => 1 / fireInterval(level, 'laser'))
    for (let i = 1; i < 5; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1])
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
    }
    expect(shotPattern(1, 'laser')[0]).toMatchObject({ kind: 'beam', pierce: true })
  })

  it('skyder 3-11 haglkorn i en symmetrisk vifte, der bliver bredere, med kort rækkevidde', () => {
    expect(LEVELS.map((level) => shotPattern(level, 'spread').length)).toEqual([3, 5, 7, 9, 11])
    const fan = (level: number) => Math.max(...shotPattern(level, 'spread').map((shot) => Math.abs(shot.angle)))
    for (const level of LEVELS) {
      const angles = shotPattern(level, 'spread').map((shot) => shot.angle).sort((a, b) => a - b)
      expect(angles[0]).toBeCloseTo(-angles[angles.length - 1])
      for (const shot of shotPattern(level, 'spread')) expect(shot).toMatchObject({ kind: 'pellet', range: SPREAD_RANGE })
      if (level > 1) expect(fan(level)).toBeGreaterThan(fan(level - 1))
    }
    expect(SPREAD_RANGE).toBeGreaterThanOrEqual(380)
    expect(SPREAD_RANGE).toBeLessThanOrEqual(460)
  })

  it('sender 1-4 målsøgende raketter med skade 2 og langsommere skudtakt', () => {
    expect(LEVELS.map((level) => shotPattern(level, 'homing').length)).toEqual([1, 2, 2, 3, 4])
    for (const level of LEVELS) {
      for (const shot of shotPattern(level, 'homing')) expect(shot).toMatchObject({ kind: 'rocket', damage: 2 })
      expect(fireInterval(level, 'homing')).toBeGreaterThan(fireInterval(level, 'blaster'))
    }
  })

  it('beholder blasterens tal som før', () => {
    expect(LEVELS.map((level) => shotPattern(level, 'blaster').length)).toEqual([1, 2, 3, 5, 1])
    expect(shotPattern(5, 'blaster')[0]).toMatchObject({ kind: 'ion', pierce: true, damage: 2 })
    expect(LEVELS.map((level) => fireInterval(level, 'blaster'))).toEqual([0.22, 0.2, 0.2, 0.18, 0.12])
  })
})

describe('varme pr. familie', () => {
  it('lader laseren bygge varme hurtigere op end blasteren på alle niveauer', () => {
    for (const level of LEVELS) expect(heatPerSecond(level, 'laser')).toBeGreaterThan(heatPerSecond(level, 'blaster'))
  })

  it('kan overophede alle familier ved konstant skydning, laseren hurtigst', () => {
    const secondsToOverheat = (family: WeaponFamily, level: number) => {
      const weapon = createWeaponState(family)
      weapon.level = level
      const dt = 1 / 60
      for (let now = 0; now < 60; now += dt) {
        coolWeapon(weapon, now, dt)
        fire(weapon, now)
        if (isOverheated(weapon, now)) return now
      }
      return Infinity
    }
    for (const level of LEVELS) {
      const times = Object.fromEntries(WEAPON_FAMILIES.map((family) => [family, secondsToOverheat(family, level)]))
      for (const family of WEAPON_FAMILIES) expect(times[family], `${family} ${level}`).toBeLessThan(20)
      expect(times.laser, `laser ${level}`).toBeLessThan(times.blaster)
      expect(times.laser).toBeGreaterThan(2)
    }
  })
})

describe('shotPattern', () => {
  it('giver flere skud jo højere niveau, og ionlaser på max', () => {
    expect([1, 2, 3, 4, 5].map((level) => shotPattern(level).length)).toEqual([1, 2, 3, 5, 1])
    const [ion] = shotPattern(MAX_WEAPON_LEVEL)
    expect(ion).toMatchObject({ kind: 'ion', pierce: true })
    expect(ion.damage).toBeGreaterThan(1)
  })

  it('skyder niveau 2 som to parallelle skud', () => {
    const shots = shotPattern(2)
    expect(shots.map((shot) => shot.angle)).toEqual([0, 0])
    expect(shots[0].dx).toBe(-shots[1].dx)
  })

  it('spreder niveau 3 og 4 symmetrisk, og 4 spreder bredest', () => {
    for (const level of [3, 4]) {
      const angles = shotPattern(level).map((shot) => shot.angle).sort((a, b) => a - b)
      expect(angles[0]).toBeCloseTo(-angles[angles.length - 1])
    }
    const widest = (level: number) => Math.max(...shotPattern(level).map((shot) => Math.abs(shot.angle)))
    expect(widest(4)).toBeGreaterThan(widest(3))
  })
})

describe('opgradering', () => {
  it('stopper ved max-niveau og melder at gaven ikke kunne bruges', () => {
    const weapon = createWeaponState()
    for (let i = 1; i < MAX_WEAPON_LEVEL; i++) expect(upgradeWeapon(weapon)).toBe(true)
    expect(weapon.level).toBe(MAX_WEAPON_LEVEL)
    expect(upgradeWeapon(weapon)).toBe(false)
    expect(weapon.level).toBe(MAX_WEAPON_LEVEL)
  })

  it('falder aldrig under niveau 1', () => {
    const weapon = createWeaponState()
    upgradeWeapon(weapon)
    downgradeWeapon(weapon)
    downgradeWeapon(weapon)
    expect(weapon.level).toBe(1)
  })
})

describe('fire', () => {
  it('respekterer skudintervallet', () => {
    const weapon = createWeaponState()
    expect(fire(weapon, 0)).not.toBeNull()
    expect(fire(weapon, fireInterval(1) / 2)).toBeNull()
    expect(fire(weapon, fireInterval(1))).not.toBeNull()
  })

  it('opbygger varme og låser kanonen ved overophedning', () => {
    const weapon = createWeaponState()
    let now = 0
    let lockedAt = 0
    let shots = 0
    while (!isOverheated(weapon, now) && shots < 100) {
      expect(fire(weapon, now)).not.toBeNull()
      lockedAt = now
      shots++
      now += fireInterval(1)
    }
    expect(shots).toBe(Math.ceil(100 / HEAT_PER_SHOT))
    expect(weapon.heat).toBe(100)
    expect(fire(weapon, lockedAt + OVERHEAT_LOCK_SECONDS - 0.01)).toBeNull()
    expect(fire(weapon, lockedAt + OVERHEAT_LOCK_SECONDS)).not.toBeNull()
  })

  it('køler ned over tid uden at gå under nul', () => {
    const weapon = createWeaponState()
    fire(weapon, 0)
    coolWeapon(weapon, 0.1, 0.1)
    expect(weapon.heat).toBeCloseTo(HEAT_PER_SHOT - HEAT_COOL_PER_SECOND * 0.1)
    coolWeapon(weapon, 5, 5)
    expect(weapon.heat).toBe(0)
  })

  it('tømmer varmen jævnt mens kanonen er låst', () => {
    const weapon = createWeaponState()
    weapon.heat = 99
    fire(weapon, 0)
    expect(isOverheated(weapon, 0)).toBe(true)
    coolWeapon(weapon, OVERHEAT_LOCK_SECONDS / 2, 0.016)
    expect(weapon.heat).toBeCloseTo(50)
    coolWeapon(weapon, OVERHEAT_LOCK_SECONDS, 0.016)
    expect(weapon.heat).toBe(0)
  })

  it('bygger ikke varme op mens Køling er aktiv, og låser en overophedet kanon op', () => {
    const weapon = createWeaponState()
    weapon.heat = 99
    fire(weapon, 0)
    activateCoolant(weapon, 0.1)
    expect(isOverheated(weapon, 0.1)).toBe(false)
    let now = 0.1
    for (let i = 0; i < 30; i++) {
      fire(weapon, now)
      now += fireInterval(1)
    }
    expect(weapon.heat).toBe(0)
    fire(weapon, 0.1 + COOLANT_SECONDS + 1)
    expect(weapon.heat).toBe(HEAT_PER_SHOT)
  })
})
