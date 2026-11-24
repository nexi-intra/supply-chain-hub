import { FIELD } from './config'
import type { GameEvent } from './engine'
import type { PrismLabels } from './labels'

export interface Shard {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  spin: number
  colorIndex: number
  points: Array<[number, number]>
  life: number
  maxLife: number
  bounced: boolean
}

export interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

export interface Ring {
  x: number
  y: number
  life: number
  maxLife: number
  radius: number
  color: string
}

export interface PrismBurst {
  x: number
  y: number
  life: number
  maxLife: number
  angle: number
}

export interface FloatingText {
  text: string
  x: number
  y: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

export interface PrismBanner {
  title: string
  subtitle?: string
  tone: 'normal' | 'good' | 'bad'
  life: number
  maxLife: number
}

export interface PrismEffects {
  shards: Shard[]
  sparks: Spark[]
  rings: Ring[]
  prisms: PrismBurst[]
  texts: FloatingText[]
  banner: PrismBanner | null
  trails: Map<number, Array<{ x: number; y: number }>>
  hits: Map<number, number>
  shake: number
  flash: number
  flashColor: string
  paddleFlash: number
  hitStop: number
  reducedMotion: boolean
  rng: () => number
}

export const MAX_SHARDS = 420
const MAX_SPARKS = 400
const MAX_TEXTS = 24
const TRAIL_LENGTH = 12
const GRAVITY = 900
const FLOOR_Y = FIELD.height - 3
const REDUCED_FACTOR = 0.4
const REDUCED_FLASH_MAX = 0.2
const HIT_FLASH_SECONDS = 0.14
const SHARDS_PER_KIND = { glass: 14, armored: 18, crystal: 22, reactor: 16 } as const
const POWER_COLORS: Record<string, string> = {
  wide: '#67e8c1', multiball: '#72d6f5', fireball: '#ff9f43', laser: '#ff7e79',
  magnet: '#b69cff', slow: '#9fd8ff', shield: '#7fb8ff', life: '#7ee787',
}

export function createPrismEffects(options: { reducedMotion: boolean; rng?: () => number }): PrismEffects {
  return {
    shards: [],
    sparks: [],
    rings: [],
    prisms: [],
    texts: [],
    banner: null,
    trails: new Map(),
    hits: new Map(),
    shake: 0,
    flash: 0,
    flashColor: '#ffffff',
    paddleFlash: 0,
    hitStop: 0,
    reducedMotion: options.reducedMotion,
    rng: options.rng ?? Math.random,
  }
}

function count(fx: PrismEffects, base: number): number {
  return Math.max(1, Math.round(base * (fx.reducedMotion ? REDUCED_FACTOR : 1)))
}

function shatter(fx: PrismEffects, x: number, y: number, colorIndex: number, amount: number): void {
  const { rng } = fx
  for (let i = 0; i < count(fx, amount); i++) {
    const angle = rng() * Math.PI * 2
    const speed = 80 + rng() * 240
    const size = 4 + rng() * 8
    const life = 1.6 + rng() * 1
    fx.shards.push({
      x: x + (rng() - 0.5) * 30,
      y: y + (rng() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 70,
      rotation: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 14,
      colorIndex,
      points: [
        [-size * (0.4 + rng() * 0.6), -size * (0.3 + rng() * 0.5)],
        [size * (0.4 + rng() * 0.6), -size * (0.2 + rng() * 0.4)],
        [(rng() - 0.5) * size, size * (0.5 + rng() * 0.6)],
      ],
      life,
      maxLife: life,
      bounced: false,
    })
  }
  if (fx.shards.length > MAX_SHARDS) fx.shards.splice(0, fx.shards.length - MAX_SHARDS)
}

function sparks(fx: PrismEffects, x: number, y: number, amount: number, colors: string[], speed: number): void {
  const { rng } = fx
  for (let i = 0; i < count(fx, amount); i++) {
    const angle = rng() * Math.PI * 2
    const life = 0.25 + rng() * 0.35
    fx.sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed * (0.3 + rng() * 0.7),
      vy: Math.sin(angle) * speed * (0.3 + rng() * 0.7),
      life,
      maxLife: life,
      color: colors[Math.floor(rng() * colors.length)],
      size: 1.5 + rng() * 2,
    })
  }
  if (fx.sparks.length > MAX_SPARKS) fx.sparks.splice(0, fx.sparks.length - MAX_SPARKS)
}

function text(fx: PrismEffects, value: string, x: number, y: number, color: string, size = 17): void {
  fx.texts.push({ text: value, x, y, vy: -44, life: 1, maxLife: 1, color, size })
  if (fx.texts.length > MAX_TEXTS) fx.texts.splice(0, fx.texts.length - MAX_TEXTS)
}

function shake(fx: PrismEffects, amount: number): void {
  if (!fx.reducedMotion) fx.shake = Math.max(fx.shake, amount)
}

function flash(fx: PrismEffects, amount: number, color = '#ffffff'): void {
  fx.flash = Math.max(fx.flash, fx.reducedMotion ? Math.min(amount, REDUCED_FLASH_MAX) : amount)
  fx.flashColor = color
}

export function applyPrismEvents(fx: PrismEffects, events: GameEvent[], labels: PrismLabels): void {
  let chainAnnounced = false
  const breaks = events.filter((event): event is Extract<GameEvent, { type: 'brickBreak' }> => event.type === 'brickBreak')
  const aggregateBreaks = breaks.length > 2
  for (const event of events) {
    switch (event.type) {
      case 'brickBreak': {
        shatter(fx, event.x, event.y, event.colorIndex, SHARDS_PER_KIND[event.kind])
        sparks(fx, event.x, event.y, event.kind === 'crystal' ? 18 : 6, ['#ffffff', '#e8fbff'], 260)
        if (event.kind === 'crystal') {
          fx.prisms.push({ x: event.x, y: event.y, life: 1.2, maxLife: 1.2, angle: fx.rng() * Math.PI * 2 })
          shake(fx, 4)
        }
        const total = event.points * event.multiplier
        const suffix = event.multiplier > 1 ? ` ×${event.multiplier}` : ''
        if (!aggregateBreaks) text(fx, `+${labels.points(total)}${suffix}`, event.x, event.y - 8, event.multiplier > 1 ? '#ffd166' : '#f2fbff', event.kind === 'crystal' ? 22 : 17)
        shake(fx, 1.5)
        break
      }
      case 'brickHit':
        fx.hits.set(event.id, HIT_FLASH_SECONDS)
        sparks(fx, event.x, event.y, 4, ['#ffffff', '#cfefff'], 180)
        break
      case 'explosion':
        fx.rings.push({ x: event.x, y: event.y, life: 0.55, maxLife: 0.55, radius: 115, color: '#ff9f43' })
        sparks(fx, event.x, event.y, 26, ['#ffd166', '#ff9f43', '#ffffff'], 380)
        shake(fx, 7)
        flash(fx, 0.22, '#ffb36b')
        fx.hitStop = Math.max(fx.hitStop, 0.05)
        if (!chainAnnounced) {
          chainAnnounced = true
          text(fx, labels.chainReaction, event.x, event.y - 26, '#ffb36b', 22)
        }
        break
      case 'paddleHit':
        fx.paddleFlash = 1
        sparks(fx, event.x, event.y + 6, 5, ['#ffffff', '#67e8c1', '#72d6f5'], 160)
        break
      case 'wallHit':
        sparks(fx, event.x, event.y, 3, ['#cfefff'], 120)
        break
      case 'shieldBlock':
        fx.rings.push({ x: event.x, y: event.y, life: 0.5, maxLife: 0.5, radius: 70, color: '#7fb8ff' })
        text(fx, labels.shieldHeld, event.x, event.y - 30, '#9fd0ff')
        shake(fx, 4)
        break
      case 'pickup':
        sparks(fx, event.x, event.y, 12, [POWER_COLORS[event.kind], '#ffffff'], 170)
        text(fx, labels.powers[event.kind], event.x, event.y - 22, POWER_COLORS[event.kind], 18)
        break
      case 'lifeLost':
        shake(fx, 10)
        flash(fx, 0.5, '#ff6178')
        text(fx, labels.lifeLost, FIELD.width / 2, FIELD.height - 120, '#ff8a9c', 22)
        break
      case 'extraLife':
        text(fx, labels.extraLife, FIELD.width / 2, FIELD.height - 140, '#7ee787', 22)
        break
      case 'levelStart':
        fx.banner = { title: labels.level(event.level), subtitle: labels.serveHint, tone: 'normal', life: 2.2, maxLife: 2.2 }
        break
      case 'levelClear':
        fx.banner = {
          title: event.perfect ? labels.perfectLevel : labels.levelCleared,
          subtitle: `+${labels.points(event.bonus)}`,
          tone: 'good',
          life: 1.6,
          maxLife: 1.6,
        }
        flash(fx, 0.35)
        fx.hitStop = Math.max(fx.hitStop, 0.12)
        break
    }
  }
  if (aggregateBreaks) {
    const total = breaks.reduce((sum, event) => sum + event.points * event.multiplier, 0)
    const multiplier = Math.max(...breaks.map((event) => event.multiplier))
    const x = breaks.reduce((sum, event) => sum + event.x, 0) / breaks.length
    const y = Math.min(...breaks.map((event) => event.y))
    text(fx, `+${labels.points(total)}${multiplier > 1 ? ` ×${multiplier}` : ''}`, x, y - 10, multiplier > 1 ? '#ffd166' : '#f2fbff', 24)
  }
}

export function recordBalls(fx: PrismEffects, balls: Array<{ id: number; x: number; y: number }>): void {
  const live = new Set<number>()
  for (const ball of balls) {
    live.add(ball.id)
    const trail = fx.trails.get(ball.id) ?? []
    trail.push({ x: ball.x, y: ball.y })
    if (trail.length > TRAIL_LENGTH) trail.splice(0, trail.length - TRAIL_LENGTH)
    fx.trails.set(ball.id, trail)
  }
  for (const id of fx.trails.keys()) if (!live.has(id)) fx.trails.delete(id)
}

export function updatePrismEffects(fx: PrismEffects, dt: number): void {
  fx.shake = Math.max(0, fx.shake - dt * (10 + fx.shake * 6))
  fx.flash = Math.max(0, fx.flash - dt * 2.5)
  fx.paddleFlash = Math.max(0, fx.paddleFlash - dt * 3)
  fx.hitStop = Math.max(0, fx.hitStop - dt)
  for (const [id, life] of fx.hits) {
    if (life - dt <= 0) fx.hits.delete(id)
    else fx.hits.set(id, life - dt)
  }

  fx.shards = fx.shards.filter((shard) => {
    shard.life -= dt
    if (shard.life <= 0) return false
    shard.vy += GRAVITY * dt
    shard.x += shard.vx * dt
    shard.y += shard.vy * dt
    shard.rotation += shard.spin * dt
    if (shard.y >= FLOOR_Y) {
      shard.y = FLOOR_Y
      if (!shard.bounced && shard.vy > 0) {
        shard.vy = -shard.vy * 0.35
        shard.vx *= 0.6
        shard.spin *= 0.5
        shard.bounced = true
      } else {
        shard.vy = 0
        shard.vx *= 0.9
        shard.spin *= 0.8
      }
    }
    return true
  })

  fx.sparks = fx.sparks.filter((spark) => {
    spark.life -= dt
    spark.x += spark.vx * dt
    spark.y += spark.vy * dt
    spark.vx *= 1 - 3 * dt
    spark.vy *= 1 - 3 * dt
    return spark.life > 0
  })

  fx.rings = fx.rings.filter((ring) => (ring.life -= dt) > 0)
  fx.prisms = fx.prisms.filter((prism) => (prism.life -= dt) > 0)
  fx.texts = fx.texts.filter((entry) => {
    entry.life -= dt
    entry.y += entry.vy * dt
    return entry.life > 0
  })

  if (fx.banner) {
    fx.banner.life -= dt
    if (fx.banner.life <= 0) fx.banner = null
  }
}

export function prismShakeOffset(fx: PrismEffects): { x: number; y: number } {
  if (fx.shake <= 0) return { x: 0, y: 0 }
  const angle = fx.rng() * Math.PI * 2
  return { x: Math.cos(angle) * fx.shake, y: Math.sin(angle) * fx.shake }
}
