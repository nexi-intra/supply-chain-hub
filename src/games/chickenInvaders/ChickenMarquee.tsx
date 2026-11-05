import { useEffect, useRef } from 'react'
import { getBossSprites } from './bossSprites'
import type { BossId } from './bosses/core'
import { FIELD } from './config'
import { drawSprite, getBackground, getSprites, PALETTE } from './sprites'

const FLOCK = [
  { dx: 0, dy: 0, variant: 0 },
  { dx: 58, dy: -30, variant: 1 },
  { dx: 58, dy: 30, variant: 2 },
  { dx: 116, dy: -60, variant: 0 },
  { dx: 116, dy: 60, variant: 1 },
  { dx: 174, dy: -90, variant: 2 },
  { dx: 174, dy: 90, variant: 0 },
]
const FLOCK_PERIOD = 11
const SHOT_INTERVAL = 0.42
const BOLT_SPEED = 520
const STILL_FRAME_TIME = 4.2
/** Hver tredje gang flyver en af de nye bosser forbi som en dæmpet silhuet i stedet for flokken. */
const TEASER_BOSSES: BossId[] = ['eggeroid', 'iceQueen', 'roboRooster', 'galacticRooster']

/** Levende baggrund til Chicken Invaders-menuen: en flok høns flyver forbi, skibet skyder efter dem. */
export function ChickenMarquee({ reducedMotion }: { reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sprites = getSprites()
    const background = getBackground('farm', FIELD.width, FIELD.height)
    let width = 0
    let height = 0
    let frame = 0

    const draw = (t: number) => {
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const cover = Math.max(width / FIELD.width, height / FIELD.height)
      ctx.drawImage(background.canvas, width - FIELD.width * cover, (height - FIELD.height * cover) / 2, FIELD.width * cover, FIELD.height * cover)

      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < 70; i++) {
        const layer = i % 3
        const x = ((i * 137.5) % width + width - (t * (8 + layer * 14)) % width) % width
        const y = (i * 71.3) % height
        ctx.globalAlpha = 0.3 + layer * 0.25
        ctx.fillRect(x, y, 1 + layer * 0.6, 1 + layer * 0.6)
      }
      ctx.globalAlpha = 1

      const narrow = width < 640
      const cycle = Math.floor(t / FLOCK_PERIOD)
      const progress = (t % FLOCK_PERIOD) / FLOCK_PERIOD
      const teaserPass = cycle % 3 === 2 && !narrow
      if (teaserPass) {
        const teaser = getBossSprites(TEASER_BOSSES[Math.floor(cycle / 3) % TEASER_BOSSES.length]).body[0]
        ctx.save()
        ctx.globalAlpha = 0.75 * Math.min(1, Math.sin(progress * Math.PI) * 3)
        ctx.filter = 'brightness(0.55) saturate(0.6)'
        drawSprite(ctx, teaser, width + 160 - progress * (width + 320), height * 0.38 + Math.sin(t * 0.8) * 6, { scale: 0.5 })
        ctx.restore()
      }
      const leadX = width + 120 - progress * (width + 420)
      const baseY = narrow ? 46 : height * 0.4
      const spread = narrow ? 0.3 : 0.8
      for (const hen of teaserPass ? [] : FLOCK) {
        const x = leadX + hen.dx * (narrow ? 0.7 : 1)
        const y = baseY + hen.dy * spread + Math.sin(t * 2.2 + hen.dx) * 7
        const flap = Math.abs(Math.floor(t * 7 + hen.dx)) % 2
        drawSprite(ctx, sprites.hens[hen.variant][flap], x, y, { rotation: -0.12 + Math.sin(t * 3 + hen.dy) * 0.06, scale: narrow ? 0.62 : 0.95 })
      }

      const shipY = height - 34
      const shipX = (time: number) => width * 0.74 + Math.sin(time * 0.9) * width * 0.13
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const lastShot = Math.floor(t / SHOT_INTERVAL) * SHOT_INTERVAL
      for (let k = 0; k < 6; k++) {
        const shotTime = lastShot - k * SHOT_INTERVAL
        const y = shipY - 26 - (t - shotTime) * BOLT_SPEED
        if (shotTime < 0 || y < -30) continue
        drawSprite(ctx, sprites.bolt, shipX(shotTime), y)
      }
      ctx.restore()
      const x = shipX(t)
      const tilt = Math.cos(t * 0.9) * 0.18
      drawSprite(ctx, sprites.ship, x, shipY, { rotation: tilt, scale: 0.85 })

      const veil = ctx.createLinearGradient(0, 0, width * (narrow ? 1 : 0.65), 0)
      veil.addColorStop(0, `${PALETTE.space}eb`)
      veil.addColorStop(0.55, `${PALETTE.space}80`)
      veil.addColorStop(1, `${PALETTE.space}00`)
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, width, height)
      const floor = ctx.createLinearGradient(0, height * 0.55, 0, height)
      floor.addColorStop(0, `${PALETTE.space}00`)
      floor.addColorStop(1, `${PALETTE.space}b3`)
      ctx.fillStyle = floor
      ctx.fillRect(0, height * 0.55, width, height * 0.45)
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      if (reducedMotion) draw(STILL_FRAME_TIME)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    if (!reducedMotion) {
      const start = performance.now()
      const loop = (now: number) => {
        // rAF-tidsstemplet kan ligge før `start`; negativ tid giver ugyldige frames.
        draw(STILL_FRAME_TIME + Math.max(0, (now - start) / 1000))
        frame = requestAnimationFrame(loop)
      }
      frame = requestAnimationFrame(loop)
    }

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [reducedMotion])

  return <canvas ref={canvasRef} />
}
