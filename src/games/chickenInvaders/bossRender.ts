import { BOSS_HALF_HEIGHT, FIELD, LASER_HALF_WIDTH } from './config'
import { beamEnd, livingParts, TRACTOR_HALF_WIDTH, type BossBeam, type BossId, type BossState } from './bosses'
import { getBossEggSprites, getBossSprites } from './bossSprites'
import { bossAccent, type EffectsState } from './effects'
import type { Egg, Enemy, GameState } from './engine'
import type { ChickenLabels } from './labels'
import { drawSprite, PALETTE, type Sprites } from './sprites'

const FONT = "'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, sans-serif"
const TAU = Math.PI * 2

const BEAM_COLORS = { frost: ['125, 211, 252', '#e0f7ff'], red: ['239, 59, 79', '#fff1f2'], plasma: ['217, 70, 239', '#fdf4ff'] } as const

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
  if (r <= 0 || alpha <= 0) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`)
  g.addColorStop(1, `rgba(${rgb}, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')

/** Varslets opladning: en ring der trækker sig sammen og et lys der vokser. */
function drawCharge(ctx: CanvasRenderingContext2D, x: number, y: number, p: number, color: string, clock: number, size = 1) {
  const rgb = hexRgb(color)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  glow(ctx, x, y, (18 + 30 * p) * size, rgb, 0.25 + 0.5 * p)
  ctx.strokeStyle = `rgba(${rgb}, ${0.35 + 0.6 * p})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, (52 - 36 * p) * size, 0, TAU)
  ctx.stroke()
  for (let i = 0; i < 6; i++) {
    const a = clock * 3 + (i * TAU) / 6
    const r = (60 - 50 * p) * size
    ctx.fillStyle = `rgba(${rgb}, ${0.5 + 0.5 * p})`
    ctx.fillRect(x + Math.cos(a) * r - 1.5, y + Math.sin(a) * r - 1.5, 3, 3)
  }
  ctx.restore()
}

const chargeProgress = (boss: BossState, kind?: string) => {
  const a = boss.attack
  if (!a || a.stage !== 'charge' || (kind && a.kind !== kind)) return -1
  return Math.min(1, a.t / a.charge)
}

// ---------------------------------------------------------------- Stråler

function drawBeam(ctx: CanvasRenderingContext2D, beam: BossBeam, clock: number) {
  const [rgb, core] = BEAM_COLORS[beam.style]
  ctx.save()
  if (beam.state === 'warning') {
    const p = Math.min(1, beam.t / beam.warn)
    if (beam.sweep) {
      // Hele den kile, strålen vil feje over, plus startlinjen.
      ctx.fillStyle = `rgba(${rgb}, ${0.06 + 0.1 * p})`
      ctx.beginPath()
      ctx.moveTo(beam.ox, beam.oy)
      ctx.lineTo(beam.x, beam.y)
      ctx.lineTo(beam.toX, beam.toY)
      ctx.closePath()
      ctx.fill()
      ctx.setLineDash([5, 7])
      ctx.strokeStyle = `rgba(${rgb}, 0.45)`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(beam.ox, beam.oy)
      ctx.lineTo(beam.toX, beam.toY)
      ctx.stroke()
      const dir = Math.sign(beam.toX - beam.x)
      ctx.setLineDash([])
      ctx.fillStyle = `rgba(${rgb}, ${0.5 + 0.4 * Math.sin(clock * 12)})`
      for (let k = 0; k < 3; k++) {
        const ax = beam.x + (beam.toX - beam.x) * (0.25 + k * 0.25)
        const ay = FIELD.height - 26
        ctx.beginPath()
        ctx.moveTo(ax + dir * 10, ay)
        ctx.lineTo(ax - dir * 6, ay - 8)
        ctx.lineTo(ax - dir * 6, ay + 8)
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.globalAlpha = 0.45 + 0.4 * Math.abs(Math.sin(clock * (10 + 20 * p)))
    ctx.setLineDash([8, 6])
    ctx.lineDashOffset = -clock * 60
    ctx.strokeStyle = `rgba(${rgb}, 1)`
    ctx.lineWidth = 2 + p * 2
    ctx.beginPath()
    ctx.moveTo(beam.ox, beam.oy)
    ctx.lineTo(beam.x, beam.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalCompositeOperation = 'lighter'
    glow(ctx, beam.ox, beam.oy, 10 + 16 * p, rgb, 0.7)
    ctx.restore()
    return
  }
  const end = beamEnd(beam)
  const angle = Math.atan2(end.y - beam.oy, end.x - beam.ox)
  const length = Math.hypot(end.x - beam.ox, end.y - beam.oy)
  const fade = Math.min(1, (beam.warn + beam.fire - beam.t) / 0.12)
  const w = beam.halfWidth * (0.9 + Math.sin(clock * 50) * 0.1) * fade
  ctx.translate(beam.ox, beam.oy)
  ctx.rotate(angle)
  ctx.globalCompositeOperation = 'lighter'
  const g = ctx.createLinearGradient(0, -w * 1.8, 0, w * 1.8)
  g.addColorStop(0, `rgba(${rgb}, 0)`)
  g.addColorStop(0.3, `rgba(${rgb}, 0.75)`)
  g.addColorStop(0.5, core)
  g.addColorStop(0.7, `rgba(${rgb}, 0.75)`)
  g.addColorStop(1, `rgba(${rgb}, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, -w * 1.8, length, w * 3.6)
  ctx.fillStyle = `rgba(255, 255, 255, 0.5)`
  for (let i = 0; i < 6; i++) {
    const s = (clock * 900 + i * (length / 6)) % length
    ctx.fillRect(s, -1, 26, 2)
  }
  ctx.rotate(-angle)
  glow(ctx, 0, 0, 26, rgb, 0.8)
  glow(ctx, end.x - beam.ox, end.y - beam.oy, 34, rgb, 0.7)
  ctx.restore()
}

// ---------------------------------------------------------------- Mor Høne (uændret tegning)

function drawMotherHen(ctx: CanvasRenderingContext2D, sprites: Sprites, boss: BossState, clock: number) {
  const { laser } = boss
  if (laser.state === 'warning') {
    ctx.save()
    ctx.globalAlpha = 0.5 + Math.sin(clock * 40) * 0.3
    ctx.strokeStyle = PALETTE.comb
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    for (const dx of [-LASER_HALF_WIDTH, LASER_HALF_WIDTH]) {
      ctx.beginPath()
      ctx.moveTo(laser.x + dx, boss.y + BOSS_HALF_HEIGHT)
      ctx.lineTo(laser.x + dx, FIELD.height)
      ctx.stroke()
    }
    ctx.restore()
  }
  const angry = boss.phase >= 2
  if (boss.phase === 3) {
    const pulse = 0.35 + Math.sin(clock * 6) * 0.15
    const g = ctx.createRadialGradient(boss.x, boss.y, 20, boss.x, boss.y, 150)
    g.addColorStop(0, `rgba(239, 59, 79, ${pulse})`)
    g.addColorStop(1, 'rgba(239, 59, 79, 0)')
    ctx.fillStyle = g
    ctx.fillRect(boss.x - 150, boss.y - 150, 300, 300)
  }
  const frame = Math.abs(Math.floor(clock * (angry ? 9 : 5))) % 2
  const bob = boss.entering ? 0 : Math.sin(clock * 2.2) * 5
  drawSprite(ctx, sprites.boss[(angry ? 2 : 0) + frame], boss.x, boss.y + bob)
  if (laser.state === 'firing') {
    const top = boss.y + BOSS_HALF_HEIGHT - 6
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const beam = ctx.createLinearGradient(laser.x - LASER_HALF_WIDTH, 0, laser.x + LASER_HALF_WIDTH, 0)
    beam.addColorStop(0, 'rgba(239, 59, 79, 0)')
    beam.addColorStop(0.3, 'rgba(239, 59, 79, 0.75)')
    beam.addColorStop(0.5, 'rgba(255, 240, 240, 1)')
    beam.addColorStop(0.7, 'rgba(239, 59, 79, 0.75)')
    beam.addColorStop(1, 'rgba(239, 59, 79, 0)')
    ctx.fillStyle = beam
    const jitter = Math.sin(clock * 60) * 2
    ctx.fillRect(laser.x - LASER_HALF_WIDTH - jitter, top, (LASER_HALF_WIDTH + jitter) * 2, FIELD.height - top)
    ctx.restore()
  }
}

// ---------------------------------------------------------------- Fælles for de nye bosser

function flashOver(ctx: CanvasRenderingContext2D, draw: () => void, alpha: number) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha
  draw()
  ctx.restore()
}

const damageLevel = (boss: BossState) => {
  const ratio = boss.health / boss.maxHealth
  return ratio > 0.75 ? 0 : ratio > 0.5 ? 1 : ratio > 0.25 ? 2 : 3
}

function partBar(ctx: CanvasRenderingContext2D, part: Enemy, y: number, color: string) {
  const w = Math.max(30, part.radius * 1.6)
  ctx.fillStyle = 'rgba(18, 12, 43, 0.7)'
  ctx.fillRect(part.x - w / 2 - 1, y - 1, w + 2, 5)
  ctx.fillStyle = color
  ctx.fillRect(part.x - w / 2, y, w * Math.max(0, part.hp / part.maxHp), 3)
}

function drawEggeroid(ctx: CanvasRenderingContext2D, boss: BossState, flash: number, clock: number) {
  const sprites = getBossSprites('eggeroid')
  const level = damageLevel(boss)
  const rumble = Math.max(0, chargeProgress(boss)) * 2.5
  const x = boss.x + (rumble ? Math.sin(clock * 70) * rumble : 0)
  const y = boss.y
  const rotation = Math.sin(boss.spin * 0.8) * 0.07
  if (boss.phase === 3) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    glow(ctx, x, y, 170, '255, 190, 60', 0.25 + Math.sin(clock * 5) * 0.08)
    ctx.restore()
  }
  drawSprite(ctx, sprites.body[0], x, y, { rotation })
  if (level > 0) drawSprite(ctx, sprites.extra[level - 1], x, y, { rotation })
  const shards = chargeProgress(boss, 'shards')
  if (shards >= 0 && level > 0) flashOver(ctx, () => drawSprite(ctx, sprites.extra[level - 1], x, y, { rotation }), 0.3 + 0.7 * shards)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const eye = boss.phase === 3 ? '255, 70, 40' : '255, 170, 60'
  for (const side of [-1, 1]) glow(ctx, x + side * 34, y - 15, 22, eye, 0.6 + Math.sin(clock * 4) * 0.2)
  ctx.restore()
  flashOver(ctx, () => drawSprite(ctx, sprites.body[0], x, y, { rotation }), flash * 0.5)
  const spiral = chargeProgress(boss, 'spiral')
  if (spiral >= 0 && boss.attack) {
    ctx.save()
    ctx.strokeStyle = `rgba(255, 220, 160, ${0.2 + 0.5 * spiral})`
    ctx.setLineDash([4, 6])
    ctx.lineWidth = 2
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath()
      for (let k = 0; k < 24; k++) {
        const angle = boss.attack.a + (arm * TAU) / 3 + boss.attack.n * k * 0.09
        const r = 60 + k * 9
        if (k === 0) ctx.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r)
        else ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r)
      }
      ctx.stroke()
    }
    ctx.restore()
  }
}

function drawIceQueen(ctx: CanvasRenderingContext2D, boss: BossState, flash: number, clock: number) {
  const sprites = getBossSprites('iceQueen')
  const angry = boss.phase >= 2 ? 2 : 0
  const frame = Math.abs(Math.floor(clock * (angry ? 7 : 4))) % 2
  const sprite = sprites.body[angry + frame]
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  glow(ctx, boss.x, boss.y, 150, '125, 211, 252', 0.18 + 0.08 * Math.sin(clock * 2))
  ctx.restore()
  for (let i = 0; i < 8; i++) {
    const a = clock * 0.8 + (i * TAU) / 8
    ctx.fillStyle = 'rgba(240, 251, 255, 0.85)'
    ctx.fillRect(boss.x + Math.cos(a) * 118 - 1.5, boss.y + Math.sin(a) * 60 - 1.5, 3, 3)
  }
  drawSprite(ctx, sprite, boss.x, boss.y)
  flashOver(ctx, () => drawSprite(ctx, sprite, boss.x, boss.y), flash * 0.5)
  const summon = chargeProgress(boss, 'summon')
  if (summon >= 0) {
    ctx.save()
    ctx.translate(boss.x, boss.y - boss.halfHeight - 30)
    ctx.rotate(clock * 4)
    ctx.strokeStyle = `rgba(224, 247, 255, ${0.4 + 0.6 * summon})`
    ctx.lineWidth = 3
    for (let k = 0; k < 6; k++) {
      ctx.rotate(TAU / 6)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, 16 + 8 * summon)
      ctx.moveTo(0, 10)
      ctx.lineTo(5, 15)
      ctx.moveTo(0, 10)
      ctx.lineTo(-5, 15)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** Snestormens vind: skrå striber hen over skærmen i vindens retning. */
function drawBlizzard(ctx: CanvasRenderingContext2D, boss: BossState, clock: number) {
  const a = boss.attack
  if (!a || a.kind !== 'blizzard') return
  const p = a.stage === 'charge' ? a.t / a.charge : 1
  const wind = boss.wind || 1
  ctx.save()
  ctx.strokeStyle = `rgba(240, 251, 255, ${0.1 + 0.25 * p})`
  ctx.lineWidth = 1.5
  for (let i = 0; i < 40; i++) {
    const seed = i * 97.13
    const x = (((seed * 7 + clock * 420 * wind) % 1100) + 1100) % 1100 - 70
    const y = ((seed * 13 + clock * 600) % 640) - 20
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - wind * 26, y - 40)
    ctx.stroke()
  }
  if (a.stage === 'charge') {
    ctx.fillStyle = `rgba(224, 247, 255, ${0.5 + 0.4 * Math.sin(clock * 10)})`
    ctx.font = `800 40px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(wind > 0 ? '»»»' : '«««', FIELD.width / 2, 300)
  }
  ctx.restore()
}

function drawRobo(ctx: CanvasRenderingContext2D, state: GameState, boss: BossState, flash: number, clock: number) {
  const sprites = getBossSprites('roboRooster')
  const turrets = livingParts(state, boss)
  ctx.save()
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  for (const turret of turrets) {
    ctx.beginPath()
    ctx.moveTo(boss.x + Math.sign(turret.x - boss.x) * 70, boss.y)
    ctx.lineTo(turret.x, turret.y - 6)
    ctx.stroke()
  }
  ctx.restore()
  // Jetflammer under benene.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const side of [-1, 1]) {
    const fx = boss.x + side * 41
    const fy = boss.y + 100
    const len = 22 + Math.sin(clock * 30 + side) * 6
    const g = ctx.createLinearGradient(fx, fy, fx, fy + len)
    g.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
    g.addColorStop(0.3, 'rgba(255, 170, 60, 0.85)')
    g.addColorStop(1, 'rgba(255, 60, 20, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(fx - 8, fy)
    ctx.lineTo(fx + 8, fy)
    ctx.lineTo(fx, fy + len)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  const damaged = boss.shielded ? 0 : Math.min(2, damageLevel(boss))
  const body = sprites.body[damaged]
  drawSprite(ctx, body, boss.x, boss.y)
  const angry = boss.phase >= 2
  const rgb = angry ? '255, 60, 60' : '53, 224, 240'
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const scan = Math.sin(clock * 3) * 20
  glow(ctx, boss.x + scan, boss.y - 65, 18, rgb, 0.95)
  ctx.fillStyle = `rgba(${rgb}, 0.8)`
  ctx.fillRect(boss.x - 26, boss.y - 67, 52, 4)
  glow(ctx, boss.x, boss.y + 45, 30 + Math.sin(clock * 6) * 4, rgb, 0.85)
  const homing = chargeProgress(boss, 'homing')
  if (homing >= 0) glow(ctx, boss.x, boss.y + boss.halfHeight * 0.95, 26 * (0.5 + homing), '244, 63, 94', 0.9)
  ctx.restore()
  flashOver(ctx, () => drawSprite(ctx, body, boss.x, boss.y), flash * (boss.shielded ? 0.2 : 0.5))
  if (boss.shielded) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const rx = boss.halfWidth + 16
    const ry = boss.halfHeight + 18
    ctx.fillStyle = `rgba(56, 189, 248, ${0.1 + flash * 0.3})`
    ctx.beginPath()
    ctx.ellipse(boss.x, boss.y, rx, ry, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = `rgba(125, 211, 252, ${0.45 + 0.2 * Math.sin(clock * 5) + flash * 0.4})`
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.25)'
    for (let k = 0; k < 7; k++) {
      const yy = boss.y - ry + ((k + 0.5) * 2 * ry) / 7
      const half = rx * Math.sqrt(Math.max(0, 1 - ((yy - boss.y) / ry) ** 2))
      ctx.beginPath()
      for (let x = -half; x <= half; x += 14) ctx.lineTo(boss.x + x, yy + ((x / 14) % 2 ? 4 : -4))
      ctx.stroke()
    }
    ctx.restore()
  }
  const turretSprite = sprites.extra[0]
  for (const turret of turrets) {
    drawSprite(ctx, turretSprite, turret.x, turret.y)
    if (turret.hitFlash > 0) flashOver(ctx, () => drawSprite(ctx, turretSprite, turret.x, turret.y), 0.7)
    if (turret.hp < turret.maxHp * 0.5) {
      ctx.fillStyle = `rgba(80, 80, 80, ${0.35 + 0.2 * Math.sin(clock * 9 + turret.id)})`
      ctx.beginPath()
      ctx.arc(turret.x + 8, turret.y - 20 - ((clock * 30) % 14), 7, 0, TAU)
      ctx.fill()
    }
    partBar(ctx, turret, turret.y - 38, '#fb923c')
  }
  const burst = chargeProgress(boss, 'burst')
  if (burst >= 0 && boss.attack) {
    const muzzles = turrets.length > 0 ? turrets.map((turret) => ({ x: turret.x, y: turret.y + 18 })) : [{ x: boss.x, y: boss.y + boss.halfHeight * 0.6 }]
    aimLines(ctx, muzzles, boss.attack.x, boss.attack.y, burst, clock)
  }
}

function aimLines(ctx: CanvasRenderingContext2D, from: { x: number; y: number }[], tx: number, ty: number, p: number, clock: number) {
  ctx.save()
  ctx.strokeStyle = `rgba(244, 63, 94, ${0.25 + 0.6 * p})`
  ctx.setLineDash([6, 8])
  ctx.lineDashOffset = -clock * 80
  ctx.lineWidth = 1.5
  for (const m of from) {
    const angle = Math.max(-0.8, Math.min(0.8, Math.atan2(tx - m.x, Math.max(1, ty - m.y))))
    ctx.beginPath()
    ctx.moveTo(m.x, m.y)
    ctx.lineTo(m.x + Math.sin(angle) * 260, m.y + Math.cos(angle) * 260)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.globalCompositeOperation = 'lighter'
  for (const m of from) glow(ctx, m.x, m.y, 10 + 10 * p, '244, 63, 94', 0.9)
  ctx.restore()
}

function drawGalactic(ctx: CanvasRenderingContext2D, sprites: Sprites, boss: BossState, flash: number, clock: number) {
  const own = getBossSprites('galacticRooster')
  const angry = boss.phase >= 2 ? 2 : 0
  const sprite = own.body[angry + (Math.abs(Math.floor(clock * 5)) % 2)]
  const a = boss.attack
  if (a?.kind === 'blackHole') {
    const p = a.stage === 'charge' ? a.t / a.charge : Math.max(boss.pull, 0.2)
    drawSprite(ctx, sprites.accretionDisk, boss.x, boss.y + 10, { rotation: clock * 1.6, scale: 0.6 + 0.9 * p, alpha: 0.4 + 0.5 * p })
  }
  if (a?.kind === 'teleport') {
    const p = a.stage === 'charge' ? a.t / a.charge : 1
    ctx.save()
    ctx.strokeStyle = `rgba(217, 70, 239, ${0.4 + 0.5 * p})`
    ctx.lineWidth = 3
    ctx.setLineDash([10, 8])
    ctx.lineDashOffset = clock * 40
    ctx.beginPath()
    ctx.ellipse(a.x, a.y, boss.halfWidth * (1.4 - 0.4 * p), boss.halfHeight * (1.4 - 0.4 * p), 0, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([3, 9])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(boss.x, boss.y)
    ctx.lineTo(a.x, a.y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'lighter'
    glow(ctx, a.x, a.y, 40 + 60 * p, '217, 70, 239', 0.5 * p)
    ctx.restore()
    drawSprite(ctx, sprite, a.x, a.y, { alpha: 0.15 + 0.25 * p })
  }
  if (boss.hidden) return
  const fade = a?.kind === 'teleport' && a.stage === 'charge' ? 0.55 + 0.45 * Math.abs(Math.cos(a.t * 14)) : 1
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  glow(ctx, boss.x, boss.y, 160, angry ? '244, 114, 182' : '168, 85, 247', 0.2 + 0.08 * Math.sin(clock * 3))
  ctx.restore()
  drawSprite(ctx, sprite, boss.x, boss.y, { alpha: fade })
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const side of [-1, 1]) glow(ctx, boss.x + side * 17, boss.y - 63, 12, angry ? '255, 80, 160' : '103, 232, 249', 0.9)
  for (let i = 0; i < 10; i++) {
    const ang = clock * 0.6 + (i * TAU) / 10
    ctx.fillStyle = i % 3 ? 'rgba(253, 230, 138, 0.9)' : 'rgba(255, 255, 255, 0.9)'
    ctx.fillRect(boss.x + Math.cos(ang) * 135 - 1.5, boss.y + Math.sin(ang) * 80 - 1.5, 3, 3)
  }
  ctx.restore()
  flashOver(ctx, () => drawSprite(ctx, sprite, boss.x, boss.y), flash * 0.5)
  const burst = chargeProgress(boss, 'burst')
  if (burst >= 0 && a) aimLines(ctx, [{ x: boss.x, y: boss.y + boss.halfHeight * 0.6 }], a.x, a.y, burst, clock)
}

function drawTrio(ctx: CanvasRenderingContext2D, state: GameState, boss: BossState, clock: number) {
  const sprites = getBossSprites('eggTrio', boss.variant)
  const charge = boss.attack?.stage === 'charge' ? boss.attack : null
  boss.parts.forEach((id, band) => {
    const hen = state.enemies.find((enemy) => enemy.id === id && !enemy.dead)
    if (!hen) return
    const frame = hen.hitFlash > 0 ? 2 : Math.abs(Math.floor(clock * 6 + band)) % 2
    const sprite = sprites.body[band * 3 + frame]
    if (charge && (charge.kind === 'volley' || charge.source === hen.id)) drawCharge(ctx, hen.x, hen.y + 24, charge.t / charge.charge, boss.variant ? '#ff6a1a' : '#ffc93c', clock, 0.6)
    drawSprite(ctx, sprite, hen.x, hen.y, { rotation: Math.max(-0.25, Math.min(0.25, hen.dx * 0.05)) })
    if (hen.hitFlash > 0) flashOver(ctx, () => drawSprite(ctx, sprite, hen.x, hen.y), 0.6)
    partBar(ctx, hen, hen.y - 54, boss.variant ? '#ff6a1a' : '#facc15')
  })
}

function drawCruiser(ctx: CanvasRenderingContext2D, state: GameState, boss: BossState, flash: number, clock: number) {
  const sprites = getBossSprites('chickenCruiser', boss.variant)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const back = -boss.dir
  const ex = boss.x + back * 186
  const len = 34 + Math.sin(clock * 28) * 8
  const g = ctx.createLinearGradient(ex, 0, ex + back * len, 0)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
  g.addColorStop(0.3, 'rgba(56, 189, 248, 0.8)')
  g.addColorStop(1, 'rgba(56, 189, 248, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(ex, boss.y - 9)
  ctx.lineTo(ex + back * len, boss.y)
  ctx.lineTo(ex, boss.y + 9)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  const hull = sprites.body[0]
  drawSprite(ctx, hull, boss.x, boss.y + 4)
  flashOver(ctx, () => drawSprite(ctx, hull, boss.x, boss.y + 4), flash * 0.25)
  const figurehead = sprites.extra[boss.dir < 0 ? 2 : 1]
  drawSprite(ctx, figurehead, boss.x + (boss.dir < 0 ? -1 : 1) * 192, boss.y - 8, { scale: 1.3, rotation: Math.sin(clock * 2.2) * 0.04 })
  const broadside = chargeProgress(boss, 'broadside')
  if (broadside >= 0) {
    const count = boss.variant ? 7 : 5
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < count; i++) {
      const lit = Math.sin(clock * (12 + 20 * broadside) + i) > 0
      glow(ctx, boss.x - 150 + (300 * i) / (count - 1), boss.y + 26, 12 + 8 * broadside, '255, 200, 60', lit ? 0.95 : 0.4)
    }
    ctx.restore()
  }
  const turretSprite = sprites.extra[0]
  const turrets = livingParts(state, boss)
  for (const turret of turrets) {
    drawSprite(ctx, turretSprite, turret.x, turret.y)
    if (turret.hitFlash > 0) flashOver(ctx, () => drawSprite(ctx, turretSprite, turret.x, turret.y), 0.7)
    partBar(ctx, turret, turret.y + 30, '#38bdf8')
  }
  const aim = chargeProgress(boss, 'turrets')
  if (aim >= 0 && boss.attack) {
    const sides = turrets.filter((turret) => turret.slotParam !== 0).map((turret) => ({ x: turret.x, y: turret.y + 16 }))
    aimLines(ctx, sides, boss.attack.x, boss.attack.y, aim, clock)
    for (const turret of turrets.filter((t) => t.slotParam === 0)) drawCharge(ctx, turret.x, turret.y + 18, aim, '#38bdf8', clock, 0.5)
  }
}

function drawMothership(ctx: CanvasRenderingContext2D, state: GameState, boss: BossState, flash: number, clock: number) {
  const sprites = getBossSprites('ufoMothership')
  const a = boss.attack
  if (a?.kind === 'tractor') {
    const top = boss.y + boss.halfHeight * 0.85
    ctx.save()
    if (a.stage === 'charge') {
      const p = a.t / a.charge
      ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(clock * (8 + 16 * p)))
      ctx.strokeStyle = '#4ade80'
      ctx.setLineDash([8, 6])
      ctx.lineWidth = 2
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(boss.x + side * 40, top)
        ctx.lineTo(boss.x + side * TRACTOR_HALF_WIDTH, FIELD.height)
        ctx.stroke()
      }
    } else {
      const g = ctx.createLinearGradient(0, top, 0, FIELD.height)
      g.addColorStop(0, 'rgba(74, 222, 128, 0.45)')
      g.addColorStop(1, 'rgba(74, 222, 128, 0.12)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(boss.x - 40, top)
      ctx.lineTo(boss.x + 40, top)
      ctx.lineTo(boss.x + TRACTOR_HALF_WIDTH, FIELD.height)
      ctx.lineTo(boss.x - TRACTOR_HALF_WIDTH, FIELD.height)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(187, 247, 208, 0.6)'
      ctx.lineWidth = 2
      const span = FIELD.height - top
      for (let i = 0; i < 6; i++) {
        const y = FIELD.height - ((clock * 160 + i * (span / 6)) % span)
        const w = 40 + (TRACTOR_HALF_WIDTH - 40) * ((y - top) / span)
        ctx.beginPath()
        ctx.ellipse(boss.x, y, w, w * 0.16, 0, 0, TAU)
        ctx.stroke()
      }
      if (a.n > 0 && a.next === 0) {
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(state.ship.x, state.ship.y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, a.n))
        ctx.stroke()
      }
    }
    ctx.restore()
  }
  const sprite = sprites.body[Math.abs(Math.floor(clock * 5)) % 2]
  drawSprite(ctx, sprite, boss.x, boss.y, { rotation: Math.sin(clock * 1.3) * 0.03 })
  flashOver(ctx, () => drawSprite(ctx, sprite, boss.x, boss.y), flash * 0.5)
  const ring = chargeProgress(boss, 'ring')
  if (ring >= 0) drawCharge(ctx, boss.x, boss.y + boss.halfHeight * 0.6, ring, '#fde047', clock, 0.9)
  const ufos = chargeProgress(boss, 'ufos')
  if (ufos >= 0) drawCharge(ctx, boss.x, boss.y - 10, ufos, '#4ade80', clock, 1.2)
}

/** Bossen, dens dele, varsler og stråler. */
export function drawBossLayer(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, fx: EffectsState, clock: number): void {
  const boss = state.boss
  if (!boss) return
  const flash = Math.min(1, fx.bossFlash / 0.08)
  drawBlizzard(ctx, boss, clock)
  switch (boss.id) {
    case 'motherHen':
      drawMotherHen(ctx, sprites, boss, clock)
      break
    case 'eggeroid':
      drawEggeroid(ctx, boss, flash, clock)
      break
    case 'iceQueen':
      drawIceQueen(ctx, boss, flash, clock)
      break
    case 'roboRooster':
      drawRobo(ctx, state, boss, flash, clock)
      break
    case 'galacticRooster':
      drawGalactic(ctx, sprites, boss, flash, clock)
      break
    case 'eggTrio':
      drawTrio(ctx, state, boss, clock)
      break
    case 'chickenCruiser':
      drawCruiser(ctx, state, boss, flash, clock)
      break
    case 'ufoMothership':
      drawMothership(ctx, state, boss, flash, clock)
      break
  }
  const a = boss.attack
  const generic = a && a.stage === 'charge' && boss.id !== 'eggTrio' && ['fan', 'iceFan', 'wideFan', 'chunks', 'bigChunks', 'shards'].includes(a.kind)
  if (generic && !boss.hidden) drawCharge(ctx, a.x, a.y, a.t / a.charge, bossAccent(boss.id, boss.variant), clock, a.kind.includes('hunks') || a.kind === 'shards' ? 1.6 : 1)
  for (const beam of boss.beams) drawBeam(ctx, beam, clock)
}

/** Boss-æggene; returnerer false for de almindelige æg, som render.ts selv tegner. */
export function drawBossEgg(ctx: CanvasRenderingContext2D, egg: Egg, clock: number): boolean {
  if (egg.kind !== 'fire' && egg.kind !== 'ice' && egg.kind !== 'homing') return false
  const sprites = getBossEggSprites()
  if (egg.kind === 'fire') {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const speed = Math.hypot(egg.vx, egg.vy) || 1
    for (let k = 1; k <= 4; k++) glow(ctx, egg.x - (egg.vx / speed) * k * 7, egg.y - (egg.vy / speed) * k * 7, 10 - k * 1.5, '255, 120, 30', 0.5 - k * 0.1)
    ctx.restore()
    drawSprite(ctx, sprites.fire, egg.x, egg.y, { rotation: -Math.atan2(egg.vx, egg.vy) })
  } else if (egg.kind === 'ice') {
    drawSprite(ctx, sprites.ice, egg.x, egg.y, { rotation: -Math.atan2(egg.vx, egg.vy) })
  } else {
    const lit = Math.floor(clock * 6 + egg.id) % 2 === 0
    drawSprite(ctx, sprites.homing[lit ? 1 : 0], egg.x, egg.y, { rotation: -Math.atan2(egg.vx, egg.vy) })
  }
  return true
}

/** Liv-bjælken med navn; mini-bosser får en mindre bjælke. */
export function drawBossBar(ctx: CanvasRenderingContext2D, state: GameState, labels: ChickenLabels, clock: number, outlined: (text: string, x: number, y: number, fill: string) => void): void {
  const boss = state.boss
  if (!boss) return
  const mini = boss.mini
  const barWidth = mini ? 240 : 360
  const height = mini ? 7 : 10
  const x = (FIELD.width - barWidth) / 2
  const top = mini ? 32 : 30
  const accent = bossAccent(boss.id, boss.variant)
  ctx.textAlign = 'center'
  ctx.font = `${mini ? 700 : 800} ${mini ? 12 : 14}px ${FONT}`
  outlined(labels.bossTitle(boss.id, boss.variant).toLocaleUpperCase(labels.locale), FIELD.width / 2, mini ? 26 : 23, accent)
  ctx.fillStyle = 'rgba(18, 12, 43, 0.78)'
  ctx.beginPath()
  ctx.roundRect(x - 3, top - 3, barWidth + 6, height + 6, (height + 6) / 2)
  ctx.fill()
  const health = Math.max(0, boss.health / boss.maxHealth)
  const bar = ctx.createLinearGradient(x, 0, x + barWidth, 0)
  bar.addColorStop(0, PALETTE.comb)
  bar.addColorStop(1, boss.shielded ? '#7dd3fc' : accent)
  ctx.fillStyle = bar
  ctx.beginPath()
  ctx.roundRect(x, top, Math.max(0, barWidth * health), height, height / 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 244, 220, 0.55)'
  for (const mark of [1 / 3, 2 / 3]) ctx.fillRect(x + barWidth * mark - 1, top - 2, 2, height + 4)
  if (boss.shielded) {
    ctx.strokeStyle = `rgba(125, 211, 252, ${0.6 + 0.3 * Math.sin(clock * 5)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x - 3, top - 3, barWidth + 6, height + 6, (height + 6) / 2)
    ctx.stroke()
  }
  // Til højre for bjælken, så den aldrig rammer en lang score med ×2-mærket til venstre.
  ctx.textAlign = 'left'
  ctx.font = `600 11px ${FONT}`
  outlined(labels.wave(state.wave), x + barWidth + 12, top + height, 'rgba(255, 244, 220, 0.7)')
}

/** Vraget efter sejren: bossen ryster, blinker hvidt, synker og falmer, mens eksplosionerne går af. */
export function drawWreck(ctx: CanvasRenderingContext2D, sprites: Sprites, fx: EffectsState, clock: number): void {
  const wreck = fx.wreck
  if (!wreck) return
  const p = 1 - wreck.life / wreck.maxLife
  const sprite = wreckSprite(sprites, wreck.boss, wreck.variant)
  if (!sprite) return
  const shake = fx.reducedMotion ? 0 : (1 - p) * 5
  const x = wreck.x + Math.sin(clock * 60) * shake
  const y = wreck.y + p * p * 70
  const rotation = (wreck.x < FIELD.width / 2 ? -1 : 1) * p * 0.25
  drawSprite(ctx, sprite, x, y, { rotation, alpha: Math.max(0, 1 - p * 1.1), scale: 1 - p * 0.15 })
  flashOver(ctx, () => drawSprite(ctx, sprite, x, y, { rotation, scale: 1 - p * 0.15 }), (0.5 + 0.5 * Math.sin(clock * 30)) * (1 - p))
}

function wreckSprite(sprites: Sprites, id: BossId, variant: number) {
  if (id === 'motherHen') return sprites.boss[2]
  if (id === 'eggTrio') return undefined
  const own = getBossSprites(id, variant)
  return own.body[id === 'iceQueen' || id === 'galacticRooster' || id === 'roboRooster' ? 2 : 0]
}
