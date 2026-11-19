export const FIELD = { width: 960, height: 600 }
export const STEP_SECONDS = 1 / 120

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const WATER_Y = 548
export const DRONE_X = 240
export const DRONE_RADIUS = 16
export const READY_Y = 280
export const GRAVITY = 1700
export const LIFT_VELOCITY = -500
export const MAX_FALL_SPEED = 720
export const GATE_WIDTH = 84
export const TOP_MARGIN = 70
export const BOTTOM_MARGIN = 40
export const PARCEL_RADIUS = 14
export const GATES_PER_ZONE = 10
export const ZONE_SPEEDUP = 0.04
export const MAX_SPEEDUP = 0.24
export const PERFECT_RATIO = 0.22
export const MAX_MULTIPLIER = 5
export const SHIELD_GRACE_SECONDS = 1.2

export interface DifficultySettings {
  gap: number
  speed: number
  spacing: number
  maxShift: number
  movingFromZone: number
}

export const SETTINGS: Record<Difficulty, DifficultySettings> = {
  easy: { gap: 215, speed: 210, spacing: 340, maxShift: 200, movingFromZone: Infinity },
  medium: { gap: 185, speed: 250, spacing: 320, maxShift: 180, movingFromZone: 3 },
  hard: { gap: 158, speed: 290, spacing: 300, maxShift: 150, movingFromZone: 2 },
  expert: { gap: 138, speed: 330, spacing: 285, maxShift: 120, movingFromZone: 2 },
}

export const ZONES = ['harbour', 'terminal', 'aurora', 'storm'] as const
export type Zone = (typeof ZONES)[number]

export function zoneTheme(zone: number): Zone {
  return ZONES[(Math.max(1, zone) - 1) % ZONES.length]
}

export const LEADERBOARD_KEY = 'parcel-pilot-global-leaderboard'
export const LEGACY_LEADERBOARD_KEY = 'nexi-flyer-global-leaderboard'
// Runderne tælles fortsat på Nexi Flyers nøgle, så spillestatistikken lever videre.
export const PLAY_COUNTS_KEY = 'nexi-flyer-play-counts'
