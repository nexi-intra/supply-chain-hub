import { useEffect, useRef } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { FIELD, STEP_SECONDS } from './config'
import { createGame, stepGame, type GameState } from './engine'
import { applyPrismEvents, createPrismEffects, recordBalls, updatePrismEffects, type PrismEffects } from './effects'
import { prismLabels } from './labels'
import { createPrismRenderer } from './render'
import { PRISM_PALETTE } from './sprites'

const FOCUS_Y = 185
const STILL_FRAME_SECONDS = 9
const MAX_FRAME_SECONDS = 0.1
const MAX_STEPS_PER_FRAME = 4

/** Lander-punktet for den laveste nedadgÃ¥ende bold, foldet ind mellem vÃ¦ggene. */
function predictLanding(game: GameState): number {
  const falling = game.balls.filter((ball) => !ball.attached && ball.vy > 0).sort((a, b) => b.y - a.y)[0]
  const ball = falling ?? game.balls[0]
  if (!ball) return game.paddle.x
  if (ball.vy <= 0) return ball.x
  const span = FIELD.width * 2
  const raw = ball.x + ball.vx * ((game.paddle.y - ball.y) / ball.vy)
  const folded = ((raw % span) + span) % span
  return folded > FIELD.width ? span - folded : folded
}

/** Levende baggrund til Prism Break-menuen: den rigtige motor spiller sig selv bag et glasvindue. */
export function PrismMarquee({ reducedMotion }: { reducedMotion: boolean }) {
  const { language } = useLanguage()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const labels = prismLabels(language)
    const renderer = createPrismRenderer(canvas)
    let game: GameState = createGame('medium', { seed: 11 })
    let fx: PrismEffects = createPrismEffects({ reducedMotion })
    let clock = 0
    let accumulator = 0
    let aimOffset = 14
    let returns = game.stats.returns
    let width = 0
    let height = 0
    let frame = 0
    let last = 0

    const simulate = (seconds: number) => {
      accumulator += seconds
      let steps = 0
      while (accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME * 2) {
        if (game.status === 'over' || game.level > 2) {
          game = createGame('medium', { seed: 11 + Math.floor(clock) })
          fx = createPrismEffects({ reducedMotion })
          returns = game.stats.returns
        }
        if (game.stats.returns !== returns) {
          returns = game.stats.returns
          aimOffset = (game.rng() - 0.5) * game.paddle.width * 0.7
        }
        const events = stepGame(game, {
          left: false,
          right: false,
          launch: game.status === 'serve' && Math.floor(clock * 2) % 2 === 0,
          fire: true,
          pointerX: predictLanding(game) - aimOffset,
        })
        if (events.length > 0) applyPrismEvents(fx, events, labels)
        accumulator -= STEP_SECONDS
        steps++
      }
      if (steps >= MAX_STEPS_PER_FRAME * 2) accumulator = 0
      recordBalls(fx, game.balls)
    }

    const draw = () => {
      renderer.draw(game, fx, labels, clock, { hud: false })
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const narrow = width < 640
      const veil = ctx.createLinearGradient(0, 0, width * (narrow ? 1 : 0.62), 0)
      veil.addColorStop(0, `${PRISM_PALETTE.night}f0`)
      veil.addColorStop(0.55, `${PRISM_PALETTE.night}8c`)
      veil.addColorStop(1, `${PRISM_PALETTE.night}00`)
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, width, height)
      const floor = ctx.createLinearGradient(0, height * 0.5, 0, height)
      floor.addColorStop(0, `${PRISM_PALETTE.night}00`)
      floor.addColorStop(1, `${PRISM_PALETTE.night}c0`)
      ctx.fillStyle = floor
      ctx.fillRect(0, height * 0.5, width, height * 0.5)
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      renderer.resize(width, height, window.devicePixelRatio || 1, FOCUS_Y)
      draw()
    }

    if (reducedMotion) {
      // Et stillbillede midt i et spil, sÃ¥ menuen stadig viser glas og lys.
      for (let elapsed = 0; elapsed < STILL_FRAME_SECONDS; elapsed += 1 / 30) {
        clock += 1 / 30
        simulate(1 / 30)
        updatePrismEffects(fx, 1 / 30)
      }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    if (!reducedMotion) {
      const loop = (now: number) => {
        const elapsed = last === 0 ? 0 : Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000))
        last = now
        clock += elapsed
        updatePrismEffects(fx, elapsed)
        if (fx.hitStop <= 0) simulate(elapsed)
        draw()
        frame = requestAnimationFrame(loop)
      }
      frame = requestAnimationFrame(loop)
    }

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [language, reducedMotion])

  return <canvas ref={canvasRef} aria-hidden="true" />
}
