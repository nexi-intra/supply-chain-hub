// The board UI's copy of the backgammon move generation in electron/games/backgammon/rules.cjs (the main process stays
// the authority). backgammon.test.ts checks both give the same moves on many random positions.
import type { BackgammonStep, MultiplayerChessColor } from './multiplayer'

export type BgColor = MultiplayerChessColor

export interface BgPosition {
  /** points[i] is point i + 1: positive = white checkers, negative = black. */
  points: number[]
  bar: Record<BgColor, number>
  off: Record<BgColor, number>
}

export interface BgPlan {
  dice: number[]
  required: number
  highOnly: boolean
  memo: Map<string, number>
}

export const CHECKERS = 15

const other = (color: BgColor): BgColor => (color === 'white' ? 'black' : 'white')
const sign = (color: BgColor) => (color === 'white' ? 1 : -1)
export const ownCount = (points: number[], color: BgColor, point: number) => Math.max(0, points[point - 1] * sign(color))

export const diceToPlay = (dice: readonly number[]) => (dice.length === 2 && dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [...dice])

function allHome(position: BgPosition, color: BgColor) {
  if (position.bar[color] > 0) return false
  for (let point = 1; point <= 24; point++) {
    const home = color === 'white' ? point <= 6 : point >= 19
    if (!home && ownCount(position.points, color, point) > 0) return false
  }
  return true
}

export function stepsForDie(position: BgPosition, color: BgColor, die: number): BackgammonStep[] {
  const steps: BackgammonStep[] = []
  const enemy = other(color)
  const open = (point: number) => ownCount(position.points, enemy, point) < 2
  if (position.bar[color] > 0) {
    const to = color === 'white' ? 25 - die : die
    if (open(to)) steps.push({ from: 'bar', to, die })
    return steps
  }
  const bearing = allHome(position, color)
  for (let from = 1; from <= 24; from++) {
    if (ownCount(position.points, color, from) === 0) continue
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
    const higher = color === 'white'
      ? [...Array(6 - from).keys()].some(k => ownCount(position.points, color, from + 1 + k) > 0)
      : [...Array(from - 19).keys()].some(k => ownCount(position.points, color, 19 + k) > 0)
    if (die > distance && !higher) steps.push({ from, to: 'off', die })
  }
  return steps
}

export function applyStep(position: BgPosition, color: BgColor, step: BackgammonStep): { position: BgPosition; hit: boolean } {
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

const positionKey = (position: BgPosition, dice: readonly number[]) =>
  `${position.points.join(',')}|${position.bar.white},${position.bar.black}|${position.off.white},${position.off.black}|${[...dice].sort().join('')}`

export function removeDie(dice: readonly number[], die: number) {
  const index = dice.indexOf(die)
  return [...dice.slice(0, index), ...dice.slice(index + 1)]
}

export function maxPlayable(position: BgPosition, color: BgColor, dice: readonly number[], memo = new Map<string, number>()): number {
  if (!dice.length) return 0
  if (position.off[color] === CHECKERS) return dice.length
  const key = positionKey(position, dice)
  const known = memo.get(key)
  if (known !== undefined) return known
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

export function turnPlan(position: BgPosition, color: BgColor, rolled: readonly number[]): BgPlan {
  const dice = diceToPlay(rolled)
  const memo = new Map<string, number>()
  const required = maxPlayable(position, color, dice, memo)
  const high = Math.max(...rolled)
  const highOnly = required === 1 && rolled.length === 2 && rolled[0] !== rolled[1] && stepsForDie(position, color, high).length > 0
  return { dice, required, highOnly, memo }
}

/** The single moves that keep the turn legal after `played` (already applied to `position`). */
export function nextSteps(position: BgPosition, color: BgColor, plan: BgPlan, played: readonly BackgammonStep[], remaining: readonly number[]): BackgammonStep[] {
  if (played.length >= plan.required || position.off[color] === CHECKERS) return []
  const steps: BackgammonStep[] = []
  for (const die of new Set(remaining)) {
    if (plan.highOnly && die !== Math.max(...plan.dice)) continue
    for (const step of stepsForDie(position, color, die)) {
      const after = applyStep(position, color, step).position
      if (played.length + 1 + maxPlayable(after, color, removeDie(remaining, die), plan.memo) >= plan.required) steps.push(step)
    }
  }
  return steps
}

/**
 * Where a point sits on the board as seen by `me`: my home board is always bottom right.
 * Returns the row (top/bottom) and the column 0..11 from the left.
 */
export function pointPlace(point: number, me: BgColor): { row: 'top' | 'bottom'; column: number } {
  const mine = me === 'white' ? point : 25 - point
  if (mine <= 12) return { row: 'bottom', column: 12 - mine }
  return { row: 'top', column: mine - 13 }
}

/** "13/7*, 6/off" style move list for a turn, numbered from the mover's side. */
export function describeSteps(steps: readonly BackgammonStep[], by: BgColor, bar: string, off: string): string {
  const num = (value: number | 'bar' | 'off') => (value === 'bar' ? bar : value === 'off' ? off : String(by === 'white' ? value : 25 - value))
  return steps.map(step => `${num(step.from)}/${num(step.to)}${step.hit ? '*' : ''}`).join(', ')
}
