const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('./rules.cjs')

const fixed = values => {
  const queue = [...values]
  return () => {
    if (!queue.length) throw new Error('roll queue empty')
    return queue.shift()
  }
}
const rollPair = (...pairs) => {
  const queue = [...pairs]
  return () => queue.shift()
}

/** A position from { white: {point: n}, black: {point: n}, bar, off }; the rest of the 15 are borne off. */
function position({ white = {}, black = {}, bar = {}, turn = 'white', dice = [3, 1] } = {}) {
  const points = new Array(24).fill(0)
  for (const [p, n] of Object.entries(white)) points[Number(p) - 1] = n
  for (const [p, n] of Object.entries(black)) points[Number(p) - 1] = -n
  const counted = color => Object.values(color === 'white' ? white : black).reduce((a, b) => a + b, 0) + (bar[color] || 0)
  return {
    whiteIndex: 0, points, bar: { white: bar.white || 0, black: bar.black || 0 },
    off: { white: 15 - counted('white'), black: 15 - counted('black') }, turn, dice, opening: null, turns: [],
  }
}

test('the opening roll: one die each, re-rolled on a tie; the higher die starts and plays both', () => {
  const state = rules.createBackgammonState({ whiteIndex: 1, rollDie: fixed([4, 4, 2, 5]) })
  assert.equal(state.turn, 'black')
  assert.deepEqual(state.dice, [2, 5])
  assert.deepEqual(state.opening, { white: 2, black: 5 })
  assert.equal(state.whiteIndex, 1)
  assert.ok(rules.isState(state))
  assert.equal(state.points[23], 2)
  assert.equal(state.points[0], -2)
  assert.equal(state.points[5], 5)
  assert.equal(state.points[18], -5)
  assert.equal(rules.pips(state, 'white'), 167)
  assert.equal(rules.pips(state, 'black'), 167)
})

test('a normal opening turn: both dice, and the opponent rolls next', () => {
  const state = rules.createBackgammonState({ rollDie: fixed([3, 1]) })
  assert.equal(state.turn, 'white')
  const played = rules.applyTurn(state, 'white', [{ from: 8, to: 5, die: 3 }, { from: 6, to: 5, die: 1 }], rollPair([6, 2]), 'T1')
  assert.equal(played.state.points[4], 2)
  assert.equal(played.state.turn, 'black')
  assert.deepEqual(played.state.dice, [6, 2])
  assert.deepEqual(played.state.turns[0], { by: 'white', dice: [3, 1], steps: [{ from: 8, to: 5, die: 3 }, { from: 6, to: 5, die: 1 }], at: 'T1' })
  assert.ok(rules.isState(played.state))
})

test('moves are refused out of turn, onto a closed point, with a die not rolled, or when dice are left unused', () => {
  const state = rules.createBackgammonState({ rollDie: fixed([6, 5]) })
  const roll = rollPair([1, 2])
  assert.throws(() => rules.applyTurn(state, 'black', [], roll), /not-your-turn/)
  // 13 -> 7 is open but 24 -> 18 is closed? no: black's 18 is empty; the black 19 holds 5 checkers
  assert.throws(() => rules.applyTurn(state, 'white', [{ from: 24, to: 19, die: 5 }], roll), /illegal-move/)
  assert.throws(() => rules.applyTurn(state, 'white', [{ from: 13, to: 9, die: 4 }], roll), /illegal-move/)
  assert.throws(() => rules.applyTurn(state, 'white', [{ from: 24, to: 18, die: 6 }], roll), /incomplete-turn/)
  assert.throws(() => rules.applyTurn(state, 'white', [{ from: 24, to: 18, die: 6 }, { from: 18, to: 13, die: 5 }, { from: 6, to: 5, die: 1 }], roll), /illegal-move/)
})

test('a blot is hit and goes to the bar; a checker on the bar must enter before anything else', () => {
  const state = position({ white: { 8: 2, 6: 13 }, black: { 5: 1, 19: 14 }, dice: [3, 2] })
  const hit = rules.applyTurn(state, 'white', [{ from: 8, to: 5, die: 3 }, { from: 8, to: 6, die: 2 }], rollPair([4, 1]))
  assert.equal(hit.state.bar.black, 1)
  assert.equal(hit.state.points[4], 1)
  assert.equal(hit.turn[0].hit, true)
  // black on the bar enters with the 4 on point 4, then moves the 1
  assert.throws(() => rules.applyTurn(hit.state, 'black', [{ from: 19, to: 20, die: 1 }, { from: 19, to: 23, die: 4 }], rollPair([1, 1])), /illegal-move/)
  const entered = rules.applyTurn(hit.state, 'black', [{ from: 'bar', to: 4, die: 4 }, { from: 4, to: 5, die: 1 }], rollPair([2, 3]))
  assert.equal(entered.state.bar.black, 0)
  assert.equal(entered.state.bar.white, 1)
  assert.equal(entered.state.points[4], -1)
})

test('a doubled roll plays four times', () => {
  const state = position({ white: { 13: 4, 6: 11 }, black: { 19: 15 }, dice: [2, 2] })
  const steps = [{ from: 13, to: 11, die: 2 }, { from: 13, to: 11, die: 2 }, { from: 13, to: 11, die: 2 }, { from: 11, to: 9, die: 2 }]
  const played = rules.applyTurn(state, 'white', steps, rollPair([3, 4]))
  assert.equal(played.state.points[10], 2)
  assert.equal(played.state.points[8], 1)
  assert.throws(() => rules.applyTurn(state, 'white', steps.slice(0, 3), rollPair([3, 4])), /incomplete-turn/)
})

test('both dice must be played when the position allows it', () => {
  // the 6 first (13 -> 7) blocks nothing; playing 5 from 6 -> 1 then the 6 is impossible only if ... both orders work here
  const state = position({ white: { 13: 1, 2: 14 }, black: { 7: 2, 19: 13 }, dice: [6, 5] })
  // 13 -> 8 (5) then 8 -> 2 (6) uses both; 13 -> 7 is closed
  assert.equal(rules.turnPlan(state, 'white', [6, 5]).required, 2)
  assert.throws(() => rules.applyTurn(state, 'white', [{ from: 13, to: 8, die: 5 }], rollPair([1, 2])), /incomplete-turn/)
  assert.doesNotThrow(() => rules.applyTurn(state, 'white', [{ from: 13, to: 8, die: 5 }, { from: 8, to: 2, die: 6 }], rollPair([1, 2])))
})

test('when only one die can be played it must be the higher one, if that one fits', () => {
  // white has one checker left outside home at 13 and the rest home; black blocks 11 and 7 ... 13 -> 11 (2) closed
  const state = position({ white: { 13: 1, 1: 14 }, black: { 11: 2, 4: 2, 19: 11 }, dice: [6, 2] })
  // 6: 13 -> 7 open; then 2: 7 -> 5 open -> both could be played
  assert.equal(rules.turnPlan(state, 'white', [6, 2]).required, 2)
  const blocked = position({ white: { 13: 1, 1: 14 }, black: { 11: 2, 5: 2, 9: 2, 19: 9 }, dice: [6, 2] })
  // 2: 13 -> 11 closed; 6: 13 -> 7 open, then 2: 7 -> 5 closed; checkers on 1 cannot move (not all home)
  const plan = rules.turnPlan(blocked, 'white', [6, 2])
  assert.equal(plan.required, 1)
  assert.equal(plan.highOnly, true)
  assert.doesNotThrow(() => rules.applyTurn(blocked, 'white', [{ from: 13, to: 7, die: 6 }], rollPair([1, 2])))
})

test('no legal move: the turn is passed with no steps', () => {
  const state = position({ white: { 1: 15 }, black: { 2: 2, 3: 2, 19: 11 }, bar: {}, dice: [6, 6] })
  // white is all home: bearing off from 1 with a 6 is legal - so make white stuck on the bar instead
  const stuck = position({ white: { 1: 14 }, black: { 19: 2, 20: 2, 21: 2, 22: 2, 23: 2, 24: 2, 18: 3 }, bar: { white: 1 }, dice: [6, 6] })
  assert.equal(rules.turnPlan(stuck, 'white', [6, 6]).required, 0)
  const passed = rules.applyTurn(stuck, 'white', [], rollPair([2, 1]))
  assert.equal(passed.state.turn, 'black')
  assert.equal(rules.turnPlan(state, 'white', [6, 6]).required, 4)
})

test('bearing off: exact die, a higher die only from the highest point, and never with a checker outside home', () => {
  const state = position({ white: { 5: 1, 3: 1 }, black: { 19: 15 }, dice: [6, 1] })
  const played = rules.applyTurn(state, 'white', [{ from: 5, to: 'off', die: 6 }, { from: 3, to: 2, die: 1 }], rollPair([1, 2]))
  assert.equal(played.state.off.white, 14)
  assert.throws(() => rules.applyTurn(state, 'white', [{ from: 3, to: 'off', die: 6 }, { from: 5, to: 4, die: 1 }], rollPair([1, 2])), /illegal-move/)
  const outside = position({ white: { 7: 1, 3: 1 }, black: { 19: 15 }, dice: [3, 2] })
  assert.throws(() => rules.applyTurn(outside, 'white', [{ from: 3, to: 'off', die: 3 }, { from: 7, to: 5, die: 2 }], rollPair([1, 2])), /illegal-move/)
  assert.doesNotThrow(() => rules.applyTurn(outside, 'white', [{ from: 7, to: 5, die: 2 }, { from: 3, to: 'off', die: 3 }], rollPair([1, 2])))
})

test('the last checker off wins: single, gammon and backgammon', () => {
  const single = position({ white: { 2: 1 }, black: { 19: 14 }, dice: [2, 1] })
  single.off.black = 1
  const won = rules.applyTurn(single, 'white', [{ from: 2, to: 'off', die: 2 }], () => { throw new Error('no roll after the end') })
  assert.deepEqual(won.outcome, { over: true, winner: 'white', points: 1, reason: 'bore-off' })
  assert.equal(won.state.turn, null)
  assert.deepEqual(won.state.dice, [])
  assert.throws(() => rules.applyTurn(won.state, 'black', [], rollPair([1, 2])), /game-over/)

  const gammon = position({ white: { 1: 1 }, black: { 19: 15 }, dice: [1, 2] })
  assert.equal(rules.applyTurn(gammon, 'white', [{ from: 1, to: 'off', die: 2 }], rollPair([1, 1])).outcome.points, 2)
  const backgammon = position({ white: { 1: 1 }, black: { 3: 1, 19: 14 }, dice: [1, 2] })
  assert.equal(rules.applyTurn(backgammon, 'white', [{ from: 1, to: 'off', die: 2 }], rollPair([1, 1])).outcome.points, 3)
})

test('black moves the other way and bears off above 24', () => {
  const state = position({ white: { 6: 15 }, black: { 23: 1, 20: 1 }, turn: 'black', dice: [5, 2] })
  const played = rules.applyTurn(state, 'black', [{ from: 20, to: 'off', die: 5 }, { from: 23, to: 'off', die: 2 }], rollPair([1, 2]))
  assert.equal(played.outcome.winner, 'black')
  assert.equal(played.outcome.points, 2)
})

test('the projection shows the position, dice, pips and how many dice the player on turn must play', () => {
  const state = rules.createBackgammonState({ rollDie: fixed([5, 2]) })
  const white = rules.projection(state, 'white')
  assert.equal(white.required, 2)
  assert.deepEqual(white.dice, [5, 2])
  assert.equal(white.myColor, 'white')
  assert.equal(rules.projection(state, 'black').required, 0)
  assert.deepEqual(white.pips, { white: 167, black: 167 })
  assert.equal(white.lastTurn, null)
})

test('damaged states are rejected', () => {
  const state = rules.createBackgammonState({ rollDie: fixed([5, 2]) })
  assert.equal(rules.isState({ ...state, points: state.points.slice(1) }), false)
  assert.equal(rules.isState({ ...state, off: { white: 1, black: 0 } }), false)
  assert.equal(rules.isState({ ...state, dice: [7, 1] }), false)
  assert.throws(() => rules.applyTurn({ ...state, turn: 'green' }, 'white', [], rollPair([1, 2])), /invalid-state/)
})

test('random games played with the offered steps always stay valid and end with a winner', () => {
  let seed = 7
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const die = () => 1 + Math.floor(random() * 6)
  for (let game = 0; game < 30; game++) {
    let state = rules.createBackgammonState({ whiteIndex: game % 2, rollDie: die })
    let turns = 0
    while (!rules.outcome(state).over) {
      assert.ok(turns++ < 2000, 'the game ends')
      const color = state.turn
      const plan = rules.turnPlan(state, color, state.dice)
      let position = { points: state.points, bar: state.bar, off: state.off }
      let remaining = plan.dice
      const steps = []
      for (;;) {
        const options = rules.nextSteps(position, color, plan, steps, remaining)
        if (!options.length) break
        const step = options[Math.floor(random() * options.length)]
        position = rules.applyStep(position, color, step).position
        remaining = [...remaining]
        remaining.splice(remaining.indexOf(step.die), 1)
        steps.push(step)
      }
      state = rules.applyTurn(state, color, steps, () => [die(), die()]).state
      assert.ok(rules.isState(state))
    }
    assert.ok(['white', 'black'].includes(rules.outcome(state).winner))
  }
})
