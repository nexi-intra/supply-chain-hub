import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  createRandom, feedingSteps, firstStep, isFree, nextStep, scaleAt, type HubertActivity, type HubertFood,
  type HubertStep, type HubertWorld, type Point, type Size, type TableSide,
} from '@/lib/hubertRoutine'
import { bearingFromKey, planChain, restingBearing, stripMs, type Bearing, type Shot } from '@/lib/hubertMotion'
import manifest from '@/assets/multiplayer/hubert.json'
import './hubert.css'

// Hubert is rendered in Blender (scripts/blender/hubert.py) as sprite strips; every frame is FRAME_W x
// FRAME_H with his feet on the manifest's ground point. CSS steps() plays a strip, so a running animation
// never re-renders React. hubertMotion plans which strips follow each other so nothing ever cuts.

interface Strip { frames: number; fps: number; loop: boolean; tag: number[]; box?: number[] }
const STRIPS = manifest.animations as unknown as Record<string, Strip>

/**
 * Strips seen from behind or in front have their own frame (width, height, ground point) at the same scale as the
 * side frame; this places one so its ground point sits on the dog box's, and mirrors it round that point.
 */
function frameStyle(sheet: string): CSSProperties | undefined {
  const box = STRIPS[sheet]?.box
  if (!box) return undefined
  const [w, h, gx, gy] = box
  const { frameWidth: fw, frameHeight: fh, ground } = manifest
  return {
    inset: 'auto',
    left: `${((ground.x - gx) / fw) * 100}%`,
    top: `${((ground.y - gy) / fh) * 100}%`,
    width: `${(w / fw) * 100}%`,
    height: `${(h / fh) * 100}%`,
    transformOrigin: `${(gx / w) * 100}% 100%`,
  }
}

const SHEET_URLS = import.meta.glob('../../assets/multiplayer/hubert-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

function sheetUrl(sheet: string): string {
  return SHEET_URLS[`../../assets/multiplayer/hubert-${sheet}.webp`] ?? ''
}

// A strip is decoded before it is shown and kept referenced while it may be needed, so it is never blank
// while the browser decodes it. Decoded strips beyond the budget that the coming moves do not need are let
// go (GPU compositing is off on many machines, so every decoded strip is plain memory).
const DECODE_BUDGET = 64 * 1024 * 1024
const decodedSheets = new Map<string, { image: HTMLImageElement; ready: Promise<void>; bytes: number; used: number }>()
let decodeTick = 0
function decodeSheet(sheet: string): Promise<void> {
  let entry = decodedSheets.get(sheet)
  if (!entry) {
    const image = new Image()
    image.src = sheetUrl(sheet)
    const created: { image: HTMLImageElement; ready: Promise<void>; bytes: number; used: number } = { image, ready: Promise.resolve(), bytes: 0, used: 0 }
    created.ready = image.decode().then(() => { created.bytes = image.naturalWidth * image.naturalHeight * 4 }, () => undefined)
    decodedSheets.set(sheet, created)
    entry = created
  }
  entry.used = ++decodeTick
  return entry.ready
}
function isDecoded(sheet: string): boolean {
  return (decodedSheets.get(sheet)?.bytes ?? 0) > 0
}
function trimDecoded(keep: ReadonlySet<string>) {
  let total = 0
  for (const entry of decodedSheets.values()) total += entry.bytes
  const old = [...decodedSheets.entries()].filter(([sheet]) => !keep.has(sheet)).sort((a, b) => a[1].used - b[1].used)
  for (const [sheet, entry] of old) {
    if (total <= DECODE_BUDGET) break
    total -= entry.bytes
    decodedSheets.delete(sheet)
  }
}
/** What every visit starts with: the basket, lying, sleeping, standing and setting off. */
const FIRST_SHEETS = ['basket', 'rest', 'sleep', 'get-up', 'stand', 'start', 'walk']

const IN_BASKET: readonly string[] = ['rest', 'sleep', 'chew', 'basket', 'lie-down', 'lie-down-bone', 'get-up', 'doze']

function spriteStyle(sheet: string, reverse: boolean, delayMs: number): CSSProperties {
  const { frames, fps, loop } = STRIPS[sheet] ?? { frames: 1, fps: 1, loop: false }
  return {
    '--hb-sheet': `url("${sheetUrl(sheet)}")`,
    '--hb-frames': frames,
    // A loop jumps back to frame 0 after the last frame; a one-shot stops on its last frame (its first when reversed).
    '--hb-end': frames < 2 ? '0%' : loop ? `${(frames / (frames - 1)) * 100}%` : '100%',
    '--hb-name': reverse && !loop ? 'hb-play-rev' : 'hb-play',
    '--hb-timing': frames < 2 ? 'linear' : loop ? `steps(${frames}, end)` : `steps(${frames - 1}, end)`,
    '--hb-duration': `${(loop ? frames : frames - 1 || 1) / fps}s`,
    '--hb-delay': `${-Math.max(0, delayMs) / 1000}s`,
    '--hb-count': loop ? 'infinite' : '1',
  } as CSSProperties
}

/** One strip, playing from its first frame (or `delayMs` into it, to keep a gait in step across views). */
export function HubertSprite({ sheet, reverse = false, delayMs = 0, className = '' }: { sheet: string; reverse?: boolean; delayMs?: number; className?: string }) {
  return <div className={`hb-sprite ${className}`} data-sheet={sheet} style={spriteStyle(sheet, reverse, delayMs)} aria-hidden="true" />
}

/** What the dog layer shows; a new id starts the strip again. */
interface LayerSpec { id: number; sheet: string; reverse: boolean; mirror: boolean; fade: boolean; delayMs: number }
interface SpriteLayer extends LayerSpec { ready: boolean }

/** Must match the hb-fade-in duration in hubert.css. */
const CROSSFADE_MS = 180
/** A strip that starts in the pose the last one ended in takes over at once; the old one stays under it a moment. */
const SWAP_MS = 90

/**
 * Plays the layer spec. A strip that starts in the pose the previous one ended in replaces it seamlessly; any
 * other change fades the new strip in over the old. A new layer waits until its strip is decoded, and the
 * old one stays until the new one covers it.
 */
function SpriteStack({ spec }: { spec: LayerSpec }) {
  const [layers, setLayers] = useState<SpriteLayer[]>(() => [{ ...spec, ready: true }])
  useEffect(() => {
    let added = false
    setLayers(current => {
      const top = current[current.length - 1]
      if (top.id === spec.id) return current
      added = true
      // Keep the newest visible layer underneath; anything older is already covered.
      const visible = [...current].reverse().find(layer => layer.ready) ?? top
      return [visible, { ...spec, ready: isDecoded(spec.sheet) }]
    })
    let cancelled = false
    void decodeSheet(spec.sheet).then(() => {
      if (cancelled || !added) return
      setLayers(current => current.map(layer => (layer.id === spec.id && !layer.ready ? { ...layer, ready: true } : layer)))
    })
    return () => { cancelled = true }
  }, [spec])
  useEffect(() => {
    const top = layers[layers.length - 1]
    if (layers.length < 2 || !top.ready) return
    const timer = window.setTimeout(() => setLayers(current => current.slice(-1)), top.fade ? CROSSFADE_MS : SWAP_MS)
    return () => window.clearTimeout(timer)
  }, [layers])
  return layers.map((layer, index) => (
    <div
      key={layer.id}
      className="hb-flip"
      style={frameStyle(layer.sheet)}
      data-facing={layer.mirror ? 'left' : 'right'}
      data-enter={index > 0 && layer.ready && layer.fade ? '' : undefined}
      data-waiting={layer.ready ? undefined : ''}
    >
      <HubertSprite sheet={layer.sheet} reverse={layer.reverse} delayMs={layer.delayMs} />
    </div>
  ))
}

/** Hubert asleep in his basket, for places where he should not roam (the lobby marquee). */
export function HubertNapping({ className = '' }: { className?: string }) {
  return (
    <div className={`hb-napping ${className}`} aria-hidden="true">
      <HubertSprite sheet="sleep" />
    </div>
  )
}

/** His brass name tag, drawn large enough to read. */
function NameTag() {
  return (
    <svg className="hb-tag" viewBox="0 0 64 34" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hbTagBrass" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#fbe7ad" />
          <stop offset="0.5" stopColor="#d9a944" />
          <stop offset="1" stopColor="#8f6a1f" />
        </radialGradient>
      </defs>
      <path d="M32 1.5 v4" stroke="#8f6a1f" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="2" y="6" width="60" height="26" rx="13" fill="url(#hbTagBrass)" stroke="#7a5717" strokeWidth="1" />
      <rect x="5" y="9" width="54" height="20" rx="10" fill="none" stroke="rgba(255,244,214,.55)" strokeWidth="0.8" />
      <text x="32" y="24.2" textAnchor="middle">Hubert</text>
    </svg>
  )
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface HubertFeeding {
  /** Changes for every feeding; a new id starts the visit to the table. */
  id: string
  side: TableSide
  kind: HubertFood
  /** Shown above him, for example "Bo gave Hubert a treat". */
  caption: string
}

export interface HubertProps {
  /** null while the room is too small for him to roam: he then stays asleep in his basket. */
  world: HubertWorld | null
  /** Where the basket stands when there is no world. */
  basket: Point
  /** Scale of the basket (and of him in it) when there is no world. */
  basketScale: number
  /** His box at scale 1; the world's depth scales it down further away. */
  dog: Size
  /** Horizontal centre of the board; he faces it when he sits down. */
  lookAt: number
  woofs: readonly string[]
  feeding: HubertFeeding | null
}

/**
 * Lives in the room: wakes, walks, sniffs, chews and naps on timers, and trots to the table when a
 * player calls him. Every step is a chain of strips (hubertMotion.planChain): up from what he was doing,
 * a turn, setting off, the walk in the view of each stretch's heading, pulling up, settling down. Walking
 * is a CSS transition on one transform, the strips are CSS steps(); only a change of strip re-renders.
 */
export const Hubert = memo(function Hubert({ world, basket, basketScale, dog, lookAt, woofs, feeding }: HubertProps) {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  const [paused, setPaused] = useState(() => typeof document !== 'undefined' && document.hidden)
  const [step, setStep] = useState<HubertStep | null>(null)
  const [shot, setShot] = useState<Shot | null>(null)
  const [layer, setLayer] = useState<LayerSpec>({ id: 0, sheet: 'rest', reverse: false, mirror: false, fade: false, delayMs: 0 })
  const [position, setPosition] = useState<Point>(basket)
  const [walkMs, setWalkMs] = useState(0)
  const [walkEase, setWalkEase] = useState('linear')
  const [walking, setWalking] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const [happy, setHappy] = useState(false)
  const worldRef = useRef(world)
  worldRef.current = world
  const timers = useRef<number[]>([])
  const random = useRef(createRandom(Math.floor(Date.now() % 2147483647)))
  const here = useRef<Point>(basket)
  const woofIndex = useRef(0)
  const bubbleTimer = useRef<number | undefined>(undefined)
  const walkingRef = useRef(false)
  const stepRef = useRef<HubertStep | null>(null)
  const basketRef = useRef(basket)
  basketRef.current = basket
  const lookRef = useRef(lookAt)
  lookRef.current = lookAt
  const layerRef = useRef(layer)
  const bearing = useRef<Bearing>(restingBearing())
  // Ends of the shot on screen, whether it is the settled activity, and when the current gait started.
  const shotEnds = useRef(0)
  const settledRef = useRef(true)
  const gaitClock = useRef<{ gait: string; start: number } | null>(null)
  const playToken = useRef(0)

  useEffect(() => {
    for (const sheet of FIRST_SHEETS) void decodeSheet(sheet)
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const clearTimers = () => {
    playToken.current++
    for (const timer of timers.current) window.clearTimeout(timer)
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }

  const snap = (point: Point) => {
    here.current = point
    setWalkMs(0)
    setPosition(point)
  }

  const showLayer = (next: Omit<LayerSpec, 'id'>) => {
    const spec = { ...next, id: layerRef.current.id + 1 }
    layerRef.current = spec
    setLayer(spec)
  }

  const say = useCallback((text: string, ms = 2400, wag = true) => {
    setBubble(text)
    setHappy(wag)
    window.clearTimeout(bubbleTimer.current)
    bubbleTimer.current = window.setTimeout(() => { setBubble(null); setHappy(false) }, ms)
  }, [])

  /** Puts one shot of a chain on screen: its strip (unless the same strip simply carries on) and, walking, the stretch. */
  const showShot = (current: Shot, forceFade: boolean) => {
    const now = performance.now()
    if (current.kind === 'move') {
      if (gaitClock.current?.gait !== current.gait) gaitClock.current = { gait: current.gait ?? 'walk', start: now }
    } else gaitClock.current = null
    const shown = layerRef.current
    if (current.kind === 'clip' || forceFade || shown.sheet !== current.sheet || shown.mirror !== current.mirror || shown.reverse !== current.reverse) {
      // A new view of the same gait joins in step with the old one.
      const period = current.kind === 'move' ? stripMs(current.sheet) : 0
      const delayMs = period && gaitClock.current ? (now - gaitClock.current.start) % period : 0
      showLayer({ sheet: current.sheet, reverse: current.reverse, mirror: current.mirror, fade: current.fade || forceFade, delayMs })
    }
    setShot(current)
    if (current.kind === 'move' && current.target) {
      walkingRef.current = true
      setWalking(true)
      setWalkMs(current.ms)
      setWalkEase(current.ease ?? 'linear')
      setPosition(current.target)
      here.current = current.target
    } else if (walkingRef.current) {
      walkingRef.current = false
      setWalking(false)
      setWalkMs(0)
    }
  }

  /** Plays the queued steps one after another, then carries on with his own routine. */
  const play = useCallback((queue: HubertStep[], fadeFirst = false) => {
    // Cut into a strip that is still playing (a feeding call mid-walk), the next one fades in.
    const interrupted = fadeFirst || (!settledRef.current && performance.now() < shotEnds.current - 40)
    clearTimers()
    const token = playToken.current
    const [next, ...rest] = queue
    const current = worldRef.current
    if (!next || !current) return
    stepRef.current = next
    const chain = planChain(current, here.current, next, bearing.current, lookRef.current)
    const sheets = new Set(chain.shots.map(item => item.sheet))
    sheets.add(layerRef.current.sheet)
    // Everything the chain shows is decoded before it starts; meanwhile the current strip simply carries on.
    void Promise.all([...sheets].map(decodeSheet)).then(() => {
      if (token !== playToken.current) return
      trimDecoded(sheets)
      setStep(next)
      const run = (index: number) => {
        const item = chain.shots[index]
        if (!item) {
          const world = worldRef.current
          if (rest.length) play(rest)
          else if (world) play([nextStep(world, here.current, next.activity, random.current)])
          return
        }
        const last = index === chain.shots.length - 1
        showShot(item, index === 0 && interrupted)
        bearing.current = last ? chain.end : item.kind === 'move' ? { pose: 'move', heading: item.heading, key: item.leave } : bearingFromKey(item.leave)
        settledRef.current = last
        shotEnds.current = performance.now() + item.ms
        later(() => run(index + 1), item.ms)
      }
      run(0)
    })
  }, [])

  // The routine starts awake in the basket; nothing runs and nothing animates while the window is hidden.
  const enabled = world !== null && !reduced
  useEffect(() => {
    clearTimers()
    walkingRef.current = false
    setWalking(false)
    if (!enabled) {
      stepRef.current = null
      setStep(null)
      setShot(null)
      bearing.current = restingBearing()
      showLayer({ sheet: 'sleep', reverse: false, mirror: false, fade: false, delayMs: 0 })
      snap(worldRef.current?.basket ?? basketRef.current)
      return
    }
    const start = () => {
      const current = worldRef.current
      if (!current) return
      walkingRef.current = false
      setWalking(false)
      bearing.current = restingBearing()
      snap(current.basket)
      play([firstStep(current, random.current)], true)
    }
    const onVisibility = () => {
      setPaused(document.hidden)
      if (document.hidden) clearTimers()
      else start()
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimers()
    }
  }, [enabled, play])

  // The room changed size: keep doing the same thing where it now is, or go home if that spot is gone.
  const worldKey = world ? JSON.stringify(world) : ''
  useEffect(() => {
    const current = worldRef.current
    if (!current || reduced) {
      snap(current?.basket ?? basketRef.current)
      return
    }
    const active = stepRef.current
    if (!active || walkingRef.current) return
    const target = ['sleep', 'rest', 'chew'].includes(active.activity) ? current.basket : here.current
    if (isFree(current, target)) snap(target)
    else {
      bearing.current = restingBearing()
      snap(current.basket)
      play([firstStep(current, random.current)], true)
    }
    // worldKey stands in for the world object.
  }, [worldKey, basket.x, basket.y])

  // A player called him to the table.
  const feedingId = feeding?.id ?? null
  useEffect(() => {
    if (!feeding) return
    say(feeding.caption, enabled ? 7000 : 4500, enabled)
    const current = worldRef.current
    if (!enabled || !current || document.hidden) return
    play(feedingSteps(current, here.current, feeding.side, feeding.kind))
    // feedingId stands in for the feeding object.
  }, [feedingId])

  useEffect(() => () => window.clearTimeout(bubbleTimer.current), [])

  const woof = () => {
    if (woofs.length === 0) return
    say(woofs[woofIndex.current % woofs.length])
    woofIndex.current++
  }

  const activity: HubertActivity = step?.activity ?? (reduced || !world ? 'sleep' : 'rest')
  const sheet = layer.sheet
  const settled = shot === null || shot.kind === 'loop'
  const inBasket = IN_BASKET.includes(sheet)
  // The basket strips draw the basket themselves; keep the separate one until such a strip has faded in.
  const [basketLinger, setBasketLinger] = useState(false)
  const wasInBasket = useRef(inBasket)
  useEffect(() => {
    const entered = inBasket && !wasInBasket.current
    wasInBasket.current = inBasket
    if (!entered) return
    setBasketLinger(true)
    const timer = window.setTimeout(() => setBasketLinger(false), CROSSFADE_MS)
    return () => window.clearTimeout(timer)
  }, [inBasket])
  const face = layer.mirror ? 'left' : 'right'
  const tag = STRIPS[sheet]?.tag ?? [manifest.frameWidth / 2, manifest.frameHeight / 2]
  const tagX = (tag[0] / manifest.frameWidth) * 100
  const showTag = (happy || activity === 'beg') && !inBasket && !walking && settled
  const basketAt = world?.basket ?? basket
  // Beside the table a bubble to his side would slide under it; there it goes above his head.
  const bubbleAbove = world ? position.y - world.lane.y > 70 : false
  const scale = (at: Point) => (world ? scaleAt(world, at.y) : basketScale)
  // The box is his frame at scale 1, scaled from its top-left corner to his size at that depth.
  const box = (at: Point, extra?: CSSProperties) => ({
    width: dog.w,
    height: dog.h,
    transform: `translate3d(${at.x}px, ${at.y}px, 0) scale(${scale(at).toFixed(4)})`,
    '--hb-s': scale(at).toFixed(4),
    ...extra,
  }) as CSSProperties

  return (
    <div className="hb-layer" data-reduced={reduced ? '' : undefined} data-paused={paused ? '' : undefined}>
      {(!inBasket || basketLinger) && <div className="hb-prop" style={box(basketAt)}><HubertSprite sheet="basket" /></div>}
      <div
        className="hb-dog"
        style={box(position, { transitionDuration: `${walkMs}ms`, transitionTimingFunction: walkEase })}
        data-facing={face}
        data-sheet={sheet}
        data-happy={happy ? '' : undefined}
        data-bubble={bubbleAbove ? 'above' : undefined}
        aria-hidden="true"
        onPointerEnter={() => { if (!bubble) woof() }}
        onClick={woof}
      >
        <SpriteStack spec={layer} />
        {showTag && (
          <span className="hb-tag-pin" style={{ left: `${face === 'left' ? 100 - tagX : tagX}%`, top: `${(tag[1] / manifest.frameHeight) * 100}%` }}>
            <NameTag />
          </span>
        )}
        {bubble && <span className="hb-bubble" data-wide={bubble.length > 18 ? '' : undefined} key={bubble + woofIndex.current}>{bubble}</span>}
      </div>
    </div>
  )
})
