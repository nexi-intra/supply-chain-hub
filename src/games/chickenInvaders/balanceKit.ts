import { bossVulnerable, type BossState } from './bosses'
import { campaignPosition } from './campaign'
import { DANGER_ZONE_Y, FIELD, LASER_HALF_WIDTH, SHIP_HIT_RADIUS, SHIP_MAX_Y, SHIP_MIN_Y, SHIP_POINTER_SPEED, STEP_SECONDS, type Difficulty } from './config'
import { eggRadius, ENEMY_DEFS } from './enemies'
import { createGame, stepGame, type GameEvent, type GameInput, type GameState } from './engine'
import type { WeaponFamily } from './weapons'

/**
 * Balance-bot til simulationerne (bruges ikke af spillet): undviger æg, kyllinger, meteorer og stråler ud fra
 * det, den kan se lige nu (lineær fremskrivning), sigter på det nærmeste mål og samler regn i bonusbanerne.
 */

const idle: GameInput = { left: false, right: false, up: false, down: false, fire: false, missile: false, pointerX: null, pointerY: null }
const SAMPLES = Array.from({ length: 16 }, (_, i) => i * 0.05)
const XS = Array.from({ length: 24 }, (_, i) => 30 + (i * (FIELD.width - 60)) / 23)
const YS = [SHIP_MAX_Y, SHIP_MAX_Y - 70, SHIP_MAX_Y - 150, SHIP_MAX_Y - 240]
const MARGIN = 8
/** Gaver og power-ups, som botten henter, når de falder tæt på. */
const VALUABLE: ReadonlySet<string> = new Set(['gift', 'shield', 'life', 'drone', 'slowmo', 'magnet', 'double', 'coolant', 'missile'])

interface Threat {
  /** Forudsagte positioner for hvert tidspunkt i `samples` (x, y, x, y …). */
  at: number[]
  r: number
}

const quad = (a: number, b: number, c: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c

/** Punktet ligger i kilen fra (ox, oy) mellem (ax, ay) og (bx, by), med `pad` px ekstra til begge sider. */
function insideWedge(ox: number, oy: number, ax: number, ay: number, bx: number, by: number, x: number, y: number, pad: number): boolean {
  const angle = (px: number, py: number) => Math.atan2(px - ox, py - oy)
  const a = angle(ax, ay)
  const b = angle(bx, by)
  const p = angle(x, y)
  const distance = Math.hypot(x - ox, y - oy) || 1
  const slack = Math.asin(Math.min(1, pad / distance))
  return p >= Math.min(a, b) - slack && p <= Math.max(a, b) + slack && y > oy
}

export interface Bot {
  input: (state: GameState) => GameInput
}

/** `decideEvery`: trin mellem beslutninger (reaktionstid); `horizon`: hvor langt frem den ser (s). */
export function createBot(options: { decideEvery?: number; horizon?: number } = {}): Bot {
  const decideEvery = options.decideEvery ?? 2
  const horizon = options.horizon ?? 0.7
  const samples = SAMPLES.filter((t) => t <= horizon)
  const last = new Map<number, { x: number; y: number }>()
  let step = 0
  let target = { x: FIELD.width / 2, y: SHIP_MAX_Y }
  let cooling = false
  const threats: Threat[] = []

  const linear = (x: number, y: number, vx: number, vy: number, r: number): Threat => ({ at: samples.flatMap((t) => [x + vx * t, y + vy * t]), r })

  function collect(state: GameState): void {
    threats.length = 0
    for (const egg of state.eggs) threats.push(linear(egg.x, egg.y, egg.vx, egg.vy, eggRadius(egg)))
    for (const enemy of state.enemies) {
      if (enemy.dead) continue
      if (enemy.mode === 'diving') {
        const at = samples.flatMap((t) => {
          const p = Math.min(1, enemy.pathT + t / enemy.pathDuration)
          return [quad(enemy.p0x, enemy.p1x, enemy.p2x, p), quad(enemy.p0y, enemy.p1y, enemy.p2y, p)]
        })
        threats.push({ at, r: enemy.radius })
        continue
      }
      const prev = last.get(enemy.id)
      const vx = prev ? (enemy.x - prev.x) / STEP_SECONDS : enemy.vx
      const vy = prev ? (enemy.y - prev.y) / STEP_SECONDS : enemy.vy
      threats.push(linear(enemy.x, enemy.y, vx, vy, enemy.radius))
    }
    last.clear()
    for (const enemy of state.enemies) last.set(enemy.id, { x: enemy.x, y: enemy.y })
    const boss = state.boss
    if (boss && boss.halfWidth > 0 && !boss.hidden) threats.push(linear(boss.x, boss.y, 0, 0, Math.max(boss.halfWidth, boss.halfHeight) * 0.85))
  }

  function beamDanger(boss: BossState, x: number, y: number): number {
    let danger = 0
    if (boss.laser.state !== 'idle' && Math.abs(x - boss.laser.x) < LASER_HALF_WIDTH + SHIP_HIT_RADIUS + MARGIN && y > boss.y) danger += boss.laser.state === 'firing' ? 6 : 2
    for (const beam of boss.beams) {
      const reach = beam.halfWidth + SHIP_HIT_RADIUS + MARGIN
      if (beam.sweep) {
        // Den fejende stråles kile er varslet; spilleren holder sig ude af hele kilen.
        if (insideWedge(beam.ox, beam.oy, beam.x, beam.y, beam.toX, beam.toY, x, y, reach)) danger += beam.state === 'firing' ? 6 : 3
        continue
      }
      const sx = beam.x - beam.ox
      const sy = beam.y - beam.oy
      const length2 = sx * sx + sy * sy || 1
      const t = Math.max(0, Math.min(1, ((x - beam.ox) * sx + (y - beam.oy) * sy) / length2))
      if ((x - beam.ox - sx * t) ** 2 + (y - beam.oy - sy * t) ** 2 <= reach * reach) danger += beam.state === 'firing' ? 6 : 2
    }
    return danger
  }

  function danger(state: GameState, x: number, y: number): number {
    const { ship } = state
    const dx = x - ship.x
    const dy = y - ship.y
    const distance = Math.hypot(dx, dy) || 1
    let total = 0
    for (let s = 0; s < samples.length; s++) {
      const t = samples[s]
      const move = Math.min(distance, SHIP_POINTER_SPEED * t)
      const sx = ship.x + (dx / distance) * move
      const sy = ship.y + (dy / distance) * move
      for (const threat of threats) {
        const tx = threat.at[2 * s] - sx
        const ty = threat.at[2 * s + 1] - sy
        const reach = threat.r + SHIP_HIT_RADIUS + MARGIN
        if (tx * tx + ty * ty < reach * reach) total += 1 / (t + 0.1)
      }
    }
    // Stråler og lasere er varslede og dødelige; dem undviger man før alt andet.
    if (state.boss) total += beamDanger(state.boss, x, y) * 10
    total += warningDanger(state, x, y)
    return total
  }

  /** Spilleren ser varslerne: kometernes stiplede bane og asteroidebæltets baner. */
  function warningDanger(state: GameState, x: number, y: number): number {
    let total = 0
    for (const warning of state.hazard?.warnings ?? []) {
      if (state.time > (warning.end ?? warning.until) + 0.3) continue
      if (warning.kind === 'lane') {
        if (Math.abs(y - warning.y) < 30 + SHIP_HIT_RADIUS + MARGIN) total += 4
        continue
      }
      const along = (x - warning.x) * warning.dirX + (y - warning.y) * warning.dirY
      if (along < 0) continue
      const px = warning.x + warning.dirX * along - x
      const py = warning.y + warning.dirY * along - y
      if (px * px + py * py < (20 + SHIP_HIT_RADIUS + MARGIN) ** 2) total += 4
    }
    return total
  }

  function aimX(state: GameState): number | null {
    const boss = state.boss
    if (state.bonus?.stage === 'drumstickRain' || state.bonus?.stage === 'eggDodge') return null
    if (boss && !boss.entering && bossVulnerable(boss)) return boss.x
    let best: number | null = null
    let bestScore = Infinity
    for (const enemy of state.enemies) {
      if (enemy.dead || enemy.y < 0 || enemy.x < 0 || enemy.x > FIELD.width) continue
      const required = ENEMY_DEFS[enemy.kind].requiredForClear || enemy.kind === 'bossPart'
      const score = Math.abs(enemy.x - state.ship.x) - enemy.y * 0.3 + (required ? 0 : 200)
      if (score < bestScore) {
        bestScore = score
        const flight = Math.max(0, state.ship.y - enemy.y) / 720
        best = enemy.x + (enemy.dx / STEP_SECONDS) * flight
      }
    }
    return best
  }

  function rainTarget(state: GameState, kinds?: ReadonlySet<string>): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null
    let bestArrival = Infinity
    for (const pickup of state.pickups) {
      if (kinds && !kinds.has(pickup.kind)) continue
      const arrival = (SHIP_MAX_Y - pickup.y) / Math.max(1, pickup.vy)
      if (arrival < 0 || (kinds && arrival > 1.6)) continue
      const reachable = Math.abs(pickup.x - state.ship.x) / SHIP_POINTER_SPEED <= arrival + 0.1
      if (reachable && arrival < bestArrival) {
        bestArrival = arrival
        best = { x: pickup.x, y: SHIP_MAX_Y }
      }
    }
    return best
  }

  function decide(state: GameState): void {
    collect(state)
    const rain = state.bonus?.stage === 'drumstickRain' ? rainTarget(state) : state.bonus ? null : rainTarget(state, VALUABLE)
    const aim = rain ? rain.x : aimX(state)
    let best = target
    let bestScore = Infinity
    for (const y of YS) {
      for (const x of XS) {
        const score = danger(state, x, y) * 1000 + (aim === null ? Math.abs(x - state.ship.x) * 0.05 : Math.abs(x - aim) * 0.6) + (SHIP_MAX_Y - y) * 0.4
        if (score < bestScore) {
          bestScore = score
          best = { x, y }
        }
      }
    }
    // Står det valgte felt lige under målet, sigtes der præcis i stedet for på gitteret.
    if (aim !== null && Math.abs(best.x - aim) < XS[1] - XS[0] && danger(state, aim, best.y) === 0) best = { x: aim, y: best.y }
    target = best
  }

  return {
    input(state) {
      if (step++ % decideEvery === 0) decide(state)
      if (state.weapon.heat > 92) cooling = true
      else if (state.weapon.heat < 45) cooling = false
      return { ...idle, fire: !cooling, pointerX: target.x, pointerY: Math.max(SHIP_MIN_Y, target.y) }
    },
  }
}

export interface WaveResult {
  wave: number
  sector: number
  round: number
  slotType: string
  templateId: string
  seconds: number
  hits: number
  /** Våbenniveau ved bølgestart. */
  level: number
  /** Hvad der ramte: 'egg:aimed', 'hen', 'meteor', 'boss', 'beam', 'invasion' … */
  causes: Record<string, number>
  timedOut: boolean
  bonus?: { stage: string; collected: number; possible: number; perfect: boolean; missed: boolean }
}

export interface RunOptions {
  difficulty: Difficulty
  seed: number
  /** Våben pr. sektor (0-baseret): familien håndhæves altid; uden `level` stiger og falder niveauet som i spillet. */
  weapon: (sector: number) => { family: WeaponFamily; level?: number }
  fromWave?: number
  toWave: number
  /** Bølgen opgives (ryddes) efter så mange sekunder. */
  waveLimit?: number
  /** Trin mellem bottens beslutninger: 2 = skarp, 9 ≈ menneskelig reaktionstid (150 ms). */
  reaction?: number
}

/** Spiller kampagnen med botten uden at dø: liv fyldes op, træf tælles pr. bølge. */
export function runCampaign(options: RunOptions): WaveResult[] {
  const { difficulty, seed, toWave, waveLimit = 180 } = options
  const state = createGame(difficulty, { seed })
  const bot = createBot({ decideEvery: options.reaction })
  const results: WaveResult[] = []
  const skip = (options.fromWave ?? 1) - 1
  if (skip > 0) {
    state.wave = skip
    state.awaitingWave = true
    state.transitionUntil = 0
    state.enemies = []
    state.boss = null
    state.hazard = null
    state.meteorsToSpawn = 0
    state.bonus = null
    state.pendingEvents = []
  }
  let current: WaveResult | null = null
  const finish = () => {
    if (current) results.push(current)
    current = null
  }
  const begin = () => {
    const spec = state.spec
    const position = campaignPosition(state.wave)
    current = { wave: state.wave, sector: position.sector, round: position.round, slotType: spec.slotType, templateId: spec.templateId, seconds: 0, hits: 0, level: state.weapon.level, causes: {}, timedOut: false }
  }
  let startedAt = state.time
  const maxSteps = Math.round(((toWave - skip) * (waveLimit + 8)) / STEP_SECONDS)
  for (let i = 0; i < maxSteps && state.status === 'playing'; i++) {
    const position = campaignPosition(Math.max(1, state.wave))
    const weapon = options.weapon(position.sector)
    state.weapon.family = weapon.family
    if (weapon.level !== undefined) state.weapon.level = weapon.level
    state.lives = 5
    const before = snapshot(state)
    const events = stepGame(state, bot.input(state))
    for (const event of events) handle(event, before)
    if (current && !state.awaitingWave && state.time - startedAt > waveLimit) {
      ;(current as WaveResult).timedOut = true
      for (const enemy of state.enemies) enemy.dead = true
      state.enemies = []
      state.boss = null
      state.meteorsToSpawn = 0
      if (state.hazard) state.hazard.queue = []
    }
    if (state.wave > toWave) break
  }
  finish()
  return results.filter((result) => result.wave <= toWave)

  function handle(event: GameEvent, before: Snapshot): void {
    if (event.type === 'waveStart') {
      finish()
      begin()
      startedAt = state.time
      return
    }
    if (!current) return
    if (event.type === 'playerHit' || event.type === 'shieldBlock') {
      current.hits++
      const cause = hitCause(state, before)
      current.causes[cause] = (current.causes[cause] ?? 0) + 1
    }
    if (event.type === 'waveClear' || event.type === 'bonusResult') current.seconds = state.time - startedAt
    if (event.type === 'bonusMiss' && event.first) current.bonus = { stage: 'eggDodge', collected: 0, possible: 0, perfect: false, missed: true }
    if (event.type === 'bonusResult') {
      current.bonus = { stage: event.stage, collected: event.collected, possible: event.possible, perfect: event.perfect, missed: current.bonus?.missed ?? false }
    }
  }
}

/** Sekunder til en boss-bølge er ryddet med botten (Infinity ved timeout). */
export function bossSeconds(results: WaveResult[]): number[] {
  return results.filter((result) => result.slotType === 'boss' || result.slotType === 'miniboss').map((result) => (result.timedOut ? Infinity : result.seconds))
}

interface Snapshot {
  eggs: { x: number; y: number; r: number; kind: string }[]
  enemies: { x: number; y: number; r: number; kind: string }[]
}

function snapshot(state: GameState): Snapshot {
  return {
    eggs: state.eggs.map((egg) => ({ x: egg.x + egg.vx * STEP_SECONDS, y: egg.y + egg.vy * STEP_SECONDS, r: eggRadius(egg), kind: egg.kind ?? 'egg' })),
    enemies: state.enemies.map((e) => ({ x: e.x, y: e.y, r: e.radius + 6, kind: `${e.kind}:${e.kind === 'meteor' ? e.meteorType : e.mode}` })),
  }
}

function hitCause(state: GameState, before: Snapshot): string {
  const { ship } = state
  const near = (x: number, y: number, r: number) => (x - ship.x) ** 2 + (y - ship.y) ** 2 <= (r + SHIP_HIT_RADIUS + 4) ** 2
  const egg = before.eggs.find((e) => near(e.x, e.y, e.r))
  if (egg) return `egg:${egg.kind}:${state.spec.templateId}`
  const enemy = before.enemies.find((e) => near(e.x, e.y, e.r))
  if (enemy) return enemy.kind
  const boss = state.boss
  if (boss) {
    if (boss.beams.some((beam) => beam.state === 'firing')) return `beam:${boss.id}`
    if (boss.laser.state === 'firing') return 'laser:motherHen'
    return `boss:${boss.id}`
  }
  if (state.hazard?.blackHole) return 'blackHole'
  if (state.enemies.some((e) => e.mode === 'formation' && e.y + e.radius >= DANGER_ZONE_Y - 2)) return 'invasion'
  return `other:${state.spec.templateId}`
}
