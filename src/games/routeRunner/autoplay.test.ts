import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from './config'
import { createGame, getStats, stepGame } from './engine'
import { autopilotDirection } from './autoplay'

describe('autopilot', () => {
  it('kører efter pakken ad korteste vej', () => {
    const state = createGame('easy', { seed: 1 })
    stepGame(state, { turns: [], start: true })
    state.parcel = { x: state.segments[0].x, y: state.segments[0].y - 4 }
    expect(autopilotDirection(state)).toBe('up')
  })

  it('kan spille længe på alle sværhedsgrader uden at forhindringerne lukker banen', () => {
    for (const difficulty of DIFFICULTIES) {
      const parcels: number[] = []
      for (let seed = 1; seed <= 3; seed++) {
        const state = createGame(difficulty, { seed })
        stepGame(state, { turns: [], start: true })
        let ticks = -1
        for (let i = 0; i < 120 * 120 && state.status === 'playing'; i++) {
          const turns = state.ticks !== ticks ? [autopilotDirection(state)] : []
          ticks = state.ticks
          stepGame(state, { turns })
        }
        parcels.push(getStats(state).parcels)
      }
      parcels.sort((a, b) => a - b)
      expect(parcels[1], `${difficulty}: ${parcels.join(',')}`).toBeGreaterThanOrEqual(25)
    }
  }, 20000)
})
