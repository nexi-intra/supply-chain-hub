// Backgammon rules (no doubling cube). Pure and serialisable: the multiplayer service keeps the state in the game file.
// Points are numbered 1..24 from white's side: white moves 24 -> 1 and bears off below 1, black moves 1 -> 24 and bears
// off above 24. points[i] holds point i + 1: positive = white checkers, negative = black checkers.
// src/lib/backgammon.ts mirrors the move generation for the board UI; backgammonParity.test.ts keeps the two equal.

const COLORS = ['white', 'black']
const CHECKERS = 15
// white's checkers by point; black mirrors them (point p for white = point 25 - p for black)
const START = { 24: 2, 13: 5, 8: 3, 6: 5 }

function ruleError(reason, message) {
  const error = new Error(`${reason}: ${message}`)
  error.reason = reason
  throw error
}

const other = color => (color === 'white' ? 'black' : 'white')
const sign = color => (color === 'white' ? 1 : -1)
const own = (points, color, point) => Math.max(0, points[point - 1] * sign(color))

function startPoints() {
  const points = new Array(24).fill(0)
  for (const [point, count] of Object.entries(START)) {
    points[Number(point) - 1] = count
    points[24 - Number(point)] = -count
  }
  return points
}

/** Rolls the opening (one die each, again on a tie): the higher die starts and plays both. */
function createBackgammonState({ whiteIndex = 0, rollDie }) {
  if (whiteIndex !== 0 && whiteIndex !== 1) ruleError('invalid-state', 'whiteIndex must be 0 or 1')
  if (typeof rollDie !== 'function') ruleError('invalid-state', 'rollDie is required')
  let white = 0
  let black = 0
  for (let tries = 0; white === black; tries++) {
    // a broken die that keeps tying must not hang the service: white starts with 2-1
    if (tries >= 100) { white = 2; black = 1; break }
    white = rollDie()
    black = rollDie()
  }
  return {
    whiteIndex, points: startPoints(), bar: { white: 0, black: 0 }, off: { white: 0, black: 0 },
    turn: white > black ? 'white' : 'black', dice: [white, black], opening: { white, black }, turns: [],
  }
}

const isCount = value => Number.isSafeInteger(value) && value >= 0 && value <= CHECKERS
const isDie = value => Number.isSafeInteger(value) && value >= 1 && value <= 6

function isState(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.whiteIndex !== 0 && value.whiteIndex !== 1) return false
  if (!Array.isArray(value.points) || value.points.length !== 24 || !value.points.every(n => Number.isSafeInteger(n) && Math.abs(n) <= CHECKERS)) return false
  for (const key of ['bar', 'off']) {
    if (!value[key] || typeof value[key] !== 'object' || !isCount(value[key].white) || !isCount(value[key].black)) return false
  }
  if (value.turn !== null && !COLORS.includes(value.turn)) return false
  if (!Array.isArray(value.dice) || value.dice.length > 2 || !value.dice.every(isDie)) return false
  if (!Array.isArray(value.turns)) return false
  for (const color of COLORS) {
    const onBoard = value.points.reduce((sum, n) => sum + Math.max(0, n * sign(color)), 0)
    if (onBoard + value.bar[color] + value.off[color] !== CHECKERS) return false
  }
  return true
}

/** The dice a roll gives: a double is played four times. */
const diceToPlay = dice => (dice.length === 2 && dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [...dice])

function allHome(position, color) {
  if (position.bar[color] > 0) return false
  for (let point = 1; point <= 24; point++) {
    const home = color === 'white' ? point <= 6 : point >= 19
    if (!home && own(position.points, color, point) > 0) return false
  }
  return true
}

/** Every single checker move one die allows: from 'bar' or a point, to a point or 'off'. */
function stepsForDie(position, color, die) {
  const steps = []
  const enemy = other(color)
  const open = point => own(position.points, enemy, point) < 2
  if (position.bar[color] > 0) {
    const to = color === 'white' ? 25 - die : die
    if (open(to)) steps.push({ from: 'bar', to, die })
    return steps
  }
  const bearing = allHome(position, color)
  for (let from = 1; from <= 24; from++) {
    if (own(position.points, color, from) === 0) continue
    const to = color === 'white' ? from - die : from + die
    if (to >= 1 && to <= 24) {
      if (open(to)) steps.push({ from, to, die })
      continue
    }
    if (!bearing) continue
    const distance = color === 'white' ? from : 25 - from
    if (die === distance) {
      steps.push({ from, to: 'off', die })
      continue
    }
    // a higher die bears off from the highest point only
    const higher = color === 'white'
      ? [...Array(6 - from).keys()].some(k => own(position.points, color, from + 1 + k) > 0)
      : [...Array(from - 19).keys()].some(k => own(position.points, color, 19 + k) > 0)
    if (die > distance && !higher) steps.push({ from, to: 'off', die })
  }
  return steps
}

function applyStep(position, color, step) {
  const points = [...position.points]
  const bar = { ...position.bar }
  const off = { ...position.off }
  const s = sign(color)
  let hit = false
  if (step.from === 'bar') bar[color] -= 1
  else points[step.from - 1] -= s
  if (step.to === 'off') {
    off[color] += 1
  } else {
    if (points[step.to - 1] === -s) {
      points[step.to - 1] = 0
      bar[other(color)] += 1
      hit = true
    }
    points[step.to - 1] += s
  }
  return { position: { points, bar, off }, hit }
}

const positionKey = (position, dice) => `${position.points.join(',')}|${position.bar.white},${position.bar.black}|${position.off.white},${position.off.black}|${[...dice].sort().join('')}`

function removeDie(dice, die) {
  const index = dice.indexOf(die)
  return [...dice.slice(0, index), ...dice.slice(index + 1)]
}

/** The most dice that can still be played from here (memoised: doubles branch a lot). */
function maxPlayable(position, color, dice, memo = new Map()) {
  if (!dice.length) return 0
  // the last checker off ends the game: the dice left over count as played
  if (position.off[color] === CHECKERS) return dice.length
  const key = positionKey(position, dice)
  if (memo.has(key)) return memo.get(key)
  let best = 0
  for (const die of new Set(dice)) {
    for (const step of stepsForDie(position, color, die)) {
      best = Math.max(best, 1 + maxPlayable(applyStep(position, color, step).position, color, removeDie(dice, die), memo))
      if (best === dice.length) break
    }
    if (best === dice.length) break
  }
  memo.set(key, best)
  return best
}

/** Rules of the whole turn for a position: how many dice must be played, and the higher-die rule. */
function turnPlan(position, color, rolled) {
  const dice = diceToPlay(rolled)
  const memo = new Map()
  const required = maxPlayable(position, color, dice, memo)
  const high = Math.max(...rolled)
  // only one die can be played but either could: it must be the higher one
  const highOnly = required === 1 && rolled.length === 2 && rolled[0] !== rolled[1] && stepsForDie(position, color, high).length > 0
  return { dice, required, highOnly, memo }
}

/**
 * The single moves that keep the turn legal after `played` (already applied to `position`, from the turn's start
 * plan): each must leave enough dice playable to reach the required number.
 */
function nextSteps(position, color, plan, played, remaining) {
  if (played.length >= plan.required || position.off[color] === CHECKERS) return []
  const steps = []
  for (const die of new Set(remaining)) {
    if (plan.highOnly && die !== Math.max(...plan.dice)) continue
    for (const step of stepsForDie(position, color, die)) {
      const after = applyStep(position, color, step).position
      if (played.length + 1 + maxPlayable(after, color, removeDie(remaining, die), plan.memo) >= plan.required) steps.push(step)
    }
  }
  return steps
}

const sameStep = (a, b) => a.from === b.from && a.to === b.to && a.die === b.die

function pips(position, color) {
  let total = position.bar[color] * 25
  for (let point = 1; point <= 24; point++) total += own(position.points, color, point) * (color === 'white' ? point : 25 - point)
  return total
}

/** 1 = single game, 2 = gammon (loser bore none off), 3 = backgammon (and still on the bar or in the winner's home). */
function winPoints(position, winner) {
  const loser = other(winner)
  if (position.off[loser] > 0) return 1
  const inWinnersHome = position.bar[loser] > 0 ||
    [...Array(6).keys()].some(k => own(position.points, loser, winner === 'white' ? k + 1 : 24 - k) > 0)
  return inWinnersHome ? 3 : 2
}

function outcome(state) {
  for (const color of COLORS) {
    if (state.off[color] === CHECKERS) return { over: true, winner: color, points: winPoints(state, color), reason: 'bore-off' }
  }
  return { over: false, winner: null, points: 0, reason: null }
}

function normalizeStep(step) {
  if (step === null || typeof step !== 'object' || Array.isArray(step)) ruleError('illegal-move', 'Invalid step')
  const from = step.from === 'bar' ? 'bar' : step.from
  const to = step.to === 'off' ? 'off' : step.to
  if (from !== 'bar' && (!Number.isSafeInteger(from) || from < 1 || from > 24)) ruleError('illegal-move', 'Invalid from')
  if (to !== 'off' && (!Number.isSafeInteger(to) || to < 1 || to > 24)) ruleError('illegal-move', 'Invalid to')
  if (!isDie(step.die)) ruleError('illegal-move', 'Invalid die')
  return { from, to, die: step.die }
}

/**
 * Plays a whole turn for `color` and hands the dice to the opponent (`roll` gives their two dice).
 * The steps must be legal one by one and use as many dice as the position allows (higher die if only one fits).
 */
function applyTurn(state, color, steps, roll, at = null) {
  if (!isState(state)) ruleError('invalid-state', 'Invalid backgammon state')
  if (!COLORS.includes(color)) ruleError('invalid-state', 'Invalid colour')
  if (outcome(state).over) ruleError('game-over', 'The game is over')
  if (state.turn !== color) ruleError('not-your-turn', 'It is not your turn')
  if (!Array.isArray(steps) || steps.length > 4) ruleError('illegal-move', 'Invalid steps')
  const plan = turnPlan(state, color, state.dice)
  let position = { points: state.points, bar: state.bar, off: state.off }
  let remaining = plan.dice
  const played = []
  for (const raw of steps) {
    const step = normalizeStep(raw)
    if (!nextSteps(position, color, plan, played, remaining).some(candidate => sameStep(candidate, step))) {
      ruleError('illegal-move', `${step.from}->${step.to} with ${step.die} is not legal here`)
    }
    const result = applyStep(position, color, step)
    position = result.position
    remaining = removeDie(remaining, step.die)
    played.push({ ...step, ...(result.hit ? { hit: true } : {}) })
  }
  if (played.length < plan.required && position.off[color] < CHECKERS) ruleError('incomplete-turn', `Play ${plan.required} dice`)
  const next = { ...state, ...position, turns: [...state.turns, { by: color, dice: [...state.dice], steps: played, at }] }
  const result = outcome(next)
  if (result.over) return { state: { ...next, turn: null, dice: [] }, turn: played, outcome: result }
  const dice = roll()
  if (!Array.isArray(dice) || dice.length !== 2 || !dice.every(isDie)) ruleError('invalid-state', 'Invalid roll')
  return { state: { ...next, turn: other(color), dice: [...dice] }, turn: played, outcome: result }
}

/** What one player sees: the position, the dice, pip counts and, on their turn, how many dice they must play. */
function projection(state, myColor) {
  if (!COLORS.includes(myColor)) ruleError('invalid-state', 'Invalid colour')
  const result = outcome(state)
  const mine = !result.over && state.turn === myColor
  const plan = mine ? turnPlan(state, myColor, state.dice) : null
  const last = state.turns[state.turns.length - 1] || null
  return {
    points: [...state.points], bar: { ...state.bar }, off: { ...state.off }, turn: state.turn, dice: [...state.dice], myColor,
    opening: state.opening ? { ...state.opening } : null,
    pips: { white: pips(state, 'white'), black: pips(state, 'black') },
    required: plan ? plan.required : 0,
    lastTurn: last ? { by: last.by, dice: [...last.dice], steps: last.steps.map(step => ({ ...step })) } : null,
    turnCount: state.turns.length, outcome: result,
  }
}

module.exports = {
  COLORS, CHECKERS, createBackgammonState, isState, diceToPlay, stepsForDie, applyStep, maxPlayable, turnPlan, nextSteps,
  applyTurn, projection, outcome, pips, winPoints,
}
