export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export interface DifficultySettings {
  /** Formationens vandrette fart i px/s. */
  enemySpeed: number
  /** Hvor langt formationen rykker ned, når den rammer en kant. */
  descentStep: number
  /** Forventet antal æg pr. sekund fra hele formationen. */
  eggRate: number
  eggSpeed: number
  /** Forventet antal dyk pr. sekund i en dykkerbølge. */
  diveRate: number
  bossHealth: number
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  easy: { enemySpeed: 50, descentStep: 10, eggRate: 0.6, eggSpeed: 170, diveRate: 0.12, bossHealth: 120 },
  medium: { enemySpeed: 65, descentStep: 12, eggRate: 0.9, eggSpeed: 210, diveRate: 0.2, bossHealth: 160 },
  hard: { enemySpeed: 85, descentStep: 14, eggRate: 1.3, eggSpeed: 250, diveRate: 0.3, bossHealth: 210 },
  expert: { enemySpeed: 105, descentStep: 16, eggRate: 1.8, eggSpeed: 290, diveRate: 0.42, bossHealth: 250 },
}

export const FIELD = { width: 960, height: 600 }
export const STEP_SECONDS = 1 / 60

export const STARTING_LIVES = 3
export const MAX_LIVES = 5
export const INVULNERABLE_SECONDS = 2
export const SHIELD_GRACE_SECONDS = 0.5

export const COMBO_WINDOW_SECONDS = 1.2
export const MAX_MULTIPLIER = 5
export const KILLS_PER_MULTIPLIER_STEP = 5
export const EXTRA_LIFE_EVERY = 25_000
export const DRUMSTICK_POINTS = 50
export const WAVE_CLEAR_POINTS_PER_WAVE = 500
export const PERFECT_WAVE_BONUS = 1000
export const MAX_WEAPON_GIFT_POINTS = 1000
export const FULL_MISSILES_PICKUP_POINTS = 500
/** Mønter fra guldmeteorer uden for bonusbanerne. */
export const COIN_POINTS = 250

export const ENEMY_POINTS = {
  hen: 100,
  helmet: 250,
  diver: 200,
  golden: 1000,
  chick: 50,
  meteorSmall: 50,
  meteorLarge: 150,
} as const
export const BOSS_POINTS_PER_LEVEL = 5000

export const MAX_WEAPON_LEVEL = 5
export const PROJECTILE_SPEED = 720
export const HEAT_PER_SHOT = 9
export const ION_HEAT_PER_SHOT = 6
export const HEAT_COOL_PER_SECOND = 25
export const OVERHEAT_LOCK_SECONDS = 1.2
export const COOLANT_SECONDS = 8
export const MAX_MISSILES = 3
export const MISSILE_BOSS_DAMAGE_RATIO = 0.15

export const SHIP_SPEED = 480
export const SHIP_POINTER_SPEED = 900
export const SHIP_HALF_WIDTH = 24
export const SHIP_HIT_RADIUS = 16
export const SHIP_Y = FIELD.height - 56
/** Skibets lodrette spillerum: under HUD-linjen øverst og ned til startpladsen. */
export const SHIP_MIN_Y = 120
export const SHIP_MAX_Y = SHIP_Y

export const EGG_RADIUS = 7
export const PICKUP_RADIUS = 14
export const PICKUP_FALL_SPEED = 140
export const DRUMSTICK_CHANCE = 0.35
export const GIFT_CHANCE = 0.06
export const POWERUP_CHANCE = 0.05

export const ENTER_SECONDS = 1.6
export const ENTER_STAGGER_SECONDS = 0.04
export const DIVE_SECONDS = 2.2
/** Indflyvende høns kan først ramme skibet, når de har flyvet så længe på deres bane. */
export const ENTRY_CONTACT_GRACE_SECONDS = 0.6
export const WAVE_TRANSITION_SECONDS = 2
export const DANGER_ZONE_Y = SHIP_Y - 44
export const DANGER_PUSHBACK = 200

export const GOLDEN_DELAY_SECONDS = 3
export const GOLDEN_SPEED = 260
export const METEOR_SPAWN_INTERVAL = 0.6
export const LARGE_METEOR_CHANCE = 0.3

export const BOSS_HALF_WIDTH = 100
export const BOSS_HALF_HEIGHT = 60
export const BOSS_Y = 150
export const BOSS_ENTER_SECONDS = 2
export const LASER_WARNING_SECONDS = 1
export const LASER_FIRING_SECONDS = 0.6
export const LASER_HALF_WIDTH = 18
export const LASER_INTERVAL_SECONDS = 4
