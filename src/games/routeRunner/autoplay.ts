import { COLS, ROWS } from './config'
import { OPPOSITE, VECTORS, type Direction, type GameState, type Point } from './engine'

const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left']
const key = (x: number, y: number) => y * COLS + x

function blocked(state: GameState, includeTail: boolean): Set<number> {
  const cells = new Set<number>()
  for (const obstacle of state.obstacles) for (const [x, y] of obstacle.cells) cells.add(key(x, y))
  const body = includeTail ? state.segments : state.segments.slice(0, -1)
  for (const s of body) cells.add(key(s.x, s.y))
  return cells
}

function inside(p: Point): boolean {
  return p.x >= 0 && p.x < COLS && p.y >= 0 && p.y < ROWS
}

/** Første skridt på korteste vej fra `from` til et af målene, eller null. */
function firstStep(from: Point, targets: Point[], walls: Set<number>, heading: Direction): Direction | null {
  const goals = new Set(targets.map((t) => key(t.x, t.y)))
  const seen = new Map<number, Direction>()
  const queue: Point[] = []
  for (const direction of DIRECTIONS) {
    if (direction === OPPOSITE[heading]) continue
    const next = { x: from.x + VECTORS[direction].x, y: from.y + VECTORS[direction].y }
    const k = key(next.x, next.y)
    if (!inside(next) || walls.has(k) || seen.has(k)) continue
    seen.set(k, direction)
    queue.push(next)
  }
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    const first = seen.get(key(current.x, current.y))!
    if (goals.has(key(current.x, current.y))) return first
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + VECTORS[direction].x, y: current.y + VECTORS[direction].y }
      const k = key(next.x, next.y)
      if (!inside(next) || walls.has(k) || seen.has(k)) continue
      seen.set(k, first)
      queue.push(next)
    }
  }
  return null
}

function reachable(from: Point, walls: Set<number>, extra: number, limit: number): number {
  const seen = new Set<number>([key(from.x, from.y)])
  const queue = [from]
  for (let i = 0; i < queue.length && seen.size < limit; i++) {
    for (const vector of Object.values(VECTORS)) {
      const next = { x: queue[i].x + vector.x, y: queue[i].y + vector.y }
      const k = key(next.x, next.y)
      if (!inside(next) || k === extra || walls.has(k) || seen.has(k)) continue
      seen.add(k)
      queue.push(next)
    }
  }
  return seen.size
}

/** Grådig men forsigtig autopilot: jagter pakken, når der stadig er plads bagefter, ellers halen. */
export function autopilotDirection(state: GameState): Direction {
  const head = state.segments[0]
  const heading = state.queue[state.queue.length - 1] ?? state.direction
  const walls = blocked(state, false)
  const targets = state.express ? [state.parcel, state.express] : [state.parcel]
  const needed = state.segments.length + 2
  const safe = (direction: Direction) => {
    const next = { x: head.x + VECTORS[direction].x, y: head.y + VECTORS[direction].y }
    if (!inside(next) || walls.has(key(next.x, next.y))) return -1
    return reachable(next, walls, key(head.x, head.y), needed * 4)
  }
  const toTarget = firstStep(head, targets, walls, heading)
  if (toTarget && safe(toTarget) >= needed) return toTarget
  const tail = state.segments[state.segments.length - 1]
  const toTail = firstStep(head, [tail], blocked(state, false), heading)
  if (toTail && safe(toTail) > 0) return toTail
  let best: Direction = heading
  let bestSpace = -1
  for (const direction of DIRECTIONS) {
    if (direction === OPPOSITE[heading]) continue
    const space = safe(direction)
    if (space > bestSpace) {
      best = direction
      bestSpace = space
    }
  }
  return best
}
