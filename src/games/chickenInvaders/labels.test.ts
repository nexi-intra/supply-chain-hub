import { describe, it, expect } from 'vitest'
import { SPECIAL_KINDS } from './enemies'
import { chickenLabels } from './labels'
import { THEME_IDS } from './themes'
import { WEAPON_FAMILIES } from './weapons'
import { WAVE_TEMPLATES, type TemplateId } from './waveTemplates'

const TEMPLATE_IDS = Object.keys(WAVE_TEMPLATES) as TemplateId[]

describe('chickenLabels', () => {
  it('har alle tekster på dansk, engelsk, finsk og svensk', () => {
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = chickenLabels(language)
      for (const id of TEMPLATE_IDS) expect(labels.waveSubtitle[id].length).toBeGreaterThan(0)
      for (const value of Object.values(labels.hud)) expect(value.length).toBeGreaterThan(0)
      expect(labels.wave(3)).toContain('3')
      expect(labels.weaponLevel(4)).toContain('4')
    }
  })

  it('formaterer point efter sproget', () => {
    expect(chickenLabels('da').points(12450)).toBe('12.450')
    expect(chickenLabels('en').points(12450)).toBe('12,450')
    expect(chickenLabels('fi').points(12450).replace(/\s/g, ' ')).toBe('12 450')
  })

  it('falder tilbage til dansk for et ukendt sprog', () => {
    expect(chickenLabels('xx').wave(1)).toBe(chickenLabels('da').wave(1))
  })

  it('har menu, sværhedsgrader, styring og statistik på alle tre sprog', () => {
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = chickenLabels(language)
      const texts = [
        labels.menu.title,
        labels.menu.tagline,
        ...Object.values(labels.menu.difficultyDetail),
        ...Object.values(labels.menu.controls),
        labels.menu.spaceKey,
        ...Object.values(labels.stats),
      ]
      for (const value of texts) expect(value.length).toBeGreaterThan(0)
      expect(Object.keys(labels.menu.difficultyDetail)).toEqual(['easy', 'medium', 'hard', 'expert'])
    }
  })

  it('formaterer træfsikkerhed som procent efter sproget', () => {
    expect(chickenLabels('da').percent(0.64).replace(/\s/g, ' ')).toBe('64 %')
    expect(chickenLabels('en').percent(0.64)).toBe('64%')
  })

  it('navngiver de fem temaer på alle sprog', () => {
    const names = {
      da: ['Hønsegården i rummet', 'Asteroidebæltet', 'Isplaneten', 'Vulkanmånen', 'Moderskibet'],
      en: ['Space Farm', 'Asteroid Belt', 'Ice Planet', 'Volcano Moon', 'The Mothership'],
      fi: ['Avaruuskanala', 'Asteroidivyöhyke', 'Jääplaneetta', 'Tulivuorikuu', 'Emoalus'],
      sv: ['Rymdgården', 'Asteroidbältet', 'Isplaneten', 'Vulkanmånen', 'Moderskeppet'],
    }
    for (const [language, expected] of Object.entries(names)) {
      const labels = chickenLabels(language)
      expect(THEME_IDS.map((id) => labels.themeName[id])).toEqual(expected)
    }
  })

  it('har sektorbanner, HUD-linje og Nyt+ på alle sprog', () => {
    const sectorLines = { da: 'Sektor 2 – bølge 3/8', en: 'Sector 2 – wave 3/8', fi: 'Sektori 2 – aalto 3/8', sv: 'Sektor 2 – våg 3/8' }
    const newPlus = { da: 'Nyt+', en: 'New+', fi: 'Uusi+', sv: 'Nytt+' }
    for (const language of ['da', 'en', 'fi', 'sv'] as const) {
      const labels = chickenLabels(language)
      expect(labels.sectorWave(1, 2, 0)).toBe(sectorLines[language])
      expect(labels.sectorWave(1, 2, 1)).toBe(`${newPlus[language]} · ${sectorLines[language]}`)
      expect(labels.sectorWave(1, 2, 2)).toContain(`${newPlus[language]} 2`)
      expect(labels.newPlus(1)).toBe(newPlus[language])
      expect(labels.newPlus(3)).toBe(`${newPlus[language]} 3`)
      const title = labels.sectorTitle(1, 'asteroids')
      expect(title).toContain('2')
      expect(title).toContain(labels.themeName.asteroids.toLocaleUpperCase(labels.locale))
    }
    expect(chickenLabels('da').sectorTitle(1, 'asteroids')).toBe('SEKTOR 2 · ASTEROIDEBÆLTET')
  })

  it('bruger rigtige tegn og ingen escape-sekvenser', () => {
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = chickenLabels(language)
      const texts = [...Object.values(labels.themeName), ...Object.values(labels.waveSubtitle), labels.sectorWave(0, 0, 1), labels.sectorTitle(0, 'farm')]
      for (const value of texts) expect(value).not.toMatch(/\\u[0-9a-f]{4}/i)
    }
  })

  it('navngiver de nye kyllinger og giver hver et kort tip på alle sprog', () => {
    const danish = {
      shield: 'Skjoldhøne',
      sniper: 'Snigskytte',
      bomber: 'Bombehøne',
      ninja: 'Ninja-kylling',
      balloon: 'Ballonhøne',
      medic: 'Sygeplejerske',
      ufo: 'UFO-kylling',
      turkey: 'Kamikaze-kalkun',
      rainbow: 'Regnbuehøne',
    }
    expect(chickenLabels('da').enemyName).toEqual(danish)
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = chickenLabels(language)
      const names = SPECIAL_KINDS.map((kind) => labels.enemyName[kind])
      expect(new Set(names).size, language).toBe(SPECIAL_KINDS.length)
      for (const kind of SPECIAL_KINDS) {
        expect(labels.enemyName[kind].length, `${language} ${kind}`).toBeGreaterThan(2)
        expect(labels.enemyHint[kind].length, `${language} ${kind}`).toBeGreaterThan(10)
        expect(labels.newEnemy(kind)).toContain(labels.enemyName[kind])
        for (const value of [labels.enemyName[kind], labels.enemyHint[kind]]) expect(value).not.toMatch(/\\u[0-9a-f]{4}/i)
      }
      for (const value of [labels.weaponStolen, ...Object.values(labels.escaped)]) {
        expect(value.length).toBeGreaterThan(3)
        expect(value).not.toMatch(/\\u[0-9a-f]{4}/i)
      }
    }
    expect(chickenLabels('da').newEnemy('sniper')).toBe('NY: Snigskytte')
    expect(chickenLabels('en').newEnemy('sniper')).toBe('NEW: Sniper Hen')
    expect(chickenLabels('sv').enemyName.balloon).toBe('Ballonghöna')
    expect(chickenLabels('fi').enemyName.turkey).toBe('Kamikazekalkkuna')
  })

  it('navngiver våbenfamilier og de nye power-ups på alle sprog', () => {
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = chickenLabels(language)
      const names = WEAPON_FAMILIES.map((family) => labels.weaponName[family])
      expect(new Set(names).size, language).toBe(5)
      for (const family of WEAPON_FAMILIES) expect(labels.weaponGift(family, 3)).toContain(labels.weaponName[family])
      expect(labels.weaponGift('laser', 3)).toContain('3')
      const texts = [...names, ...Object.values(labels.pickup), ...Object.values(labels.powerupName)]
      for (const value of texts) {
        expect(value.length, language).toBeGreaterThan(1)
        expect(value).not.toMatch(/\\u[0-9a-f]{4}/i)
      }
      for (const kind of ['drone', 'slowmo', 'magnet', 'double', 'life'] as const) expect(labels.pickup[kind].length).toBeGreaterThan(1)
    }
    expect(chickenLabels('da').weaponName).toEqual({ blaster: 'Ionkanon', lightning: 'Lyn', laser: 'Laser', spread: 'Fjer-hagl', homing: 'Raketter' })
    expect(chickenLabels('sv').weaponName.spread).toBe('Fjäderhagel')
    expect(chickenLabels('fi').weaponName.lightning).toBe('Salama')
  })

  it('har hazard-undertitler pr. tema og bonustekster på alle sprog', () => {
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = chickenLabels(language)
      const showers = THEME_IDS.map((theme) => labels.hazardSubtitle('meteorShower', theme))
      expect(new Set(showers).size, language).toBe(THEME_IDS.length)
      expect(labels.hazardSubtitle('blackHole', 'volcano')).toBe(labels.waveSubtitle.blackHole)
      const texts = [...showers, labels.bonus.title, labels.bonus.perfect, labels.bonus.noHit, labels.bonus.lost, labels.bonus.locked, labels.bonus.label]
      for (const value of texts) {
        expect(value.length, language).toBeGreaterThan(2)
        expect(value).not.toMatch(/\\u[0-9a-f]{4}/i)
      }
      expect(labels.bonus.result(12400)).toContain(labels.points(12400))
    }
    expect(chickenLabels('da').bonus.result(12400)).toBe('Bonus: 12.400')
    expect(chickenLabels('da').bonus.perfect).toBe('Perfekt!')
    expect(chickenLabels('sv').waveSubtitle.eggDodge).toContain('Ägg')
    expect(chickenLabels('fi').waveSubtitle.blackHole).toContain('Musta aukko')
  })
})
