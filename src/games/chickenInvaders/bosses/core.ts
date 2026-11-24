import { BOSS_ENTER_SECONDS, DIFFICULTY_SETTINGS, MISSILE_BOSS_DAMAGE_RATIO, type Difficulty } from '../config'
import type { Egg, Enemy, GameEvent, GameState, PickupKind } from '../engine'
import type { EnemyKind, FlybyKind } from '../enemies'
import type { MeteorType } from '../hazards'
import type { WeaponFamily } from '../weapons'

export const BOSS_IDS = ['motherHen', 'eggeroid', 'iceQueen', 'roboRooster', 'galacticRooster'] as const
export const MINI_BOSS_IDS = ['eggTrio', 'chickenCruiser', 'ufoMothership'] as const
export const ALL_BOSS_IDS = [...BOSS_IDS, ...MINI_BOSS_IDS] as const
export type MainBossId = (typeof BOSS_IDS)[number]
export type MiniBossId = (typeof MINI_BOSS_IDS)[number]
export type BossId = MainBossId | MiniBossId
export type BossPhase = 1 | 2 | 3

/** Mor Hønes egen laser (uændret fra før registret). */
export interface BossLaser {
  state: 'idle' | 'warning' | 'firing'
  x: number
  until: number
}

/** Et angreb: først et varsel (`charge`), så den aktive del (`duration`, 0 = ét salve). */
export interface BossAttack {
  kind: string
  stage: 'charge' | 'active'
  t: number
  charge: number
  duration: number
  /** Sigtepunkt, destination eller kilde – angrebet bestemmer. */
  x: number
  y: number
  /** Vinkel, retning eller tæller til gentagne salver. */
  a: number
  n: number
  next: number
  /** Id på den høne/det tårn, der skyder (0 = bossen selv). */
  source: number
}

export type BeamStyle = 'frost' | 'red' | 'plasma'

/** En varslet stråle fra (ox, oy) til (x, y); en fejende stråle flytter enden mod (toX, toY), mens den skyder. */
export interface BossBeam {
  ox: number
  oy: number
  x: number
  y: number
  toX: number
  toY: number
  halfWidth: number
  state: 'warning' | 'firing'
  t: number
  warn: number
  fire: number
  sweep: boolean
  style: BeamStyle
}

export interface BossState {
  id: BossId
  /** 1 = Ild-trioen eller Krydseren MK II. */
  variant: number
  mini: boolean
  level: number
  round: number
  difficulty: Difficulty
  maxHealth: number
  health: number
  phase: BossPhase
  x: number
  y: number
  homeY: number
  /** Kroppens elliptiske hitbox; 0 = ingen krop (Ægge-trioen). */
  halfWidth: number
  halfHeight: number
  dir: 1 | -1
  time: number
  entering: boolean
  nextVolleyAt: number
  nextChicksAt: number
  nextLaserAt: number
  laser: BossLaser
  nextAttackAt: number
  cycle: number
  attack: BossAttack | null
  beams: BossBeam[]
  /** Tårne og høns, der er en del af bossen (fjender med kind 'bossPart'). */
  parts: number[]
  /** Indkaldte hjælpere, der ryddes når bossen falder. */
  minions: number[]
  /** Kernen kan ikke rammes (Robo-Hanens skjold, Krydserens pansrede skrog). */
  shielded: boolean
  /** Usynlig midt i en teleport. */
  hidden: boolean
  /** 0–1: det sorte huls sug. */
  pull: number
  /** Snestormens vind: -1, 0 eller 1. */
  wind: number
  spin: number
  /** Våbenniveauer UFO-moderskibet har stjålet. */
  stolen: number
}

/** Motorens hjælpere til bosserne. */
export interface BossWorld {
  state: GameState
  boss: BossState
  events: GameEvent[]
  egg: (x: number, y: number, vx: number, vy: number, kind?: Egg['kind']) => Egg
  spawn: (kind: EnemyKind, x: number, y: number, options?: { vx?: number; vy?: number; large?: boolean; meteorType?: MeteorType }) => Enemy
  flyby: (kind: FlybyKind) => Enemy
  chicks: (count: number, x: number, y: number) => void
  drop: (kind: PickupKind, x: number, y: number, family?: WeaponFamily) => void
}

export interface AttackSpec {
  /** Grundvarsel i sekunder (skaleres af sværhedsgrad og runde). */
  charge: number
  duration?: number
  /** Pause efter angrebet, før skalering med tempoet. */
  cooldown: number
  /** Bossen står stille under angrebet. */
  hold?: boolean
  begin?: (w: BossWorld, a: BossAttack) => void
  fire?: (w: BossWorld, a: BossAttack) => void
  tick?: (w: BossWorld, a: BossAttack, dt: number) => void
  end?: (w: BossWorld, a: BossAttack) => void
}

export type Pattern = Record<BossPhase, readonly string[]>
export type AttackTable = Record<string, AttackSpec>

export const MIN_TELEGRAPH = 0.4
const TELEGRAPH_SCALE: Record<Difficulty, number> = { easy: 1.25, medium: 1, hard: 0.88, expert: 0.78 }
const PACE: Record<Difficulty, number> = { easy: 0.72, medium: 1, hard: 1.15, expert: 1.3 }

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Varslets længde: kortere på de svære niveauer og i Nyt+, men aldrig under 0,4 s. */
export function telegraphSeconds(base: number, difficulty: Difficulty, round: number): number {
  return Math.max(MIN_TELEGRAPH, base * TELEGRAPH_SCALE[difficulty] * (1 - 0.06 * Math.min(round, 4)))
}

export const pace = (boss: BossState) => PACE[boss.difficulty] * (1 + 0.2 * Math.min(boss.round, 4))

export function scaledHealth(difficulty: Difficulty, round: number, factor: number): number {
  return Math.round(DIFFICULTY_SETTINGS[difficulty].bossHealth * factor * (1 + 0.5 * round))
}

export function bossPhase(health: number, maxHealth: number): BossPhase {
  const ratio = health / maxHealth
  if (ratio > 2 / 3) return 1
  if (ratio > 1 / 3) return 2
  return 3
}

/** Ny fase starter angrebsrækken forfra, så fasens kendetegn kommer først. */
export function damageBoss(boss: BossState, amount: number): { defeated: boolean; phaseChanged: boolean } {
  boss.health = Math.max(0, boss.health - amount)
  const phase = bossPhase(boss.health, boss.maxHealth)
  const phaseChanged = phase !== boss.phase
  boss.phase = phase
  if (phaseChanged) boss.cycle = 0
  return { defeated: boss.health <= 0, phaseChanged }
}

export function missileDamage(boss: BossState): number {
  return Math.max(1, Math.round(boss.maxHealth * MISSILE_BOSS_DAMAGE_RATIO))
}

export interface BossSetup {
  id: BossId
  mini: boolean
  variant: number
  level: number
  round: number
  difficulty: Difficulty
  maxHealth: number
  halfWidth: number
  halfHeight: number
  homeY: number
  x: number
  y?: number
}

export function newBossState(setup: BossSetup): BossState {
  const { halfWidth, halfHeight, homeY, maxHealth, x, ...rest } = setup
  return {
    ...rest,
    maxHealth,
    health: maxHealth,
    phase: 1,
    x,
    y: setup.y ?? -Math.max(60, halfHeight) * 2,
    homeY,
    halfWidth,
    halfHeight,
    dir: 1,
    time: 0,
    entering: true,
    nextVolleyAt: Infinity,
    nextChicksAt: Infinity,
    nextLaserAt: Infinity,
    laser: { state: 'idle', x: 0, until: 0 },
    nextAttackAt: Infinity,
    cycle: 0,
    attack: null,
    beams: [],
    parts: [],
    minions: [],
    shielded: false,
    hidden: false,
    pull: 0,
    wind: 0,
    spin: 0,
    stolen: 0,
  }
}

export const hasBody = (boss: BossState) => boss.halfWidth > 0

/** Kan ses og sigtes på (lyn, raketter, laser); skjoldet stopper stadig skaden. */
export const bossTargetable = (boss: BossState) => hasBody(boss) && !boss.entering && !boss.hidden

export const bossVulnerable = (boss: BossState) => bossTargetable(boss) && !boss.shielded

function insideEllipse(boss: BossState, x: number, y: number, padX: number, padY: number): boolean {
  const bx = (x - boss.x) / (boss.halfWidth + padX)
  const by = (y - boss.y) / (boss.halfHeight + padY)
  return bx * bx + by * by <= 1
}

/** Skuddet rammer kroppen (også når den er skærmet, så skuddet prelle af). */
export function projectileHitsBoss(boss: BossState, x: number, y: number): boolean {
  return hasBody(boss) && !boss.hidden && insideEllipse(boss, x, y, 0, 0)
}

export function touchesBoss(boss: BossState, x: number, y: number, radius: number): boolean {
  return hasBody(boss) && !boss.entering && !boss.hidden && insideEllipse(boss, x, y, radius * 0.5, radius * 0.5)
}

/** Lynets og rakettens mål: punktet på bossens underside nærmest x. */
export function bossAimPoint(boss: BossState, x: number): { x: number; y: number } | null {
  if (!bossVulnerable(boss)) return null
  return { x: clamp(x, boss.x - boss.halfWidth * 0.6, boss.x + boss.halfWidth * 0.6), y: boss.y + boss.halfHeight * 0.5 }
}

export function enterFromTop(boss: BossState): void {
  const from = -Math.max(60, boss.halfHeight) * 2
  const t = Math.min(1, boss.time / BOSS_ENTER_SECONDS)
  boss.y = from + (boss.homeY - from) * (1 - (1 - t) ** 3)
  if (t < 1) return
  boss.y = boss.homeY
  boss.entering = false
}

// ---------------------------------------------------------------- Stråler

export function beamEnd(beam: BossBeam): { x: number; y: number } {
  if (!beam.sweep || beam.state === 'warning') return { x: beam.x, y: beam.y }
  const p = clamp((beam.t - beam.warn) / beam.fire, 0, 1)
  return { x: beam.x + (beam.toX - beam.x) * p, y: beam.y + (beam.toY - beam.y) * p }
}

export function beamHits(beam: BossBeam, x: number, y: number, radius: number): boolean {
  if (beam.state !== 'firing') return false
  const end = beamEnd(beam)
  const dx = end.x - beam.ox
  const dy = end.y - beam.oy
  const length2 = dx * dx + dy * dy || 1
  const t = clamp(((x - beam.ox) * dx + (y - beam.oy) * dy) / length2, 0, 1)
  const reach = beam.halfWidth + radius * 0.75
  return (x - beam.ox - dx * t) ** 2 + (y - beam.oy - dy * t) ** 2 <= reach * reach
}

export function addBeam(boss: BossState, beam: Omit<BossBeam, 'state' | 't' | 'toX' | 'toY' | 'sweep'> & Partial<Pick<BossBeam, 'toX' | 'toY' | 'sweep'>>): BossBeam {
  const full: BossBeam = { toX: beam.x, toY: beam.y, sweep: false, ...beam, state: 'warning', t: 0 }
  boss.beams.push(full)
  return full
}

export function updateBeams(boss: BossState, dt: number): void {
  if (boss.beams.length === 0) return
  for (const beam of boss.beams) {
    beam.t += dt
    if (beam.state === 'warning' && beam.t >= beam.warn) beam.state = 'firing'
  }
  boss.beams = boss.beams.filter((beam) => beam.t < beam.warn + beam.fire)
}

// ---------------------------------------------------------------- Tårne, høns og hjælpere

/** Variant-koder for bossens dele (`Enemy.variant`). */
export const PART = { turret: 10, trio: 11, trioFire: 12, cruiser: 13 } as const

export function spawnPart(w: BossWorld, x: number, y: number, hp: number, radius: number, variant: number): Enemy {
  const part = w.spawn('bossPart', x, y)
  part.hp = part.maxHp = hp
  part.radius = radius
  part.variant = variant
  w.boss.parts.push(part.id)
  return part
}

const living = (state: GameState, ids: readonly number[]) => (ids.length === 0 ? [] : state.enemies.filter((enemy) => !enemy.dead && ids.includes(enemy.id)))

export const livingParts = (state: GameState, boss: BossState): Enemy[] => living(state, boss.parts)
export const livingMinions = (state: GameState, boss: BossState): Enemy[] => living(state, boss.minions)

export function placePart(part: Enemy, x: number, y: number): void {
  part.dx = x - part.x
  part.x = x
  part.y = y
}

// ---------------------------------------------------------------- Angrebsrækken

/** Starter, varsler, affyrer og afslutter fasens angreb i fast rækkefølge. */
export function runAttacks(w: BossWorld, pattern: Pattern, attacks: AttackTable, dt: number): void {
  const { boss } = w
  let a = boss.attack
  if (!a) {
    if (boss.time < boss.nextAttackAt) return
    const list = pattern[boss.phase]
    const kind = list[boss.cycle % list.length]
    boss.cycle++
    const spec = attacks[kind]
    a = { kind, stage: 'charge', t: 0, charge: telegraphSeconds(spec.charge, boss.difficulty, boss.round), duration: spec.duration ?? 0, x: boss.x, y: boss.y, a: 0, n: 0, next: 0, source: 0 }
    boss.attack = a
    spec.begin?.(w, a)
    w.events.push({ type: 'bossCharge', boss: boss.id, attack: kind, x: a.x, y: a.y, seconds: a.charge })
    return
  }
  const spec = attacks[a.kind]
  a.t += dt
  if (a.stage === 'charge') {
    if (a.t < a.charge) return
    a.stage = 'active'
    spec.fire?.(w, a)
  } else {
    spec.tick?.(w, a, dt)
  }
  if (boss.attack !== a || a.t < a.charge + a.duration) return
  spec.end?.(w, a)
  boss.attack = null
  boss.nextAttackAt = boss.time + spec.cooldown / pace(boss)
}

export function holding(boss: BossState, attacks: AttackTable): boolean {
  return !!boss.attack && !!attacks[boss.attack.kind]?.hold
}

export interface StepOptions {
  move: (w: BossWorld, dt: number) => void
  /** Flytter tårne/høns med bossen; kører også under indflyvningen. */
  place?: (w: BossWorld, dt: number) => void
  enter?: (boss: BossState) => void
}

/** Fælles takt for de nye bosser: tid, stråler, indflyvning, bevægelse og angreb. */
export function stepBoss(w: BossWorld, pattern: Pattern, attacks: AttackTable, dt: number, options: StepOptions): void {
  const { boss } = w
  boss.time += dt
  updateBeams(boss, dt)
  if (boss.entering) {
    ;(options.enter ?? enterFromTop)(boss)
    options.place?.(w, dt)
    if (!boss.entering) boss.nextAttackAt = boss.time + 0.9
    return
  }
  if (!holding(boss, attacks)) options.move(w, dt)
  options.place?.(w, dt)
  runAttacks(w, pattern, attacks, dt)
}

/** Side til side mellem kanterne; vender ved `margin` fra kanten. */
export function sway(boss: BossState, speed: number, dt: number, min: number, max: number): void {
  boss.x += boss.dir * speed * dt
  if (boss.x <= min) {
    boss.x = min
    boss.dir = 1
  } else if (boss.x >= max) {
    boss.x = max
    boss.dir = -1
  }
}
