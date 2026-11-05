/** Fælles tegnegrej til spillets sprites: lærreder, grundformer, hønsen og tegning af en færdig sprite. */
export interface Sprite {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

export const PALETTE = {
  space: '#120c2b',
  yolk: '#ffc93c',
  comb: '#ef3b4f',
  feather: '#fff4dc',
  plasma: '#35e0f0',
  ink: '#2a1d4a',
}

const SPRITE_SCALE = 3
export const BEAK = '#ff9f1c'
export const BEAK_DARK = '#d9730d'

export function make(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, scale = SPRITE_SCALE): Sprite {
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

export function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rotation = 0) {
  c.beginPath()
  c.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2)
}

export function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
}

export function halo(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
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

export interface HenLook {
  body: string
  shade: string
  belly: string
  wings: 'up' | 'down'
  scared: boolean
  angry?: boolean
  outline?: number
  comb?: string
}

/** Tegner en høne forfra i en 48×48-boks. */
export function drawHen(c: CanvasRenderingContext2D, look: HenLook) {
  const outline = look.outline ?? 2
  c.strokeStyle = PALETTE.ink
  c.lineWidth = outline

  c.save()
  c.strokeStyle = BEAK_DARK
  c.lineWidth = outline * 1.2
  for (const [x1, y1, x2, y2] of [[19, 40, 16.5, 45], [19, 40, 21, 45.5], [29, 40, 27, 45.5], [29, 40, 31.5, 45]]) {
    c.beginPath()
    c.moveTo(x1, y1)
    c.lineTo(x2, y2)
    c.stroke()
  }
  c.restore()

  for (const side of [-1, 1]) {
    c.save()
    c.translate(24 + side * 14, look.wings === 'up' ? 21 : 30)
    c.rotate(side * (look.wings === 'up' ? -0.75 : 0.45))
    ellipse(c, 0, 0, 9.5, 6)
    c.fillStyle = look.shade
    c.fill()
    c.stroke()
    c.beginPath()
    c.moveTo(side * 2, -2)
    c.lineTo(side * 7, 0)
    c.moveTo(side * 1, 2)
    c.lineTo(side * 6, 3)
    c.lineWidth = outline * 0.5
    c.stroke()
    c.restore()
  }

  const bodyGradient = c.createRadialGradient(19, 22, 2, 24, 29, 18)
  bodyGradient.addColorStop(0, '#ffffff')
  bodyGradient.addColorStop(0.35, look.body)
  bodyGradient.addColorStop(1, look.shade)
  ellipse(c, 24, 29, 15, 13)
  c.fillStyle = bodyGradient
  c.fill()
  c.stroke()
  ellipse(c, 24, 32.5, 8, 6.5)
  c.fillStyle = look.belly
  c.fill()

  c.fillStyle = look.comb ?? PALETTE.comb
  c.lineWidth = outline * 0.75
  for (const [x, y, r] of [[19.5, 6.8, 3.2], [24, 4.6, 3.7], [28.5, 6.8, 3.2]]) {
    circle(c, x, y, r)
    c.fill()
    c.stroke()
  }
  c.lineWidth = outline

  const headGradient = c.createRadialGradient(20, 11, 1, 24, 15, 11)
  headGradient.addColorStop(0, '#ffffff')
  headGradient.addColorStop(0.45, look.body)
  headGradient.addColorStop(1, look.shade)
  circle(c, 24, 15, 10)
  c.fillStyle = headGradient
  c.fill()
  c.stroke()

  const eyeR = look.scared ? 4 : 3
  const pupilR = look.scared ? 1.1 : 1.8
  for (const x of [20, 28]) {
    ellipse(c, x, 13, eyeR, eyeR * 1.1)
    c.fillStyle = '#ffffff'
    c.fill()
    c.lineWidth = outline * 0.6
    c.stroke()
    circle(c, x + (x < 24 ? 0.6 : -0.6), 13.6, pupilR)
    c.fillStyle = '#140d2e'
    c.fill()
    circle(c, x + 0.9, 12.3, 0.7)
    c.fillStyle = '#ffffff'
    c.fill()
  }
  c.lineWidth = outline

  if (look.angry) {
    c.save()
    c.lineWidth = outline * 1.1
    c.beginPath()
    c.moveTo(16, 8.4)
    c.lineTo(22.5, 10.6)
    c.moveTo(32, 8.4)
    c.lineTo(25.5, 10.6)
    c.stroke()
    c.restore()
  }

  c.fillStyle = BEAK
  c.lineWidth = outline * 0.6
  if (look.scared) {
    c.beginPath()
    c.moveTo(21, 17.5)
    c.lineTo(27, 17.5)
    c.lineTo(24, 20)
    c.closePath()
    c.fill()
    c.stroke()
    c.beginPath()
    c.moveTo(22, 21.5)
    c.lineTo(26, 21.5)
    c.lineTo(24, 24.5)
    c.closePath()
    c.fillStyle = BEAK_DARK
    c.fill()
    c.stroke()
  } else {
    c.beginPath()
    c.moveTo(21, 18)
    c.lineTo(24, 16.4)
    c.lineTo(27, 18)
    c.lineTo(24, 21.8)
    c.closePath()
    c.fill()
    c.stroke()
    circle(c, 24, 23.6, 1.9)
    c.fillStyle = look.comb ?? PALETTE.comb
    c.fill()
  }
}

/** Lille firtakket glimt (guld, regnbue, boss-krystaller). */
export function sparkle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath()
  c.moveTo(x, y - r)
  c.quadraticCurveTo(x, y, x + r, y)
  c.quadraticCurveTo(x, y, x, y + r)
  c.quadraticCurveTo(x, y, x - r, y)
  c.quadraticCurveTo(x, y, x, y - r)
  c.fillStyle = '#ffffff'
  c.fill()
}

/** Hønsens tre billeder: vinger op, vinger ned og bange (ramt). */
export const FRAMES = [
  { wings: 'up' as const, scared: false },
  { wings: 'down' as const, scared: false },
  { wings: 'down' as const, scared: true },
]

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  options: { rotation?: number; scale?: number; alpha?: number } = {},
): void {
  const { rotation = 0, scale = 1, alpha = 1 } = options
  const w = sprite.w * scale
  const h = sprite.h * scale
  if (rotation === 0 && alpha === 1) {
    ctx.drawImage(sprite.canvas, x - w / 2, y - h / 2, w, h)
    return
  }
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.translate(x, y)
  if (rotation !== 0) ctx.rotate(rotation)
  ctx.drawImage(sprite.canvas, -w / 2, -h / 2, w, h)
  ctx.restore()
}
