import { DANGER_ZONE_Y, FIELD, SHIP_HALF_WIDTH, SHIP_SPEED } from './config'
import { drawBossEgg, drawBossLayer, drawWreck } from './bossRender'
import { getBossSprites } from './bossSprites'
import { buildWaveSpec } from './waves'
import type { EffectsState, Particle } from './effects'
import { shakeOffset } from './effects'
import { aimVelocity, SNIPER_AIM_SECONDS, UFO_BEAM, UFO_BEAM_HALF_WIDTH, UFO_STEAL_SECONDS, UFO_WARNING } from './enemies'
import type { Enemy, GameState } from './engine'
import type { ChickenLabels } from './labels'
import { createRng } from './rng'
import { drawSprite, getBackground, getHenSprites, getSpecialSprites, getSprites, PALETTE, type Sprite, type Sprites } from './sprites'
import { THEMES, type ThemeId } from './themes'
import { SPREAD_RANGE } from './weapons'
import { isActive, MAGNET_RADIUS, POWERUP_SECONDS } from './powerups'
import { drawDroppers, drawBonusFrame, drawTexts, drawHud, drawBanner, drawIntro } from './hudRender'
import {
  METEOR_SPIN,
  drawMeteorRim,
  drawGlint,
  drawFireTrail,
  drawCometTail,
  drawMeteorDetail,
  drawBlackHole,
  drawHazardWarnings,
  drawWarning,
  wrap,
} from './hazardRender'

const STAR_LAYERS = [
  { count: 70, speed: 10, size: 1, alpha: 0.45 },
  { count: 40, speed: 26, size: 1.6, alpha: 0.7 },
  { count: 18, speed: 60, size: 2.3, alpha: 1 },
]

interface Star {
  x: number
  y: number
  layer: number
}

/** Svævende støv, sne, gløder eller datapunkter foran baggrunden; positionen regnes ud fra uret. */
interface Mote {
  x: number
  y: number
  speed: number
  phase: number
  size: number
}

const MOTE_COUNT = 56

export interface Renderer {
  /** Tilpasser canvas til den tilgængelige bredde og returnerer den viste størrelse i CSS-pixels. */
  resize: (cssWidth: number, devicePixelRatio: number) => { width: number; height: number }
  draw: (state: GameState, fx: EffectsState, labels: ChickenLabels, clock: number) => void
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')!
  const sprites = getSprites()
  const rng = createRng(77)
  const stars: Star[] = STAR_LAYERS.flatMap((layer, index) =>
    Array.from({ length: layer.count }, () => ({ x: rng() * FIELD.width, y: rng() * FIELD.height, layer: index })),
  )
  const motes: Mote[] = Array.from({ length: MOTE_COUNT }, () => ({
    x: rng() * FIELD.width,
    y: rng() * FIELD.height,
    speed: 10 + rng() * 40,
    phase: rng() * Math.PI * 2,
    size: 1 + rng() * 1.8,
  }))
  let pixelScale = 1

  const resize = (cssWidth: number, devicePixelRatio: number) => {
    const width = Math.max(1, Math.round(cssWidth))
    const height = Math.round((width * FIELD.height) / FIELD.width)
    const physicalWidth = Math.round(width * devicePixelRatio)
    const physicalHeight = Math.round(height * devicePixelRatio)
    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth
      canvas.height = physicalHeight
    }
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    pixelScale = (width / FIELD.width) * devicePixelRatio
    return { width, height }
  }

  const draw = (state: GameState, fx: EffectsState, labels: ChickenLabels, clock: number) => {
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    if (state.awaitingWave) warmNextWave(state)
    ctx.drawImage(getBackground(state.spec.theme, FIELD.width, FIELD.height).canvas, 0, 0, FIELD.width, FIELD.height)
    const motion = fx.reducedMotion ? 0 : clock
    drawStars(ctx, stars, motion, THEMES[state.spec.theme].starTint)
    drawAmbient(ctx, motes, state.spec.theme, motion)

    const shake = shakeOffset(fx)
    ctx.save()
    ctx.translate(shake.x, shake.y)
    drawSplats(ctx, fx)
    drawDangerZone(ctx, state, clock)
    drawBlackHole(ctx, sprites, state, clock)
    drawHazardWarnings(ctx, state, clock)
    drawMagnetField(ctx, state, clock)
    drawPickups(ctx, sprites, state, clock)
    drawUfoBeams(ctx, state, clock)
    drawSniperSights(ctx, state, clock)
    drawDroppers(ctx, state, clock)
    drawEnemies(ctx, sprites, state, clock)
    drawWreck(ctx, sprites, fx, clock)
    drawBossLayer(ctx, sprites, state, fx, clock)
    drawEggs(ctx, sprites, state, clock)
    drawLaserBeam(ctx, state, fx, clock)
    drawProjectiles(ctx, sprites, state, clock)
    drawArcs(ctx, fx, clock)
    drawShip(ctx, sprites, state, clock)
    drawDrone(ctx, sprites, state, clock)
    drawParticles(ctx, fx.particles)
    drawTexts(ctx, fx)
    ctx.restore()

    drawSlowmo(ctx, state, clock)
    drawBonusFrame(ctx, state, clock)
    drawHud(ctx, sprites, state, labels, clock)
    drawBanner(ctx, fx)
    drawIntro(ctx, fx, state.spec.theme, clock)
    if (fx.flash > 0) {
      ctx.globalAlpha = fx.flash * 0.55
      ctx.fillStyle = fx.flashColor
      ctx.fillRect(0, 0, FIELD.width, FIELD.height)
      ctx.globalAlpha = 1
    }
  }

  let warmedWave = 0
  /**
   * I pausen mellem bølgerne tegnes næste sektors baggrund og næste boss én gang i et enkelt pixel (som straks
   * overmales), så den første rigtige tegning ikke hakker (ca. 30-70 ms pr. stort lærred).
   */
  const warmNextWave = (state: GameState) => {
    if (warmedWave === state.wave) return
    warmedWave = state.wave
    const next = buildWaveSpec(state.wave + 1, state.difficulty, state.seed)
    ctx.drawImage(getBackground(next.theme, FIELD.width, FIELD.height).canvas, 0, 0, 1, 1)
    if (next.bossType && next.bossType !== 'motherHen') {
      for (const sprite of getBossSprites(next.bossType, next.bossVariant ?? 0).body) ctx.drawImage(sprite.canvas, 0, 0, 1, 1)
    }
  }

  return { resize, draw }
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], clock: number, tint: string) {
  ctx.fillStyle = tint
  for (const star of stars) {
    const layer = STAR_LAYERS[star.layer]
    const y = (star.y + clock * layer.speed) % FIELD.height
    ctx.globalAlpha = layer.alpha
    ctx.fillRect(star.x, y, layer.size, layer.size)
  }
  ctx.globalAlpha = 1
}

function drawAmbient(ctx: CanvasRenderingContext2D, motes: Mote[], theme: ThemeId, clock: number) {
  const { width, height } = FIELD
  ctx.save()
  switch (theme) {
    case 'asteroids':
      ctx.fillStyle = '#f5d0a0'
      for (const m of motes) {
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(m.phase + clock)
        ctx.fillRect(wrap(m.x + clock * m.speed * 0.7, width), wrap(m.y + clock * m.speed * 0.24, height), m.size, m.size)
      }
      break
    case 'ice':
      ctx.fillStyle = '#f0fbff'
      for (const m of motes) {
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(m.phase + clock * 2)
        ctx.beginPath()
        ctx.arc(wrap(m.x + Math.sin(clock * 0.8 + m.phase) * 14, width), wrap(m.y + clock * (12 + m.speed * 0.5), height), m.size * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'volcano':
      ctx.globalCompositeOperation = 'lighter'
      for (const m of motes) {
        const y = height - wrap(height - m.y + clock * (18 + m.speed * 0.6), height)
        ctx.globalAlpha = Math.max(0, 0.35 + 0.35 * Math.sin(clock * 7 + m.phase)) * Math.min(1, y / 200)
        ctx.fillStyle = m.phase > Math.PI ? '#ffb347' : '#ff5a1f'
        ctx.fillRect(m.x + Math.sin(clock * 1.4 + m.phase) * 10, y, m.size, m.size * 1.6)
      }
      break
    case 'mothership': {
      const scan = wrap(clock * 70, height + 240) - 120
      const band = ctx.createLinearGradient(0, scan - 60, 0, scan + 60)
      band.addColorStop(0, 'rgba(74, 222, 128, 0)')
      band.addColorStop(0.5, 'rgba(74, 222, 128, 0.07)')
      band.addColorStop(1, 'rgba(74, 222, 128, 0)')
      ctx.fillStyle = band
      ctx.fillRect(0, scan - 60, width, 120)
      ctx.fillStyle = '#86efac'
      for (const m of motes) {
        ctx.globalAlpha = 0.12 + 0.18 * Math.max(0, Math.sin(clock * 1.5 + m.phase))
        ctx.fillRect(m.x, height - wrap(height - m.y + clock * m.speed * 0.35, height), m.size, m.size)
      }
      break
    }
    default:
      break
  }
  ctx.restore()
}

function drawSplats(ctx: CanvasRenderingContext2D, fx: EffectsState) {
  for (const splat of fx.splats) {
    const alpha = Math.min(1, splat.life / (splat.maxLife * 0.4))
    ctx.globalAlpha = alpha * 0.9
    ctx.fillStyle = '#fff8e7'
    ctx.beginPath()
    ctx.ellipse(splat.x, FIELD.height - 3, splat.size * 1.5, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PALETTE.yolk
    ctx.beginPath()
    ctx.ellipse(splat.x + 1, FIELD.height - 4, splat.size * 0.55, 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawDangerZone(ctx: CanvasRenderingContext2D, state: GameState, clock: number) {
  let lowest = 0
  for (const enemy of state.enemies) if (enemy.mode === 'formation') lowest = Math.max(lowest, enemy.y + enemy.radius)
  const proximity = 1 - (DANGER_ZONE_Y - lowest) / 140
  if (proximity <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, proximity) * (0.55 + Math.sin(clock * 10) * 0.25)
  ctx.strokeStyle = PALETTE.comb
  ctx.lineWidth = 2
  ctx.setLineDash([10, 8])
  ctx.beginPath()
  ctx.moveTo(0, DANGER_ZONE_Y)
  ctx.lineTo(FIELD.width, DANGER_ZONE_Y)
  ctx.stroke()
  ctx.restore()
}

function drawPickups(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, clock: number) {
  // I bonusbanerne er pickups hele pointen, så de tegnes større.
  const scale = state.bonus ? 1.35 : 1
  for (const pickup of state.pickups) {
    const sprite = sprites.pickups[pickup.kind]
    if (pickup.kind === 'coin') {
      const spin = Math.cos(clock * 6 + pickup.id)
      ctx.save()
      ctx.translate(pickup.x, pickup.y)
      ctx.scale(Math.max(0.18, Math.abs(spin)) * scale, scale)
      drawSprite(ctx, sprite, 0, 0)
      ctx.restore()
      if (spin > 0.9) drawGlint(ctx, pickup.x + 4 * scale, pickup.y - 5 * scale, 6 * scale, (spin - 0.9) * 10)
    } else if (pickup.kind === 'drumstick') {
      drawSprite(ctx, sprite, pickup.x, pickup.y, { rotation: clock * 5 + pickup.id, scale })
    } else {
      const look = pickup.kind === 'gift' && pickup.family ? sprites.gifts[pickup.family] : sprite
      drawSprite(ctx, look, pickup.x, pickup.y + Math.sin(clock * 5 + pickup.id) * 2, { scale: 1 + Math.sin(clock * 8 + pickup.id) * 0.06 })
    }
  }
}

/** Svagt roterende feltlinjer om skibet, mens magneten virker. */
function drawMagnetField(ctx: CanvasRenderingContext2D, state: GameState, clock: number) {
  if (!isActive(state, 'magnet')) return
  const { ship } = state
  const fade = Math.min(1, (state.powerups.until.magnet - state.time) / 1.5)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 3; i++) {
    const r = MAGNET_RADIUS * (1 - (((clock * 0.45 + i / 3) % 1) ** 1.4))
    ctx.globalAlpha = 0.16 * fade * (r / MAGNET_RADIUS)
    ctx.strokeStyle = i % 2 ? '#f43f5e' : '#93c5fd'
    ctx.setLineDash([10, 14])
    ctx.lineDashOffset = -clock * 40
    ctx.beginPath()
    ctx.arc(ship.x, ship.y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.setLineDash([])
  for (const pickup of state.pickups) {
    const d = Math.hypot(pickup.x - ship.x, pickup.y - ship.y)
    if (d > MAGNET_RADIUS) continue
    ctx.globalAlpha = 0.35 * fade * (1 - d / MAGNET_RADIUS)
    ctx.strokeStyle = '#fda4af'
    ctx.beginPath()
    ctx.moveTo(pickup.x, pickup.y)
    ctx.lineTo(ship.x, ship.y - 10)
    ctx.stroke()
  }
  ctx.restore()
}

function enemyFrame(enemy: Enemy, clock: number): number {
  if (enemy.hitFlash > 0) return 2
  return Math.abs(Math.floor(clock * 7 + enemy.id * 0.37)) % 2
}

function drawEnemies(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, clock: number) {
  const hens = getHenSprites(state.spec.theme)
  const specials = getSpecialSprites(state.spec.theme)
  const driftLean = state.spec.motion === 'snake' || state.spec.motion === 'pinball'
  for (const enemy of state.enemies) {
    const frame = enemyFrame(enemy, clock)
    const wobble = Math.sin(clock * 3 + enemy.id) * 0.06
    const swept = enemy.mode === 'entering' || enemy.mode === 'looping' || (driftLean && enemy.mode === 'formation')
    let lean = enemy.mode === 'diving' ? Math.sign(enemy.p2x - enemy.p0x) * 0.35 : swept ? Math.max(-0.3, Math.min(0.3, enemy.dx * 0.06)) : 0
    if (enemy.mode === 'kamikaze') lean = Math.atan2(enemy.vx, enemy.vy) * 0.7
    let rotation = wobble + lean
    let sprite: Sprite
    switch (enemy.kind) {
      case 'hen':
      case 'helmet':
        sprite = hens.hens[enemy.variant % hens.hens.length][frame]
        break
      case 'diver':
        sprite = hens.divers[frame]
        break
      case 'golden':
        sprite = sprites.golden[frame]
        break
      case 'chick':
        sprite = sprites.chicks[frame]
        break
      case 'meteor': {
        const set = sprites.meteors[enemy.meteorType] ?? sprites.meteors.rock
        const frames = enemy.large ? set.large : set.small
        sprite = frames[enemy.id % frames.length]
        if (enemy.meteorType === 'fire') drawFireTrail(ctx, enemy, clock)
        else if (enemy.meteorType !== 'comet') drawMeteorRim(ctx, enemy)
        if (enemy.meteorType === 'comet') {
          drawCometTail(ctx, enemy, clock)
          rotation = Math.atan2(enemy.vy, enemy.vx)
        } else {
          rotation = clock * METEOR_SPIN[enemy.meteorType] * (enemy.id % 2 ? 1 : -1)
        }
        break
      }
      case 'galleryHen':
        sprite = sprites.golden[frame]
        rotation = wobble + Math.max(-0.3, Math.min(0.3, enemy.dx * 0.05))
        break
      case 'balloon': {
        const popped = enemy.hp < enemy.maxHp
        const bob = Math.sin(clock * 2.4 + enemy.id) * 2.5
        const balloons = popped ? specials.balloonPopped : specials.balloons
        drawSprite(ctx, balloons[enemy.variant % balloons.length], enemy.x + 12, enemy.y - 34 + bob, { rotation: 0.22 + Math.sin(clock * 1.7 + enemy.id) * 0.08 })
        sprite = specials.balloonHen[popped || frame === 2 ? 2 : 0]
        break
      }
      case 'ninja':
        sprite = specials.ninja[frame]
        for (let k = 3; k >= 1; k--) {
          drawSprite(ctx, sprite, enemy.x - enemy.vx * 0.03 * k, enemy.y, { rotation: Math.sign(enemy.vx) * 0.25, alpha: 0.34 - k * 0.09 })
        }
        rotation = Math.sign(enemy.vx) * 0.25 + wobble
        break
      case 'ufo':
        sprite = specials.ufo[Math.abs(Math.floor(clock * 6)) % 2]
        rotation = Math.max(-0.12, Math.min(0.12, enemy.vx * 0.0012))
        break
      case 'turkey':
        sprite = specials.turkey[frame]
        if (enemy.mode === 'kamikaze') drawSpeedLines(ctx, enemy)
        break
      case 'rainbow':
        drawRainbowTrail(ctx, enemy, clock)
        sprite = specials.rainbow[Math.abs(Math.floor(clock * 10 + enemy.id)) % specials.rainbow.length]
        break
      case 'bomber':
        sprite = specials.bomber[frame]
        if (enemy.stage === 1 && enemy.mode !== 'entering') {
          const lit = Math.floor(clock * 14) % 2 === 0
          drawSprite(ctx, lit ? specials.bombLit : specials.bomb, enemy.x + Math.sin(clock * 40) * 1.2, enemy.y + 20, { scale: 0.62 })
        }
        break
      case 'medic':
        sprite = specials.medic[frame]
        if (enemy.mode !== 'entering' && enemy.cooldown < 0.6) drawHealAura(ctx, enemy)
        break
      case 'bossPart':
        // Tårne og trio-høns tegnes sammen med bossen.
        continue
      default:
        sprite = specials[enemy.kind][frame]
    }
    drawSprite(ctx, sprite, enemy.x, enemy.y, { rotation })
    if (enemy.kind === 'meteor') drawMeteorDetail(ctx, sprites, enemy, rotation, clock)
    if (enemy.kind === 'helmet') drawSprite(ctx, hens.helmets[Math.max(0, Math.min(2, enemy.hp - 1))], enemy.x, enemy.y, { rotation })
    if (enemy.hitFlash > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      drawSprite(ctx, sprite, enemy.x, enemy.y, { rotation, alpha: 0.7 })
      ctx.restore()
    }
    if (enemy.shield > 0) {
      const pulse = 1 + Math.sin(clock * 4 + enemy.id) * 0.025 + (enemy.hitFlash > 0 ? 0.08 : 0)
      drawSprite(ctx, specials.bubbles[Math.min(3, enemy.shield - 1)], enemy.x, enemy.y + 1, { scale: 0.82 * pulse, rotation: Math.sin(clock * 0.8 + enemy.id) * 0.15 })
    }
    if (enemy.mode === 'wobble') drawWarning(ctx, enemy.x, enemy.y - enemy.radius - 18, clock)
  }
}

function drawSpeedLines(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const speed = Math.hypot(enemy.vx, enemy.vy) || 1
  const ux = enemy.vx / speed
  const uy = enemy.vy / speed
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 237, 213, 0.45)'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  for (const offset of [-14, 0, 14]) {
    const sx = enemy.x - uy * offset - ux * 26
    const sy = enemy.y + ux * offset - uy * 26
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx - ux * (offset === 0 ? 34 : 22), sy - uy * (offset === 0 ? 34 : 22))
    ctx.stroke()
  }
  ctx.restore()
}

const RAINBOW_TRAIL = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7']

function drawRainbowTrail(ctx: CanvasRenderingContext2D, enemy: Enemy, clock: number) {
  const dir = Math.sign(enemy.vx) || 1
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  RAINBOW_TRAIL.forEach((color, i) => {
    ctx.globalAlpha = 0.4
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(enemy.x - dir * (26 + i * 3), enemy.y - 10 + i * 4 + Math.sin(clock * 6 + i) * 1.5, 22, 2.2, 0, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
}

function drawHealAura(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const t = 1 - enemy.cooldown / 0.6
  ctx.save()
  ctx.strokeStyle = `rgba(74, 222, 128, ${0.15 + 0.5 * t})`
  ctx.lineWidth = 2
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.arc(enemy.x, enemy.y, 24 + t * 8, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawSniperSights(ctx: CanvasRenderingContext2D, state: GameState, clock: number) {
  const { ship } = state
  ctx.save()
  ctx.setLineDash([5, 6])
  ctx.lineDashOffset = -clock * 30
  for (const enemy of state.enemies) {
    if (enemy.kind !== 'sniper' || enemy.stage !== 1 || enemy.dead) continue
    const y0 = enemy.y + enemy.radius
    // Skibet kan være over snigskytten; sigtet tegnes aldrig opad.
    const aimY = Math.max(ship.y, y0 + 24)
    const v = aimVelocity(enemy.x, y0, ship.x, ship.y, 1)
    const t = (aimY - y0) / Math.max(0.2, v.vy)
    const ex = enemy.x + v.vx * t
    const charge = 1 - Math.max(0, enemy.cooldown) / SNIPER_AIM_SECONDS
    ctx.globalAlpha = 0.25 + 0.55 * charge
    ctx.strokeStyle = '#f43f5e'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(enemy.x, y0)
    ctx.lineTo(ex, aimY)
    ctx.stroke()
    ctx.fillStyle = '#fb7185'
    ctx.beginPath()
    ctx.arc(ex, aimY, 2.5 + charge * 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawUfoBeams(ctx: CanvasRenderingContext2D, state: GameState, clock: number) {
  const bottom = FIELD.height
  for (const enemy of state.enemies) {
    if (enemy.kind !== 'ufo' || enemy.dead || (enemy.stage !== UFO_WARNING && enemy.stage !== UFO_BEAM)) continue
    const top = enemy.y + 12
    ctx.save()
    if (enemy.stage === UFO_WARNING) {
      ctx.setLineDash([8, 7])
      ctx.lineDashOffset = clock * 40
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(clock * 24)
      ctx.strokeStyle = '#86efac'
      ctx.lineWidth = 2
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(enemy.x + side * 12, top)
        ctx.lineTo(enemy.x + side * UFO_BEAM_HALF_WIDTH, bottom)
        ctx.stroke()
      }
      ctx.restore()
      continue
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(1, enemy.stageT / 0.15)
    const g = ctx.createLinearGradient(0, top, 0, bottom)
    g.addColorStop(0, 'rgba(187, 247, 208, 0.55)')
    g.addColorStop(1, 'rgba(74, 222, 128, 0.12)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(enemy.x - 12, top)
    ctx.lineTo(enemy.x + 12, top)
    ctx.lineTo(enemy.x + UFO_BEAM_HALF_WIDTH, bottom)
    ctx.lineTo(enemy.x - UFO_BEAM_HALF_WIDTH, bottom)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(220, 252, 231, 0.45)'
    ctx.lineWidth = 1.5
    const span = bottom - top
    for (let i = 0; i < 5; i++) {
      const y = bottom - ((clock * 140 + i * (span / 5)) % span)
      const w = 12 + (UFO_BEAM_HALF_WIDTH - 12) * ((y - top) / span)
      ctx.beginPath()
      ctx.ellipse(enemy.x, y, w, w * 0.18, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
    if (enemy.beam > 0 && !enemy.stolen) {
      ctx.save()
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(state.ship.x, state.ship.y, 32, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(1, enemy.beam)) / UFO_STEAL_SECONDS)
      ctx.stroke()
      ctx.restore()
    }
  }
}

function drawEggs(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, clock: number) {
  const specials = getSpecialSprites(state.spec.theme)
  for (const egg of state.eggs) {
    if (drawBossEgg(ctx, egg, clock)) continue
    if (egg.kind === 'shard') {
      drawSprite(ctx, specials.shard, egg.x, egg.y, { rotation: clock * 14 + egg.id })
    } else if (egg.kind === 'bomb') {
      // Blinker hurtigere, jo tættere bomben er på at sprænge.
      const left = Math.max(0, Math.min(1, ((egg.burstY ?? egg.y) - egg.y) / 220))
      const rate = 3 + (1 - left) * 14
      const lit = Math.sin(clock * rate * Math.PI * 2) > 0
      if (left < 0.6) {
        ctx.save()
        ctx.globalAlpha = (0.6 - left) * 0.9
        ctx.strokeStyle = '#fb923c'
        ctx.setLineDash([3, 5])
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(egg.x, egg.burstY ?? egg.y, 26, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
      drawSprite(ctx, lit ? specials.bombLit : specials.bomb, egg.x, egg.y, { rotation: Math.sin(clock * 7 + egg.id) * 0.18 })
    } else {
      if (egg.kind === 'aimed') {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)'
        ctx.beginPath()
        ctx.arc(egg.x, egg.y, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      drawSprite(ctx, sprites.egg, egg.x, egg.y, { rotation: egg.kind === 'aimed' ? -Math.atan2(egg.vx, egg.vy) : Math.sin(clock * 9 + egg.id) * 0.25 })
    }
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, clock: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const projectile of state.projectiles) {
    const rotation = Math.atan2(projectile.vx, -projectile.vy)
    switch (projectile.kind) {
      case 'pellet': {
        const left = Math.max(0, Math.min(1, (projectile.range ?? SPREAD_RANGE) / 120))
        drawSprite(ctx, sprites.pellet, projectile.x, projectile.y, { rotation, alpha: left, scale: 0.75 + left * 0.35 })
        break
      }
      case 'rocket': {
        const flicker = 0.8 + Math.sin(clock * 60 + projectile.id) * 0.2
        const back = 12
        const fx = projectile.x - Math.sin(rotation) * back
        const fy = projectile.y + Math.cos(rotation) * back
        const flame = ctx.createRadialGradient(fx, fy, 0, fx, fy, 9 * flicker)
        flame.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
        flame.addColorStop(0.4, 'rgba(253, 186, 116, 0.8)')
        flame.addColorStop(1, 'rgba(192, 132, 252, 0)')
        ctx.fillStyle = flame
        ctx.beginPath()
        ctx.arc(fx, fy, 9 * flicker, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        drawSprite(ctx, sprites.rocket, projectile.x, projectile.y, { rotation })
        ctx.globalCompositeOperation = 'lighter'
        break
      }
      case 'drone':
        drawSprite(ctx, sprites.droneBolt, projectile.x, projectile.y, { rotation })
        break
      default:
        drawSprite(ctx, projectile.kind === 'ion' ? sprites.ion : sprites.bolt, projectile.x, projectile.y, { rotation })
    }
  }
  ctx.restore()
}

/** Lynets buer: takkede linjer mellem leddene, tegnet på ny med nye knæk hvert billede. */
function drawArcs(ctx: CanvasRenderingContext2D, fx: EffectsState, clock: number) {
  if (fx.arcs.length === 0) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const arc of fx.arcs) {
    const t = arc.life / arc.maxLife
    const seed = Math.floor(clock * 30)
    for (const [width, color, alpha] of [[7 + arc.level, 'rgba(74, 168, 255, 1)', 0.35], [2.4, 'rgba(219, 234, 254, 1)', 0.95]] as const) {
      ctx.globalAlpha = alpha * t
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(arc.points[0], arc.points[1])
      for (let i = 2; i < arc.points.length; i += 2) {
        const x0 = arc.points[i - 2]
        const y0 = arc.points[i - 1]
        const x1 = arc.points[i]
        const y1 = arc.points[i + 1]
        const length = Math.hypot(x1 - x0, y1 - y0)
        const steps = Math.max(2, Math.round(length / 22))
        const nx = -(y1 - y0) / (length || 1)
        const ny = (x1 - x0) / (length || 1)
        for (let s = 1; s < steps; s++) {
          const k = s / steps
          const jag = Math.sin((seed + i * 7 + s * 13) * 12.9898) * 10
          ctx.lineTo(x0 + (x1 - x0) * k + nx * jag, y0 + (y1 - y0) * k + ny * jag)
        }
        ctx.lineTo(x1, y1)
      }
      ctx.stroke()
    }
    for (let i = 2; i < arc.points.length; i += 2) {
      ctx.globalAlpha = 0.6 * t
      ctx.fillStyle = '#bfdbfe'
      ctx.beginPath()
      ctx.arc(arc.points[i], arc.points[i + 1], 9, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** Laserstrålen lige op fra skibets næse med en pulserende kerne. */
function drawLaserBeam(ctx: CanvasRenderingContext2D, state: GameState, fx: EffectsState, clock: number) {
  const beam = fx.beam
  if (!beam || state.status !== 'playing') return
  const { ship } = state
  const bottom = ship.y - 20
  const fade = Math.min(1, beam.life / 0.08)
  const pulse = 1 + Math.sin(clock * 50) * 0.12
  const w = beam.halfWidth * pulse
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = fade
  const glow = ctx.createLinearGradient(ship.x - w * 2.6, 0, ship.x + w * 2.6, 0)
  glow.addColorStop(0, 'rgba(74, 222, 128, 0)')
  glow.addColorStop(0.5, 'rgba(74, 222, 128, 0.45)')
  glow.addColorStop(1, 'rgba(74, 222, 128, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(ship.x - w * 2.6, 0, w * 5.2, bottom)
  const core = ctx.createLinearGradient(ship.x - w, 0, ship.x + w, 0)
  core.addColorStop(0, 'rgba(134, 239, 172, 0.1)')
  core.addColorStop(0.5, 'rgba(240, 253, 244, 0.95)')
  core.addColorStop(1, 'rgba(134, 239, 172, 0.1)')
  ctx.fillStyle = core
  ctx.fillRect(ship.x - w, 0, w * 2, bottom)
  for (let i = 0; i < 7; i++) {
    const y = bottom - ((clock * 1100 + i * 83) % bottom)
    const streak = ctx.createLinearGradient(0, y - 26, 0, y)
    streak.addColorStop(0, 'rgba(220, 252, 231, 0)')
    streak.addColorStop(1, 'rgba(220, 252, 231, 0.55)')
    ctx.fillStyle = streak
    ctx.fillRect(ship.x - w * 0.3, y - 26, w * 0.6, 26)
  }
  const muzzle = ctx.createRadialGradient(ship.x, bottom, 0, ship.x, bottom, w * 2.4 + 6)
  muzzle.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  muzzle.addColorStop(1, 'rgba(74, 222, 128, 0)')
  ctx.fillStyle = muzzle
  ctx.beginPath()
  ctx.arc(ship.x, bottom, w * 2.4 + 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawDrone(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, clock: number) {
  if (!isActive(state, 'drone')) return
  const drone = state.powerups.drone
  const left = state.powerups.until.drone - state.time
  if (left < 2 && Math.floor(clock * 10) % 2 === 0) return
  drawSprite(ctx, sprites.drone, drone.x, drone.y + Math.sin(clock * 6) * 1.5, { rotation: Math.sin(drone.phase) * 0.15, scale: 1.3 })
}

/** Indigo tone over hele banen og en langsom puls i kanterne, mens slowmo virker. */
function drawSlowmo(ctx: CanvasRenderingContext2D, state: GameState, clock: number) {
  if (!isActive(state, 'slowmo')) return
  const left = state.powerups.until.slowmo - state.time
  const strength = Math.min(1, left / 0.6, (POWERUP_SECONDS.slowmo - left) / 0.3)
  ctx.save()
  ctx.globalAlpha = 0.14 * strength
  ctx.fillStyle = '#4f46e5'
  ctx.fillRect(0, 0, FIELD.width, FIELD.height)
  const vignette = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.35, FIELD.width / 2, FIELD.height / 2, FIELD.width * 0.62)
  vignette.addColorStop(0, 'rgba(99, 102, 241, 0)')
  vignette.addColorStop(1, 'rgba(129, 140, 248, 1)')
  ctx.globalAlpha = (0.28 + Math.sin(clock * 3) * 0.06) * strength
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, FIELD.width, FIELD.height)
  ctx.restore()
}

function drawShip(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, clock: number) {
  const { ship } = state
  const invulnerable = state.time < ship.invulnerableUntil && state.status === 'playing'
  if (invulnerable && Math.floor(clock * 12) % 2 === 0) return
  const tilt = Math.max(-0.3, Math.min(0.3, (ship.vx / SHIP_SPEED) * 0.22))
  // Negativ når skibet flyver op: længere flamme og en anelse strækt skrog.
  const pitch = Math.max(-1, Math.min(1, ship.vy / SHIP_SPEED))
  const thrust = 1 - pitch * 0.5

  ctx.save()
  ctx.translate(ship.x, ship.y)
  ctx.rotate(tilt)
  ctx.scale(1, 1 - pitch * 0.05)
  ctx.globalCompositeOperation = 'lighter'
  for (const dx of [-4, 4]) {
    const length = (14 + Math.sin(clock * 50 + dx) * 4 + (state.time % 0.1) * 20) * thrust
    const flame = ctx.createLinearGradient(0, 26, 0, 26 + length)
    flame.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
    flame.addColorStop(0.3, 'rgba(53, 224, 240, 0.85)')
    flame.addColorStop(1, 'rgba(53, 224, 240, 0)')
    ctx.fillStyle = flame
    ctx.beginPath()
    ctx.moveTo(dx - 3, 26)
    ctx.lineTo(dx + 3, 26)
    ctx.lineTo(dx, 26 + length)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
  drawSprite(ctx, sprites.ship, 0, 0)
  ctx.restore()

  if (ship.shield) {
    ctx.save()
    const pulse = 0.55 + Math.sin(clock * 5) * 0.2
    ctx.strokeStyle = `rgba(96, 165, 250, ${pulse})`
    ctx.fillStyle = `rgba(96, 165, 250, ${pulse * 0.18})`
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + clock * 0.8
      const x = ship.x + Math.cos(angle) * (SHIP_HALF_WIDTH + 12)
      const y = ship.y + Math.sin(angle) * (SHIP_HALF_WIDTH + 12)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const t = p.life / p.maxLife
    ctx.globalAlpha = Math.min(1, t * 1.6)
    ctx.fillStyle = p.color
    switch (p.kind) {
      case 'spark':
        ctx.globalCompositeOperation = 'lighter'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        break
      case 'feather':
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size, p.size * 0.38, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(42, 29, 74, 0.35)'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(-p.size, 0)
        ctx.lineTo(p.size, 0)
        ctx.stroke()
        ctx.restore()
        break
      case 'smoke':
        ctx.globalAlpha = t * 0.35
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 + (1 - t) * 1.5), 0, Math.PI * 2)
        ctx.fill()
        break
      case 'ring':
        ctx.strokeStyle = p.color
        ctx.lineWidth = 4 * t + 1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 + (1 - t) * 4), 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'cross':
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 6, p.size, p.size / 3)
        ctx.fillRect(p.x - p.size / 6, p.y - p.size / 2, p.size / 3, p.size)
        break
      case 'streak':
        ctx.globalCompositeOperation = 'lighter'
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.size
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05)
        ctx.stroke()
        ctx.globalCompositeOperation = 'source-over'
        break
      default:
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (p.kind === 'shell' ? 0.6 : 1))
        ctx.restore()
    }
  }
  ctx.globalAlpha = 1
}

