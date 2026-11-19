import { DRONE_X, FIELD, GATE_WIDTH, WATER_Y, zoneTheme, type Zone } from './config'
import type { GameState } from './engine'
import { parcelShakeOffset, type ParcelEffects } from './effects'
import type { ParcelLabels } from './labels'
import { blit, CONTAINER_COLORS, CONTAINER_HEIGHT, CRANES_SIZE, getParcelSprites, glowSprite, PALETTES, SKYLINE_SIZE, type ParcelSprites } from './sprites'

const FONT = "'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, sans-serif"
const ZONE_FADE_SECONDS = 1.6
const SPREADER_HEIGHT = 12
const RAIN_DROPS = 140
const DRONE_SCALE = 1.15

export interface ParcelRenderer {
  /** `focusY` giver et beskåret udsnit (cover) centreret om den logiske y-værdi, fx til menuens banner. */
  resize: (cssWidth: number, cssHeight: number, devicePixelRatio: number, focusY?: number) => void
  draw: (state: GameState, fx: ParcelEffects, labels: ParcelLabels, clock: number, options?: { hud?: boolean }) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const mod = (value: number, size: number) => ((value % size) + size) % size

export function droneAngle(state: GameState, clock: number): number {
  if (state.status === 'crashed' || state.status === 'over') return state.drone.spin
  if (state.status === 'ready') return Math.sin(clock * 2.2) * 0.05
  return clamp(state.drone.vy / 1100, -0.35, 0.5)
}

export function createParcelRenderer(canvas: HTMLCanvasElement): ParcelRenderer {
  const ctx = canvas.getContext('2d')!
  const sprites = getParcelSprites()
  const view = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1 }
  const fade = { shown: 1, previous: zoneTheme(1) as Zone, since: -Infinity }

  const resize: ParcelRenderer['resize'] = (cssWidth, cssHeight, devicePixelRatio, focusY) => {
    const width = Math.max(1, Math.round(cssWidth))
    const height = Math.max(1, Math.round(cssHeight))
    const physicalWidth = Math.round(width * devicePixelRatio)
    const physicalHeight = Math.round(height * devicePixelRatio)
    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth
      canvas.height = physicalHeight
    }
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    view.dpr = devicePixelRatio
    if (focusY === undefined) {
      view.scale = width / FIELD.width
      view.offsetX = 0
      view.offsetY = 0
    } else {
      view.scale = Math.max(width / FIELD.width, height / FIELD.height)
      view.offsetX = (width - FIELD.width * view.scale) / 2
      view.offsetY = Math.min(0, Math.max(height - FIELD.height * view.scale, height / 2 - focusY * view.scale))
    }
  }

  const draw: ParcelRenderer['draw'] = (state, fx, labels, clock, options = {}) => {
    if (state.zone !== fade.shown) {
      // En ny runde starter i zone 1 uden overtoning; nye zoner tones ind.
      fade.previous = state.zone > fade.shown ? zoneTheme(fade.shown) : zoneTheme(state.zone)
      fade.since = state.zone > fade.shown ? clock : -Infinity
      fade.shown = state.zone
    }
    const theme = zoneTheme(state.zone)
    const blend = clamp((clock - fade.since) / ZONE_FADE_SECONDS, 0, 1)
    const { scale, offsetX, offsetY, dpr } = view
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    drawBackdrop(ctx, sprites, fade.previous, theme, blend, state.scroll, clock, fx.reducedMotion)
    const shake = parcelShakeOffset(fx)
    ctx.save()
    ctx.translate(shake.x, shake.y)
    drawWater(ctx, theme, state.scroll, clock)
    drawParcels(ctx, sprites, state, clock)
    drawGates(ctx, sprites, state)
    drawDrone(ctx, sprites, state, fx, clock)
    drawAmbient(ctx, fade.previous, theme, blend)
    drawGlows(ctx, state, fx, clock)
    drawParticles(ctx, fx)
    drawRings(ctx, fx)
    drawTexts(ctx, fx)
    ctx.restore()
    if (theme === 'storm') drawStorm(ctx, state.scroll, clock, fx.reducedMotion, blend)

    if (options.hud !== false) {
      drawHud(ctx, state, labels, clock)
      drawBanner(ctx, fx)
    }
    if (fx.flash > 0) {
      ctx.globalAlpha = fx.flash * 0.5
      ctx.fillStyle = fx.flashColor
      ctx.fillRect(0, 0, FIELD.width, FIELD.height)
      ctx.globalAlpha = 1
    }
  }

  return { resize, draw }
}

function drawBackdropLayer(ctx: CanvasRenderingContext2D, sprites: ParcelSprites, zone: Zone, alpha: number, scroll: number, clock: number, reducedMotion: boolean) {
  ctx.globalAlpha = alpha
  blit(ctx, sprites.skies[zone], 0, 0, FIELD.width, FIELD.height)
  if (zone === 'aurora') {
    const sway = reducedMotion ? 0 : Math.sin(clock * 0.25) * 30
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = alpha * (0.75 + (reducedMotion ? 0 : Math.sin(clock * 0.8) * 0.2))
    blit(ctx, sprites.aurora, sway - 30, 0, FIELD.width + 60, 300)
    ctx.restore()
  }
  const skylineX = -mod(scroll * 0.08, SKYLINE_SIZE.width)
  const skylineY = WATER_Y - SKYLINE_SIZE.height + 6
  for (let x = skylineX; x < FIELD.width; x += SKYLINE_SIZE.width) blit(ctx, sprites.skylines[zone], x, skylineY, SKYLINE_SIZE.width, SKYLINE_SIZE.height)
  const cranesX = -mod(scroll * 0.3, CRANES_SIZE.width)
  const cranesY = WATER_Y - CRANES_SIZE.height + 2
  for (let x = cranesX; x < FIELD.width; x += CRANES_SIZE.width) blit(ctx, sprites.cranes[zone], x, cranesY, CRANES_SIZE.width, CRANES_SIZE.height)
}

function drawBackdrop(ctx: CanvasRenderingContext2D, sprites: ParcelSprites, previous: Zone, current: Zone, blend: number, scroll: number, clock: number, reducedMotion: boolean) {
  if (blend < 1) drawBackdropLayer(ctx, sprites, previous, 1, scroll, clock, reducedMotion)
  drawBackdropLayer(ctx, sprites, current, blend, scroll, clock, reducedMotion)
  ctx.globalAlpha = 1
  // Blinkende flylys på de høje bygninger.
  if (Math.floor(clock * 1.2) % 2 === 0) {
    ctx.fillStyle = '#ff4d4d'
    const skylineX = -mod(scroll * 0.08, SKYLINE_SIZE.width)
    for (const x of [140, 470, 820]) ctx.fillRect(mod(skylineX + x, SKYLINE_SIZE.width), WATER_Y - 128, 2.5, 2.5)
  }
}

function drawWater(ctx: CanvasRenderingContext2D, zone: Zone, scroll: number, clock: number) {
  const palette = PALETTES[zone]
  const water = ctx.createLinearGradient(0, WATER_Y, 0, FIELD.height)
  water.addColorStop(0, palette.water[0])
  water.addColorStop(1, palette.water[1])
  ctx.fillStyle = water
  ctx.fillRect(0, WATER_Y, FIELD.width, FIELD.height - WATER_Y)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(0, WATER_Y, FIELD.width, 1.5)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 34; i++) {
    const depth = i / 34
    const y = WATER_Y + 4 + depth * (FIELD.height - WATER_Y - 6)
    const width = 18 + (i * 37) % 50
    const x = mod(i * 131 - scroll * (0.3 + depth * 0.7) + Math.sin(clock * 1.3 + i) * 6, FIELD.width + 80) - 40
    ctx.globalAlpha = 0.08 + (1 - depth) * 0.14
    ctx.fillStyle = i % 3 === 0 ? palette.windows : '#9fc4ff'
    ctx.fillRect(x, y, width, 1.4)
  }
  ctx.restore()
}

function drawParcels(ctx: CanvasRenderingContext2D, sprites: ParcelSprites, state: GameState, clock: number) {
  for (const parcel of state.parcels) {
    const bob = Math.sin(clock * 3 + parcel.id) * 4
    const sprite = parcel.golden ? sprites.goldenParcel : sprites.parcel
    ctx.save()
    ctx.translate(parcel.x, parcel.y + bob)
    ctx.rotate(Math.sin(clock * 1.7 + parcel.id) * 0.12)
    blit(ctx, sprite, -15, -15, 30, 30)
    ctx.restore()
  }
}

function containerSprite(sprites: ParcelSprites, gateId: number, index: number) {
  return sprites.containers[(gateId * 7 + index * 3) % CONTAINER_COLORS.length][(gateId + index) % 2]
}

function drawGates(ctx: CanvasRenderingContext2D, sprites: ParcelSprites, state: GameState) {
  for (const gate of state.gates) {
    if (gate.x > FIELD.width + 20 || gate.x + GATE_WIDTH < -40) continue
    const top = gate.gapY - gate.gap / 2
    const bottom = gate.gapY + gate.gap / 2
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(gate.x + 6, 0, GATE_WIDTH, top - SPREADER_HEIGHT)
    for (let k = 0, y = top - SPREADER_HEIGHT - CONTAINER_HEIGHT; y > -CONTAINER_HEIGHT; k++, y -= CONTAINER_HEIGHT) {
      blit(ctx, containerSprite(sprites, gate.id, k), gate.x, y, GATE_WIDTH, CONTAINER_HEIGHT)
    }
    blit(ctx, sprites.spreader, gate.x - 6, top - SPREADER_HEIGHT, GATE_WIDTH + 12, SPREADER_HEIGHT)
    if (gate.amplitude > 0) {
      // Bevægelige stakke hænger synligt i kranens wirer.
      ctx.strokeStyle = 'rgba(210,220,235,0.55)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(gate.x - 2, top - SPREADER_HEIGHT)
      ctx.lineTo(gate.x + GATE_WIDTH / 2, -10)
      ctx.lineTo(gate.x + GATE_WIDTH + 2, top - SPREADER_HEIGHT)
      ctx.stroke()
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(gate.x - 2, bottom, GATE_WIDTH + 4, WATER_Y - bottom)
    ctx.clip()
    for (let k = 0, y = bottom; y < WATER_Y; k++, y += CONTAINER_HEIGHT) {
      blit(ctx, containerSprite(sprites, gate.id + 3, k), gate.x, y, GATE_WIDTH, CONTAINER_HEIGHT)
    }
    ctx.restore()
    ctx.fillStyle = '#ffc93c'
    ctx.fillRect(gate.x, bottom, GATE_WIDTH, 2.5)
    blit(ctx, sprites.barge, gate.x - 14, WATER_Y - 6, GATE_WIDTH + 28, 22)
  }
}

function drawDrone(ctx: CanvasRenderingContext2D, sprites: ParcelSprites, state: GameState, fx: ParcelEffects, clock: number) {
  const { y } = state.drone
  const angle = droneAngle(state, clock)
  const invulnerable = state.status === 'flying' && state.time < state.invulnerableUntil
  ctx.save()
  ctx.translate(DRONE_X, y)
  ctx.rotate(angle)
  ctx.scale(DRONE_SCALE, DRONE_SCALE)
  if (invulnerable) ctx.globalAlpha = 0.45 + 0.55 * (Math.floor(clock * 16) % 2)

  if (fx.liftPulse > 0 && state.status === 'flying') {
    const wash = ctx.createLinearGradient(0, 10, 0, 70)
    wash.addColorStop(0, `rgba(200,225,255,${0.22 * fx.liftPulse})`)
    wash.addColorStop(1, 'rgba(200,225,255,0)')
    ctx.fillStyle = wash
    ctx.beginPath()
    ctx.moveTo(-34, 0)
    ctx.lineTo(34, 0)
    ctx.lineTo(48, 70)
    ctx.lineTo(-48, 70)
    ctx.closePath()
    ctx.fill()
  }

  blit(ctx, sprites.drone, -36, -18, 72, 46)
  const spinning = state.status === 'ready' || state.status === 'flying'
  for (const hub of [-26, 26]) {
    ctx.fillStyle = `rgba(210,225,245,${0.28 + fx.liftPulse * 0.25})`
    ctx.beginPath()
    ctx.ellipse(hub, -16, 15, 2.4, 0, 0, Math.PI * 2)
    ctx.fill()
    if (spinning) {
      const blade = Math.cos(clock * 55 + hub) * 14
      ctx.strokeStyle = 'rgba(30,40,58,0.85)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(hub - blade, -16)
      ctx.lineTo(hub + blade, -16)
      ctx.stroke()
    }
  }

  if (state.shield) {
    const bubble = ctx.createRadialGradient(0, 4, 14, 0, 4, 40)
    bubble.addColorStop(0, 'rgba(114,214,245,0)')
    bubble.addColorStop(0.75, 'rgba(114,214,245,0.12)')
    bubble.addColorStop(1, 'rgba(160,232,255,0.55)')
    ctx.fillStyle = bubble
    ctx.beginPath()
    ctx.arc(0, 4, 40, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = `rgba(190,240,255,${0.5 + Math.sin(clock * 5) * 0.2})`
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.beginPath()
    ctx.ellipse(-14, -16, 9, 3.5, -0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawAmbient(ctx: CanvasRenderingContext2D, previous: Zone, current: Zone, blend: number) {
  const from = PALETTES[previous]
  const to = PALETTES[current]
  ctx.globalAlpha = from.ambientAlpha * (1 - blend)
  ctx.fillStyle = from.ambient
  ctx.fillRect(0, 0, FIELD.width, FIELD.height)
  ctx.globalAlpha = to.ambientAlpha * blend
  ctx.fillStyle = to.ambient
  ctx.fillRect(0, 0, FIELD.width, FIELD.height)
  ctx.globalAlpha = 1
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha
  blit(ctx, glowSprite(color), x - radius, y - radius, radius * 2, radius * 2)
}

function drawGlows(ctx: CanvasRenderingContext2D, state: GameState, fx: ParcelEffects, clock: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const blink = Math.floor(clock * 2) % 2 === 0
  for (const gate of state.gates) {
    if (gate.x > FIELD.width + 20 || gate.x + GATE_WIDTH < -40) continue
    const top = gate.gapY - gate.gap / 2
    const bottom = gate.gapY + gate.gap / 2
    if (blink) {
      glow(ctx, gate.x - 4, top - 6, 9, '#ff5a4d', 0.9)
      glow(ctx, gate.x + GATE_WIDTH + 4, top - 6, 9, '#ff5a4d', 0.9)
    }
    glow(ctx, gate.x + GATE_WIDTH / 2, bottom, 16, '#ffc93c', 0.35)
  }
  for (const parcel of state.parcels) {
    const bob = Math.sin(clock * 3 + parcel.id) * 4
    glow(ctx, parcel.x, parcel.y + bob, parcel.golden ? 34 : 22, parcel.golden ? '#ffd166' : '#ffcf8f', parcel.golden ? 0.55 + Math.sin(clock * 6) * 0.15 : 0.3)
  }
  if (state.status !== 'over') {
    const angle = droneAngle(state, clock)
    const point = (rawX: number, rawY: number) => {
      const dx = rawX * DRONE_SCALE
      const dy = rawY * DRONE_SCALE
      return { x: DRONE_X + dx * Math.cos(angle) - dy * Math.sin(angle), y: state.drone.y + dx * Math.sin(angle) + dy * Math.cos(angle) }
    }
    const nose = point(17, -4)
    const tail = point(-18, -4)
    const strobe = point(0, 8)
    glow(ctx, nose.x, nose.y, 10, '#5dffa8', 0.85)
    glow(ctx, tail.x, tail.y, 10, '#ff4d5e', 0.85)
    if (mod(clock, 1.1) < 0.08) glow(ctx, strobe.x, strobe.y, 22, '#ffffff', 0.9)
    const headlight = point(30, -2)
    glow(ctx, headlight.x, headlight.y, 26 + fx.liftPulse * 6, '#bfe8ff', 0.35)
  }
  ctx.restore()
}

function drawParticles(ctx: CanvasRenderingContext2D, fx: ParcelEffects) {
  for (const particle of fx.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1)
    switch (particle.kind) {
      case 'puff':
        ctx.globalAlpha = alpha * 0.35
        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'spark':
        ctx.globalAlpha = alpha
        ctx.strokeStyle = particle.color
        ctx.lineWidth = particle.size * 0.7
        ctx.beginPath()
        ctx.moveTo(particle.x, particle.y)
        ctx.lineTo(particle.x - particle.vx * 0.03, particle.y - particle.vy * 0.03)
        ctx.stroke()
        break
      case 'glint': {
        ctx.globalAlpha = alpha
        ctx.fillStyle = particle.color
        const s = particle.size * 1.6
        ctx.beginPath()
        ctx.moveTo(particle.x, particle.y - s)
        ctx.lineTo(particle.x + s * 0.3, particle.y - s * 0.3)
        ctx.lineTo(particle.x + s, particle.y)
        ctx.lineTo(particle.x + s * 0.3, particle.y + s * 0.3)
        ctx.lineTo(particle.x, particle.y + s)
        ctx.lineTo(particle.x - s * 0.3, particle.y + s * 0.3)
        ctx.lineTo(particle.x - s, particle.y)
        ctx.lineTo(particle.x - s * 0.3, particle.y - s * 0.3)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'debris':
        ctx.globalAlpha = Math.min(1, alpha * 2)
        ctx.save()
        ctx.translate(particle.x, particle.y)
        ctx.rotate(particle.rotation)
        ctx.fillStyle = particle.color
        ctx.fillRect(-particle.size, -particle.size * 0.45, particle.size * 2, particle.size * 0.9)
        ctx.restore()
        break
      case 'drop':
        ctx.globalAlpha = alpha * 0.85
        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
        break
    }
  }
  ctx.globalAlpha = 1
}

function drawRings(ctx: CanvasRenderingContext2D, fx: ParcelEffects) {
  for (const ring of fx.rings) {
    const progress = 1 - ring.life / ring.maxLife
    ctx.globalAlpha = (1 - progress) * 0.8
    ctx.strokeStyle = ring.color
    ctx.lineWidth = 3 * (1 - progress) + 1
    ctx.beginPath()
    ctx.arc(ring.x, ring.y, ring.radius * (0.3 + progress * 0.7), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function outlinedText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, fill: string, width = 4) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = width
  ctx.strokeStyle = 'rgba(5,8,18,0.85)'
  ctx.strokeText(value, x, y)
  ctx.fillStyle = fill
  ctx.fillText(value, x, y)
}

function drawTexts(ctx: CanvasRenderingContext2D, fx: ParcelEffects) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const entry of fx.texts) {
    ctx.globalAlpha = clamp(entry.life / entry.maxLife * 1.6, 0, 1)
    ctx.font = `700 ${entry.size}px ${FONT}`
    outlinedText(ctx, entry.text, entry.x, entry.y, entry.color)
  }
  ctx.globalAlpha = 1
}

function drawStorm(ctx: CanvasRenderingContext2D, scroll: number, clock: number, reducedMotion: boolean, blend: number) {
  ctx.save()
  ctx.globalAlpha = 0.28 * blend
  ctx.strokeStyle = '#b9c9dd'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < RAIN_DROPS; i++) {
    const x = mod(i * 97.3 - clock * 240 - scroll * 0.2, FIELD.width + 40) - 20
    const y = mod(i * 53.7 + clock * 900, FIELD.height + 40) - 20
    ctx.moveTo(x, y)
    ctx.lineTo(x - 5, y + 16)
  }
  ctx.stroke()
  ctx.restore()
  if (reducedMotion) return
  const phase = mod(clock, 6.7)
  if (phase < 0.22) {
    ctx.globalAlpha = (phase < 0.06 || (phase > 0.12 && phase < 0.17) ? 0.3 : 0.08) * blend
    ctx.fillStyle = '#dfe8ff'
    ctx.fillRect(0, 0, FIELD.width, FIELD.height)
    ctx.globalAlpha = 1
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, labels: ParcelLabels, clock: number) {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `600 12px ${FONT}`
  outlinedText(ctx, labels.hud.score.toUpperCase(), 24, 30, 'rgba(230,240,255,0.75)', 3)
  ctx.font = `800 34px ${FONT}`
  const score = labels.points(state.score)
  outlinedText(ctx, score, 24, 64, '#ffffff', 5)
  const scoreWidth = ctx.measureText(score).width

  let chipX = 24 + scoreWidth + 14
  if (state.multiplier > 1) {
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.roundRect(chipX, 38, 44, 26, 13)
    ctx.fill()
    ctx.font = `800 16px ${FONT}`
    ctx.fillStyle = '#2a1c00'
    ctx.textAlign = 'center'
    ctx.fillText(`×${state.multiplier}`, chipX + 22, 57)
    ctx.textAlign = 'left'
    chipX += 52
  }
  if (state.multiplier < 5) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < state.streak % 3 ? '#7cf5d4' : 'rgba(255,255,255,0.22)'
      ctx.beginPath()
      ctx.arc(chipX + 6 + i * 13, 51, 4.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.textAlign = 'right'
  ctx.font = `700 16px ${FONT}`
  outlinedText(ctx, labels.zone(state.zone), FIELD.width - 24, 36, '#e8f1ff', 4)
  if (state.shield) {
    ctx.strokeStyle = '#72d6f5'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(FIELD.width - 34, 62, 10, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(114,214,245,0.35)'
    ctx.fill()
  }

  if (state.status === 'ready') {
    ctx.textAlign = 'center'
    ctx.font = `700 22px ${FONT}`
    ctx.globalAlpha = 0.65 + Math.sin(clock * 4) * 0.35
    outlinedText(ctx, labels.readyHint, FIELD.width / 2, 430, '#ffffff', 5)
    ctx.globalAlpha = 1
  }
  ctx.textAlign = 'left'
}

function drawBanner(ctx: CanvasRenderingContext2D, fx: ParcelEffects) {
  const banner = fx.banner
  if (!banner) return
  const progress = 1 - banner.life / banner.maxLife
  const alpha = progress < 0.15 ? progress / 0.15 : progress > 0.75 ? (1 - progress) / 0.25 : 1
  ctx.globalAlpha = clamp(alpha, 0, 1)
  ctx.fillStyle = 'rgba(5,8,18,0.55)'
  ctx.fillRect(0, 168, FIELD.width, 64)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 34px ${FONT}`
  outlinedText(ctx, banner.title, FIELD.width / 2, 200, '#ffffff', 5)
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
