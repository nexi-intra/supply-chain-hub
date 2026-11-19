import {
  COOLANT_SECONDS,
  HEAT_COOL_PER_SECOND,
  HEAT_PER_SHOT,
  ION_HEAT_PER_SHOT,
  MAX_WEAPON_LEVEL,
  OVERHEAT_LOCK_SECONDS,
} from './config'
import type { Rng } from './rng'

/** Våbenfamilierne som i det originale Chicken Invaders; gavens farve viser familien. */
export const WEAPON_FAMILIES = ['blaster', 'lightning', 'laser', 'spread', 'homing'] as const
export type WeaponFamily = (typeof WEAPON_FAMILIES)[number]

export const FAMILY_COLORS: Record<WeaponFamily, string> = {
  blaster: '#ef3b4f',
  lightning: '#4aa8ff',
  laser: '#4ade80',
  spread: '#fb923c',
  homing: '#c084fc',
}

export const GIFT_SAME_FAMILY_CHANCE = 0.6
/** Haglkornene falmer efter så mange pixels. */
export const SPREAD_RANGE = 420

export type ShotKind = 'bolt' | 'ion' | 'chain' | 'beam' | 'pellet' | 'rocket'

export interface ShotSpec {
  /** Vandret forskydning fra skibets midte. */
  dx: number
  /** Radianer fra lodret; positiv peger mod højre. */
  angle: number
  damage: number
  pierce: boolean
  kind: ShotKind
  /** Lynets ekstra led efter det første mål. */
  links?: number
  /** Laserstrålens halve bredde. */
  halfWidth?: number
  /** Hvor langt haglkornet flyver. */
  range?: number
}

export interface WeaponState {
  family: WeaponFamily
  level: number
  heat: number
  overheatedUntil: number
  coolantUntil: number
  lastShotAt: number
}

const bolt = (dx: number, angle: number): ShotSpec => ({ dx, angle, damage: 1, pierce: false, kind: 'bolt' })

const BLASTER: ShotSpec[][] = [
  [bolt(0, 0)],
  [bolt(-8, 0), bolt(8, 0)],
  [bolt(0, 0), bolt(-6, -0.12), bolt(6, 0.12)],
  [bolt(0, 0), bolt(-6, -0.1), bolt(6, 0.1), bolt(-10, -0.22), bolt(10, 0.22)],
  [{ dx: 0, angle: 0, damage: 2, pierce: true, kind: 'ion' }],
]

const LASER_HALF_WIDTHS = [5, 8, 11, 14, 18]
const SPREAD_FANS = [0.32, 0.4, 0.48, 0.56, 0.64]
const ROCKETS = [1, 2, 2, 3, 4]

function spreadPattern(level: number): ShotSpec[] {
  const count = 1 + 2 * level
  const fan = SPREAD_FANS[level - 1]
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1) - 0.5
    return { dx: t * 16, angle: t * 2 * fan, damage: 1, pierce: false, kind: 'pellet' as const, range: SPREAD_RANGE }
  })
}

function homingPattern(level: number): ShotSpec[] {
  const count = ROCKETS[level - 1]
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5
    return { dx: t * 28, angle: t * 1.1, damage: 2, pierce: false, kind: 'rocket' as const }
  })
}

const PATTERNS: Record<WeaponFamily, ShotSpec[][]> = {
  blaster: BLASTER,
  lightning: [1, 2, 3, 4, 5].map((links) => [{ dx: 0, angle: 0, damage: 1, pierce: false, kind: 'chain' as const, links }]),
  laser: LASER_HALF_WIDTHS.map((halfWidth) => [{ dx: 0, angle: 0, damage: 1, pierce: true, kind: 'beam' as const, halfWidth }]),
  spread: [1, 2, 3, 4, 5].map(spreadPattern),
  homing: [1, 2, 3, 4, 5].map(homingPattern),
}

/** Sekunder mellem skud (for laseren: mellem skadetik) pr. niveau. */
const FIRE_INTERVALS: Record<WeaponFamily, number[]> = {
  blaster: [0.22, 0.2, 0.2, 0.18, 0.12],
  lightning: [0.34, 0.32, 0.3, 0.28, 0.26],
  laser: [0.16, 0.13, 0.11, 0.09, 0.075],
  spread: [0.28, 0.27, 0.26, 0.25, 0.24],
  homing: [0.5, 0.48, 0.46, 0.44, 0.42],
}

const LASER_HEAT_PER_SECOND = 60

const HEAT: Record<Exclude<WeaponFamily, 'laser'>, number[]> = {
  blaster: [HEAT_PER_SHOT, HEAT_PER_SHOT, HEAT_PER_SHOT, HEAT_PER_SHOT, ION_HEAT_PER_SHOT],
  lightning: [12, 12, 12, 12, 12],
  spread: [11, 11, 11, 11, 11],
  homing: [16, 16, 16, 16, 16],
}

const levelIndex = (level: number) => Math.min(MAX_WEAPON_LEVEL, Math.max(1, Math.round(level))) - 1

export function createWeaponState(family: WeaponFamily = 'blaster'): WeaponState {
  return { family, level: 1, heat: 0, overheatedUntil: 0, coolantUntil: 0, lastShotAt: -Infinity }
}

export function shotPattern(level: number, family: WeaponFamily = 'blaster'): ShotSpec[] {
  return PATTERNS[family][levelIndex(level)]
}

export function fireInterval(level: number, family: WeaponFamily = 'blaster'): number {
  return FIRE_INTERVALS[family][levelIndex(level)]
}

export function heatPerShot(level: number, family: WeaponFamily = 'blaster'): number {
  if (family === 'laser') return LASER_HEAT_PER_SECOND * fireInterval(level, family)
  return HEAT[family][levelIndex(level)]
}

export const heatPerSecond = (level: number, family: WeaponFamily): number => heatPerShot(level, family) / fireInterval(level, family)

export function isOverheated(weapon: WeaponState, now: number): boolean {
  return now < weapon.overheatedUntil
}

export function fire(weapon: WeaponState, now: number): ShotSpec[] | null {
  if (isOverheated(weapon, now)) return null
  if (now - weapon.lastShotAt < fireInterval(weapon.level, weapon.family) - 1e-9) return null
  weapon.lastShotAt = now
  if (now >= weapon.coolantUntil) {
    weapon.heat += heatPerShot(weapon.level, weapon.family)
    if (weapon.heat >= 100) {
      weapon.heat = 100
      weapon.overheatedUntil = now + OVERHEAT_LOCK_SECONDS
    }
  }
  return shotPattern(weapon.level, weapon.family)
}

export function coolWeapon(weapon: WeaponState, now: number, dt: number): void {
  if (isOverheated(weapon, now)) {
    weapon.heat = (100 * (weapon.overheatedUntil - now)) / OVERHEAT_LOCK_SECONDS
    return
  }
  if (weapon.overheatedUntil > 0) {
    weapon.overheatedUntil = 0
    weapon.heat = 0
    return
  }
  weapon.heat = Math.max(0, weapon.heat - HEAT_COOL_PER_SECOND * dt)
}

/** Returnerer false hvis våbnet allerede er på max, så kalderen kan give point i stedet. */
export function upgradeWeapon(weapon: WeaponState): boolean {
  if (weapon.level >= MAX_WEAPON_LEVEL) return false
  weapon.level++
  return true
}

/** Samme farve: +1 niveau ('max' når det ikke kan komme højere). Anden farve: skift familie, behold niveauet. */
export function collectGift(weapon: WeaponState, family: WeaponFamily): 'up' | 'switch' | 'max' {
  if (family !== weapon.family) {
    weapon.family = family
    return 'switch'
  }
  return upgradeWeapon(weapon) ? 'up' : 'max'
}

export function rollGiftFamily(current: WeaponFamily, rng: Rng): WeaponFamily {
  if (rng() < GIFT_SAME_FAMILY_CHANCE) return current
  const others = WEAPON_FAMILIES.filter((family) => family !== current)
  return others[Math.min(others.length - 1, Math.floor(rng() * others.length))]
}

export function downgradeWeapon(weapon: WeaponState): void {
  weapon.level = Math.max(1, weapon.level - 1)
}

export function activateCoolant(weapon: WeaponState, now: number): void {
  weapon.coolantUntil = now + COOLANT_SECONDS
  weapon.overheatedUntil = 0
  weapon.heat = 0
}
