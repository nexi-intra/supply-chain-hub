import { COMBO_WINDOW_SECONDS, COOLANT_SECONDS, FIELD, MAX_WEAPON_LEVEL } from './config'
import { drawBossBar } from './bossRender'
import { BONUS_POINTS, BONUS_SECONDS, weaponLocked } from './bonusStages'
import type { EffectsState } from './effects'
import { type SpecialKind } from './enemies'
import type { GameState } from './engine'
import type { ChickenLabels } from './labels'
import { currentMultiplier } from './scoring'
import { drawSprite, getHenSprites, getSpecialSprites, PALETTE, type Sprite, type Sprites } from './sprites'
import { THEMES, type ThemeId } from './themes'
import { FAMILY_COLORS, isOverheated } from './weapons'
import { isActive, remainingShare, TIMED_POWERUPS } from './powerups'

/** HUD, bannere, introkort og bonusbanernes overlay; tegnes oven på spillet i banens koordinater. */

export const FONT = "'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, sans-serif"

/** Æggeregnens høns øverst; de puster sig op, når de lægger. */
export function drawDroppers(ctx: CanvasRenderingContext2D, state: GameState, clock: number) {
  const bonus = state.bonus
  if (!bonus || bonus.stage !== 'eggDodge') return
  const hens = getHenSprites(state.spec.theme)
  bonus.droppers.forEach((dropper, i) => {
    const frame = dropper.flash > 0 ? 2 : Math.abs(Math.floor(clock * 6 + i)) % 2
    ctx.save()
    ctx.translate(dropper.x, dropper.y)
    ctx.scale(1 + dropper.flash * 0.6, 1 - dropper.flash * 0.5)
    drawSprite(ctx, hens.hens[i % hens.hens.length][frame], 0, 0)
    ctx.restore()
  })
}

/** Gylden ramme om banen, mens en bonusbane kører. */
export function drawBonusFrame(ctx: CanvasRenderingContext2D, state: GameState, clock: number) {
  const bonus = state.bonus
  if (!bonus) return
  const alpha = bonus.done ? 0.16 : 0.2 + 0.1 * Math.sin(clock * 3)
  const edge = 64
  const { width, height } = FIELD
  const sides: [number, number, number, number, number, number, number, number][] = [
    [0, 0, 0, edge, 0, 0, width, edge],
    [0, height, 0, height - edge, 0, height - edge, width, edge],
    [0, 0, edge, 0, 0, 0, edge, height],
    [width, 0, width - edge, 0, width - edge, 0, edge, height],
  ]
  ctx.save()
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of sides) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, `rgba(255, 201, 60, ${alpha})`)
    g.addColorStop(1, 'rgba(255, 201, 60, 0)')
    ctx.fillStyle = g
    ctx.fillRect(rx, ry, rw, rh)
  }
  ctx.restore()
}

function drawPadlock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save()
  ctx.strokeStyle = '#fb7185'
  ctx.fillStyle = '#fb7185'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(x, y - 2, 3.6, Math.PI, 0)
  ctx.stroke()
  ctx.fillRect(x - 5, y - 2, 10, 8)
  ctx.restore()
}

/** Nedtælling i en gylden ring, tæller for banen og de optjente bonuspoint. */
function drawBonusHud(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, labels: ChickenLabels, clock: number) {
  const bonus = state.bonus
  if (!bonus) return
  const cx = FIELD.width / 2
  const cy = 74
  const remaining = Math.max(0, bonus.endsAt - state.time)
  const urgent = remaining <= 3 && !bonus.done
  ctx.save()
  ctx.fillStyle = 'rgba(18, 12, 43, 0.72)'
  ctx.beginPath()
  ctx.arc(cx, cy, 25, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(255, 244, 220, 0.16)'
  ctx.beginPath()
  ctx.arc(cx, cy, 22, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = urgent && Math.floor(clock * 6) % 2 ? PALETTE.comb : '#ffd447'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (remaining / BONUS_SECONDS))
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${urgent ? 22 : 19}px ${FONT}`
  outlinedText(ctx, String(Math.ceil(remaining)), cx, cy + 1, urgent ? '#fecaca' : PALETTE.feather, 'rgba(18, 12, 43, 0.9)', 4)
  ctx.font = `800 17px ${FONT}`
  ctx.textAlign = 'right'
  const counterX = cx - 40
  if (bonus.stage === 'eggDodge') {
    drawSprite(ctx, sprites.egg, counterX - 36, cy)
    drawCheck(ctx, counterX - 10, cy, !bonus.hit)
  } else {
    const counter = `${bonus.collected}/${bonus.possible}`
    outlinedText(ctx, counter, counterX, cy + 1, PALETTE.feather, 'rgba(18, 12, 43, 0.85)', 4)
    const iconX = counterX - ctx.measureText(counter).width - 18
    if (bonus.stage === 'drumstickRain') drawSprite(ctx, sprites.pickups.drumstick, iconX, cy, { scale: 0.8, rotation: -0.4 })
    else drawSprite(ctx, sprites.golden[Math.abs(Math.floor(clock * 6)) % 2], iconX, cy, { scale: 0.5 })
  }
  ctx.textAlign = 'left'
  if (bonus.stage === 'eggDodge' && !bonus.done) {
    // Viser den store bonus, man kæmper for; streget over, når et æg har ramt.
    const potential = `+${labels.points(bonus.points + (bonus.hit ? 0 : Math.round((BONUS_POINTS.survive * bonus.scale) / 10) * 10))}`
    outlinedText(ctx, potential, cx + 40, cy + 1, bonus.hit ? 'rgba(255, 244, 220, 0.45)' : '#ffd447', 'rgba(18, 12, 43, 0.85)', 4)
    if (bonus.hit) {
      ctx.strokeStyle = PALETTE.comb
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(cx + 36, cy + 1)
      ctx.lineTo(cx + 44 + ctx.measureText(potential).width, cy + 1)
      ctx.stroke()
    }
  } else {
    outlinedText(ctx, `+${labels.points(bonus.points)}`, cx + 40, cy + 1, '#ffd447', 'rgba(18, 12, 43, 0.85)', 4)
  }
  ctx.restore()
}

function drawCheck(ctx: CanvasRenderingContext2D, x: number, y: number, ok: boolean) {
  ctx.save()
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = ok ? '#4ade80' : PALETTE.comb
  ctx.beginPath()
  if (ok) {
    ctx.moveTo(x - 7, y)
    ctx.lineTo(x - 2, y + 6)
    ctx.lineTo(x + 8, y - 7)
  } else {
    ctx.moveTo(x - 6, y - 6)
    ctx.lineTo(x + 6, y + 6)
    ctx.moveTo(x + 6, y - 6)
    ctx.lineTo(x - 6, y + 6)
  }
  ctx.stroke()
  ctx.restore()
}


export function outlinedText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, fill: string, stroke = 'rgba(18, 12, 43, 0.85)', width = 4) {
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke
  ctx.lineWidth = width
  ctx.strokeText(value, x, y)
  ctx.fillStyle = fill
  ctx.fillText(value, x, y)
}

export function drawTexts(ctx: CanvasRenderingContext2D, fx: EffectsState) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const t of fx.texts) {
    const progress = 1 - t.life / t.maxLife
    ctx.globalAlpha = Math.min(1, (t.life / t.maxLife) * 2.5)
    const pop = progress < 0.15 ? 0.7 + progress * 2 : 1
    ctx.font = `800 ${Math.round(t.size * pop)}px ${FONT}`
    outlinedText(ctx, t.text, t.x, t.y, t.color)
  }
  ctx.globalAlpha = 1
}

export function drawHud(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, labels: ChickenLabels, clock: number) {
  ctx.textBaseline = 'alphabetic'

  ctx.textAlign = 'left'
  ctx.font = `600 12px ${FONT}`
  outlinedText(ctx, labels.hud.score, 18, 24, 'rgba(255, 244, 220, 0.75)', 'rgba(18, 12, 43, 0.6)', 3)
  ctx.font = `800 30px ${FONT}`
  const scoreText = labels.points(state.scoring.score)
  outlinedText(ctx, scoreText, 18, 54, state.bonus ? PALETTE.yolk : PALETTE.feather)
  if (isActive(state, 'double')) drawDoubleBadge(ctx, state, 18 + ctx.measureText(scoreText).width + 10, clock)

  const multiplier = currentMultiplier(state.scoring, state.time)
  if (multiplier > 1) {
    const remaining = Math.max(0, 1 - (state.time - state.scoring.lastKillAt) / COMBO_WINDOW_SECONDS)
    ctx.fillStyle = PALETTE.yolk
    ctx.beginPath()
    ctx.roundRect(18, 64, 52, 24, 12)
    ctx.fill()
    ctx.font = `800 15px ${FONT}`
    ctx.fillStyle = PALETTE.space
    ctx.textAlign = 'center'
    ctx.fillText(`×${multiplier}`, 44, 81)
    ctx.fillStyle = 'rgba(255, 201, 60, 0.35)'
    ctx.fillRect(76, 74, 60, 4)
    ctx.fillStyle = PALETTE.yolk
    ctx.fillRect(76, 74, 60 * remaining, 4)
  }

  const right = FIELD.width - 18
  for (let i = 0; i < state.lives; i++) drawSprite(ctx, sprites.ship, right - 14 - i * 26, 30, { scale: 0.4 })
  for (let i = 0; i < state.missiles; i++) drawSprite(ctx, sprites.pickups.missile, right - 12 - i * 24, 60, { scale: 0.6 })

  if (state.boss) {
    drawBossBar(ctx, state, labels, clock, (text, x, y, fill) => outlinedText(ctx, text, x, y, fill, 'rgba(18, 12, 43, 0.7)', 3))
  } else {
    drawWaveLine(ctx, state, labels)
    drawBonusHud(ctx, sprites, state, labels, clock)
  }

  const baseY = FIELD.height - 16
  const family = state.weapon.family
  const familyColor = FAMILY_COLORS[family]
  drawSprite(ctx, sprites.weaponIcons[family], 31, baseY - 15)
  ctx.textAlign = 'left'
  ctx.font = `700 11px ${FONT}`
  const name = labels.weaponName[family]
  outlinedText(ctx, name, 50, baseY - 22, familyColor, 'rgba(18, 12, 43, 0.7)', 3)
  for (let i = 0; i < MAX_WEAPON_LEVEL; i++) {
    ctx.fillStyle = i < state.weapon.level ? familyColor : 'rgba(255, 244, 220, 0.18)'
    ctx.beginPath()
    ctx.roundRect(50 + i * 13, baseY - 14, 10, 10, 2)
    ctx.fill()
  }

  const heatX = Math.max(128, 50 + ctx.measureText(name).width + 16)
  const heatWidth = 150
  const overheated = isOverheated(state.weapon, state.time)
  const coolant = state.time < state.weapon.coolantUntil
  const locked = weaponLocked(state)
  ctx.font = `600 11px ${FONT}`
  const heatLabel = locked ? labels.bonus.locked : overheated ? labels.overheated : coolant ? labels.hud.coolant : labels.hud.heat
  const heatColor = locked ? '#fb7185' : overheated ? (Math.floor(clock * 8) % 2 ? '#ff8a3d' : PALETTE.comb) : coolant ? PALETTE.plasma : 'rgba(255, 244, 220, 0.75)'
  outlinedText(ctx, heatLabel, heatX, baseY - 22, heatColor, 'rgba(18, 12, 43, 0.6)', 3)
  if (locked) drawPadlock(ctx, heatX + ctx.measureText(heatLabel).width + 12, baseY - 26)
  ctx.fillStyle = 'rgba(255, 244, 220, 0.14)'
  ctx.beginPath()
  ctx.roundRect(heatX, baseY - 13, heatWidth, 8, 4)
  ctx.fill()
  const heat = ctx.createLinearGradient(heatX, 0, heatX + heatWidth, 0)
  heat.addColorStop(0, PALETTE.plasma)
  heat.addColorStop(0.6, PALETTE.yolk)
  heat.addColorStop(1, PALETTE.comb)
  ctx.fillStyle = coolant ? PALETTE.plasma : heat
  ctx.beginPath()
  ctx.roundRect(heatX, baseY - 13, Math.max(0, (heatWidth * state.weapon.heat) / 100), 8, 4)
  ctx.fill()
  drawPowerupTimers(ctx, sprites, state, clock)
}

function drawDoubleBadge(ctx: CanvasRenderingContext2D, state: GameState, x: number, clock: number) {
  const left = state.powerups.until.double - state.time
  if (left < 2 && Math.floor(clock * 8) % 2 === 0) return
  ctx.save()
  const pop = 1 + Math.max(0, Math.sin(clock * 6)) * 0.06
  ctx.translate(x + 22, 43)
  ctx.scale(pop, pop)
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.roundRect(-22, -13, 44, 26, 13)
  ctx.fill()
  ctx.strokeStyle = '#fff7c2'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = PALETTE.space
  ctx.font = `800 16px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('×2', 0, 1)
  ctx.restore()
  ctx.textBaseline = 'alphabetic'
}

/** Aktive power-ups nederst til højre: ikon med en nedtællingsring, der blinker de sidste 2 sekunder. */
function drawPowerupTimers(ctx: CanvasRenderingContext2D, sprites: Sprites, state: GameState, clock: number) {
  const y = FIELD.height - 30
  let x = FIELD.width - 30
  const draw = (sprite: Sprite, share: number, left: number, color: string) => {
    const blink = left < 2 && Math.floor(clock * 8) % 2 === 0
    ctx.save()
    ctx.fillStyle = 'rgba(18, 12, 43, 0.72)'
    ctx.beginPath()
    ctx.arc(x, y, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 3.5
    ctx.strokeStyle = 'rgba(255, 244, 220, 0.14)'
    ctx.beginPath()
    ctx.arc(x, y, 16, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share)
    ctx.stroke()
    drawSprite(ctx, sprite, x, y, { scale: 0.68, alpha: blink ? 0.35 : 1 })
    ctx.font = `800 10px ${FONT}`
    ctx.textAlign = 'center'
    outlinedText(ctx, String(Math.ceil(left)), x + 12, y + 15, PALETTE.feather, 'rgba(18, 12, 43, 0.9)', 3)
    ctx.restore()
    x -= 42
  }
  for (const kind of TIMED_POWERUPS) {
    if (!isActive(state, kind)) continue
    draw(sprites.pickups[kind], remainingShare(state, kind), state.powerups.until[kind] - state.time, POWERUP_RING[kind])
  }
  const coolant = state.weapon.coolantUntil - state.time
  if (coolant > 0) draw(sprites.pickups.coolant, Math.min(1, coolant / COOLANT_SECONDS), coolant, PALETTE.plasma)
}

const POWERUP_RING = { drone: '#e2e8f0', slowmo: '#818cf8', magnet: '#f43f5e', double: '#facc15' }

/** "Sektor 2 – bølge 3/8" med det globale bølgenummer i en lille pille ved siden af. */
function drawWaveLine(ctx: CanvasRenderingContext2D, state: GameState, labels: ChickenLabels) {
  const sector = labels.sectorWave(state.spec.sector, state.spec.slot, state.spec.round)
  const global = labels.wave(state.wave)
  const gap = 16
  ctx.font = `700 13px ${FONT}`
  const sectorWidth = ctx.measureText(sector).width
  ctx.font = `700 11px ${FONT}`
  const globalWidth = ctx.measureText(global).width
  const left = (FIELD.width - sectorWidth - gap - globalWidth) / 2
  ctx.textAlign = 'left'
  ctx.font = `700 13px ${FONT}`
  outlinedText(ctx, sector, left, 26, 'rgba(255, 244, 220, 0.85)', 'rgba(18, 12, 43, 0.6)', 3)
  const pillX = left + sectorWidth + gap
  ctx.fillStyle = THEMES[state.spec.theme].planet.rim
  ctx.globalAlpha = 0.22
  ctx.beginPath()
  ctx.roundRect(pillX - 7, 13, globalWidth + 14, 18, 9)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.font = `700 11px ${FONT}`
  outlinedText(ctx, global, pillX, 26, 'rgba(255, 244, 220, 0.9)', 'rgba(18, 12, 43, 0.5)', 2)
}

export function drawBanner(ctx: CanvasRenderingContext2D, fx: EffectsState) {
  const banner = fx.banner
  if (!banner) return
  const elapsed = banner.maxLife - banner.life
  const fadeIn = Math.min(1, elapsed / 0.25)
  const fadeOut = Math.min(1, banner.life / 0.4)
  const counted = banner.count && elapsed > banner.count.seconds ? Math.max(0, 0.14 - (elapsed - banner.count.seconds) * 0.5) : 0
  const scale = (fx.reducedMotion ? 1 : 0.8 + 0.2 * (1 - (1 - fadeIn) ** 3)) * (1 + counted)
  const color = banner.accent ?? (banner.tone === 'boss' ? PALETTE.comb : banner.tone === 'good' ? PALETTE.yolk : PALETTE.feather)
  let title = banner.title
  if (banner.count) {
    const t = Math.min(1, elapsed / banner.count.seconds)
    title = banner.count.format(Math.round(banner.count.to * (1 - (1 - t) ** 3)))
  }
  ctx.save()
  ctx.globalAlpha = fadeIn * fadeOut
  ctx.translate(FIELD.width / 2, FIELD.height * 0.42)
  ctx.scale(scale, scale)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 52px ${FONT}`
  const titleWidth = ctx.measureText(banner.title).width
  const fit = Math.min(1, (FIELD.width - 80) / (titleWidth + (banner.accent ? 216 : 0)))
  ctx.scale(fit, fit)
  if (banner.accent) {
    const reach = Math.min(1, elapsed / 0.6) * 90
    ctx.strokeStyle = banner.accent
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(side * (titleWidth / 2 + 18), 0)
      ctx.lineTo(side * (titleWidth / 2 + 18 + reach), 0)
      ctx.stroke()
    }
  }
  outlinedText(ctx, title, 0, 0, color, 'rgba(18, 12, 43, 0.9)', 8)
  if (banner.subtitle) {
    ctx.font = `700 20px ${FONT}`
    outlinedText(ctx, banner.subtitle, 0, 44, PALETTE.feather, 'rgba(18, 12, 43, 0.85)', 5)
  }
  ctx.restore()
}

/** Fjendens udseende i lille format til introkortet. */
function drawKindIcon(ctx: CanvasRenderingContext2D, kind: SpecialKind, theme: ThemeId, x: number, y: number, clock: number) {
  const specials = getSpecialSprites(theme)
  switch (kind) {
    case 'shield':
      drawSprite(ctx, specials.shield[0], x, y)
      drawSprite(ctx, specials.bubbles[3], x, y + 1, { scale: 0.82 })
      break
    case 'balloon':
      drawSprite(ctx, specials.balloons[0], x + 12, y - 26, { scale: 0.8, rotation: 0.22 })
      drawSprite(ctx, specials.balloonHen[0], x, y + 6, { scale: 0.85 })
      break
    case 'ufo':
      drawSprite(ctx, specials.ufo[Math.abs(Math.floor(clock * 6)) % 2], x, y, { scale: 0.62 })
      break
    case 'turkey':
      drawSprite(ctx, specials.turkey[0], x, y, { scale: 0.82 })
      break
    case 'rainbow':
      drawSprite(ctx, specials.rainbow[Math.abs(Math.floor(clock * 10)) % specials.rainbow.length], x, y, { scale: 0.85 })
      break
    default:
      drawSprite(ctx, specials[kind][0], x, y)
  }
}

export function drawIntro(ctx: CanvasRenderingContext2D, fx: EffectsState, theme: ThemeId, clock: number) {
  const card = fx.intro
  if (!card) return
  const elapsed = card.maxLife - card.life
  const fadeIn = Math.min(1, elapsed / 0.3)
  const fadeOut = Math.min(1, card.life / 0.4)
  const rise = fx.reducedMotion ? 0 : (1 - fadeIn) ** 3 * 26
  ctx.save()
  ctx.font = `800 20px ${FONT}`
  const titleWidth = ctx.measureText(card.title).width
  ctx.font = `600 14px ${FONT}`
  const hintWidth = ctx.measureText(card.hint).width
  const w = Math.min(FIELD.width - 80, Math.max(320, 100 + Math.max(titleWidth, hintWidth)))
  const h = 70
  const x = (FIELD.width - w) / 2
  const y = FIELD.height * 0.6 + rise
  const accent = THEMES[theme].planet.rim
  ctx.globalAlpha = fadeIn * fadeOut
  ctx.fillStyle = 'rgba(18, 12, 43, 0.8)'
  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 16)
  ctx.fill()
  ctx.stroke()
  const glow = ctx.createRadialGradient(x + 44, y + h / 2, 4, x + 44, y + h / 2, 40)
  glow.addColorStop(0, `${accent}55`)
  glow.addColorStop(1, `${accent}00`)
  ctx.fillStyle = glow
  ctx.fillRect(x + 4, y + 4, 80, h - 8)
  drawKindIcon(ctx, card.kind, theme, x + 44, y + h / 2 + Math.sin(clock * 4) * 2, clock)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `800 20px ${FONT}`
  outlinedText(ctx, card.title, x + 88, y + 30, PALETTE.yolk, 'rgba(18, 12, 43, 0.9)', 4)
  ctx.font = `600 14px ${FONT}`
  ctx.fillStyle = 'rgba(255, 244, 220, 0.9)'
  ctx.fillText(card.hint, x + 88, y + 54)
  ctx.restore()
}
