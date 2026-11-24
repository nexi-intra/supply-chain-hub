import { describe, it, expect } from 'vitest'
import { campaignWave } from './campaign'
import { DANGER_ZONE_Y, FIELD, type Difficulty } from './config'
import { WAVE_TEMPLATES, type TemplateId } from './waveTemplates'
import { assignKinds, buildWaveSpec, buildSpecFromWave, formationSlots, slotKind, waveKind } from './waves'

const forTemplate = (templateId: TemplateId, wave = 1, difficulty: Difficulty = 'medium') =>
  buildSpecFromWave({ ...campaignWave(wave, 1), templateId }, difficulty)

describe('waveKind', () => {
  it('følger sektorens rytme: formation, formation, meteorer, bonus, formation, mini-boss, formation, boss', () => {
    const kinds = [1, 2, 3, 4, 5, 6, 7, 8].map((wave) => waveKind(wave, 3))
    expect(kinds[2]).toBe('meteors')
    expect(kinds[3]).toBe('bonus')
    expect(kinds[5]).toBe('miniBoss')
    expect(kinds[7]).toBe('boss')
    for (const slot of [0, 1, 4, 6]) expect(['formation', 'divers', 'armored']).toContain(kinds[slot])
  })

  it('gentager rytmen i næste sektor og i Nyt+', () => {
    expect([11, 12, 14, 16, 51, 52, 56].map((wave) => waveKind(wave, 3))).toEqual(['meteors', 'bonus', 'miniBoss', 'boss', 'meteors', 'bonus', 'boss'])
  })
})

describe('skabelonregistret', () => {
  it('har skabelonerne fra fase 1 med de eksisterende bølgetyper', () => {
    expect(WAVE_TEMPLATES.classic.kind).toBe('formation')
    expect(WAVE_TEMPLATES.divers.kind).toBe('divers')
    expect(WAVE_TEMPLATES.armored.kind).toBe('armored')
    expect(WAVE_TEMPLATES.meteorShower.kind).toBe('meteors')
    expect(WAVE_TEMPLATES.motherHen.kind).toBe('boss')
  })

  it('har hazard- og bonusskabelonerne fra fase 4', () => {
    for (const id of ['meteorShower', 'goldRush', 'asteroidBelt', 'cometStorm', 'blackHole'] as const) {
      expect(WAVE_TEMPLATES[id].kind, id).toBe('meteors')
      const spec = forTemplate(id, 3)
      expect(spec.rows).toBe(0)
      expect(spec.meteorCount, id).toBeGreaterThan(0)
    }
    for (const id of ['drumstickRain', 'shootingGallery', 'eggDodge'] as const) {
      expect(WAVE_TEMPLATES[id].kind, id).toBe('bonus')
      expect(forTemplate(id, 4)).toMatchObject({ rows: 0, meteorCount: 0, goldenFlyby: false })
    }
  })

  it('lader hver skabelon bygge en komplet spec med layout, bevægelse og indflyvning', () => {
    const layouts = ['grid', 'vShape', 'ring', 'diamond', 'flanks', 'columns', 'checker', 'arrow']
    const motions = ['sway', 'rotate', 'bob', 'snake', 'pinball', 'loopers']
    const entrances = ['sides', 'top', 'spiral', 'split']
    for (const id of Object.keys(WAVE_TEMPLATES) as TemplateId[]) {
      const spec = forTemplate(id)
      expect(spec.templateId).toBe(id)
      expect(spec.kind).toBe(WAVE_TEMPLATES[id].kind)
      expect(layouts).toContain(spec.layout)
      expect(motions).toContain(spec.motion)
      expect(entrances).toContain(spec.entrance)
      expect(['rows', 'checker']).toContain(spec.helmetPattern)
    }
  })

  it('lader de gamle skabeloner beholde gitter, sway og indflyvning fra siderne', () => {
    for (const id of ['classic', 'divers', 'armored', 'meteorShower', 'motherHen'] as const) {
      expect(forTemplate(id)).toMatchObject({ layout: 'grid', motion: 'sway', entrance: 'sides', helmetPattern: 'rows' })
    }
  })

  it('har de nye skabeloner med de gamle bølgetyper, så lyd og flow er uændret', () => {
    for (const id of ['vSquadron', 'carousel', 'conga', 'pinballFlock', 'diamondDance', 'loopSquad', 'twinFlanks', 'checkerWall', 'columnDrop', 'arrowhead'] as const) {
      expect(['formation', 'divers', 'armored']).toContain(WAVE_TEMPLATES[id].kind)
      expect(forTemplate(id).rows).toBeGreaterThan(0)
    }
    expect(forTemplate('checkerWall').helmetPattern).toBe('checker')
    expect(forTemplate('arrowhead').diveRate).toBeGreaterThan(0)
    expect(forTemplate('loopSquad').diveRate).toBeGreaterThan(0)
  })
})

describe('buildWaveSpec', () => {
  it('beskriver bølgens plads i kampagnen', () => {
    const spec = buildWaveSpec(11, 'medium', 5)
    expect(spec).toMatchObject({ wave: 11, sector: 1, slot: 2, round: 0, theme: 'asteroids', slotType: 'hazard', hazard: spec.templateId })
    expect(['asteroidBelt', 'meteorShower']).toContain(spec.templateId)
    expect(buildWaveSpec(41, 'medium', 5)).toMatchObject({ sector: 0, slot: 0, round: 1, theme: 'farm' })
  })

  it('er deterministisk pr. seed', () => {
    expect(buildWaveSpec(12, 'hard', 77)).toEqual(buildWaveSpec(12, 'hard', 77))
  })

  it('giver Mor Høne et højere niveau for hver boss-bølge', () => {
    expect(buildWaveSpec(8, 'medium', 1)).toMatchObject({ bossLevel: 1, bossType: 'motherHen', kind: 'boss' })
    expect(buildWaveSpec(16, 'medium', 1).bossLevel).toBe(2)
    expect(buildWaveSpec(40, 'medium', 1).bossLevel).toBe(5)
    expect(buildWaveSpec(48, 'medium', 1).bossLevel).toBe(6)
    expect(buildWaveSpec(7, 'medium', 1).bossLevel).toBe(0)
    expect(buildWaveSpec(7, 'medium', 1).bossType).toBeUndefined()
  })

  it('bliver hurtigere og større for hver runde', () => {
    const first = buildWaveSpec(1, 'medium', 1)
    const second = buildWaveSpec(41, 'medium', 1)
    expect(second.enemySpeed).toBeGreaterThan(first.enemySpeed)
    expect(second.eggRate).toBeGreaterThan(first.eggRate)
    expect(second.rows).toBeGreaterThan(first.rows)
  })

  it('gør Nyt+ til et skridt op fra sektor 5 i stedet for et fald', () => {
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const sectorFive = forTemplate('classic', 33, difficulty)
      const newPlus = forTemplate('classic', 41, difficulty)
      expect(newPlus.eggRate, difficulty).toBeGreaterThan(sectorFive.eggRate)
      expect(newPlus.eggSpeed, difficulty).toBeGreaterThanOrEqual(sectorFive.eggSpeed)
      expect(newPlus.enemySpeed, difficulty).toBeGreaterThanOrEqual(sectorFive.enemySpeed)
      expect(newPlus.eggRate / sectorFive.eggRate, `${difficulty}: ikke et chok`).toBeLessThan(1.4)
    }
  })

  it('giver Nyt+-hazards samme tæthed som sektor 5 (farten bærer skridtet op), så meteorregnen ikke bliver en mur', () => {
    for (const id of ['meteorShower', 'goldRush', 'cometStorm', 'blackHole', 'asteroidBelt'] as const) {
      const sectorFive = forTemplate(id, 35, 'expert')
      const newPlus = forTemplate(id, 43, 'expert')
      expect(newPlus.meteorCount / sectorFive.meteorCount, id).toBeLessThanOrEqual(1.1)
      expect(newPlus.eggSpeed, id).toBeGreaterThan(sectorFive.eggSpeed * 0.99)
    }
  })

  it('bliver hårdere for hver sektor og gennem sektoren', () => {
    const early = forTemplate('classic', 1)
    const laterSector = forTemplate('classic', 33)
    const laterSlot = forTemplate('classic', 7)
    expect(laterSector.enemySpeed).toBeGreaterThan(early.enemySpeed)
    expect(laterSector.eggRate).toBeGreaterThan(early.eggRate)
    expect(laterSlot.enemySpeed).toBeGreaterThan(early.enemySpeed)
    expect(laterSlot.eggSpeed).toBeGreaterThan(early.eggSpeed)
  })

  it('gør de sene sektorer hårdere med æg frem for fart, så mønstrene kan læses', () => {
    for (const difficulty of ['easy', 'expert'] as const) {
      const first = forTemplate('classic', 1, difficulty)
      const hardest = forTemplate('classic', 39, difficulty)
      expect(hardest.enemySpeed / first.enemySpeed, difficulty).toBeLessThanOrEqual(1.35)
      expect(hardest.eggRate / first.eggRate, difficulty).toBeGreaterThanOrEqual(1.5)
    }
  })

  it('holder formationen inden for 6 rækker og 10 kolonner', () => {
    for (let wave = 1; wave <= 400; wave++) {
      const spec = buildWaveSpec(wave, 'expert', 4)
      expect(spec.rows).toBeLessThanOrEqual(6)
      expect(spec.cols).toBeLessThanOrEqual(10)
    }
  })

  it('har kun meteorer i meteorbølgen, og flere for hver runde', () => {
    const first = buildWaveSpec(3, 'medium', 1)
    expect(first.rows).toBe(0)
    expect(first.meteorCount).toBeGreaterThan(0)
    expect(buildWaveSpec(43, 'medium', 1).meteorCount).toBeGreaterThan(first.meteorCount)
  })

  it('lader kun dykkerne dykke i første runde', () => {
    expect(forTemplate('classic', 1).diveRate).toBe(0)
    const divers = forTemplate('divers', 2)
    expect(divers.diveRate).toBeGreaterThan(0)
    expect(divers.diverRows).toBeGreaterThanOrEqual(1)
  })

  it('har hjelmrækker og en guldhøne i hjelmbølgen', () => {
    const armored = forTemplate('armored', 6)
    expect(armored.helmetRows).toBeGreaterThanOrEqual(2)
    expect(armored.helmetRows).toBeLessThan(armored.rows)
    expect(armored.goldenFlyby).toBe(true)
  })

  it('gør plads 4 til en bonusbane uden formation', () => {
    const bonus = buildWaveSpec(4, 'medium', 1)
    expect(bonus).toMatchObject({ slotType: 'bonus', kind: 'bonus', bonus: bonus.templateId, rows: 0 })
    expect(['drumstickRain', 'shootingGallery']).toContain(bonus.templateId)
  })

  it('markerer hazard og mini-boss i spec', () => {
    expect(['meteorShower', 'goldRush']).toContain(buildWaveSpec(3, 'medium', 1).hazard)
    expect(buildWaveSpec(6, 'medium', 1).miniBoss).toBe('eggTrio')
    expect(buildWaveSpec(1, 'medium', 1).hazard).toBeUndefined()
  })

  it('kaster flere æg på en sværere sværhedsgrad', () => {
    expect(buildWaveSpec(1, 'expert', 1).eggRate).toBeGreaterThan(buildWaveSpec(1, 'easy', 1).eggRate)
  })
})

describe('formationSlots', () => {
  it('placerer alle høns inden for banen og over farezonen', () => {
    for (let wave = 1; wave <= 120; wave++) {
      const spec = buildWaveSpec(wave, 'expert', 6)
      const slots = formationSlots(spec, FIELD.width)
      if (spec.rows === 0) expect(slots).toHaveLength(0)
      else if (spec.layout === 'grid' && spec.motion !== 'snake') expect(slots).toHaveLength(spec.rows * spec.cols)
      else expect(slots.length).toBeGreaterThanOrEqual(12)
      expect(new Set(slots.map((slot) => `${slot.x},${slot.y}`)).size).toBe(slots.length)
      for (const slot of slots) {
        expect(slot.x - 24).toBeGreaterThanOrEqual(0)
        expect(slot.x + 24).toBeLessThanOrEqual(FIELD.width)
        expect(slot.y + 24).toBeLessThan(DANGER_ZONE_Y)
      }
    }
  })
})

describe('slotKind', () => {
  it('sætter hjelme øverst og dykkere nederst', () => {
    const spec = { ...forTemplate('armored', 6), rows: 5, helmetRows: 2, diverRows: 1 }
    expect([0, 1, 2, 3, 4].map((row) => slotKind(spec, row))).toEqual(['helmet', 'helmet', 'hen', 'hen', 'diver'])
  })

  it('lægger hjelme på hvert andet felt i skakbrætmønsteret og dykkere nederst', () => {
    const spec = { ...forTemplate('checkerWall', 1), rows: 5, helmetRows: 0, diverRows: 1, helmetPattern: 'checker' as const }
    expect(slotKind(spec, 0, 0)).toBe('helmet')
    expect(slotKind(spec, 0, 1)).toBe('hen')
    expect(slotKind(spec, 1, 0)).toBe('hen')
    expect(slotKind(spec, 1, 1)).toBe('helmet')
    expect(slotKind(spec, 2, 3)).toBe('hen')
    expect(slotKind(spec, 4, 0)).toBe('diver')
  })

  it('gør skakbrætmuren til et rigtigt skakbræt: ingen to naboer på række eller kolonne er ens', () => {
    for (const wave of [9, 17, 33, 73, 161]) {
      const spec = forTemplate('checkerWall', wave, 'expert')
      const slots = formationSlots(spec, FIELD.width)
      expect(slots.length, `bølge ${wave}`).toBeLessThanOrEqual(40)
      const kinds = new Map(slots.map((slot) => [`${slot.row},${slot.col}`, slotKind(spec, slot.row, slot.col)]))
      let helmets = 0
      let compared = 0
      for (const slot of slots) {
        const kind = kinds.get(`${slot.row},${slot.col}`)
        if (kind === 'diver') continue
        if (kind === 'helmet') helmets++
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const neighbour = kinds.get(`${slot.row + dr},${slot.col + dc}`)
          if (!neighbour || neighbour === 'diver') continue
          compared++
          expect(neighbour, `bølge ${wave} (${slot.row},${slot.col})`).not.toBe(kind)
        }
      }
      expect(compared).toBeGreaterThan(slots.length / 2)
      expect(helmets).toBeGreaterThanOrEqual(Math.floor((slots.length - spec.diverRows * spec.cols) / 2))
    }
  })
})

const BASE_KINDS = ['hen', 'helmet', 'diver']
const SECTOR_KINDS = [
  ['balloon'],
  ['balloon', 'sniper'],
  ['balloon', 'sniper', 'shield', 'medic'],
  ['balloon', 'sniper', 'shield', 'medic', 'bomber', 'turkey'],
  ['balloon', 'sniper', 'shield', 'medic', 'bomber', 'turkey'],
]
const kindsOf = (wave: number, seed: number, difficulty: Difficulty = 'medium') => {
  const spec = buildWaveSpec(wave, difficulty, seed)
  return assignKinds(spec, formationSlots(spec, FIELD.width))
}

describe('fjendeblanding (fase 3)', () => {
  it('holder den allerførste bølge ren: kun høns, hjelme og dykkere og ingen flyvere', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const kind of kindsOf(1, seed)) expect(BASE_KINDS).toContain(kind)
      expect(buildWaveSpec(1, 'medium', seed).flybys).toEqual([])
    }
  })

  it('erstatter kun almindelige høns, så hjelme og dykkere står hvor de plejer', () => {
    for (let wave = 1; wave <= 80; wave++) {
      const spec = buildWaveSpec(wave, 'expert', 3)
      const slots = formationSlots(spec, FIELD.width)
      assignKinds(spec, slots).forEach((kind, index) => {
        const base = slotKind(spec, slots[index].row, slots[index].col)
        if (base !== 'hen') expect(kind, `bølge ${wave}`).toBe(base)
      })
    }
  })

  it('er deterministisk pr. seed og varierer mellem seeds', () => {
    expect(kindsOf(20, 5)).toEqual(kindsOf(20, 5))
    const variants = new Set<string>()
    for (let seed = 0; seed < 20; seed++) variants.add(kindsOf(18, seed).join(','))
    expect(variants.size).toBeGreaterThan(1)
  })

  it('giver hver sektor sine typiske fjender og ingen fra senere sektorer', () => {
    for (let sector = 0; sector < 5; sector++) {
      const seen = new Set<string>()
      const flybys = new Set<string>()
      for (let seed = 0; seed < 40; seed++) {
        for (let slot = 0; slot < 8; slot++) {
          const wave = sector * 8 + slot + 1
          for (const kind of kindsOf(wave, seed)) seen.add(kind)
          for (const flyby of buildWaveSpec(wave, 'medium', seed).flybys) flybys.add(flyby.kind)
        }
      }
      const allowed = [...BASE_KINDS, ...SECTOR_KINDS[sector]]
      for (const kind of seen) expect(allowed, `sektor ${sector + 1}: ${kind}`).toContain(kind)
      for (const kind of SECTOR_KINDS[sector]) expect(seen.has(kind), `sektor ${sector + 1} mangler ${kind}`).toBe(true)
      expect(flybys.has('ninja'), `sektor ${sector + 1}`).toBe(sector >= 1)
      expect(flybys.has('ufo'), `sektor ${sector + 1}`).toBe(sector === 4)
    }
  })

  it('lader Nyt+ blande alle de nye fjender ind fra første sektor', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 40; seed++) for (let wave = 41; wave <= 48; wave++) for (const kind of kindsOf(wave, seed)) seen.add(kind)
    for (const kind of ['balloon', 'sniper', 'shield', 'medic', 'bomber', 'turkey']) expect(seen.has(kind), kind).toBe(true)
  })

  it('holder specialfjenderne i mindretal i almindelige formationsbølger', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (let wave = 1; wave <= 40; wave++) {
        const spec = buildWaveSpec(wave, 'expert', seed)
        if (spec.slotType !== 'formation' || ['sniperNest', 'medicSquad', 'turkeyRaid', 'ufoAmbush'].includes(spec.templateId)) continue
        const kinds = assignKinds(spec, formationSlots(spec, FIELD.width))
        const specials = kinds.filter((kind) => !BASE_KINDS.includes(kind)).length
        expect(specials / Math.max(1, kinds.length), `seed ${seed} bølge ${wave}`).toBeLessThanOrEqual(0.4)
        expect(kinds.filter((kind) => kind === 'turkey').length).toBeLessThanOrEqual(4)
      }
    }
  })

  it('lader regnbuehønen være sjælden men dukke op i formationsbølger', () => {
    let rainbows = 0
    let formations = 0
    for (let seed = 0; seed < 60; seed++) {
      for (let wave = 2; wave <= 40; wave++) {
        const spec = buildWaveSpec(wave, 'medium', seed)
        const rainbow = spec.flybys.filter((flyby) => flyby.kind === 'rainbow').length
        if (spec.slotType === 'formation') formations++
        else expect(rainbow, `bølge ${wave}`).toBe(0)
        rainbows += rainbow
        expect(rainbow).toBeLessThanOrEqual(1)
      }
    }
    expect(rainbows).toBeGreaterThan(0)
    expect(rainbows / formations).toBeLessThan(0.2)
  })

  it('planlægger flyvere med tider i bølgen – i formationsbølger og som krydderi i de sene hazards', () => {
    for (let wave = 1; wave <= 40; wave++) {
      const spec = buildWaveSpec(wave, 'medium', 2)
      for (const flyby of spec.flybys) {
        expect(flyby.at).toBeGreaterThan(1)
        expect(flyby.at).toBeLessThan(30)
      }
      if (spec.slotType === 'boss' || spec.slotType === 'bonus') expect(spec.flybys).toEqual([])
      if (spec.slotType === 'hazard') {
        if (spec.sector < 3) expect(spec.flybys).toEqual([])
        else expect(spec.flybys.every((flyby) => flyby.kind === 'ninja')).toBe(true)
      }
    }
  })

  it('fremviser de nye kyllinger i de nye skabeloner', () => {
    const count = (id: TemplateId, wave: number, kind: string) => {
      const spec = forTemplate(id, wave)
      return assignKinds(spec, formationSlots(spec, FIELD.width)).filter((value) => value === kind).length
    }
    for (const wave of [9, 17, 25, 33, 41]) {
      expect(count('sniperNest', wave, 'sniper'), `bølge ${wave}`).toBeGreaterThanOrEqual(3)
      expect(count('medicSquad', wave, 'medic'), `bølge ${wave}`).toBeGreaterThanOrEqual(1)
      expect(count('medicSquad', wave, 'shield'), `bølge ${wave}`).toBeGreaterThanOrEqual(2)
      expect(count('medicSquad', wave, 'helmet'), `bølge ${wave}`).toBeGreaterThanOrEqual(2)
      expect(count('turkeyRaid', wave, 'turkey'), `bølge ${wave}`).toBeGreaterThanOrEqual(2)
      expect(count('turkeyRaid', wave, 'turkey'), `bølge ${wave}`).toBeLessThanOrEqual(5)
      expect(count('turkeyRaid', wave, 'bomber'), `bølge ${wave}`).toBeGreaterThanOrEqual(1)
      expect(forTemplate('ufoAmbush', wave).flybys.filter((flyby) => flyby.kind === 'ufo').length).toBeGreaterThanOrEqual(2)
    }
    for (const id of ['sniperNest', 'medicSquad', 'turkeyRaid', 'ufoAmbush'] as const) {
      expect(WAVE_TEMPLATES[id].kind, id).toBe('formation')
      const slots = formationSlots(forTemplate(id, 33), FIELD.width)
      expect(slots.length, id).toBeGreaterThanOrEqual(12)
      expect(slots.length, id).toBeLessThanOrEqual(40)
    }
  })
})
