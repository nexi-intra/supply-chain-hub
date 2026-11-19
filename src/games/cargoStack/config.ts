export const COLS = 10
export const VISIBLE_ROWS = 20
export const HIDDEN_ROWS = 2
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS
export const STEP_SECONDS = 1 / 120

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const SETTINGS: Record<Difficulty, { startLevel: number; previews: number }> = {
  easy: { startLevel: 1, previews: 5 },
  medium: { startLevel: 3, previews: 5 },
  hard: { startLevel: 6, previews: 5 },
  expert: { startLevel: 9, previews: 3 },
}

export const LINES_PER_LEVEL = 10
export const LOCK_DELAY_SECONDS = 0.5
export const MAX_LOCK_RESETS = 15
export const DAS_SECONDS = 0.167
export const ARR_SECONDS = 0.033
export const SOFT_DROP_FACTOR = 20
export const MIN_SOFT_DROP_ROWS_PER_SECOND = 20
/** 20G: brikken falder hele brættet på ét billede. */
export const MAX_ROWS_PER_SECOND = 20 * 60

/** Guideline-tyngden i rækker pr. sekund for et niveau. */
export function gravityRowsPerSecond(level: number): number {
  const secondsPerRow = Math.pow(0.8 - (level - 1) * 0.007, level - 1)
  return Math.min(MAX_ROWS_PER_SECOND, 1 / Math.max(1e-6, secondsPerRow))
}

export const LEADERBOARD_KEY = 'cargo-stack-global-leaderboard'
export const LEGACY_LEADERBOARD_KEY = 'tetris-global-leaderboard'
export const PLAY_COUNTS_KEY = 'cargo-stack-play-counts'
