import { FAMILY_COLORS, type WeaponFamily } from './weapons'
import { circle, ellipse, halo, PALETTE, sparkle } from './spriteKit'

/** Gaver i våbenfamiliens farve, power-up-kugler, drone, raket, mønt og kyllingelår. */

interface GiftLook {
  light: string
  dark: string
  lid: string
}

const GIFT_LOOKS: Record<WeaponFamily, GiftLook> = {
  blaster: { light: '#ff6b7a', dark: '#c81d33', lid: '#e02b42' },
  lightning: { light: '#7cc4ff', dark: '#1d5fd1', lid: '#2f7ae5' },
  laser: { light: '#86efac', dark: '#15803d', lid: '#22a04f' },
  spread: { light: '#fdba74', dark: '#c2410c', lid: '#ea6a1a' },
  homing: { light: '#e9b8ff', dark: '#7e22ce', lid: '#9d4ee0' },
}

/** Familiens lille tegn: ionskud, lyn, stråle, vifte eller raket. */
function drawFamilyGlyph(c: CanvasRenderingContext2D, family: WeaponFamily, cx: number, cy: number, s: number, color: string) {
  c.save()
  c.translate(cx, cy)
  c.scale(s, s)
  c.fillStyle = color
  c.strokeStyle = color
  c.lineWidth = 1.4
  c.lineCap = 'round'
  c.lineJoin = 'round'
  switch (family) {
    case 'blaster':
      ellipse(c, -2.2, 0.4, 1.3, 3.4)
      c.fill()
      ellipse(c, 2.2, -0.4, 1.3, 3.4)
      c.fill()
      break
    case 'lightning':
      c.beginPath()
      c.moveTo(1.6, -4.2)
      c.lineTo(-2, 0.4)
      c.lineTo(0.6, 0.4)
      c.lineTo(-1.6, 4.2)
      c.lineTo(2.4, -0.8)
      c.lineTo(-0.2, -0.8)
      c.closePath()
      c.fill()
      break
    case 'laser':
      c.fillRect(-1.1, -4.4, 2.2, 8.8)
      c.globalAlpha = 0.45
      c.fillRect(-2.6, -4.4, 5.2, 8.8)
      break
    case 'spread':
      for (const angle of [-0.6, 0, 0.6]) {
        c.beginPath()
        c.moveTo(0, 3.6)
        c.lineTo(Math.sin(angle) * 6.5, 3.6 - Math.cos(angle) * 6.5)
        c.stroke()
        circle(c, Math.sin(angle) * 6.5, 3.6 - Math.cos(angle) * 6.5, 1.2)
        c.fill()
      }
      break
    case 'homing':
      c.beginPath()
      c.moveTo(0, -4.6)
      c.quadraticCurveTo(2, -2.4, 1.6, 1.8)
      c.lineTo(3, 3.8)
      c.lineTo(-3, 3.8)
      c.lineTo(-1.6, 1.8)
      c.quadraticCurveTo(-2, -2.4, 0, -4.6)
      c.closePath()
      c.fill()
      break
  }
  c.restore()
}

export function drawGift(c: CanvasRenderingContext2D, family: WeaponFamily = 'blaster') {
  const look = GIFT_LOOKS[family]
  halo(c, 18, 18, 18, FAMILY_COLORS[family], 0.55)
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.6
  const box = c.createLinearGradient(0, 14, 0, 29)
  box.addColorStop(0, look.light)
  box.addColorStop(1, look.dark)
  c.beginPath()
  c.roundRect(10, 15, 16, 14, 2)
  c.fillStyle = box
  c.fill()
  c.stroke()
  c.beginPath()
  c.roundRect(8.5, 11.5, 19, 5, 1.5)
  c.fillStyle = look.lid
  c.fill()
  c.stroke()
  c.fillStyle = PALETTE.yolk
  c.fillRect(16.6, 11.5, 2.8, 17.5)
  for (const side of [-1, 1]) {
    ellipse(c, 18 + side * 4, 9, 4, 2.6, side * 0.5)
    c.fill()
    c.stroke()
  }
  circle(c, 18, 22.4, 5)
  c.fillStyle = '#ffffff'
  c.fill()
  c.lineWidth = 1.1
  c.stroke()
  drawFamilyGlyph(c, family, 18, 22.4, 0.82, look.dark)
}

/** HUD-ikonet: afrundet firkant i familiens farve med tegnet i hvidt. */
export function drawWeaponIcon(c: CanvasRenderingContext2D, family: WeaponFamily) {
  const look = GIFT_LOOKS[family]
  const g = c.createLinearGradient(0, 2, 0, 24)
  g.addColorStop(0, look.light)
  g.addColorStop(1, look.dark)
  c.beginPath()
  c.roundRect(2, 2, 22, 22, 6)
  c.fillStyle = g
  c.fill()
  c.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  c.lineWidth = 1.4
  c.stroke()
  drawFamilyGlyph(c, family, 13, 13, 1.45, '#ffffff')
}

export function drawDroneOrb(c: CanvasRenderingContext2D) {
  orb(c, '#f1f5f9', '#475569', PALETTE.plasma)
  c.fillStyle = '#e2e8f0'
  ellipse(c, 18, 19, 6.5, 4.2)
  c.fill()
  for (const side of [-1, 1]) {
    c.fillRect(18 + side * 6 - 1.5, 13.5, 3, 4)
    ellipse(c, 18 + side * 7.5, 13.5, 3.4, 1.2)
    c.fill()
  }
  circle(c, 18, 19, 2.2)
  c.fillStyle = PALETTE.plasma
  c.fill()
}

export function drawSlowmoOrb(c: CanvasRenderingContext2D) {
  orb(c, '#e0e7ff', '#4338ca', '#818cf8')
  c.beginPath()
  c.moveTo(12.5, 11)
  c.lineTo(23.5, 11)
  c.lineTo(18, 18)
  c.lineTo(23.5, 25)
  c.lineTo(12.5, 25)
  c.lineTo(18, 18)
  c.closePath()
  c.stroke()
  c.beginPath()
  c.moveTo(14.6, 23.6)
  c.lineTo(21.4, 23.6)
  c.lineTo(18, 20.2)
  c.closePath()
  c.fill()
}

export function drawMagnetOrb(c: CanvasRenderingContext2D) {
  orb(c, '#ffe4e6', '#be123c', '#f43f5e')
  c.lineWidth = 3.4
  c.lineCap = 'butt'
  c.beginPath()
  c.arc(18, 17, 5.6, Math.PI, 0, true)
  c.stroke()
  c.beginPath()
  c.moveTo(12.4, 17)
  c.lineTo(12.4, 12)
  c.moveTo(23.6, 17)
  c.lineTo(23.6, 12)
  c.stroke()
  c.fillStyle = '#93c5fd'
  c.fillRect(10.7, 10, 3.4, 2.8)
  c.fillRect(21.9, 10, 3.4, 2.8)
}

export function drawDoubleOrb(c: CanvasRenderingContext2D) {
  orb(c, '#fef9c3', '#ca8a04', '#facc15')
  c.font = '800 11px system-ui, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.lineWidth = 2.4
  c.strokeStyle = '#713f12'
  c.strokeText('×2', 18, 18.5)
  c.fillText('×2', 18, 18.5)
}

export function drawLifeOrb(c: CanvasRenderingContext2D) {
  orb(c, '#dcfce7', '#15803d', '#4ade80')
  c.beginPath()
  c.moveTo(18, 25)
  c.bezierCurveTo(9, 19, 11, 11.5, 15.4, 11.8)
  c.bezierCurveTo(17, 12, 18, 13.6, 18, 14.6)
  c.bezierCurveTo(18, 13.6, 19, 12, 20.6, 11.8)
  c.bezierCurveTo(25, 11.5, 27, 19, 18, 25)
  c.closePath()
  c.fill()
  c.fillStyle = '#15803d'
  c.fillRect(17, 14.6, 2, 6.4)
  c.fillRect(14.8, 16.8, 6.4, 2)
}

export function drawDrone(c: CanvasRenderingContext2D) {
  halo(c, 15, 12, 14, PALETTE.plasma, 0.35)
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.3
  for (const side of [-1, 1]) {
    c.fillStyle = '#94a3b8'
    c.fillRect(15 + side * 7 - 1, 9, 2, 4)
    ellipse(c, 15 + side * 9, 8, 5, 1.6)
    c.fillStyle = 'rgba(226, 232, 240, 0.85)'
    c.fill()
    c.stroke()
  }
  const body = c.createLinearGradient(0, 8, 0, 20)
  body.addColorStop(0, '#f8fafc')
  body.addColorStop(1, '#64748b')
  ellipse(c, 15, 14, 7.5, 5.5)
  c.fillStyle = body
  c.fill()
  c.stroke()
  circle(c, 15, 14.5, 2.6)
  c.fillStyle = PALETTE.plasma
  c.fill()
  circle(c, 14.2, 13.7, 0.9)
  c.fillStyle = '#ffffff'
  c.fill()
}

export function drawRocket(c: CanvasRenderingContext2D) {
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1
  c.fillStyle = '#7e22ce'
  for (const side of [-1, 1]) {
    c.beginPath()
    c.moveTo(6 + side * 2.5, 15)
    c.lineTo(6 + side * 5.5, 21)
    c.lineTo(6 + side * 2.5, 20)
    c.closePath()
    c.fill()
    c.stroke()
  }
  const body = c.createLinearGradient(3, 0, 9, 0)
  body.addColorStop(0, '#c084fc')
  body.addColorStop(0.5, '#f5e8ff')
  body.addColorStop(1, '#9333ea')
  c.beginPath()
  c.moveTo(6, 1.5)
  c.quadraticCurveTo(9.4, 6, 8.8, 20)
  c.lineTo(3.2, 20)
  c.quadraticCurveTo(2.6, 6, 6, 1.5)
  c.closePath()
  c.fillStyle = body
  c.fill()
  c.stroke()
  c.fillStyle = '#fde68a'
  c.fillRect(4, 11, 4, 1.6)
}

export function drawCoin(c: CanvasRenderingContext2D) {
  halo(c, 14, 14, 14, PALETTE.yolk, 0.5)
  const g = c.createRadialGradient(10, 9, 1, 14, 14, 11)
  g.addColorStop(0, '#fff7c2')
  g.addColorStop(0.55, '#fbbf24')
  g.addColorStop(1, '#b45309')
  circle(c, 14, 14, 10)
  c.fillStyle = g
  c.fill()
  c.strokeStyle = '#7c4a03'
  c.lineWidth = 1.5
  c.stroke()
  circle(c, 14, 14, 7.2)
  c.strokeStyle = 'rgba(124, 74, 3, 0.55)'
  c.lineWidth = 1
  c.stroke()
  ellipse(c, 14, 14.6, 3.4, 4.4)
  c.fillStyle = '#fde68a'
  c.fill()
  c.strokeStyle = '#92400e'
  c.lineWidth = 0.9
  c.stroke()
  sparkle(c, 9.5, 8.5, 2.2)
}


export function orb(c: CanvasRenderingContext2D, inner: string, outer: string, glow: string) {
  halo(c, 18, 18, 18, glow, 0.55)
  const g = c.createRadialGradient(14, 13, 1, 18, 18, 12)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  circle(c, 18, 18, 11.5)
  c.fillStyle = g
  c.fill()
  c.strokeStyle = 'rgba(255,255,255,0.85)'
  c.lineWidth = 1.6
  c.stroke()
  c.strokeStyle = '#ffffff'
  c.fillStyle = '#ffffff'
  c.lineWidth = 2
}

export function drawDrumstick(c: CanvasRenderingContext2D) {
  c.strokeStyle = PALETTE.ink
  c.lineWidth = 1.5
  c.save()
  c.translate(15, 15)
  c.rotate(Math.PI / 4)
  c.fillStyle = '#fff7e6'
  c.fillRect(-2, 4, 4, 8)
  c.strokeRect(-2, 4, 4, 8)
  for (const side of [-1, 1]) {
    circle(c, side * 2.4, 13, 2.4)
    c.fill()
    c.stroke()
  }
  const meat = c.createRadialGradient(-2, -4, 1, 0, -2, 9)
  meat.addColorStop(0, '#f2a15a')
  meat.addColorStop(0.6, '#c2621f')
  meat.addColorStop(1, '#7c3410')
  ellipse(c, 0, -2, 7, 8.5)
  c.fillStyle = meat
  c.fill()
  c.stroke()
  c.restore()
}
