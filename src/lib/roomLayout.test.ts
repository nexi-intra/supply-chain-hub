import { describe, expect, it } from 'vitest'
import {
  CLEARANCE, dogBox, feedingSteps, hubertTimeline, intersects, isFree, scaleAt, segmentClear, sizeAt, walkDuration,
  type HubertStep, type HubertWorld, type Point, type Rect,
} from './hubertRoutine'
import { EDGE, MIN_CORNER_DOG_H, roomLayout, type RoomRects } from './roomLayout'

const ASPECT = 400 / 280

// A 1440 x 900 window: top bar, walkway, a floor corner on the left and the table to its right.
const topbarControls: Rect[] = [{ x: 16, y: 7, w: 150, h: 34 }, { x: 1290, y: 7, w: 130, h: 34 }]
const table: Rect = { x: 408, y: 195, w: 1008, h: 705 }
const wordRoom: RoomRects = {
  width: 1440,
  bottom: 900,
  lane: { x: 0, y: 48, w: 1440, h: 147 },
  table,
  corner: { x: 24, y: 195, w: 384, h: 705 },
  board: { x: 450, y: 211, w: 545, h: 545 },
  play: { x: 428, y: 211, w: 617, h: 680 },
  obstacles: [{ x: 520, y: 770, w: 360, h: 60 }, { x: 1065, y: 211, w: 331, h: 680 }, ...topbarControls],
}
const chessRoom: RoomRects = { ...wordRoom, board: { x: 560, y: 240, w: 380, h: 380 }, obstacles: [{ x: 1065, y: 211, w: 331, h: 680 }, ...topbarControls] }

function route(from: Point, path: readonly Point[]): Array<[Point, Point]> {
  const segments: Array<[Point, Point]> = []
  let previous = from
  for (const point of path) {
    segments.push([previous, point])
    previous = point
  }
  return segments
}

function checkSteps(world: HubertWorld, from: Point, steps: readonly HubertStep[]) {
  let at = from
  for (const step of steps) {
    expect(isFree(world, step.at), `${step.activity} at ${JSON.stringify(step.at)}`).toBe(true)
    for (const blocked of world.blocked) expect(intersects(dogBox(world, step.at), blocked, CLEARANCE)).toBe(false)
    for (const [a, b] of route(at, step.path)) expect(segmentClear(world, a, b), `${JSON.stringify(a)} -> ${JSON.stringify(b)}`).toBe(true)
    at = step.at
  }
}

describe('roomLayout', () => {
  it('gives Hubert a corner beside the table where he is large, and the walkway where he is smaller', () => {
    const layout = roomLayout(wordRoom, ASPECT)
    const world = layout.world!
    expect(world).not.toBeNull()
    expect(world.depth).toBeDefined()
    expect(layout.dog.h).toBeGreaterThanOrEqual(200)
    expect(layout.dog.w).toBeLessThanOrEqual(table.x - CLEARANCE - EDGE)
    for (const spot of [world.basket, world.feed.near, world.feed.far]) expect(isFree(world, spot), JSON.stringify(spot)).toBe(true)
    expect(scaleAt(world, world.feed.near.y)).toBe(1)
    expect(scaleAt(world, world.feed.far.y)).toBeLessThan(0.8)
    expect(layout.basketScale).toBeGreaterThan(scaleAt(world, world.feed.far.y))
    expect(layout.basketScale).toBeLessThan(1)
  })

  it('calls him to the viewer\'s side: right beside the near end of the table, feet at the bottom of the window', () => {
    const world = roomLayout(wordRoom, ASPECT).world!
    const box = dogBox(world, world.feed.near)
    expect(box.y + box.h).toBe(wordRoom.bottom - CLEARANCE)
    expect(table.x - (box.x + box.w)).toBeLessThanOrEqual(CLEARANCE + 2)
    expect(table.x - (box.x + box.w)).toBeGreaterThan(CLEARANCE - 1)
  })

  it('sends him behind the board for the opponent, whatever the board\'s size', () => {
    for (const rects of [wordRoom, chessRoom]) {
      const layout = roomLayout(rects, ASPECT)
      const far = dogBox(layout.world!, layout.world!.feed.far)
      expect(layout.lookAt).toBe(Math.round(rects.board.x + rects.board.w / 2))
      expect(Math.abs(far.x + far.w / 2 - layout.lookAt)).toBeLessThan(far.w * 0.5)
      expect(far.y + far.h).toBeLessThanOrEqual(rects.lane.y + rects.lane.h)
    }
  })

  it('keeps every routine and every feeding clear of the board, tray, panels, table and top bar', () => {
    for (const rects of [wordRoom, chessRoom]) {
      const world = roomLayout(rects, ASPECT).world!
      for (let seed = 1; seed <= 40; seed++) {
        const steps = hubertTimeline(seed, world, 25)
        checkSteps(world, steps[0].at, steps)
      }
      for (const side of ['near', 'far'] as const) {
        for (const kind of ['treat', 'bone'] as const) {
          checkSteps(world, world.basket, feedingSteps(world, world.basket, side, kind))
          checkSteps(world, world.feed.far, feedingSteps(world, world.feed.far, side, kind))
        }
      }
    }
  })

  it('reaches the near spot by the walkway and the corner, never across the table', () => {
    const world = roomLayout(wordRoom, ASPECT).world!
    const [run] = feedingSteps(world, world.feed.far, 'near', 'treat')
    expect(run.at).toEqual(world.feed.near)
    expect(run.path.length).toBeGreaterThan(1)
  })

  it('covers ground at a pace that matches his size where he walks', () => {
    const world = roomLayout(wordRoom, ASPECT).world!
    const far = world.feed.far
    const near = world.feed.near
    const step = 120
    expect(walkDuration(world, far, [{ x: far.x - step, y: far.y }])).toBeGreaterThan(walkDuration(world, near, [{ x: near.x - step, y: near.y }]))
    expect(sizeAt(world, near.y).h).toBe(world.dog.h)
  })

  it('stays on the walkway at one size when the room leaves no corner', () => {
    const layout = roomLayout({ ...wordRoom, corner: null }, ASPECT)
    const world = layout.world!
    expect(world.depth).toBeUndefined()
    expect(layout.basketScale).toBe(1)
    expect(world.basket.y + world.dog.h).toBeLessThanOrEqual(wordRoom.lane.y + wordRoom.lane.h - CLEARANCE)
    for (const spot of [world.basket, world.feed.near, world.feed.far]) expect(isFree(world, spot)).toBe(true)
  })

  it('treats a corner too narrow for a dog as no corner', () => {
    const tight = { ...wordRoom, corner: { x: 24, y: 195, w: 120, h: 705 }, table: { ...table, x: 144, w: 1272 } }
    expect(MIN_CORNER_DOG_H * ASPECT).toBeGreaterThan(tight.table.x - tight.corner.x)
    expect(roomLayout(tight, ASPECT).world?.depth).toBeUndefined()
  })

  it('lets him nap in the basket when the room is too small to roam', () => {
    const tiny = roomLayout({ ...wordRoom, width: 300, corner: null, lane: { x: 0, y: 48, w: 300, h: 147 } }, ASPECT)
    expect(tiny.world).toBeNull()
    expect(tiny.basket).toEqual({ x: EDGE, y: expect.any(Number) })
  })

  it('shows the props only when the board leaves room beside it', () => {
    expect(roomLayout(wordRoom, ASPECT).wings).toBe(false)
    expect(roomLayout({ ...wordRoom, play: { ...wordRoom.play, w: 760 } }, ASPECT).wings).toBe(true)
  })
})
