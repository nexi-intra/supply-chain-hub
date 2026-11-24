import { describe, it, expect } from 'vitest'
import { COMBO_WINDOW_SECONDS, EXTRA_LIFE_EVERY } from './config'
import {
  addBonus,
  claimExtraLives,
  createScoreState,
  currentMultiplier,
  multiplierFor,
  pickupDrumstick,
  registerKill,
  waveClearBonus,
} from './scoring'

describe('multiplierFor', () => {
  it('stiger med én for hver 5 drab i kæden og stopper ved ×5', () => {
    expect(multiplierFor(0)).toBe(1)
    expect(multiplierFor(4)).toBe(1)
    expect(multiplierFor(5)).toBe(2)
    expect(multiplierFor(9)).toBe(2)
    expect(multiplierFor(10)).toBe(3)
    expect(multiplierFor(20)).toBe(5)
    expect(multiplierFor(500)).toBe(5)
  })
})

describe('registerKill', () => {
  it('bygger en kæde når drab kommer inden for combo-vinduet', () => {
    const state = createScoreState()
    for (let i = 0; i < 5; i++) registerKill(state, 100, i * 0.5)
    expect(state.chain).toBe(5)
    expect(state.score).toBe(4 * 100 + 200)
  })

  it('nulstiller kæden når der går for lang tid mellem drab', () => {
    const state = createScoreState()
    registerKill(state, 100, 0)
    registerKill(state, 100, 0.5)
    registerKill(state, 100, 0.5 + COMBO_WINDOW_SECONDS + 0.01)
    expect(state.chain).toBe(1)
    expect(state.bestChain).toBe(2)
  })

  it('returnerer point og gange-faktor for drabet', () => {
    const state = createScoreState()
    for (let i = 0; i < 4; i++) registerKill(state, 100, i * 0.1)
    expect(registerKill(state, 250, 0.5)).toEqual({ points: 500, multiplier: 2 })
  })
})

describe('currentMultiplier', () => {
  it('falder tilbage til ×1 når combo-vinduet er udløbet', () => {
    const state = createScoreState()
    for (let i = 0; i < 6; i++) registerKill(state, 100, i * 0.1)
    expect(currentMultiplier(state, 0.6)).toBe(2)
    expect(currentMultiplier(state, 0.5 + COMBO_WINDOW_SECONDS + 0.01)).toBe(1)
  })
})

describe('bonusser', () => {
  it('giver kyllingelår 50 point gange den aktive faktor uden at forlænge kæden', () => {
    const state = createScoreState()
    for (let i = 0; i < 10; i++) registerKill(state, 100, i * 0.1)
    const before = state.score
    expect(pickupDrumstick(state, 1)).toBe(150)
    expect(state.score).toBe(before + 150)
    expect(state.chain).toBe(10)
  })

  it('giver bølgebonus 500 × bølge og 1.000 ekstra for en perfekt bølge', () => {
    expect(waveClearBonus(3, false)).toBe(1500)
    expect(waveClearBonus(3, true)).toBe(2500)
  })

  it('lægger bonuspoint til uden gange-faktor', () => {
    const state = createScoreState()
    addBonus(state, 1234)
    expect(state.score).toBe(1234)
  })
})

describe('claimExtraLives', () => {
  it('giver ét liv pr. passeret grænse og flytter næste grænse', () => {
    const state = createScoreState()
    addBonus(state, EXTRA_LIFE_EVERY - 1)
    expect(claimExtraLives(state)).toBe(0)
    addBonus(state, 1)
    expect(claimExtraLives(state)).toBe(1)
    expect(claimExtraLives(state)).toBe(0)
    expect(state.nextExtraLifeAt).toBe(EXTRA_LIFE_EVERY * 2)
  })

  it('tæller flere grænser på én gang ved et stort spring', () => {
    const state = createScoreState()
    addBonus(state, EXTRA_LIFE_EVERY * 3 + 10)
    expect(claimExtraLives(state)).toBe(3)
    expect(state.nextExtraLifeAt).toBe(EXTRA_LIFE_EVERY * 4)
  })
})
