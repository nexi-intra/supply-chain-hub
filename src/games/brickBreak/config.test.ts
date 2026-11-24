import { describe, expect, it } from 'vitest'
import {
  BALL_RADIUS,
  BRICK_COLORS,
  DIFFICULTIES,
  FIELD,
  LEGACY_LEADERBOARD_KEY,
  MAX_BALLS,
  MAX_LIVES,
  NEW_LEADERBOARD_KEY,
  PADDLE_Y,
  PLAY_COUNTS_KEY,
  POWER_DURATION_SECONDS,
  SETTINGS,
  STEP_SECONDS,
} from './config'

describe('BrickBreak config', () => {
  it('defines the fixed field and simulation step', () => {
    expect(FIELD).toEqual({ width: 960, height: 600 })
    expect(STEP_SECONDS).toBe(1 / 120)
  })

  it('defines the supported difficulty settings', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'medium', 'hard', 'expert'])
    expect(SETTINGS).toEqual({
      easy: { ballSpeed: 360, paddleWidth: 168, rows: 5 },
      medium: { ballSpeed: 430, paddleWidth: 144, rows: 6 },
      hard: { ballSpeed: 500, paddleWidth: 126, rows: 7 },
      expert: { ballSpeed: 560, paddleWidth: 112, rows: 8 },
    })
  })

  it('sets the ball, paddle, and power duration values', () => {
    expect(BALL_RADIUS).toBe(8)
    expect(PADDLE_Y).toBeCloseTo(548)
    expect(POWER_DURATION_SECONDS).toBe(10)
  })

  it('caps balls and lives to the game limits', () => {
    expect(MAX_BALLS).toBe(3)
    expect(MAX_LIVES).toBe(5)
  })

  it('provides six brick color slots', () => {
    expect(BRICK_COLORS).toHaveLength(6)
    expect(BRICK_COLORS.every((color) => Number.isInteger(color) && color >= 0 && color <= 0xffffff)).toBe(true)
  })

  it('keeps leaderboard and play-count keys versioned', () => {
    expect(NEW_LEADERBOARD_KEY).toBe('brickbreak-v2-global-leaderboard')
    expect(LEGACY_LEADERBOARD_KEY).toBe('brickbreak-global-leaderboard')
    expect(PLAY_COUNTS_KEY).toBe('brickbreak-play-counts')
  })
})