import { describe, expect, it } from 'vitest'
import type { Cell, GameEvent } from './engine'
import { applyCargoEvents, createCargoEffects, MAX_PARTICLES, updateCargoEffects, type CargoEffects } from './effects'
import { cargoLabels } from './labels'
import { createRng } from '../chickenInvaders/rng'

const labels = cargoLabels('da')
const fx = (reducedMotion = false): CargoEffects => createCargoEffects({ reducedMotion, rng: createRng(3) })
const settle = (state: CargoEffects, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) updateCargoEffects(state, 1 / 60)
}
const row = (): Cell[] => Array.from({ length: 10 }, (_, x) => (x % 2 ? 'I' : 'T'))
const clear = (count: number, extra: Partial<Extract<GameEvent, { type: 'lineClear' }>> = {}): GameEvent => ({
  type: 'lineClear',
  rows: Array.from({ length: count }, (_, i) => 21 - i),
  blocks: Array.from({ length: count }, row),
  count,
  tspin: 'none',
  backToBack: false,
  combo: 0,
  perfect: false,
  points: 100,
  ...extra,
})
const texts = (state: CargoEffects) => state.texts.map((text) => text.text)

describe('rydninger', () => {
  it('kører de fulde rækker ud som afsendte kasser med splinter og navn', () => {
    const state = fx()
    applyCargoEvents(state, [clear(2)], labels)
    expect(state.sweeps).toHaveLength(2)
    expect(state.sweeps[0].blocks).toHaveLength(10)
    expect(state.particles.length).toBeGreaterThan(10)
    expect(texts(state)).toEqual(['Dobbelt'])
    settle(state, 2)
    expect(state.sweeps).toHaveLength(0)
  })

  it('fejrer et fuldt læs med blink og rystelse', () => {
    const state = fx()
    applyCargoEvents(state, [clear(4)], labels)
    expect(texts(state)).toEqual(['Fuld last!'])
    expect(state.flash).toBeGreaterThan(0)
    expect(state.shake).toBeGreaterThan(0)
  })

  it('navngiver T-spins, back-to-back og kombo', () => {
    const state = fx()
    applyCargoEvents(state, [clear(2, { tspin: 'full', backToBack: true, combo: 2 })], labels)
    expect(texts(state)).toEqual(['T-spin Dobbelt', 'Back-to-back', 'Kombo ×2'])
    const mini = fx()
    applyCargoEvents(mini, [clear(1, { tspin: 'mini' })], labels)
    expect(texts(mini)).toEqual(['Mini T-spin Enkelt'])
    const empty = fx()
    applyCargoEvents(empty, [clear(0, { tspin: 'full' })], labels)
    expect(texts(empty)).toEqual(['T-spin'])
  })

  it('viser et stort banner for en tom container', () => {
    const state = fx()
    applyCargoEvents(state, [clear(1, { perfect: true })], labels)
    expect(state.banner?.title).toBe('Tom container!')
  })

  it('viser kun den nyeste rydning, så teksterne ikke hober sig op', () => {
    const state = fx()
    applyCargoEvents(state, [clear(1, { combo: 1 })], labels)
    applyCargoEvents(state, [clear(2, { combo: 2 })], labels)
    expect(texts(state)).toEqual(['Dobbelt', 'Kombo ×2'])
  })
})

describe('drop og niveau', () => {
  it('trækker en fartstreg og hvirvler støv op ved hårdt drop', () => {
    const state = fx()
    applyCargoEvents(state, [{ type: 'hardDrop', piece: 'T', distance: 12, cells: [[4, 2], [5, 2], [6, 2], [5, 1]] }], labels)
    expect(state.trails).toHaveLength(1)
    expect(state.particles.some((particle) => particle.kind === 'dust')).toBe(true)
    settle(state, 2)
    expect(state.trails).toHaveLength(0)
    expect(state.particles).toHaveLength(0)
  })

  it('lyser en låst brik kort op', () => {
    const state = fx()
    applyCargoEvents(state, [{ type: 'lock', piece: 'O', cells: [[4, 20], [5, 20], [4, 21], [5, 21]] }], labels)
    expect(state.glows).toHaveLength(1)
    settle(state, 1)
    expect(state.glows).toHaveLength(0)
  })

  it('annoncerer et nyt niveau og lader banneret falme', () => {
    const state = fx()
    applyCargoEvents(state, [{ type: 'levelUp', level: 4 }], labels)
    expect(state.banner?.title).toBe('Niveau 4')
    settle(state, 4)
    expect(state.banner).toBeNull()
  })
})

describe('lofter og reduceret bevægelse', () => {
  it('holder antallet af partikler under loftet', () => {
    const state = fx()
    applyCargoEvents(state, Array.from({ length: 60 }, () => clear(4)), labels)
    expect(state.particles.length).toBeLessThanOrEqual(MAX_PARTICLES)
  })

  it('ryster ikke og dæmper blink og partikler ved reduceret bevægelse', () => {
    const calm = fx(true)
    const full = fx()
    applyCargoEvents(calm, [clear(4)], labels)
    applyCargoEvents(full, [clear(4)], labels)
    expect(calm.shake).toBe(0)
    expect(calm.flash).toBeLessThanOrEqual(0.2)
    expect(calm.particles.length).toBeLessThan(full.particles.length)
  })
})
