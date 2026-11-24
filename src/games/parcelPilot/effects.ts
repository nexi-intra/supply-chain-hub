import { DRONE_X, WATER_Y } from './config'
import type { GameEvent } from './engine'
import type { ParcelLabels } from './labels'

export type ParticleKind = 'puff' | 'spark' | 'debris' | 'drop' | 'glint'

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

export interface Ring {
  x: number
  y: number
  life: number
  maxLife: number
  radius: number
  color: string
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

export interface Banner {
  title: string
  life: number
  maxLife: number
}

export interface ParcelEffects {
  reducedMotion: boolean
  rng: () => number
  particles: Particle[]
  rings: Ring[]
  texts: FloatingText[]
  banner: Banner | null
  shake: number
  flash: number
  flashColor: string
  hitStop: number
  liftPulse: number
}

export const MAX_PARTICLES = 500
const MAX_TEXTS = 16
const DEBRIS_COLORS = ['#2b3a55', '#f2f5fa', '#ff7e5f', '#35e0c2', '#c79a5b']
const SPARK_COLORS = ['#ffd166', '#ffb36b', '#ffffff']

export function createParcelEffects(options: { reducedMotion: boolean; rng?: () => number }): ParcelEffects {
  return {
    reducedMotion: options.reducedMotion,
    rng: options.rng ?? Math.random,
    particles: [],
    rings: [],
    texts: [],
    banner: null,
    shake: 0,
    flash: 0,
    flashColor: '#ffffff',
    hitStop: 0,
    liftPulse: 0,
  }
}

function count(fx: ParcelEffects, base: number): number {
  return Math.max(1, Math.round(base * (fx.reducedMotion ? 0.4 : 1)))
}

function emit(fx: ParcelEffects, kind: ParticleKind, x: number, y: number, amount: number, make: (rng: () => number) => Partial<Particle>): void {
  for (let i = 0; i < count(fx, amount); i++) {
    const life = 0.6
    fx.particles.push({ kind, x, y, vx: 0, vy: 0, life, maxLife: life, size: 3, color: '#ffffff', rotation: fx.rng() * Math.PI * 2, spin: 0, ...make(fx.rng) })
  }
  if (fx.particles.length > MAX_PARTICLES) fx.particles.splice(0, fx.particles.length - MAX_PARTICLES)
}

function burst(fx: ParcelEffects, x: number, y: number, amount: number, colors: string[], speed: number, kind: ParticleKind = 'spark'): void {
  emit(fx, kind, x, y, amount, (rng) => {
    const angle = rng() * Math.PI * 2
    const velocity = speed * (0.35 + rng() * 0.65)
    const life = 0.35 + rng() * 0.45
    return { vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life, maxLife: life, size: 1.5 + rng() * 2, color: colors[Math.floor(rng() * colors.length)] }
  })
}

function text(fx: ParcelEffects, value: string, x: number, y: number, color: string, size = 18): void {
  fx.texts.push({ text: value, x, y, vy: -42, life: 1, maxLife: 1, color, size })
  if (fx.texts.length > MAX_TEXTS) fx.texts.splice(0, fx.texts.length - MAX_TEXTS)
}

function shake(fx: ParcelEffects, amount: number): void {
  if (!fx.reducedMotion) fx.shake = Math.max(fx.shake, amount)
}

function flash(fx: ParcelEffects, amount: number, color = '#ffffff'): void {
  fx.flash = Math.max(fx.flash, fx.reducedMotion ? Math.min(0.2, amount) : amount)
  fx.flashColor = color
}

export function applyParcelEvents(fx: ParcelEffects, events: GameEvent[], labels: ParcelLabels, droneY: number): void {
  for (const event of events) {
    switch (event.type) {
      case 'lift':
        fx.liftPulse = 1
        emit(fx, 'puff', DRONE_X, droneY + 18, 6, (rng) => {
          const life = 0.45 + rng() * 0.25
          return { x: DRONE_X - 14 + rng() * 28, vx: -150 + rng() * 60, vy: 70 + rng() * 70, life, maxLife: life, size: 4 + rng() * 4, color: '#cfe3ff' }
        })
        break
      case 'gatePass':
        if (event.perfect) {
          const suffix = event.multiplier > 1 ? ` ×${event.multiplier}` : ''
          text(fx, `${labels.perfect} +${labels.points(event.points)}${suffix}`, event.x + 10, event.y - 34, event.multiplier > 1 ? '#ffd166' : '#7cf5d4', 19)
          fx.rings.push({ x: event.x, y: event.y, life: 0.45, maxLife: 0.45, radius: 46, color: '#7cf5d4' })
          burst(fx, event.x, event.y, 10, ['#7cf5d4', '#ffffff'], 220)
        } else {
          text(fx, `+${labels.points(event.points)}`, event.x + 10, event.y - 30, '#e8f1ff', 15)
        }
        break
      case 'parcel': {
        const colors = event.golden ? ['#ffd166', '#fff3c4', '#ffffff'] : ['#e7b97a', '#fff1d6', '#ffffff']
        burst(fx, event.x, event.y, event.golden ? 26 : 12, colors, event.golden ? 300 : 200, 'glint')
        fx.rings.push({ x: event.x, y: event.y, life: 0.4, maxLife: 0.4, radius: event.golden ? 60 : 34, color: event.golden ? '#ffd166' : '#f3d3a0' })
        text(fx, `+${labels.points(event.points)}`, event.x, event.y - 22, event.golden ? '#ffd166' : '#ffe9c7', event.golden ? 22 : 17)
        break
      }
      case 'shieldGain':
        fx.rings.push({ x: DRONE_X, y: droneY, life: 0.6, maxLife: 0.6, radius: 80, color: '#72d6f5' })
        flash(fx, 0.15, '#72d6f5')
        text(fx, labels.shieldGained, DRONE_X, droneY - 48, '#72d6f5', 20)
        break
      case 'shieldBreak':
        burst(fx, event.x, event.y, 30, ['#72d6f5', '#d8f6ff', '#ffffff'], 340)
        fx.rings.push({ x: event.x, y: event.y, life: 0.5, maxLife: 0.5, radius: 70, color: '#72d6f5' })
        shake(fx, 6)
        flash(fx, 0.3, '#72d6f5')
        text(fx, labels.shieldBroken, event.x + 20, event.y - 46, '#72d6f5', 19)
        break
      case 'zone':
        fx.banner = { title: labels.zone(event.zone), life: 2.4, maxLife: 2.4 }
        flash(fx, 0.25)
        break
      case 'crash':
        emit(fx, 'debris', event.x, event.y, 16, (rng) => {
          const angle = -Math.PI / 2 + (rng() - 0.5) * 2.6
          const velocity = 180 + rng() * 260
          const life = 2 + rng()
          return { vx: Math.cos(angle) * velocity - 60, vy: Math.sin(angle) * velocity, life, maxLife: life, size: 3 + rng() * 5, color: DEBRIS_COLORS[Math.floor(rng() * DEBRIS_COLORS.length)], spin: (rng() - 0.5) * 14 }
        })
        burst(fx, event.x, event.y, 24, SPARK_COLORS, 420)
        fx.rings.push({ x: event.x, y: event.y, life: 0.5, maxLife: 0.5, radius: 90, color: '#ffb36b' })
        shake(fx, 12)
        flash(fx, 0.5, '#ffb36b')
        fx.hitStop = Math.max(fx.hitStop, 0.08)
        text(fx, labels.crashed, event.x + 30, event.y - 50, '#ff8a6b', 26)
        break
      case 'splash':
        emit(fx, 'drop', event.x, WATER_Y, 28, (rng) => {
          const life = 0.9 + rng() * 0.5
          return { x: event.x - 30 + rng() * 60, vx: (rng() - 0.5) * 220, vy: -(220 + rng() * 320), life, maxLife: life, size: 2 + rng() * 2.5, color: rng() < 0.5 ? '#bfe6ff' : '#ffffff' }
        })
        fx.rings.push({ x: event.x, y: WATER_Y, life: 0.8, maxLife: 0.8, radius: 70, color: '#bfe6ff' })
        shake(fx, 5)
        break
    }
  }
}

export function updateParcelEffects(fx: ParcelEffects, dt: number): void {
  fx.shake = Math.max(0, fx.shake - dt * 30)
  fx.flash = Math.max(0, fx.flash - dt * 2.4)
  fx.hitStop = Math.max(0, fx.hitStop - dt)
  fx.liftPulse = Math.max(0, fx.liftPulse - dt * 4)

  fx.particles = fx.particles.filter((particle) => {
    particle.life -= dt
    if (particle.life <= 0) return false
    switch (particle.kind) {
      case 'puff':
        particle.vx *= 1 - dt * 2
        particle.vy *= 1 - dt * 2.5
        particle.size += dt * 14
        break
      case 'spark':
      case 'glint':
        particle.vx *= 1 - dt * 3
        particle.vy = particle.vy * (1 - dt * 3) + (particle.kind === 'spark' ? 300 : 40) * dt
        break
      case 'debris':
      case 'drop':
        particle.vy += 900 * dt
        break
    }
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.rotation += particle.spin * dt
    // Vragdele og dråber forsvinder i vandet.
    return !((particle.kind === 'debris' || particle.kind === 'drop') && particle.vy > 0 && particle.y > WATER_Y + 4)
  })
  fx.rings = fx.rings.filter((ring) => (ring.life -= dt) > 0)
  fx.texts = fx.texts.filter((entry) => {
    entry.life -= dt
    entry.y += entry.vy * dt
    return entry.life > 0
  })
  if (fx.banner && (fx.banner.life -= dt) <= 0) fx.banner = null
}

export function parcelShakeOffset(fx: ParcelEffects): { x: number; y: number } {
  if (fx.shake <= 0) return { x: 0, y: 0 }
  return { x: (fx.rng() - 0.5) * fx.shake, y: (fx.rng() - 0.5) * fx.shake }
}
