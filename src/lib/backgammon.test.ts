import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { applyStep, describeSteps, nextSteps, pointPlace, removeDie, turnPlan, type BgColor, type BgPosition } from './backgammon'
import type { BackgammonStep } from './multiplayer'

const require = createRequire(import.meta.url)
const server = require('../../electron/games/backgammon/rules.cjs')

describe('backgammon board helpers', () => {
  it('puts my home board bottom right, whichever colour I play', () => {
    expect(pointPlace(1, 'white')).toEqual({ row: 'bottom', column: 11 })
    expect(pointPlace(12, 'white')).toEqual({ row: 'bottom', column: 0 })
    expect(pointPlace(13, 'white')).toEqual({ row: 'top', column: 0 })
    expect(pointPlace(24, 'white')).toEqual({ row: 'top', column: 11 })
    expect(pointPlace(24, 'black')).toEqual({ row: 'bottom', column: 11 })
    expect(pointPlace(1, 'black')).toEqual({ row: 'top', column: 11 })
  })

  it('writes moves from the mover\'s side, with hits starred', () => {
    expect(describeSteps([{ from: 13, to: 7, die: 6, hit: true }, { from: 6, to: 'off', die: 6 }], 'white', 'bar', 'off')).toBe('13/7*, 6/off')
    expect(describeSteps([{ from: 'bar', to: 3, die: 3 }], 'black', 'bar', 'off')).toBe('bar/22')
  })
})

describe('the board UI offers exactly the moves the main process accepts', () => {
  it('matches the server on random positions and rolls, step by step through whole turns', () => {
    let seed = 11
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const die = () => 1 + Math.floor(random() * 6)
    const key = (steps: BackgammonStep[]) => steps.map(step => `${step.from}>${step.to}:${step.die}`).sort().join(' ')
    let checked = 0
    for (let game = 0; game < 12; game++) {
      let state = server.createBackgammonState({ whiteIndex: 0, rollDie: die })
      for (let turn = 0; turn < 60 && !server.outcome(state).over; turn++) {
        const color: BgColor = state.turn
        const serverPlan = server.turnPlan(state, color, state.dice)
        const clientPlan = turnPlan(state as BgPosition, color, state.dice)
        expect(clientPlan.required).toBe(serverPlan.required)
        expect(clientPlan.highOnly).toBe(serverPlan.highOnly)
        let position: BgPosition = { points: state.points, bar: state.bar, off: state.off }
        let remaining = clientPlan.dice
        const steps: BackgammonStep[] = []
        for (;;) {
          const mine = nextSteps(position, color, clientPlan, steps, remaining)
          const theirs = server.nextSteps(position, color, serverPlan, steps, remaining)
          expect(key(mine)).toBe(key(theirs))
          checked++
          if (!mine.length) break
          const step = mine[Math.floor(random() * mine.length)]
          position = applyStep(position, color, step).position
          remaining = removeDie(remaining, step.die)
          steps.push(step)
        }
        state = server.applyTurn(state, color, steps, () => [die(), die()]).state
      }
    }
    expect(checked).toBeGreaterThan(500)
  })
})
