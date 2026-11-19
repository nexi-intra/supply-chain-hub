import { describe, expect, it } from 'vitest'
import { createGame, getStats, stepGame } from './engine'
import { planActions, planPlacement } from './autoplay'

describe('autopilot', () => {
  it('vælger en placering, der rydder en række, når den kan', () => {
    const state = createGame('easy', { seed: 1 })
    for (let x = 0; x < 6; x++) state.board[21][x] = 'O'
    state.active = { type: 'I', x: 3, y: 1, rotation: 0 }
    const plan = planPlacement(state)
    expect(plan).toMatchObject({ rotation: 0, x: 6 })
  })

  it('spiller mange brikker uden at gå i stå og rydder mange rækker', () => {
    const state = createGame('easy', { seed: 11 })
    for (let piece = 0; piece < 400 && state.status === 'playing'; piece++) {
      stepGame(state, { actions: planActions(state, planPlacement(state)), held: { left: false, right: false, down: false } })
    }
    const stats = getStats(state)
    expect(stats.pieces).toBeGreaterThanOrEqual(400)
    expect(stats.lines).toBeGreaterThanOrEqual(120)
  }, 20000)
})
