import { describe, expect, it } from 'vitest'
import {
  BEG_MS, CLEARANCE, DEPTH_PACE, EAT_MS, FEED_CHEW_MS, FEEDING_FRESH_MS, GAIT_SPEED, STAY_MAX, STAY_MIN, createRandom, dogBox, feedingSteps, hubertTimeline,
  intersects, isFree, nextStep, pickFreePoint, planPath, scaleAt, segmentClear, segmentDuration, segmentEase, shouldAnimateFeeding, walkDuration,
  type HubertStep, type HubertWorld, type Point, type Rect,
} from './hubertRoutine'
import {
  HEADING_HYSTERESIS, chainMs, floorAngle, hubertAt, pickHeading, planChain, restingBearing, stripMs, turnHeadings, viewOf, type Bearing, type Shot,
} from './hubertMotion'

// A 1400 x 900 room: lane behind the table, floor to the left of it, table and notes blocked.
const table: Rect = { x: 260, y: 300, w: 720, h: 560 }
const notes: Rect = { x: 1000, y: 300, w: 360, h: 580 }
const topBar: Rect = { x: 0, y: 0, w: 1400, h: 56 }
const world: HubertWorld = {
  lane: { x: 16, y: 170, w: 1368, h: 112 },
  floor: [{ x: 16, y: 170, w: 220, h: 690 }],
  blocked: [table, notes, topBar],
  dog: { w: 160, h: 100 },
  basket: { x: 24, y: 178 },
  feed: { near: { x: 24, y: 740 }, far: { x: 540, y: 178 } },
}
const narrow: HubertWorld = { ...world, floor: [], lane: { x: 16, y: 170, w: 600, h: 112 }, feed: { near: { x: 300, y: 178 }, far: { x: 440, y: 178 } } }

function route(from: Point, path: readonly Point[]): Array<[Point, Point]> {
  const segments: Array<[Point, Point]> = []
  let previous = from
  for (const point of path) {
    segments.push([previous, point])
    previous = point
  }
  return segments
}

describe('hubertRoutine', () => {
  it('is deterministic for a seed', () => {
    expect(hubertTimeline(42, world, 25)).toEqual(hubertTimeline(42, world, 25))
    expect(hubertTimeline(42, world, 25)).not.toEqual(hubertTimeline(43, world, 25))
  })

  it('starts awake in the basket', () => {
    const [first] = hubertTimeline(7, world, 1)
    expect(first.activity).toBe('rest')
    expect(first.at).toEqual(world.basket)
    expect(first.path).toEqual([])
  })

  it('never stands on or walks across the table, the notes or the top bar', () => {
    for (const layout of [world, narrow]) {
      for (let seed = 1; seed <= 60; seed++) {
        const steps = hubertTimeline(seed, layout, 30)
        let from = steps[0].at
        for (const step of steps) {
          expect(isFree(layout, step.at), `seed ${seed} ${step.activity}`).toBe(true)
          for (const blocked of layout.blocked) expect(intersects(dogBox(layout, step.at), blocked, CLEARANCE)).toBe(false)
          for (const [a, b] of route(from, step.path)) expect(segmentClear(layout, a, b), `seed ${seed}`).toBe(true)
          if (step.path.length) expect(step.path[step.path.length - 1]).toEqual(step.at)
          from = step.at
        }
      }
    }
  })

  it('changes activity every 20 to 60 seconds and never repeats one back to back', () => {
    const steps = hubertTimeline(99, world, 200)
    for (const step of steps) {
      expect(step.stay).toBeGreaterThanOrEqual(STAY_MIN)
      expect(step.stay).toBeLessThanOrEqual(STAY_MAX)
    }
    for (let i = 1; i < steps.length; i++) expect(steps[i].activity).not.toBe(steps[i - 1].activity)
  })

  it('sleeps, rests and chews in the basket', () => {
    const steps = hubertTimeline(5, world, 120)
    for (const step of steps) {
      if (step.activity === 'sleep' || step.activity === 'rest' || step.activity === 'chew') expect(step.at).toEqual(world.basket)
      expect(step.gait).toBe('walk')
    }
    expect(new Set(steps.map(step => step.activity))).toEqual(new Set(['sleep', 'rest', 'chew', 'sniff', 'sit']))
  })

  it('also roams the floor beside the table when there is room', () => {
    const steps = hubertTimeline(3, world, 300)
    expect(steps.some(step => step.at.y > world.lane.y + world.lane.h)).toBe(true)
  })

  it('goes back along the lane instead of cutting across the table', () => {
    const from = { x: 40, y: 700 }
    const to = { x: 1100, y: 178 }
    expect(segmentClear(world, from, to)).toBe(false)
    const path = planPath(world, from, to)
    expect(path).not.toBeNull()
    for (const [a, b] of route(from, path!)) expect(segmentClear(world, a, b)).toBe(true)
  })

  it('returns to the basket when the floor has no free spot', () => {
    // Only the basket itself is left free.
    const crowded: HubertWorld = { ...narrow, basket: { x: 16, y: 178 }, blocked: [...narrow.blocked, { x: 184, y: 160, w: 500, h: 200 }] }
    expect(pickFreePoint(crowded, createRandom(1))).toBeNull()
    const random = createRandom(2)
    for (let i = 0; i < 20; i++) {
      const step = nextStep(crowded, crowded.basket, 'sleep', random)
      if (step.activity === 'sniff' || step.activity === 'sit') throw new Error('should have fallen back to the basket')
      expect(isFree(crowded, step.at)).toBe(true)
    }
  })

  it('tells where he is at a given moment of the visit, transitions included', () => {
    const steps = hubertTimeline(11, world, 3)
    const first = planChain(world, world.basket, steps[0], restingBearing())
    expect(chainMs(first)).toBe(steps[0].stay)
    expect(hubertAt(11, world, 0)).toMatchObject({ index: 0, walking: false, step: steps[0] })
    const second = planChain(world, steps[0].at, steps[1], first.end)
    let t = steps[0].stay
    for (const shot of second.shots) {
      const at = hubertAt(11, world, t + 1)
      expect(at.index).toBe(1)
      expect(at.shot).toEqual(shot)
      expect(at.walking).toBe(shot.kind === 'move')
      t += shot.ms
    }
    expect(hubertAt(11, world, t + 1).index).toBe(2)
    // getting up, turning, setting off, pulling up and settling all take time on top of the walk and the stay
    const moving = second.shots.filter(shot => shot.kind === 'move').reduce((sum, shot) => sum + shot.ms, 0)
    if (steps[1].path.length) expect(chainMs(second)).toBeGreaterThan(steps[1].stay + moving)
  })

  it('walks at a pace that grows with his size and trots twice as fast', () => {
    const path = [{ x: 524, y: 178 }]
    // 5 dog heights along the lane
    expect(walkDuration(world, world.basket, path)).toBe(Math.round(5_000 / GAIT_SPEED.walk))
    expect(walkDuration(world, world.basket, path, 'run')).toBeLessThan(walkDuration(world, world.basket, path) / 2)
    const big = { ...world, dog: { w: 320, h: 200 } }
    expect(walkDuration(big, world.basket, path)).toBe(Math.round(2_500 / GAIT_SPEED.walk))
  })

  it('eases in and out of a walk without a jump in speed where eased and even stretches meet', () => {
    const bezier = (timing: string) => timing.match(/[\d.]+/g)!.map(Number)
    expect(segmentEase(1, 3)).toEqual({ timing: 'linear', stretch: 1 })
    const [, , x2, y2] = bezier(segmentEase(0, 3).timing)
    expect((1 - y2) / (1 - x2)).toBeCloseTo(segmentEase(0, 3).stretch, 5)
    const [x1, y1] = bezier(segmentEase(2, 3).timing)
    expect(y1 / x1).toBeCloseTo(segmentEase(2, 3).stretch, 5)
    const both = segmentEase(0, 1)
    const [a, , b] = bezier(both.timing)
    // peak slope of a symmetric ease at its midpoint: dy/dt = 1.5, dx/dt = 3 * (a/4 + (b - a)/2 + (1 - b)/4)
    expect(1.5 / (3 * (a / 4 + (b - a) / 2 + (1 - b) / 4))).toBeCloseTo(both.stretch, 1)
  })

  function checkSteps(layout: HubertWorld, from: Point, steps: readonly HubertStep[]) {
    let at = from
    for (const step of steps) {
      expect(isFree(layout, step.at)).toBe(true)
      for (const blocked of layout.blocked) expect(intersects(dogBox(layout, step.at), blocked, CLEARANCE)).toBe(false)
      for (const [a, b] of route(at, step.path)) expect(segmentClear(layout, a, b)).toBe(true)
      at = step.at
    }
  }

  it('trots to the caller\'s side of the table, begs, eats the treat and wags', () => {
    for (const side of ['near', 'far'] as const) {
      const steps = feedingSteps(world, world.basket, side, 'treat')
      expect(steps.map(step => step.activity)).toEqual(['beg', 'eat', 'beg'])
      expect(steps[0].gait).toBe('run')
      expect(steps[0].at).toEqual(world.feed[side])
      expect(steps[0].stay).toBe(BEG_MS)
      expect(steps[1].stay).toBe(EAT_MS)
      expect(steps[1].path).toEqual([])
      checkSteps(world, world.basket, steps)
    }
    expect(feedingSteps(world, world.basket, 'near', 'treat')[0].at).not.toEqual(feedingSteps(world, world.basket, 'far', 'treat')[0].at)
  })

  it('carries a meat bone back to his basket and chews it there', () => {
    const from = { x: 900, y: 178 }
    const steps = feedingSteps(world, from, 'near', 'bone')
    expect(steps.map(step => [step.activity, step.gait])).toEqual([['beg', 'run'], ['chew', 'carry']])
    expect(steps[1].at).toEqual(world.basket)
    expect(steps[1].stay).toBe(FEED_CHEW_MS)
    checkSteps(world, from, steps)
  })

  it('never covers the table when called, even when the wanted spot is not free', () => {
    const crowded: HubertWorld = { ...world, feed: { near: { x: 300, y: 500 }, far: { x: 1100, y: 400 } } }
    for (const side of ['near', 'far'] as const) {
      for (const kind of ['treat', 'bone'] as const) checkSteps(crowded, { x: 600, y: 178 }, feedingSteps(crowded, { x: 600, y: 178 }, side, kind))
    }
    for (const side of ['near', 'far'] as const) checkSteps(narrow, narrow.basket, feedingSteps(narrow, narrow.basket, side, 'bone'))
  })

  it('grows as he comes nearer when the floor recedes', () => {
    const deep: HubertWorld = { ...world, depth: { y0: 170, y1: 760, s0: 0.5, s1: 1 } }
    expect(scaleAt(world, 500)).toBe(1)
    expect(scaleAt(deep, 100)).toBe(0.5)
    expect(scaleAt(deep, 465)).toBeCloseTo(0.75)
    expect(scaleAt(deep, 900)).toBe(1)
    expect(dogBox(deep, { x: 24, y: 170 })).toEqual({ x: 24, y: 170, w: 80, h: 50 })
    expect(dogBox(deep, { x: 24, y: 760 })).toEqual({ x: 24, y: 760, w: 160, h: 100 })
    for (let seed = 1; seed <= 20; seed++) {
      for (const step of hubertTimeline(seed, deep, 20)) expect(isFree(deep, step.at)).toBe(true)
    }
  })

  it('acts out a feeding once and only while it is fresh', () => {
    const now = Date.UTC(2026, 9, 6, 12)
    const last = { id: 'f1', at: new Date(now - 5_000).toISOString() }
    expect(shouldAnimateFeeding(last, null, now)).toBe(true)
    expect(shouldAnimateFeeding(last, 'f1', now)).toBe(false)
    expect(shouldAnimateFeeding(null, null, now)).toBe(false)
    expect(shouldAnimateFeeding({ id: 'f2', at: new Date(now - FEEDING_FRESH_MS - 1).toISOString() }, 'f1', now)).toBe(false)
    expect(shouldAnimateFeeding({ id: 'f3', at: new Date(now + 10_000).toISOString() }, null, now)).toBe(true)
    expect(shouldAnimateFeeding({ id: 'f4', at: new Date(now + 60_000).toISOString() }, null, now)).toBe(false)
    expect(shouldAnimateFeeding({ id: 'f5', at: 'not a date' }, null, now)).toBe(false)
  })
})

/** dx, dy on screen for a stretch at `deg` on the floor. */
function onFloor(deg: number, length = 100): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [Math.cos(rad) * length, -Math.sin(rad) * length * DEPTH_PACE]
}

function playChains(steps: readonly HubertStep[], start: Point, look: number | null, bearing: Bearing = restingBearing()): Shot[] {
  const shots: Shot[] = []
  let from = start
  let current = bearing
  for (const step of steps) {
    const chain = planChain(world, from, step, current, look)
    // every strip that does not fade in starts in exactly the pose the previous one ended in
    let key = current.key
    for (const shot of chain.shots) {
      if (!shot.fade) expect(shot.enter).toBe(key)
      key = shot.leave
    }
    shots.push(...chain.shots)
    current = chain.end
    from = step.at
  }
  return shots
}

const label = (shot: Shot) => `${shot.kind}:${shot.sheet}${shot.reverse ? '<' : ''}`

describe('hubertMotion', () => {
  it('picks the nearest of eight floor headings and mirrors the west-going views', () => {
    expect(pickHeading(...onFloor(0), null)).toBe(0)
    expect(pickHeading(...onFloor(45), null)).toBe(1)
    expect(pickHeading(...onFloor(90), null)).toBe(2)
    expect(pickHeading(...onFloor(180), null)).toBe(4)
    expect(pickHeading(...onFloor(225), null)).toBe(5)
    expect(pickHeading(0, 100, null)).toBe(6)
    // a stretch up the screen is a walk away from the viewer, down the screen one towards him
    expect(viewOf(2)).toEqual({ view: 'n', mirror: false })
    expect(viewOf(6)).toEqual({ view: 's', mirror: false })
    expect(viewOf(0)).toEqual({ view: 'e', mirror: false })
    expect(viewOf(4)).toEqual({ view: 'e', mirror: true })
    expect(viewOf(3)).toEqual({ view: 'ne', mirror: true })
    expect(viewOf(5)).toEqual({ view: 'se', mirror: true })
    expect(viewOf(7)).toEqual({ view: 'se', mirror: false })
    expect(floorAngle(...onFloor(30))).toBeCloseTo(30, 6)
  })

  it('keeps his heading near a sector border so the view never flickers', () => {
    expect(pickHeading(...onFloor(25), null)).toBe(1)
    expect(pickHeading(...onFloor(25), 0)).toBe(0)
    expect(pickHeading(...onFloor(22.5 + HEADING_HYSTERESIS - 1), 0)).toBe(0)
    expect(pickHeading(...onFloor(22.5 + HEADING_HYSTERESIS + 1), 0)).toBe(1)
    expect(pickHeading(...onFloor(20), 1)).toBe(1)
    let heading = 0
    for (const deg of [20, 25, 21, 31, 22, 33, 18, 340]) {
      heading = pickHeading(...onFloor(deg), heading)
      expect(heading).toBe(0)
    }
    expect(pickHeading(0.4, 0.3, 5)).toBe(5)
  })

  it('turns on the spot 45 degrees at a time, a half turn round by the front', () => {
    expect(turnHeadings(0, 2)).toEqual([1, 2])
    expect(turnHeadings(2, 0)).toEqual([1, 0])
    expect(turnHeadings(0, 4)).toEqual([7, 6, 5, 4])
    expect(turnHeadings(4, 0)).toEqual([5, 6, 7, 0])
    expect(turnHeadings(3, 3)).toEqual([])
  })

  it('covers fewer pixels a second walking into the room than across it', () => {
    const across = segmentDuration(world, { x: 24, y: 178 }, { x: 124, y: 178 })
    const away = segmentDuration(world, { x: 24, y: 278 }, { x: 24, y: 178 })
    expect(away).toBeCloseTo(across / DEPTH_PACE, 6)
  })

  it('rounds the corners of a route round the table into 45-degree turns', () => {
    const from = { x: 40, y: 700 }
    const path = planPath(world, from, { x: 1100, y: 178 })!
    expect(path.length).toBeGreaterThan(2)
    let previous = from
    let heading: number | null = null
    for (const point of path) {
      const next = Math.round(floorAngle(point.x - previous.x, point.y - previous.y) / 45) % 8
      if (heading !== null) expect(Math.min((next - heading + 8) % 8, (heading - next + 8) % 8)).toBeLessThanOrEqual(1)
      heading = next
      previous = point
    }
  })

  it('chains up from sitting, a turn, setting off, the walk, pulling up and lying down in the basket', () => {
    const from = { x: 600, y: 178 }
    const step: HubertStep = { activity: 'rest', at: world.basket, path: planPath(world, from, world.basket)!, stay: 30_000, gait: 'walk' }
    const chain = planChain(world, from, step, { pose: 'sit', heading: 4, key: 'sit@4' }, 700)
    const names = chain.shots.map(label)
    expect(names[0]).toBe('clip:sit-down<')
    const start = names.findIndex(name => name.startsWith('clip:start') && !name.endsWith('<'))
    const stop = names.findIndex(name => name.startsWith('clip:start') && name.endsWith('<'))
    const firstMove = names.findIndex(name => name.startsWith('move:'))
    expect(start).toBeGreaterThan(0)
    expect(firstMove).toBe(start + 1)
    expect(stop).toBeGreaterThan(firstMove)
    expect(names.slice(-2)).toEqual(['clip:lie-down', 'loop:rest'])
    // the walk takes whole gait cycles, so pulling up starts from the stride it was rendered from
    const walking = chain.shots.filter(shot => shot.kind === 'move').reduce((sum, shot) => sum + shot.ms, 0)
    expect(Math.abs(walking / stripMs('walk') - Math.round(walking / stripMs('walk')))).toBeLessThan(0.02)
    // the only fades: turning on the spot, a new heading while walking, stepping into the basket
    for (const shot of chain.shots.filter(item => item.fade)) expect(shot.kind === 'hold' || shot.kind === 'move' || shot.sheet === 'lie-down', label(shot)).toBe(true)
    expect(chain.end).toEqual({ pose: 'lie', heading: 0, key: 'lie@0' })
  })

  it('acts out a treat visit: get up, run, sit facing the board, beg, eat, beg again', () => {
    const shots = playChains(feedingSteps(world, world.basket, 'far', 'treat'), world.basket, 700)
    expect(shots.filter(shot => shot.kind === 'clip' || shot.kind === 'loop').map(label)).toEqual([
      'clip:get-up', 'clip:sit-down', 'clip:beg-up', 'loop:beg', 'clip:beg-up<', 'loop:eat', 'clip:beg-up', 'loop:beg',
    ])
    expect(shots.filter(shot => shot.kind === 'move').every(shot => shot.gait === 'run')).toBe(true)
    expect(shots.filter(shot => shot.kind === 'loop').every(shot => !shot.mirror)).toBe(true)
  })

  it('carries a bone home and lies down with it', () => {
    const shots = playChains(feedingSteps(world, { x: 900, y: 178 }, 'near', 'bone'), { x: 900, y: 178 }, 700, { pose: 'stand', heading: 4, key: 'stand@4' })
    const names = shots.map(label)
    expect(names.slice(-2)).toEqual(['clip:lie-down-bone', 'loop:chew'])
    expect(shots.filter(shot => shot.kind === 'move' && shot.gait === 'carry').length).toBeGreaterThan(0)
  })

  it('never cuts from one pose to another across a long routine', () => {
    const fading = new Set<string>()
    for (let seed = 1; seed <= 20; seed++) {
      const steps = hubertTimeline(seed, world, 25)
      for (const shot of playChains(steps.slice(1), steps[0].at, 700)) if (shot.fade && shot.kind !== 'hold' && shot.kind !== 'move') fading.add(shot.sheet)
    }
    // the only strips that fade in: stepping into the basket, the bone or the doze after chewing, setting off out of it
    for (const sheet of fading) expect(['lie-down', 'get-up', 'doze', 'start', 'chew', 'rest']).toContain(sheet)
  })
})
