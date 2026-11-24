import { describe, expect, it } from 'vitest'
import { DRONE_X, WATER_Y } from './config'
import type { GameEvent } from './engine'
import { applyParcelEvents, createParcelEffects, MAX_PARTICLES, updateParcelEffects, type ParcelEffects } from './effects'
import { parcelLabels } from './labels'
import { createRng } from '../chickenInvaders/rng'

const labels = parcelLabels('da')
const fx = (reducedMotion = false): ParcelEffects => createParcelEffects({ reducedMotion, rng: createRng(5) })
const settle = (state: ParcelEffects, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) updateParcelEffects(state, 1 / 60)
}
const apply = (state: ParcelEffects, events: GameEvent[], droneY = 300) => applyParcelEvents(state, events, labels, droneY)
const pass = (perfect: boolean, points = 10, multiplier = 1): GameEvent => ({ type: 'gatePass', x: DRONE_X, y: 300, perfect, points, multiplier, streak: perfect ? 3 : 0 })

describe('dronens effekter', () => {
  it('blæser rotorstøv ned under dronen ved et løft og lyser rotorerne op', () => {
    const state = fx()
    apply(state, [{ type: 'lift' }])
    const puffs = state.particles.filter((particle) => particle.kind === 'puff')
    expect(puffs.length).toBeGreaterThan(3)
    expect(puffs.every((puff) => puff.y > 300 && puff.vy > 0)).toBe(true)
    expect(state.liftPulse).toBe(1)
    settle(state, 0.5)
    expect(state.liftPulse).toBe(0)
  })

  it('fejrer en perfekt passage med ring og tekst, men en almindelig kun med point', () => {
    const perfect = fx()
    apply(perfect, [pass(true, 20, 2)])
    expect(perfect.texts.map((text) => text.text)).toEqual(['Perfekt +20 ×2'])
    expect(perfect.rings).toHaveLength(1)
    const plain = fx()
    apply(plain, [pass(false)])
    expect(plain.texts.map((text) => text.text)).toEqual(['+10'])
    expect(plain.rings).toHaveLength(0)
  })

  it('giver gyldne gnister for den gyldne pakke og viser point', () => {
    const state = fx()
    apply(state, [{ type: 'parcel', x: 400, y: 200, points: 100, golden: true }, { type: 'shieldGain' }])
    expect(state.particles.some((particle) => particle.color === '#ffd166')).toBe(true)
    expect(state.texts.map((text) => text.text)).toEqual(['+100', labels.shieldGained])
  })

  it('splintrer dronen ved et styrt, ryster og stopper kort op; vragdele forsvinder igen', () => {
    const state = fx()
    apply(state, [{ type: 'crash', x: DRONE_X, y: 300, cause: 'stack' }])
    expect(state.particles.filter((particle) => particle.kind === 'debris').length).toBeGreaterThan(8)
    expect(state.shake).toBeGreaterThan(0)
    expect(state.flash).toBeGreaterThan(0)
    expect(state.hitStop).toBeGreaterThan(0)
    settle(state, 5)
    expect(state.particles).toHaveLength(0)
    expect(state.shake).toBe(0)
  })

  it('sprøjter vand op ved plask, og dråberne falder tilbage', () => {
    const state = fx()
    apply(state, [{ type: 'splash', x: DRONE_X, y: WATER_Y }])
    const drops = state.particles.filter((particle) => particle.kind === 'drop')
    expect(drops.length).toBeGreaterThan(10)
    expect(drops.every((drop) => drop.vy < 0)).toBe(true)
    settle(state, 3)
    expect(state.particles.filter((particle) => particle.kind === 'drop')).toHaveLength(0)
  })

  it('annoncerer en ny zone med navn og lader banneret falme', () => {
    const state = fx()
    apply(state, [{ type: 'zone', zone: 3 }])
    expect(state.banner?.title).toBe('Zone 3 · Nordlys')
    settle(state, 4)
    expect(state.banner).toBeNull()
  })

  it('ryster og viser tekst når skjoldet tager stødet', () => {
    const state = fx()
    apply(state, [{ type: 'shieldBreak', x: DRONE_X, y: 300 }])
    expect(state.shake).toBeGreaterThan(0)
    expect(state.texts.map((text) => text.text)).toEqual([labels.shieldBroken])
  })

  it('holder antallet af partikler under loftet', () => {
    const state = fx()
    apply(state, Array.from({ length: 200 }, () => ({ type: 'crash', x: DRONE_X, y: 300, cause: 'stack' }) as GameEvent))
    expect(state.particles.length).toBeLessThanOrEqual(MAX_PARTICLES)
  })

  it('ryster ikke og dæmper blink og partikler ved reduceret bevægelse', () => {
    const calm = fx(true)
    const full = fx()
    const crash: GameEvent = { type: 'crash', x: DRONE_X, y: 300, cause: 'stack' }
    apply(calm, [crash])
    apply(full, [crash])
    expect(calm.shake).toBe(0)
    expect(calm.flash).toBeLessThanOrEqual(0.2)
    expect(calm.particles.length).toBeLessThan(full.particles.length)
  })

  it('siger tydeligt "Styrt!" ved et styrt, også ved reduceret bevægelse', () => {
    const calm = fx(true)
    apply(calm, [{ type: 'crash', x: DRONE_X, y: 300, cause: 'stack' }])
    expect(calm.texts.map((text) => text.text)).toEqual([labels.crashed])
    expect(labels.crashed).toBe('Styrt!')
  })
})
