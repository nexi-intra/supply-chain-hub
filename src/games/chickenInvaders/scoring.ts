import {
  COMBO_WINDOW_SECONDS,
  DRUMSTICK_POINTS,
  EXTRA_LIFE_EVERY,
  KILLS_PER_MULTIPLIER_STEP,
  MAX_MULTIPLIER,
  PERFECT_WAVE_BONUS,
  WAVE_CLEAR_POINTS_PER_WAVE,
} from './config'

export interface ScoreState {
  score: number
  chain: number
  bestChain: number
  lastKillAt: number
  nextExtraLifeAt: number
}

export function createScoreState(): ScoreState {
  return { score: 0, chain: 0, bestChain: 0, lastKillAt: -Infinity, nextExtraLifeAt: EXTRA_LIFE_EVERY }
}

export function multiplierFor(chain: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(chain / KILLS_PER_MULTIPLIER_STEP))
}

function chainIsActive(state: ScoreState, now: number): boolean {
  return now - state.lastKillAt <= COMBO_WINDOW_SECONDS
}

export function currentMultiplier(state: ScoreState, now: number): number {
  return chainIsActive(state, now) ? multiplierFor(state.chain) : 1
}

export function registerKill(state: ScoreState, basePoints: number, now: number): { points: number; multiplier: number } {
  state.chain = chainIsActive(state, now) ? state.chain + 1 : 1
  state.lastKillAt = now
  state.bestChain = Math.max(state.bestChain, state.chain)
  const multiplier = multiplierFor(state.chain)
  const points = basePoints * multiplier
  state.score += points
  return { points, multiplier }
}

export function pickupDrumstick(state: ScoreState, now: number, factor = 1): number {
  const points = DRUMSTICK_POINTS * currentMultiplier(state, now) * factor
  state.score += points
  return points
}

export function addBonus(state: ScoreState, points: number): void {
  state.score += points
}

export function waveClearBonus(wave: number, perfect: boolean): number {
  return WAVE_CLEAR_POINTS_PER_WAVE * wave + (perfect ? PERFECT_WAVE_BONUS : 0)
}

/** Returnerer antallet af nye ekstra liv siden sidste kald. */
export function claimExtraLives(state: ScoreState): number {
  let earned = 0
  while (state.score >= state.nextExtraLifeAt) {
    earned++
    state.nextExtraLifeAt += EXTRA_LIFE_EVERY
  }
  return earned
}
