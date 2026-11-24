import { createRng, type Rng } from './rng'
import type { ThemeFeature, ThemePalette } from './themes'

type Ctx = CanvasRenderingContext2D
type FeatureDrawer = (c: Ctx, width: number, height: number, p: ThemePalette) => void

function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
}

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, rotation = 0) {
  c.beginPath()
  c.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2)
}

function halo(c: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'transparent')
  c.save()
  c.globalAlpha = alpha
  c.fillStyle = g
  circle(c, x, y, r)
  c.fill()
  c.restore()
}

function sphere(c: Ctx, cx: number, cy: number, r: number, p: ThemePalette) {
  const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.05)
  g.addColorStop(0, p.planet.inner)
  g.addColorStop(0.55, p.planet.mid)
  g.addColorStop(1, p.planet.outer)
  circle(c, cx, cy, r)
  c.fillStyle = g
  c.fill()
}

function jaggedLine(c: Ctx, rng: Rng, x: number, y: number, segments: number, step: number) {
  let angle = rng() * Math.PI * 2
  c.moveTo(x, y)
  for (let i = 0; i < segments; i++) {
    angle += (rng() - 0.5) * 1.6
    x += Math.cos(angle) * step * (0.5 + rng())
    y += Math.sin(angle) * step * (0.5 + rng())
    c.lineTo(x, y)
  }
}

const drawRingedPlanet: FeatureDrawer = (c, width, height, p) => {
  c.save()
  c.translate(width - 90, height + 40)
  c.rotate(-0.25)
  const planet = c.createRadialGradient(-60, -150, 10, 0, -60, 230)
  planet.addColorStop(0, p.planet.inner)
  planet.addColorStop(0.6, p.planet.mid)
  planet.addColorStop(1, p.planet.outer)
  ellipse(c, 0, -60, 170, 210)
  c.fillStyle = planet
  c.fill()
  c.globalAlpha = 0.25
  c.strokeStyle = p.planet.rim
  c.lineWidth = 3
  c.stroke()
  ellipse(c, 0, -90, 260, 46, -0.1)
  c.globalAlpha = 0.22
  c.strokeStyle = p.planet.accent
  c.lineWidth = 6
  c.stroke()
  c.restore()
}

function rock(c: Ctx, rng: Rng, x: number, y: number, r: number, p: ThemePalette, alpha: number) {
  const points = 9 + Math.floor(rng() * 4)
  c.beginPath()
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2
    const radius = r * (0.68 + rng() * 0.32)
    if (i === 0) c.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
    else c.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
  }
  c.closePath()
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.1)
  g.addColorStop(0, p.planet.inner)
  g.addColorStop(0.6, p.planet.mid)
  g.addColorStop(1, p.planet.outer)
  c.save()
  c.globalAlpha = alpha
  c.fillStyle = g
  c.fill()
  c.globalAlpha = alpha * 0.45
  c.strokeStyle = p.planet.rim
  c.lineWidth = 1.2
  c.stroke()
  c.restore()
}

const drawAsteroidBelt: FeatureDrawer = (c, width, height, p) => {
  const rng = createRng(31)
  const slope = -0.34
  c.save()
  c.translate(width / 2, height * 0.45)
  c.rotate(slope)
  const dust = c.createLinearGradient(0, -170, 0, 170)
  dust.addColorStop(0, 'transparent')
  dust.addColorStop(0.5, p.planet.accent)
  dust.addColorStop(1, 'transparent')
  c.globalAlpha = 0.14
  c.fillStyle = dust
  c.fillRect(-width, -170, width * 2, 340)
  c.restore()

  for (let i = 0; i < 40; i++) {
    const x = rng() * width
    const lineY = height * 0.45 + (x - width / 2) * slope
    const y = lineY + (rng() - 0.5) * 260
    const size = 3 + rng() * rng() * 34
    rock(c, rng, x, y, size, p, Math.min(0.95, 0.35 + size / 60))
  }
  rock(c, rng, width - 70, height + 20, 170, p, 0.9)
  rock(c, rng, 40, height - 10, 110, p, 0.8)
}

const drawIcePlanet: FeatureDrawer = (c, width, height, p) => {
  const ribbons = ['#34d399', '#22d3ee', '#a78bfa']
  c.save()
  c.globalCompositeOperation = 'lighter'
  ribbons.forEach((color, i) => {
    const baseY = 70 + i * 36
    const curve = (x: number) => baseY + Math.sin(x * 0.011 + i * 1.7) * 34 + Math.sin(x * 0.027 + i) * 10
    const g = c.createLinearGradient(0, baseY - 50, 0, baseY + 170)
    g.addColorStop(0, 'transparent')
    g.addColorStop(0.3, color)
    g.addColorStop(1, 'transparent')
    c.globalAlpha = 0.2
    c.fillStyle = g
    c.beginPath()
    c.moveTo(-20, curve(-20))
    for (let x = -20; x <= width + 20; x += 12) c.lineTo(x, curve(x))
    for (let x = width + 20; x >= -20; x -= 12) c.lineTo(x, curve(x) + 130)
    c.closePath()
    c.fill()
  })
  c.restore()

  const cx = width - 140
  const cy = height - 40
  const r = 230
  halo(c, cx, cy, r * 1.35, p.planet.accent, 0.22)
  sphere(c, cx, cy, r, p)
  const rng = createRng(53)
  c.save()
  circle(c, cx, cy, r)
  c.clip()
  c.fillStyle = p.planet.rim
  for (let i = 0; i < 6; i++) {
    c.globalAlpha = 0.14
    ellipse(c, cx + (rng() - 0.5) * 60, cy - r * 0.7 + i * 62, r * 1.1, 11 + rng() * 9, -0.12)
    c.fill()
  }
  c.globalAlpha = 0.4
  c.strokeStyle = '#ffffff'
  c.lineWidth = 1.2
  for (let i = 0; i < 7; i++) {
    c.beginPath()
    jaggedLine(c, rng, cx - r + rng() * r * 1.6, cy - r * 0.8 + rng() * r, 6, 26)
    c.stroke()
  }
  c.restore()
  c.globalAlpha = 0.55
  c.strokeStyle = p.planet.rim
  c.lineWidth = 3
  circle(c, cx, cy, r)
  c.stroke()
  c.globalAlpha = 1
}

const drawLavaMoon: FeatureDrawer = (c, width, height, p) => {
  const cx = width * 0.8
  const cy = height * 0.82
  const r = 220
  halo(c, cx, cy, r * 1.6, '#ff4d00', 0.3)
  sphere(c, cx, cy, r, p)
  const rng = createRng(97)
  c.save()
  circle(c, cx, cy, r)
  c.clip()
  c.lineCap = 'round'
  c.lineJoin = 'round'
  const starts: [number, number][] = Array.from({ length: 9 }, () => [cx + (rng() - 0.5) * r * 1.6, cy + (rng() - 0.5) * r * 1.6])
  for (const [lineWidth, color, alpha] of [[10, p.planet.rim, 0.22], [3.6, p.planet.rim, 0.9], [1.3, p.planet.accent, 1]] as const) {
    c.lineWidth = lineWidth
    c.strokeStyle = color
    c.globalAlpha = alpha
    const pass = createRng(97)
    c.beginPath()
    for (const [x, y] of starts) jaggedLine(c, pass, x, y, 8, 30)
    c.stroke()
  }
  c.globalAlpha = 1
  for (let i = 0; i < 5; i++) halo(c, cx + (rng() - 0.5) * r * 1.4, cy + (rng() - 0.5) * r * 1.4, 26 + rng() * 22, p.planet.accent, 0.55)
  const shade = c.createLinearGradient(cx - r, cy, cx + r, cy)
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.55)')
  shade.addColorStop(0.6, 'rgba(0, 0, 0, 0)')
  c.fillStyle = shade
  c.fillRect(cx - r, cy - r, r * 2, r * 2)
  c.restore()
  c.globalAlpha = 0.6
  c.strokeStyle = p.planet.rim
  c.lineWidth = 3
  circle(c, cx, cy, r)
  c.stroke()
  c.fillStyle = p.planet.accent
  for (let i = 0; i < 46; i++) {
    c.globalAlpha = 0.2 + rng() * 0.5
    c.fillRect(cx - r * 1.1 + rng() * r * 2.2, cy - r * 1.7 + rng() * r * 1.6, 1.6, 1.6)
  }
  c.globalAlpha = 1
}

const drawHull: FeatureDrawer = (c, width, height, p) => {
  const rng = createRng(11)
  const top = height * 0.4
  const wall = c.createLinearGradient(0, top, 0, height)
  wall.addColorStop(0, 'transparent')
  wall.addColorStop(0.35, p.planet.outer)
  wall.addColorStop(1, '#020504')
  c.fillStyle = wall
  c.fillRect(0, top, width, height - top)

  const cellW = 96
  const cellH = 64
  for (let y = Math.floor(top / cellH) * cellH; y < height; y += cellH) {
    for (let x = 0; x < width; x += cellW) {
      const depth = Math.min(1, (y - top) / (height - top) + 0.2)
      c.globalAlpha = (0.12 + rng() * 0.2) * depth
      c.fillStyle = p.planet.mid
      c.fillRect(x + 2, y + 2, cellW - 4, cellH - 4)
      c.globalAlpha = 0.16 * depth
      c.strokeStyle = p.planet.rim
      c.lineWidth = 1
      c.strokeRect(x + 2.5, y + 2.5, cellW - 5, cellH - 5)
      c.fillStyle = p.planet.inner
      c.globalAlpha = 0.3 * depth
      for (const [dx, dy] of [[7, 7], [cellW - 7, 7], [7, cellH - 7], [cellW - 7, cellH - 7]]) {
        circle(c, x + dx, y + dy, 1.3)
        c.fill()
      }
      if (rng() < 0.2) {
        // Dæmpede lamper, så de ikke ligner skud eller gaver i spillefeltet.
        c.globalAlpha = 0.35 * depth
        c.fillStyle = p.planet.accent
        c.fillRect(x + 30, y + cellH / 2 - 1.5, 10, 3)
        halo(c, x + 35, y + cellH / 2, 22, p.planet.accent, 0.12)
      }
    }
  }
  c.globalAlpha = 1

  const cx = width * 0.8
  const cy = height * 0.74
  halo(c, cx, cy, 170, p.planet.accent, 0.4)
  for (const [radius, lineWidth, color, alpha] of [[96, 14, p.planet.outer, 1], [96, 2, p.planet.rim, 0.45], [62, 8, p.planet.outer, 1], [62, 1.5, p.planet.rim, 0.4]] as const) {
    c.globalAlpha = alpha
    c.strokeStyle = color
    c.lineWidth = lineWidth
    circle(c, cx, cy, radius)
    c.stroke()
  }
  c.globalAlpha = 1
  const core = c.createRadialGradient(cx, cy, 2, cx, cy, 56)
  core.addColorStop(0, '#ffffff')
  core.addColorStop(0.35, p.planet.accent)
  core.addColorStop(1, p.planet.outer)
  circle(c, cx, cy, 56)
  c.fillStyle = core
  c.fill()

  for (const x of [width * 0.09, width * 0.46, width * 0.62]) {
    c.globalAlpha = 0.5
    c.fillStyle = '#020504'
    c.fillRect(x, top - 30, 16, height - top + 30)
    c.globalAlpha = 0.18
    c.fillStyle = p.planet.rim
    c.fillRect(x, top - 30, 2, height - top + 30)
  }
  c.globalAlpha = 1
}

const FEATURES: Record<ThemeFeature, FeatureDrawer> = {
  ringedPlanet: drawRingedPlanet,
  asteroidBelt: drawAsteroidBelt,
  icePlanet: drawIcePlanet,
  lavaMoon: drawLavaMoon,
  hull: drawHull,
}

/** Tegner en komplet temabaggrund (himmel, glød, kulisse og faste stjerner) i logiske pixels. */
export function drawBackground(c: Ctx, width: number, height: number, palette: ThemePalette): void {
  const sky = c.createLinearGradient(0, 0, 0, height)
  for (const [offset, color] of palette.skyStops) sky.addColorStop(offset, color)
  c.fillStyle = sky
  c.fillRect(0, 0, width, height)
  for (const h of palette.halos) halo(c, h.x, h.y, h.r, h.color, h.alpha)

  FEATURES[palette.feature](c, width, height, palette)

  const rng = createRng(2024)
  c.fillStyle = palette.starTint
  for (let i = 0; i < 160; i++) {
    c.globalAlpha = 0.15 + rng() * 0.35
    c.fillRect(rng() * width, rng() * height, 1, 1)
  }
  c.globalAlpha = 1
}
