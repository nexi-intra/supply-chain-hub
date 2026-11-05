import { HIDDEN_ROWS, LOCK_DELAY_SECONDS, ROWS, SETTINGS } from './config'
import { cargoShakeOffset, PIECE_COLORS, type CargoEffects } from './effects'
import { ghostY, type GameState } from './engine'
import type { CargoLabels } from './labels'
import { pieceCells, type PieceType } from './pieces'
import { blit, BOARD, BOARD_PIXELS, CELL, FIELD, getCargoSprites, PANELS, type CargoSprites } from './sprites'

const FONT = "'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, sans-serif"
const TEXT_PIXELS = 26
const DANGER_ROWS = 5

export interface CargoRenderer {
  /** `focusY` giver et beskåret udsnit (cover) centreret om den logiske y-værdi, fx til menuens banner. */
  resize: (cssWidth: number, cssHeight: number, devicePixelRatio: number, focusY?: number) => void
  draw: (state: GameState, fx: CargoEffects, labels: CargoLabels, clock: number, options?: { hud?: boolean }) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const px = (x: number) => BOARD.x + x * CELL
const py = (y: number) => BOARD.y + (y - HIDDEN_ROWS) * CELL

export function createCargoRenderer(canvas: HTMLCanvasElement): CargoRenderer {
  const ctx = canvas.getContext('2d')!
  const sprites = getCargoSprites()
  const view = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1 }

  const resize: CargoRenderer['resize'] = (cssWidth, cssHeight, devicePixelRatio, focusY) => {
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

  const draw: CargoRenderer['draw'] = (state, fx, labels, clock, options = {}) => {
    const { scale, offsetX, offsetY, dpr } = view
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    blit(ctx, sprites.background, 0, 0, FIELD.width, FIELD.height)

    const shake = cargoShakeOffset(fx)
    ctx.save()
    ctx.translate(shake.x, shake.y)
    drawDanger(ctx, state, clock, fx.reducedMotion)
    ctx.save()
    ctx.beginPath()
    ctx.rect(BOARD.x, BOARD.y, BOARD_PIXELS.width, BOARD_PIXELS.height)
    ctx.clip()
    drawBoard(ctx, sprites, state)
    drawTrails(ctx, fx)
    drawGhost(ctx, sprites, state)
    drawActive(ctx, sprites, state)
    drawGlows(ctx, fx)
    drawSweeps(ctx, sprites, fx)
    ctx.restore()
    drawParticles(ctx, fx)
    drawTexts(ctx, fx)
    ctx.restore()

    if (options.hud !== false) {
      drawHud(ctx, sprites, state, labels)
      drawBanner(ctx, fx)
    }
    if (fx.flash > 0) {
      ctx.globalAlpha = fx.flash * 0.45
      ctx.fillStyle = fx.flashColor
      ctx.fillRect(0, 0, FIELD.width, FIELD.height)
      ctx.globalAlpha = 1
    }
  }

  return { resize, draw }
}

function drawDanger(ctx: CanvasRenderingContext2D, state: GameState, clock: number, reducedMotion: boolean) {
  let top = ROWS
  for (let y = 0; y < ROWS && top === ROWS; y++) if (state.board[y].some((cell) => cell !== null)) top = y
  const danger = clamp((HIDDEN_ROWS + DANGER_ROWS - top) / DANGER_ROWS, 0, 1)
  if (danger <= 0) return
  const pulse = reducedMotion ? 0.6 : 0.5 + Math.sin(clock * 8) * 0.5
  const glow = ctx.createRadialGradient(BOARD.x + BOARD_PIXELS.width / 2, BOARD.y, 10, BOARD.x + BOARD_PIXELS.width / 2, BOARD.y, 260)
  glow.addColorStop(0, `rgba(255,70,60,${0.45 * danger * pulse})`)
  glow.addColorStop(1, 'rgba(255,70,60,0)')
  ctx.fillStyle = glow
  ctx.fillRect(BOARD.x - 120, BOARD.y - 120, BOARD_PIXELS.width + 240, 360)
  for (const x of [BOARD.x - 6, BOARD.x + BOARD_PIXELS.width + 6]) {
    ctx.fillStyle = `rgba(255,80,60,${0.5 + 0.5 * pulse})`
    ctx.beginPath()
    ctx.arc(x, BOARD.y - 20, 6, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawCell(ctx: CanvasRenderingContext2D, sprites: CargoSprites, type: PieceType, x: number, y: number) {
  if (y < HIDDEN_ROWS) return
  blit(ctx, sprites.cells[type], px(x), py(y), CELL, CELL)
}

function drawBoard(ctx: CanvasRenderingContext2D, sprites: CargoSprites, state: GameState) {
  for (let y = HIDDEN_ROWS; y < ROWS; y++) {
    const row = state.board[y]
    for (let x = 0; x < row.length; x++) {
      const cell = row[x]
      if (cell) drawCell(ctx, sprites, cell, x, y)
    }
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, sprites: CargoSprites, state: GameState) {
  const piece = state.active
  if (!piece || state.status !== 'playing') return
  const landing = ghostY(state)
  if (landing === piece.y) return
  for (const [cx, cy] of pieceCells(piece.type, piece.rotation)) {
    const y = landing + cy
    if (y >= HIDDEN_ROWS) blit(ctx, sprites.ghosts[piece.type], px(piece.x + cx), py(y), CELL, CELL)
  }
}

function drawActive(ctx: CanvasRenderingContext2D, sprites: CargoSprites, state: GameState) {
  const piece = state.active
  if (!piece) return
  const cells = pieceCells(piece.type, piece.rotation)
  for (const [cx, cy] of cells) drawCell(ctx, sprites, piece.type, piece.x + cx, piece.y + cy)
  // Brikken lyser gradvist op, mens lock delay løber ud på jorden.
  const lockProgress = ghostY(state) === piece.y ? clamp(state.lockTimer / LOCK_DELAY_SECONDS, 0, 1) : 0
  if (lockProgress > 0) {
    ctx.globalAlpha = lockProgress * 0.4
    ctx.fillStyle = '#ffffff'
    for (const [cx, cy] of cells) if (piece.y + cy >= HIDDEN_ROWS) ctx.fillRect(px(piece.x + cx), py(piece.y + cy), CELL, CELL)
    ctx.globalAlpha = 1
  }
}

function drawTrails(ctx: CanvasRenderingContext2D, fx: CargoEffects) {
  for (const trail of fx.trails) {
    const alpha = trail.life / trail.maxLife
    const color = PIECE_COLORS[trail.piece]
    const columns = new Map<number, number>()
    for (const [x, y] of trail.cells) columns.set(x, Math.min(columns.get(x) ?? Infinity, y))
    for (const [x, top] of columns) {
      const bottom = Math.max(...trail.cells.filter(([cx]) => cx === x).map(([, cy]) => cy)) + trail.distance
      const from = py(Math.max(HIDDEN_ROWS, top))
      const to = py(bottom)
      if (to <= from) continue
      const streak = ctx.createLinearGradient(0, from, 0, to)
      streak.addColorStop(0, `${color}00`)
      streak.addColorStop(1, color)
      ctx.globalAlpha = alpha * 0.28
      ctx.fillStyle = streak
      ctx.fillRect(px(x) + 7, from, CELL - 14, to - from)
    }
  }
  ctx.globalAlpha = 1
}

function drawGlows(ctx: CanvasRenderingContext2D, fx: CargoEffects) {
  ctx.fillStyle = '#ffffff'
  for (const glow of fx.glows) {
    ctx.globalAlpha = (glow.life / glow.maxLife) * 0.5
    for (const [x, y] of glow.cells) if (y >= HIDDEN_ROWS) ctx.fillRect(px(x), py(y), CELL, CELL)
  }
  ctx.globalAlpha = 1
}

function drawSweeps(ctx: CanvasRenderingContext2D, sprites: CargoSprites, fx: CargoEffects) {
  for (const sweep of fx.sweeps) {
    const progress = 1 - sweep.life / sweep.maxLife
    if (sweep.y < HIDDEN_ROWS) continue
    const y = py(sweep.y)
    if (progress < 0.25) {
      ctx.globalAlpha = 1 - progress * 2
      ctx.fillStyle = '#fff6dc'
      ctx.fillRect(BOARD.x, y, BOARD_PIXELS.width, CELL)
    }
    // Kasserne kører ud til højre som afsendt gods.
    const offset = progress * progress * (BOARD_PIXELS.width + 80)
    ctx.globalAlpha = clamp(1 - progress * 1.2, 0, 1)
    sweep.blocks.forEach((cell, x) => {
      if (cell) blit(ctx, sprites.cells[cell], px(x) + offset, y - progress * 6, CELL, CELL)
    })
  }
  ctx.globalAlpha = 1
}

function drawParticles(ctx: CanvasRenderingContext2D, fx: CargoEffects) {
  for (const particle of fx.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1)
    const x = px(particle.x)
    const y = py(particle.y)
    const size = particle.size * CELL
    if (particle.kind === 'dust') {
      ctx.globalAlpha = alpha * 0.35
      ctx.fillStyle = particle.color
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.globalAlpha = Math.min(1, alpha * 1.6)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(particle.rotation)
      ctx.fillStyle = particle.color
      ctx.fillRect(-size, -size * 0.3, size * 2, size * 0.6)
      ctx.restore()
    }
  }
  ctx.globalAlpha = 1
}

function outlinedText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, fill: string, width = 4) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = width
  ctx.strokeStyle = 'rgba(5,8,14,0.9)'
  ctx.strokeText(value, x, y)
  ctx.fillStyle = fill
  ctx.fillText(value, x, y)
}

function drawTexts(ctx: CanvasRenderingContext2D, fx: CargoEffects) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const entry of fx.texts) {
    ctx.globalAlpha = clamp((entry.life / entry.maxLife) * 1.8, 0, 1)
    ctx.font = `800 ${Math.round(entry.size * TEXT_PIXELS)}px ${FONT}`
    outlinedText(ctx, entry.text, px(entry.x), Math.max(BOARD.y + 20, py(entry.y)), entry.color, 5)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawMiniPiece(ctx: CanvasRenderingContext2D, sprites: CargoSprites, type: PieceType, centerX: number, centerY: number, size: number, dim = false) {
  const cells = pieceCells(type, 0)
  const xs = cells.map(([x]) => x)
  const ys = cells.map(([, y]) => y)
  const width = (Math.max(...xs) - Math.min(...xs) + 1) * size
  const height = (Math.max(...ys) - Math.min(...ys) + 1) * size
  const left = centerX - width / 2 - Math.min(...xs) * size
  const top = centerY - height / 2 - Math.min(...ys) * size
  ctx.globalAlpha = dim ? 0.35 : 1
  for (const [x, y] of cells) blit(ctx, sprites.cells[type], left + x * size, top + y * size, size, size)
  ctx.globalAlpha = 1
}

function drawHud(ctx: CanvasRenderingContext2D, sprites: CargoSprites, state: GameState, labels: CargoLabels) {
  const { hold, stats, next } = PANELS
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  blit(ctx, sprites.holdPanel, hold.x, hold.y, hold.w, hold.h)
  ctx.font = `700 12px ${FONT}`
  ctx.fillStyle = 'rgba(232,240,255,0.75)'
  ctx.fillText(labels.hud.hold.toUpperCase(), hold.x + 12, hold.y + 24)
  if (state.hold) drawMiniPiece(ctx, sprites, state.hold, hold.x + hold.w / 2, hold.y + 66, 20, state.holdUsed)

  blit(ctx, sprites.statsPanel, stats.x, stats.y, stats.w, stats.h)
  const rows: Array<[string, string, number]> = [
    [labels.hud.score, labels.points(state.score), 26],
    [labels.hud.level, String(state.level), 22],
    [labels.hud.lines, labels.points(state.lines), 22],
  ]
  let y = stats.y + 28
  for (const [label, value, size] of rows) {
    ctx.font = `700 12px ${FONT}`
    ctx.fillStyle = 'rgba(232,240,255,0.7)'
    ctx.fillText(label.toUpperCase(), stats.x + 12, y)
    ctx.font = `800 ${size}px ${FONT}`
    ctx.fillStyle = label === labels.hud.score ? '#ffd166' : '#ffffff'
    ctx.fillText(value, stats.x + 12, y + size + 4)
    y += size + 36
  }

  blit(ctx, sprites.nextPanel, next.x, next.y, next.w, next.h)
  ctx.font = `700 12px ${FONT}`
  ctx.fillStyle = 'rgba(232,240,255,0.75)'
  ctx.fillText(labels.hud.next.toUpperCase(), next.x + 12, next.y + 24)
  const previews = state.queue.slice(0, SETTINGS[state.difficulty].previews)
  previews.forEach((type, index) => {
    const size = index === 0 ? 20 : 16
    drawMiniPiece(ctx, sprites, type, next.x + next.w / 2, next.y + 66 + index * 58, size)
  })
}

function drawBanner(ctx: CanvasRenderingContext2D, fx: CargoEffects) {
  const banner = fx.banner
  if (!banner) return
  const progress = 1 - banner.life / banner.maxLife
  const alpha = progress < 0.15 ? progress / 0.15 : progress > 0.75 ? (1 - progress) / 0.25 : 1
  ctx.globalAlpha = clamp(alpha, 0, 1)
  const centerY = BOARD.y + BOARD_PIXELS.height * 0.38
  ctx.fillStyle = 'rgba(5,8,14,0.7)'
  ctx.fillRect(BOARD.x - 40, centerY - 30, BOARD_PIXELS.width + 80, 60)
  ctx.fillStyle = '#e8b730'
  ctx.fillRect(BOARD.x - 40, centerY - 30, BOARD_PIXELS.width + 80, 3)
  ctx.fillRect(BOARD.x - 40, centerY + 27, BOARD_PIXELS.width + 80, 3)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 30px ${FONT}`
  outlinedText(ctx, banner.title, BOARD.x + BOARD_PIXELS.width / 2, centerY, '#ffffff', 5)
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
