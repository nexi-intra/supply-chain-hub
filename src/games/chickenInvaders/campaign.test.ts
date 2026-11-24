import { describe, it, expect } from 'vitest'
import {
  SECTORS,
  SECTOR_COUNT,
  SLOT_RHYTHM,
  WAVES_PER_SECTOR,
  campaignPosition,
  campaignWave,
  coverPick,
  drawFormations,
  planRound,
  planSector,
  sectorFlybys,
  sectorMix,
  sectorScaling,
  slotScaling,
} from './campaign'
import { WAVE_TEMPLATES } from './waveTemplates'
import { THEME_IDS } from './themes'
import { createRng } from './rng'

const sectorWaves = (sector: number, round: number, seed: number) =>
  Array.from({ length: WAVES_PER_SECTOR }, (_, slot) => campaignWave(round * SECTOR_COUNT * WAVES_PER_SECTOR + sector * WAVES_PER_SECTOR + slot + 1, seed))

describe('campaignPosition', () => {
  it('regner sektor, plads og runde ud fra bølgenummeret', () => {
    expect(campaignPosition(1)).toEqual({ sector: 0, slot: 0, round: 0 })
    expect(campaignPosition(8)).toEqual({ sector: 0, slot: 7, round: 0 })
    expect(campaignPosition(9)).toEqual({ sector: 1, slot: 0, round: 0 })
    expect(campaignPosition(20)).toEqual({ sector: 2, slot: 3, round: 0 })
    expect(campaignPosition(40)).toEqual({ sector: 4, slot: 7, round: 0 })
  })

  it('starter Nyt+ med sektor 1 og næste runde efter bølge 40', () => {
    expect(campaignPosition(41)).toEqual({ sector: 0, slot: 0, round: 1 })
    expect(campaignPosition(80)).toEqual({ sector: 4, slot: 7, round: 1 })
    expect(campaignPosition(81)).toEqual({ sector: 0, slot: 0, round: 2 })
  })
})

describe('sektorer og temaer', () => {
  it('har fem sektorer med hvert sit tema i fast rækkefølge', () => {
    expect(SECTORS).toHaveLength(SECTOR_COUNT)
    expect(SECTORS.map((sector) => sector.themeId)).toEqual([...THEME_IDS])
    expect(campaignWave(1, 1).theme).toBe('farm')
    expect(campaignWave(9, 1).theme).toBe('asteroids')
    expect(campaignWave(17, 1).theme).toBe('ice')
    expect(campaignWave(25, 1).theme).toBe('volcano')
    expect(campaignWave(33, 1).theme).toBe('mothership')
    expect(campaignWave(41, 1).theme).toBe('farm')
  })

  it('kender kun skabeloner, der er registreret', () => {
    for (const sector of SECTORS) {
      for (const id of [...sector.formations, ...sector.hazards, ...sector.bonuses, sector.miniBoss, sector.boss]) {
        expect(WAVE_TEMPLATES[id], id).toBeDefined()
      }
    }
  })
})

describe('rytmen i en sektor', () => {
  it('kører formation, formation, hazard, bonus, formation, mini-boss, formation, boss', () => {
    expect([...SLOT_RHYTHM]).toEqual(['formation', 'formation', 'hazard', 'bonus', 'formation', 'miniboss', 'formation', 'boss'])
    for (let sector = 0; sector < SECTOR_COUNT; sector++) {
      for (const round of [0, 1]) {
        expect(sectorWaves(sector, round, 5).map((wave) => wave.slotType)).toEqual([...SLOT_RHYTHM])
      }
    }
  })

  it('trækker hver plads fra sektorens egen pulje', () => {
    for (let sector = 0; sector < SECTOR_COUNT; sector++) {
      const def = SECTORS[sector]
      sectorWaves(sector, 0, 3).forEach((wave, slot) => {
        switch (SLOT_RHYTHM[slot]) {
          case 'formation':
            expect(def.formations).toContain(wave.templateId)
            break
          case 'hazard':
            expect(def.hazards).toContain(wave.templateId)
            break
          case 'bonus':
            expect(def.bonuses).toContain(wave.templateId)
            break
          case 'miniboss':
            expect(wave.templateId).toBe(def.miniBoss)
            break
          case 'boss':
            expect(wave.templateId).toBe(def.boss)
            break
        }
      })
    }
  })

  it('giver hver sektor sin egen boss og mini-boss (fase 6)', () => {
    expect(SECTORS.map((sector) => sector.boss)).toEqual(['motherHen', 'eggeroid', 'iceQueen', 'roboRooster', 'galacticRooster'])
    expect(SECTORS.map((sector) => sector.miniBoss)).toEqual(['eggTrio', 'chickenCruiser', 'ufoMothership', 'eggTrioFire', 'chickenCruiserMk2'])
  })
})

describe('formationsbølger uden gentagelse', () => {
  it('gentager aldrig en formation i samme sektor når puljen er stor nok', () => {
    for (let seed = 0; seed < 50; seed++) {
      const picks = drawFormations(['a', 'b', 'c', 'd', 'e', 'f'], 4, createRng(seed))
      expect(new Set(picks).size).toBe(4)
    }
  })

  it('undgår at samme formation kommer to gange i træk når puljen er mindre end fire', () => {
    for (let seed = 0; seed < 50; seed++) {
      const picks = drawFormations(['a', 'b', 'c'], 4, createRng(seed))
      expect(picks).toHaveLength(4)
      for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1])
    }
  })

  it('kan lægge en åbner først', () => {
    for (let seed = 0; seed < 20; seed++) expect(drawFormations(['a', 'b', 'c'], 4, createRng(seed), 'b')[0]).toBe('b')
  })

  it('overholder reglen i alle sektorer og runder', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (let sector = 0; sector < SECTOR_COUNT; sector++) {
        for (const round of [0, 1, 2]) {
          const formations = sectorWaves(sector, round, seed).filter((wave) => wave.slotType === 'formation').map((wave) => wave.templateId)
          expect(formations).toHaveLength(4)
          if (SECTORS[sector].formations.length >= 4) expect(new Set(formations).size).toBe(4)
          for (let i = 1; i < formations.length; i++) expect(formations[i]).not.toBe(formations[i - 1])
        }
      }
    }
  })
})

describe('formationspuljer i fase 2', () => {
  it('giver hver sektor mindst seks formationer, og sektor 1 åbner med den klassiske', () => {
    for (const sector of SECTORS) {
      expect(sector.formations.length).toBeGreaterThanOrEqual(6)
      expect(sector.formations.length).toBeLessThanOrEqual(8)
      expect(new Set(sector.formations).size).toBe(sector.formations.length)
    }
    expect(SECTORS[0].opener).toBe('classic')
    expect(SECTORS[0].formations).toContain('classic')
  })

  it('bruger alle nye skabeloner i mindst én sektor og bevarer de gamle', () => {
    const used = new Set(SECTORS.flatMap((sector) => sector.formations))
    for (const id of ['vSquadron', 'carousel', 'conga', 'pinballFlock', 'diamondDance', 'loopSquad', 'twinFlanks', 'checkerWall', 'columnDrop', 'arrowhead', 'classic', 'divers', 'armored'] as const) {
      expect(used.has(id), id).toBe(true)
    }
  })

  it('giver de senere sektorer de hårdeste mønstre', () => {
    const hard = ['pinballFlock', 'loopSquad', 'arrowhead']
    const count = (sector: number) => SECTORS[sector].formations.filter((id) => hard.includes(id)).length
    expect(count(0)).toBe(0)
    expect(count(3)).toBeGreaterThan(count(1))
    expect(count(4)).toBeGreaterThanOrEqual(count(2))
  })

  it('gentager aldrig en formation på plads 1, 2, 5 og 7 i samme sektor', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (let sector = 0; sector < SECTOR_COUNT; sector++) {
        for (const round of [0, 1, 2, 3]) {
          const waves = sectorWaves(sector, round, seed)
          const ids = [0, 1, 4, 6].map((slot) => waves[slot].templateId)
          expect(new Set(ids).size, `seed ${seed} sektor ${sector} runde ${round}: ${ids.join(',')}`).toBe(4)
        }
      }
    }
  })
})

describe('determinisme', () => {
  it('giver samme sektorplan for samme seed', () => {
    expect(planSector(42, 2, 0)).toEqual(planSector(42, 2, 0))
    expect(sectorWaves(1, 0, 42)).toEqual(sectorWaves(1, 0, 42))
  })

  it('afhænger ikke af hvilke bølger der er slået op før', () => {
    const direct = campaignWave(30, 7)
    for (let wave = 1; wave <= 60; wave++) campaignWave(wave, 7)
    expect(campaignWave(30, 7)).toEqual(direct)
  })

  it('kan give forskellig rækkefølge for forskellige seeds', () => {
    const orders = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) orders.add(planSector(seed, 1, 0).join(','))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('trækker en ny plan for hver runde af Nyt+', () => {
    const plans = new Set<string>()
    for (let round = 0; round < 12; round++) plans.add(planSector(9, 1, round).join(','))
    expect(plans.size).toBeGreaterThan(1)
  })

  it('åbner hver kampagne med den klassiske formation', () => {
    for (let seed = 0; seed < 30; seed++) expect(campaignWave(1, seed).templateId).toBe('classic')
  })
})

describe('sværhedsgrad', () => {
  it('stiger med sektoren: 1 + 0,08 pr. sektor', () => {
    expect(sectorScaling(0)).toBe(1)
    expect(sectorScaling(1)).toBeCloseTo(1.08)
    expect(sectorScaling(4)).toBeCloseTo(1.32)
  })

  it('stiger gennem sektoren, så den sidste plads er den hårdeste', () => {
    for (let slot = 1; slot < WAVES_PER_SECTOR; slot++) expect(slotScaling(slot)).toBeGreaterThan(slotScaling(slot - 1))
    expect(slotScaling(0)).toBe(1)
  })

  it('lægger sektor- og pladsskalering på bølgen', () => {
    const wave = campaignWave(17, 1)
    expect(wave.sectorScaling).toBeCloseTo(1.16)
    expect(wave.slotScaling).toBeCloseTo(slotScaling(0))
    expect(campaignWave(41, 1).sectorScaling).toBeCloseTo(sectorScaling(4))
    expect(campaignWave(49, 1).sectorScaling).toBeCloseTo(sectorScaling(5))
  })
})

describe('fjender pr. sektor (fase 3)', () => {
  const kinds = (entries: { kind: string }[]) => new Set(entries.map((entry) => entry.kind))

  it('giver hver sektor de typiske kyllinger fra planen, og hver sektor bygger videre på den forrige', () => {
    expect(kinds(SECTORS[0].mix)).toEqual(new Set(['balloon']))
    expect(kinds(SECTORS[1].mix)).toEqual(new Set(['balloon', 'sniper']))
    expect(kinds(SECTORS[2].mix)).toEqual(new Set(['balloon', 'sniper', 'shield', 'medic']))
    expect(kinds(SECTORS[3].mix)).toEqual(new Set(['balloon', 'sniper', 'shield', 'medic', 'bomber', 'turkey']))
    expect(kinds(SECTORS[4].mix)).toEqual(new Set(['balloon', 'sniper', 'shield', 'medic', 'bomber', 'turkey']))
    expect(SECTORS[0].flybys).toEqual([])
    for (const sector of [1, 2, 3]) expect(SECTORS[sector].flybys, `sektor ${sector + 1}`).toEqual(['ninja'])
    expect([...SECTORS[4].flybys].sort()).toEqual(['ninja', 'ufo'])
    for (const sector of SECTORS) {
      for (const entry of sector.mix) {
        expect(entry.share).toBeGreaterThan(0)
        expect(entry.share).toBeLessThanOrEqual(0.5)
      }
    }
  })

  it('lægger de nye skabeloner i de rigtige sektorpuljer', () => {
    expect(SECTORS[1].formations).toContain('sniperNest')
    expect(SECTORS[2].formations).toContain('medicSquad')
    expect(SECTORS[3].formations).toContain('turkeyRaid')
    for (const id of ['sniperNest', 'medicSquad', 'turkeyRaid', 'ufoAmbush'] as const) expect(SECTORS[4].formations, id).toContain(id)
    expect(SECTORS[0].formations.some((id) => ['sniperNest', 'medicSquad', 'turkeyRaid', 'ufoAmbush'].includes(id))).toBe(false)
  })

  it('blander alle kyllinger ind i Nyt+ og skruer lidt op for andelen', () => {
    expect(kinds(sectorMix(0, 0))).toEqual(new Set(['balloon']))
    const newPlus = sectorMix(0, 1)
    for (const kind of ['balloon', 'sniper', 'shield', 'medic', 'bomber', 'turkey']) expect(kinds(newPlus).has(kind), kind).toBe(true)
    const share = (entries: { kind: string; share: number }[], kind: string) => entries.find((entry) => entry.kind === kind)?.share ?? 0
    expect(share(sectorMix(3, 1), 'turkey')).toBeGreaterThan(share(sectorMix(3, 0), 'turkey'))
    for (const entry of sectorMix(4, 9)) expect(entry.share).toBeLessThanOrEqual(0.5)
    expect(sectorFlybys(0, 1)).toContain('ninja')
  })

  it('giver hver bølge et eget seedet tal til placering af kyllingerne', () => {
    expect(campaignWave(12, 4).variety).toBe(campaignWave(12, 4).variety)
    expect(new Set([1, 2, 3, 4, 5].map((seed) => campaignWave(12, seed).variety)).size).toBe(5)
  })
})

describe('hazards og bonusbaner pr. sektor (fase 4)', () => {
  const HAZARDS = ['meteorShower', 'goldRush', 'asteroidBelt', 'cometStorm', 'blackHole']
  const BONUSES = ['drumstickRain', 'shootingGallery', 'eggDodge']

  it('har hazard-puljerne fra planens tabel', () => {
    expect([...SECTORS[0].hazards].sort()).toEqual(['goldRush', 'meteorShower'])
    expect([...SECTORS[1].hazards].sort()).toEqual(['asteroidBelt', 'meteorShower'])
    expect([...SECTORS[2].hazards].sort()).toEqual(['cometStorm', 'meteorShower'])
    expect([...SECTORS[3].hazards].sort()).toEqual(['blackHole', 'meteorShower'])
    expect(SECTORS[4].hazards).toContain('blackHole')
    expect(SECTORS[4].hazards).toContain('meteorShower')
    expect(new Set(SECTORS.flatMap((sector) => sector.hazards))).toEqual(new Set(HAZARDS))
    for (const sector of SECTORS) for (const id of sector.hazards) expect(WAVE_TEMPLATES[id].kind, id).toBe('meteors')
  })

  it('har bonuspuljer med mindst to baner pr. sektor, så alle tre findes', () => {
    for (const sector of SECTORS) {
      expect(sector.bonuses.length).toBeGreaterThanOrEqual(2)
      for (const id of sector.bonuses) expect(WAVE_TEMPLATES[id].kind, id).toBe('bonus')
    }
    expect(new Set(SECTORS.flatMap((sector) => sector.bonuses))).toEqual(new Set(BONUSES))
    expect('goldenFlock' in WAVE_TEMPLATES).toBe(false)
  })

  it('lader en hel runde møde alle fem hazards og alle tre bonusbaner', () => {
    for (let seed = 0; seed < 120; seed++) {
      for (const round of [0, 1, 2]) {
        const waves = Array.from({ length: SECTOR_COUNT * WAVES_PER_SECTOR }, (_, i) => campaignWave(round * 40 + i + 1, seed))
        const hazards = waves.filter((wave) => wave.slotType === 'hazard').map((wave) => wave.templateId)
        const bonuses = waves.filter((wave) => wave.slotType === 'bonus').map((wave) => wave.templateId)
        expect(new Set(hazards), `seed ${seed} runde ${round}`).toEqual(new Set(HAZARDS))
        expect(new Set(bonuses), `seed ${seed} runde ${round}`).toEqual(new Set(BONUSES))
      }
    }
  })

  it('viser hele galaksen i de første 40 bølger: 5 temaer, mindst 8 formationer, 5 hazards og 5 bosser', () => {
    for (let seed = 0; seed < 60; seed++) {
      const waves = Array.from({ length: 40 }, (_, i) => campaignWave(i + 1, seed))
      expect(new Set(waves.map((wave) => wave.theme)).size, `seed ${seed}`).toBe(5)
      expect(new Set(waves.filter((wave) => wave.slotType === 'formation').map((wave) => wave.templateId)).size, `seed ${seed}`).toBeGreaterThanOrEqual(8)
      expect(new Set(waves.filter((wave) => wave.slotType === 'hazard').map((wave) => wave.templateId)).size, `seed ${seed}`).toBe(5)
      expect(new Set(waves.filter((wave) => wave.slotType === 'boss').map((wave) => wave.templateId)).size, `seed ${seed}`).toBe(5)
    }
  })

  it('varierer hvilke sektorer der får hvad, men er deterministisk', () => {
    expect(planRound(5, 0)).toEqual(planRound(5, 0))
    const plans = new Set<string>()
    for (let seed = 0; seed < 60; seed++) plans.add(JSON.stringify(planRound(seed, 0)))
    expect(plans.size).toBeGreaterThan(5)
    const firstBonus = new Set<string>()
    for (let seed = 0; seed < 60; seed++) firstBonus.add(planRound(seed, 0).bonuses[0])
    expect(firstBonus.size).toBeGreaterThanOrEqual(2)
  })

  it('vælger ét element pr. pulje og dækker alt, når det kan lade sig gøre', () => {
    for (let seed = 0; seed < 30; seed++) {
      const picks = coverPick([['a', 'b'], ['b', 'c'], ['c', 'a']], createRng(seed))
      expect(new Set(picks)).toEqual(new Set(['a', 'b', 'c']))
    }
    expect(coverPick([['a'], ['a']], createRng(1))).toEqual(['a', 'a'])
    expect(coverPick([['a', 'b', 'c'], ['a']], createRng(1))).toHaveLength(2)
  })
})
