import { COLS, ROWS } from './config'
import { CARGO_COLORS } from './effects'

export interface Sprite {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

export const FIELD = { width: 960, height: 600 }
export const CELL = 28
export const BOARD = { x: 60, y: 76, width: COLS * CELL, height: ROWS * CELL }
const SCALE = 3

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

export function blit(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, w = sprite.w, h = sprite.h): void {
  ctx.drawImage(sprite.canvas, x, y, w, h)
}

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16)
  const channel = (shift: number) => {
    const c = (value >> shift) & 255
    return Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
  }
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

function drawBackground(c: CanvasRenderingContext2D) {
  const rng = seeded(9)
  const wall = c.createLinearGradient(0, 0, 0, FIELD.height)
  wall.addColorStop(0, '#11161d')
  wall.addColorStop(1, '#1d232c')
  c.fillStyle = wall
  c.fillRect(0, 0, FIELD.width, FIELD.height)

  // Gulvet: betonplader, pletter og malede baner
  const floor = c.createLinearGradient(0, BOARD.y, 0, BOARD.y + BOARD.height)
  floor.addColorStop(0, '#5b6068')
  floor.addColorStop(1, '#4a4f57')
  c.fillStyle = floor
  c.fillRect(BOARD.x, BOARD.y, BOARD.width, BOARD.height)
  for (let i = 0; i < 2200; i++) {
    c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'
    c.fillRect(BOARD.x + rng() * BOARD.width, BOARD.y + rng() * BOARD.height, 1.2, 1.2)
  }
  for (let i = 0; i < 9; i++) {
    const x = BOARD.x + rng() * BOARD.width
    const y = BOARD.y + rng() * BOARD.height
    const stain = c.createRadialGradient(x, y, 1, x, y, 14 + rng() * 22)
    stain.addColorStop(0, 'rgba(20,20,24,0.28)')
    stain.addColorStop(1, 'rgba(20,20,24,0)')
    c.fillStyle = stain
    c.fillRect(x - 40, y - 40, 80, 80)
  }
  c.strokeStyle = 'rgba(0,0,0,0.22)'
  c.lineWidth = 1
  for (let x = 6; x < COLS; x += 6) {
    c.beginPath()
    c.moveTo(BOARD.x + x * CELL + 0.5, BOARD.y)
    c.lineTo(BOARD.x + x * CELL + 0.5, BOARD.y + BOARD.height)
    c.stroke()
  }
  for (let y = 6; y < ROWS; y += 6) {
    c.beginPath()
    c.moveTo(BOARD.x, BOARD.y + y * CELL + 0.5)
    c.lineTo(BOARD.x + BOARD.width, BOARD.y + y * CELL + 0.5)
    c.stroke()
  }
  c.fillStyle = 'rgba(255,255,255,0.025)'
  for (let y = 0; y < ROWS; y++) for (let x = (y % 2); x < COLS; x += 2) c.fillRect(BOARD.x + x * CELL, BOARD.y + y * CELL, CELL, CELL)
  // Gule kørebaner og pile
  c.strokeStyle = 'rgba(232,183,48,0.55)'
  c.lineWidth = 3
  c.setLineDash([16, 12])
  for (const y of [3.5, ROWS - 3.5]) {
    c.beginPath()
    c.moveTo(BOARD.x + 2 * CELL, BOARD.y + y * CELL)
    c.lineTo(BOARD.x + BOARD.width - 2 * CELL, BOARD.y + y * CELL)
    c.stroke()
  }
  c.setLineDash([])
  c.fillStyle = 'rgba(255,255,255,0.18)'
  for (const [x, y, flip] of [[5, 2, 1], [24, ROWS - 3, -1]] as const) {
    const px = BOARD.x + x * CELL
    const py = BOARD.y + y * CELL + CELL / 2
    c.beginPath()
    c.moveTo(px, py - 4)
    c.lineTo(px + flip * 26, py - 4)
    c.lineTo(px + flip * 26, py - 10)
    c.lineTo(px + flip * 40, py)
    c.lineTo(px + flip * 26, py + 10)
    c.lineTo(px + flip * 26, py + 4)
    c.lineTo(px, py + 4)
    c.closePath()
    c.fill()
  }

  // Sikkerhedsbarriere rundt om gulvet
  const pad = 9
  c.save()
  c.beginPath()
  c.rect(BOARD.x - pad, BOARD.y - pad, BOARD.width + pad * 2, BOARD.height + pad * 2)
  c.rect(BOARD.x, BOARD.y, BOARD.width, BOARD.height)
  c.clip('evenodd')
  c.fillStyle = '#e8b730'
  c.fillRect(BOARD.x - pad, BOARD.y - pad, BOARD.width + pad * 2, BOARD.height + pad * 2)
  c.fillStyle = '#1b1d22'
  for (let i = -BOARD.height; i < BOARD.width + BOARD.height; i += 22) {
    c.beginPath()
    c.moveTo(BOARD.x - pad + i, BOARD.y - pad)
    c.lineTo(BOARD.x - pad + i + 11, BOARD.y - pad)
    c.lineTo(BOARD.x - pad + i + 11 - BOARD.height - pad * 2, BOARD.y + BOARD.height + pad)
    c.lineTo(BOARD.x - pad + i - BOARD.height - pad * 2, BOARD.y + BOARD.height + pad)
    c.closePath()
    c.fill()
  }
  c.restore()
  c.strokeStyle = 'rgba(0,0,0,0.5)'
  c.lineWidth = 2
  c.strokeRect(BOARD.x - 1, BOARD.y - 1, BOARD.width + 2, BOARD.height + 2)
}

function drawTractor(c: CanvasRenderingContext2D) {
  // 34x28, peger mod højre, midten i (17, 14).
  c.fillStyle = '#16181d'
  for (const [x, y] of [[6, 2], [22, 2], [6, 22], [22, 22]]) {
    c.beginPath()
    c.roundRect(x, y, 8, 4, 1.5)
    c.fill()
  }
  const body = c.createLinearGradient(0, 4, 0, 24)
  body.addColorStop(0, '#ffd24a')
  body.addColorStop(1, '#d99a12')
  c.fillStyle = body
  c.beginPath()
  c.roundRect(3, 5, 28, 18, 4)
  c.fill()
  c.strokeStyle = '#7a5306'
  c.lineWidth = 1
  c.stroke()
  c.fillStyle = '#2b3445'
  c.beginPath()
  c.roundRect(8, 7, 12, 14, 2)
  c.fill()
  c.fillStyle = 'rgba(160,215,255,0.65)'
  c.fillRect(17, 8, 2.5, 12)
  c.fillStyle = '#1b1d22'
  c.fillRect(3, 12, 3, 4)
  c.fillStyle = '#fff7d6'
  c.fillRect(29.5, 7, 2, 3)
  c.fillRect(29.5, 18, 2, 3)
  c.fillStyle = '#ff8a1e'
  c.beginPath()
  c.arc(13, 14, 2.4, 0, Math.PI * 2)
  c.fill()
}

function drawCart(c: CanvasRenderingContext2D, color: string, variant: number) {
  // 26x24, midten i (13, 12).
  c.fillStyle = '#16181d'
  for (const [x, y] of [[4, 1], [16, 1], [4, 20], [16, 20]]) {
    c.beginPath()
    c.roundRect(x, y, 6, 3, 1.2)
    c.fill()
  }
  c.fillStyle = '#6b7380'
  c.beginPath()
  c.roundRect(1.5, 3, 23, 18, 2.5)
  c.fill()
  c.strokeStyle = '#3a4049'
  c.lineWidth = 1
  c.stroke()
  const box = c.createLinearGradient(0, 5, 0, 19)
  box.addColorStop(0, shade(color, 0.2))
  box.addColorStop(1, shade(color, -0.25))
  c.fillStyle = box
  if (variant === 0) {
    c.fillRect(4, 5, 18, 14)
    c.fillStyle = 'rgba(255,248,220,0.7)'
    c.fillRect(12, 5, 2.5, 14)
  } else {
    c.fillRect(4, 5, 8.5, 14)
    c.fillRect(13.5, 5, 8.5, 14)
    c.fillStyle = 'rgba(0,0,0,0.25)'
    c.fillRect(12.5, 5, 1, 14)
    c.fillStyle = 'rgba(255,255,255,0.55)'
    c.fillRect(6, 8, 4, 2)
    c.fillRect(15.5, 8, 4, 2)
  }
  c.strokeStyle = 'rgba(0,0,0,0.35)'
  c.strokeRect(4, 5, 18, 14)
}

function drawParcel(c: CanvasRenderingContext2D, golden: boolean) {
  const s = 24
  const body = c.createLinearGradient(0, 2, 0, s - 2)
  body.addColorStop(0, golden ? '#ffe28a' : '#e6b679')
  body.addColorStop(1, golden ? '#d89a14' : '#b07a40')
  c.fillStyle = body
  c.beginPath()
  c.roundRect(2, 2, s - 4, s - 4, 2.5)
  c.fill()
  c.strokeStyle = golden ? '#8a5c00' : '#6f4a22'
  c.lineWidth = 1.1
  c.stroke()
  c.fillStyle = golden ? 'rgba(255,250,225,0.85)' : 'rgba(244,230,200,0.85)'
  c.fillRect(s / 2 - 1.8, 2, 3.6, s - 4)
  if (golden) {
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.moveTo(14, 4)
    c.lineTo(8, 13)
    c.lineTo(12, 13)
    c.lineTo(10, 20)
    c.lineTo(16, 11)
    c.lineTo(12, 11)
    c.closePath()
    c.fill()
  } else {
    c.fillStyle = '#ffffff'
    c.fillRect(4, 15, 6, 4)
    c.fillStyle = '#1b1d22'
    for (let x = 4.5; x < 9.5; x += 1.2) c.fillRect(x, 15.6, 0.6, 2.8)
  }
}

function drawPallet(c: CanvasRenderingContext2D) {
  const s = CELL
  c.fillStyle = '#a8743b'
  c.fillRect(1, s - 6, s - 2, 5)
  c.fillStyle = '#7a5226'
  for (const x of [2, s / 2 - 2, s - 6]) c.fillRect(x, s - 6, 4, 5)
  const wrap = c.createLinearGradient(0, 2, s, s)
  wrap.addColorStop(0, '#d6c4a2')
  wrap.addColorStop(1, '#a8916a')
  c.fillStyle = wrap
  c.fillRect(3, 2, s - 6, s - 9)
  c.strokeStyle = 'rgba(255,255,255,0.45)'
  c.lineWidth = 1.4
  for (let y = 4; y < s - 8; y += 4) {
    c.beginPath()
    c.moveTo(3, y)
    c.lineTo(s - 3, y + 2)
    c.stroke()
  }
  c.strokeStyle = 'rgba(0,0,0,0.3)'
  c.lineWidth = 1
  c.strokeRect(3, 2, s - 6, s - 9)
}

function drawRack(c: CanvasRenderingContext2D) {
  const s = CELL
  c.fillStyle = '#2f6fb0'
  c.fillRect(0, 0, s, s)
  c.fillStyle = '#c4622d'
  for (const [x, y] of [[0, 0], [s - 4, 0], [0, s - 4], [s - 4, s - 4]]) c.fillRect(x, y, 4, 4)
  c.fillStyle = '#8f6f4f'
  c.fillRect(4, 4, s - 8, s - 8)
  c.fillStyle = 'rgba(0,0,0,0.25)'
  c.fillRect(s / 2 - 0.5, 4, 1, s - 8)
  c.fillStyle = 'rgba(255,255,255,0.15)'
  c.fillRect(4, 4, s - 8, 2)
}

export interface RouteSprites {
  background: Sprite
  tractor: Sprite
  carts: Sprite[]
  parcel: Sprite
  express: Sprite
  pallet: Sprite
  rack: Sprite
}

let cached: RouteSprites | null = null

export function getRouteSprites(): RouteSprites {
  if (cached) return cached
  cached = {
    background: make(FIELD.width, FIELD.height, drawBackground, 1),
    tractor: make(34, 28, drawTractor),
    carts: CARGO_COLORS.map((color, index) => make(26, 24, (c) => drawCart(c, color, index % 2))),
    parcel: make(24, 24, (c) => drawParcel(c, false)),
    express: make(24, 24, (c) => drawParcel(c, true)),
    pallet: make(CELL, CELL, drawPallet),
    rack: make(CELL, CELL, drawRack),
  }
  return cached
}
