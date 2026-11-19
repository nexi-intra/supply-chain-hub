import { COLS, ROWS } from './config'
import type { Cell, GameEvent } from './engine'
import type { CargoLabels } from './labels'
import type { PieceType } from './pieces'

// Alle positioner er i brætceller (x kolonne, y række inkl. skjulte rækker); renderen omregner til pixels.
export type ParticleKind = 'splinter' | 'dust' | 'spark'

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
}

export interface Sweep {
  y: number
  blocks: Cell[]
  life: number
  maxLife: number
}

export interface Trail {
  cells: Array<[number, number]>
  distance: number
  piece: PieceType
  life: number
  maxLife: number
}

export interface Glow {
  cells: Array<[number, number]>
  life: number
  maxLife: number
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

export interface CargoEffects {
  reducedMotion: boolean
  rng: () => number
  particles: Particle[]
  sweeps: Sweep[]
  trails: Trail[]
  glows: Glow[]
  texts: FloatingText[]
  banner: { title: string; life: number; maxLife: number } | null
  shake: number
  flash: number
  flashColor: string
}

export const MAX_PARTICLES = 450
const MAX_TEXTS = 8
export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#35c6d8',
  O: '#f2c14e',
  T: '#9b6fd6',
  S: '#5cbf5a',
  Z: '#e2574c',
  J: '#3f7fd8',
  L: '#ee8a3a',
}
const WOOD = ['#c99a5b', '#a8743b', '#e3c08a']

export function createCargoEffects(options: { reducedMotion: boolean; rng?: () => number }): CargoEffects {
  return {
    reducedMotion: options.reducedMotion,
    rng: options.rng ?? Math.random,
    particles: [],
    sweeps: [],
    trails: [],
    glows: [],
    texts: [],
    banner: null,
    shake: 0,
    flash: 0,
    flashColor: '#ffffff',
  }
}

function emit(fx: CargoEffects, amount: number, make: (rng: () => number) => Omit<Particle, 'rotation'>): void {
  const total = Math.max(1, Math.round(amount * (fx.reducedMotion ? 0.4 : 1)))
  for (let i = 0; i < total; i++) fx.particles.push({ rotation: fx.rng() * Math.PI * 2, ...make(fx.rng) })
  if (fx.particles.length > MAX_PARTICLES) fx.particles.splice(0, fx.particles.length - MAX_PARTICLES)
}

function text(fx: CargoEffects, value: string, y: number, color: string, size: number): void {
  fx.texts.push({ text: value, x: COLS / 2, y, vy: -1.4, life: 1.4, maxLife: 1.4, color, size })
  if (fx.texts.length > MAX_TEXTS) fx.texts.splice(0, fx.texts.length - MAX_TEXTS)
}

function shake(fx: CargoEffects, amount: number): void {
  if (!fx.reducedMotion) fx.shake = Math.max(fx.shake, amount)
}

function flash(fx: CargoEffects, amount: number, color = '#ffffff'): void {
  fx.flash = Math.max(fx.flash, fx.reducedMotion ? Math.min(0.2, amount) : amount)
  fx.flashColor = color
}

export function applyCargoEvents(fx: CargoEffects, events: GameEvent[], labels: CargoLabels): void {
  for (const event of events) {
    switch (event.type) {
      case 'hardDrop': {
        if (event.distance <= 0) break
        fx.trails.push({ cells: event.cells, distance: event.distance, piece: event.piece, life: 0.28, maxLife: 0.28 })
        const bottom = Math.max(...event.cells.map(([, y]) => y)) + event.distance + 1
        for (const [x] of event.cells) {
          emit(fx, 3, (rng) => {
            const life = 0.4 + rng() * 0.3
            return { kind: 'dust', x: x + rng(), y: bottom, vx: (rng() - 0.5) * 5, vy: -(0.5 + rng() * 1.5), life, maxLife: life, size: 0.18 + rng() * 0.2, color: '#d9d2c3', spin: 0 }
          })
        }
        shake(fx, Math.min(5, 1.5 + event.distance * 0.15))
        break
      }
      case 'lock':
        fx.glows.push({ cells: event.cells, life: 0.25, maxLife: 0.25 })
        break
      case 'lineClear': {
        event.rows.forEach((y, index) => {
          const blocks = event.blocks[index] ?? []
          fx.sweeps.push({ y, blocks, life: 0.55, maxLife: 0.55 })
          blocks.forEach((cell, x) => {
            if (!cell) return
            emit(fx, 3, (rng) => {
              const life = 0.6 + rng() * 0.5
              const wood = rng() < 0.5
              return { kind: 'splinter', x: x + 0.5, y: y + 0.5, vx: 2 + rng() * 9, vy: -(2 + rng() * 6), life, maxLife: life, size: 0.12 + rng() * 0.18, color: wood ? WOOD[Math.floor(rng() * WOOD.length)] : PIECE_COLORS[cell], spin: (rng() - 0.5) * 16 }
            })
          })
        })
        const topRow = event.rows.length > 0 ? Math.min(...event.rows) : ROWS - 4
        fx.texts = []
        const title = event.count > 0 ? labels.clears[event.count as 1 | 2 | 3 | 4] : ''
        const name = event.tspin === 'none' ? title : `${event.tspin === 'mini' ? labels.miniTspin : labels.tspin}${title ? ` ${title}` : ''}`
        if (name) text(fx, name, topRow - 0.5, event.count === 4 || event.tspin !== 'none' ? '#ffd166' : '#ffffff', event.count === 4 ? 1.25 : 1)
        if (event.backToBack) text(fx, labels.backToBack, topRow + 0.7, '#7cf5d4', 0.8)
        if (event.combo > 0) text(fx, labels.combo(event.combo), topRow + 1.7, '#ffb36b', 0.8)
        if (event.perfect) fx.banner = { title: labels.perfect, life: 2.4, maxLife: 2.4 }
        if (event.count === 4 || event.perfect) flash(fx, 0.35, '#fff1c4')
        if (event.count > 0) shake(fx, 2 + event.count * 1.5)
        break
      }
      case 'levelUp':
        fx.banner = { title: labels.level(event.level), life: 2.2, maxLife: 2.2 }
        flash(fx, 0.2)
        break
      case 'gameOver':
        flash(fx, 0.4, '#ff6b5e')
        shake(fx, 8)
        break
    }
  }
}

export function updateCargoEffects(fx: CargoEffects, dt: number): void {
  fx.shake = Math.max(0, fx.shake - dt * 24)
  fx.flash = Math.max(0, fx.flash - dt * 2.2)
  fx.particles = fx.particles.filter((particle) => {
    particle.life -= dt
    if (particle.life <= 0) return false
    if (particle.kind === 'dust') {
      particle.vx *= 1 - dt * 3
      particle.vy *= 1 - dt * 3
      particle.size += dt * 0.6
    } else {
      particle.vy += 26 * dt
    }
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.rotation += particle.spin * dt
    return true
  })
  fx.sweeps = fx.sweeps.filter((sweep) => (sweep.life -= dt) > 0)
  fx.trails = fx.trails.filter((trail) => (trail.life -= dt) > 0)
  fx.glows = fx.glows.filter((glow) => (glow.life -= dt) > 0)
  fx.texts = fx.texts.filter((entry) => {
    entry.life -= dt
    entry.y += entry.vy * dt
    return entry.life > 0
  })
  if (fx.banner && (fx.banner.life -= dt) <= 0) fx.banner = null
}

export function cargoShakeOffset(fx: CargoEffects): { x: number; y: number } {
  if (fx.shake <= 0) return { x: 0, y: 0 }
  return { x: (fx.rng() - 0.5) * fx.shake, y: (fx.rng() - 0.5) * fx.shake }
}
