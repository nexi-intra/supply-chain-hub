import type { BossId } from './bosses/core'
import { createRng } from './rng'
import { circle, crackLines, drawEgg, drawHen, ellipse, halo, make, PALETTE, sparkle, strokeLines, type HenLook, type Sprite } from './sprites'

/** Boss-sprites tegnes i 2× opløsning (de er store) og bygges første gang bossen vises. */
const BOSS_SCALE = 2
const TAU = Math.PI * 2
const big = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => make(w, h, draw, BOSS_SCALE)
const BEAK = '#ff9f1c'

function path(c: CanvasRenderingContext2D, points: number[][]) {
  c.beginPath()
  points.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)))
  c.closePath()
}

function rivets(c: CanvasRenderingContext2D, points: number[][], r = 1.6) {
  for (const [x, y] of points) {
    circle(c, x, y, r)
    c.fillStyle = '#1e293b'
    c.fill()
    circle(c, x - r * 0.3, y - r * 0.3, r * 0.45)
    c.fillStyle = '#e2e8f0'
    c.fill()
  }
}

function metal(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, light = '#e2e8f0', mid = '#94a3b8', dark = '#334155') {
  const g = c.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, light)
  g.addColorStop(0.5, mid)
  g.addColorStop(1, dark)
  return g
}

// ---------------------------------------------------------------- Æggeroiden

const EGG = { w: 250, h: 248, cx: 125, cy: 128, rx: 100, ry: 110 }

/** Ægformet klippe: tydeligt smallere foroven; samme seed giver samme kontur til revnerne. */
function eggRock(c: CanvasRenderingContext2D) {
  const rng = createRng(808)
  const points: number[][] = []
  for (let i = 0; i < 46; i++) {
    const t = (i / 46) * TAU
    const jag = 0.95 + rng() * 0.06
    points.push([EGG.cx + EGG.rx * Math.cos(t) * (0.76 + 0.24 * Math.sin(t)) * jag, EGG.cy + EGG.ry * Math.sin(t) * jag])
  }
  path(c, points)
}

function drawEggeroid(c: CanvasRenderingContext2D) {
  halo(c, EGG.cx, EGG.cy, 124, '#ffb347', 0.3)
  eggRock(c)
  c.strokeStyle = 'rgba(255, 176, 90, 0.55)'
  c.lineWidth = 10
  c.stroke()
  const g = c.createRadialGradient(EGG.cx - 34, EGG.cy - 60, 8, EGG.cx, EGG.cy, 135)
  g.addColorStop(0, '#ead6b0')
  g.addColorStop(0.4, '#9c7a58')
  g.addColorStop(1, '#2b2018')
  c.fillStyle = g
  c.fill()
  c.save()
  c.clip()
  const rng = createRng(4711)
  for (let i = 0; i < 40; i++) {
    ellipse(c, 30 + rng() * 190, 25 + rng() * 200, 1.5 + rng() * 3, 1 + rng() * 2, rng() * 3)
    c.fillStyle = 'rgba(70, 45, 25, 0.35)'
    c.fill()
  }
  for (let i = 0; i < 26; i++) {
    const x = 30 + rng() * 190
    const y = 25 + rng() * 190
    const r = 8 + rng() * 22
    path(c, Array.from({ length: 6 }, (_, k) => [x + Math.cos((k / 6) * TAU + rng()) * r, y + Math.sin((k / 6) * TAU + rng()) * r]))
    c.fillStyle = rng() < 0.5 ? 'rgba(255, 230, 200, 0.07)' : 'rgba(20, 12, 6, 0.16)'
    c.fill()
  }
  for (let i = 0; i < 11; i++) {
    const x = 35 + rng() * 180
    const y = 35 + rng() * 175
    const r = 5 + rng() * 13
    circle(c, x, y, r)
    c.fillStyle = 'rgba(30, 20, 12, 0.45)'
    c.fill()
    c.beginPath()
    c.arc(x, y, r, Math.PI * 0.85, Math.PI * 1.75)
    c.strokeStyle = 'rgba(255, 228, 196, 0.4)'
    c.lineWidth = 1.6
    c.stroke()
  }
  for (let i = 0; i < 7; i++) {
    const x = 40 + rng() * 170
    const y = 40 + rng() * 170
    ellipse(c, x, y, 4 + rng() * 4, 2 + rng() * 2, rng() * 3)
    c.fillStyle = '#cbd5e1'
    c.fill()
    sparkle(c, x + 2, y - 2, 2.2)
  }
  const shade = c.createLinearGradient(0, 20, 0, 230)
  shade.addColorStop(0, 'rgba(255, 240, 220, 0.12)')
  shade.addColorStop(1, 'rgba(10, 6, 4, 0.45)')
  c.fillStyle = shade
  c.fillRect(0, 0, EGG.w, EGG.h)
  c.restore()
  eggRock(c)
  c.strokeStyle = '#1a120c'
  c.lineWidth = 3
  c.stroke()
  // Et ondt ansigt: skrå, glødende øjenspalter og en takket mund.
  for (const side of [-1, 1]) {
    path(c, [[EGG.cx + side * 18, 112], [EGG.cx + side * 52, 96], [EGG.cx + side * 50, 108], [EGG.cx + side * 20, 120]])
    c.fillStyle = '#1a0d05'
    c.fill()
  }
  c.beginPath()
  c.moveTo(EGG.cx - 34, 152)
  for (let i = 1; i <= 8; i++) c.lineTo(EGG.cx - 34 + i * 8.5, 152 + (i % 2 ? 7 : -2))
  c.strokeStyle = '#1a0d05'
  c.lineWidth = 5
  c.stroke()
}

/** Revner, der bliver dybere med skaden (0 = få, 2 = skallen er ved at gå i stykker). */
function drawEggCracks(c: CanvasRenderingContext2D, level: number) {
  eggRock(c)
  c.save()
  c.clip()
  const rng = createRng(90 + level)
  const lines = crackLines(rng, EGG.cx, 112, 3 + level * 3, 5 + level)
  const shifted = lines.map((line) => line.map(([x, y]) => [x + (EGG.cx - 112), y + (EGG.cy - 112)]))
  c.strokeStyle = level >= 1 ? 'rgba(255, 150, 40, 0.75)' : 'rgba(255, 190, 120, 0.4)'
  c.lineWidth = 5 + level * 2
  strokeLines(c, shifted)
  c.strokeStyle = '#1a0d05'
  c.lineWidth = 2.4 + level
  strokeLines(c, shifted)
  c.strokeStyle = '#fff1a8'
  c.lineWidth = 0.9 + level * 0.5
  strokeLines(c, shifted.slice(0, 2 + level * 2))
  if (level === 2) {
    for (const [x, y, r] of [[80, 70, 20], [170, 150, 24], [150, 60, 15]]) {
      halo(c, x, y, r * 1.8, '#ffd447', 0.65)
      path(c, Array.from({ length: 7 }, (_, k) => [x + Math.cos((k / 7) * TAU) * r * (0.7 + rng() * 0.4), y + Math.sin((k / 7) * TAU) * r * (0.7 + rng() * 0.4)]))
      c.fillStyle = '#ffcf33'
      c.fill()
      c.strokeStyle = '#1a0d05'
      c.lineWidth = 2
      c.stroke()
    }
  }
  c.restore()
}

// ---------------------------------------------------------------- Isdronningen

const ICE_LOOK = { body: '#f0faff', shade: '#86c8ea', belly: '#ffffff', comb: '#7dd3fc' }

function iceCrystal(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tilt: number) {
  c.save()
  c.translate(x, y)
  c.rotate(tilt)
  path(c, [[0, -h], [w * 0.5, -h * 0.35], [w * 0.32, 0], [-w * 0.32, 0], [-w * 0.5, -h * 0.35]])
  const g = c.createLinearGradient(-w / 2, -h, w / 2, 0)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.5, '#a5e4ff')
  g.addColorStop(1, '#2b7bb9')
  c.fillStyle = g
  c.fill()
  c.strokeStyle = '#0f3b63'
  c.lineWidth = 1.4
  c.stroke()
  c.beginPath()
  c.moveTo(0, -h)
  c.lineTo(0, 0)
  c.strokeStyle = 'rgba(255, 255, 255, 0.7)'
  c.lineWidth = 1
  c.stroke()
  c.restore()
}

function drawIceQueen(c: CanvasRenderingContext2D, wings: 'up' | 'down', angry: boolean) {
  halo(c, 120, 118, 120, '#7dd3fc', angry ? 0.4 : 0.28)
  // Frossen krave af iskrystaller bag dronningen.
  for (let i = 0; i < 11; i++) {
    const t = -1.25 + (i / 10) * 2.5
    iceCrystal(c, 120 + Math.sin(t) * 70, 120 - Math.cos(t) * 46, 22, 58 + (i % 2) * 18, t)
  }
  const s = 4.2
  c.save()
  c.translate(120 - 24 * s, 24)
  c.scale(s, s)
  drawHen(c, { ...ICE_LOOK, wings, scared: false, angry, outline: 0.7 })
  // Øjenvipper og en isblå næb-glans.
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 0.5
  for (const [x, dir] of [[20, -1], [28, 1]]) {
    for (let k = 0; k < 3; k++) {
      c.beginPath()
      c.moveTo(x + dir * (1.5 + k), 10.2 - k * 0.4)
      c.lineTo(x + dir * (2.6 + k * 1.2), 8.4 - k * 0.6)
      c.stroke()
    }
  }
  ellipse(c, 24, 33, 4.5, 3.4)
  const gem = c.createRadialGradient(23, 32, 0.3, 24, 33, 4.5)
  gem.addColorStop(0, '#ffffff')
  gem.addColorStop(0.5, '#67e8f9')
  gem.addColorStop(1, '#0e7490')
  c.fillStyle = gem
  c.fill()
  c.lineWidth = 0.5
  c.stroke()
  c.restore()
  for (const [x, h, tilt] of [[96, 34, -0.35], [108, 46, -0.15], [120, 58, 0], [132, 46, 0.15], [144, 34, 0.35]]) iceCrystal(c, x, 52, 13, h, tilt)
  sparkle(c, 120, -2 + 6, 4)
  sparkle(c, 90, 70, 3)
}

// ---------------------------------------------------------------- Robo-Hanen

function drawRobo(c: CanvasRenderingContext2D, damaged: number) {
  halo(c, 125, 120, 120, '#f97316', 0.14)
  // Jetben.
  for (const side of [-1, 1]) {
    path(c, [[125 + side * 30, 168], [125 + side * 52, 168], [125 + side * 48, 204], [125 + side * 34, 204]])
    c.fillStyle = metal(c, 0, 168, 0, 204, '#94a3b8', '#475569', '#1e293b')
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 2
    c.stroke()
    ellipse(c, 125 + side * 41, 205, 10, 4)
    c.fillStyle = '#0f172a'
    c.fill()
  }
  // Skulderled ud mod tårnene.
  for (const side of [-1, 1]) {
    c.beginPath()
    c.roundRect(side < 0 ? 22 : 178, 98, 50, 18, 8)
    c.fillStyle = metal(c, 0, 98, 0, 116, '#cbd5e1', '#64748b', '#334155')
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.stroke()
  }
  // Krop.
  path(c, [[60, 80], [190, 80], [205, 120], [182, 176], [68, 176], [45, 120]])
  c.fillStyle = metal(c, 60, 80, 190, 176, '#e2e8f0', '#8b97aa', '#2f3a4d')
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 3
  c.stroke()
  c.strokeStyle = 'rgba(15, 23, 42, 0.45)'
  c.lineWidth = 1.4
  for (const [x0, y0, x1, y1] of [[70, 104, 180, 104], [64, 150, 186, 150], [125, 80, 125, 104]]) {
    c.beginPath()
    c.moveTo(x0, y0)
    c.lineTo(x1, y1)
    c.stroke()
  }
  rivets(c, [[70, 90], [180, 90], [62, 128], [188, 128], [80, 168], [170, 168]])
  // Æggekaster-luge og reaktorhus.
  c.beginPath()
  c.roundRect(106, 112, 38, 18, 6)
  c.fillStyle = '#1e293b'
  c.fill()
  c.strokeStyle = '#94a3b8'
  c.lineWidth = 1.5
  c.stroke()
  circle(c, 125, 152, 19)
  c.fillStyle = '#0f172a'
  c.fill()
  c.strokeStyle = '#cbd5e1'
  c.lineWidth = 3
  c.stroke()
  // Hoved med metalkam, visir og næb.
  c.fillStyle = '#475569'
  c.fillRect(116, 66, 18, 16)
  for (let i = 0; i < 4; i++) {
    path(c, [[96 + i * 15, 30], [104 + i * 15, 4 + (i === 1 || i === 2 ? -4 : 4)], [113 + i * 15, 30]])
    c.fillStyle = metal(c, 0, 0, 0, 30, '#ff8a8a', '#dc2626', '#7f1d1d')
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 2
    c.stroke()
  }
  c.beginPath()
  c.roundRect(90, 24, 70, 48, 14)
  c.fillStyle = metal(c, 90, 24, 160, 72, '#f1f5f9', '#94a3b8', '#475569')
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 2.6
  c.stroke()
  c.beginPath()
  c.roundRect(98, 36, 54, 12, 6)
  c.fillStyle = '#0b1120'
  c.fill()
  path(c, [[116, 52], [134, 52], [125, 66]])
  c.fillStyle = metal(c, 0, 52, 0, 66, '#fde68a', '#f59e0b', '#b45309')
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.8
  c.stroke()
  path(c, [[121, 66], [129, 66], [131, 78], [119, 78]])
  c.fillStyle = '#dc2626'
  c.fill()
  c.stroke()
  if (damaged > 0) {
    const rng = createRng(31 + damaged)
    for (let i = 0; i < damaged * 4; i++) {
      const x = 70 + rng() * 110
      const y = 86 + rng() * 80
      halo(c, x, y, 10 + rng() * 8, '#111827', 0.55)
    }
    c.strokeStyle = '#111827'
    c.lineWidth = 1.6
    strokeLines(c, crackLines(rng, 125, 50, damaged * 2, 3).map((line) => line.map(([x, y]) => [x, y + 75])))
  }
}

function drawTurret(c: CanvasRenderingContext2D, style: 'robo' | 'cruiser') {
  const robo = style === 'robo'
  halo(c, 32, 34, 30, robo ? '#f97316' : '#38bdf8', 0.25)
  for (const dx of robo ? [-6, 6] : [0]) {
    c.beginPath()
    c.roundRect(32 + dx - 4, 34, 8, 26, 3)
    c.fillStyle = metal(c, 32 + dx - 4, 0, 32 + dx + 4, 0, '#94a3b8', '#334155', '#0f172a')
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 1.6
    c.stroke()
  }
  ellipse(c, 32, 30, robo ? 25 : 22, robo ? 21 : 18)
  c.fillStyle = metal(c, 12, 10, 52, 50, robo ? '#fed7aa' : '#e0f2fe', robo ? '#c2410c' : '#64748b', robo ? '#431407' : '#1e293b')
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 2.4
  c.stroke()
  ellipse(c, 32, 38, robo ? 18 : 15, 5)
  c.strokeStyle = 'rgba(15, 23, 42, 0.6)'
  c.lineWidth = 1.4
  c.stroke()
  rivets(c, [[16, 30], [48, 30], [32, 12]], 1.4)
  ellipse(c, 25, 20, 7, 3.5, -0.4)
  c.fillStyle = 'rgba(255, 255, 255, 0.5)'
  c.fill()
}

// ---------------------------------------------------------------- Den Galaktiske Hane

const GALAXY_LOOK = { body: '#6d4fc4', shade: '#1f1147', belly: '#9d84f0', comb: '#ffd447' }

function drawGalactic(c: CanvasRenderingContext2D, wings: 'up' | 'down', angry: boolean) {
  halo(c, 125, 120, 125, angry ? '#f472b6' : '#a855f7', 0.32)
  // Halefjer af tåge, der folder sig ud til begge sider.
  const plumes = ['#22d3ee', '#a855f7', '#f472b6', '#fbbf24', '#6366f1']
  for (const side of [-1, 1]) {
    plumes.forEach((color, i) => {
      c.save()
      c.translate(125 + side * 30, 120)
      c.rotate(side * (0.5 + i * 0.28))
      ellipse(c, 0, -62, 15 - i, 62)
      const g = c.createLinearGradient(0, 0, 0, -124)
      g.addColorStop(0, 'rgba(30, 10, 60, 0.9)')
      g.addColorStop(0.6, color)
      g.addColorStop(1, '#ffffff')
      c.fillStyle = g
      c.fill()
      c.strokeStyle = 'rgba(15, 5, 40, 0.8)'
      c.lineWidth = 1.5
      c.stroke()
      circle(c, 0, -112, 4.5)
      c.fillStyle = '#ffffff'
      c.fill()
      c.restore()
    })
  }
  const s = 4.3
  c.save()
  c.translate(125 - 24 * s, 30)
  c.scale(s, s)
  drawHen(c, { ...GALAXY_LOOK, wings, scared: false, angry, outline: 0.7 })
  // Stjernehimmel inde i kroppen.
  c.save()
  ellipse(c, 24, 29, 14.4, 12.4)
  c.clip()
  const rng = createRng(77)
  for (let i = 0; i < 60; i++) {
    circle(c, 9 + rng() * 30, 16 + rng() * 26, 0.15 + rng() * 0.35)
    c.fillStyle = rng() < 0.2 ? '#fde68a' : '#ffffff'
    c.fill()
  }
  const nebula = c.createRadialGradient(20, 28, 0.5, 22, 30, 10)
  nebula.addColorStop(0, 'rgba(244, 114, 182, 0.55)')
  nebula.addColorStop(1, 'rgba(244, 114, 182, 0)')
  c.fillStyle = nebula
  c.fillRect(8, 15, 32, 28)
  c.restore()
  c.restore()
  // Gylden krone med juveler.
  path(c, [[88, 40], [92, 8], [106, 26], [125, -2 + 6], [144, 26], [158, 8], [162, 40]])
  const crown = c.createLinearGradient(0, 4, 0, 40)
  crown.addColorStop(0, '#fff7c2')
  crown.addColorStop(0.5, '#fbbf24')
  crown.addColorStop(1, '#b45309')
  c.fillStyle = crown
  c.fill()
  c.strokeStyle = '#451a03'
  c.lineWidth = 2.2
  c.stroke()
  for (const [x, color] of [[106, '#22d3ee'], [125, '#ef3b4f'], [144, '#4ade80']] as const) {
    circle(c, x, 32, 4.5)
    c.fillStyle = color
    c.fill()
    c.strokeStyle = '#451a03'
    c.lineWidth = 1.2
    c.stroke()
    sparkle(c, x - 1, 31, 2)
  }
}

// ---------------------------------------------------------------- Ægge-trioen

const TRIO_BANDS = ['#ef3b4f', '#38bdf8', '#facc15']
const TRIO_LOOK = { body: '#fff4dc', shade: '#e3b679', belly: '#ffffff' }
const FIRE_LOOK = { body: '#ffd9b0', shade: '#e2632b', belly: '#fff1d6', comb: '#ff3b1f' }

function drawTrioHen(c: CanvasRenderingContext2D, band: string, fire: boolean, frame: { wings: 'up' | 'down'; scared: boolean }, face: number) {
  if (fire) {
    halo(c, 50, 52, 50, '#ff6a1a', 0.55)
    for (let i = 0; i < 8; i++) {
      const x = 16 + i * 9.6
      path(c, [[x - 6, 48], [x, 12 + (i % 2) * 12], [x + 6, 48]])
      c.fillStyle = i % 2 ? 'rgba(255, 200, 60, 0.75)' : 'rgba(255, 90, 30, 0.75)'
      c.fill()
    }
  } else {
    halo(c, 50, 52, 48, band, 0.25)
  }
  const s = 1.85
  c.save()
  c.translate(50 - 24 * s, 7)
  c.scale(s, s)
  const look: HenLook = { ...(fire ? FIRE_LOOK : TRIO_LOOK), ...frame, angry: !frame.scared && face !== 2, outline: 1.5 }
  drawHen(c, look)
  if (!frame.scared) drawTrioFace(c, face)
  // Pandebånd med knude og flagrende ender.
  c.fillStyle = fire ? '#1f1b2e' : band
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 0.9
  c.beginPath()
  c.roundRect(14.5, 7.4, 19, 3.6, 1.6)
  c.fill()
  c.stroke()
  for (const [x, y] of [[35, 6], [36, 11]]) {
    path(c, [[32.5, 8.8], [x + 4, y], [x + 2.5, y + 2.6]])
    c.fill()
    c.stroke()
  }
  c.restore()
}

// ---------------------------------------------------------------- Kyllingekrydseren

/** Hver triohøne har sin egen personlighed: lederen med klap for øjet, den seje med solbriller og fjolset. */
function drawTrioFace(c: CanvasRenderingContext2D, face: number) {
  c.strokeStyle = PALETTE.ink
  if (face === 0) {
    c.lineWidth = 0.8
    c.beginPath()
    c.moveTo(14.5, 7.5)
    c.lineTo(33, 18)
    c.stroke()
    ellipse(c, 20, 13, 3.6, 3.4)
    c.fillStyle = '#1f1b2e'
    c.fill()
    c.stroke()
    c.lineWidth = 0.7
    c.beginPath()
    c.moveTo(27, 18.6)
    c.lineTo(31, 21.5)
    c.moveTo(28.4, 18.2)
    c.lineTo(28.8, 21.8)
    c.strokeStyle = 'rgba(190, 18, 60, 0.8)'
    c.stroke()
  } else if (face === 1) {
    c.lineWidth = 0.9
    for (const x of [20, 28]) {
      c.beginPath()
      c.roundRect(x - 4.2, 10.2, 8.4, 5.6, 2.2)
      c.fillStyle = '#111827'
      c.fill()
      c.stroke()
      c.beginPath()
      c.moveTo(x - 2.6, 11.6)
      c.lineTo(x - 0.4, 11.6)
      c.strokeStyle = 'rgba(147, 197, 253, 0.9)'
      c.stroke()
      c.strokeStyle = PALETTE.ink
    }
    c.beginPath()
    c.moveTo(24.2, 12)
    c.lineTo(23.8, 12)
    c.lineWidth = 1.4
    c.stroke()
  } else {
    for (const x of [16.5, 31.5]) {
      ellipse(c, x, 18.5, 2.6, 1.6)
      c.fillStyle = 'rgba(244, 114, 182, 0.65)'
      c.fill()
    }
    c.lineWidth = 0.9
    c.beginPath()
    c.moveTo(22, 5.5)
    c.quadraticCurveTo(19, -1.5, 23.5, -1)
    c.quadraticCurveTo(26.5, -0.5, 25, 2.5)
    c.stroke()
    ellipse(c, 25.5, 24.4, 1.5, 2.2, -0.3)
    c.fillStyle = '#fb7185'
    c.fill()
    c.lineWidth = 0.6
    c.stroke()
  }
}

/** Gallionsfiguren: et hanehoved i forstavnen, tegnet mod højre. */
function drawFigurehead(c: CanvasRenderingContext2D, mk2: boolean) {
  const gold = mk2 ? '#f59e0b' : '#facc15'
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.6
  path(c, [[2, 44], [18, 30], [30, 34], [22, 50], [4, 52]])
  c.fillStyle = gold
  c.fill()
  c.stroke()
  for (const [x, y, r] of [[24, 10, 4.2], [30, 8, 4.6], [36, 11, 4]]) {
    circle(c, x, y, r)
    c.fillStyle = PALETTE.comb
    c.fill()
    c.stroke()
  }
  ellipse(c, 30, 24, 13, 12)
  const g = c.createRadialGradient(26, 18, 1, 30, 24, 14)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.5, '#fff4dc')
  g.addColorStop(1, '#d6a85c')
  c.fillStyle = g
  c.fill()
  c.stroke()
  path(c, [[41, 20], [54, 24.5], [41, 29]])
  c.fillStyle = BEAK
  c.fill()
  c.stroke()
  ellipse(c, 40, 34, 3, 4.6)
  c.fillStyle = PALETTE.comb
  c.fill()
  c.stroke()
  circle(c, 34, 20, 3.2)
  c.fillStyle = '#ffffff'
  c.fill()
  c.lineWidth = 1
  c.stroke()
  circle(c, 35, 20.4, 1.7)
  c.fillStyle = '#140d2e'
  c.fill()
  c.beginPath()
  c.moveTo(29.5, 15.5)
  c.lineTo(37.5, 17.2)
  c.lineWidth = 1.5
  c.stroke()
  c.beginPath()
  c.moveTo(19, 22)
  c.quadraticCurveTo(25, 30, 22, 36)
  c.strokeStyle = gold
  c.lineWidth = 1.4
  c.stroke()
}

const mirrored = (draw: (c: CanvasRenderingContext2D) => void, w: number) => (c: CanvasRenderingContext2D) => {
  c.translate(w, 0)
  c.scale(-1, 1)
  draw(c)
}

function drawCruiser(c: CanvasRenderingContext2D, mk2: boolean) {
  const W = 380
  halo(c, W / 2, 56, 190, mk2 ? '#f59e0b' : '#38bdf8', 0.12)
  // Broen med vinduer, hvor kyllinger kigger ud.
  c.beginPath()
  c.roundRect(150, 6, 80, 32, 10)
  c.fillStyle = metal(c, 150, 6, 230, 38, '#f1f5f9', '#94a3b8', '#475569')
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 2
  c.stroke()
  for (let i = 0; i < 4; i++) {
    const x = 163 + i * 18
    ellipse(c, x, 22, 6, 6)
    c.fillStyle = '#7dd3fc'
    c.fill()
    c.stroke()
    circle(c, x, 23, 3.2)
    c.fillStyle = '#fff06a'
    c.fill()
    circle(c, x + 1, 22, 0.8)
    c.fillStyle = '#140d2e'
    c.fill()
  }
  // Skroget.
  path(c, [[6, 54], [40, 30], [340, 30], [374, 54], [348, 84], [32, 84]])
  c.fillStyle = metal(c, 0, 30, 0, 84, '#e2e8f0', '#7b8798', '#273244')
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 3
  c.stroke()
  c.fillStyle = mk2 ? '#f59e0b' : PALETTE.comb
  path(c, [[24, 50], [356, 50], [362, 56], [18, 56]])
  c.fill()
  rivets(c, Array.from({ length: 12 }, (_, i) => [52 + i * 25, 40]))
  // Ægformede luger i bunden (bredsiden).
  const hatches = mk2 ? 7 : 5
  for (let i = 0; i < hatches; i++) {
    const x = W / 2 - 150 + (300 * i) / (hatches - 1)
    ellipse(c, x, 72, 7, 9)
    c.fillStyle = '#1e293b'
    c.fill()
    c.strokeStyle = '#94a3b8'
    c.lineWidth = 1.4
    c.stroke()
  }
  // Ægge-emblem midt på siden.
  ellipse(c, W / 2, 42, 9, 11)
  c.fillStyle = '#fff4dc'
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.5
  c.stroke()
  if (mk2) {
    c.font = '800 13px system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillStyle = '#fde68a'
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 3
    c.strokeText('II', 246, 74)
    c.fillText('II', 246, 74)
  }
}

// ---------------------------------------------------------------- UFO-moderskibet

function drawMothership(c: CanvasRenderingContext2D, frame: number) {
  const cx = 140
  halo(c, cx, 104, 60, '#4ade80', 0.4)
  // Kuplen med en kaptajnshøne.
  c.save()
  c.beginPath()
  c.rect(0, 0, 280, 82)
  c.clip()
  ellipse(c, cx, 78, 54, 56)
  c.fillStyle = 'rgba(15, 23, 42, 0.6)'
  c.fill()
  const s = 1.7
  c.save()
  c.translate(cx - 24 * s, 24)
  c.scale(s, s)
  drawHen(c, { body: '#fff4dc', shade: '#e9c98f', belly: '#ffffff', wings: 'down', scared: false, angry: true, outline: 1.3 })
  c.fillStyle = '#1e3a8a'
  c.beginPath()
  c.roundRect(14, 1.5, 20, 5, 2)
  c.fill()
  c.fillStyle = '#facc15'
  circle(c, 24, 4, 1.6)
  c.fill()
  c.restore()
  ellipse(c, cx, 78, 54, 56)
  c.fillStyle = 'rgba(125, 211, 252, 0.22)'
  c.fill()
  c.strokeStyle = 'rgba(224, 242, 254, 0.9)'
  c.lineWidth = 2.4
  c.stroke()
  c.beginPath()
  c.arc(cx, 78, 44, Math.PI * 1.12, Math.PI * 1.42)
  c.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  c.lineWidth = 3.4
  c.stroke()
  c.restore()
  // Tallerkenen.
  ellipse(c, cx, 92, 136, 30)
  c.fillStyle = metal(c, 0, 62, 0, 122, '#f8fafc', '#a3b1c2', '#323d4d')
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 3
  c.stroke()
  ellipse(c, cx, 86, 100, 10)
  c.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  c.lineWidth = 1.6
  c.stroke()
  ellipse(c, cx, 115, 42, 9)
  c.fillStyle = '#14532d'
  c.fill()
  c.strokeStyle = '#4ade80'
  c.lineWidth = 2
  c.stroke()
  for (let i = 0; i < 13; i++) {
    const x = cx - 120 + i * 20
    const y = 92 + 26 * Math.sqrt(Math.max(0, 1 - ((x - cx) / 136) ** 2)) - 8
    const lit = (i + frame) % 2 === 0
    if (lit) halo(c, x, y, 8, '#fde047', 0.75)
    circle(c, x, y, 3.2)
    c.fillStyle = lit ? '#fef08a' : '#4ade80'
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 1
    c.stroke()
  }
}

// ---------------------------------------------------------------- Boss-æg

function drawFireEgg(c: CanvasRenderingContext2D) {
  halo(c, 11, 15, 12, '#ff6a1a', 0.85)
  c.save()
  c.translate(2, 4)
  drawEgg(c)
  c.restore()
  ellipse(c, 11, 15, 7, 9)
  c.fillStyle = 'rgba(255, 120, 30, 0.45)'
  c.fill()
}

function drawIceEgg(c: CanvasRenderingContext2D) {
  halo(c, 9, 11, 10, '#7dd3fc', 0.6)
  path(c, [[9, 1], [15, 6], [16, 14], [9, 21], [2, 14], [3, 6]])
  const g = c.createLinearGradient(2, 1, 16, 21)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.5, '#a5e4ff')
  g.addColorStop(1, '#2b7bb9')
  c.fillStyle = g
  c.fill()
  c.strokeStyle = '#0f3b63'
  c.lineWidth = 1.2
  c.stroke()
  c.beginPath()
  c.moveTo(9, 1)
  c.lineTo(9, 21)
  c.moveTo(3, 6)
  c.lineTo(16, 14)
  c.strokeStyle = 'rgba(255, 255, 255, 0.6)'
  c.lineWidth = 0.8
  c.stroke()
}

function drawHomingEgg(c: CanvasRenderingContext2D, lit: boolean) {
  halo(c, 13, 14, 13, '#f43f5e', lit ? 0.8 : 0.45)
  for (const side of [-1, 1]) {
    path(c, [[13 + side * 5, 7], [13 + side * 11, 2], [13 + side * 8, 10]])
    c.fillStyle = '#64748b'
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 1
    c.stroke()
  }
  ellipse(c, 13, 14, 8, 10)
  const g = c.createRadialGradient(10, 10, 1, 13, 14, 11)
  g.addColorStop(0, '#fecdd3')
  g.addColorStop(0.5, '#be123c')
  g.addColorStop(1, '#4c0519')
  c.fillStyle = g
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.4
  c.stroke()
  circle(c, 13, 18, 2.4)
  c.fillStyle = lit ? '#fef08a' : '#7f1d1d'
  c.fill()
}

// ---------------------------------------------------------------- Cache

export interface BossSprites {
  /** Kroppe: [ro/vred][vinger op/ned] eller skadetrin, afhænger af bossen. */
  body: Sprite[]
  /** Æggeroidens revner (3 trin) og Robo-Hanens tårn/krydserens tårn. */
  extra: Sprite[]
}

const cache = new Map<string, BossSprites>()
const WINGS = ['up', 'down'] as const

function build(id: BossId, variant: number): BossSprites {
  switch (id) {
    case 'eggeroid':
      return { body: [big(EGG.w, EGG.h, drawEggeroid)], extra: [0, 1, 2].map((level) => big(EGG.w, EGG.h, (c) => drawEggCracks(c, level))) }
    case 'iceQueen':
      return { body: [false, true].flatMap((angry) => WINGS.map((wings) => big(240, 236, (c) => drawIceQueen(c, wings, angry)))), extra: [] }
    case 'roboRooster':
      return { body: [0, 1, 2].map((damaged) => big(250, 214, (c) => drawRobo(c, damaged))), extra: [make(64, 64, (c) => drawTurret(c, 'robo'))] }
    case 'galacticRooster':
      return { body: [false, true].flatMap((angry) => WINGS.map((wings) => big(250, 240, (c) => drawGalactic(c, wings, angry)))), extra: [] }
    case 'eggTrio':
      return {
        body: TRIO_BANDS.flatMap((band, face) =>
          [{ wings: 'up' as const, scared: false }, { wings: 'down' as const, scared: false }, { wings: 'down' as const, scared: true }].map((frame) => make(100, 100, (c) => drawTrioHen(c, band, variant === 1, frame, face))),
        ),
        extra: [],
      }
    case 'chickenCruiser': {
      const figurehead = (c: CanvasRenderingContext2D) => drawFigurehead(c, variant === 1)
      return {
        body: [big(380, 92, (c) => drawCruiser(c, variant === 1))],
        extra: [make(64, 64, (c) => drawTurret(c, 'cruiser')), make(56, 56, figurehead), make(56, 56, mirrored(figurehead, 56))],
      }
    }
    case 'ufoMothership':
      return { body: [0, 1].map((frame) => big(280, 132, (c) => drawMothership(c, frame))), extra: [] }
    default:
      return { body: [], extra: [] }
  }
}

export function getBossSprites(id: BossId, variant = 0): BossSprites {
  const key = `${id}:${variant}`
  let sprites = cache.get(key)
  if (!sprites) {
    sprites = build(id, variant)
    cache.set(key, sprites)
  }
  return sprites
}

let eggs: { fire: Sprite; ice: Sprite; homing: Sprite[] } | null = null

export function getBossEggSprites() {
  eggs ??= {
    fire: make(22, 28, drawFireEgg),
    ice: make(18, 22, drawIceEgg),
    homing: [false, true].map((lit) => make(26, 28, (c) => drawHomingEgg(c, lit))),
  }
  return eggs
}
