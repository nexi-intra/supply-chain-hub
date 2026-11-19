import { useEffect, useRef } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { STEP_SECONDS } from './config'
import { createGame, stepGame, type GameState } from './engine'
import { applyRouteEvents, createRouteEffects, updateRouteEffects, type RouteEffects } from './effects'
import { routeLabels } from './labels'
import { createRouteRenderer } from './render'
import { autopilotDirection } from './autoplay'

const FOCUS_Y = 330
const STILL_FRAME_SECONDS = 18
const MAX_FRAME_SECONDS = 0.1
const MAX_STEPS_PER_FRAME = 12
const INK = '#11161d'

/** Levende baggrund til Route Runner-menuen: autopiloten kører lagertoget med den rigtige motor. */
export function RouteMarquee({ reducedMotion }: { reducedMotion: boolean }) {
  const { language } = useLanguage()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const labels = routeLabels(language)
    const renderer = createRouteRenderer(canvas)
    let seed = 41
    let game: GameState = createGame('medium', { seed })
    let fx: RouteEffects = createRouteEffects({ reducedMotion })
    let lastTick = -1
    let clock = 0
    let accumulator = 0
    let width = 0
    let height = 0
    let frame = 0
    let last = 0

    const simulate = (seconds: number) => {
      accumulator += seconds
      let steps = 0
      while (accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
        if (game.status === 'over' || game.segments.length > 45) {
          game = createGame('medium', { seed: ++seed })
          fx = createRouteEffects({ reducedMotion })
          lastTick = -1
        }
        const turns = game.status === 'playing' && game.ticks !== lastTick ? [autopilotDirection(game)] : []
        lastTick = game.ticks
        const events = stepGame(game, { turns, start: true })
        if (events.length > 0) applyRouteEvents(fx, events, labels)
        accumulator -= STEP_SECONDS
        steps++
      }
      if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0
    }

    const draw = () => {
      renderer.draw(game, fx, labels, clock, { hud: false })
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const narrow = width < 640
      const veil = ctx.createLinearGradient(0, 0, width * (narrow ? 1 : 0.6), 0)
      veil.addColorStop(0, `${INK}f0`)
      veil.addColorStop(0.55, `${INK}8c`)
      veil.addColorStop(1, `${INK}00`)
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, width, height)
      const floor = ctx.createLinearGradient(0, height * 0.5, 0, height)
      floor.addColorStop(0, `${INK}00`)
      floor.addColorStop(1, `${INK}c0`)
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
      // Et stillbillede af et langt tog midt i en tur.
      for (let elapsed = 0; elapsed < STILL_FRAME_SECONDS; elapsed += 1 / 30) {
        clock += 1 / 30
        simulate(1 / 30)
        updateRouteEffects(fx, 1 / 30)
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
        updateRouteEffects(fx, elapsed)
        simulate(elapsed)
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
