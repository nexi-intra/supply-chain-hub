export const COLS = 30
export const ROWS = 18
export const STEP_SECONDS = 1 / 120

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const SETTINGS: Record<Difficulty, { tick: number; obstacles: number }> = {
  easy: { tick: 0.15, obstacles: 0 },
  medium: { tick: 0.12, obstacles: 4 },
  hard: { tick: 0.095, obstacles: 6 },
  expert: { tick: 0.075, obstacles: 9 },
}

export const SPEEDUP_PER_PARCEL = 0.012
export const MAX_SPEEDUP = 0.45
export const MAX_QUEUED_TURNS = 3
export const START_LENGTH = 4
export const START = { x: 8, y: 9 }
export const COMBO_WINDOW_SECONDS = 3
export const MAX_MULTIPLIER = 5
export const PARCEL_POINTS = 10
export const EXPRESS_POINTS = 50
export const EXPRESS_CHANCE = 0.18
export const EXPRESS_LIFETIME_SECONDS = 6

export const LEADERBOARD_KEY = 'route-runner-global-leaderboard'
export const LEGACY_LEADERBOARD_KEY = 'neon-snake-global-leaderboard'
// Runderne tælles fortsat på Neon Snakes nøgle, så spillestatistikken lever videre.
export const PLAY_COUNTS_KEY = 'neon-snake-play-counts'
