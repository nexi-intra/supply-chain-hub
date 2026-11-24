import { describe, it, expect } from 'vitest'
import { FIELD } from './config'
import type { GameEvent } from './engine'
import { applyPrismEvents, createPrismEffects, MAX_SHARDS, recordBalls, updatePrismEffects, type PrismEffects } from './effects'
import { prismLabels } from './labels'
import { createRng } from '../chickenInvaders/rng'

const labels = prismLabels('da')

function fx(reducedMotion = false): PrismEffects {
  return createPrismEffects({ reducedMotion, rng: createRng(4) })
}

function settle(state: PrismEffects, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) updatePrismEffects(state, 1 / 60)
}

const breakEvent = (multiplier = 1, kind: 'glass' | 'armored' | 'crystal' | 'reactor' = 'glass'): Extract<GameEvent, { type: 'brickBreak' }> => ({
  type: 'brickBreak', id: 1, x: 300, y: 120, kind, colorIndex: 2, points: 100, multiplier,
})

describe('glas der knuses', () => {
  it('splintrer ruden i skår i rudens farve og viser point', () => {
    const state = fx()
    applyPrismEvents(state, [breakEvent()], labels)
    expect(state.shards.length).toBeGreaterThan(8)
    expect(new Set(state.shards.map((shard) => shard.colorIndex))).toEqual(new Set([2]))
    expect(state.texts.map((text) => text.text)).toEqual(['+100'])
  })

  it('viser gange-faktoren og de faktiske point', () => {
    const state = fx()
    applyPrismEvents(state, [breakEvent(3)], labels)
    expect(state.texts[0].text).toBe('+300 ×3')
  })

  it('lader skår falde, hoppe på gulvet og forsvinde', () => {
    const state = fx()
    applyPrismEvents(state, [breakEvent()], labels)
    const startY = state.shards.map((shard) => shard.y)
    settle(state, 0.5)
    expect(state.shards.some((shard, index) => shard.y > startY[index])).toBe(true)
    settle(state, 1.2)
    expect(state.shards.every((shard) => shard.y <= FIELD.height)).toBe(true)
    settle(state, 4)
    expect(state.shards).toHaveLength(0)
  })

  it('giver et regnbuebrud når en krystal knuses', () => {
    const state = fx()
    applyPrismEvents(state, [breakEvent(1, 'crystal')], labels)
    expect(state.prisms).toHaveLength(1)
    settle(state, 2)
    expect(state.prisms).toHaveLength(0)
  })

  it('holder antallet af skår under loftet', () => {
    const state = fx()
    applyPrismEvents(state, Array.from({ length: 120 }, () => breakEvent()), labels)
    expect(state.shards.length).toBeLessThanOrEqual(MAX_SHARDS)
  })

  it('samler mange knuste ruder i ét tryk til én samlet pointtekst', () => {
    const state = fx()
    applyPrismEvents(state, [breakEvent(1), breakEvent(2), { ...breakEvent(3), x: 500 }], labels)
    expect(state.texts.map((text) => text.text)).toEqual(['+600 ×3'])
    expect(state.texts[0].x).toBeCloseTo(1100 / 3)
  })

  it('viser stadig to separate tekster for to knuste ruder', () => {
    const state = fx()
    applyPrismEvents(state, [breakEvent(), breakEvent()], labels)
    expect(state.texts).toHaveLength(2)
  })
})

describe('kædereaktion', () => {
  it('laver chokbølge og rystelse, men kun én tekst for flere eksplosioner på én gang', () => {
    const state = fx()
    applyPrismEvents(state, [{ type: 'explosion', x: 100, y: 100 }, { type: 'explosion', x: 200, y: 100 }, { type: 'explosion', x: 300, y: 100 }], labels)
    expect(state.rings).toHaveLength(3)
    expect(state.shake).toBeGreaterThan(0)
    expect(state.texts.filter((text) => text.text === labels.chainReaction)).toHaveLength(1)
  })
})

describe('skærm og bannere', () => {
  it('ryster ikke og dæmper blink og skår ved reduceret bevægelse', () => {
    const calm = fx(true)
    const normal = fx()
    const events: GameEvent[] = [{ type: 'lifeLost', lives: 2 }, breakEvent()]
    applyPrismEvents(calm, events, labels)
    applyPrismEvents(normal, events, labels)
    expect(calm.shake).toBe(0)
    expect(calm.flash).toBeLessThanOrEqual(0.2)
    expect(calm.shards.length).toBeLessThan(normal.shards.length)
  })

  it('annoncerer nyt vindue og fejrer et perfekt vindue med bonus', () => {
    const state = fx()
    applyPrismEvents(state, [{ type: 'levelStart', level: 3 }], labels)
    expect(state.banner).toMatchObject({ title: 'Vindue 3', subtitle: labels.serveHint })
    applyPrismEvents(state, [{ type: 'levelClear', level: 3, bonus: 4000, perfect: true }], labels)
    expect(state.banner).toMatchObject({ title: labels.perfectLevel, subtitle: '+4.000', tone: 'good' })
    settle(state, 5)
    expect(state.banner).toBeNull()
  })

  it('lyser prismen op når bolden rammer, og glimtet falmer', () => {
    const state = fx()
    applyPrismEvents(state, [{ type: 'paddleHit', x: 480, y: 540 }], labels)
    expect(state.paddleFlash).toBe(1)
    settle(state, 1)
    expect(state.paddleFlash).toBe(0)
  })

  it('viser navnet på en opsamlet power-up', () => {
    const state = fx()
    applyPrismEvents(state, [{ type: 'pickup', kind: 'multiball', x: 400, y: 500 }], labels)
    expect(state.texts.map((text) => text.text)).toEqual([labels.powers.multiball])
  })

  it('lyser en ramt rude kort op', () => {
    const state = fx()
    applyPrismEvents(state, [{ type: 'brickHit', id: 7, x: 0, y: 0, kind: 'armored', colorIndex: 1 }], labels)
    expect(state.hits.get(7)).toBeGreaterThan(0)
    settle(state, 0.5)
    expect(state.hits.has(7)).toBe(false)
  })
})

describe('recordBalls', () => {
  it('husker de seneste positioner pr. bold og glemmer bolde der er væk', () => {
    const state = fx()
    for (let i = 0; i < 30; i++) recordBalls(state, [{ id: 1, x: i, y: 0 }, { id: 2, x: 0, y: i }])
    const trail = state.trails.get(1) ?? []
    expect(trail).toHaveLength(12)
    expect(trail[trail.length - 1]).toEqual({ x: 29, y: 0 })
    recordBalls(state, [{ id: 2, x: 0, y: 30 }])
    expect(state.trails.has(1)).toBe(false)
  })
})
