import { useEffect, useRef } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { STEP_SECONDS } from './config'
import { createGame, stepGame, type Action, type GameState } from './engine'
import { applyCargoEvents, createCargoEffects, updateCargoEffects, type CargoEffects } from './effects'
import { cargoLabels } from './labels'
import { createCargoRenderer } from './render'
import { nextAction, planPlacement, type Placement } from './autoplay'

const FOCUS_Y = 430
const ACTION_INTERVAL = 0.07
const STILL_FRAME_SECONDS = 25
const MAX_FRAME_SECONDS = 0.1
const MAX_STEPS_PER_FRAME = 12
const INK = '#0b1017'
const IDLE = { left: false, right: false, down: false }

/** Levende baggrund til Cargo Stack-menuen: en autopilot læsser containeren med den rigtige motor. */
export function CargoMarquee({ reducedMotion }: { reducedMotion: boolean }) {
  const { language } = useLanguage()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const labels = cargoLabels(language)
    const renderer = createCargoRenderer(canvas)
    let seed = 31
    let game: GameState = createGame('medium', { seed })
    let fx: CargoEffects = createCargoEffects({ reducedMotion })
    let plan: Placement | null = planPlacement(game)
    let planFor = game.stats.pieces
    let actionTimer = 0
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
        if (game.status === 'over' || game.lines >= 60) {
          game = createGame('medium', { seed: ++seed })
          fx = createCargoEffects({ reducedMotion })
        }
        if (game.stats.pieces !== planFor || !plan) {
          plan = planPlacement(game)
          planFor = game.stats.pieces
        }
        actionTimer += STEP_SECONDS
        const actions: Action[] = []
        if (actionTimer >= ACTION_INTERVAL) {
          actionTimer = 0
          const action = nextAction(game, plan)
          if (action) actions.push(action)
        }
        const events = stepGame(game, { actions, held: IDLE })
        if (events.length > 0) applyCargoEvents(fx, events, labels)
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
      // Et stillbillede af en halvt læsset container.
      for (let elapsed = 0; elapsed < STILL_FRAME_SECONDS; elapsed += 1 / 30) {
        clock += 1 / 30
        simulate(1 / 30)
        updateCargoEffects(fx, 1 / 30)
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
        updateCargoEffects(fx, elapsed)
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
