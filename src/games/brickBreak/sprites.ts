import { BRICK_COLORS, FIELD } from './config'
import type { PowerKind } from './engine'
import type { BrickKind } from './levels'
import { createRng } from '../chickenInvaders/rng'

export interface Sprite {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

export const PRISM_PALETTE = {
  night: '#0b0f1a',
  stone: '#1d2232',
  stoneLight: '#2b3246',
  lead: '#151821',
  daylight: '#fff6dc',
  daylightDeep: '#ffd99a',
  mint: '#67e8c1',
  coral: '#ff7e79',
  sky: '#72d6f5',
}

export const POWER_COLORS: Record<PowerKind, string> = {
  wide: '#67e8c1',
  multiball: '#72d6f5',
  fireball: '#ff9f43',
  laser: '#ff7e79',
  magnet: '#b69cff',
  slow: '#9fd8ff',
  shield: '#7fb8ff',
  life: '#7ee787',
}

const SCALE = 3
export const BRICK_SPRITE = { width: 52, height: 20 }

export function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`
}

function mix(value: number, target: number, amount: number): string {
  const channel = (shift: number) => {
    const from = (value >> shift) & 255
    const to = (target >> shift) & 255
    return Math.round(from + (to - from) * amount)
  }
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

function make(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, scale = SCALE): Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * scale)
  canvas.height = Math.ceil(h * scale)
  const c = canvas.getContext('2d')!
  c.scale(scale, scale)
  c.lineJoin = 'round'
  c.lineCap = 'round'
  draw(c)
  return { canvas, w, h }
}

function paneBody(c: CanvasRenderingContext2D, color: number, w: number, h: number, alpha: number) {
  const body = c.createLinearGradient(0, 0, 0, h)
  body.addColorStop(0, mix(color, 0xffffff, 0.45))
  body.addColorStop(0.45, hexColor(color))
  body.addColorStop(1, mix(color, 0x000000, 0.3))
  c.globalAlpha = alpha
  c.fillStyle = body
  c.fillRect(0, 0, w, h)
  c.globalAlpha = 1
}

function bevel(c: CanvasRenderingContext2D, w: number, h: number) {
  c.lineWidth = 1
  c.strokeStyle = 'rgba(255,255,255,0.65)'
  c.beginPath()
  c.moveTo(1, h - 1.5)
  c.lineTo(1, 1)
  c.lineTo(w - 1.5, 1)
  c.stroke()
  c.strokeStyle = 'rgba(0,0,0,0.35)'
  c.beginPath()
  c.moveTo(w - 1, 1.5)
  c.lineTo(w - 1, h - 1)
  c.lineTo(1.5, h - 1)
  c.stroke()
}

function streak(c: CanvasRenderingContext2D, w: number, h: number, offset: number) {
  c.save()
  c.globalAlpha = 0.3
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.moveTo(w * offset, 0)
  c.lineTo(w * offset + 7, 0)
  c.lineTo(w * offset - 3, h)
  c.lineTo(w * offset - 7, h)
  c.closePath()
  c.fill()
  c.globalAlpha = 0.15
  c.beginPath()
  c.moveTo(w * offset + 10, 0)
  c.lineTo(w * offset + 12, 0)
  c.lineTo(w * offset + 4, h)
  c.lineTo(w * offset + 2, h)
  c.closePath()
  c.fill()
  c.restore()
}

function seeds(c: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rng = createRng(seed)
  c.fillStyle = 'rgba(255,255,255,0.45)'
  for (let i = 0; i < 4; i++) {
    c.beginPath()
    c.arc(4 + rng() * (w - 8), 3 + rng() * (h - 6), 0.5 + rng() * 0.8, 0, Math.PI * 2)
    c.fill()
  }
  c.strokeStyle = 'rgba(255,255,255,0.12)'
  c.lineWidth = 0.8
  c.beginPath()
  c.moveTo(0, h * 0.6)
  c.bezierCurveTo(w * 0.3, h * 0.4, w * 0.6, h * 0.85, w, h * 0.55)
  c.stroke()
}

function drawGlass(c: CanvasRenderingContext2D, color: number, w: number, h: number, seed: number) {
  paneBody(c, color, w, h, 0.84)
  seeds(c, w, h, seed)
  streak(c, w, h, 0.22 + (seed % 3) * 0.12)
  bevel(c, w, h)
}

function drawArmored(c: CanvasRenderingContext2D, color: number, w: number, h: number, seed: number) {
  paneBody(c, color, w, h, 0.95)
  const rng = createRng(seed)
  for (let i = 0; i < 70; i++) {
    c.fillStyle = `rgba(255,255,255,${0.08 + rng() * 0.12})`
    c.fillRect(rng() * w, rng() * h, 1, 1)
  }
  streak(c, w, h, 0.3)
  bevel(c, w, h)
  const brass = c.createLinearGradient(0, 0, w, h)
  brass.addColorStop(0, '#f3d589')
  brass.addColorStop(1, '#a8792e')
  c.fillStyle = brass
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]]) {
    c.beginPath()
    c.moveTo(x, y)
    c.lineTo(x + sx * 9, y)
    c.lineTo(x + sx * 9, y + sy * 2.5)
    c.lineTo(x + sx * 2.5, y + sy * 2.5)
    c.lineTo(x + sx * 2.5, y + sy * 7)
    c.lineTo(x, y + sy * 7)
    c.closePath()
    c.fill()
    c.beginPath()
    c.arc(x + sx * 4.5, y + sy * 4.5, 1.1, 0, Math.PI * 2)
    c.fillStyle = '#fff1c2'
    c.fill()
    c.fillStyle = brass
  }
}

function drawCrystal(c: CanvasRenderingContext2D, color: number, w: number, h: number) {
  const cx = w / 2
  const cy = h / 2
  const corners: Array<[number, number]> = [[0, 0], [cx, 0], [w, 0], [w, cy], [w, h], [cx, h], [0, h], [0, cy]]
  corners.forEach(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % corners.length]
    c.beginPath()
    c.moveTo(cx, cy)
    c.lineTo(x, y)
    c.lineTo(nx, ny)
    c.closePath()
    c.fillStyle = mix(color, i % 2 ? 0xffffff : 0x000000, i % 2 ? 0.25 + (i % 3) * 0.12 : 0.1 + (i % 3) * 0.08)
    c.globalAlpha = 0.9
    c.fill()
  })
  c.globalAlpha = 1
  c.strokeStyle = 'rgba(255,255,255,0.4)'
  c.lineWidth = 0.6
  for (const [x, y] of corners) {
    c.beginPath()
    c.moveTo(cx, cy)
    c.lineTo(x, y)
    c.stroke()
  }
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.moveTo(cx, cy - 6)
  c.lineTo(cx + 1.3, cy - 1.3)
  c.lineTo(cx + 6, cy)
  c.lineTo(cx + 1.3, cy + 1.3)
  c.lineTo(cx, cy + 6)
  c.lineTo(cx - 1.3, cy + 1.3)
  c.lineTo(cx - 6, cy)
  c.lineTo(cx - 1.3, cy - 1.3)
  c.closePath()
  c.fill()
  bevel(c, w, h)
}

function drawReactor(c: CanvasRenderingContext2D, w: number, h: number) {
  paneBody(c, 0x7a3410, w, h, 0.95)
  const core = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w * 0.42)
  core.addColorStop(0, '#fff3c4')
  core.addColorStop(0.25, '#ffb347')
  core.addColorStop(0.7, 'rgba(255,110,40,0.35)')
  core.addColorStop(1, 'rgba(255,110,40,0)')
  c.fillStyle = core
  c.fillRect(0, 0, w, h)
  c.strokeStyle = 'rgba(255,220,150,0.8)'
  c.lineWidth = 1.2
  c.beginPath()
  c.arc(w / 2, h / 2, 5.5, 0, Math.PI * 2)
  c.stroke()
  c.fillStyle = 'rgba(20,10,5,0.55)'
  for (let i = 0; i < 6; i++) c.fillRect(2 + i * 3.4, h - 3, 1.8, 2)
  for (let i = 0; i < 6; i++) c.fillRect(w - 3.8 - i * 3.4, 1, 1.8, 2)
  bevel(c, w, h)
}

function drawCracks(c: CanvasRenderingContext2D, w: number, h: number, stage: number, seed: number) {
  const rng = createRng(seed)
  const originX = w * (0.3 + rng() * 0.4)
  const originY = h * (0.3 + rng() * 0.4)
  const branches = stage === 1 ? 4 : 7
  for (const [color, width, offset] of [['rgba(0,0,0,0.45)', 1.4, 0.6], ['rgba(255,255,255,0.9)', 0.8, 0]] as const) {
    const inner = createRng(seed * 7 + 1)
    c.strokeStyle = color
    c.lineWidth = width
    for (let i = 0; i < branches; i++) {
      const angle = (i / branches) * Math.PI * 2 + inner() * 0.6
      let x = originX + offset
      let y = originY + offset
      c.beginPath()
      c.moveTo(x, y)
      const segments = 2 + Math.floor(inner() * 3)
      for (let s = 0; s < segments; s++) {
        const length = (stage === 1 ? 5 : 8) + inner() * 8
        const bend = angle + (inner() - 0.5) * 0.9
        x += Math.cos(bend) * length
        y += Math.sin(bend) * length * 0.55
        c.lineTo(x, y)
      }
      c.stroke()
    }
  }
  if (stage >= 2) {
    c.strokeStyle = 'rgba(255,255,255,0.55)'
    c.lineWidth = 0.6
    c.beginPath()
    c.arc(originX, originY, 4, 0, Math.PI * 2)
    c.stroke()
  }
}

function drawPickupIcon(c: CanvasRenderingContext2D, kind: PowerKind) {
  c.strokeStyle = '#ffffff'
  c.fillStyle = '#ffffff'
  c.lineWidth = 1.8
  const cx = 15
  const cy = 15
  switch (kind) {
    case 'wide':
      c.fillRect(cx - 7, cy - 1.5, 14, 3)
      c.beginPath()
      c.moveTo(cx - 9, cy)
      c.lineTo(cx - 6, cy - 3)
      c.lineTo(cx - 6, cy + 3)
      c.closePath()
      c.moveTo(cx + 9, cy)
      c.lineTo(cx + 6, cy - 3)
      c.lineTo(cx + 6, cy + 3)
      c.closePath()
      c.fill()
      break
    case 'multiball':
      for (const [x, y] of [[cx, cy - 4], [cx - 4.5, cy + 3], [cx + 4.5, cy + 3]]) {
        c.beginPath()
        c.arc(x, y, 2.6, 0, Math.PI * 2)
        c.fill()
      }
      break
    case 'fireball':
      c.beginPath()
      c.moveTo(cx, cy - 8)
      c.quadraticCurveTo(cx + 7, cy - 1, cx + 4, cy + 5)
      c.quadraticCurveTo(cx, cy + 9, cx - 4, cy + 5)
      c.quadraticCurveTo(cx - 6, cy, cx - 2, cy - 3)
      c.quadraticCurveTo(cx - 1, cy + 1, cx, cy - 8)
      c.fill()
      break
    case 'laser':
      c.fillRect(cx - 5, cy - 7, 2.4, 14)
      c.fillRect(cx + 2.6, cy - 7, 2.4, 14)
      break
    case 'magnet':
      c.lineWidth = 3
      c.beginPath()
      c.arc(cx, cy - 1, 5.5, Math.PI, 0, true)
      c.stroke()
      c.beginPath()
      c.moveTo(cx - 5.5, cy - 1)
      c.lineTo(cx - 5.5, cy - 7)
      c.moveTo(cx + 5.5, cy - 1)
      c.lineTo(cx + 5.5, cy - 7)
      c.stroke()
      break
    case 'slow':
      c.beginPath()
      c.arc(cx, cy, 7, 0, Math.PI * 2)
      c.stroke()
      c.beginPath()
      c.moveTo(cx, cy)
      c.lineTo(cx, cy - 4.5)
      c.moveTo(cx, cy)
      c.lineTo(cx + 3.5, cy + 1.5)
      c.stroke()
      break
    case 'shield':
      c.beginPath()
      c.moveTo(cx, cy - 7)
      c.lineTo(cx + 6.5, cy - 4.5)
      c.quadraticCurveTo(cx + 6, cy + 4, cx, cy + 8)
      c.quadraticCurveTo(cx - 6, cy + 4, cx - 6.5, cy - 4.5)
      c.closePath()
      c.stroke()
      break
    case 'life':
      c.beginPath()
      c.moveTo(cx, cy + 6.5)
      c.bezierCurveTo(cx - 9, cy, cx - 6, cy - 7.5, cx, cy - 3)
      c.bezierCurveTo(cx + 6, cy - 7.5, cx + 9, cy, cx, cy + 6.5)
      c.fill()
      break
  }
}

function drawPickup(c: CanvasRenderingContext2D, kind: PowerKind) {
  const color = POWER_COLORS[kind]
  const halo = c.createRadialGradient(15, 15, 6, 15, 15, 15)
  halo.addColorStop(0, `${color}88`)
  halo.addColorStop(1, `${color}00`)
  c.fillStyle = halo
  c.fillRect(0, 0, 30, 30)
  const body = c.createRadialGradient(11, 10, 1, 15, 15, 11)
  body.addColorStop(0, '#ffffff')
  body.addColorStop(0.35, color)
  body.addColorStop(1, '#1d2232')
  c.beginPath()
  c.arc(15, 15, 10.5, 0, Math.PI * 2)
  c.fillStyle = body
  c.fill()
  c.strokeStyle = 'rgba(255,255,255,0.8)'
  c.lineWidth = 1.2
  c.stroke()
  drawPickupIcon(c, kind)
  c.fillStyle = 'rgba(255,255,255,0.55)'
  c.beginPath()
  c.ellipse(11, 9, 4, 2.2, -0.5, 0, Math.PI * 2)
  c.fill()
}

function drawBackground(c: CanvasRenderingContext2D, w: number, h: number) {
  const wall = c.createLinearGradient(0, 0, 0, h)
  wall.addColorStop(0, '#141a2b')
  wall.addColorStop(0.6, PRISM_PALETTE.night)
  wall.addColorStop(1, '#06080f')
  c.fillStyle = wall
  c.fillRect(0, 0, w, h)

  const rng = createRng(31)
  c.strokeStyle = 'rgba(255,255,255,0.035)'
  c.lineWidth = 1
  for (let row = 0; row * 26 < h - 60; row++) {
    const offset = row % 2 ? 0 : 34
    for (let x = -offset; x < w; x += 68) {
      c.strokeRect(x + 0.5, row * 26 + 0.5, 68, 26)
      if (rng() < 0.12) {
        c.fillStyle = `rgba(255,255,255,${0.01 + rng() * 0.02})`
        c.fillRect(x + 1, row * 26 + 1, 66, 24)
      }
    }
  }

  for (const x of [0, w - 46]) {
    const pillar = c.createLinearGradient(x, 0, x + 46, 0)
    pillar.addColorStop(0, '#0d111c')
    pillar.addColorStop(0.5, '#222a3d')
    pillar.addColorStop(1, '#0d111c')
    c.fillStyle = pillar
    c.fillRect(x, 0, 46, h)
    c.fillStyle = 'rgba(255,255,255,0.05)'
    c.fillRect(x + 21, 0, 2, h)
  }

  const floorY = h - 34
  const floor = c.createLinearGradient(0, floorY, 0, h)
  floor.addColorStop(0, '#1a2031')
  floor.addColorStop(1, '#0a0d16')
  c.fillStyle = floor
  c.fillRect(0, floorY, w, h - floorY)
  c.strokeStyle = 'rgba(255,255,255,0.06)'
  for (let x = -40; x < w + 40; x += 64) {
    c.beginPath()
    c.moveTo(x, floorY)
    c.lineTo(x - 30, h)
    c.stroke()
  }
  c.strokeStyle = 'rgba(255,246,220,0.12)'
  c.beginPath()
  c.moveTo(0, floorY + 0.5)
  c.lineTo(w, floorY + 0.5)
  c.stroke()

  const vignette = c.createRadialGradient(w / 2, h * 0.45, h * 0.3, w / 2, h * 0.5, h * 0.95)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
  c.fillStyle = vignette
  c.fillRect(0, 0, w, h)
}

export interface PrismSprites {
  panes: Record<BrickKind, Sprite[][]>
  cracks: Sprite[][]
  pickups: Record<PowerKind, Sprite>
  ray: Sprite
  pool: Sprite
  opening: Sprite
  bloom: Sprite
  background: Sprite
}

let cached: PrismSprites | null = null
const VARIANTS = 3

export function getPrismSprites(): PrismSprites {
  if (cached) return cached
  const { width, height } = BRICK_SPRITE
  const perColor = (draw: (c: CanvasRenderingContext2D, color: number, variant: number) => void) =>
    BRICK_COLORS.map((color) => Array.from({ length: VARIANTS }, (_, variant) => make(width, height, (c) => draw(c, color, variant))))

  cached = {
    panes: {
      glass: perColor((c, color, variant) => drawGlass(c, color, width, height, variant + 1)),
      armored: perColor((c, color, variant) => drawArmored(c, color, width, height, variant + 11)),
      crystal: perColor((c, color) => drawCrystal(c, color, width, height)),
      reactor: perColor((c) => drawReactor(c, width, height)),
    },
    cracks: [1, 2].map((stage) => Array.from({ length: VARIANTS }, (_, variant) => make(width, height, (c) => drawCracks(c, width, height, stage, variant + 5)))),
    pickups: Object.fromEntries((Object.keys(POWER_COLORS) as PowerKind[]).map((kind) => [kind, make(30, 30, (c) => drawPickup(c, kind))])) as Record<PowerKind, Sprite>,
    ray: make(64, 256, (c) => {
      const light = c.createLinearGradient(0, 0, 0, 256)
      light.addColorStop(0, 'rgba(255,246,220,1)')
      light.addColorStop(0.5, 'rgba(255,236,190,0.45)')
      light.addColorStop(1, 'rgba(255,230,180,0)')
      c.fillStyle = light
      c.beginPath()
      c.moveTo(20, 0)
      c.lineTo(44, 0)
      c.lineTo(64, 256)
      c.lineTo(0, 256)
      c.closePath()
      c.fill()
    }, 1),
    pool: make(140, 24, (c) => {
      const pool = c.createRadialGradient(70, 70, 2, 70, 70, 70)
      pool.addColorStop(0, 'rgba(255,240,205,0.9)')
      pool.addColorStop(1, 'rgba(255,240,205,0)')
      c.fillStyle = pool
      c.save()
      c.scale(1, 24 / 140)
      c.fillRect(0, 0, 140, 140)
      c.restore()
    }, 1),
    opening: make(width, height, (c) => {
      const sky = c.createLinearGradient(0, 0, 0, height)
      sky.addColorStop(0, '#fff2cf')
      sky.addColorStop(1, '#ffc977')
      c.fillStyle = sky
      c.fillRect(0, 0, width, height)
      c.save()
      c.scale(1, height / width)
      const core = c.createRadialGradient(width / 2, width / 2, 1, width / 2, width / 2, width * 0.55)
      core.addColorStop(0, 'rgba(255,255,255,1)')
      core.addColorStop(0.55, 'rgba(255,252,236,0.85)')
      core.addColorStop(1, 'rgba(255,252,236,0)')
      c.fillStyle = core
      c.fillRect(0, 0, width, width)
      c.restore()
    }),
    bloom: make(128, 84, (c) => {
      c.save()
      c.scale(1, 84 / 128)
      const glow = c.createRadialGradient(64, 64, 4, 64, 64, 64)
      glow.addColorStop(0, 'rgba(255,244,214,0.95)')
      glow.addColorStop(0.35, 'rgba(255,226,170,0.45)')
      glow.addColorStop(1, 'rgba(255,214,150,0)')
      c.fillStyle = glow
      c.fillRect(0, 0, 128, 128)
      c.restore()
    }, 1),
    background: make(FIELD.width, FIELD.height, (c) => drawBackground(c, FIELD.width, FIELD.height), 1),
  }
  return cached
}

export function blit(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, w = sprite.w, h = sprite.h): void {
  ctx.drawImage(sprite.canvas, x, y, w, h)
}
