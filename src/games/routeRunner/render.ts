import { COMBO_WINDOW_SECONDS, EXPRESS_LIFETIME_SECONDS } from './config'
import { routeShakeOffset, type RouteEffects } from './effects'
import { VECTORS, type GameState, type Point } from './engine'
import type { RouteLabels } from './labels'
import { blit, BOARD, CELL, FIELD, getRouteSprites, type RouteSprites } from './sprites'

const FONT = "'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, sans-serif"
const TEXT_PIXELS = 24

export interface RouteRenderer {
  /** `focusY` giver et beskåret udsnit (cover) centreret om den logiske y-værdi, fx til menuens banner. */
  resize: (cssWidth: number, cssHeight: number, devicePixelRatio: number, focusY?: number) => void
  draw: (state: GameState, fx: RouteEffects, labels: RouteLabels, clock: number, options?: { hud?: boolean }) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const px = (x: number) => BOARD.x + x * CELL
const py = (y: number) => BOARD.y + y * CELL

export function createRouteRenderer(canvas: HTMLCanvasElement): RouteRenderer {
  const ctx = canvas.getContext('2d')!
  const sprites = getRouteSprites()
  const view = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1 }

  const resize: RouteRenderer['resize'] = (cssWidth, cssHeight, devicePixelRatio, focusY) => {
    const width = Math.max(1, Math.round(cssWidth))
    const height = Math.max(1, Math.round(cssHeight))
    const physicalWidth = Math.round(width * devicePixelRatio)
    const physicalHeight = Math.round(height * devicePixelRatio)
    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth
      canvas.height = physicalHeight
    }
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    view.dpr = devicePixelRatio
    if (focusY === undefined) {
      view.scale = width / FIELD.width
      view.offsetX = 0
      view.offsetY = 0
    } else {
      view.scale = Math.max(width / FIELD.width, height / FIELD.height)
      view.offsetX = (width - FIELD.width * view.scale) / 2
      view.offsetY = Math.min(0, Math.max(height - FIELD.height * view.scale, height / 2 - focusY * view.scale))
    }
  }

  const draw: RouteRenderer['draw'] = (state, fx, labels, clock, options = {}) => {
    const { scale, offsetX, offsetY, dpr } = view
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    blit(ctx, sprites.background, 0, 0, FIELD.width, FIELD.height)

    const shake = routeShakeOffset(fx)
    ctx.save()
    ctx.translate(shake.x, shake.y)
    drawObstacles(ctx, sprites, state)
    drawPickups(ctx, sprites, state, clock)
    drawTrain(ctx, sprites, state, clock)
    drawParticles(ctx, fx)
    drawRings(ctx, fx)
    drawTexts(ctx, fx)
    ctx.restore()

    if (options.hud !== false) drawHud(ctx, state, labels, clock)
    if (fx.flash > 0) {
      ctx.globalAlpha = fx.flash * 0.45
      ctx.fillStyle = fx.flashColor
      ctx.fillRect(0, 0, FIELD.width, FIELD.height)
      ctx.globalAlpha = 1
    }
  }

  return { resize, draw }
}

function drawObstacles(ctx: CanvasRenderingContext2D, sprites: RouteSprites, state: GameState) {
  for (const obstacle of state.obstacles) {
    for (const [x, y] of obstacle.cells) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fillRect(px(x) + 3, py(y) + 4, CELL, CELL)
      blit(ctx, obstacle.kind === 'rack' ? sprites.rack : sprites.pallet, px(x), py(y), CELL, CELL)
    }
  }
}

function drawPickups(ctx: CanvasRenderingContext2D, sprites: RouteSprites, state: GameState, clock: number) {
  const pickup = (point: Point, express: boolean) => {
    const bob = Math.sin(clock * 4 + point.x) * 2.5
    const cx = px(point.x) + CELL / 2
    const cy = py(point.y) + CELL / 2
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, express ? 30 : 20)
    glow.addColorStop(0, express ? 'rgba(255,209,102,0.55)' : 'rgba(255,214,150,0.35)')
    glow.addColorStop(1, 'rgba(255,214,150,0)')
    ctx.fillStyle = glow
    ctx.fillRect(cx - 32, cy - 32, 64, 64)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(cx, cy + 10, 9 - bob * 0.4, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    blit(ctx, express ? sprites.express : sprites.parcel, cx - 12, cy - 12 + bob - 2, 24, 24)
  }
  if (state.parcel.x >= 0) pickup(state.parcel, false)
  if (state.express) {
    pickup(state.express, true)
    const remaining = clamp((state.express.expiresAt - state.time) / EXPRESS_LIFETIME_SECONDS, 0, 1)
    const cx = px(state.express.x) + CELL / 2
    const cy = py(state.express.y) + CELL / 2
    ctx.strokeStyle = remaining < 0.3 && Math.floor(clock * 8) % 2 === 0 ? '#ff8a6b' : '#ffd166'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(cx, cy, CELL * 0.62, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2)
    ctx.stroke()
  }
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function angleBetween(from: Point, to: Point, fallback: number): number {
  if (from.x === to.x && from.y === to.y) return fallback
  return Math.atan2(to.y - from.y, to.x - from.x)
}

function drawTrain(ctx: CanvasRenderingContext2D, sprites: RouteSprites, state: GameState, clock: number) {
  const t = state.status === 'playing' ? state.progress : 0
  const nextDirection = state.queue[0] ?? state.direction
  const heading = Math.atan2(VECTORS[nextDirection].y, VECTORS[nextDirection].x)
  // Hver vogn glider fra sin celle mod cellen foran; hovedet mod den næste (evt. køede) retning.
  const ahead = state.segments.map((segment, index) => {
    const target = index === 0 ? { x: segment.x + VECTORS[nextDirection].x, y: segment.y + VECTORS[nextDirection].y } : state.segments[index - 1]
    return lerpPoint(segment, target, t)
  })
  const angles = ahead.map((point, index) => {
    const front = index === 0 ? { x: point.x + VECTORS[nextDirection].x, y: point.y + VECTORS[nextDirection].y } : ahead[index - 1]
    return angleBetween(point, front, heading)
  })

  const center = (p: Point) => ({ x: px(p.x) + CELL / 2, y: py(p.y) + CELL / 2 })
  // Koblinger mellem vognene
  ctx.strokeStyle = '#2a2f37'
  ctx.lineWidth = 3
  ctx.beginPath()
  ahead.forEach((point, index) => {
    const c = center(point)
    if (index === 0) ctx.moveTo(c.x, c.y)
    else ctx.lineTo(c.x, c.y)
  })
  ctx.stroke()

  for (let index = ahead.length - 1; index >= 0; index--) {
    const c = center(ahead[index])
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(angles[index])
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(-13 + 2, -10 + 3, index === 0 ? 32 : 24, 20)
    if (index === 0) blit(ctx, sprites.tractor, -17, -14, 34, 28)
    else blit(ctx, sprites.carts[(index - 1) % sprites.carts.length], -13, -12, 26, 24)
    ctx.restore()
  }

  if (state.status !== 'over') {
    const head = center(ahead[0])
    const angle = angles[0]
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.translate(head.x, head.y)
    ctx.rotate(angle)
    const beam = ctx.createLinearGradient(16, 0, 120, 0)
    beam.addColorStop(0, 'rgba(255,244,210,0.32)')
    beam.addColorStop(1, 'rgba(255,244,210,0)')
    ctx.fillStyle = beam
    ctx.beginPath()
    ctx.moveTo(16, -8)
    ctx.lineTo(120, -38)
    ctx.lineTo(120, 38)
    ctx.lineTo(16, 8)
    ctx.closePath()
    ctx.fill()
    if (Math.floor(clock * 3) % 2 === 0) {
      const beacon = ctx.createRadialGradient(-4, 0, 0, -4, 0, 16)
      beacon.addColorStop(0, 'rgba(255,150,40,0.85)')
      beacon.addColorStop(1, 'rgba(255,150,40,0)')
      ctx.fillStyle = beacon
      ctx.fillRect(-20, -16, 32, 32)
    }
    ctx.restore()
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, fx: RouteEffects) {
  for (const particle of fx.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1)
    const x = px(particle.x)
    const y = py(particle.y)
    const size = particle.size * CELL
    ctx.globalAlpha = particle.kind === 'dust' ? alpha * 0.4 : Math.min(1, alpha * 1.6)
    ctx.fillStyle = particle.color
    if (particle.kind === 'box') {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(particle.rotation)
      ctx.fillRect(-size, -size, size * 2, size * 2)
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(-size, -size, size * 2, size * 2)
      ctx.restore()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, Math.max(1, size), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function drawRings(ctx: CanvasRenderingContext2D, fx: RouteEffects) {
  for (const ring of fx.rings) {
    const progress = 1 - ring.life / ring.maxLife
    ctx.globalAlpha = (1 - progress) * 0.8
    ctx.strokeStyle = ring.color
    ctx.lineWidth = 3 * (1 - progress) + 1
    ctx.beginPath()
    ctx.arc(px(ring.x), py(ring.y), ring.radius * CELL * (0.3 + progress * 0.7), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function outlinedText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, fill: string, width = 4) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = width
  ctx.strokeStyle = 'rgba(5,8,14,0.9)'
  ctx.strokeText(value, x, y)
  ctx.fillStyle = fill
  ctx.fillText(value, x, y)
}

function drawTexts(ctx: CanvasRenderingContext2D, fx: RouteEffects) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const entry of fx.texts) {
    ctx.globalAlpha = clamp((entry.life / entry.maxLife) * 1.8, 0, 1)
    ctx.font = `800 ${Math.round(entry.size * TEXT_PIXELS)}px ${FONT}`
    const x = clamp(px(entry.x), BOARD.x + 60, BOARD.x + BOARD.width - 60)
    outlinedText(ctx, entry.text, x, Math.max(BOARD.y + 16, py(entry.y)), entry.color, 5)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, labels: RouteLabels, clock: number) {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `700 12px ${FONT}`
  outlinedText(ctx, labels.hud.score.toUpperCase(), BOARD.x, 28, 'rgba(232,240,255,0.75)', 3)
  ctx.font = `800 30px ${FONT}`
  outlinedText(ctx, labels.points(state.score), BOARD.x, 58, '#ffd166', 5)

  ctx.font = `700 12px ${FONT}`
  outlinedText(ctx, labels.hud.length.toUpperCase(), BOARD.x + 220, 28, 'rgba(232,240,255,0.75)', 3)
  ctx.font = `800 24px ${FONT}`
  outlinedText(ctx, String(state.segments.length - 1), BOARD.x + 220, 56, '#ffffff', 4)

  const sinceEat = state.time - state.lastEatAt
  if (state.combo >= 2 && sinceEat <= COMBO_WINDOW_SECONDS && state.status === 'playing') {
    const x = BOARD.x + 340
    ctx.font = `700 12px ${FONT}`
    outlinedText(ctx, `${labels.hud.combo} ${state.combo}`.toUpperCase(), x, 28, '#7cf5d4', 3)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(x, 40, 160, 10)
    ctx.fillStyle = state.multiplier >= 3 ? '#ffd166' : '#7cf5d4'
    ctx.fillRect(x, 40, 160 * clamp(1 - sinceEat / COMBO_WINDOW_SECONDS, 0, 1), 10)
    ctx.font = `800 18px ${FONT}`
    outlinedText(ctx, `×${state.multiplier}`, x + 170, 52, ctx.fillStyle as string, 4)
  }

  if (state.status === 'ready') {
    ctx.textAlign = 'center'
    ctx.font = `700 22px ${FONT}`
    ctx.globalAlpha = 0.65 + Math.sin(clock * 4) * 0.35
    outlinedText(ctx, labels.readyHint, BOARD.x + BOARD.width / 2, BOARD.y + BOARD.height * 0.72, '#ffffff', 5)
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }
}
