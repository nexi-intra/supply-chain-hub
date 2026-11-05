import { describe, expect, it } from 'vitest'
import type { GameEvent } from './engine'
import { applyRouteEvents, createRouteEffects, MAX_PARTICLES, updateRouteEffects, type RouteEffects } from './effects'
import { routeLabels } from './labels'
import { createRng } from '../chickenInvaders/rng'

const labels = routeLabels('da')
const fx = (reducedMotion = false): RouteEffects => createRouteEffects({ reducedMotion, rng: createRng(4) })
const settle = (state: RouteEffects, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) updateRouteEffects(state, 1 / 60)
}
const texts = (state: RouteEffects) => state.texts.map((text) => text.text)
const eat = (kind: 'parcel' | 'express', points: number, multiplier = 1): GameEvent => ({ type: 'eat', kind, x: 10, y: 5, points, multiplier, combo: multiplier })
const crash: GameEvent = { type: 'crash', x: 12, y: 5, cause: 'wall' }

describe('opsamling', () => {
  it('glimter og viser point ved en pakke, med faktor når den er over 1', () => {
    const state = fx()
    applyRouteEvents(state, [eat('parcel', 10)], labels)
    expect(state.particles.length).toBeGreaterThan(5)
    expect(state.rings).toHaveLength(1)
    expect(texts(state)).toEqual(['+10'])
    applyRouteEvents(state, [eat('parcel', 30, 3)], labels)
    expect(texts(state)).toContain('+30 ×3')
  })

  it('fejrer en ekspres-pakke med guld og navn', () => {
    const state = fx()
    applyRouteEvents(state, [eat('express', 50)], labels)
    expect(texts(state)).toEqual(['Ekspres! +50'])
    expect(state.particles.some((particle) => particle.color === '#ffd166')).toBe(true)
  })

  it('pulserer ved ny ekspres og støver ved udløb', () => {
    const state = fx()
    applyRouteEvents(state, [{ type: 'expressSpawn', x: 3, y: 3 }], labels)
    expect(state.rings).toHaveLength(1)
    applyRouteEvents(state, [{ type: 'expressExpired', x: 3, y: 3 }], labels)
    expect(state.particles.some((particle) => particle.kind === 'dust')).toBe(true)
  })
})

describe('styrt', () => {
  it('spreder kasser, ryster, blinker og siger "Kollision!"; alt forsvinder igen', () => {
    const state = fx()
    applyRouteEvents(state, [crash], labels)
    expect(state.particles.filter((particle) => particle.kind === 'box').length).toBeGreaterThan(5)
    expect(state.shake).toBeGreaterThan(0)
    expect(state.flash).toBeGreaterThan(0)
    expect(texts(state)).toEqual(['Kollision!'])
    settle(state, 4)
    expect(state.particles).toHaveLength(0)
    expect(state.texts).toHaveLength(0)
    expect(state.shake).toBe(0)
  })

  it('holder antallet af partikler under loftet', () => {
    const state = fx()
    applyRouteEvents(state, Array.from({ length: 80 }, () => crash), labels)
    expect(state.particles.length).toBeLessThanOrEqual(MAX_PARTICLES)
  })

  it('ryster ikke og dæmper blink og partikler ved reduceret bevægelse', () => {
    const calm = fx(true)
    const full = fx()
    applyRouteEvents(calm, [crash], labels)
    applyRouteEvents(full, [crash], labels)
    expect(calm.shake).toBe(0)
    expect(calm.flash).toBeLessThanOrEqual(0.2)
    expect(calm.particles.length).toBeLessThan(full.particles.length)
    expect(texts(calm)).toEqual(['Kollision!'])
  })
})
