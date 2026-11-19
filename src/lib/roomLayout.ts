// Where Hubert may walk in the board-game room, worked out from the measured slots (any board size or
// shape). Pure so it can be tested; useRoomLayout feeds it the rectangles.
import { CLEARANCE, isFree, scaleAt, type HubertWorld, type Point, type Rect, type Size } from './hubertRoutine'

export interface RoomRects {
  width: number
  /** Bottom of the part of the room that is on screen. */
  bottom: number
  /** Walkway between the top bar and the table's far edge. */
  lane: Rect
  table: Rect
  /** Floor the room leaves free beside the table for his corner, or null when there is none. */
  corner: Rect | null
  /** The game's board; he faces its centre when he sits down. */
  board: Rect
  /** The column the board stands in; spare room beside the board holds the props. */
  play: Rect
  /** Everything else he must keep clear of: tray, panels, top-bar controls. */
  obstacles: Rect[]
}

export interface RoomLayout {
  /** null when the room is too small for him to roam; he then naps in his basket. */
  world: HubertWorld | null
  basket: Point
  /** Scale he is drawn at in the basket. */
  basketScale: number
  /** His box at scale 1. */
  dog: Size
  lookAt: number
  /** The play column has room beside the board for the mug and the bag. */
  wings: boolean
}

export const EDGE = 8
/** Right beside the viewer he stands this tall, as a share of the visible room. */
export const NEAR_SHARE = 0.3
export const MAX_DOG_H = 300
/** A corner narrower than this is no place for a golden retriever. */
export const MIN_CORNER_DOG_H = 120
/** Free width beside the board, right of it, that the props need. */
export const WING = 112
/** How far down the corner his basket stands (0 = the walkway, 1 = right by the viewer). */
export const BASKET_DEPTH = 0.5

export function roomLayout(rects: RoomRects, aspect: number): RoomLayout {
  const { width, lane, table, board, play } = rects
  const bottom = Math.min(rects.bottom, table.y + table.h)
  const lookAt = Math.round(board.x + board.w / 2)
  const wings = play.x + play.w - (board.x + board.w) >= WING
  const blocked = [table, board, ...rects.obstacles]
  // The walkway stops short of the table so he keeps his distance from its far edge.
  const walkway = { x: EDGE, y: lane.y, w: width - EDGE * 2, h: lane.h - CLEARANCE - 1 }
  const usableLane = lane.h - CLEARANCE * 2 - 2
  const floorH = bottom - CLEARANCE - lane.y
  const cornerW = rects.corner ? table.x - CLEARANCE - 1 - Math.max(EDGE, rects.corner.x) : 0
  const nearH = Math.floor(Math.min(cornerW / aspect, rects.bottom * NEAR_SHARE, MAX_DOG_H, floorH))
  const clampX = (x: number, w: number) => Math.round(Math.min(Math.max(x, EDGE), width - EDGE - w))

  let world: HubertWorld
  if (rects.corner && nearH >= MIN_CORNER_DOG_H) {
    // The floor recedes from the viewer to the walkway behind the table: he is largest right beside us.
    const dog = { w: Math.floor(nearH * aspect), h: nearH }
    const near = bottom - CLEARANCE - nearH
    const depth = { y0: lane.y, y1: near, s0: Math.min(0.8, Math.max(0.35, (usableLane - 4) / nearH)), s1: 1 }
    const corner = { x: Math.max(EDGE, rects.corner.x), y: lane.y, w: cornerW, h: floorH }
    const basketY = Math.round(lane.y + (near - lane.y) * BASKET_DEPTH)
    const farY = lane.y + CLEARANCE
    const farW = dog.w * depth.s0
    world = {
      lane: walkway,
      floor: [corner],
      blocked,
      dog,
      depth,
      // The basket stands against the table's far half, the begging spot by its near end.
      basket: { x: Math.floor(corner.x + corner.w - dog.w * scaleAt({ depth }, basketY)), y: basketY },
      feed: {
        near: { x: corner.x + corner.w - dog.w, y: near },
        far: { x: clampX(lookAt - farW / 2 + farW * 0.35, farW), y: farY },
      },
    }
  } else {
    // No corner: he lives on the walkway behind the table, all at one size.
    const h = Math.max(48, Math.min(usableLane, 170))
    const dog = { w: Math.round(h * aspect), h }
    const groundY = lane.y + lane.h - CLEARANCE - 2 - h
    const basket = { x: EDGE, y: groundY }
    const floor: Rect[] = []
    const rightX = table.x + table.w + CLEARANCE + 6
    if (width - EDGE - rightX >= dog.w + 8) floor.push({ x: rightX, y: lane.y, w: width - EDGE - rightX, h: floorH })
    world = {
      lane: walkway,
      floor,
      blocked,
      dog,
      basket,
      feed: {
        near: { x: clampX(Math.max(basket.x + dog.w * 1.05, board.x - dog.w * 0.15), dog.w), y: groundY },
        far: { x: clampX(lookAt - dog.w / 2 + dog.w * 0.35, dog.w), y: groundY },
      },
    }
  }

  const roomy = world.lane.w >= world.dog.w * scaleAt(world, lane.y) * 3 && isFree(world, world.basket)
  return { world: roomy ? world : null, basket: world.basket, basketScale: scaleAt(world, world.basket.y), dog: world.dog, lookAt, wings }
}
