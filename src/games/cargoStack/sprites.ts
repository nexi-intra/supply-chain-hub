import type { PieceType } from './pieces'
import { PIECE_COLORS } from './effects'

export interface Sprite {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

export const FIELD = { width: 960, height: 600 }
export const CELL = 25
export const BOARD = { x: 355, y: 64, cols: 10, rows: 20 }
export const BOARD_PIXELS = { width: BOARD.cols * CELL, height: BOARD.rows * CELL }
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

export function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16)
  const channel = (shift: number) => {
    const c = (value >> shift) & 255
    return Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
  }
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

/** Fælles kasse-krop: afrundet, lys kant foroven og mørk kant forneden. */
function body(c: CanvasRenderingContext2D, color: string, s: number) {
  const fill = c.createLinearGradient(0, 0, 0, s)
  fill.addColorStop(0, shade(color, 0.22))
  fill.addColorStop(1, shade(color, -0.25))
  c.fillStyle = fill
  c.beginPath()
  c.roundRect(0.6, 0.6, s - 1.2, s - 1.2, 3)
  c.fill()
  c.strokeStyle = shade(color, -0.55)
  c.lineWidth = 1.1
  c.stroke()
  c.strokeStyle = 'rgba(255,255,255,0.35)'
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(2.5, 2)
  c.lineTo(s - 2.5, 2)
  c.stroke()
}

const MATERIAL: Record<PieceType, (c: CanvasRenderingContext2D, color: string, s: number) => void> = {
  // I: blå plast-tote med greb
  I: (c, color, s) => {
    body(c, color, s)
    c.fillStyle = shade(color, -0.35)
    c.beginPath()
    c.roundRect(4, 5, s - 8, s - 10, 2)
    c.fill()
    c.fillStyle = shade(color, -0.6)
    c.beginPath()
    c.roundRect(s / 2 - 4, 7, 8, 3, 1.5)
    c.fill()
  },
  // O: gul papkasse med tape på kryds
  O: (c, color, s) => {
    body(c, color, s)
    c.fillStyle = 'rgba(255,248,220,0.75)'
    c.fillRect(s / 2 - 1.8, 1, 3.6, s - 2)
    c.fillStyle = 'rgba(0,0,0,0.12)'
    c.fillRect(3, s - 8, 8, 4)
  },
  // T: trækasse med kryds-afstivning
  T: (c, color, s) => {
    body(c, color, s)
    c.strokeStyle = shade(color, -0.45)
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(3.5, 3.5)
    c.lineTo(s - 3.5, s - 3.5)
    c.moveTo(s - 3.5, 3.5)
    c.lineTo(3.5, s - 3.5)
    c.stroke()
    c.strokeStyle = shade(color, 0.3)
    c.lineWidth = 0.8
    c.strokeRect(3, 3, s - 6, s - 6)
  },
  // S: malede planker
  S: (c, color, s) => {
    body(c, color, s)
    c.strokeStyle = shade(color, -0.45)
    c.lineWidth = 1
    for (const y of [s / 3, (2 * s) / 3]) {
      c.beginPath()
      c.moveTo(2, y)
      c.lineTo(s - 2, y)
      c.stroke()
    }
    c.fillStyle = shade(color, -0.6)
    for (const [x, y] of [[4, 4], [s - 4, 4], [4, s - 4], [s - 4, s - 4]]) {
      c.beginPath()
      c.arc(x, y, 0.9, 0, Math.PI * 2)
      c.fill()
    }
  },
  // Z: rød tønde set fra oven
  Z: (c, color, s) => {
    body(c, color, s)
    c.strokeStyle = shade(color, -0.45)
    c.lineWidth = 1.4
    c.beginPath()
    c.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2)
    c.stroke()
    c.beginPath()
    c.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2)
    c.stroke()
    c.fillStyle = shade(color, 0.4)
    c.beginPath()
    c.arc(s / 2 + 4, s / 2 - 4, 1.6, 0, Math.PI * 2)
    c.fill()
  },
  // J: blå kasse med "denne side op"-pile
  J: (c, color, s) => {
    body(c, color, s)
    c.fillStyle = 'rgba(255,255,255,0.75)'
    for (const x of [s / 2 - 5, s / 2 + 5]) {
      c.beginPath()
      c.moveTo(x, 5)
      c.lineTo(x + 3.5, 10)
      c.lineTo(x + 1.2, 10)
      c.lineTo(x + 1.2, 15)
      c.lineTo(x - 1.2, 15)
      c.lineTo(x - 1.2, 10)
      c.lineTo(x - 3.5, 10)
      c.closePath()
      c.fill()
    }
    c.fillRect(5, s - 7, s - 10, 1.4)
  },
  // L: palle pakket i strækfilm
  L: (c, color, s) => {
    body(c, color, s)
    c.save()
    c.beginPath()
    c.roundRect(1, 1, s - 2, s - 2, 3)
    c.clip()
    c.strokeStyle = 'rgba(255,255,255,0.35)'
    c.lineWidth = 2.5
    for (let x = -s; x < s * 2; x += 7) {
      c.beginPath()
      c.moveTo(x, s)
      c.lineTo(x + s, 0)
      c.stroke()
    }
    c.restore()
    c.fillStyle = shade(color, -0.5)
    c.fillRect(2, s - 4, s - 4, 2)
  },
}

function drawGhost(c: CanvasRenderingContext2D, color: string, s: number) {
  c.fillStyle = `${color}2a`
  c.fillRect(1, 1, s - 2, s - 2)
  c.strokeStyle = color
  c.globalAlpha = 0.75
  c.lineWidth = 1.4
  c.setLineDash([3, 2.5])
  c.strokeRect(1.5, 1.5, s - 3, s - 3)
}

function drawBackground(c: CanvasRenderingContext2D) {
  const { width, height } = FIELD
  const rng = seeded(5)
  const wall = c.createLinearGradient(0, 0, 0, height)
  wall.addColorStop(0, '#0f141c')
  wall.addColorStop(0.7, '#1b222d')
  wall.addColorStop(1, '#262d38')
  c.fillStyle = wall
  c.fillRect(0, 0, width, height)
  // Tagbjælker
  c.fillStyle = '#0a0e14'
  for (let x = -40; x < width; x += 160) {
    c.beginPath()
    c.moveTo(x, 0)
    c.lineTo(x + 80, 34)
    c.lineTo(x + 160, 0)
    c.lineTo(x + 150, 0)
    c.lineTo(x + 80, 28)
    c.lineTo(x + 10, 0)
    c.closePath()
    c.fill()
  }
  c.fillRect(0, 30, width, 6)

  // Reoler i begge sider
  const rack = (x0: number, w: number) => {
    const beams = [150, 270, 390, 510]
    for (const bx of [x0, x0 + w - 8]) {
      c.fillStyle = '#c4622d'
      c.fillRect(bx, 70, 8, 492)
      c.fillStyle = 'rgba(0,0,0,0.3)'
      for (let y = 80; y < 560; y += 12) c.fillRect(bx + 2, y, 4, 3)
    }
    for (const y of beams) {
      for (let bx = x0 + 10; bx < x0 + w - 12; ) {
        const bw = 26 + rng() * 34
        const bh = 30 + rng() * 60
        if (bx + bw > x0 + w - 12) break
        const tone = ['#7b6047', '#8f6f4f', '#5c6b73', '#3f5f7a', '#6e5a3b'][Math.floor(rng() * 5)]
        c.fillStyle = tone
        c.fillRect(bx, y - bh, bw, bh)
        c.fillStyle = 'rgba(255,255,255,0.08)'
        c.fillRect(bx, y - bh, bw, 3)
        c.fillStyle = 'rgba(0,0,0,0.25)'
        c.fillRect(bx + bw - 4, y - bh, 4, bh)
        bx += bw + 3 + rng() * 6
      }
      c.fillStyle = '#2f6fb0'
      c.fillRect(x0, y, w, 7)
      c.fillStyle = 'rgba(255,255,255,0.18)'
      c.fillRect(x0, y, w, 1.5)
    }
  }
  rack(20, 300)
  rack(640, 300)

  // Lamper med lyskegler
  for (const x of [180, 480, 780]) {
    c.fillStyle = '#2b313b'
    c.fillRect(x - 1, 36, 2, 26)
    c.fillStyle = '#3a414d'
    c.beginPath()
    c.moveTo(x - 22, 70)
    c.lineTo(x - 10, 60)
    c.lineTo(x + 10, 60)
    c.lineTo(x + 22, 70)
    c.closePath()
    c.fill()
    const cone = c.createLinearGradient(0, 70, 0, 560)
    cone.addColorStop(0, 'rgba(255,236,190,0.22)')
    cone.addColorStop(1, 'rgba(255,236,190,0)')
    c.fillStyle = cone
    c.beginPath()
    c.moveTo(x - 20, 70)
    c.lineTo(x + 20, 70)
    c.lineTo(x + 150, 560)
    c.lineTo(x - 150, 560)
    c.closePath()
    c.fill()
    c.fillStyle = '#fff3d0'
    c.fillRect(x - 16, 69, 32, 2)
  }

  // Betongulv med sikkerhedsstribe
  const floor = c.createLinearGradient(0, 560, 0, height)
  floor.addColorStop(0, '#3a3f47')
  floor.addColorStop(1, '#25292f')
  c.fillStyle = floor
  c.fillRect(0, 560, width, height - 560)
  c.fillStyle = '#e8b730'
  c.fillRect(0, 586, width, 5)
  c.fillStyle = '#1b1d22'
  for (let x = 0; x < width; x += 24) c.fillRect(x, 586, 10, 5)

  // Containeren
  const cx = BOARD.x - 14
  const cy = BOARD.y - 14
  const cw = BOARD_PIXELS.width + 28
  const ch = BOARD_PIXELS.height + 28
  c.fillStyle = 'rgba(0,0,0,0.45)'
  c.fillRect(cx + 8, cy + 10, cw, ch)
  const steel = c.createLinearGradient(cx, 0, cx + cw, 0)
  steel.addColorStop(0, '#1d4f6e')
  steel.addColorStop(0.5, '#2a6a8f')
  steel.addColorStop(1, '#1d4f6e')
  c.fillStyle = steel
  c.fillRect(cx, cy, cw, ch)
  const inside = c.createLinearGradient(0, BOARD.y, 0, BOARD.y + BOARD_PIXELS.height)
  inside.addColorStop(0, '#0d141d')
  inside.addColorStop(1, '#16202c')
  c.fillStyle = inside
  c.fillRect(BOARD.x, BOARD.y, BOARD_PIXELS.width, BOARD_PIXELS.height)
  for (let x = BOARD.x + 6; x < BOARD.x + BOARD_PIXELS.width; x += 12) {
    c.fillStyle = 'rgba(255,255,255,0.025)'
    c.fillRect(x, BOARD.y, 5, BOARD_PIXELS.height)
  }
  c.strokeStyle = 'rgba(255,255,255,0.035)'
  c.lineWidth = 1
  for (let x = 1; x < BOARD.cols; x++) {
    c.beginPath()
    c.moveTo(BOARD.x + x * CELL + 0.5, BOARD.y)
    c.lineTo(BOARD.x + x * CELL + 0.5, BOARD.y + BOARD_PIXELS.height)
    c.stroke()
  }
  for (let y = 1; y < BOARD.rows; y++) {
    c.beginPath()
    c.moveTo(BOARD.x, BOARD.y + y * CELL + 0.5)
    c.lineTo(BOARD.x + BOARD_PIXELS.width, BOARD.y + y * CELL + 0.5)
    c.stroke()
  }
  // Ribber og hjørnebeslag på stålrammen
  c.fillStyle = 'rgba(0,0,0,0.25)'
  for (let y = cy + 6; y < cy + ch - 4; y += 9) {
    c.fillRect(cx + 3, y, 8, 4)
    c.fillRect(cx + cw - 11, y, 8, 4)
  }
  c.fillStyle = '#12181f'
  for (const [x, y] of [[cx, cy], [cx + cw - 16, cy], [cx, cy + ch - 16], [cx + cw - 16, cy + ch - 16]]) c.fillRect(x, y, 16, 16)
  c.fillStyle = '#c99a5b'
  c.fillRect(BOARD.x, BOARD.y + BOARD_PIXELS.height, BOARD_PIXELS.width, 6)
  c.fillStyle = 'rgba(255,255,255,0.75)'
  c.font = "700 9px 'IBM Plex Sans Variable', system-ui, sans-serif"
  c.fillText('SCHU 482 019 7', cx + 22, cy + 10)
}

function drawPanel(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = 'rgba(8,12,18,0.82)'
  c.beginPath()
  c.roundRect(0, 0, w, h, 8)
  c.fill()
  c.strokeStyle = 'rgba(232,183,48,0.55)'
  c.lineWidth = 1.5
  c.stroke()
  c.save()
  c.beginPath()
  c.roundRect(0, 0, w, 6, [8, 8, 0, 0])
  c.clip()
  for (let x = -10; x < w + 10; x += 12) {
    c.fillStyle = '#e8b730'
    c.beginPath()
    c.moveTo(x, 6)
    c.lineTo(x + 6, 6)
    c.lineTo(x + 12, 0)
    c.lineTo(x + 6, 0)
    c.closePath()
    c.fill()
  }
  c.restore()
}

export interface CargoSprites {
  cells: Record<PieceType, Sprite>
  ghosts: Record<PieceType, Sprite>
  background: Sprite
  holdPanel: Sprite
  nextPanel: Sprite
  statsPanel: Sprite
}

export const PANELS = {
  hold: { x: 196, y: 64, w: 124, h: 108 },
  stats: { x: 196, y: 190, w: 124, h: 200 },
  next: { x: 640, y: 64, w: 124, h: 330 },
}

let cached: CargoSprites | null = null

export function getCargoSprites(): CargoSprites {
  if (cached) return cached
  const perPiece = (draw: (c: CanvasRenderingContext2D, type: PieceType) => void) =>
    Object.fromEntries((Object.keys(PIECE_COLORS) as PieceType[]).map((type) => [type, make(CELL, CELL, (c) => draw(c, type))])) as Record<PieceType, Sprite>
  cached = {
    cells: perPiece((c, type) => MATERIAL[type](c, PIECE_COLORS[type], CELL)),
    ghosts: perPiece((c, type) => drawGhost(c, PIECE_COLORS[type], CELL)),
    background: make(FIELD.width, FIELD.height, drawBackground, 1),
    holdPanel: make(PANELS.hold.w, PANELS.hold.h, (c) => drawPanel(c, PANELS.hold.w, PANELS.hold.h), 2),
    nextPanel: make(PANELS.next.w, PANELS.next.h, (c) => drawPanel(c, PANELS.next.w, PANELS.next.h), 2),
    statsPanel: make(PANELS.stats.w, PANELS.stats.h, (c) => drawPanel(c, PANELS.stats.w, PANELS.stats.h), 2),
  }
  return cached
}
