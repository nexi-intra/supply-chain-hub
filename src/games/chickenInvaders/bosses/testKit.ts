import { STEP_SECONDS, type Difficulty } from '../config'
import { createGame, startWave, stepGame, type GameEvent, type GameInput, type GameState } from '../engine'

/** Hjælpere til boss-testene (bruges ikke af spillet). */
export const idle: GameInput = { left: false, right: false, up: false, down: false, fire: false, missile: false, pointerX: null, pointerY: null }

/** Kampagnebølgen for hver boss og mini-boss i første runde. */
export const BOSS_WAVES = {
  eggTrio: 6,
  motherHen: 8,
  chickenCruiser: 14,
  eggeroid: 16,
  ufoMothership: 22,
  iceQueen: 24,
  eggTrioFire: 30,
  roboRooster: 32,
  chickenCruiserMk2: 38,
  galacticRooster: 40,
} as const
export type BossKey = keyof typeof BOSS_WAVES

export function run(state: GameState, seconds: number, input: Partial<GameInput> | ((state: GameState) => Partial<GameInput>) = {}): GameEvent[] {
  const events: GameEvent[] = []
  const steps = Math.round(seconds / STEP_SECONDS)
  for (let i = 0; i < steps && state.status === 'playing'; i++) {
    const extra = typeof input === 'function' ? input(state) : input
    events.push(...stepGame(state, { ...idle, ...extra }))
  }
  return events
}

export const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type)

/** Starter boss-bølgen uden bølgeflow, så bossen kan testes alene. */
export function bossGame(key: BossKey, difficulty: Difficulty = 'medium', seed = 3): GameState {
  const state = createGame(difficulty, { seed })
  stepGame(state, idle)
  state.pendingEvents = []
  startWave(state, BOSS_WAVES[key])
  state.transitionUntil = Infinity
  state.flybys = []
  state.goldenAt = Infinity
  return state
}

/** Kører indflyvningen færdig med skibet nederst i et hjørne. */
export function readyBoss(state: GameState): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < 600 && state.boss?.entering; i++) events.push(...stepGame(state, idle))
  return events
}

export function allFinite(state: GameState): boolean {
  const boss = state.boss
  const values = [
    state.ship.x,
    state.ship.y,
    ...state.enemies.flatMap((enemy) => [enemy.x, enemy.y, enemy.vx, enemy.vy, enemy.hp]),
    ...state.eggs.flatMap((egg) => [egg.x, egg.y, egg.vx, egg.vy]),
    ...state.pickups.flatMap((pickup) => [pickup.x, pickup.y]),
    ...(boss ? [boss.x, boss.y, boss.health, boss.maxHealth, ...boss.beams.flatMap((beam) => [beam.ox, beam.oy, beam.x, beam.y])] : []),
  ]
  return values.every(Number.isFinite)
}
