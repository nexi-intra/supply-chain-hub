import type { GameEvent } from './engine'
import type { RouteLabels } from './labels'

// Positioner i gitterceller (x, y er cellens hjørne; +0.5 er midten); renderen omregner til pixels.
export type ParticleKind = 'glint' | 'dust' | 'box' | 'spark'

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

export interface RouteEffects {
  reducedMotion: boolean
  rng: () => number
  particles: Particle[]
  rings: Ring[]
  texts: FloatingText[]
  shake: number
  flash: number
  flashColor: string
}

export const MAX_PARTICLES = 400
const MAX_TEXTS = 10
export const CARGO_COLORS = ['#c99a5b', '#e2574c', '#3f7fd8', '#5cbf5a', '#f2c14e', '#9b6fd6']

export function createRouteEffects(options: { reducedMotion: boolean; rng?: () => number }): RouteEffects {
  return { reducedMotion: options.reducedMotion, rng: options.rng ?? Math.random, particles: [], rings: [], texts: [], shake: 0, flash: 0, flashColor: '#ffffff' }
}

function emit(fx: RouteEffects, amount: number, make: (rng: () => number) => Omit<Particle, 'rotation'>): void {
  const total = Math.max(1, Math.round(amount * (fx.reducedMotion ? 0.4 : 1)))
  for (let i = 0; i < total; i++) fx.particles.push({ rotation: fx.rng() * Math.PI * 2, ...make(fx.rng) })
  if (fx.particles.length > MAX_PARTICLES) fx.particles.splice(0, fx.particles.length - MAX_PARTICLES)
}

function burst(fx: RouteEffects, kind: ParticleKind, x: number, y: number, amount: number, colors: string[], speed: number, life = 0.6): void {
  emit(fx, amount, (rng) => {
    const angle = rng() * Math.PI * 2
    const velocity = speed * (0.3 + rng() * 0.7)
    const span = life * (0.6 + rng() * 0.6)
    return { kind, x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: span, maxLife: span, size: 0.08 + rng() * 0.1, color: colors[Math.floor(rng() * colors.length)], spin: (rng() - 0.5) * 10 }
  })
}

function text(fx: RouteEffects, value: string, x: number, y: number, color: string, size = 1): void {
  fx.texts.push({ text: value, x, y, vy: -1.3, life: 1, maxLife: 1, color, size })
  if (fx.texts.length > MAX_TEXTS) fx.texts.splice(0, fx.texts.length - MAX_TEXTS)
}

export function applyRouteEvents(fx: RouteEffects, events: GameEvent[], labels: RouteLabels): void {
  for (const event of events) {
    const cx = event.type === 'start' || event.type === 'gameOver' ? 0 : event.x + 0.5
    const cy = event.type === 'start' || event.type === 'gameOver' ? 0 : event.y + 0.5
    switch (event.type) {
      case 'eat': {
        const express = event.kind === 'express'
        burst(fx, 'glint', cx, cy, express ? 22 : 10, express ? ['#ffd166', '#fff3c4', '#ffffff'] : ['#e7b97a', '#fff1d6', '#ffffff'], express ? 7 : 4.5)
        fx.rings.push({ x: cx, y: cy, life: 0.4, maxLife: 0.4, radius: express ? 2.4 : 1.4, color: express ? '#ffd166' : '#f3d3a0' })
        const suffix = event.multiplier > 1 ? ` ×${event.multiplier}` : ''
        const value = `+${labels.points(event.points)}${suffix}`
        text(fx, express ? `${labels.express} ${value}` : value, cx, cy - 0.8, express ? '#ffd166' : event.multiplier > 1 ? '#7cf5d4' : '#ffffff', express ? 1.15 : 0.9)
        break
      }
      case 'expressSpawn':
        fx.rings.push({ x: cx, y: cy, life: 0.7, maxLife: 0.7, radius: 2.2, color: '#ffd166' })
        break
      case 'expressExpired':
        burst(fx, 'dust', cx, cy, 10, ['#cfc6b4', '#a9a294'], 2, 0.7)
        break
      case 'crash':
        emit(fx, 14, (rng) => {
          const angle = -Math.PI / 2 + (rng() - 0.5) * 3
          const velocity = 4 + rng() * 7
          const life = 1 + rng() * 0.8
          return { kind: 'box', x: cx, y: cy, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life, maxLife: life, size: 0.22 + rng() * 0.2, color: CARGO_COLORS[Math.floor(rng() * CARGO_COLORS.length)], spin: (rng() - 0.5) * 14 }
        })
        burst(fx, 'spark', cx, cy, 20, ['#ffd166', '#ffb36b', '#ffffff'], 9, 0.5)
        fx.rings.push({ x: cx, y: cy, life: 0.5, maxLife: 0.5, radius: 3, color: '#ffb36b' })
        if (!fx.reducedMotion) fx.shake = Math.max(fx.shake, 10)
        fx.flash = Math.max(fx.flash, fx.reducedMotion ? 0.2 : 0.45)
        fx.flashColor = '#ff8a6b'
        text(fx, labels.crashed, cx, cy - 1.2, '#ff8a6b', 1.2)
        break
    }
  }
}

export function updateRouteEffects(fx: RouteEffects, dt: number): void {
  fx.shake = Math.max(0, fx.shake - dt * 28)
  fx.flash = Math.max(0, fx.flash - dt * 2.2)
  fx.particles = fx.particles.filter((particle) => {
    particle.life -= dt
    if (particle.life <= 0) return false
    if (particle.kind === 'box') particle.vy += 18 * dt
    else if (particle.kind === 'spark') particle.vy += 10 * dt
    else {
      particle.vx *= 1 - dt * 3
      particle.vy *= 1 - dt * 3
    }
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.rotation += particle.spin * dt
    return true
  })
  fx.rings = fx.rings.filter((ring) => (ring.life -= dt) > 0)
  fx.texts = fx.texts.filter((entry) => {
    entry.life -= dt
    entry.y += entry.vy * dt
    return entry.life > 0
  })
}

export function routeShakeOffset(fx: RouteEffects): { x: number; y: number } {
  if (fx.shake <= 0) return { x: 0, y: 0 }
  return { x: (fx.rng() - 0.5) * fx.shake, y: (fx.rng() - 0.5) * fx.shake }
}
