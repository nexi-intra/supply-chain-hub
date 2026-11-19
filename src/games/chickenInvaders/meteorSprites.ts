import { createRng } from './rng'
import { circle, ellipse, halo, PALETTE, sparkle } from './spriteKit'

/** Meteorernes sprites: sten, ild, is, metal (med revnetrin), guld og komet, plus revnelinjer til bosserne. */

export function drawMeteor(c: CanvasRenderingContext2D, size: number, seed: number) {
  const rng = createRng(seed)
  const center = size / 2
  const r = size / 2 - 3
  const points = 11
  c.beginPath()
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2
    const radius = r * (0.76 + rng() * 0.24)
    const x = center + Math.cos(angle) * radius
    const y = center + Math.sin(angle) * radius
    if (i === 0) c.moveTo(x, y)
    else c.lineTo(x, y)
  }
  c.closePath()
  const g = c.createRadialGradient(center - r * 0.35, center - r * 0.35, 1, center, center, r * 1.1)
  g.addColorStop(0, '#b9997a')
  g.addColorStop(0.55, '#7a6450')
  g.addColorStop(1, '#3f342c')
  c.fillStyle = g
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 2
  c.stroke()
  const craters = size > 40 ? 4 : 2
  for (let i = 0; i < craters; i++) {
    const angle = rng() * Math.PI * 2
    const dist = rng() * r * 0.5
    const cr = r * (0.14 + rng() * 0.12)
    const x = center + Math.cos(angle) * dist
    const y = center + Math.sin(angle) * dist
    circle(c, x, y, cr)
    c.fillStyle = 'rgba(42, 29, 20, 0.45)'
    c.fill()
    c.beginPath()
    c.arc(x, y, cr, Math.PI * 0.9, Math.PI * 1.7)
    c.strokeStyle = 'rgba(255, 236, 210, 0.35)'
    c.lineWidth = 1
    c.stroke()
  }
}

/** Uregelmæssig klippekontur; returnerer hjørnerne til facetter og revner. */
function rockOutline(c: CanvasRenderingContext2D, size: number, seed: number, points: number, jag: number) {
  const rng = createRng(seed)
  const center = size / 2
  const r = size / 2 - 3
  const corners: number[][] = []
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2 + rng() * 0.2
    const radius = r * (1 - jag + rng() * jag)
    corners.push([center + Math.cos(angle) * radius, center + Math.sin(angle) * radius])
  }
  c.beginPath()
  corners.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)))
  c.closePath()
  return { center, r, rng, corners }
}

export function crackLines(rng: () => number, center: number, r: number, count: number, segments: number) {
  const lines: number[][][] = []
  for (let i = 0; i < count; i++) {
    let angle = rng() * Math.PI * 2
    let x = center + Math.cos(angle) * r * 0.15
    let y = center + Math.sin(angle) * r * 0.15
    const line = [[x, y]]
    for (let s = 0; s < segments; s++) {
      angle += (rng() - 0.5) * 0.9
      const step = (r * 0.85) / segments
      x += Math.cos(angle) * step
      y += Math.sin(angle) * step
      line.push([x, y])
    }
    lines.push(line)
  }
  return lines
}

export function strokeLines(c: CanvasRenderingContext2D, lines: number[][][]) {
  for (const points of lines) {
    c.beginPath()
    points.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)))
    c.stroke()
  }
}

export function drawFireMeteor(c: CanvasRenderingContext2D, size: number, seed: number) {
  halo(c, size / 2, size / 2, size / 2, '#ff6a1a', 0.6)
  const { center, r, rng } = rockOutline(c, size, seed, 10, 0.26)
  const g = c.createRadialGradient(center - r * 0.3, center - r * 0.35, 1, center, center, r * 1.1)
  g.addColorStop(0, '#7a3a22')
  g.addColorStop(0.55, '#3b1a12')
  g.addColorStop(1, '#170807')
  c.fillStyle = g
  c.fill()
  c.save()
  c.clip()
  const rim = c.createRadialGradient(center, center + r * 0.5, r * 0.2, center, center + r * 0.4, r * 1.2)
  rim.addColorStop(0, 'rgba(255, 120, 30, 0.55)')
  rim.addColorStop(1, 'rgba(255, 120, 30, 0)')
  c.fillStyle = rim
  c.fillRect(0, 0, size, size)
  const cracks = crackLines(rng, center, r, size > 40 ? 6 : 4, 4)
  c.strokeStyle = 'rgba(255, 110, 30, 0.9)'
  c.lineWidth = 2.6
  strokeLines(c, cracks)
  c.strokeStyle = '#fff1a8'
  c.lineWidth = 0.9
  strokeLines(c, cracks)
  c.restore()
  rockOutline(c, size, seed, 10, 0.26)
  c.strokeStyle = '#1a0805'
  c.lineWidth = 2
  c.stroke()
}

export function drawIceMeteor(c: CanvasRenderingContext2D, size: number, seed: number) {
  halo(c, size / 2, size / 2, size / 2, '#7dd3fc', 0.35)
  const { center, r, corners } = rockOutline(c, size, seed, 7, 0.32)
  const g = c.createLinearGradient(center - r, center - r, center + r, center + r)
  g.addColorStop(0, '#f0fdff')
  g.addColorStop(0.45, '#9be3ff')
  g.addColorStop(1, '#2d6fa3')
  c.fillStyle = g
  c.fill()
  c.strokeStyle = '#1e3a5f'
  c.lineWidth = 1.8
  c.stroke()
  c.save()
  c.clip()
  c.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  c.lineWidth = 1
  const core = [center - r * 0.12, center - r * 0.1]
  for (const [x, y] of corners) {
    c.beginPath()
    c.moveTo(core[0], core[1])
    c.lineTo(x, y)
    c.stroke()
  }
  c.fillStyle = 'rgba(255, 255, 255, 0.35)'
  c.beginPath()
  c.moveTo(core[0], core[1])
  c.lineTo(corners[4][0], corners[4][1])
  c.lineTo(corners[5][0], corners[5][1])
  c.closePath()
  c.fill()
  c.restore()
  ellipse(c, center - r * 0.38, center - r * 0.4, r * 0.22, r * 0.1, -0.7)
  c.fillStyle = 'rgba(255, 255, 255, 0.8)'
  c.fill()
  sparkle(c, corners[1][0], corners[1][1], size > 40 ? 3.5 : 2.4)
}

export function drawMetalMeteor(c: CanvasRenderingContext2D, size: number, seed: number) {
  const { center, r, rng } = rockOutline(c, size, seed, 9, 0.14)
  const g = c.createRadialGradient(center - r * 0.35, center - r * 0.4, 1, center, center, r * 1.15)
  g.addColorStop(0, '#f1f5f9')
  g.addColorStop(0.45, '#94a3b8')
  g.addColorStop(1, '#334155')
  c.fillStyle = g
  c.fill()
  c.strokeStyle = '#0f172a'
  c.lineWidth = 2.2
  c.stroke()
  c.save()
  c.clip()
  c.strokeStyle = 'rgba(15, 23, 42, 0.55)'
  c.lineWidth = 1.2
  for (const offset of [-0.32, 0.3]) {
    c.beginPath()
    c.moveTo(center - r, center + r * offset)
    c.quadraticCurveTo(center, center + r * (offset + 0.28), center + r, center + r * offset - 2)
    c.stroke()
  }
  c.fillStyle = 'rgba(255, 255, 255, 0.35)'
  c.beginPath()
  c.moveTo(center - r * 0.7, center - r * 0.55)
  c.lineTo(center - r * 0.2, center - r * 0.8)
  c.lineTo(center - r * 0.05, center - r * 0.7)
  c.lineTo(center - r * 0.55, center - r * 0.42)
  c.closePath()
  c.fill()
  c.restore()
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + rng() * 0.3
    const x = center + Math.cos(angle) * r * 0.62
    const y = center + Math.sin(angle) * r * 0.62
    circle(c, x, y, 1.7)
    c.fillStyle = '#1e293b'
    c.fill()
    circle(c, x - 0.5, y - 0.5, 0.7)
    c.fillStyle = '#e2e8f0'
    c.fill()
  }
}

/** Revner i metallet efter hvor mange træf det har taget (indeks 0–2). */
export function drawMetalCracks(c: CanvasRenderingContext2D, size: number, level: number) {
  const rng = createRng(500 + level)
  const center = size / 2
  const lines = crackLines(rng, center, size / 2 - 6, 2 + level * 2, 3)
  c.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  c.lineWidth = 2.2
  strokeLines(c, lines)
  c.strokeStyle = '#0b1120'
  c.lineWidth = 1.2
  strokeLines(c, lines)
  if (level === 2) {
    c.strokeStyle = 'rgba(255, 150, 60, 0.85)'
    c.lineWidth = 0.8
    strokeLines(c, lines.slice(0, 2))
  }
}

export function drawGoldMeteor(c: CanvasRenderingContext2D, size: number, seed: number) {
  halo(c, size / 2, size / 2, size / 2, PALETTE.yolk, 0.45)
  const { center, r, rng } = rockOutline(c, size, seed, 10, 0.2)
  const g = c.createRadialGradient(center - r * 0.35, center - r * 0.4, 1, center, center, r * 1.1)
  g.addColorStop(0, '#fff7c2')
  g.addColorStop(0.35, '#facc15')
  g.addColorStop(0.75, '#c2860f')
  g.addColorStop(1, '#7c4a03')
  c.fillStyle = g
  c.fill()
  c.strokeStyle = '#5c3300'
  c.lineWidth = 1.8
  c.stroke()
  for (let i = 0; i < 5; i++) {
    const angle = rng() * Math.PI * 2
    const dist = rng() * r * 0.55
    ellipse(c, center + Math.cos(angle) * dist, center + Math.sin(angle) * dist, r * (0.12 + rng() * 0.1), r * 0.09, angle)
    c.fillStyle = i % 2 ? 'rgba(255, 250, 220, 0.55)' : 'rgba(124, 74, 3, 0.4)'
    c.fill()
  }
  sparkle(c, center - r * 0.35, center - r * 0.4, 3)
}

export function drawComet(c: CanvasRenderingContext2D, size: number, seed: number) {
  halo(c, size / 2, size / 2, size / 2, '#38bdf8', 0.7)
  const { center, r } = rockOutline(c, size, seed, 8, 0.18)
  const g = c.createRadialGradient(center - r * 0.25, center - r * 0.25, 1, center, center, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.5, '#cdeffd')
  g.addColorStop(1, '#4fb3e8')
  c.fillStyle = g
  c.fill()
  c.strokeStyle = 'rgba(30, 64, 120, 0.8)'
  c.lineWidth = 1.2
  c.stroke()
}
