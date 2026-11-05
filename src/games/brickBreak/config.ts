export const FIELD = { width: 960, height: 600 }
export const STEP_SECONDS = 1 / 120

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const SETTINGS: Record<Difficulty, { ballSpeed: number; paddleWidth: number; rows: number }> = {
  easy: { ballSpeed: 360, paddleWidth: 168, rows: 5 },
  medium: { ballSpeed: 430, paddleWidth: 144, rows: 6 },
  hard: { ballSpeed: 500, paddleWidth: 126, rows: 7 },
  expert: { ballSpeed: 560, paddleWidth: 112, rows: 8 },
}

export const MAX_BALLS = 3
export const MAX_LIVES = 5
export const BALL_RADIUS = 8
export const PADDLE_Y = 548
export const POWER_DURATION_SECONDS = 10
export const BRICK_COLORS = [0x67e8c1, 0xff7e79, 0xffd166, 0x72d6f5, 0xb69cff, 0xf4f7fb] as const

export const NEW_LEADERBOARD_KEY = 'brickbreak-v2-global-leaderboard'
export const LEGACY_LEADERBOARD_KEY = 'brickbreak-global-leaderboard'
export const PLAY_COUNTS_KEY = 'brickbreak-play-counts'