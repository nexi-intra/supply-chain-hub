import { FIELD } from './config'
import type { Enemy, GameState } from './engine'
import { BLACK_HOLE, type HazardWarning, type MeteorType } from './hazards'
import { FONT } from './hudRender'
import { drawSprite, PALETTE, type Sprites } from './sprites'

/** Meteorernes detaljer, det sorte hul og hazard-varslerne (kometbaner og asteroidebæltets baner). */

export const wrap = (value: number, size: number) => ((value % size) + size) % size

/** Rødt "!"-varsel (kalkunens vrik, bæltets baner). */
export function drawWarning(ctx: CanvasRenderingContext2D, x: number, y: number, clock: number) {
  const pop = 1 + Math.max(0, Math.sin(clock * 18)) * 0.18
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(pop, pop)
  ctx.fillStyle = PALETTE.comb
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 14px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('!', 0, 1)
  ctx.restore()
}

export const METEOR_SPIN: Record<MeteorType, number> = { rock: 0.8, fire: 1.7, ice: 0.4, metal: 0.35, gold: 0.9, comet: 0 }
const METEOR_RIM: Record<MeteorType, string> = {
  rock: '255, 214, 170',
  fire: '255, 140, 60',
  ice: '125, 211, 252',
  metal: '226, 232, 240',
  gold: '255, 212, 71',
  comet: '186, 230, 253',
}

/** Svag glød bag meteoren, så den skiller sig ud fra baggrundens pyntesten; bane-sten får støvstriber. */
export function drawMeteorRim(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const rim = METEOR_RIM[enemy.meteorType]
  const reach = enemy.radius * 1.7
  ctx.save()
  const glow = ctx.createRadialGradient(enemy.x, enemy.y, enemy.radius * 0.6, enemy.x, enemy.y, reach)
  glow.addColorStop(0, `rgba(${rim}, 0.32)`)
  glow.addColorStop(1, `rgba(${rim}, 0)`)
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(enemy.x, enemy.y, reach, 0, Math.PI * 2)
  ctx.fill()
  if (enemy.vy === 0 && enemy.vx !== 0) {
    const dir = Math.sign(enemy.vx)
    ctx.strokeStyle = `rgba(${rim}, 0.35)`
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    for (const offset of [-0.55, 0, 0.55]) {
      const sx = enemy.x - dir * enemy.radius * 1.1
      const sy = enemy.y + offset * enemy.radius
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx - dir * (offset === 0 ? 46 : 28), sy)
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function drawGlint(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, color = '#ffffff') {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.quadraticCurveTo(x, y, x, y + r)
  ctx.quadraticCurveTo(x, y, x - r, y)
  ctx.quadraticCurveTo(x, y, x, y - r)
  ctx.fill()
  ctx.restore()
}

const unitVelocity = (enemy: Enemy) => {
  const speed = Math.hypot(enemy.vx, enemy.vy) || 1
  return { ux: enemy.vx / speed, uy: enemy.vy / speed }
}

export function drawFireTrail(ctx: CanvasRenderingContext2D, enemy: Enemy, clock: number) {
  const { ux, uy } = unitVelocity(enemy)
  const length = enemy.radius * (3.4 + Math.sin(clock * 22 + enemy.id) * 0.5)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let k = 7; k >= 0; k--) {
    const t = k / 7
    const flicker = Math.sin(clock * 31 + k * 1.7 + enemy.id) * enemy.radius * 0.18 * t
    const x = enemy.x - ux * length * t - uy * flicker
    const y = enemy.y - uy * length * t + ux * flicker
    ctx.globalAlpha = (1 - t) * 0.6
    ctx.fillStyle = t < 0.25 ? '#fff1a8' : t < 0.55 ? '#ff9a3c' : '#ef4444'
    ctx.beginPath()
    ctx.arc(x, y, enemy.radius * (1.05 - t * 0.75), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function drawCometTail(ctx: CanvasRenderingContext2D, enemy: Enemy, clock: number) {
  const { ux, uy } = unitVelocity(enemy)
  const length = 160
  const width = enemy.radius * 1.25
  const tailX = enemy.x - ux * length
  const tailY = enemy.y - uy * length
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const g = ctx.createLinearGradient(enemy.x, enemy.y, tailX, tailY)
  g.addColorStop(0, 'rgba(224, 242, 254, 0.8)')
  g.addColorStop(0.3, 'rgba(56, 189, 248, 0.38)')
  g.addColorStop(1, 'rgba(56, 189, 248, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(enemy.x - uy * width, enemy.y + ux * width)
  ctx.quadraticCurveTo(enemy.x - ux * length * 0.4 - uy * width * 0.8, enemy.y - uy * length * 0.4 + ux * width * 0.8, tailX, tailY)
  ctx.quadraticCurveTo(enemy.x - ux * length * 0.4 + uy * width * 0.8, enemy.y - uy * length * 0.4 - ux * width * 0.8, enemy.x + uy * width, enemy.y - ux * width)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(enemy.x, enemy.y)
  ctx.lineTo(enemy.x - ux * length * 0.45, enemy.y - uy * length * 0.45)
  ctx.stroke()
  ctx.fillStyle = '#e0f2fe'
  for (let i = 0; i < 7; i++) {
    const t = (clock * 1.6 + i / 7 + enemy.id * 0.13) % 1
    const side = Math.sin(i * 2.1 + clock * 5) * width * 0.7 * t
    ctx.globalAlpha = (1 - t) * 0.9
    ctx.fillRect(enemy.x - ux * length * t - uy * side - 1, enemy.y - uy * length * t + ux * side - 1, 2.2, 2.2)
  }
  ctx.restore()
}

/** Revner i metal efter skade, glimt i guld og et lille blink i isen. */
export function drawMeteorDetail(ctx: CanvasRenderingContext2D, sprites: Sprites, enemy: Enemy, rotation: number, clock: number) {
  switch (enemy.meteorType) {
    case 'metal': {
      const damage = enemy.maxHp - enemy.hp
      if (damage >= 2) drawSprite(ctx, sprites.metalCracks[damage >= 5 ? 2 : damage >= 4 ? 1 : 0], enemy.x, enemy.y, { rotation })
      break
    }
    case 'gold': {
      const t = (clock * 0.9 + enemy.id * 0.37) % 1.6
      if (t < 0.45) drawGlint(ctx, enemy.x + enemy.radius * 0.35, enemy.y - enemy.radius * 0.45, 4 + 7 * Math.sin((t / 0.45) * Math.PI), Math.sin((t / 0.45) * Math.PI))
      break
    }
    case 'ice': {
      const t = (clock * 0.7 + enemy.id * 0.53) % 2
      if (t < 0.35) drawGlint(ctx, enemy.x - enemy.radius * 0.3, enemy.y - enemy.radius * 0.4, 3 + 5 * Math.sin((t / 0.35) * Math.PI), Math.sin((t / 0.35) * Math.PI), '#e0f7ff')
      break
    }
  }
}

export function drawBlackHole(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, clock: number) {
  const hole = state.hazard?.blackHole
  if (!hole || hole.strength <= 0) return
  const s = hole.collapsing ? Math.sqrt(hole.strength) : 1 - (1 - hole.strength) ** 3
  const squash = BLACK_HOLE.orbitSquash
  ctx.save()
  ctx.translate(hole.x, hole.y)
  const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 220 * s)
  glow.addColorStop(0, 'rgba(91, 33, 182, 0.45)')
  glow.addColorStop(0.5, 'rgba(76, 29, 149, 0.16)')
  glow.addColorStop(1, 'rgba(76, 29, 149, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(-220, -220, 440, 440)
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  const colors = ['#f0abfc', '#fde68a', '#93c5fd']
  for (let i = 0; i < 44; i++) {
    const t = (clock * 0.32 + i * 0.6180339) % 1
    const r = (220 - t * 190) * s
    const a = i * 2.39996 + clock * (0.5 + t * 2.4)
    const tail = 0.1 + t * 0.22
    ctx.globalAlpha = Math.sin(t * Math.PI) * 0.75
    ctx.strokeStyle = colors[i % 3]
    ctx.lineWidth = 1 + t * 1.2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a - tail) * (r + 12), Math.sin(a - tail) * (r + 12) * squash)
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * squash)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const disk = sprites.accretionDisk
  const drawDisk = () => {
    ctx.save()
    ctx.scale(s, s * 0.36)
    ctx.rotate(clock * 0.9)
    ctx.drawImage(disk.canvas, -disk.w / 2, -disk.h / 2, disk.w, disk.h)
    ctx.restore()
  }
  drawDisk()
  ctx.globalCompositeOperation = 'source-over'
  const core = BLACK_HOLE.coreRadius * 1.05 * s
  const shadow = ctx.createRadialGradient(0, 0, core * 0.6, 0, 0, core * 1.7)
  shadow.addColorStop(0, '#000000')
  shadow.addColorStop(0.6, 'rgba(0, 0, 0, 0.92)')
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = shadow
  ctx.beginPath()
  ctx.arc(0, 0, core * 1.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'lighter'
  // Lys fra skivens bagside, bøjet hen over toppen af hullet.
  ctx.strokeStyle = 'rgba(255, 190, 110, 0.75)'
  ctx.lineWidth = 4 * s
  ctx.beginPath()
  ctx.ellipse(0, 0, core * 1.5, core * 1.32, 0, Math.PI * 1.04, Math.PI * 1.96)
  ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.rect(-220, 0, 440, 220)
  ctx.clip()
  drawDisk()
  ctx.restore()
  ctx.strokeStyle = `rgba(255, 248, 235, ${0.7 + Math.sin(clock * 9) * 0.2})`
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(0, 0, core * 1.08, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, 0, core * 1.28, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export function drawHazardWarnings(ctx: CanvasRenderingContext2D, state: GameState, clock: number) {
  const hazard = state.hazard
  if (!hazard) return
  for (const warning of hazard.warnings) {
    if (state.time < warning.from) continue
    if (warning.kind === 'lane' && state.time >= warning.until) {
      if (!state.awaitingWave) drawBusyLane(ctx, warning, clock)
      continue
    }
    const progress = Math.min(1, (state.time - warning.from) / Math.max(0.01, warning.until - warning.from))
    const blink = 0.55 + 0.45 * Math.sin(clock * (10 + progress * 16))
    if (warning.kind === 'lane') drawLaneWarning(ctx, warning, blink, clock)
    else drawCometWarning(ctx, warning, progress, blink, clock)
  }
}

/** Svag markering af en bane, mens stenene passerer. */
function drawBusyLane(ctx: CanvasRenderingContext2D, warning: HazardWarning, clock: number) {
  const half = 24
  ctx.save()
  ctx.fillStyle = 'rgba(251, 146, 60, 0.06)'
  ctx.fillRect(0, warning.y - half, FIELD.width, half * 2)
  ctx.setLineDash([4, 12])
  ctx.lineDashOffset = -warning.dirX * clock * 120
  ctx.strokeStyle = 'rgba(253, 186, 116, 0.28)'
  ctx.lineWidth = 1.2
  for (const dy of [-half, half]) {
    ctx.beginPath()
    ctx.moveTo(0, warning.y + dy)
    ctx.lineTo(FIELD.width, warning.y + dy)
    ctx.stroke()
  }
  ctx.restore()
}

function drawLaneWarning(ctx: CanvasRenderingContext2D, warning: HazardWarning, blink: number, clock: number) {
  const half = 24
  const { y, dirX } = warning
  ctx.save()
  const band = ctx.createLinearGradient(0, y - half, 0, y + half)
  band.addColorStop(0, 'rgba(251, 146, 60, 0)')
  band.addColorStop(0.5, `rgba(251, 146, 60, ${0.1 + 0.14 * blink})`)
  band.addColorStop(1, 'rgba(251, 146, 60, 0)')
  ctx.fillStyle = band
  ctx.fillRect(0, y - half, FIELD.width, half * 2)
  ctx.setLineDash([14, 10])
  ctx.lineDashOffset = -dirX * clock * 160
  ctx.strokeStyle = `rgba(253, 186, 116, ${0.3 + 0.35 * blink})`
  ctx.lineWidth = 1.5
  for (const dy of [-half, half]) {
    ctx.beginPath()
    ctx.moveTo(0, y + dy)
    ctx.lineTo(FIELD.width, y + dy)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.strokeStyle = `rgba(255, 237, 213, ${0.25 + 0.45 * blink})`
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const spacing = 90
  const shift = wrap(clock * 220 * dirX, spacing)
  for (let x = shift - spacing; x < FIELD.width + spacing; x += spacing) {
    ctx.beginPath()
    ctx.moveTo(x - 6 * dirX, y - 9)
    ctx.lineTo(x + 6 * dirX, y)
    ctx.lineTo(x - 6 * dirX, y + 9)
    ctx.stroke()
  }
  ctx.restore()
  drawWarning(ctx, dirX > 0 ? 20 : FIELD.width - 20, y, clock)
}

/** Varslet står et stykke inde på kometens bane, under HUD'en, med bane, nedtællingsring og pil. */
function drawCometWarning(ctx: CanvasRenderingContext2D, warning: HazardWarning, progress: number, blink: number, clock: number) {
  const { dirX, dirY } = warning
  let x = warning.x
  let y = warning.y
  for (let step = 0; step < 24 && (y < 104 || x < 40 || x > FIELD.width - 40); step++) {
    x += dirX * 12
    y += dirY * 12
  }
  ctx.save()
  ctx.setLineDash([8, 7])
  ctx.lineDashOffset = -clock * 120
  ctx.strokeStyle = `rgba(186, 230, 253, ${0.3 + 0.45 * progress})`
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(warning.x, warning.y)
  ctx.lineTo(x + dirX * 420, y + dirY * 420)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createRadialGradient(x, y, 2, x, y, 34)
  glow.addColorStop(0, `rgba(125, 211, 252, ${0.35 + 0.35 * blink})`)
  glow.addColorStop(1, 'rgba(125, 211, 252, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, 34, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = '#e0f2fe'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - progress))
  ctx.stroke()
  ctx.translate(x, y)
  ctx.rotate(Math.atan2(dirY, dirX))
  const size = 12 + blink * 3
  ctx.fillStyle = `rgba(14, 165, 233, ${0.65 + 0.35 * blink})`
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(size + 4, 0)
  ctx.lineTo(-size * 0.6, -size * 0.8)
  ctx.lineTo(-size * 0.15, 0)
  ctx.lineTo(-size * 0.6, size * 0.8)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
