// Hubert, the golden retriever who lives in the board-game room. His routine is a pure, seeded
// function so it can be tested: he only ever stands on free floor and never on the table or the notes.

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }

export type HubertActivity = 'sleep' | 'rest' | 'chew' | 'sniff' | 'sit' | 'beg' | 'eat'
/** How he moves along a path: an amble, a happy trot to the table, or walking with a bone in his mouth. */
export type HubertGait = 'walk' | 'run' | 'carry'
export type HubertFood = 'treat' | 'bone'
/** The viewer sits at the near side of the table, the opponent across it. */
export type TableSide = 'near' | 'far'

/**
 * The floor recedes: his box is drawn at scale `s0` when its top edge is at `y0` (far, behind the table)
 * and `s1` at `y1` (near the viewer), linearly in between and clamped outside.
 */
export interface HubertDepth { y0: number; y1: number; s0: number; s1: number }

export interface HubertWorld {
  /** Floor strip behind the table. */
  lane: Rect
  /** More floor he may roam, such as the corner beside the table. */
  floor: Rect[]
  /** Interactive parts of the room he must never stand on (table, notes, top bar). */
  blocked: Rect[]
  /** His box at scale 1; every position is the top-left corner of the (scaled) box. */
  dog: Size
  /** Without depth he has the same size everywhere. */
  depth?: HubertDepth
  /** He sleeps, rests and chews in his basket. */
  basket: Point
  /** Where he sits and begs when a player calls him. */
  feed: Record<TableSide, Point>
}

export interface HubertStep {
  activity: HubertActivity
  /** Where he settles for the activity. */
  at: Point
  /** Points he walks through, ending at `at`; empty when he stays where he is. */
  path: Point[]
  /** How long the activity lasts after he arrives, in ms. */
  stay: number
  gait: HubertGait
}

export const STAY_MIN = 20_000
export const STAY_MAX = 60_000
/** Speeds in dog heights per second: the on-screen speed of a planted paw in the rendered cycles (hubert.py --mode gait). */
export const GAIT_SPEED: Record<HubertGait, number> = { walk: 0.55, run: 1.3, carry: 0.55 }
/**
 * Screen distance per floor distance when he walks into or out of the room instead of across it. The sprites' own
 * camera would give 0.24 (paws in the back and front views barely move up the frame), but the room plate is far
 * deeper than that camera, so he would crawl; 0.5 keeps the slide of a planted paw to a couple of pixels.
 */
export const DEPTH_PACE = 0.5
/** Gap kept between Hubert and anything interactive. */
export const CLEARANCE = 8
/** Feeding: begging on arrival, the treat itself, the thank-you wag, and a bone chewed in the basket. */
export const BEG_MS = 1600
export const EAT_MS = 1400
export const THANKS_MS = 2600
export const FEED_CHEW_MS = 40_000
/** A feeding older than this is history when the match is opened, not something to act out. */
export const FEEDING_FRESH_MS = 120_000

const WEIGHTS: Record<'sleep' | 'rest' | 'chew' | 'sniff' | 'sit', number> = { sleep: 3, rest: 2, chew: 2, sniff: 2, sit: 2 }
const ACTIVITIES = Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>
const IN_BASKET: readonly HubertActivity[] = ['sleep', 'rest', 'chew']

/** mulberry32: small, fast and good enough for a dog. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function intersects(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin
}

function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

export function scaleAt(world: Pick<HubertWorld, 'depth'>, y: number): number {
  const depth = world.depth
  if (!depth) return 1
  if (depth.y1 === depth.y0) return depth.s1
  const t = Math.min(1, Math.max(0, (y - depth.y0) / (depth.y1 - depth.y0)))
  return depth.s0 + (depth.s1 - depth.s0) * t
}

export function sizeAt(world: Pick<HubertWorld, 'depth' | 'dog'>, y: number): Size {
  const scale = scaleAt(world, y)
  return { w: world.dog.w * scale, h: world.dog.h * scale }
}

export function dogBox(world: HubertWorld, at: Point): Rect {
  const size = sizeAt(world, at.y)
  return { x: at.x, y: at.y, w: size.w, h: size.h }
}

/** The lowest top edge at which his box still fits above `bottom`. */
function lowestTop(world: HubertWorld, top: number, bottom: number): number {
  let low = top
  let high = bottom
  if (low + sizeAt(world, low).h > bottom) return top
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2
    if (mid + sizeAt(world, mid).h <= bottom) low = mid
    else high = mid
  }
  return Math.floor(low)
}

function walkable(world: HubertWorld): Rect[] {
  return [world.lane, ...world.floor]
}

/** True when his whole box lies on one piece of floor and clear of everything interactive. */
export function isFree(world: HubertWorld, at: Point): boolean {
  const box = dogBox(world, at)
  if (!walkable(world).some(rect => contains(rect, box))) return false
  return !world.blocked.some(rect => intersects(box, rect, CLEARANCE))
}

export function segmentClear(world: HubertWorld, from: Point, to: Point): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 6))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (!isFree(world, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })) return false
  }
  return true
}

function laneY(world: HubertWorld, y: number): number {
  const top = world.lane.y
  const bottom = lowestTop(world, top, world.lane.y + world.lane.h)
  return Math.min(Math.max(y, top), Math.max(top, bottom))
}

/** A clear route: straight if possible, otherwise back along the lane behind the table. */
export function planPath(world: HubertWorld, from: Point, to: Point): Point[] | null {
  if (from.x === to.x && from.y === to.y) return []
  if (segmentClear(world, from, to)) return [to]
  const points = [from, { x: from.x, y: laneY(world, from.y) }, { x: to.x, y: laneY(world, to.y) }, to]
    .filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y)
  for (let i = 1; i < points.length; i++) {
    if (!segmentClear(world, points[i - 1], points[i])) return null
  }
  return roundCorners(world, points).slice(1)
}

/** Length on the floor: a stretch into the room covers more floor than the same pixels across it. */
export function floorLength(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, (to.y - from.y) / DEPTH_PACE)
}

/**
 * Cuts every corner of a route with a short diagonal where the floor is clear, so he turns in two gentle steps
 * of 45 degrees on the floor instead of one sharp right angle.
 */
export function roundCorners(world: HubertWorld, points: readonly Point[]): Point[] {
  const out: Point[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]
    const c = points[i]
    const b = points[i + 1]
    const inLeg = floorLength(a, c)
    const outLeg = floorLength(c, b)
    let cut: Point[] | null = null
    for (const share of [1, 0.6, 0.35]) {
      const r = Math.min(inLeg * 0.45, outLeg * 0.45, sizeAt(world, c.y).h * 0.9) * share
      if (r < 4) break
      const c1 = { x: Math.round(c.x + ((a.x - c.x) * r) / inLeg), y: Math.round(c.y + ((a.y - c.y) * r) / inLeg) }
      const c2 = { x: Math.round(c.x + ((b.x - c.x) * r) / outLeg), y: Math.round(c.y + ((b.y - c.y) * r) / outLeg) }
      if (segmentClear(world, a, c1) && segmentClear(world, c1, c2) && segmentClear(world, c2, b)) {
        cut = [c1, c2]
        break
      }
    }
    out.push(...(cut ?? [c]))
  }
  out.push(points[points.length - 1])
  return out
}

export function pathLength(from: Point, path: readonly Point[]): number {
  let length = 0
  let previous = from
  for (const point of path) {
    length += Math.hypot(point.x - previous.x, point.y - previous.y)
    previous = point
  }
  return length
}

/** Milliseconds for one straight stretch; he covers floor at a pace that matches his size there. */
export function segmentDuration(world: HubertWorld, from: Point, to: Point, gait: HubertGait = 'walk'): number {
  const height = Math.max(1, sizeAt(world, (from.y + to.y) / 2).h)
  return (floorLength(from, to) / (GAIT_SPEED[gait] * height)) * 1000
}

/**
 * CSS easing for stretch `index` of a path of `count` stretches: he sets off and pulls up gently and
 * walks at an even pace in between. `stretch` lengthens an eased stretch so his top speed stays the
 * pace his paws are drawn at, and the speed is continuous where an eased stretch meets a linear one.
 */
export function segmentEase(index: number, count: number): { timing: string; stretch: number } {
  const first = index === 0
  const last = index === count - 1
  if (first && last) return { timing: 'cubic-bezier(0.35, 0, 0.65, 1)', stretch: 1.54 }
  if (first) return { timing: 'cubic-bezier(0.35, 0, 0.6, 0.5)', stretch: 1.25 }
  if (last) return { timing: 'cubic-bezier(0.4, 0.5, 0.65, 1)', stretch: 1.25 }
  return { timing: 'linear', stretch: 1 }
}

export function walkDuration(world: HubertWorld, from: Point, path: readonly Point[], gait: HubertGait = 'walk'): number {
  let ms = 0
  let previous = from
  for (const point of path) {
    ms += segmentDuration(world, previous, point, gait)
    previous = point
  }
  return Math.round(ms)
}

/** A random free spot to sniff or sit, or null when the floor is too crowded. */
export function pickFreePoint(world: HubertWorld, random: () => number, tries = 30): Point | null {
  const rects = walkable(world).filter(rect => {
    const size = sizeAt(world, rect.y)
    return rect.w >= size.w && rect.h >= size.h
  })
  const area = rects.reduce((sum, rect) => sum + rect.w * rect.h, 0)
  if (area === 0) return null
  for (let i = 0; i < tries; i++) {
    let pick = random() * area
    const rect = rects.find(candidate => (pick -= candidate.w * candidate.h) < 0) ?? rects[rects.length - 1]
    const y = Math.round(rect.y + random() * (lowestTop(world, rect.y, rect.y + rect.h) - rect.y))
    const at = { x: Math.round(rect.x + random() * (rect.w - sizeAt(world, y).w)), y }
    if (isFree(world, at)) return at
  }
  return null
}

function chooseActivity(previous: HubertActivity | null, random: () => number): keyof typeof WEIGHTS {
  const options = ACTIVITIES.filter(activity => activity !== previous)
  const total = options.reduce((sum, activity) => sum + WEIGHTS[activity], 0)
  let pick = random() * total
  return options.find(activity => (pick -= WEIGHTS[activity]) < 0) ?? options[options.length - 1]
}

function stayFor(random: () => number): number {
  return Math.round(STAY_MIN + random() * (STAY_MAX - STAY_MIN))
}

/** What Hubert does next, starting from where he is now. */
export function nextStep(world: HubertWorld, from: Point, previous: HubertActivity | null, random: () => number): HubertStep {
  const activity = chooseActivity(previous, random)
  const stay = stayFor(random)
  const target = IN_BASKET.includes(activity) ? world.basket : pickFreePoint(world, random)
  if (target) {
    const path = planPath(world, from, target)
    if (path) return { activity, at: target, path, stay, gait: 'walk' }
  }
  // No clear way to the chosen spot: he goes back to his basket (or simply appears there).
  return { activity: 'rest', at: world.basket, path: planPath(world, from, world.basket) ?? [], stay, gait: 'walk' }
}

/** The first step of a visit: awake in his basket, looking around. */
export function firstStep(world: HubertWorld, random: () => number): HubertStep {
  return { activity: 'rest', at: world.basket, path: [], stay: stayFor(random), gait: 'walk' }
}

export function hubertTimeline(seed: number, world: HubertWorld, count: number): HubertStep[] {
  const random = createRandom(seed)
  const steps = [firstStep(world, random)]
  while (steps.length < count) {
    const last = steps[steps.length - 1]
    steps.push(nextStep(world, last.at, last.activity, random))
  }
  return steps
}

/** The free spot closest to `wanted` along a straight line from his basket; the basket when nothing is free. */
function nearestFree(world: HubertWorld, wanted: Point): Point {
  if (isFree(world, wanted)) return wanted
  const { basket } = world
  for (let t = 0.9; t > 0; t -= 0.1) {
    const at = { x: Math.round(basket.x + (wanted.x - basket.x) * t), y: Math.round(basket.y + (wanted.y - basket.y) * t) }
    if (isFree(world, at)) return at
  }
  return basket
}

/**
 * A player called him: he trots to that player's side of the table and begs. A treat is eaten on the
 * spot followed by a thank-you wag; a meat bone is carried to his basket and chewed for a while.
 * Afterwards the normal routine continues from where the last step leaves him.
 */
export function feedingSteps(world: HubertWorld, from: Point, side: TableSide, kind: HubertFood): HubertStep[] {
  const spot = nearestFree(world, world.feed[side])
  const run = planPath(world, from, spot)
  // When there is no clear way he does not cut across the table; he simply turns up at the spot.
  const steps: HubertStep[] = [{ activity: 'beg', at: spot, path: run ?? [], stay: BEG_MS, gait: 'run' }]
  if (kind === 'treat') {
    steps.push(
      { activity: 'eat', at: spot, path: [], stay: EAT_MS, gait: 'walk' },
      { activity: 'beg', at: spot, path: [], stay: THANKS_MS, gait: 'walk' },
    )
  } else {
    steps.push({ activity: 'chew', at: world.basket, path: planPath(world, spot, world.basket) ?? [], stay: FEED_CHEW_MS, gait: 'carry' })
  }
  return steps
}

export interface FeedingRecord { id: string; at: string }

/** Act out a feeding only once, and only when it happened in the last two minutes (stale ones are history). */
export function shouldAnimateFeeding(last: FeedingRecord | null, seenId: string | null, now: number): boolean {
  if (!last || last.id === seenId) return false
  const at = Date.parse(last.at)
  if (!Number.isFinite(at)) return false
  const age = now - at
  // A little clock skew between two machines is fine; a feeding from the future is not.
  return age < FEEDING_FRESH_MS && age > -30_000
}
