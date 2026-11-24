import { describe, it, expect } from 'vitest'
import type { GameEvent } from './engine'
import { applyEvents, createEffects, MAX_PARTICLES, shakeOffset, updateEffects, type EffectsState } from './effects'
import { chickenLabels } from './labels'
import { createRng } from './rng'
import { THEME_IDS, THEMES } from './themes'
import { FAMILY_COLORS } from './weapons'

const labels = chickenLabels('da')
const ship = { x: 480, y: 540 }
const kill = (points = 100, multiplier = 1): GameEvent => ({ type: 'kill', x: 300, y: 200, kind: 'hen', points, multiplier, large: false })

function fx(reducedMotion = false): EffectsState {
  return createEffects({ reducedMotion, rng: createRng(1) })
}

function settle(state: EffectsState, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) updateEffects(state, 1 / 60)
}

describe('drab', () => {
  it('giver fjer, gnister og flydende point', () => {
    const state = fx()
    applyEvents(state, [kill()], labels, ship)
    expect(state.particles.some((p) => p.kind === 'feather')).toBe(true)
    expect(state.particles.some((p) => p.kind === 'spark')).toBe(true)
    expect(state.texts.map((text) => text.text)).toEqual(['+100'])
  })

  it('viser gange-faktoren når den er over 1', () => {
    const state = fx()
    applyEvents(state, [kill(300, 3)], labels, ship)
    expect(state.texts[0].text).toBe('+300 ×3')
  })

  it('lader partikler og tekster forsvinde igen', () => {
    const state = fx()
    applyEvents(state, [kill()], labels, ship)
    settle(state, 3)
    expect(state.particles).toHaveLength(0)
    expect(state.texts).toHaveLength(0)
  })

  it('holder antallet af partikler under loftet', () => {
    const state = fx()
    applyEvents(state, Array.from({ length: 200 }, () => kill()), labels, ship)
    expect(state.particles.length).toBeLessThanOrEqual(MAX_PARTICLES)
  })
})

describe('skærmeffekter', () => {
  it('ryster og blinker når skibet rammes, og falder til ro', () => {
    const state = fx()
    applyEvents(state, [{ type: 'playerHit', x: 480, y: 540, lives: 2 }], labels, ship)
    expect(state.shake).toBeGreaterThan(0)
    expect(state.flash).toBeGreaterThan(0)
    const offset = shakeOffset(state)
    expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(0)
    settle(state, 2)
    expect(state.shake).toBe(0)
    expect(state.flash).toBe(0)
    expect(shakeOffset(state)).toEqual({ x: 0, y: 0 })
  })

  it('ryster ikke og dæmper blink og partikler ved reduceret bevægelse', () => {
    const calm = fx(true)
    const normal = fx()
    const events: GameEvent[] = [{ type: 'playerHit', x: 480, y: 540, lives: 2 }]
    applyEvents(calm, events, labels, ship)
    applyEvents(normal, events, labels, ship)
    expect(calm.shake).toBe(0)
    expect(calm.flash).toBeLessThanOrEqual(0.25)
    expect(calm.particles.length).toBeLessThan(normal.particles.length)
  })

  it('fryser kort og viser banner når Mor Høne besejres', () => {
    const state = fx()
    applyEvents(state, [{ type: 'bossDefeated', x: 480, y: 120, points: 5000 }], labels, ship)
    expect(state.hitStop).toBeGreaterThan(0)
    expect(state.banner?.title).toBe(labels.bossDefeated)
    expect(state.texts[0].text).toBe('+5.000')
    settle(state, 1)
    expect(state.hitStop).toBe(0)
  })

  it('præsenterer bossen med navn og replik i dens egen farve', () => {
    const state = fx()
    applyEvents(state, [{ type: 'bossIntro', boss: 'iceQueen', variant: 0, mini: false }], labels, ship)
    expect(state.banner).toMatchObject({ title: 'ISDRONNINGEN', subtitle: labels.bossIntro.iceQueen, tone: 'boss' })
    expect(state.banner?.accent).toBeDefined()
    applyEvents(state, [{ type: 'bossIntro', boss: 'chickenCruiser', variant: 1, mini: true }], labels, ship)
    expect(state.banner?.title).toBe('KYLLINGEKRYDSEREN MK II')
    applyEvents(state, [{ type: 'bossPhase', phase: 3, boss: 'roboRooster' }], labels, ship)
    expect(state.banner?.title).toBe('Lasergitter aktiveret!')
  })

  it('fejrer en boss-sejr med vrag, en kæde af eksplosioner og et stort brag', () => {
    const state = fx()
    applyEvents(state, [{ type: 'bossDefeated', x: 480, y: 160, points: 15000, boss: 'iceQueen', mini: false, variant: 0 }], labels, ship)
    expect(state.banner?.title).toBe('Isdronningen besejret!')
    expect(state.wreck?.boss).toBe('iceQueen')
    expect(state.blasts.length).toBeGreaterThanOrEqual(8)
    expect(state.blasts.filter((blast) => blast.final)).toHaveLength(1)
    settle(state, 0.5)
    const midway = state.particles.length
    expect(state.blasts.length).toBeGreaterThan(0)
    settle(state, 2)
    expect(state.blasts).toHaveLength(0)
    expect(state.wreck).toBeNull()
    expect(midway).toBeGreaterThan(0)
  })

  it('blinker bossen ved træf og viser skjoldet, der falder', () => {
    const state = fx()
    applyEvents(state, [{ type: 'bossHit', x: 480, y: 160 }], labels, ship)
    expect(state.bossFlash).toBeGreaterThan(0)
    applyEvents(state, [{ type: 'bossShieldDown', x: 480, y: 160 }], labels, ship)
    expect(state.texts.map((text) => text.text)).toContain(labels.shieldDown)
    settle(state, 0.2)
    expect(state.bossFlash).toBe(0)
  })
})

describe('bannere og tekster', () => {
  it('annoncerer en ny bølge med dens undertitel', () => {
    const state = fx()
    applyEvents(state, [{ type: 'waveStart', wave: 2, kind: 'divers', templateId: 'divers' }], labels, ship)
    expect(state.banner).toMatchObject({ title: 'Bølge 2', subtitle: labels.waveSubtitle.divers })
    settle(state, 5)
    expect(state.banner).toBeNull()
  })

  it('annoncerer en ny sektor med temaets navn og beholder bølgens undertitel', () => {
    const state = fx()
    applyEvents(state, [
      { type: 'waveStart', wave: 9, kind: 'formation', templateId: 'classic' },
      { type: 'sectorStart', sector: 1, theme: 'asteroids', round: 0 },
    ], labels, ship)
    expect(state.banner).toMatchObject({ title: 'SEKTOR 2 · ASTEROIDEBÆLTET', subtitle: labels.waveSubtitle.classic })
  })

  it('farver sektorbanneret i temaets accent og blinker kort i samme farve', () => {
    for (const theme of THEME_IDS) {
      const state = fx()
      applyEvents(state, [{ type: 'sectorStart', sector: THEME_IDS.indexOf(theme), theme, round: 0 }], labels, ship)
      expect(state.banner?.accent, theme).toBe(THEMES[theme].planet.rim)
      expect(state.flash, theme).toBeGreaterThan(0)
      expect(state.flashColor, theme).toBe(THEMES[theme].planet.rim)
    }
    const wave = fx()
    applyEvents(wave, [{ type: 'waveStart', wave: 2, kind: 'divers', templateId: 'divers' }], labels, ship)
    expect(wave.banner?.accent).toBeUndefined()
  })

  it('giver Nyt+ sit eget banner med fanfare-blink, og senere sektorer i Nyt+ beholder mærket', () => {
    const state = fx()
    applyEvents(state, [
      { type: 'waveStart', wave: 41, kind: 'formation', templateId: 'classic' },
      { type: 'sectorStart', sector: 0, theme: 'farm', round: 1 },
    ], labels, ship)
    expect(state.banner).toMatchObject({ title: 'NYT+', subtitle: labels.newPlusSubtitle, tone: 'good' })
    expect(state.banner!.maxLife).toBeGreaterThanOrEqual(3)
    expect(state.flash).toBeGreaterThan(0.3)
    const later = fx()
    applyEvents(later, [
      { type: 'waveStart', wave: 49, kind: 'formation', templateId: 'classic' },
      { type: 'sectorStart', sector: 1, theme: 'asteroids', round: 1 },
    ], labels, ship)
    expect(later.banner?.title).toBe('SEKTOR 2 · ASTEROIDEBÆLTET')
    expect(later.banner?.subtitle).toBe(`${labels.newPlus(1)} · ${labels.waveSubtitle.classic}`)
  })

  it('fejrer en perfekt bølge med bonus', () => {
    const state = fx()
    applyEvents(state, [{ type: 'waveClear', wave: 3, bonus: 2500, perfect: true }], labels, ship)
    expect(state.banner).toMatchObject({ title: labels.perfectWave, subtitle: '+2.500', tone: 'good' })
  })

  it('melder Mor Hønes faser', () => {
    const state = fx()
    applyEvents(state, [{ type: 'bossPhase', phase: 2 }], labels, ship)
    expect(state.banner?.title).toBe(labels.bossAngry)
    applyEvents(state, [{ type: 'bossPhase', phase: 3 }], labels, ship)
    expect(state.banner?.title).toBe(labels.bossLastStand)
  })

  it('viser overophedning og våbenniveau ved skibet', () => {
    const state = fx()
    applyEvents(state, [{ type: 'overheat' }, { type: 'weaponUp', level: 3 }], labels, ship)
    expect(state.texts.map((text) => text.text)).toEqual([labels.overheated, labels.weaponLevel(3)])
    expect(state.texts[0].x).toBe(ship.x)
  })

  it('viser gavens familie og niveau i familiens farve', () => {
    const state = fx()
    applyEvents(state, [{ type: 'weaponUp', level: 3, family: 'lightning', switched: true }], labels, ship)
    expect(state.texts[0]).toMatchObject({ text: labels.weaponGift('lightning', 3), color: FAMILY_COLORS.lightning })
  })

  it('tegner lynbuer og laserstrålen kortvarigt', () => {
    const state = fx()
    applyEvents(state, [
      { type: 'lightning', points: [480, 520, 500, 300, 600, 280], level: 2 },
      { type: 'beam', x: 480, y: 520, halfWidth: 8, level: 2 },
    ], labels, ship)
    expect(state.arcs).toHaveLength(1)
    expect(state.arcs[0].points).toEqual([480, 520, 500, 300, 600, 280])
    expect(state.beam).toMatchObject({ halfWidth: 8 })
    settle(state, 0.3)
    expect(state.arcs).toHaveLength(0)
    expect(state.beam).toBeNull()
  })

  it('viser teksten for de nye power-ups', () => {
    for (const kind of ['drone', 'slowmo', 'magnet', 'double', 'life'] as const) {
      const state = fx()
      applyEvents(state, [{ type: 'pickup', kind, x: 300, y: 400, points: 0 }], labels, ship)
      expect(state.texts.map((text) => text.text), kind).toContain(labels.pickup[kind])
      expect(state.particles.length).toBeGreaterThan(0)
    }
  })

  it('efterlader en æggeplet når et æg rammer bunden, som falmer', () => {
    const state = fx()
    applyEvents(state, [{ type: 'eggSplat', x: 200 }], labels, ship)
    expect(state.splats).toHaveLength(1)
    settle(state, 5)
    expect(state.splats).toHaveLength(0)
  })
})

describe('nye kyllinger (fase 3)', () => {
  const featherColors = (event: GameEvent) => {
    const state = fx()
    applyEvents(state, [event], labels, ship)
    return new Set(state.particles.filter((p) => p.kind === 'feather').map((p) => p.color))
  }

  it('farver fjerene efter tema og kyllingetype', () => {
    const farm = featherColors({ type: 'kill', x: 300, y: 200, kind: 'hen', points: 100, multiplier: 1, large: false, theme: 'farm' })
    const volcano = featherColors({ type: 'kill', x: 300, y: 200, kind: 'hen', points: 100, multiplier: 1, large: false, theme: 'volcano' })
    const ninja = featherColors({ type: 'kill', x: 300, y: 200, kind: 'ninja', points: 300, multiplier: 1, large: false, theme: 'farm' })
    expect(farm.size).toBeGreaterThan(0)
    expect([...volcano].some((color) => !farm.has(color))).toBe(true)
    expect([...ninja].some((color) => !farm.has(color))).toBe(true)
    for (const color of [...farm, ...volcano, ...ninja]) expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('viser et lille introkort "NY: …" for en ny fjende uden at fjerne bølgebanneret', () => {
    const state = fx()
    applyEvents(state, [
      { type: 'waveStart', wave: 9, kind: 'formation', templateId: 'classic' },
      { type: 'newEnemy', kind: 'sniper' },
      { type: 'newEnemy', kind: 'balloon' },
    ], labels, ship)
    expect(state.banner?.title).toBe('Bølge 9')
    expect(state.intro).toMatchObject({ kind: 'sniper', title: 'NY: Snigskytte', hint: labels.enemyHint.sniper })
    expect(state.introQueue.map((card) => card.kind)).toEqual(['balloon'])
    settle(state, state.intro!.life + 0.1)
    expect(state.intro?.kind).toBe('balloon')
    settle(state, 10)
    expect(state.intro).toBeNull()
  })

  it('viser heling, splinter, stjålne våben og flugt', () => {
    const state = fx()
    applyEvents(state, [{ type: 'heal', x: 300, y: 150, targets: [{ x: 360, y: 150 }, { x: 300, y: 220 }] }], labels, ship)
    expect(state.particles.some((p) => p.kind === 'cross')).toBe(true)
    expect(state.particles.some((p) => p.kind === 'ring')).toBe(true)

    const burst = fx()
    applyEvents(burst, [{ type: 'bombBurst', x: 400, y: 300 }], labels, ship)
    expect(burst.particles.length).toBeGreaterThan(5)
    expect(burst.shake).toBeGreaterThan(0)

    const stolen = fx()
    applyEvents(stolen, [{ type: 'weaponStolen', x: 300, y: 60, level: 2 }], labels, ship)
    expect(stolen.texts.map((text) => text.text)).toContain(labels.weaponStolen)

    const escaped = fx()
    applyEvents(escaped, [{ type: 'escape', kind: 'ufo' }, { type: 'escape', kind: 'golden' }], labels, ship)
    expect(escaped.texts.map((text) => text.text)).toEqual([labels.escaped.ufo, labels.goldenEscaped])

    const shieldBreak = fx()
    applyEvents(shieldBreak, [{ type: 'shieldBreak', x: 200, y: 200 }], labels, ship)
    expect(shieldBreak.particles.length).toBeGreaterThan(5)
  })
})
