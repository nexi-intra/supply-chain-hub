import { describe, expect, it } from 'vitest'
import { planModelLoad } from './bergamotTranslator'

describe('Bergamot model memory budget', () => {
  it('keeps adding models while within the budget', () => {
    const plan = planModelLoad(new Set(['daen', 'enfi']), ['daen', 'ensv'], 4)
    expect(plan.reset).toBe(false)
    expect([...plan.loaded].sort()).toEqual(['daen', 'enfi', 'ensv'])
  })

  it('starts a fresh engine when a new language would exceed the budget (WASM never frees models)', () => {
    const plan = planModelLoad(new Set(['daen', 'enda', 'enfi', 'fien']), ['sven', 'enda'], 4)
    expect(plan.reset).toBe(true)
    expect([...plan.loaded].sort()).toEqual(['enda', 'sven'])
  })

  it('does not reset for models that are already loaded', () => {
    const plan = planModelLoad(new Set(['daen', 'enda', 'enfi', 'fien']), ['daen', 'enfi'], 4)
    expect(plan.reset).toBe(false)
  })
})
