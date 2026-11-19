import { FIELD, GATE_WIDTH, WATER_Y, ZONES, type Zone } from './config'

export interface Sprite {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

export const CONTAINER_HEIGHT = 34
export const CONTAINER_COLORS = ['#1d7f86', '#c2412d', '#2c4a7a', '#d79a2b', '#5c6b73', '#3f7d4e']
const SCALE = 3

export interface ZonePalette {
  sky: [string, string, string]
  skyline: string
  windows: string
  cranes: string
  water: [string, string]
  ambient: string
  ambientAlpha: number
}

export const PALETTES: Record<Zone, ZonePalette> = {
  harbour: { sky: ['#1b1f3b', '#6b3f6e', '#f2925f'], skyline: '#2a2343', windows: '#ffd38a', cranes: '#3a2f4f', water: ['#3a2c4a', '#120f1f'], ambient: '#ff9a6b', ambientAlpha: 0.05 },
  terminal: { sky: ['#050816', '#101b36', '#24426a'], skyline: '#0c1428', windows: '#ffcf70', cranes: '#16233d', water: ['#14243d', '#060a14'], ambient: '#3a5a9a', ambientAlpha: 0.08 },
  aurora: { sky: ['#020c12', '#06222c', '#0f3d47'], skyline: '#061a20', windows: '#bff5e6', cranes: '#0c2a31', water: ['#0b2e36', '#03100f'], ambient: '#3cf0b0', ambientAlpha: 0.05 },
  storm: { sky: ['#07090d', '#151b23', '#2a333e'], skyline: '#0e1218', windows: '#d8c38a', cranes: '#1a2129', water: ['#1b242d', '#05070a'], ambient: '#8aa0b8', ambientAlpha: 0.12 },
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

export function blit(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, w = sprite.w, h = sprite.h): void {
  ctx.drawImage(sprite.canvas, x, y, w, h)
}

/** Lille deterministisk rng, så baggrunde ser ens ud hver gang. */
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

function drawContainer(c: CanvasRenderingContext2D, color: string, variant: number) {
  const w = GATE_WIDTH
  const h = CONTAINER_HEIGHT
  const body = c.createLinearGradient(0, 0, 0, h)
  body.addColorStop(0, shade(color, 0.18))
  body.addColorStop(0.5, color)
  body.addColorStop(1, shade(color, -0.35))
  c.fillStyle = body
  c.fillRect(0, 0, w, h)
  // Bølgeplader
  for (let x = 6; x < w - 4; x += 4) {
    c.fillStyle = 'rgba(255,255,255,0.10)'
    c.fillRect(x, 4, 1.2, h - 8)
    c.fillStyle = 'rgba(0,0,0,0.22)'
    c.fillRect(x + 1.6, 4, 1, h - 8)
  }
  // Ramme og hjørnebeslag
  c.fillStyle = shade(color, -0.5)
  c.fillRect(0, 0, w, 3)
  c.fillRect(0, h - 3, w, 3)
  c.fillRect(0, 0, 3, h)
  c.fillRect(w - 3, 0, 3, h)
  c.fillStyle = '#20242c'
  for (const [x, y] of [[0, 0], [w - 5, 0], [0, h - 5], [w - 5, h - 5]]) c.fillRect(x, y, 5, 5)
  // Døre i den ene ende
  const doorX = variant % 2 === 0 ? 4 : w - 24
  c.fillStyle = shade(color, -0.15)
  c.fillRect(doorX, 4, 20, h - 8)
  c.strokeStyle = 'rgba(0,0,0,0.35)'
  c.lineWidth = 0.8
  c.strokeRect(doorX, 4, 20, h - 8)
  c.beginPath()
  c.moveTo(doorX + 10, 4)
  c.lineTo(doorX + 10, h - 4)
  c.stroke()
  c.strokeStyle = 'rgba(230,235,240,0.75)'
  c.lineWidth = 1
  for (const bar of [doorX + 4, doorX + 7, doorX + 13, doorX + 16]) {
    c.beginPath()
    c.moveTo(bar, 6)
    c.lineTo(bar, h - 6)
    c.stroke()
  }
  // Mærkat
  const labelX = variant % 2 === 0 ? w - 30 : 30
  c.fillStyle = 'rgba(255,255,255,0.78)'
  c.fillRect(labelX, 9, 22, 3)
  c.fillRect(labelX, 14, 14, 2)
  c.fillStyle = 'rgba(255,255,255,0.35)'
  c.fillRect(labelX, 19, 18, 2)
}

function drawSpreader(c: CanvasRenderingContext2D) {
  const w = GATE_WIDTH + 12
  c.fillStyle = '#1b1d22'
  c.fillRect(0, 0, w, 12)
  c.save()
  c.beginPath()
  c.rect(1, 1, w - 2, 10)
  c.clip()
  for (let x = -12; x < w + 12; x += 10) {
    c.fillStyle = '#ffc93c'
    c.beginPath()
    c.moveTo(x, 11)
    c.lineTo(x + 5, 11)
    c.lineTo(x + 10, 1)
    c.lineTo(x + 5, 1)
    c.closePath()
    c.fill()
  }
  c.restore()
  c.fillStyle = 'rgba(255,255,255,0.25)'
  c.fillRect(1, 1, w - 2, 1.5)
}

function drawBarge(c: CanvasRenderingContext2D) {
  const w = GATE_WIDTH + 28
  const hull = c.createLinearGradient(0, 0, 0, 22)
  hull.addColorStop(0, '#3b4350')
  hull.addColorStop(1, '#14181f')
  c.fillStyle = hull
  c.beginPath()
  c.moveTo(0, 0)
  c.lineTo(w, 0)
  c.lineTo(w - 10, 22)
  c.lineTo(10, 22)
  c.closePath()
  c.fill()
  c.fillStyle = '#c2412d'
  c.fillRect(4, 3, w - 8, 3)
  c.fillStyle = 'rgba(255,255,255,0.18)'
  c.fillRect(0, 0, w, 1.5)
}

function drawDrone(c: CanvasRenderingContext2D) {
  // Udgangspunkt: 72x46, dronens midte ved (36, 18).
  c.strokeStyle = '#1a2233'
  c.lineWidth = 3.5
  c.beginPath()
  c.moveTo(10, 10)
  c.lineTo(62, 10)
  c.stroke()
  for (const x of [10, 62]) {
    c.fillStyle = '#2a3446'
    c.fillRect(x - 3, 6, 6, 7)
    c.fillStyle = '#9aa7bb'
    c.fillRect(x - 1, 3, 2, 4)
  }
  const shell = c.createLinearGradient(0, 8, 0, 28)
  shell.addColorStop(0, '#f4f7fb')
  shell.addColorStop(0.55, '#c9d3e1')
  shell.addColorStop(1, '#7d8ba1')
  c.fillStyle = shell
  c.beginPath()
  c.moveTo(18, 14)
  c.quadraticCurveTo(22, 7, 36, 7)
  c.quadraticCurveTo(54, 7, 56, 16)
  c.quadraticCurveTo(57, 25, 46, 26)
  c.lineTo(24, 26)
  c.quadraticCurveTo(16, 25, 18, 14)
  c.closePath()
  c.fill()
  c.strokeStyle = 'rgba(20,28,44,0.55)'
  c.lineWidth = 1
  c.stroke()
  // Stribe og kamera-kuppel
  c.fillStyle = '#1fc8a9'
  c.fillRect(21, 17, 32, 3)
  c.fillStyle = '#0d1422'
  c.beginPath()
  c.ellipse(50, 14, 4.2, 3.6, 0, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = 'rgba(140,220,255,0.85)'
  c.beginPath()
  c.arc(51, 13, 1.3, 0, Math.PI * 2)
  c.fill()
  // Pakken under dronen
  c.strokeStyle = '#3a404c'
  c.lineWidth = 1.2
  c.beginPath()
  c.moveTo(29, 26)
  c.lineTo(28, 31)
  c.moveTo(43, 26)
  c.lineTo(44, 31)
  c.stroke()
  const box = c.createLinearGradient(0, 31, 0, 45)
  box.addColorStop(0, '#d9a866')
  box.addColorStop(1, '#a8743b')
  c.fillStyle = box
  c.fillRect(25, 31, 22, 14)
  c.fillStyle = '#f2e3c4'
  c.fillRect(34, 31, 4, 14)
  c.fillStyle = 'rgba(0,0,0,0.18)'
  c.fillRect(25, 43, 22, 2)
  c.fillStyle = '#ffffff'
  c.fillRect(27, 34, 5, 3)
}

function drawParcel(c: CanvasRenderingContext2D, golden: boolean) {
  // 30x30, kasse set lidt fra oven.
  const top = golden ? '#ffe28a' : '#e6b679'
  const front = golden ? '#e8a923' : '#c48a4a'
  const side = golden ? '#b8790d' : '#9a6634'
  c.fillStyle = top
  c.beginPath()
  c.moveTo(4, 9)
  c.lineTo(15, 4)
  c.lineTo(26, 9)
  c.lineTo(15, 14)
  c.closePath()
  c.fill()
  c.fillStyle = front
  c.beginPath()
  c.moveTo(4, 9)
  c.lineTo(15, 14)
  c.lineTo(15, 27)
  c.lineTo(4, 22)
  c.closePath()
  c.fill()
  c.fillStyle = side
  c.beginPath()
  c.moveTo(26, 9)
  c.lineTo(15, 14)
  c.lineTo(15, 27)
  c.lineTo(26, 22)
  c.closePath()
  c.fill()
  c.strokeStyle = golden ? '#fff6d0' : '#f4e6c8'
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(9.5, 6.5)
  c.lineTo(20.5, 11.5)
  c.lineTo(20.5, 24.5)
  c.stroke()
  if (golden) {
    c.fillStyle = 'rgba(255,255,255,0.9)'
    c.beginPath()
    c.moveTo(8, 12)
    c.lineTo(9, 15)
    c.lineTo(12, 16)
    c.lineTo(9, 17)
    c.lineTo(8, 20)
    c.lineTo(7, 17)
    c.lineTo(4, 16)
    c.lineTo(7, 15)
    c.closePath()
    c.fill()
  }
}

function drawSky(c: CanvasRenderingContext2D, zone: Zone) {
  const palette = PALETTES[zone]
  const rng = seeded(ZONES.indexOf(zone) + 11)
  const sky = c.createLinearGradient(0, 0, 0, WATER_Y)
  sky.addColorStop(0, palette.sky[0])
  sky.addColorStop(0.6, palette.sky[1])
  sky.addColorStop(1, palette.sky[2])
  c.fillStyle = sky
  c.fillRect(0, 0, FIELD.width, FIELD.height)
  if (zone !== 'storm') {
    for (let i = 0; i < (zone === 'harbour' ? 50 : 160); i++) {
      const y = rng() * WATER_Y * 0.7
      c.globalAlpha = (0.25 + rng() * 0.7) * (1 - y / (WATER_Y * 0.8))
      c.fillStyle = rng() < 0.15 ? '#cfe6ff' : '#ffffff'
      const size = rng() < 0.1 ? 1.6 : 1
      c.fillRect(rng() * FIELD.width, y, size, size)
    }
    c.globalAlpha = 1
  }
  if (zone === 'harbour') {
    const sun = c.createRadialGradient(700, WATER_Y - 30, 4, 700, WATER_Y - 30, 160)
    sun.addColorStop(0, 'rgba(255,214,150,0.95)')
    sun.addColorStop(0.18, 'rgba(255,170,110,0.55)')
    sun.addColorStop(1, 'rgba(255,140,90,0)')
    c.fillStyle = sun
    c.fillRect(0, 0, FIELD.width, WATER_Y)
  }
  if (zone === 'terminal') {
    c.fillStyle = '#f3f1e6'
    c.beginPath()
    c.arc(780, 90, 22, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = PALETTES.terminal.sky[0]
    c.beginPath()
    c.arc(790, 84, 20, 0, Math.PI * 2)
    c.fill()
    const halo = c.createRadialGradient(780, 90, 20, 780, 90, 90)
    halo.addColorStop(0, 'rgba(220,230,255,0.18)')
    halo.addColorStop(1, 'rgba(220,230,255,0)')
    c.fillStyle = halo
    c.fillRect(600, 0, 360, 220)
  }
  if (zone === 'storm') {
    for (let i = 0; i < 26; i++) {
      const x = rng() * FIELD.width
      const y = rng() * 220
      const r = 60 + rng() * 120
      const cloud = c.createRadialGradient(x, y, 4, x, y, r)
      cloud.addColorStop(0, 'rgba(60,70,84,0.55)')
      cloud.addColorStop(1, 'rgba(60,70,84,0)')
      c.fillStyle = cloud
      c.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }
}

function drawAurora(c: CanvasRenderingContext2D) {
  const rng = seeded(41)
  for (let band = 0; band < 3; band++) {
    const baseY = 70 + band * 46
    const color = band === 1 ? [160, 120, 255] : [60, 240, 170]
    for (let x = 0; x < FIELD.width; x += 3) {
      const wave = Math.sin(x * 0.008 + band * 1.7) * 30 + Math.sin(x * 0.021 + band) * 12
      const height = 70 + rng() * 40
      const top = baseY + wave
      const curtain = c.createLinearGradient(0, top, 0, top + height)
      curtain.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0)`)
      curtain.addColorStop(0.7, `rgba(${color[0]},${color[1]},${color[2]},${0.12 + rng() * 0.08})`)
      curtain.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`)
      c.fillStyle = curtain
      c.fillRect(x, top, 3, height)
    }
  }
}

function drawSkyline(c: CanvasRenderingContext2D, zone: Zone, width: number, height: number) {
  const palette = PALETTES[zone]
  const rng = seeded(7)
  let x = 0
  while (x < width) {
    const w = 26 + rng() * 54
    const h = 40 + rng() * (height - 60)
    c.fillStyle = palette.skyline
    c.fillRect(x, height - h, w, h)
    if (rng() < 0.18) c.fillRect(x + w / 2 - 1, height - h - 18, 2, 18)
    for (let wy = height - h + 6; wy < height - 6; wy += 7) {
      for (let wx = x + 4; wx < x + w - 4; wx += 6) {
        if (rng() < 0.32) {
          c.globalAlpha = 0.35 + rng() * 0.55
          c.fillStyle = palette.windows
          c.fillRect(wx, wy, 2.4, 3)
          c.globalAlpha = 1
        }
      }
    }
    x += w + rng() * 6
  }
}

function drawCranes(c: CanvasRenderingContext2D, zone: Zone, width: number, height: number) {
  const palette = PALETTES[zone]
  const rng = seeded(19)
  c.strokeStyle = palette.cranes
  c.fillStyle = palette.cranes
  for (let x = 60; x < width - 160; x += 300 + rng() * 120) {
    const top = 20 + rng() * 40
    const legW = 70
    c.lineWidth = 5
    c.beginPath()
    c.moveTo(x, height)
    c.lineTo(x + 10, top + 30)
    c.moveTo(x + legW, height)
    c.lineTo(x + legW - 10, top + 30)
    c.stroke()
    c.lineWidth = 2
    for (let y = top + 40; y < height - 10; y += 26) {
      c.beginPath()
      c.moveTo(x + 6, y)
      c.lineTo(x + legW - 6, y + 22)
      c.moveTo(x + legW - 6, y)
      c.lineTo(x + 6, y + 22)
      c.stroke()
    }
    c.fillRect(x - 70, top + 22, 230, 9)
    c.fillRect(x + legW / 2 - 18, top, 36, 24)
    c.lineWidth = 1.5
    c.beginPath()
    c.moveTo(x + legW / 2, top)
    c.lineTo(x - 70, top + 22)
    c.moveTo(x + legW / 2, top)
    c.lineTo(x + 160, top + 22)
    c.stroke()
    const hook = x + 90 + rng() * 50
    c.beginPath()
    c.moveTo(hook, top + 31)
    c.lineTo(hook, top + 80 + rng() * 40)
    c.stroke()
  }
  // Containerstakke på kajen
  for (let x = 0; x < width; x += 40 + rng() * 30) {
    const stack = 1 + Math.floor(rng() * 4)
    for (let k = 0; k < stack; k++) {
      c.globalAlpha = 0.85
      c.fillRect(x, height - (k + 1) * 13, 36, 12)
    }
    c.globalAlpha = 1
  }
}

function drawGlow(c: CanvasRenderingContext2D, color: string) {
  const value = parseInt(color.slice(1), 16)
  const rgb = `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`
  const glow = c.createRadialGradient(32, 32, 0, 32, 32, 32)
  glow.addColorStop(0, `rgba(${rgb},1)`)
  glow.addColorStop(0.25, `rgba(${rgb},0.45)`)
  glow.addColorStop(1, `rgba(${rgb},0)`)
  c.fillStyle = glow
  c.fillRect(0, 0, 64, 64)
}

const glowCache = new Map<string, Sprite>()

/** Rund glød i en bestemt farve (#rrggbb); tegnes én gang og genbruges. */
export function glowSprite(color: string): Sprite {
  let sprite = glowCache.get(color)
  if (!sprite) {
    sprite = make(64, 64, (c) => drawGlow(c, color), 1)
    glowCache.set(color, sprite)
  }
  return sprite
}

export interface ParcelSprites {
  containers: Sprite[][]
  spreader: Sprite
  barge: Sprite
  drone: Sprite
  parcel: Sprite
  goldenParcel: Sprite
  aurora: Sprite
  skies: Record<Zone, Sprite>
  skylines: Record<Zone, Sprite>
  cranes: Record<Zone, Sprite>
}

export const SKYLINE_SIZE = { width: FIELD.width, height: 150 }
export const CRANES_SIZE = { width: FIELD.width * 2, height: 230 }

let cached: ParcelSprites | null = null

export function getParcelSprites(): ParcelSprites {
  if (cached) return cached
  const perZone = (draw: (zone: Zone) => Sprite) => Object.fromEntries(ZONES.map((zone) => [zone, draw(zone)])) as Record<Zone, Sprite>
  cached = {
    containers: CONTAINER_COLORS.map((color) => [0, 1].map((variant) => make(GATE_WIDTH, CONTAINER_HEIGHT, (c) => drawContainer(c, color, variant), 2))),
    spreader: make(GATE_WIDTH + 12, 12, drawSpreader, 2),
    barge: make(GATE_WIDTH + 28, 22, drawBarge, 2),
    drone: make(72, 46, drawDrone),
    parcel: make(30, 30, (c) => drawParcel(c, false)),
    goldenParcel: make(30, 30, (c) => drawParcel(c, true)),
    aurora: make(FIELD.width, 300, drawAurora, 1),
    skies: perZone((zone) => make(FIELD.width, FIELD.height, (c) => drawSky(c, zone), 1)),
    skylines: perZone((zone) => make(SKYLINE_SIZE.width, SKYLINE_SIZE.height, (c) => drawSkyline(c, zone, SKYLINE_SIZE.width, SKYLINE_SIZE.height), 1.5)),
    cranes: perZone((zone) => make(CRANES_SIZE.width, CRANES_SIZE.height, (c) => drawCranes(c, zone, CRANES_SIZE.width, CRANES_SIZE.height), 1.5)),
  }
  return cached
}
