import { describe, expect, it } from 'vitest'
import { christmasDate, christmasDay, christmasLabels, christmasMode, doorMessage, applyChristmasAttribute, cardOrnament, flagString, ORNAMENT_KINDS, stringOrnaments, garland, openedDoors, snowRidgePath, rememberOpenedDoor, seasonLine, snowCapPath, wireY } from './christmas'

const at = (iso: string) => new Date(`${iso}T12:00:00`)

describe('christmasDay – the theme switches itself on 1 December and off after New Year', () => {
  it('is off in November and switches on at midnight on 1 December', () => {
    expect(christmasDay(new Date('2026-11-30T23:59:59'))).toBeNull()
    expect(christmasDay(new Date('2026-12-01T00:00:00'))).toEqual({ month: 12, day: 1, daysToEve: 23, phase: 'advent' })
  })

  it('counts down to Christmas Eve and follows the season through New Year', () => {
    expect(christmasDay(at('2026-12-16'))).toMatchObject({ phase: 'advent', daysToEve: 8 })
    expect(christmasDay(at('2026-12-23'))).toMatchObject({ phase: 'advent', daysToEve: 1 })
    expect(christmasDay(at('2026-12-24'))).toMatchObject({ phase: 'eve', daysToEve: 0 })
    expect(christmasDay(at('2026-12-27'))).toMatchObject({ phase: 'christmas' })
    expect(christmasDay(at('2026-12-31'))).toMatchObject({ phase: 'newyear' })
    expect(christmasDay(at('2027-01-01'))).toMatchObject({ month: 1, day: 1, phase: 'newyear' })
  })

  it('is off again from 2 January and the rest of the year', () => {
    expect(christmasDay(new Date('2027-01-02T00:00:00'))).toBeNull()
    expect(christmasDay(at('2026-07-15'))).toBeNull()
  })
})

describe('christmasDate – a hidden preview for the creator', () => {
  const now = new Date('2026-11-08T10:30:00')
  it('uses the real date without a preview', () => {
    expect(christmasDate(now, null)).toBe(now)
  })
  it('moves to the preview day but keeps the time', () => {
    const preview = christmasDate(now, '2026-12-16')
    expect([preview.getFullYear(), preview.getMonth(), preview.getDate(), preview.getHours()]).toEqual([2026, 11, 16, 10])
  })
  it('ignores a broken preview value', () => {
    expect(christmasDate(now, 'jul')).toBe(now)
  })
})

describe('christmasMode – full on the front pages, calm while working, nothing in the games', () => {
  it.each([['hub', 'full'], ['auth', 'full'], ['picker', 'full'], ['games', 'off'], ['warehouse', 'calm'], ['guides', 'calm'], ['knowledge', 'calm'], ['calendar', 'calm']])('%s → %s', (view, mode) => {
    expect(christmasMode(view)).toBe(mode)
  })
})

describe('garland – the bulbs hang on the wire', () => {
  const options = { period: 150, top: 8, sag: 14, perPeriod: 5 }
  const lights = garland(1000, options)

  it('every bulb socket sits exactly on the wire', () => {
    expect(lights.bulbs.length).toBeGreaterThan(20)
    for (const bulb of lights.bulbs) expect(bulb.y).toBeCloseTo(wireY(bulb.x, options), 6)
  })

  it('the wire spans the whole window and is hung from hooks at its high points', () => {
    expect(lights.path.startsWith('M0 8')).toBe(true)
    expect(lights.hooks[0]).toBe(0)
    expect(lights.hooks[lights.hooks.length - 1]).toBeGreaterThanOrEqual(1000)
    for (const hook of lights.hooks) expect(wireY(hook, options)).toBeCloseTo(8, 6)
  })

  it('no bulb sits on a hook and they never point up', () => {
    for (const bulb of lights.bulbs) {
      expect(lights.hooks.some(hook => Math.abs(hook - bulb.x) < 8)).toBe(false)
      expect(Math.abs(bulb.tilt)).toBeLessThanOrEqual(20)
    }
  })
})

describe('snowCapPath', () => {
  it('is a closed shape that looks a little different on every card', () => {
    const a = snowCapPath(1)
    expect(a).toMatch(/^M[\d. ]+.*Z$/)
    expect(snowCapPath(1)).toBe(a)
    expect(snowCapPath(2)).not.toBe(a)
  })

  it('keeps icicles thin on a wide board instead of stretching them', () => {
    const wide = snowCapPath(4, 1200)
    const tips = [...wide.matchAll(/L(-?[\d.]+) (3\d(?:\.\d)?) L(-?[\d.]+) 28/g)].map(match => +match[3] - +match[1])
    expect(tips.length).toBeGreaterThanOrEqual(6)
    for (const width of tips) expect(Math.abs(width)).toBeLessThanOrEqual(8)
    const xs = [...wide.matchAll(/ (-?[\d.]+) [\d.]+(?= |$)/g)].map(match => +match[1])
    expect(Math.max(...xs)).toBeLessThanOrEqual(1200)
  })
})

describe('the advent calendar doors', () => {
  it('has a different message behind each of the 24 doors', () => {
    const danish = Array.from({ length: 24 }, (_, i) => doorMessage(i + 1, 'da'))
    expect(new Set(danish).size).toBe(24)
    for (const message of danish) expect(message.length).toBeGreaterThan(10)
    expect(doorMessage(1, 'en')).not.toBe(doorMessage(1, 'da'))
    expect(doorMessage(1, 'sv')).toBe(doorMessage(1, 'en'))
    expect(doorMessage(25, 'da')).toBe('')
  })

  it('behind the doors are short facts about (Danish) Christmas, written like a person would, never a hint about the nisse', () => {
    const all = Array.from({ length: 24 }, (_, i) => [doorMessage(i + 1, 'da'), doorMessage(i + 1, 'en')]).flat()
    expect(new Set(all).size).toBe(48)
    expect(doorMessage(1, 'da').startsWith('Velkommen til december!')).toBe(false)
    for (const fact of all) {
      expect(fact.length, fact).toBeGreaterThanOrEqual(150)
      expect(fact.length, fact).toBeLessThanOrEqual(340)
      expect(fact, fact).not.toMatch(/[–—]| - /)
      expect(fact, fact).not.toMatch(/nisseleg|elf hunt|gemmer sig|hiding|madplan|vagtplan|notesbog|link library|knowledge base|forbedring|\bappen\b|\bthe app\b/i)
    }
  })
})

describe('christmasLabels', () => {
  it('counts the days to Christmas Eve in plain words', () => {
    expect(christmasLabels('da').daysToEve(8)).toBe('8 dage til juleaften')
    expect(christmasLabels('da').daysToEve(1)).toBe('1 dag til juleaften')
    expect(christmasLabels('en').daysToEve(2)).toBe('2 days to Christmas Eve')
  })
})

describe('opened doors are remembered on this PC for this year', () => {
  it('remembers each door once and starts over next year', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    expect(openedDoors(storage, 2026)).toEqual([])
    rememberOpenedDoor(3, storage, 2026)
    rememberOpenedDoor(3, storage, 2026)
    rememberOpenedDoor(4, storage, 2026)
    expect(openedDoors(storage, 2026)).toEqual([3, 4])
    expect(openedDoors(storage, 2027)).toEqual([])
    expect(openedDoors({ getItem: () => 'not json' }, 2026)).toEqual([])
  })
})

describe('seasonLine', () => {
  it('counts down in Advent and greets from Christmas Eve on', () => {
    expect(seasonLine(christmasDay(at('2026-12-16'))!, 'da')).toBe('8 dage til juleaften')
    expect(seasonLine(christmasDay(at('2026-12-24'))!, 'da')).toBe('Glædelig jul, det er juleaften!')
    expect(seasonLine(christmasDay(at('2026-12-26'))!, 'da')).toBe('Glædelig jul')
    expect(seasonLine(christmasDay(at('2027-01-01'))!, 'da')).toBe('Godt nytår')
  })
})
describe('snowRidgePath – snow along the top edge of the window', () => {
  it('covers the whole width with icicles of natural size however wide the window is', () => {
    const ridge = snowRidgePath(1600, 7)
    expect(ridge).toMatch(/^M0 0 .*Z$/)
    const xs = [...ridge.matchAll(/L(-?[\d.]+) (-?[\d.]+)/g)].map(match => +match[1])
    expect(Math.max(...xs)).toBeLessThanOrEqual(1600)
    expect(ridge).toContain('L1600 0')
    const tips = [...ridge.matchAll(/L[\d.]+ ([\d.]+) L/g)].map(match => +match[1])
    expect(tips.length).toBeGreaterThanOrEqual(8)
    expect(Math.max(...tips)).toBeLessThanOrEqual(26)
    expect(snowRidgePath(1600, 7)).toBe(ridge)
  })
})

describe('applyChristmasAttribute', () => {
  it('marks <html> with the mode so CSS can dress the app, and clears it when off', () => {
    const root = { dataset: {} as DOMStringMap }
    applyChristmasAttribute(root, 'full')
    expect(root.dataset.christmas).toBe('full')
    applyChristmasAttribute(root, 'off')
    expect(root.dataset.christmas).toBeUndefined()
    applyChristmasAttribute(root, 'calm')
    applyChristmasAttribute(root, null)
    expect(root.dataset.christmas).toBeUndefined()
  })
})
describe('classic Danish hanging decorations', () => {
  it('hangs a mix of baubles, woven hearts, stars, paper cones, pine cones, drums, nisser and straw stars on some cards', () => {
    expect(ORNAMENT_KINDS).toEqual(['bauble', 'heart', 'star', 'cone', 'pinecone', 'drum', 'nisse', 'straw'])
    const ornaments = Array.from({ length: 300 }, (_, seed) => cardOrnament(seed))
    const hung = ornaments.filter(Boolean)
    expect(hung.length).toBeGreaterThan(80)
    expect(hung.length).toBeLessThan(180)
    expect(new Set(hung.map(ornament => ornament!.kind)).size).toBe(ORNAMENT_KINDS.length)
    expect(new Set(hung.filter(ornament => ornament!.kind === 'bauble').map(ornament => ornament!.color)).size).toBeGreaterThanOrEqual(5)
    expect(cardOrnament(7)).toEqual(cardOrnament(7))
  })

  it('the Dannebrog string has every flag fastened to its own wire', () => {
    const flags = flagString(1400)
    expect(flags.flags.length).toBeGreaterThan(30)
    for (const flag of flags.flags) expect(flag.y).toBeCloseTo(wireY(flag.x, flags.options), 6)
  })

  it('decorations hang from the light string on threads tied to the wire', () => {
    const options = { period: 150, top: 7, sag: 12, perPeriod: 5 }
    const hanging = stringOrnaments(1400, options)
    expect(hanging.length).toBeGreaterThanOrEqual(4)
    for (const item of hanging) {
      expect(item.y).toBeCloseTo(wireY(item.x, options), 6)
      expect(item.thread).toBeGreaterThanOrEqual(14)
      expect(item.thread).toBeLessThanOrEqual(60)
    }
  })
})