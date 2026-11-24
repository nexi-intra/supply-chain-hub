import { PART, type BossId } from './bosses/core'
import type { EnemyKind, GameEvent, GameState, SpecialKind } from './engine'
import type { ChickenLabels } from './labels'
import { THEMES, tintHen, type ThemeId } from './themes'
import { FAMILY_COLORS } from './weapons'

export type ParticleKind = 'spark' | 'feather' | 'smoke' | 'debris' | 'shell' | 'ring' | 'cross' | 'streak'

export interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  rotation: number
  spin: number
  gravity: number
  drag: number
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

export interface Splat {
  x: number
  life: number
  maxLife: number
  size: number
}

export interface Banner {
  title: string
  subtitle?: string
  tone: 'normal' | 'boss' | 'good'
  /** Temafarve til sektorbanneret; ellers bestemmer `tone` farven. */
  accent?: string
  /** Tæller titlen op fra 0 til `to` (bonusresultatet). */
  count?: { to: number; seconds: number; format: (value: number) => string }
  life: number
  maxLife: number
}

/** Lille introkort nederst, første gang en ny kylling dukker op. */
export interface IntroCard {
  kind: SpecialKind
  title: string
  hint: string
  life: number
  maxLife: number
}

/** Lynets kortvarige bue: punkterne fra skibet gennem hvert led. */
export interface Arc {
  points: number[]
  level: number
  life: number
  maxLife: number
}

/** Laserstrålen lever et øjeblik efter hvert tik og tegnes fra skibets aktuelle position. */
export interface BeamFx {
  halfWidth: number
  level: number
  life: number
}

/** Vraget efter en boss-sejr; tegnes af bossRender, mens eksplosionerne går af. */
export interface Wreck {
  boss: BossId
  variant: number
  x: number
  y: number
  life: number
  maxLife: number
}

/** En planlagt eksplosion i sejrsfejringen. */
export interface Blast {
  x: number
  y: number
  at: number
  size: number
  color: string
  final: boolean
}

export interface EffectsState {
  particles: Particle[]
  texts: FloatingText[]
  splats: Splat[]
  arcs: Arc[]
  beam: BeamFx | null
  banner: Banner | null
  intro: IntroCard | null
  introQueue: IntroCard[]
  shake: number
  flash: number
  flashColor: string
  hitStop: number
  /** Kort hvidt blink på bossen, når den rammes. */
  bossFlash: number
  wreck: Wreck | null
  blasts: Blast[]
  reducedMotion: boolean
  rng: () => number
}

export const BOSS_ACCENT: Record<BossId, string> = {
  motherHen: '#ef3b4f',
  eggeroid: '#f59e0b',
  iceQueen: '#7dd3fc',
  roboRooster: '#f97316',
  galacticRooster: '#c084fc',
  eggTrio: '#facc15',
  chickenCruiser: '#38bdf8',
  ufoMothership: '#4ade80',
}

/** Bossens farve i banner, liv-bjælke og fejring; Ild-trioen og MK II har deres egen. */
export const bossAccent = (id: BossId, variant = 0): string =>
  id === 'eggTrio' && variant === 1 ? '#ff6a1a' : id === 'chickenCruiser' && variant === 1 ? '#f59e0b' : BOSS_ACCENT[id]

export const MAX_PARTICLES = 500
const REDUCED_PARTICLE_FACTOR = 0.4
const REDUCED_FLASH_MAX = 0.2
const INTRO_SECONDS = 3.4
const ARC_SECONDS = 0.11
const BEAM_LINGER = 0.2
const TRAIL_EVERY = 0.03
const LIGHTNING = ['#ffffff', '#bfdbfe', '#4aa8ff']

const FEATHERS: Partial<Record<EnemyKind, string[]>> = {
  golden: ['#ffd447', '#fff3b0', '#ffb81c'],
  galleryHen: ['#ffd447', '#fff3b0', '#ffb81c'],
  chick: ['#fff06a', '#ffe14d', '#fffbd0'],
  diver: ['#d9ccff', '#ffffff', '#b9a5f5'],
  shield: ['#bfe9ff', '#ffffff', '#7dd3fc'],
  sniper: ['#7c8b4a', '#a3b36b', '#e8e2c8'],
  bomber: ['#57534e', '#a8a29e', '#fca5a5'],
  ninja: ['#1f1b2e', '#3f3a56', '#ef3b4f'],
  balloon: ['#f472b6', '#fbcfe8', '#ffffff'],
  medic: ['#ffffff', '#fecdd3', '#f43f5e'],
  turkey: ['#8b5a2b', '#c2410c', '#f59e0b', '#7c2d12'],
  rainbow: ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#a855f7'],
}
const HEN_COLORS = { body: '#fff4dc', shade: '#e9c98f', belly: '#ffffff' }
const themeFeathers = new Map<ThemeId, string[]>()

/** Fjerfarver for typen; almindelige høns og hjelme får temaets toner, så fjerene ikke altid er hvide. */
export function featherColors(kind: EnemyKind, theme: ThemeId = 'farm'): string[] {
  const own = FEATHERS[kind]
  if (own && (kind !== 'diver' || theme === 'farm')) return own
  let colors = themeFeathers.get(theme)
  if (!colors) {
    const look = tintHen(theme, HEN_COLORS)
    colors = [look.body, look.belly, look.shade]
    themeFeathers.set(theme, colors)
  }
  return colors
}
const SPARKS = ['#ffffff', '#ffc93c', '#ff8a3d']
const PALETTE_YOLK = '#ffc93c'
const METAL = ['#e2e8f0', '#94a3b8', '#ffffff']
const BUBBLE = ['#e0f7ff', '#7dd3fc', '#ffffff', '#38bdf8']
const HEAL = ['#4ade80', '#bbf7d0', '#ffffff']
const FIRE = ['#ffffff', '#fde047', '#fb923c', '#ef4444']
const ROCK = ['#8b7355', '#6b5a48', '#a68a6a', '#4a3f35']
const ICE = ['#ffffff', '#e0f7ff', '#9be3ff', '#38bdf8']
const GOLD = ['#fff7c2', '#facc15', '#f59e0b', '#ffffff']
const COMET = ['#ffffff', '#bae6fd', '#38bdf8', '#e0f2fe']
const VOID = ['#c084fc', '#f472b6', '#fde68a', '#ffffff']
const BONUS_GOLD = '#ffd447'
const NEW_PLUS_GOLD = '#facc15'
const PICKUP_COLORS: Record<string, string[]> = {
  gift: ['#ef3b4f', '#ffc93c', '#ffffff'],
  shield: ['#60a5fa', '#bfdbfe', '#ffffff'],
  coolant: ['#35e0f0', '#a5f3fc', '#ffffff'],
  missile: ['#fb923c', '#fde68a', '#ffffff'],
  drumstick: ['#d97706', '#fbbf24'],
  coin: GOLD,
  drone: ['#e2e8f0', '#35e0f0', '#ffffff'],
  slowmo: ['#818cf8', '#c7d2fe', '#ffffff'],
  magnet: ['#f43f5e', '#93c5fd', '#ffffff'],
  double: ['#facc15', '#fde68a', '#ffffff'],
  life: ['#4ade80', '#bbf7d0', '#ffffff'],
}
const TIMED_TEXT = new Set(['shield', 'coolant', 'missile', 'drone', 'slowmo', 'magnet', 'double', 'life'])

export function createEffects(options: { reducedMotion: boolean; rng?: () => number }): EffectsState {
  return {
    particles: [],
    texts: [],
    splats: [],
    arcs: [],
    beam: null,
    banner: null,
    intro: null,
    introQueue: [],
    shake: 0,
    flash: 0,
    flashColor: '#ffffff',
    hitStop: 0,
    bossFlash: 0,
    wreck: null,
    blasts: [],
    reducedMotion: options.reducedMotion,
    rng: options.rng ?? Math.random,
  }
}

interface BurstOptions {
  kind: ParticleKind
  count: number
  colors: string[]
  speed: number
  life: number
  size: number
  gravity?: number
  drag?: number
  upward?: boolean
}

function burst(fx: EffectsState, x: number, y: number, options: BurstOptions): void {
  const count = Math.max(1, Math.round(options.count * (fx.reducedMotion ? REDUCED_PARTICLE_FACTOR : 1)))
  const { rng } = fx
  for (let i = 0; i < count; i++) {
    const angle = options.upward ? -Math.PI / 2 + (rng() - 0.5) * Math.PI : rng() * Math.PI * 2
    const speed = options.speed * (0.35 + rng() * 0.65)
    const life = options.life * (0.7 + rng() * 0.3)
    fx.particles.push({
      kind: options.kind,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: options.size * (0.6 + rng() * 0.6),
      color: options.colors[Math.floor(rng() * options.colors.length)],
      rotation: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 8,
      gravity: options.gravity ?? 0,
      drag: options.drag ?? 0,
    })
  }
  if (fx.particles.length > MAX_PARTICLES) fx.particles.splice(0, fx.particles.length - MAX_PARTICLES)
}

function text(fx: EffectsState, value: string, x: number, y: number, color: string, size = 18): void {
  fx.texts.push({ text: value, x, y, vy: -46, life: 1, maxLife: 1, color, size })
}

function shake(fx: EffectsState, amount: number): void {
  if (!fx.reducedMotion) fx.shake = Math.max(fx.shake, amount)
}

function flash(fx: EffectsState, amount: number, color = '#ffffff'): void {
  fx.flash = Math.max(fx.flash, fx.reducedMotion ? Math.min(amount, REDUCED_FLASH_MAX) : amount)
  fx.flashColor = color
}

function banner(fx: EffectsState, title: string, subtitle: string | undefined, tone: Banner['tone'], seconds = 2.2): Banner {
  fx.banner = { title, subtitle, tone, life: seconds, maxLife: seconds }
  return fx.banner
}

function featherBurst(fx: EffectsState, x: number, y: number, kind: EnemyKind, count: number, theme?: ThemeId): void {
  burst(fx, x, y, { kind: 'feather', count, colors: featherColors(kind, theme), speed: 150, life: 1.6, size: 7, gravity: 60, drag: 2.2 })
}

function meteorBurst(fx: EffectsState, event: Extract<GameEvent, { type: 'kill' }>): void {
  const { x, y, large } = event
  const scale = large ? 1.8 : 1
  switch (event.meteorType) {
    case 'fire':
      burst(fx, x, y, { kind: 'spark', count: 18 * scale, colors: FIRE, speed: 260, life: 0.55, size: 3, drag: 2.5 })
      burst(fx, x, y, { kind: 'debris', count: 8 * scale, colors: ['#3b1a12', '#7a3a22', '#ff6a1a'], speed: 200, life: 0.8, size: 3.5, gravity: 220 })
      burst(fx, x, y, { kind: 'smoke', count: 4 * scale, colors: ['#57534e', '#7c2d12'], speed: 45, life: 0.9, size: 13, drag: 1 })
      return
    case 'ice':
      burst(fx, x, y, { kind: 'debris', count: 14 * scale, colors: ICE, speed: 230, life: 0.8, size: 3.5, gravity: 160 })
      burst(fx, x, y, { kind: 'cross', count: 6 * scale, colors: ['#ffffff', '#e0f7ff'], speed: 90, life: 0.7, size: 5, drag: 2 })
      burst(fx, x, y, { kind: 'ring', count: 1, colors: ['#7dd3fc'], speed: 0, life: 0.4, size: large ? 20 : 12 })
      return
    case 'metal':
      burst(fx, x, y, { kind: 'debris', count: 20, colors: METAL, speed: 260, life: 1, size: 4, gravity: 240 })
      burst(fx, x, y, { kind: 'spark', count: 26, colors: [...SPARKS, '#e2e8f0'], speed: 320, life: 0.6, size: 3, drag: 2.5 })
      burst(fx, x, y, { kind: 'ring', count: 1, colors: ['#e2e8f0'], speed: 0, life: 0.45, size: 18 })
      shake(fx, 4)
      return
    case 'gold':
      burst(fx, x, y, { kind: 'spark', count: 30, colors: GOLD, speed: 280, life: 0.8, size: 3.2, drag: 2 })
      burst(fx, x, y, { kind: 'debris', count: 10, colors: ['#facc15', '#c2860f', '#fff7c2'], speed: 200, life: 0.8, size: 3.5, gravity: 200 })
      burst(fx, x, y, { kind: 'ring', count: 1, colors: [BONUS_GOLD], speed: 0, life: 0.5, size: 16 })
      return
    case 'comet':
      burst(fx, x, y, { kind: 'spark', count: 24, colors: COMET, speed: 300, life: 0.6, size: 3, drag: 2.5 })
      burst(fx, x, y, { kind: 'ring', count: 1, colors: ['#bae6fd'], speed: 0, life: 0.45, size: 16 })
      return
    default:
      burst(fx, x, y, { kind: 'debris', count: large ? 22 : 12, colors: ROCK, speed: 220, life: 0.9, size: 4, gravity: 200 })
      burst(fx, x, y, { kind: 'smoke', count: large ? 6 : 3, colors: ['#57534e', '#78716c'], speed: 40, life: 0.8, size: 14, drag: 1 })
  }
}

function killBurst(fx: EffectsState, event: Extract<GameEvent, { type: 'kill' }>): void {
  const { x, y, kind } = event
  switch (kind) {
    case 'meteor':
      meteorBurst(fx, event)
      return
    case 'bossPart':
      if (event.part === PART.trio || event.part === PART.trioFire) {
        featherBurst(fx, x, y, 'hen', 36, event.theme)
        burst(fx, x, y, { kind: 'spark', count: 30, colors: event.part === PART.trioFire ? FIRE : SPARKS, speed: 320, life: 0.7, size: 3.5, drag: 2 })
        burst(fx, x, y, { kind: 'ring', count: 1, colors: [event.part === PART.trioFire ? '#ff6a1a' : '#ffc93c'], speed: 0, life: 0.55, size: 26 })
      } else {
        burst(fx, x, y, { kind: 'debris', count: 26, colors: [...METAL, '#fb923c'], speed: 300, life: 1.1, size: 4.5, gravity: 260 })
        burst(fx, x, y, { kind: 'spark', count: 34, colors: FIRE, speed: 340, life: 0.7, size: 3.5, drag: 2 })
        burst(fx, x, y, { kind: 'smoke', count: 6, colors: ['#57534e', '#78716c'], speed: 60, life: 1.1, size: 16, drag: 1 })
        burst(fx, x, y, { kind: 'ring', count: 1, colors: ['#fdba74'], speed: 0, life: 0.6, size: 30 })
      }
      shake(fx, 7)
      flash(fx, 0.15, '#fde68a')
      return
    case 'ufo':
      burst(fx, x, y, { kind: 'debris', count: 26, colors: [...METAL, '#4ade80'], speed: 280, life: 1, size: 4, gravity: 220 })
      burst(fx, x, y, { kind: 'spark', count: 36, colors: FIRE, speed: 340, life: 0.7, size: 3.5, drag: 2 })
      burst(fx, x, y, { kind: 'ring', count: 1, colors: ['#86efac'], speed: 0, life: 0.6, size: 26 })
      featherBurst(fx, x, y, 'hen', 8, event.theme)
      return
    case 'balloon':
      burst(fx, x, y - 30, { kind: 'debris', count: 10, colors: ['#f43f5e', '#fb7185', '#be123c'], speed: 200, life: 0.7, size: 4, gravity: 260 })
      break
    case 'rainbow':
      burst(fx, x, y, { kind: 'spark', count: 46, colors: FEATHERS.rainbow!, speed: 320, life: 0.9, size: 3.5, drag: 2 })
      burst(fx, x, y, { kind: 'ring', count: 1, colors: ['#ffffff'], speed: 0, life: 0.6, size: 24 })
      break
    case 'turkey':
      burst(fx, x, y, { kind: 'smoke', count: 4, colors: ['#78716c', '#a8a29e'], speed: 60, life: 0.7, size: 12, drag: 1 })
      break
  }
  const big = kind === 'golden' || kind === 'rainbow' || kind === 'turkey'
  const golden = kind === 'golden' || kind === 'galleryHen'
  featherBurst(fx, x, y, kind, big ? 24 : kind === 'chick' ? 6 : 12, event.theme)
  burst(fx, x, y, { kind: 'spark', count: golden ? 30 : 8, colors: golden ? FEATHERS.golden! : SPARKS, speed: 260, life: 0.45, size: 3, drag: 3 })
}

function queueIntro(fx: EffectsState, kind: SpecialKind, labels: ChickenLabels): void {
  const card: IntroCard = { kind, title: labels.newEnemy(kind), hint: labels.enemyHint[kind], life: INTRO_SECONDS, maxLife: INTRO_SECONDS }
  if (fx.intro) fx.introQueue.push(card)
  else fx.intro = card
}

const ESCAPE_COLORS = { ninja: '#fda4af', ufo: '#86efac', rainbow: '#f0abfc' }
const CONFETTI = ['#ef3b4f', '#35e0f0', '#ffd447', '#4ade80', '#ffffff', '#c084fc']

/** Sejrsfejringen: vraget ryster og synker, mens en kæde af eksplosioner ender i et stort brag med konfetti. */
function celebrate(fx: EffectsState, boss: BossId, variant: number, x: number, y: number, mini: boolean, color: string): void {
  const seconds = mini ? 0.9 : 1.5
  if (boss !== 'eggTrio') fx.wreck = { boss, variant, x, y, life: seconds + 0.2, maxLife: seconds + 0.2 }
  const count = mini ? 5 : 10
  const spread = boss === 'chickenCruiser' ? 150 : mini ? 70 : 95
  for (let i = 0; i < count; i++) {
    fx.blasts.push({ x: x + (fx.rng() - 0.5) * 2 * spread, y: y + (fx.rng() - 0.5) * 110, at: (i / count) * seconds + fx.rng() * 0.06, size: 0.6 + (i / count) * 0.6, color, final: false })
  }
  fx.blasts.push({ x, y, at: seconds, size: mini ? 1.4 : 2, color, final: true })
}

function explode(fx: EffectsState, blast: Blast): void {
  const { x, y, size, color } = blast
  burst(fx, x, y, { kind: 'spark', count: 18 * size, colors: [...FIRE, color], speed: 300 * size, life: 0.6, size: 3.5, drag: 2.2 })
  burst(fx, x, y, { kind: 'smoke', count: 3 * size, colors: ['#57534e', '#78716c'], speed: 50, life: 0.9, size: 14 * size, drag: 1 })
  burst(fx, x, y, { kind: 'ring', count: 1, colors: [color], speed: 0, life: 0.45, size: 22 * size })
  shake(fx, 5 * size)
  if (!blast.final) return
  burst(fx, x, y, { kind: 'debris', count: 60, colors: CONFETTI, speed: 420, life: 2, size: 4.5, gravity: 170, drag: 1 })
  burst(fx, x, y, { kind: 'spark', count: 80, colors: ['#ffffff', '#ffd447', color], speed: 520, life: 1.1, size: 4, drag: 1.6 })
  burst(fx, x, y, { kind: 'ring', count: 1, colors: ['#ffffff'], speed: 0, life: 0.8, size: 70 })
  flash(fx, 0.7, color)
  shake(fx, 16)
}

export function applyEvents(fx: EffectsState, events: GameEvent[], labels: ChickenLabels, ship: { x: number; y: number }): void {
  for (const event of events) {
    switch (event.type) {
      case 'meteorDeflect': {
        burst(fx, event.x, event.y + 8, { kind: 'spark', count: 7, colors: [...METAL, '#fde68a'], speed: 260, life: 0.25, size: 2.2, drag: 4, upward: true })
        const side = fx.rng() < 0.5 ? -1 : 1
        for (const tilt of [0.5, 0.9]) {
          fx.particles.push({ kind: 'streak', x: event.x, y: event.y + 10, vx: side * Math.sin(tilt) * 520, vy: -Math.cos(tilt) * 520, life: 0.18, maxLife: 0.18, size: 2, color: '#e0f2fe', rotation: 0, spin: 0, gravity: 0, drag: 3 })
        }
        break
      }
      case 'swallow':
        burst(fx, event.x, event.y, { kind: 'spark', count: event.what === 'meteor' ? 12 : 4, colors: VOID, speed: 120, life: 0.35, size: 2.4, drag: 5 })
        if (event.what === 'meteor') burst(fx, event.x, event.y, { kind: 'ring', count: 1, colors: ['#c084fc'], speed: 0, life: 0.35, size: 10 })
        break
      case 'blackHoleCollapse':
        burst(fx, event.x, event.y, { kind: 'spark', count: 40, colors: VOID, speed: 340, life: 0.8, size: 3, drag: 2 })
        burst(fx, event.x, event.y, { kind: 'ring', count: 1, colors: ['#f0abfc'], speed: 0, life: 0.7, size: 30 })
        flash(fx, 0.35, '#a855f7')
        shake(fx, 8)
        break
      case 'hazardStart':
        if (fx.banner) fx.banner.subtitle = labels.hazardSubtitle(event.hazard, event.theme)
        if (event.hazard === 'blackHole') flash(fx, 0.2, '#7c3aed')
        break
      case 'bonusStart': {
        const card = banner(fx, labels.bonus.title, labels.waveSubtitle[event.stage], 'good', 2.6)
        card.accent = BONUS_GOLD
        flash(fx, 0.3, BONUS_GOLD)
        break
      }
      case 'bonusMiss':
        burst(fx, event.x, event.y - 8, { kind: 'shell', count: 8, colors: ['#fffef2', '#f0e6c8', PALETTE_YOLK], speed: 180, life: 0.6, size: 3, gravity: 400, upward: true })
        if (event.first) {
          text(fx, labels.bonus.lost, event.x, event.y - 44, '#fb7185', 22)
          flash(fx, 0.3, '#ef3b4f')
          shake(fx, 5)
        }
        break
      case 'bonusResult': {
        const title = labels.bonus.result(event.points)
        const subtitle = event.perfect
          ? event.stage === 'eggDodge'
            ? labels.bonus.noHit
            : labels.bonus.perfect
          : event.stage === 'eggDodge'
            ? labels.bonus.lost
            : `${event.collected}/${event.possible}`
        const card = banner(fx, title, subtitle, 'good', 3)
        card.accent = BONUS_GOLD
        card.count = { to: event.points, seconds: 1.2, format: labels.bonus.result }
        if (event.perfect) {
          burst(fx, 480, 250, { kind: 'spark', count: 70, colors: GOLD, speed: 420, life: 1.1, size: 3.5, drag: 1.6 })
          burst(fx, 480, 250, { kind: 'debris', count: 30, colors: ['#ef3b4f', '#35e0f0', '#ffd447', '#4ade80', '#ffffff'], speed: 300, life: 1.6, size: 4, gravity: 160, drag: 1 })
          flash(fx, 0.4, BONUS_GOLD)
        }
        break
      }
      case 'kill': {
        killBurst(fx, event)
        const multiplier = event.multiplier > 1 ? ` ×${event.multiplier}` : ''
        const big = event.kind === 'golden' || event.kind === 'rainbow' || event.kind === 'ufo' || event.meteorType === 'metal' || event.meteorType === 'gold'
        text(fx, `+${labels.points(event.points)}${multiplier}`, event.x, event.y - 10, event.multiplier > 1 ? '#ffc93c' : '#fff4dc', big ? 24 : 18)
        shake(fx, big ? 6 : event.kind === 'turkey' ? 4 : 2)
        break
      }
      case 'hit':
        burst(fx, event.x, event.y, {
          kind: 'spark',
          count: event.shielded ? 8 : 5,
          colors: event.shielded ? BUBBLE : event.kind === 'helmet' || event.kind === 'ufo' ? METAL : SPARKS,
          speed: 200,
          life: 0.3,
          size: 2.5,
          drag: 4,
        })
        break
      case 'shieldBreak':
        burst(fx, event.x, event.y, { kind: 'debris', count: 16, colors: BUBBLE, speed: 230, life: 0.6, size: 3.5, gravity: 120, drag: 1 })
        burst(fx, event.x, event.y, { kind: 'ring', count: 1, colors: ['#7dd3fc'], speed: 0, life: 0.45, size: 18 })
        shake(fx, 2)
        break
      case 'heal':
        burst(fx, event.x, event.y, { kind: 'ring', count: 1, colors: ['#4ade80'], speed: 0, life: 0.6, size: 22 })
        for (const target of event.targets) {
          burst(fx, target.x, target.y - 6, { kind: 'cross', count: 3, colors: HEAL, speed: 50, life: 0.8, size: 5, gravity: -60, drag: 2, upward: true })
          text(fx, '+1', target.x, target.y - 26, '#4ade80', 14)
        }
        break
      case 'bombBurst':
        burst(fx, event.x, event.y, { kind: 'spark', count: 22, colors: FIRE, speed: 260, life: 0.5, size: 3.5, drag: 3 })
        burst(fx, event.x, event.y, { kind: 'smoke', count: 5, colors: ['#57534e', '#78716c'], speed: 50, life: 0.7, size: 14, drag: 1 })
        burst(fx, event.x, event.y, { kind: 'ring', count: 1, colors: ['#fb923c'], speed: 0, life: 0.45, size: 16 })
        shake(fx, 5)
        break
      case 'weaponStolen':
        burst(fx, ship.x, ship.y - 20, { kind: 'spark', count: 18, colors: ['#86efac', '#ef3b4f', '#ffffff'], speed: 200, life: 0.6, size: 3, drag: 2, upward: true })
        text(fx, labels.weaponStolen, ship.x, ship.y - 48, '#86efac', 20)
        flash(fx, 0.25, '#4ade80')
        shake(fx, 4)
        break
      case 'newEnemy':
        queueIntro(fx, event.kind, labels)
        break
      case 'bossHit':
        burst(fx, event.x, event.y, { kind: 'spark', count: 3, colors: SPARKS, speed: 180, life: 0.25, size: 2.5, drag: 4 })
        fx.bossFlash = 0.08
        break
      case 'bossDeflect':
        burst(fx, event.x, event.y + 6, { kind: 'spark', count: 4, colors: ['#e0f2fe', '#7dd3fc', '#ffffff'], speed: 220, life: 0.22, size: 2, drag: 4, upward: true })
        fx.bossFlash = Math.max(fx.bossFlash, 0.05)
        break
      case 'bossIntro': {
        const accent = bossAccent(event.boss, event.variant)
        const card = banner(fx, labels.bossTitle(event.boss, event.variant).toLocaleUpperCase(labels.locale), labels.bossIntro[event.boss], 'boss', event.mini ? 2.6 : 3.4)
        card.accent = accent
        flash(fx, event.mini ? 0.2 : 0.35, accent)
        break
      }
      case 'bossShieldDown':
        burst(fx, event.x, event.y, { kind: 'debris', count: 40, colors: BUBBLE, speed: 320, life: 0.9, size: 4, gravity: 140, drag: 1 })
        burst(fx, event.x, event.y, { kind: 'ring', count: 1, colors: ['#7dd3fc'], speed: 0, life: 0.7, size: 60 })
        text(fx, labels.shieldDown, event.x, event.y - 100, '#7dd3fc', 26)
        shake(fx, 10)
        flash(fx, 0.35, '#38bdf8')
        break
      case 'bossTeleport':
        for (const [x, y] of [[event.fromX, event.fromY], [event.x, event.y]]) {
          burst(fx, x, y, { kind: 'spark', count: 30, colors: VOID, speed: 260, life: 0.5, size: 3, drag: 3 })
          burst(fx, x, y, { kind: 'ring', count: 1, colors: ['#e879f9'], speed: 0, life: 0.45, size: 40 })
        }
        flash(fx, 0.15, '#d946ef')
        shake(fx, 4)
        break
      case 'bossPhase':
        banner(fx, event.boss ? labels.bossPhaseLine(event.boss, event.phase) : event.phase === 2 ? labels.bossAngry : labels.bossLastStand, undefined, 'boss', 1.8)
        shake(fx, 8)
        flash(fx, 0.3, '#ef3b4f')
        break
      case 'bossDefeated': {
        const mini = !!event.mini
        const color = event.boss ? bossAccent(event.boss, event.variant ?? 0) : '#ffc93c'
        fx.hitStop = mini ? 0.25 : 0.4
        featherBurst(fx, event.x, event.y, 'hen', mini ? 40 : 70)
        burst(fx, event.x, event.y, { kind: 'spark', count: 60, colors: SPARKS, speed: 420, life: 0.9, size: 4, drag: 2 })
        burst(fx, event.x, event.y, { kind: 'ring', count: 1, colors: [color], speed: 0, life: 0.7, size: 30 })
        text(fx, `+${labels.points(event.points)}`, event.x, event.y, '#ffc93c', 30)
        banner(fx, event.boss ? labels.bossDefeatedFor(event.boss, event.variant ?? 0) : labels.bossDefeated, undefined, 'good', mini ? 2.2 : 2.8).accent = event.boss ? color : undefined
        shake(fx, mini ? 10 : 18)
        flash(fx, 0.8)
        if (event.boss) celebrate(fx, event.boss, event.variant ?? 0, event.x, event.y, mini, color)
        break
      }
      case 'playerHit':
        burst(fx, event.x, event.y, { kind: 'spark', count: 40, colors: ['#ffffff', '#35e0f0', '#ffc93c', '#ef3b4f'], speed: 340, life: 0.8, size: 3.5, drag: 2 })
        burst(fx, event.x, event.y, { kind: 'smoke', count: 8, colors: ['#57534e', '#a8a29e'], speed: 60, life: 1, size: 18, drag: 1 })
        shake(fx, 12)
        flash(fx, 0.55, '#ef3b4f')
        break
      case 'shieldBlock':
        burst(fx, event.x, event.y, { kind: 'spark', count: 20, colors: PICKUP_COLORS.shield, speed: 240, life: 0.5, size: 3, drag: 3 })
        text(fx, labels.shieldHeld, event.x, event.y - 40, '#93c5fd')
        shake(fx, 4)
        break
      case 'pickup': {
        const colors = event.kind === 'gift' && event.family ? [FAMILY_COLORS[event.family], '#ffffff'] : PICKUP_COLORS[event.kind]
        burst(fx, event.x, event.y, { kind: 'spark', count: 12, colors, speed: 160, life: 0.45, size: 2.5, drag: 3 })
        if (event.kind === 'life' && event.points > 0) {
          text(fx, `+${labels.points(event.points)}`, event.x, event.y - 24, '#4ade80', 20)
        } else if (TIMED_TEXT.has(event.kind)) {
          text(fx, labels.pickup[event.kind as keyof ChickenLabels['pickup']], event.x, event.y - 24, PICKUP_COLORS[event.kind][0], event.kind === 'life' ? 22 : 18)
          burst(fx, event.x, event.y, { kind: 'ring', count: 1, colors: [PICKUP_COLORS[event.kind][0]], speed: 0, life: 0.45, size: 14 })
          if (event.kind === 'slowmo') flash(fx, 0.25, '#6366f1')
          if (event.kind === 'life') flash(fx, 0.2, '#4ade80')
        } else if (event.points > 0) {
          text(fx, `+${labels.points(event.points)}`, event.x, event.y - 24, '#fbbf24', event.kind === 'drumstick' ? 15 : event.kind === 'coin' ? 17 : 20)
        }
        break
      }
      case 'weaponUp': {
        const color = event.family ? FAMILY_COLORS[event.family] : '#ef3b4f'
        text(fx, event.family ? labels.weaponGift(event.family, event.level) : labels.weaponLevel(event.level), ship.x, ship.y - 44, color, event.switched ? 22 : 20)
        if (event.family) burst(fx, ship.x, ship.y - 10, { kind: 'ring', count: 1, colors: [color], speed: 0, life: 0.5, size: 18 })
        break
      }
      case 'lightning': {
        fx.arcs.push({ points: event.points, level: event.level, life: ARC_SECONDS, maxLife: ARC_SECONDS })
        for (let i = 2; i < event.points.length; i += 2) {
          burst(fx, event.points[i], event.points[i + 1], { kind: 'spark', count: 3, colors: LIGHTNING, speed: 160, life: 0.22, size: 2, drag: 5 })
        }
        break
      }
      case 'beam':
        fx.beam = { halfWidth: event.halfWidth, level: event.level, life: BEAM_LINGER }
        break
      case 'powerupEnd':
        text(fx, `${labels.powerupName[event.kind]} ${labels.powerupOver}`, ship.x, ship.y - 40, 'rgba(255, 244, 220, 0.8)', 14)
        break
      case 'overheat':
        text(fx, labels.overheated, ship.x, ship.y - 44, '#ff8a3d', 20)
        break
      case 'extraLife':
        text(fx, labels.extraLife, ship.x, ship.y - 44, '#4ade80', 22)
        break
      case 'missile':
        burst(fx, ship.x, ship.y - 30, { kind: 'ring', count: 1, colors: ['#fb923c'], speed: 0, life: 0.6, size: 40 })
        text(fx, labels.missile, ship.x, ship.y - 44, '#fb923c', 22)
        shake(fx, 14)
        flash(fx, 0.9)
        break
      case 'eggSplat':
        fx.splats.push({ x: event.x, life: 3, maxLife: 3, size: 10 + fx.rng() * 6 })
        burst(fx, event.x, 596, { kind: 'shell', count: 5, colors: ['#fffef2', '#f0e6c8'], speed: 120, life: 0.6, size: 3, gravity: 500, upward: true })
        break
      case 'escape':
        if (event.kind === 'ninja' || event.kind === 'ufo' || event.kind === 'rainbow') text(fx, labels.escaped[event.kind], 480, 70, ESCAPE_COLORS[event.kind], 16)
        else if (event.kind === 'golden') text(fx, labels.goldenEscaped, 480, 70, '#ffd447', 16)
        break
      case 'laserFire':
        shake(fx, 6)
        break
      case 'waveStart':
        banner(fx, labels.wave(event.wave), labels.waveSubtitle[event.templateId], event.kind === 'boss' ? 'boss' : event.kind === 'bonus' ? 'good' : 'normal')
        break
      case 'sectorStart': {
        if (event.round > 0 && event.sector === 0) {
          banner(fx, labels.newPlus(event.round).toLocaleUpperCase(labels.locale), labels.newPlusSubtitle, 'good', 3.6).accent = NEW_PLUS_GOLD
          burst(fx, 480, 230, { kind: 'spark', count: 60, colors: GOLD, speed: 380, life: 1, size: 3.5, drag: 1.8 })
          flash(fx, 0.45, NEW_PLUS_GOLD)
          shake(fx, 6)
          break
        }
        const subtitle = [event.round > 0 ? labels.newPlus(event.round) : '', fx.banner?.subtitle ?? ''].filter(Boolean).join(' · ')
        banner(fx, labels.sectorTitle(event.sector, event.theme), subtitle || undefined, 'normal', 3).accent = THEMES[event.theme].planet.rim
        flash(fx, 0.25, THEMES[event.theme].planet.rim)
        break
      }
      case 'waveClear':
        banner(fx, event.perfect ? labels.perfectWave : labels.waveCleared, `+${labels.points(event.bonus)}`, 'good', 1.8)
        break
    }
  }
}

export function updateEffects(fx: EffectsState, dt: number): void {
  fx.shake = Math.max(0, fx.shake - dt * (10 + fx.shake * 6))
  fx.flash = Math.max(0, fx.flash - dt * 2.5)
  fx.hitStop = Math.max(0, fx.hitStop - dt)
  fx.bossFlash = Math.max(0, fx.bossFlash - dt)
  if (fx.wreck) {
    fx.wreck.life -= dt
    if (fx.wreck.life <= 0) fx.wreck = null
  }
  if (fx.blasts.length > 0) {
    const due = fx.blasts.filter((blast) => (blast.at -= dt) <= 0)
    if (due.length > 0) fx.blasts = fx.blasts.filter((blast) => blast.at > 0)
    for (const blast of due) explode(fx, blast)
  }

  // Pakkes på stedet: op til 500 partikler hvert billede uden et nyt array.
  let alive = 0
  for (const p of fx.particles) {
    p.life -= dt
    if (p.life <= 0) continue
    const damping = Math.max(0, 1 - p.drag * dt)
    p.vx *= damping
    p.vy = p.vy * damping + p.gravity * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.kind === 'feather') p.x += Math.sin(p.life * 6 + p.rotation) * 14 * dt
    p.rotation += p.spin * dt
    fx.particles[alive++] = p
  }
  fx.particles.length = alive

  fx.texts = fx.texts.filter((t) => {
    t.life -= dt
    t.y += t.vy * dt
    return t.life > 0
  })

  fx.splats = fx.splats.filter((s) => {
    s.life -= dt
    return s.life > 0
  })

  if (fx.arcs.length > 0) {
    for (const arc of fx.arcs) arc.life -= dt
    fx.arcs = fx.arcs.filter((arc) => arc.life > 0)
  }
  if (fx.beam) {
    fx.beam.life -= dt
    if (fx.beam.life <= 0) fx.beam = null
  }

  if (fx.banner) {
    fx.banner.life -= dt
    if (fx.banner.life <= 0) fx.banner = null
  }

  if (fx.intro) {
    fx.intro.life -= dt
    if (fx.intro.life <= 0) fx.intro = fx.introQueue.shift() ?? null
  }
}

/** Røgspor efter raketterne; kaldes én gang pr. billede. */
export function rocketTrails(fx: EffectsState, state: GameState): void {
  for (const projectile of state.projectiles) {
    if (projectile.kind !== 'rocket' || projectile.dead) continue
    const age = projectile.age ?? 0
    if (Math.floor(age / TRAIL_EVERY) === Math.floor((age - 1 / 60) / TRAIL_EVERY)) continue
    const speed = Math.hypot(projectile.vx, projectile.vy) || 1
    const x = projectile.x - (projectile.vx / speed) * 10
    const y = projectile.y - (projectile.vy / speed) * 10
    const life = fx.reducedMotion ? 0.3 : 0.55
    fx.particles.push({ kind: 'smoke', x, y, vx: (fx.rng() - 0.5) * 20, vy: (fx.rng() - 0.5) * 20, life, maxLife: life, size: 4 + fx.rng() * 2, color: fx.rng() < 0.3 ? '#fde68a' : '#c4b5fd', rotation: 0, spin: 0, gravity: 0, drag: 2 })
  }
  if (fx.particles.length > MAX_PARTICLES) fx.particles.splice(0, fx.particles.length - MAX_PARTICLES)
}

export function shakeOffset(fx: EffectsState): { x: number; y: number } {
  if (fx.shake <= 0) return { x: 0, y: 0 }
  const angle = fx.rng() * Math.PI * 2
  return { x: Math.cos(angle) * fx.shake, y: Math.sin(angle) * fx.shake }
}
