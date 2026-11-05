import { BRICK_COLORS, FIELD } from './config'
import type { GameState } from './engine'
import { prismShakeOffset, type PrismEffects } from './effects'
import type { PrismLabels } from './labels'
import { windowBounds } from './levels'
import { blit, getPrismSprites, hexColor, POWER_COLORS, PRISM_PALETTE, type PrismSprites } from './sprites'

const FONT = "'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, sans-serif"
const SPECTRUM = ['#ff5f6d', '#ffb347', '#ffe66d', '#67e8c1', '#72d6f5', '#9b8cff']
const FLOOR_Y = FIELD.height - 34
const LEAD_WIDTH = 3
const RAY_WIDTH = 74
const BASE_RAY_ALPHA = 0.1
const BASE_BLOOM_ALPHA = 0.55
const MAX_DUST_OPENINGS = 36
const TIMED_POWERS = [
  { kind: 'wide', key: 'wideUntil', seconds: 10 },
  { kind: 'fireball', key: 'fireballUntil', seconds: 8 },
  { kind: 'laser', key: 'laserUntil', seconds: 10 },
  { kind: 'magnet', key: 'magnetUntil', seconds: 8 },
  { kind: 'slow', key: 'slowUntil', seconds: 8 },
] as const

export interface PrismRenderer {
  /** `focusY` giver et beskåret udsnit (cover) centreret om den logiske y-værdi, fx til menuens banner. */
  resize: (cssWidth: number, cssHeight: number, devicePixelRatio: number, focusY?: number) => void
  draw: (state: GameState, fx: PrismEffects, labels: PrismLabels, clock: number, options?: { hud?: boolean }) => void
}

export function createPrismRenderer(canvas: HTMLCanvasElement): PrismRenderer {
  const ctx = canvas.getContext('2d')!
  const sprites = getPrismSprites()
  const view = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1 }

  const resize: PrismRenderer['resize'] = (cssWidth, cssHeight, devicePixelRatio, focusY) => {
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

  const draw: PrismRenderer['draw'] = (state, fx, labels, clock, options = {}) => {
    const { scale, offsetX, offsetY, dpr } = view
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    blit(ctx, sprites.background, 0, 0, FIELD.width, FIELD.height)

    const shake = prismShakeOffset(fx)
    ctx.save()
    ctx.translate(shake.x, shake.y)
    drawWindow(ctx, sprites, state, fx, clock)
    drawLight(ctx, sprites, state, clock, fx.reducedMotion)
    drawShield(ctx, state, clock)
    drawPickups(ctx, sprites, state, clock)
    drawLasers(ctx, state)
    drawPaddle(ctx, state, fx, clock)
    drawAim(ctx, state)
    drawBalls(ctx, state, fx)
    drawShards(ctx, fx)
    drawSparks(ctx, fx, clock)
    drawTexts(ctx, fx)
    ctx.restore()

    if (options.hud !== false) {
      drawHud(ctx, sprites, state, labels)
      drawBanner(ctx, fx)
    }
    if (fx.flash > 0) {
      ctx.globalAlpha = fx.flash * 0.5
      ctx.fillStyle = fx.flashColor
      ctx.fillRect(0, 0, FIELD.width, FIELD.height)
      ctx.globalAlpha = 1
    }
  }

  return { resize, draw }
}

function drawWindow(ctx: CanvasRenderingContext2D, sprites: PrismSprites, state: GameState, fx: PrismEffects, clock: number) {
  const frame = windowBounds(state.difficulty)
  const stone = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.height)
  stone.addColorStop(0, PRISM_PALETTE.stoneLight)
  stone.addColorStop(1, PRISM_PALETTE.stone)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(frame.x - 4, frame.y + 6, frame.width + 8, frame.height + 4)
  ctx.fillStyle = stone
  ctx.fillRect(frame.x, frame.y, frame.width, frame.height)
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 2
  ctx.strokeRect(frame.x + 1, frame.y + 1, frame.width - 2, frame.height - 2)

  const daylight = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.height)
  daylight.addColorStop(0, PRISM_PALETTE.daylight)
  daylight.addColorStop(1, PRISM_PALETTE.daylightDeep)
  const allClear = state.status === 'transition'
  for (const brick of state.bricks) {
    if (brick.dead) {
      blit(ctx, sprites.opening, brick.x, brick.y, brick.width, brick.height)
      continue
    }
    ctx.fillStyle = daylight
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height)

    const variant = brick.id % 3
    blit(ctx, sprites.panes[brick.kind][brick.colorIndex % BRICK_COLORS.length][variant], brick.x, brick.y, brick.width, brick.height)
    const damage = brick.maxHp - brick.hp
    if (damage > 0) blit(ctx, sprites.cracks[Math.min(1, damage - 1)][variant], brick.x, brick.y, brick.width, brick.height)

    if (brick.kind === 'crystal' && !fx.reducedMotion) {
      const sweep = ((clock * 0.6 + brick.id * 0.13) % 1.6) - 0.3
      const stop = (value: number) => Math.min(1, Math.max(0, value))
      const shimmer = ctx.createLinearGradient(brick.x, brick.y, brick.x + brick.width, brick.y + brick.height)
      shimmer.addColorStop(stop(sweep - 0.25), 'rgba(255,255,255,0)')
      shimmer.addColorStop(stop(sweep), 'rgba(255,255,255,0.55)')
      shimmer.addColorStop(stop(sweep + 0.25), 'rgba(255,255,255,0)')
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = shimmer
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height)
      ctx.restore()
    }
    if (brick.kind === 'reactor') {
      const pulse = 0.35 + Math.sin(clock * 5 + brick.id) * 0.2
      const glow = ctx.createRadialGradient(brick.x + brick.width / 2, brick.y + brick.height / 2, 2, brick.x + brick.width / 2, brick.y + brick.height / 2, 40)
      glow.addColorStop(0, `rgba(255,170,80,${pulse})`)
      glow.addColorStop(1, 'rgba(255,170,80,0)')
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = glow
      ctx.fillRect(brick.x - 20, brick.y - 20, brick.width + 40, brick.height + 40)
      ctx.restore()
    }
    const hit = fx.hits.get(brick.id)
    if (hit) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = Math.min(1, hit / 0.14) * 0.7
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height)
      ctx.restore()
    }
  }

  ctx.strokeStyle = PRISM_PALETTE.lead
  ctx.lineWidth = LEAD_WIDTH
  for (const brick of state.bricks) ctx.strokeRect(brick.x - 1, brick.y - 1, brick.width + 2, brick.height + 2)

  // Lyset fra knuste ruder bløder ud over blyet, så hullerne læses som åbninger mod dagslys.
  const openings = state.bricks.filter((brick) => brick.dead)
  if (openings.length > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = BASE_BLOOM_ALPHA / (1 + openings.length / 30)
    for (const brick of openings) blit(ctx, sprites.bloom, brick.x + brick.width / 2 - 64, brick.y + brick.height / 2 - 42, 128, 84)
    ctx.restore()
  }

  if (allClear) {
    const remaining = Math.max(0, state.transitionUntil - state.time)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(1, remaining / 1.6) * 0.5
    ctx.fillStyle = PRISM_PALETTE.daylight
    ctx.fillRect(frame.x, frame.y, frame.width, frame.height)
    ctx.restore()
  }
}

function drawLight(ctx: CanvasRenderingContext2D, sprites: PrismSprites, state: GameState, clock: number, reducedMotion: boolean) {
  const openings = state.bricks.filter((brick) => brick.dead)
  if (openings.length === 0) return
  const alpha = BASE_RAY_ALPHA / (1 + openings.length / 35)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const brick of openings) {
    const centerX = brick.x + brick.width / 2
    const top = brick.y + brick.height
    const flicker = reducedMotion ? 1 : 0.85 + Math.sin(clock * 1.7 + brick.id * 0.9) * 0.15
    ctx.globalAlpha = alpha * flicker
    blit(ctx, sprites.ray, centerX - RAY_WIDTH / 2, top, RAY_WIDTH, FLOOR_Y - top)
    ctx.globalAlpha = alpha * 1.6
    blit(ctx, sprites.pool, centerX - 70, FLOOR_Y - 12, 140, 24)
  }
  if (!reducedMotion) {
    // Støvkorn der langsomt daler gennem lysstrålerne.
    ctx.fillStyle = '#fff3d0'
    for (const brick of openings.slice(-MAX_DUST_OPENINGS)) {
      const centerX = brick.x + brick.width / 2
      const top = brick.y + brick.height
      const span = FLOOR_Y - top
      for (let mote = 0; mote < 3; mote++) {
        const progress = ((clock * 0.05 + brick.id * 0.137 + mote * 0.33) % 1 + 1) % 1
        const x = centerX + Math.sin(clock * 0.6 + brick.id + mote * 2.1) * RAY_WIDTH * 0.28 * (0.4 + progress)
        ctx.globalAlpha = 0.5 * Math.sin(progress * Math.PI)
        ctx.fillRect(x, top + progress * span, 1.6, 1.6)
      }
    }
  }
  ctx.restore()
}

function drawShield(ctx: CanvasRenderingContext2D, state: GameState, clock: number) {
  if (!state.powers.shield) return
  const y = FIELD.height - 12
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = `rgba(127,184,255,${0.65 + Math.sin(clock * 6) * 0.2})`
  ctx.lineWidth = 3
  ctx.shadowColor = '#7fb8ff'
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.lineTo(FIELD.width, y)
  ctx.stroke()
  ctx.restore()
}

function drawPickups(ctx: CanvasRenderingContext2D, sprites: PrismSprites, state: GameState, clock: number) {
  for (const pickup of state.pickups) {
    const bob = Math.sin(clock * 6 + pickup.id) * 1.5
    const size = 30 * (1 + Math.sin(clock * 8 + pickup.id) * 0.05)
    blit(ctx, sprites.pickups[pickup.kind], pickup.x - size / 2, pickup.y - size / 2 + bob, size, size)
  }
}

function drawLasers(ctx: CanvasRenderingContext2D, state: GameState) {
  if (state.lasers.length === 0) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const laser of state.lasers) {
    const beam = ctx.createLinearGradient(laser.x - 4, 0, laser.x + 4, 0)
    beam.addColorStop(0, 'rgba(255,126,121,0)')
    beam.addColorStop(0.5, 'rgba(255,240,240,1)')
    beam.addColorStop(1, 'rgba(255,126,121,0)')
    ctx.fillStyle = beam
    ctx.fillRect(laser.x - 4, laser.y - 9, 8, 18)
  }
  ctx.restore()
}

function drawPaddle(ctx: CanvasRenderingContext2D, state: GameState, fx: PrismEffects, clock: number) {
  const { x, y, width, height } = state.paddle
  const left = x - width / 2
  const top = y - height / 2
  const bevelInset = Math.min(8, width * 0.08)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const pool = ctx.createRadialGradient(x, y + 10, 4, x, y + 10, width * 0.7)
  pool.addColorStop(0, 'rgba(114,214,245,0.25)')
  pool.addColorStop(1, 'rgba(114,214,245,0)')
  ctx.fillStyle = pool
  ctx.fillRect(x - width, y - 20, width * 2, 60)
  ctx.restore()

  const shape = () => {
    ctx.beginPath()
    ctx.moveTo(left + bevelInset, top)
    ctx.lineTo(left + width - bevelInset, top)
    ctx.lineTo(left + width, top + height)
    ctx.lineTo(left, top + height)
    ctx.closePath()
  }
  const body = ctx.createLinearGradient(0, top, 0, top + height)
  body.addColorStop(0, 'rgba(242,251,255,0.95)')
  body.addColorStop(1, 'rgba(110,160,190,0.9)')
  shape()
  ctx.fillStyle = body
  ctx.fill()

  ctx.save()
  shape()
  ctx.clip()
  ctx.globalCompositeOperation = 'lighter'
  const spectrum = ctx.createLinearGradient(left, 0, left + width, 0)
  const drift = fx.reducedMotion ? 0 : (clock * 0.25) % 1
  SPECTRUM.forEach((color, index) => spectrum.addColorStop((index / SPECTRUM.length + drift) % 1, color))
  ctx.globalAlpha = 0.45 + fx.paddleFlash * 0.4
  ctx.fillStyle = spectrum
  ctx.fillRect(left, top + height * 0.45, width, height * 0.55)
  if (fx.paddleFlash > 0) {
    ctx.globalAlpha = fx.paddleFlash * 0.6
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(left, top, width, height)
  }
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(left + bevelInset, top + 0.75)
  ctx.lineTo(left + width - bevelInset, top + 0.75)
  ctx.stroke()

  if (state.powers.laserUntil > state.time) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const emitterX of [left + 6, left + width - 6]) {
      const glow = ctx.createRadialGradient(emitterX, top, 0, emitterX, top, 10)
      glow.addColorStop(0, 'rgba(255,200,200,1)')
      glow.addColorStop(1, 'rgba(255,126,121,0)')
      ctx.fillStyle = glow
      ctx.fillRect(emitterX - 10, top - 10, 20, 20)
    }
    ctx.restore()
  }
  if (state.powers.magnetUntil > state.time) {
    ctx.save()
    ctx.strokeStyle = POWER_COLORS.magnet
    ctx.lineWidth = 1.5
    for (let i = 0; i < 3; i++) {
      const phase = (clock * 1.5 + i / 3) % 1
      ctx.globalAlpha = 1 - phase
      ctx.beginPath()
      ctx.ellipse(x, top, width * 0.35 + phase * 18, 6 + phase * 16, 0, Math.PI, 0)
      ctx.stroke()
    }
    ctx.restore()
  }
}

function drawAim(ctx: CanvasRenderingContext2D, state: GameState) {
  if (state.status !== 'serve') return
  ctx.save()
  ctx.fillStyle = '#ffffff'
  for (const ball of state.balls) {
    if (!ball.attached) continue
    for (let i = 1; i <= 8; i++) {
      ctx.globalAlpha = 0.55 * (1 - i / 9)
      ctx.beginPath()
      ctx.arc(ball.x + Math.sin(0.25) * i * 16, ball.y - Math.cos(0.25) * i * 16, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawBalls(ctx: CanvasRenderingContext2D, state: GameState, fx: PrismEffects) {
  const fire = state.powers.fireballUntil > state.time
  const channels = fire
    ? [{ color: '#ff5f2e', shift: -1.5 }, { color: '#ffb347', shift: 0 }, { color: '#ffe66d', shift: 1.5 }]
    : [{ color: '#ff5f6d', shift: -2.2 }, { color: '#67e8c1', shift: 0 }, { color: '#72d6f5', shift: 2.2 }]
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const ball of state.balls) {
    const trail = fx.trails.get(ball.id)
    const speed = Math.hypot(ball.vx, ball.vy)
    const perpX = speed > 0 ? -ball.vy / speed : 0
    const perpY = speed > 0 ? ball.vx / speed : 0
    if (trail && trail.length > 1 && !ball.attached) {
      for (const channel of channels) {
        ctx.fillStyle = channel.color
        trail.forEach((point, index) => {
          const t = (index + 1) / trail.length
          ctx.globalAlpha = t * 0.32
          ctx.beginPath()
          ctx.arc(point.x + perpX * channel.shift, point.y + perpY * channel.shift, ball.radius * (0.35 + 0.65 * t), 0, Math.PI * 2)
          ctx.fill()
        })
      }
    }
    ctx.globalAlpha = 1
    const glow = ctx.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, ball.radius * 3.2)
    glow.addColorStop(0, fire ? 'rgba(255,190,110,0.9)' : 'rgba(230,250,255,0.85)')
    glow.addColorStop(1, 'rgba(160,220,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(ball.x - ball.radius * 3.2, ball.y - ball.radius * 3.2, ball.radius * 6.4, ball.radius * 6.4)
  }
  ctx.restore()
  for (const ball of state.balls) {
    ctx.fillStyle = fire ? '#fff1d6' : '#ffffff'
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = fire ? 'rgba(255,140,60,0.9)' : 'rgba(114,214,245,0.9)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

function drawShards(ctx: CanvasRenderingContext2D, fx: PrismEffects) {
  for (const shard of fx.shards) {
    const alpha = Math.min(1, shard.life / (shard.maxLife * 0.35))
    ctx.save()
    ctx.translate(shard.x, shard.y)
    ctx.rotate(shard.rotation)
    ctx.globalAlpha = alpha * 0.88
    ctx.fillStyle = hexColor(BRICK_COLORS[shard.colorIndex % BRICK_COLORS.length])
    ctx.beginPath()
    ctx.moveTo(shard.points[0][0], shard.points[0][1])
    ctx.lineTo(shard.points[1][0], shard.points[1][1])
    ctx.lineTo(shard.points[2][0], shard.points[2][1])
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = alpha * 0.8
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(shard.points[0][0], shard.points[0][1])
    ctx.lineTo(shard.points[1][0], shard.points[1][1])
    ctx.stroke()
    ctx.restore()
  }
}

function drawSparks(ctx: CanvasRenderingContext2D, fx: PrismEffects, clock: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const spark of fx.sparks) {
    ctx.globalAlpha = spark.life / spark.maxLife
    ctx.fillStyle = spark.color
    ctx.beginPath()
    ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const ring of fx.rings) {
    const t = 1 - ring.life / ring.maxLife
    ctx.globalAlpha = (1 - t) * 0.9
    ctx.strokeStyle = ring.color
    ctx.lineWidth = 6 * (1 - t) + 1
    ctx.beginPath()
    ctx.arc(ring.x, ring.y, ring.radius * (0.2 + 0.8 * t), 0, Math.PI * 2)
    ctx.stroke()
  }
  for (const burst of fx.prisms) {
    const t = 1 - burst.life / burst.maxLife
    const length = 60 + t * 260
    SPECTRUM.forEach((color, index) => {
      const angle = burst.angle + (index - SPECTRUM.length / 2) * 0.09 + Math.sin(clock + index) * 0.01
      ctx.globalAlpha = (1 - t) * 0.5
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(burst.x, burst.y)
      ctx.lineTo(burst.x + Math.cos(angle - 0.04) * length, burst.y + Math.sin(angle - 0.04) * length)
      ctx.lineTo(burst.x + Math.cos(angle + 0.04) * length, burst.y + Math.sin(angle + 0.04) * length)
      ctx.closePath()
      ctx.fill()
    })
  }
  ctx.restore()
}

function outlinedText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, fill: string, stroke = 'rgba(8,10,18,0.85)', width = 4) {
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke
  ctx.lineWidth = width
  ctx.strokeText(value, x, y)
  ctx.fillStyle = fill
  ctx.fillText(value, x, y)
}

function drawTexts(ctx: CanvasRenderingContext2D, fx: PrismEffects) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const entry of fx.texts) {
    const progress = 1 - entry.life / entry.maxLife
    ctx.globalAlpha = Math.min(1, (entry.life / entry.maxLife) * 2.5)
    const pop = progress < 0.15 ? 0.7 + progress * 2 : 1
    ctx.font = `800 ${Math.round(entry.size * pop)}px ${FONT}`
    outlinedText(ctx, entry.text, entry.x, entry.y, entry.color)
  }
  ctx.globalAlpha = 1
}

function drawHud(ctx: CanvasRenderingContext2D, sprites: PrismSprites, state: GameState, labels: PrismLabels) {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `600 11px ${FONT}`
  outlinedText(ctx, labels.hud.score, 60, 18, 'rgba(242,251,255,0.7)', 'rgba(8,10,18,0.6)', 3)
  ctx.font = `800 26px ${FONT}`
  outlinedText(ctx, labels.points(state.score), 60, 44, '#f2fbff')

  const multiplier = Math.min(5, 1 + Math.floor(state.chain / 5))
  if (multiplier > 1) {
    const textWidth = ctx.measureText(labels.points(state.score)).width
    ctx.fillStyle = PRISM_PALETTE.mint
    ctx.beginPath()
    ctx.roundRect(70 + textWidth, 25, 44, 22, 11)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.font = `800 14px ${FONT}`
    ctx.fillStyle = PRISM_PALETTE.night
    ctx.fillText(`×${multiplier}`, 92 + textWidth, 41)
  }

  ctx.textAlign = 'center'
  ctx.font = `700 14px ${FONT}`
  outlinedText(ctx, labels.level(state.level), FIELD.width / 2, 36, 'rgba(242,251,255,0.85)', 'rgba(8,10,18,0.6)', 3)

  const right = FIELD.width - 60
  for (let i = 0; i < state.lives; i++) {
    const x = right - 24 - i * 30
    ctx.fillStyle = 'rgba(242,251,255,0.9)'
    ctx.beginPath()
    ctx.moveTo(x + 3, 24)
    ctx.lineTo(x + 21, 24)
    ctx.lineTo(x + 24, 31)
    ctx.lineTo(x, 31)
    ctx.closePath()
    ctx.fill()
    const band = ctx.createLinearGradient(x, 0, x + 24, 0)
    SPECTRUM.forEach((color, index) => band.addColorStop(index / (SPECTRUM.length - 1), color))
    ctx.fillStyle = band
    ctx.fillRect(x + 1, 28, 22, 3)
  }

  let slot = 0
  const powerY = 46
  for (const power of TIMED_POWERS) {
    const until = state.powers[power.key]
    if (until <= state.time) continue
    const x = right - 12 - slot * 30
    blit(ctx, sprites.pickups[power.kind], x - 12, powerY, 24, 24)
    const remaining = Math.min(1, (until - state.time) / power.seconds)
    ctx.strokeStyle = POWER_COLORS[power.kind]
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, powerY + 12, 13, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2)
    ctx.stroke()
    slot++
  }
  if (state.powers.shield) blit(ctx, sprites.pickups.shield, right - 24 - slot * 30, powerY, 24, 24)
}

function drawBanner(ctx: CanvasRenderingContext2D, fx: PrismEffects) {
  const banner = fx.banner
  if (!banner) return
  const elapsed = banner.maxLife - banner.life
  const fadeIn = Math.min(1, elapsed / 0.25)
  const fadeOut = Math.min(1, banner.life / 0.4)
  const scale = fx.reducedMotion ? 1 : 0.85 + 0.15 * (1 - (1 - fadeIn) ** 3)
  const color = banner.tone === 'good' ? PRISM_PALETTE.mint : banner.tone === 'bad' ? PRISM_PALETTE.coral : '#f2fbff'
  ctx.save()
  ctx.globalAlpha = fadeIn * fadeOut
  ctx.translate(FIELD.width / 2, FIELD.height * 0.6)
  ctx.scale(scale, scale)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 48px ${FONT}`
  outlinedText(ctx, banner.title, 0, 0, color, 'rgba(8,10,18,0.9)', 8)
  if (banner.subtitle) {
    ctx.font = `600 18px ${FONT}`
    outlinedText(ctx, banner.subtitle, 0, 40, '#f2fbff', 'rgba(8,10,18,0.85)', 5)
  }
  ctx.restore()
}
