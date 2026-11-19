import { describe, it, expect } from 'vitest'
import { THEME_IDS, THEMES, mixHex, tintHen } from './themes'

const COLOR = /^#[0-9a-f]{6}$/i

describe('hønsefarver pr. tema', () => {
  it('blander to farver lineært', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#ff0000', '#0000ff', 0.25)).toBe('#bf0040')
  })

  it('lader hønsegården beholde de oprindelige farver og kam', () => {
    const look = { body: '#fff4dc', shade: '#e9c98f', belly: '#ffffff' }
    expect(tintHen('farm', look)).toEqual({ ...look, comb: '#ef3b4f' })
  })

  it('farver høns, hjelme og kam forskelligt i hvert tema med gyldige farver', () => {
    const look = { body: '#fff4dc', shade: '#e9c98f', belly: '#ffffff' }
    const results = THEME_IDS.map((id) => tintHen(id, look))
    for (const result of results) for (const value of Object.values(result)) expect(value).toMatch(COLOR)
    expect(new Set(results.map((result) => result.comb)).size).toBe(THEME_IDS.length)
    expect(new Set(results.map((result) => `${result.body}${result.shade}`)).size).toBeGreaterThan(2)
  })

  it('holder farveændringen diskret', () => {
    const look = { body: '#ffffff', shade: '#cfc7e8', belly: '#fff4dc' }
    for (const id of THEME_IDS) {
      const tinted = tintHen(id, look)
      const channel = (color: string, index: number) => parseInt(color.slice(1 + index * 2, 3 + index * 2), 16)
      for (const index of [0, 1, 2]) expect(Math.abs(channel(tinted.body, index) - channel(look.body, index))).toBeLessThanOrEqual(60)
    }
  })
})

describe('themes', () => {
  it('har de fem temaer i sektorrækkefølge', () => {
    expect([...THEME_IDS]).toEqual(['farm', 'asteroids', 'ice', 'volcano', 'mothership'])
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort())
  })

  it('giver hvert tema en komplet palet', () => {
    for (const id of THEME_IDS) {
      const palette = THEMES[id]
      expect(palette.nameKey).toBe(id)
      expect(palette.skyStops).toHaveLength(3)
      for (const [offset, color] of palette.skyStops) {
        expect(offset).toBeGreaterThanOrEqual(0)
        expect(offset).toBeLessThanOrEqual(1)
        expect(color).toMatch(COLOR)
      }
      expect(palette.halos.length).toBeGreaterThan(0)
      for (const halo of palette.halos) {
        expect(halo.color).toMatch(COLOR)
        expect(halo.alpha).toBeGreaterThan(0)
        expect(halo.alpha).toBeLessThanOrEqual(1)
        expect(halo.r).toBeGreaterThan(0)
      }
      for (const color of [palette.planet.inner, palette.planet.mid, palette.planet.outer, palette.planet.rim, palette.planet.accent]) {
        expect(color).toMatch(COLOR)
      }
      expect(palette.starTint).toMatch(COLOR)
      expect(palette.hen.tint).toMatch(COLOR)
      expect(palette.hen.accent).toMatch(COLOR)
    }
  })

  it('gør de fem himle forskellige fra hinanden', () => {
    const skies = THEME_IDS.map((id) => THEMES[id].skyStops[1][1])
    expect(new Set(skies).size).toBe(THEME_IDS.length)
    const features = THEME_IDS.map((id) => THEMES[id].feature)
    expect(new Set(features).size).toBe(THEME_IDS.length)
  })
})
