import { describe, it, expect } from 'vitest'
import { SECTORS } from '../campaign'
import { DIFFICULTIES } from '../config'
import { chickenLabels } from '../labels'
import { WAVE_TEMPLATES } from '../waveTemplates'
import { buildWaveSpec } from '../waves'
import { ALL_BOSS_IDS, BOSS_DEFS, BOSS_IDS, bossHealthFor, MINI_BOSS_IDS, MIN_TELEGRAPH, telegraphSeconds } from './index'

describe('boss-registret', () => {
  it('kender fem bosser og tre mini-bosser', () => {
    expect([...BOSS_IDS]).toEqual(['motherHen', 'eggeroid', 'iceQueen', 'roboRooster', 'galacticRooster'])
    expect([...MINI_BOSS_IDS]).toEqual(['eggTrio', 'chickenCruiser', 'ufoMothership'])
    expect(ALL_BOSS_IDS).toHaveLength(8)
    for (const id of ALL_BOSS_IDS) {
      const def = BOSS_DEFS[id]
      expect(def.id).toBe(id)
      expect(def.mini).toBe((MINI_BOSS_IDS as readonly string[]).includes(id))
      expect(def.points).toBeGreaterThan(0)
    }
  })

  it('har tre faser med angreb for alle nye bosser og mini-bosser', () => {
    for (const id of ALL_BOSS_IDS) {
      if (id === 'motherHen') continue
      const def = BOSS_DEFS[id]
      for (const phase of [1, 2, 3] as const) {
        expect(def.pattern![phase].length, `${id} fase ${phase}`).toBeGreaterThan(0)
        for (const attack of def.pattern![phase]) expect(def.attacks![attack], `${id}.${attack}`).toBeDefined()
      }
    }
  })

  it('peger sektorernes boss- og mini-boss-pladser på de nye skabeloner', () => {
    expect(SECTORS.map((sector) => sector.boss)).toEqual(['motherHen', 'eggeroid', 'iceQueen', 'roboRooster', 'galacticRooster'])
    expect(SECTORS.map((sector) => sector.miniBoss)).toEqual(['eggTrio', 'chickenCruiser', 'ufoMothership', 'eggTrioFire', 'chickenCruiserMk2'])
    const expected: [number, string, number][] = [
      [6, 'eggTrio', 0],
      [8, 'motherHen', 0],
      [14, 'chickenCruiser', 0],
      [16, 'eggeroid', 0],
      [22, 'ufoMothership', 0],
      [24, 'iceQueen', 0],
      [30, 'eggTrio', 1],
      [32, 'roboRooster', 0],
      [38, 'chickenCruiser', 1],
      [40, 'galacticRooster', 0],
      [48, 'motherHen', 0],
    ]
    for (const [wave, bossType, variant] of expected) {
      const spec = buildWaveSpec(wave, 'medium', 7)
      expect(spec.bossType, `bølge ${wave}`).toBe(bossType)
      expect(spec.bossVariant ?? 0, `bølge ${wave}`).toBe(variant)
      expect(spec.kind).toBe(wave % 8 === 0 ? 'boss' : 'miniBoss')
      expect(spec.flybys).toEqual([])
    }
    for (const id of ['eggeroid', 'iceQueen', 'roboRooster', 'galacticRooster'] as const) expect(WAVE_TEMPLATES[id].kind).toBe('boss')
    for (const id of ['eggTrio', 'eggTrioFire', 'chickenCruiser', 'chickenCruiserMk2', 'ufoMothership'] as const) expect(WAVE_TEMPLATES[id].kind).toBe('miniBoss')
  })

  it('skalerer livet med sværhedsgrad og Nyt+', () => {
    for (const id of ALL_BOSS_IDS) {
      expect(bossHealthFor(id, 'expert', 0)).toBeGreaterThan(bossHealthFor(id, 'easy', 0))
      expect(bossHealthFor(id, 'medium', 1)).toBeGreaterThan(bossHealthFor(id, 'medium', 0))
    }
    // Ægge-trioen er tre høns á ca. 25 liv på mellem.
    expect(bossHealthFor('eggTrio', 'medium', 0)).toBe(75)
    expect(bossHealthFor('galacticRooster', 'medium', 0)).toBeGreaterThan(bossHealthFor('eggeroid', 'medium', 0))
  })

  it('varsler mindst 0,6 s i første runde og aldrig under 0,4 s', () => {
    expect(MIN_TELEGRAPH).toBe(0.4)
    for (const difficulty of DIFFICULTIES) {
      expect(telegraphSeconds(0.8, difficulty, 0)).toBeGreaterThanOrEqual(0.6)
      for (const round of [1, 2, 5, 20]) expect(telegraphSeconds(0.8, difficulty, round)).toBeGreaterThanOrEqual(MIN_TELEGRAPH)
    }
    expect(telegraphSeconds(0.8, 'easy', 0)).toBeGreaterThan(telegraphSeconds(0.8, 'expert', 0))
  })

  it('navngiver alle bosser på alle sprog med rigtige tegn', () => {
    const names = {
      da: ['Mor Høne', 'Æggeroiden', 'Isdronningen', 'Robo-Hanen', 'Den Galaktiske Hane', 'Ægge-trioen', 'Kyllingekrydseren', 'UFO-moderskibet'],
      en: ['Mother Hen', 'The Eggsteroid', 'The Ice Queen', 'Robo-Rooster', 'The Galactic Rooster', 'The Egg Trio', 'The Chicken Cruiser', 'The UFO Mothership'],
    }
    for (const [language, expected] of Object.entries(names)) expect(ALL_BOSS_IDS.map((id) => chickenLabels(language).bossName[id])).toEqual(expected)
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = chickenLabels(language)
      expect(new Set(ALL_BOSS_IDS.map((id) => labels.bossName[id])).size, language).toBe(8)
      for (const id of ALL_BOSS_IDS) {
        const texts = [labels.bossName[id], labels.bossIntro[id], labels.bossPhaseLine(id, 2), labels.bossPhaseLine(id, 3), labels.bossDefeatedFor(id, 0), labels.bossTitle(id, 1)]
        for (const value of texts) {
          expect(value.length, `${language} ${id}`).toBeGreaterThan(3)
          expect(value).not.toMatch(/\\u[0-9a-f]{4}/i)
        }
      }
      expect(labels.bossTitle('chickenCruiser', 1)).toContain('MK II')
      expect(labels.bossTitle('eggTrio', 1)).not.toBe(labels.bossTitle('eggTrio', 0))
      expect(labels.shieldDown.length).toBeGreaterThan(3)
      expect(labels.stats.sector.length).toBeGreaterThan(3)
    }
    expect(chickenLabels('da').stats.sector).toBe('Sektor nået')
    expect(chickenLabels('da').bossDefeatedFor('iceQueen', 0)).toBe('Isdronningen besejret!')
  })
})
