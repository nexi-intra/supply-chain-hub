// How Hubert gets from one activity to the next without a single hard cut: the strips he plays, in order.
// Every strip starts in one pose and ends in another (see hubert.py); a strip that starts in the pose the
// previous one ended in simply takes over, anything else fades in over it. Pure, so it can be tested.
import manifest from '../assets/multiplayer/hubert.json'
import {
  DEPTH_PACE, createRandom, firstStep, nextStep, segmentDuration, segmentEase, sizeAt,
  type HubertActivity, type HubertGait, type HubertStep, type HubertWorld, type Point,
} from './hubertRoutine'

export interface StripInfo { frames: number; fps: number; loop: boolean }
const STRIPS = manifest.animations as unknown as Record<string, StripInfo>

export function hasStrip(sheet: string): boolean {
  return sheet in STRIPS
}

/** A loop's period, or how long a one-shot takes from its first frame to its last. */
export function stripMs(sheet: string): number {
  const strip = STRIPS[sheet]
  if (!strip) return 0
  return Math.round(((strip.loop ? strip.frames : Math.max(1, strip.frames - 1)) / strip.fps) * 1000)
}

/** The rendered views; west-going headings show the east-going views mirrored. */
export type View = 'e' | 'ne' | 'n' | 'se' | 's'

/** Eight headings on the floor, counter-clockwise from east: 0 E (right), 2 N (away from the viewer), 4 W, 6 S (towards). */
const HEADING_VIEWS: ReadonlyArray<{ view: View; mirror: boolean }> = [
  { view: 'e', mirror: false }, { view: 'ne', mirror: false }, { view: 'n', mirror: false }, { view: 'ne', mirror: true },
  { view: 'e', mirror: true }, { view: 'se', mirror: true }, { view: 's', mirror: false }, { view: 'se', mirror: false },
]

export function viewOf(heading: number): { view: View; mirror: boolean } {
  return HEADING_VIEWS[((heading % 8) + 8) % 8]
}

/** Degrees beyond the half-sector a new stretch must turn before he shows another view, so he never flickers on a border. */
export const HEADING_HYSTERESIS = 12
/** One 45-degree step of turning on the spot. */
export const TURN_STEP_MS = 160

/** Direction on the floor of a stretch on screen (0 = right, 90 = straight away from the viewer). */
export function floorAngle(dx: number, dy: number): number {
  return ((Math.atan2(-dy / DEPTH_PACE, dx) * 180) / Math.PI + 360) % 360
}

/** The nearest of the eight headings; he keeps `previous` until the stretch leaves its sector by the hysteresis. */
export function pickHeading(dx: number, dy: number, previous: number | null, hysteresis = HEADING_HYSTERESIS): number {
  if (Math.hypot(dx, dy) < 1) return previous ?? 0
  const angle = floorAngle(dx, dy)
  if (previous !== null) {
    const off = Math.abs(((angle - previous * 45 + 540) % 360) - 180)
    if (off <= 22.5 + hysteresis) return previous
  }
  return Math.round(angle / 45) % 8
}

function viewSheet(base: string, heading: number): { sheet: string; mirror: boolean } {
  const { view, mirror } = viewOf(heading)
  const sheet = view === 'e' ? base : `${base}-${view}`
  if (hasStrip(sheet)) return { sheet, mirror }
  // Without that view he shows the side view, facing the way he is going.
  return { sheet: base, mirror: Math.cos((heading * Math.PI) / 4) < -0.01 }
}

/** Where he stands still: settled poses, the two ways of standing in the basket, and moving. */
export type Pose = 'stand' | 'sit' | 'beg' | 'sniff' | 'lie' | 'sleep' | 'chew' | 'move'

export interface Bearing {
  pose: Pose
  /** Heading 0..7; settled poses face 0 (right) or 4 (left). */
  heading: number
  /** Exact pose the last strip ended in, for example `sit@4`; the next strip fades in unless it starts there. */
  key: string
}

export function restingBearing(): Bearing {
  return { pose: 'lie', heading: 0, key: 'lie@0' }
}

const KEY_POSE: Record<string, Pose> = {
  stand: 'stand', standb: 'stand', basket: 'stand', basketb: 'stand', walk: 'move', run: 'move', carry: 'move',
  sit: 'sit', eat: 'sit', beg: 'beg', sniff: 'sniff', lie: 'lie', sleep: 'sleep', chew: 'chew',
}

/** What a strip leaves him doing, for a chain that is interrupted after it started. */
export function bearingFromKey(key: string): Bearing {
  const [name, at] = key.split('@')
  return { pose: KEY_POSE[name] ?? 'stand', heading: Number(at) || 0, key }
}

export type ShotKind = 'clip' | 'hold' | 'move' | 'loop'

export interface Shot {
  /** clip: a one-shot transition; hold: a still while he turns; move: walking a stretch; loop: the activity. */
  kind: ShotKind
  sheet: string
  reverse: boolean
  mirror: boolean
  /** Pose keys the strip starts and ends in. */
  enter: string
  leave: string
  /** Fades in over the previous strip because it does not start where that one ended. */
  fade: boolean
  ms: number
  heading: number
  /** move: where the stretch ends, its CSS easing and gait. */
  target?: Point
  ease?: string
  gait?: HubertGait
}

/** One-shot transitions (side view unless noted): the pose each starts and ends in, played forward. */
const CLIPS: Record<string, [string, string]> = {
  start: ['stand', 'walk'],
  'sit-down': ['stand', 'sit'],
  'beg-up': ['sit', 'beg'],
  'sniff-down': ['stand', 'sniff'],
  'lie-down': ['basket', 'lie'],
  'lie-down-bone': ['basketb', 'chew'],
  'get-up': ['lie', 'basket'],
  doze: ['lie', 'sleep'],
}

function clip(base: string, heading: number, reverse = false): Shot | null {
  // only `start` exists in every view; the others are side views facing right (0) or left (4)
  const { sheet, mirror } = base === 'start' ? viewSheet(base, heading) : { sheet: base, mirror: heading === 4 }
  if (!hasStrip(sheet)) return null
  const [a, b] = CLIPS[base]
  const [enter, leave] = reverse ? [b, a] : [a, b]
  return { kind: 'clip', sheet, reverse, mirror, enter: `${enter}@${heading}`, leave: `${leave}@${heading}`, fade: false, ms: stripMs(sheet), heading }
}

function standStill(heading: number, bone: boolean): Shot | null {
  const { sheet, mirror } = viewSheet(bone ? 'stand-bone' : 'stand', heading)
  if (!hasStrip(sheet)) return null
  const key = `${bone ? 'standb' : 'stand'}@${heading}`
  return { kind: 'hold', sheet, reverse: false, mirror, enter: key, leave: key, fade: false, ms: TURN_STEP_MS, heading }
}

/** Turning on the spot, 45 degrees at a time; a half turn goes round by the front, towards the viewer. */
export function turnHeadings(from: number, to: number): number[] {
  const a = ((from % 8) + 8) % 8
  const b = ((to % 8) + 8) % 8
  if (a === b) return []
  const ccw = (b - a + 8) % 8
  const route = (dir: 1 | -1) => {
    const out: number[] = []
    for (let h = a; h !== b; ) {
      h = (h + dir + 8) % 8
      out.push(h)
    }
    return out
  }
  if (ccw < 4) return route(1)
  if (ccw > 4) return route(-1)
  const left = route(1)
  return left.includes(6) ? left : route(-1)
}

function turnShots(from: number, to: number, bone: boolean): Array<Shot | null> {
  return turnHeadings(from, to).map(heading => standStill(heading, bone))
}

const SETTLE: Record<HubertActivity, { pose: Pose; sheet: string }> = {
  sit: { pose: 'sit', sheet: 'sit' },
  beg: { pose: 'beg', sheet: 'beg' },
  eat: { pose: 'sit', sheet: 'eat' },
  sniff: { pose: 'sniff', sheet: 'sniff' },
  rest: { pose: 'lie', sheet: 'rest' },
  sleep: { pose: 'sleep', sheet: 'sleep' },
  chew: { pose: 'chew', sheet: 'chew' },
}
const LYING: readonly Pose[] = ['lie', 'sleep', 'chew']

/** From a settled pose up onto his feet (in the basket he ends up standing in it, facing right). */
function exitShots(from: Bearing): Array<Shot | null> {
  const h = from.heading
  switch (from.pose) {
    case 'sit': return [clip('sit-down', h, true)]
    case 'beg': return [clip('beg-up', h, true), clip('sit-down', h, true)]
    case 'sniff': return [clip('sniff-down', h, true)]
    case 'lie': return [clip('get-up', 0)]
    case 'sleep': return [clip('doze', 0, true), clip('get-up', 0)]
    case 'chew': return [clip('get-up', 0)]
    default: return []
  }
}

/** From standing, facing `h`, down into a settled pose. */
function entryShots(pose: Pose, h: number, bone: boolean): Array<Shot | null> {
  switch (pose) {
    case 'sit': return [clip('sit-down', h)]
    case 'beg': return [clip('sit-down', h), clip('beg-up', h)]
    case 'sniff': return [clip('sniff-down', h)]
    case 'lie': return [clip('lie-down', 0)]
    case 'sleep': return [clip('lie-down', 0), clip('doze', 0)]
    case 'chew': return [clip(bone && hasStrip('lie-down-bone') ? 'lie-down-bone' : 'lie-down', 0)]
    default: return []
  }
}

/** Settled pose to settled pose on the spot: lying poses change lying down, the rest by way of what they share. */
function directShots(from: Bearing, pose: Pose, face: number, bone: boolean): Array<Shot | null> {
  if (from.pose === pose && from.heading === face) return []
  if (LYING.includes(from.pose) && LYING.includes(pose)) {
    const out: Array<Shot | null> = []
    if (from.pose === 'sleep') out.push(clip('doze', 0, true))
    if (pose === 'sleep') out.push(clip('doze', 0))
    return out
  }
  const exit = exitShots(from).filter((shot): shot is Shot => shot !== null)
  const standing = LYING.includes(from.pose) ? 0 : from.heading
  const turn = turnShots(standing, face, bone)
  const entry = entryShots(pose, face, bone).filter((shot): shot is Shot => shot !== null)
  // Standing up only to sit down again cancels out: beg -> eat is just beg-down.
  while (turn.length === 0 && exit.length && entry.length) {
    const last = exit[exit.length - 1]
    const first = entry[0]
    if (last.sheet !== first.sheet || last.reverse === first.reverse) break
    exit.pop()
    entry.shift()
  }
  return [...exit, ...turn, ...entry]
}

function sideOf(heading: number, fallback: number): number {
  const x = Math.cos((heading * Math.PI) / 4)
  return x > 0.01 ? 0 : x < -0.01 ? 4 : fallback
}

/** The side he settles facing: the board for sitting, begging and eating, right in the basket, else the way he came. */
export function settleFacing(world: HubertWorld, step: HubertStep, arrival: number, look: number | null): number {
  const { pose } = SETTLE[step.activity]
  if (LYING.includes(pose)) return 0
  if ((pose === 'sit' || pose === 'beg') && look !== null) return step.at.x + sizeAt(world, step.at.y).w / 2 < look ? 0 : 4
  return sideOf(arrival, 0)
}

export interface Chain {
  shots: Shot[]
  /** Where the chain leaves him, for the next one. */
  end: Bearing
}

/**
 * The strips for one step of his routine: up from what he was doing, a turn, setting off, every stretch
 * of the walk in the view of its heading, pulling up, turning to settle, down into the new activity and
 * that activity for its stay. A walk lasts a whole number of gait cycles so it ends where `stop` starts.
 */
export function planChain(world: HubertWorld, from: Point, step: HubertStep, bearing: Bearing, look: number | null = null): Chain {
  const settle = SETTLE[step.activity]
  const bone = step.gait === 'carry'
  const raw: Array<Shot | null> = []
  let arrival = bearing.heading
  if (step.path.length === 0) {
    const face = settleFacing(world, step, arrival, look)
    if (bearing.pose === 'move') raw.push(standStill(bearing.heading, bone), ...turnShots(bearing.heading, face, bone), ...entryShots(settle.pose, face, bone))
    else raw.push(...directShots(bearing, settle.pose, face, bone))
    raw.push(loopShot(step, settle, face))
    return finish(raw, bearing, settle.pose, face)
  }
  let heading = bearing.heading
  if (bearing.pose !== 'move') {
    raw.push(...exitShots(bearing))
    const first = pickHeading(step.path[0].x - from.x, step.path[0].y - from.y, null)
    raw.push(...turnShots(LYING.includes(bearing.pose) ? 0 : bearing.heading, first, bone))
    if (step.gait === 'walk') raw.push(clip('start', first))
    heading = first
  }
  const moves: Shot[] = []
  let previous = from
  step.path.forEach((point, index) => {
    heading = pickHeading(point.x - previous.x, point.y - previous.y, heading)
    const ease = segmentEase(index, step.path.length)
    const { sheet, mirror } = viewSheet(step.gait, heading)
    const key = `${step.gait}@${heading}`
    moves.push({
      kind: 'move', sheet, reverse: false, mirror, enter: key, leave: key, fade: false, heading,
      ms: segmentDuration(world, previous, point, step.gait) * ease.stretch, target: point, ease: ease.timing, gait: step.gait,
    })
    previous = point
  })
  const period = stripMs(step.gait)
  const total = moves.reduce((sum, move) => sum + move.ms, 0)
  const fit = step.gait === 'walk' && period > 0 && total > 0 ? (Math.max(1, Math.round(total / period)) * period) / total : 1
  for (const move of moves) move.ms = Math.max(1, Math.round(move.ms * fit))
  raw.push(...moves)
  arrival = heading
  const face = settleFacing(world, step, arrival, look)
  if (step.gait === 'walk') raw.push(clip('start', arrival, true))
  raw.push(...turnShots(arrival, face, bone), ...entryShots(settle.pose, face, bone), loopShot(step, settle, face))
  return finish(raw, bearing, settle.pose, face)
}

function loopShot(step: HubertStep, settle: { pose: Pose; sheet: string }, face: number): Shot {
  const enter = `${settle.pose}@${face}`
  // the treat is eaten sitting; he ends close to, not exactly in, his sitting pose
  const leave = step.activity === 'eat' ? `eat@${face}` : enter
  const mirror = face === 4 && !LYING.includes(settle.pose)
  return { kind: 'loop', sheet: settle.sheet, reverse: false, mirror, enter, leave, fade: false, ms: step.stay, heading: face }
}

function finish(raw: Array<Shot | null>, bearing: Bearing, pose: Pose, face: number): Chain {
  const shots = raw.filter((shot): shot is Shot => shot !== null)
  let key = bearing.key
  for (const shot of shots) {
    shot.fade = shot.enter !== key
    key = shot.leave
  }
  return { shots, end: { pose, heading: face, key } }
}

export function chainMs(chain: Chain): number {
  return chain.shots.reduce((sum, shot) => sum + shot.ms, 0)
}

export interface HubertMoment {
  step: HubertStep
  index: number
  shot: Shot
  /** True while he covers ground (not while he gets up, turns, sets off or settles). */
  walking: boolean
}

/** Where Hubert is `elapsed` ms into a visit, transitions included. */
export function hubertAt(seed: number, world: HubertWorld, elapsed: number, look: number | null = null): HubertMoment {
  const random = createRandom(seed)
  let step = firstStep(world, random)
  let bearing = restingBearing()
  let from = step.at
  let index = 0
  let time = Math.max(0, elapsed)
  for (;;) {
    const chain = planChain(world, from, step, bearing, look)
    for (const shot of chain.shots) {
      if (time < shot.ms) return { step, index, shot, walking: shot.kind === 'move' }
      time -= shot.ms
    }
    bearing = chain.end
    from = step.at
    step = nextStep(world, from, step.activity, random)
    index++
  }
}
