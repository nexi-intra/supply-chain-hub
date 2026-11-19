import type { LayoutItem } from '@/types/warehouse'

type Cell = [number, number]
type Hall = { w: number; h: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const cellKey = (x: number, y: number) => `${x},${y}`

/** A shape is its box (x, y, w, h) minus the `cut` cells (relative to x, y). */
export function cellsOf(item: LayoutItem): Cell[] {
  const cut = new Set((item.cut ?? []).map(([dx, dy]) => cellKey(dx, dy)))
  const out: Cell[] = []
  for (let dy = 0; dy < item.h; dy++) for (let dx = 0; dx < item.w; dx++) if (!cut.has(cellKey(dx, dy))) out.push([item.x + dx, item.y + dy])
  return out
}

export function setCells(item: LayoutItem, cells: Cell[]): LayoutItem {
  if (!cells.length) return item
  const xs = cells.map(c => c[0])
  const ys = cells.map(c => c[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const w = Math.max(...xs) - x + 1
  const h = Math.max(...ys) - y + 1
  const set = new Set(cells.map(([cx, cy]) => cellKey(cx, cy)))
  const cut: Cell[] = []
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (!set.has(cellKey(x + dx, y + dy))) cut.push([dx, dy])
  const { cut: _old, ...rest } = item
  return cut.length ? { ...rest, x, y, w, h, cut } : { ...rest, x, y, w, h }
}

/** Adds or removes one cell; the last cell cannot be removed. */
export function toggleCell(item: LayoutItem, cell: { x: number; y: number }, add: boolean): LayoutItem {
  const cells = cellsOf(item)
  const at = cells.findIndex(([x, y]) => x === cell.x && y === cell.y)
  if (add && at < 0) return setCells(item, [...cells, [cell.x, cell.y]])
  if (!add && at >= 0 && cells.length > 1) return setCells(item, cells.filter((_, i) => i !== at))
  return item
}

/** Turns a quarter; reuses the previous centre when the item hasn't moved, so a turn clamped at the wall turns back exactly. */
export function rotateItem(item: LayoutItem, hall: Hall): LayoutItem {
  const c = item.rot && item.rot.x === item.x && item.rot.y === item.y ? item.rot : { cx: item.x + item.w / 2, cy: item.y + item.h / 2 }
  const w = clamp(item.h, 1, hall.w)
  const h = clamp(item.w, 1, hall.h)
  const x = clamp(Math.round(c.cx - w / 2), 0, hall.w - w)
  const y = clamp(Math.round(c.cy - h / 2), 0, hall.h - h)
  const turned: LayoutItem = { ...item, x, y, w, h, rot: { cx: c.cx, cy: c.cy, x, y } }
  if (item.cut?.length) turned.cut = item.cut.map(([dx, dy]): Cell => [item.h - 1 - dy, dx])
  return turned
}

/** The largest solid rectangle inside the shape, so a label never sits on cut-away cells. */
export function labelBox(item: LayoutItem): { x: number; y: number; w: number; h: number } {
  const whole = { x: item.x, y: item.y, w: item.w, h: item.h }
  if (!item.cut?.length) return whole
  const cut = new Set(item.cut.map(([dx, dy]) => cellKey(dx, dy)))
  const heights = new Array<number>(item.w).fill(0)
  let best: { area: number; x: number; y: number; w: number; h: number } | null = null
  for (let dy = 0; dy < item.h; dy++) {
    for (let dx = 0; dx < item.w; dx++) heights[dx] = cut.has(cellKey(dx, dy)) ? 0 : heights[dx] + 1
    for (let a = 0; a < item.w; a++) {
      let minH = Infinity
      for (let b = a; b < item.w && heights[b]; b++) {
        minH = Math.min(minH, heights[b])
        const area = minH * (b - a + 1)
        if (!best || area > best.area) best = { area, x: item.x + a, y: item.y + dy - minH + 1, w: b - a + 1, h: minH }
      }
    }
  }
  if (!best) return whole
  const { area: _area, ...box } = best
  return box
}

export function clampToHall(item: LayoutItem, hall: Hall): LayoutItem {
  const w = clamp(item.w, 1, hall.w)
  const h = clamp(item.h, 1, hall.h)
  return { ...item, w, h, x: clamp(item.x, 0, hall.w - w), y: clamp(item.y, 0, hall.h - h) }
}
