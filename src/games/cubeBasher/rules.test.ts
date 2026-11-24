import { describe, expect, it } from 'vitest'
import * as R from '../../../public/games/cube-basher/rules.js'

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length] }
const baseState = () => ({ weapons: { hammer: 1 } as Record<string, number>, passives: {} as Record<string, number>, evolved: {} as Record<string, boolean> })

describe('language and texts', () => {
  it('reads da/en/fi/sv from the query string and falls back to English', () => {
    expect(R.LANGS).toEqual(['da', 'en', 'fi', 'sv'])
    expect(R.pickLanguage('?lang=da')).toBe('da')
    expect(R.pickLanguage('?x=1&lang=fi')).toBe('fi')
    expect(R.pickLanguage('?lang=sv')).toBe('sv')
    expect(R.pickLanguage('?lang=de')).toBe('en')
    expect(R.pickLanguage('')).toBe('en')
  })

  it('has the same text keys in every language', () => {
    const keys = (value: object) => Object.keys(value).sort()
    expect(keys(R.TEXT.da)).toEqual(keys(R.TEXT.en))
    expect(keys(R.TEXT.fi)).toEqual(keys(R.TEXT.en))
    expect(keys(R.TEXT.sv)).toEqual(keys(R.TEXT.en))
    for (const lang of ['da', 'fi', 'sv'] as const) for (const group of ['phases', 'events', 'enemies', 'heroTitles', 'characters', 'meta', 'weapons', 'evolutions', 'passives'] as const) {
      expect(keys(R.TEXT[lang][group]), `${lang} ${group}`).toEqual(keys(R.TEXT.en[group]))
    }
  })

  it('keeps the same placeholders in every translation', () => {
    const flat = (value: unknown, path = ''): Array<[string, string]> => typeof value === 'string' ? [[path, value]] : Object.entries(value as object).flatMap(([key, child]) => flat(child, `${path}.${key}`))
    const placeholders = (value: string) => (value.match(/\{\w+\}/g) || []).sort().join(',')
    const english = new Map(flat(R.TEXT.en))
    for (const lang of ['da', 'fi', 'sv'] as const) for (const [path, value] of flat(R.TEXT[lang])) {
      expect(placeholders(value), `${lang}${path}`).toBe(placeholders(english.get(path) ?? ''))
    }
  })

  it('names and describes every weapon, evolution, passive, enemy, event, character and meta upgrade in every language', () => {
    for (const lang of R.LANGS) {
      const t = R.TEXT[lang]
      for (const id of R.WEAPON_IDS) {
        expect(t.weapons[id]?.name, `${lang} weapon ${id}`).toBeTruthy()
        expect(t.weapons[id]?.desc, `${lang} weapon ${id}`).toBeTruthy()
        expect(t.evolutions[id]?.name, `${lang} evolution ${id}`).toBeTruthy()
        expect(t.evolutions[id]?.desc, `${lang} evolution ${id}`).toBeTruthy()
      }
      for (const passive of R.PASSIVES) expect(t.passives[passive.id]?.name, `${lang} passive ${passive.id}`).toBeTruthy()
      for (const type of Object.keys(R.ENEMY_TYPES)) expect(t.enemies[type], `${lang} enemy ${type}`).toBeTruthy()
      for (const event of R.EVENTS) expect(t.events[event.id]?.name, `${lang} event ${event.id}`).toBeTruthy()
      for (const id of Object.keys(R.DAY_PALETTES)) expect(t.phases[id], `${lang} phase ${id}`).toBeTruthy()
      for (const character of R.CHARACTERS) {
        expect(t.characters[character.id], `${lang} character ${character.id}`).toBeTruthy()
        expect(t.heroTitles?.[character.id], `${lang} hero title ${character.id}`).toBeTruthy()
      }
      for (const meta of R.META) expect(t.meta[meta.id]?.name, `${lang} meta ${meta.id}`).toBeTruthy()
    }
  })

  it('fills placeholders and leaves none behind in weapon descriptions', () => {
    expect(R.fmt('{a} og {b}', { a: 1, b: 'to' })).toBe('1 og to')
    for (const lang of R.LANGS) for (const id of R.WEAPON_IDS) for (const evolved of [false, true]) {
      const text = R.describeWeapon(lang, id, R.MAX_LEVEL, { evolved })
      expect(text, `${lang} ${id}`).not.toMatch(/[{}]|undefined|NaN/)
    }
  })
})

describe('weapon stats', () => {
  it('keeps the original numbers for the original weapons', () => {
    expect(R.weaponStats('hammer', 3)).toMatchObject({ dmg: 38 })
    expect(R.weaponStats('hammer', 3).r).toBeCloseTo(4.9)
    expect(R.weaponStats('hammer', 3).cd).toBeCloseTo(1.34)
    expect(R.weaponStats('orbs', 3)).toMatchObject({ n: 3, dmg: 28 })
    expect(R.weaponStats('fireball', 4)).toMatchObject({ n: 2, dmg: 58 })
    expect(R.weaponStats('lightning', 4)).toMatchObject({ n: 3, dmg: 70 })
    expect(R.weaponStats('boomerang', 3)).toMatchObject({ n: 2, dmg: 33 })
    expect(R.weaponStats('frost', 2)).toMatchObject({ dmg: 18, slowMult: 0.55 })
    expect(R.weaponStats('rail', 5)).toMatchObject({ n: 2, dmg: 82, range: 26 })
  })

  it('gives every weapon positive damage and (except the always-on orbs) a cooldown at every level, also evolved', () => {
    for (const id of R.WEAPON_IDS) for (let level = 1; level <= R.MAX_LEVEL; level++) for (const evolved of [false, true]) {
      const stats = R.weaponStats(id, level, { evolved })
      expect(stats.dmg, `${id} ${level}`).toBeGreaterThan(0)
      if (id === 'orbs') expect(stats.cd).toBeUndefined()
      else expect(stats.cd, `${id} ${level}`).toBeGreaterThan(0.2)
    }
  })

  it('makes evolved weapons strictly stronger than max level', () => {
    for (const id of R.WEAPON_IDS) {
      const base = R.weaponStats(id, R.MAX_LEVEL)
      const evolved = R.weaponStats(id, R.MAX_LEVEL, { evolved: true })
      expect(evolved.dmg, id).toBeGreaterThan(base.dmg)
    }
  })

  it('adds extra projectiles and scales area only where the weapon has them', () => {
    const plain = R.weaponStats('fireball', 2)
    const boosted = R.weaponStats('fireball', 2, { extra: 2, area: 1.5 })
    expect(boosted.n).toBe(plain.n + 2)
    expect(boosted.boom).toBeCloseTo(plain.boom * 1.5)
    const hammer = R.weaponStats('hammer', 2, { extra: 1 })
    expect(hammer.n).toBeUndefined()
    expect(R.weaponStats('hammer', 2, { area: 1.2 }).r).toBeCloseTo(R.weaponStats('hammer', 2).r * 1.2)
  })
})

describe('passives', () => {
  const player = () => ({ maxhp: 100, hp: 50, speedMult: 1, dmgMult: 1, cdMult: 1, magnet: 3.5, armor: 0, regen: 0, crit: 0.05, sprintMult: 1.65, staminaMax: 100, stamina: 100, staminaRegen: 18, lifesteal: 0, thorns: 0, extra: 0, area: 1, revives: 0 })

  it('applies the new passives to the player', () => {
    const p = player()
    const apply = (id: string) => R.PASSIVES.find((entry: { id: string }) => entry.id === id).apply(p)
    apply('vamp'); apply('thorns'); apply('multishot'); apply('area'); apply('revive')
    expect(p.lifesteal).toBeGreaterThan(0)
    expect(p.thorns).toBeGreaterThan(0)
    expect(p.extra).toBe(1)
    expect(p.area).toBeCloseTo(1.12)
    expect(p.revives).toBe(1)
  })

  it('caps limited passives', () => {
    expect(R.passiveAvailable('revive', { revive: 1 })).toBe(false)
    expect(R.passiveAvailable('multishot', { multishot: 1 })).toBe(true)
    expect(R.passiveAvailable('multishot', { multishot: 2 })).toBe(false)
    expect(R.passiveAvailable('dmg', { dmg: 40 })).toBe(true)
  })
})

describe('evolutions', () => {
  it('needs the weapon at max level plus its partner passive, once', () => {
    const state = baseState()
    state.weapons.hammer = R.MAX_LEVEL
    expect(R.readyEvolutions(state)).toEqual([])
    state.passives[R.EVOLUTIONS.hammer] = 1
    expect(R.readyEvolutions(state)).toEqual(['hammer'])
    state.evolved.hammer = true
    expect(R.readyEvolutions(state)).toEqual([])
  })

  it('pairs every weapon with an existing passive', () => {
    const ids = new Set(R.PASSIVES.map((entry: { id: string }) => entry.id))
    for (const id of R.WEAPON_IDS) expect(ids.has(R.EVOLUTIONS[id]), id).toBe(true)
  })
})

describe('level-up cards', () => {
  it('offers three distinct cards', () => {
    const cards = R.rollCards(baseState(), Math.random)
    expect(cards).toHaveLength(3)
    expect(new Set(cards.map((card: { kind: string; id: string }) => `${card.kind}:${card.id}`)).size).toBe(3)
  })

  it('puts a ready evolution first', () => {
    const state = baseState()
    state.weapons.hammer = R.MAX_LEVEL
    state.passives[R.EVOLUTIONS.hammer] = 1
    for (let i = 0; i < 20; i++) expect(R.rollCards(state, Math.random)[0]).toEqual({ kind: 'evolution', id: 'hammer' })
  })

  it('never offers maxed weapons, capped passives or a sixth weapon', () => {
    const state = baseState()
    state.weapons = { hammer: R.MAX_LEVEL, orbs: 2, fireball: 2, lightning: 2, rail: 2 }
    state.passives = { revive: 1, multishot: 2 }
    for (let i = 0; i < 200; i++) for (const card of R.rollCards(state, Math.random)) {
      if (card.kind === 'weapon') {
        expect(card.id).not.toBe('hammer')
        expect(Object.keys(state.weapons)).toContain(card.id)
        expect(card.level).toBe(state.weapons[card.id] + 1)
      }
      if (card.kind === 'passive') expect(['revive', 'multishot']).not.toContain(card.id)
    }
  })

  it('still offers the unlimited passives when every weapon and limited passive is done', () => {
    const state = baseState()
    state.weapons = Object.fromEntries(R.WEAPON_IDS.slice(0, R.MAX_WEAPONS).map((id: string) => [id, R.MAX_LEVEL]))
    state.evolved = Object.fromEntries(R.WEAPON_IDS.map((id: string) => [id, true]))
    state.passives = Object.fromEntries(R.PASSIVES.filter((entry: { max: number | null }) => entry.max).map((entry: { id: string; max: number }) => [entry.id, entry.max]))
    const cards = R.rollCards(state, Math.random)
    expect(cards).toHaveLength(3)
    for (const card of cards) {
      expect(card.kind).toBe('passive')
      expect(R.PASSIVES.find((entry: { id: string }) => entry.id === card.id).max).toBeNull()
    }
  })
})

describe('chests', () => {
  it('gives the evolution when one is ready', () => {
    const state = baseState()
    state.weapons.hammer = R.MAX_LEVEL
    state.passives[R.EVOLUTIONS.hammer] = 1
    expect(R.rollChest(state, Math.random, { boss: false }).items[0]).toEqual({ kind: 'evolution', id: 'hammer' })
  })

  it('upgrades owned things: one item from an elite, three from a boss, plus gold', () => {
    const state = baseState()
    state.weapons = { hammer: 2, orbs: 1, frost: 1 }
    state.passives = { dmg: 1 }
    const elite = R.rollChest(state, seq(0.3, 0.6, 0.1, 0.9), { boss: false })
    expect(elite.items).toHaveLength(1)
    expect(elite.gold).toBeGreaterThan(0)
    const boss = R.rollChest(state, seq(0.3, 0.6, 0.1, 0.9), { boss: true })
    expect(boss.items).toHaveLength(3)
    expect(boss.gold).toBeGreaterThan(elite.gold)
    for (const item of boss.items) {
      if (item.kind === 'weapon') expect(Object.keys(state.weapons)).toContain(item.id)
      if (item.kind === 'passive') expect(Object.keys(state.passives)).toContain(item.id)
    }
  })
})

describe('events', () => {
  it('waits at least two minutes before the first event and spaces later ones', () => {
    expect(R.firstEventTime(seq(0))).toBeGreaterThanOrEqual(120)
    const next = R.nextEventTime(400, seq(0.5))
    expect(next).toBeGreaterThanOrEqual(400 + 150)
    expect(next).toBeLessThanOrEqual(400 + 240)
  })

  it('never repeats the previous event and keeps blood moon for dusk and night', () => {
    for (let i = 0; i < 100; i++) {
      const id = R.chooseEvent(200, 'meteor', Math.random)
      expect(id).not.toBe('meteor')
      expect(id).not.toBe('bloodmoon')
    }
    const late = new Set(Array.from({ length: 200 }, () => R.chooseEvent(1650, 'meteor', Math.random)))
    expect(late.has('bloodmoon')).toBe(true)
  })

  it('postpones an event that would overlap a boss', () => {
    expect(R.eventBlockedByBoss(290, 'meteor', R.BOSS_TIMES)).toBe(true)
    expect(R.eventBlockedByBoss(200, 'swarm', R.BOSS_TIMES)).toBe(false)
    expect(R.eventBlockedByBoss(305, 'goldrush', R.BOSS_TIMES)).toBe(true)
  })
})

describe('day cycle', () => {
  it('starts at dawn and ends at night', () => {
    expect(R.dayPhase(0).id).toBe('dawn')
    expect(R.dayPhase(R.WIN_TIME).id).toBe('night')
    expect(R.dayPhase(R.WIN_TIME * 0.3).id).toBe('day')
  })

  it('blends colors smoothly between phases', () => {
    expect(R.mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080)
    const a = R.paletteAt(100), b = R.paletteAt(101)
    expect(Math.abs(a.sunIntensity - b.sunIntensity)).toBeLessThan(0.05)
    expect(R.paletteAt(0).stars).toBe(0)
    expect(R.paletteAt(R.WIN_TIME).stars).toBeGreaterThan(0.8)
  })
})

describe('enemies', () => {
  it('spawns only grunts and runners early', () => {
    for (let i = 0; i < 300; i++) expect(['grunt', 'runner']).toContain(R.pickEnemyType(60, Math.random(), Math.random()))
  })

  it('introduces bombers, armored and blink cubes over time', () => {
    const seen = new Set(Array.from({ length: 3000 }, () => R.pickEnemyType(900, Math.random(), Math.random())))
    for (const type of ['bomber', 'armored', 'blinker', 'brute', 'spitter']) expect(seen.has(type), type).toBe(true)
    const early = new Set(Array.from({ length: 3000 }, () => R.pickEnemyType(170, Math.random(), Math.random())))
    expect(early.has('bomber')).toBe(false)
  })

  it('lets armor soak flat damage but always deals at least 1', () => {
    expect(R.armorDamage(22, 8)).toBe(14)
    expect(R.armorDamage(5, 8)).toBe(1)
    expect(R.armorDamage(10.4, 0)).toBe(10)
  })
})

describe('records', () => {
  it('keeps the best time, kills and level and reports what was beaten', () => {
    const save: { best?: { time: number; kills: number; level: number } } = {}
    expect(R.updateRecord(save, { time: 300, kills: 400, level: 12 })).toEqual({ time: true, kills: true, level: true })
    expect(R.updateRecord(save, { time: 200, kills: 500, level: 10 })).toEqual({ time: false, kills: true, level: false })
    expect(save.best).toEqual({ time: 300, kills: 500, level: 12 })
  })
})
