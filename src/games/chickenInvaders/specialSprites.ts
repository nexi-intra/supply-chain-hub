import { THEMES, tintHen, type HenColors, type ThemeId } from './themes'
import { BEAK, circle, drawHen, ellipse, FRAMES, halo, make, PALETTE, sparkle, type Sprite } from './spriteKit'

const SHIELD_LOOK = { body: '#f4fbff', shade: '#9cc9e4', belly: '#ffffff' }
const SNIPER_LOOK = { body: '#e3e6c8', shade: '#8a9a5b', belly: '#f4f2df' }
const BOMBER_LOOK = { body: '#ece6df', shade: '#9a8f86', belly: '#faf6f0' }
const BALLOON_LOOK = { body: '#fff1f6', shade: '#e9a8c4', belly: '#ffffff' }
const MEDIC_LOOK = { body: '#ffffff', shade: '#d4cfe6', belly: '#fff7fa' }
const NINJA_LOOK = { body: '#4a4363', shade: '#17131f', belly: '#5d5679', comb: '#7f1d1d' }
const TURKEY_LOOK = { body: '#b07a45', shade: '#5f3a1d', belly: '#e0b47e', comb: '#dc2626' }
const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7']
const BALLOON_COLORS = [
  ['#fecdd3', '#f43f5e', '#9f1239'],
  ['#bae6fd', '#0ea5e9', '#075985'],
  ['#fef08a', '#eab308', '#854d0e'],
]

function line(c: CanvasRenderingContext2D, points: number[][]) {
  c.beginPath()
  points.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)))
}

function angryBrows(c: CanvasRenderingContext2D, color = PALETTE.ink) {
  c.save()
  c.strokeStyle = color
  c.lineWidth = 2.2
  line(c, [[15.5, 8.6], [22.5, 10.8]])
  c.stroke()
  line(c, [[32.5, 8.6], [25.5, 10.8]])
  c.stroke()
  c.restore()
}

function drawShieldBadge(c: CanvasRenderingContext2D, accent: string) {
  c.save()
  c.beginPath()
  c.moveTo(24, 26.5)
  c.lineTo(29.5, 28.2)
  c.quadraticCurveTo(29.5, 35, 24, 38.5)
  c.quadraticCurveTo(18.5, 35, 18.5, 28.2)
  c.closePath()
  const g = c.createLinearGradient(19, 27, 29, 38)
  g.addColorStop(0, '#e0f2fe')
  g.addColorStop(0.45, accent)
  g.addColorStop(1, '#0c4a6e')
  c.fillStyle = g
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.3
  c.stroke()
  line(c, [[24, 29], [24, 36]])
  c.strokeStyle = 'rgba(255,255,255,0.75)'
  c.lineWidth = 1
  c.stroke()
  c.restore()
}

/** Skjoldboblen; `hits` er resterende træf (4 = hel, 1 = næsten knust). */
function drawBubble(c: CanvasRenderingContext2D, hits: number) {
  const strength = hits / 4
  const g = c.createRadialGradient(32, 29, 6, 32, 32, 29)
  g.addColorStop(0, 'rgba(224, 242, 254, 0)')
  g.addColorStop(0.72, `rgba(125, 211, 252, ${0.1 + 0.1 * strength})`)
  g.addColorStop(1, `rgba(56, 189, 248, ${0.32 + 0.28 * strength})`)
  circle(c, 32, 32, 28)
  c.fillStyle = g
  c.fill()
  c.strokeStyle = `rgba(186, 230, 253, ${0.55 + 0.4 * strength})`
  c.lineWidth = 2
  c.stroke()
  c.save()
  c.globalAlpha = 0.18 + 0.12 * strength
  c.strokeStyle = '#e0f2fe'
  c.lineWidth = 0.8
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    c.beginPath()
    c.moveTo(32 + Math.cos(a) * 9, 32 + Math.sin(a) * 9)
    c.lineTo(32 + Math.cos(a) * 25, 32 + Math.sin(a) * 25)
    c.stroke()
  }
  c.restore()
  c.beginPath()
  c.arc(32, 32, 22.5, Math.PI * 1.08, Math.PI * 1.42)
  c.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  c.lineWidth = 2.6
  c.stroke()
  circle(c, 44, 18, 1.8)
  c.fillStyle = 'rgba(255,255,255,0.8)'
  c.fill()
  const cracks: number[][][] = []
  if (hits <= 3) cracks.push([[42, 6], [38, 14], [43, 20], [39, 29]], [[38, 14], [33, 15]])
  if (hits <= 2) cracks.push([[5, 30], [13, 33], [10, 40], [18, 46]], [[13, 33], [17, 29]])
  if (hits <= 1) cracks.push([[49, 51], [41, 45], [45, 38], [40, 33]], [[24, 5], [27, 12], [23, 17]], [[30, 58], [31, 50], [26, 46]])
  for (const crack of cracks) {
    line(c, crack)
    c.strokeStyle = 'rgba(8, 47, 73, 0.55)'
    c.lineWidth = 2.6
    c.stroke()
    c.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    c.lineWidth = 1.2
    c.stroke()
  }
  if (hits <= 1) {
    c.beginPath()
    c.moveTo(56, 22)
    c.lineTo(60, 30)
    c.lineTo(55, 33)
    c.closePath()
    c.fillStyle = 'rgba(8, 47, 73, 0.6)'
    c.fill()
  }
}

function drawSniperGear(c: CanvasRenderingContext2D) {
  c.save()
  c.strokeStyle = '#6b4f2a'
  c.lineWidth = 2.6
  line(c, [[12.5, 24.5], [33, 39]])
  c.stroke()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.2
  ellipse(c, 23.5, 6, 11.5, 4.8, -0.12)
  const beret = c.createLinearGradient(14, 2, 34, 10)
  beret.addColorStop(0, '#5b7a3a')
  beret.addColorStop(1, '#2f4520')
  c.fillStyle = beret
  c.fill()
  c.stroke()
  circle(c, 28.5, 1.8, 1.5)
  c.fillStyle = '#2f4520'
  c.fill()
  c.stroke()
  circle(c, 17.5, 6.6, 1.6)
  c.fillStyle = PALETTE.yolk
  c.fill()
  c.translate(31.5, 12.5)
  c.rotate(-0.28)
  c.beginPath()
  c.roundRect(1.5, -2.4, 10, 4.8, 1.6)
  c.fillStyle = '#374151'
  c.fill()
  c.stroke()
  c.fillStyle = '#9ca3af'
  c.fillRect(9.5, -1.6, 1.2, 3.2)
  c.restore()
  c.save()
  const lens = c.createRadialGradient(27, 12, 0.5, 28, 13, 4.6)
  lens.addColorStop(0, '#ffe4e6')
  lens.addColorStop(0.45, '#f43f5e')
  lens.addColorStop(1, '#4c0519')
  circle(c, 28, 13, 4.4)
  c.fillStyle = lens
  c.fill()
  c.strokeStyle = '#111827'
  c.lineWidth = 2.2
  c.stroke()
  line(c, [[25.2, 13], [30.8, 13]])
  c.moveTo(28, 10.2)
  c.lineTo(28, 15.8)
  c.strokeStyle = 'rgba(17, 24, 39, 0.8)'
  c.lineWidth = 0.7
  c.stroke()
  circle(c, 26.6, 11.6, 0.9)
  c.fillStyle = '#ffffff'
  c.fill()
  c.restore()
  c.save()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 2
  line(c, [[15.5, 8.8], [22.5, 10.6]])
  c.stroke()
  c.restore()
}

function drawBomberGear(c: CanvasRenderingContext2D) {
  c.save()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.3
  c.beginPath()
  c.arc(24, 14, 11, Math.PI * 1.02, Math.PI * 1.98)
  c.quadraticCurveTo(24, 9.5, 13, 13.2)
  c.closePath()
  const cap = c.createLinearGradient(14, 3, 34, 13)
  cap.addColorStop(0, '#a16a35')
  cap.addColorStop(1, '#5c3a1a')
  c.fillStyle = cap
  c.fill()
  c.stroke()
  for (const side of [-1, 1]) {
    ellipse(c, 24 + side * 10.6, 16.5, 2.8, 5, side * 0.2)
    c.fillStyle = '#7c4a22'
    c.fill()
    c.stroke()
  }
  line(c, [[13.5, 7.5], [34.5, 7.5]])
  c.strokeStyle = '#3f2a14'
  c.lineWidth = 2
  c.stroke()
  for (const x of [19.5, 28.5]) {
    const lens = c.createRadialGradient(x - 1, 6.5, 0.4, x, 7.5, 3.4)
    lens.addColorStop(0, '#fff7cc')
    lens.addColorStop(1, '#d97706')
    circle(c, x, 7.5, 3.2)
    c.fillStyle = lens
    c.fill()
    c.strokeStyle = '#1f2937'
    c.lineWidth = 1.3
    c.stroke()
  }
  c.strokeStyle = '#3f3f46'
  c.lineWidth = 3.4
  line(c, [[11.5, 23.5], [35.5, 40]])
  c.stroke()
  for (const [x, y] of [[16.8, 27.2], [23, 31.5], [29.2, 35.7]]) {
    circle(c, x, y, 2.7)
    c.fillStyle = '#111827'
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 0.8
    c.stroke()
    circle(c, x - 0.9, y - 0.9, 0.7)
    c.fillStyle = 'rgba(255,255,255,0.7)'
    c.fill()
    line(c, [[x + 1.6, y - 2], [x + 2.8, y - 3.4]])
    c.strokeStyle = '#a16207'
    c.lineWidth = 0.9
    c.stroke()
    circle(c, x + 3, y - 3.6, 0.8)
    c.fillStyle = '#fbbf24'
    c.fill()
  }
  c.restore()
  angryBrows(c)
}

function drawNinjaGear(c: CanvasRenderingContext2D) {
  c.save()
  c.beginPath()
  c.arc(24, 15, 10, Math.PI * 1.12, Math.PI * 1.88)
  c.strokeStyle = '#ef3b4f'
  c.lineWidth = 3.6
  c.stroke()
  c.strokeStyle = 'rgba(42, 29, 74, 0.6)'
  c.lineWidth = 0.8
  c.stroke()
  circle(c, 33.6, 10.4, 2.3)
  c.fillStyle = '#ef3b4f'
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.stroke()
  c.strokeStyle = '#ef3b4f'
  c.lineWidth = 2.4
  c.beginPath()
  c.moveTo(35, 10)
  c.bezierCurveTo(39, 7, 42, 10, 46, 6)
  c.moveTo(35, 11.5)
  c.bezierCurveTo(39, 12, 41, 15.5, 45.5, 14)
  c.stroke()
  ellipse(c, 24, 21.5, 8.5, 3.2)
  c.fillStyle = '#17131f'
  c.fill()
  c.restore()
  angryBrows(c, '#e5e7eb')
}

function drawNurseGear(c: CanvasRenderingContext2D) {
  c.save()
  c.beginPath()
  c.moveTo(15.5, 8.5)
  c.lineTo(17.2, 1.2)
  c.quadraticCurveTo(24, -1.2, 30.8, 1.2)
  c.lineTo(32.5, 8.5)
  c.quadraticCurveTo(24, 6.2, 15.5, 8.5)
  c.closePath()
  c.fillStyle = '#ffffff'
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.3
  c.stroke()
  c.fillStyle = '#ef4444'
  c.fillRect(22.9, 1.4, 2.2, 5.2)
  c.fillRect(21.4, 2.9, 5.2, 2.2)
  for (const x of [16.5, 31.5]) {
    circle(c, x, 18, 2.2)
    c.fillStyle = 'rgba(251, 113, 133, 0.45)'
    c.fill()
  }
  circle(c, 24, 32.5, 4.6)
  c.fillStyle = '#ffffff'
  c.fill()
  c.strokeStyle = 'rgba(42, 29, 74, 0.5)'
  c.lineWidth = 0.9
  c.stroke()
  c.fillStyle = '#ef4444'
  c.fillRect(23, 29.4, 2, 6.2)
  c.fillRect(20.9, 31.5, 6.2, 2)
  c.restore()
}

function drawBalloon(c: CanvasRenderingContext2D, colors: string[], popped: boolean) {
  c.save()
  c.strokeStyle = 'rgba(241, 245, 249, 0.85)'
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(15, popped ? 14 : 29)
  c.bezierCurveTo(12, 34, 18, 38, 15, 44)
  c.stroke()
  if (popped) {
    c.fillStyle = colors[1]
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 0.9
    for (const [x, y, r] of [[15, 13, 0.4], [11.5, 10, -0.6], [18.5, 9.5, 0.9]]) {
      c.save()
      c.translate(x, y)
      c.rotate(r)
      c.beginPath()
      c.moveTo(-2.5, 2)
      c.lineTo(-1, -3)
      c.lineTo(0.6, 0)
      c.lineTo(2.4, -2.6)
      c.lineTo(2.2, 2.2)
      c.closePath()
      c.fill()
      c.stroke()
      c.restore()
    }
    c.restore()
    return
  }
  const g = c.createRadialGradient(11, 9, 1, 15, 14, 15)
  g.addColorStop(0, colors[0])
  g.addColorStop(0.5, colors[1])
  g.addColorStop(1, colors[2])
  ellipse(c, 15, 14.5, 11.5, 13.5)
  c.fillStyle = g
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.5
  c.stroke()
  ellipse(c, 10.5, 9, 2.6, 4.4, 0.5)
  c.fillStyle = 'rgba(255, 255, 255, 0.7)'
  c.fill()
  c.beginPath()
  c.moveTo(12.6, 30)
  c.lineTo(17.4, 30)
  c.lineTo(15, 27)
  c.closePath()
  c.fillStyle = colors[2]
  c.fill()
  c.stroke()
  c.restore()
}

function drawUfo(c: CanvasRenderingContext2D, frame: number) {
  halo(c, 48, 50, 24, '#4ade80', 0.4)
  c.save()
  c.beginPath()
  c.rect(0, 0, 96, 38)
  c.clip()
  ellipse(c, 48, 31, 18, 17)
  c.fillStyle = 'rgba(15, 23, 42, 0.55)'
  c.fill()
  const head = c.createRadialGradient(45, 26, 1, 48, 30, 9)
  head.addColorStop(0, '#ffffff')
  head.addColorStop(1, '#e9c98f')
  for (const [x, y, r] of [[44.5, 22.5, 2.6], [48, 20.8, 3], [51.5, 22.5, 2.6]]) {
    circle(c, x, y, r)
    c.fillStyle = PALETTE.comb
    c.fill()
  }
  circle(c, 48, 30, 8.5)
  c.fillStyle = head
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.2
  c.stroke()
  for (const x of [44.8, 51.2]) {
    circle(c, x, 28.5, 2.3)
    c.fillStyle = '#ffffff'
    c.fill()
    circle(c, x, 29, 1.2)
    c.fillStyle = '#140d2e'
    c.fill()
  }
  line(c, [[42.5, 25.2], [46.5, 26.5]])
  c.moveTo(53.5, 25.2)
  c.lineTo(49.5, 26.5)
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.2
  c.stroke()
  c.beginPath()
  c.moveTo(46, 32.2)
  c.lineTo(50, 32.2)
  c.lineTo(48, 35)
  c.closePath()
  c.fillStyle = BEAK
  c.fill()
  ellipse(c, 48, 31, 18, 17)
  c.fillStyle = 'rgba(125, 211, 252, 0.25)'
  c.fill()
  c.strokeStyle = 'rgba(224, 242, 254, 0.9)'
  c.lineWidth = 1.6
  c.stroke()
  c.beginPath()
  c.arc(48, 31, 13, Math.PI * 1.15, Math.PI * 1.45)
  c.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  c.lineWidth = 2.2
  c.stroke()
  c.restore()

  const hull = c.createLinearGradient(0, 30, 0, 52)
  hull.addColorStop(0, '#f8fafc')
  hull.addColorStop(0.45, '#a3b1c2')
  hull.addColorStop(1, '#3f4b5c')
  ellipse(c, 48, 41, 45, 12)
  c.fillStyle = hull
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 2
  c.stroke()
  ellipse(c, 48, 38.5, 30, 4)
  c.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  c.lineWidth = 1.2
  c.stroke()
  ellipse(c, 48, 50.5, 15, 3.6)
  c.fillStyle = '#1f2937'
  c.fill()
  c.strokeStyle = '#4ade80'
  c.lineWidth = 1.2
  c.stroke()
  for (let i = 0; i < 7; i++) {
    const x = 16 + i * (64 / 6)
    const y = 41 + 9.5 * Math.sqrt(Math.max(0, 1 - ((x - 48) / 45) ** 2)) - 3
    const lit = (i + frame) % 2 === 0
    if (lit) halo(c, x, y, 5, '#fde047', 0.7)
    circle(c, x, y, 2.1)
    c.fillStyle = lit ? '#fef08a' : '#4ade80'
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 0.8
    c.stroke()
  }
}

function drawTurkeyFan(c: CanvasRenderingContext2D) {
  const colors = ['#7c2d12', '#b45309', '#d97706', '#92400e']
  const count = 9
  c.save()
  c.translate(32, 38)
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI * 0.94 + (i / (count - 1)) * Math.PI * 0.88
    c.save()
    c.rotate(angle)
    ellipse(c, 17, 0, 14, 5.2)
    c.fillStyle = colors[i % colors.length]
    c.fill()
    c.strokeStyle = PALETTE.ink
    c.lineWidth = 1.1
    c.stroke()
    ellipse(c, 27, 0, 3.6, 3.6)
    c.fillStyle = i % 2 ? '#fde68a' : '#fef3c7'
    c.fill()
    circle(c, 27.5, 0, 1.6)
    c.fillStyle = '#1e3a8a'
    c.fill()
    c.restore()
  }
  c.restore()
}

function drawTurkey(c: CanvasRenderingContext2D, frame: { wings: 'up' | 'down'; scared: boolean }) {
  drawTurkeyFan(c)
  c.save()
  c.translate(8, 14)
  drawHen(c, { ...TURKEY_LOOK, ...frame, angry: !frame.scared })
  c.beginPath()
  c.moveTo(25.6, 18.6)
  c.bezierCurveTo(29.5, 20, 27, 24.5, 28.5, 27.5)
  c.bezierCurveTo(26, 28.2, 24.3, 25, 24.6, 21.5)
  c.closePath()
  c.fillStyle = '#dc2626'
  c.fill()
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1
  c.stroke()
  c.restore()
}

function drawRainbowHen(c: CanvasRenderingContext2D, frame: number) {
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 32)
  RAINBOW.forEach((color, i) => g.addColorStop(i / RAINBOW.length, color))
  g.addColorStop(1, 'transparent')
  c.save()
  c.globalAlpha = 0.35
  circle(c, 32, 32, 32)
  c.fillStyle = g
  c.fill()
  c.restore()
  c.save()
  c.translate(8, 8)
  drawHen(c, { body: '#ffffff', shade: '#ddd6fe', belly: '#ffffff', wings: frame % 2 ? 'up' : 'down', scared: false, comb: RAINBOW[frame % RAINBOW.length] })
  c.save()
  ellipse(c, 24, 29, 14.2, 12.2)
  c.clip()
  c.globalAlpha = 0.72
  const band = 26 / RAINBOW.length
  const offset = (frame / 6) * band * RAINBOW.length
  for (let i = -RAINBOW.length; i < RAINBOW.length * 2; i++) {
    c.fillStyle = RAINBOW[((i % RAINBOW.length) + RAINBOW.length) % RAINBOW.length]
    c.fillRect(8, 16 + i * band - offset, 32, band + 0.5)
  }
  c.globalAlpha = 0.5
  ellipse(c, 24, 32.5, 7, 5.5)
  c.fillStyle = '#ffffff'
  c.fill()
  c.restore()
  c.restore()
  const spots = [[8, 12], [56, 18], [52, 52], [10, 50]]
  spots.forEach(([x, y], i) => sparkle(c, x, y, (i + frame) % 3 === 0 ? 4 : 2.2))
}

function drawBomb(c: CanvasRenderingContext2D, lit: boolean) {
  halo(c, 14, 20, 16, lit ? '#ef4444' : '#fb923c', lit ? 0.75 : 0.35)
  const g = c.createRadialGradient(10, 15, 1, 14, 20, 14)
  g.addColorStop(0, lit ? '#fecaca' : '#fca5a5')
  g.addColorStop(0.5, lit ? '#dc2626' : '#b91c1c')
  g.addColorStop(1, lit ? '#7f1d1d' : '#450a0a')
  ellipse(c, 14, 20, 10, 12.5)
  c.fillStyle = g
  c.fill()
  c.save()
  ellipse(c, 14, 20, 10, 12.5)
  c.clip()
  c.fillStyle = '#facc15'
  c.fillRect(2, 19, 24, 4.6)
  c.fillStyle = '#111827'
  for (let x = -2; x < 28; x += 4.4) {
    c.beginPath()
    c.moveTo(x, 23.6)
    c.lineTo(x + 2.2, 19)
    c.lineTo(x + 4, 19)
    c.lineTo(x + 1.8, 23.6)
    c.closePath()
    c.fill()
  }
  c.restore()
  ellipse(c, 14, 20, 10, 12.5)
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.5
  c.stroke()
  ellipse(c, 10.5, 13, 2, 3.4, 0.4)
  c.fillStyle = 'rgba(255,255,255,0.55)'
  c.fill()
  c.beginPath()
  c.moveTo(14, 7.8)
  c.quadraticCurveTo(14.5, 3.5, 18, 2.6)
  c.strokeStyle = '#a16207'
  c.lineWidth = 1.6
  c.stroke()
  halo(c, 18.5, 2.4, lit ? 6 : 3.5, '#fb923c', 0.9)
  sparkle(c, 18.5, 2.4, lit ? 3 : 1.6)
}

function drawShard(c: CanvasRenderingContext2D) {
  halo(c, 7, 7, 7, '#fb923c', 0.6)
  line(c, [[1.5, 10.5], [5.5, 1.5], [7, 5], [12.5, 2.5], [10.5, 12], [6.5, 9]])
  c.closePath()
  c.fillStyle = '#fff7ed'
  c.fill()
  c.strokeStyle = '#9a3412'
  c.lineWidth = 1
  c.stroke()
}

export interface SpecialSprites {
  shield: Sprite[]
  /** Skjoldboblen efter resterende træf: indeks 0 = 1 træf tilbage, 3 = hel. */
  bubbles: Sprite[]
  sniper: Sprite[]
  bomber: Sprite[]
  ninja: Sprite[]
  balloonHen: Sprite[]
  balloons: Sprite[]
  balloonPopped: Sprite[]
  medic: Sprite[]
  ufo: Sprite[]
  turkey: Sprite[]
  rainbow: Sprite[]
  bomb: Sprite
  bombLit: Sprite
  shard: Sprite
}

type SharedSpecials = Omit<SpecialSprites, 'shield' | 'sniper' | 'bomber' | 'balloonHen' | 'medic'>

let sharedSpecials: SharedSpecials | null = null
const themeSpecials = new Map<ThemeId, SpecialSprites>()

function getSharedSpecials(): SharedSpecials {
  if (sharedSpecials) return sharedSpecials
  sharedSpecials = {
    bubbles: [1, 2, 3, 4].map((hits) => make(64, 64, (c) => drawBubble(c, hits))),
    ninja: FRAMES.map((frame) => make(48, 48, (c) => {
      drawHen(c, { ...NINJA_LOOK, ...frame })
      drawNinjaGear(c)
    })),
    balloons: BALLOON_COLORS.map((colors) => make(30, 44, (c) => drawBalloon(c, colors, false))),
    balloonPopped: BALLOON_COLORS.map((colors) => make(30, 44, (c) => drawBalloon(c, colors, true))),
    ufo: [0, 1].map((frame) => make(96, 64, (c) => drawUfo(c, frame))),
    turkey: FRAMES.map((frame) => make(64, 64, (c) => drawTurkey(c, frame))),
    rainbow: [0, 1, 2, 3, 4, 5].map((frame) => make(64, 64, (c) => drawRainbowHen(c, frame))),
    bomb: make(28, 34, (c) => drawBomb(c, false)),
    bombLit: make(28, 34, (c) => drawBomb(c, true)),
    shard: make(14, 14, drawShard),
  }
  return sharedSpecials
}

/** De nye kyllinger; dem med almindelig hønsekrop får temaets toner, resten er ens i alle temaer. */
export function getSpecialSprites(theme: ThemeId): SpecialSprites {
  let sprites = themeSpecials.get(theme)
  if (sprites) return sprites
  const accent = THEMES[theme].hen.accent
  const tinted = (look: HenColors) => tintHen(theme, look)
  sprites = {
    ...getSharedSpecials(),
    shield: FRAMES.map((frame) => make(48, 48, (c) => {
      drawHen(c, { ...tinted(SHIELD_LOOK), ...frame })
      drawShieldBadge(c, '#38bdf8')
    })),
    sniper: FRAMES.map((frame) => make(48, 48, (c) => {
      drawHen(c, { ...tinted(SNIPER_LOOK), ...frame })
      drawSniperGear(c)
    })),
    bomber: FRAMES.map((frame) => make(48, 48, (c) => {
      drawHen(c, { ...tinted(BOMBER_LOOK), ...frame })
      drawBomberGear(c)
    })),
    balloonHen: FRAMES.map((frame) => make(48, 48, (c) => drawHen(c, { ...tinted(BALLOON_LOOK), wings: 'up', scared: frame.scared }))),
    medic: FRAMES.map((frame) => make(48, 48, (c) => {
      drawHen(c, { ...tinted(MEDIC_LOOK), ...frame, comb: accent })
      drawNurseGear(c)
    })),
  }
  themeSpecials.set(theme, sprites)
  return sprites
}

