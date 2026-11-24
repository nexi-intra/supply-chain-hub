import { describe, expect, it } from 'vitest'
import type { LayoutItem } from '@/types/warehouse'
import { cellsOf, clampToHall, labelBox, rotateItem, setCells, toggleCell } from './geometry'

const base: LayoutItem = { id: 'r1', type: 'rack', x: 0, y: 0, w: 1, h: 1, name: '', note: '', slots: [] }

describe('layout geometry', () => {
  it('rotateItem turns back exactly after a turn clamped at the wall, and turns the cut cells', () => {
    const hall = { w: 20, h: 20 }
    const once = rotateItem({ ...base, x: 18, y: 5, w: 2, h: 6, cut: [[0, 0]] }, hall)
    expect([once.x, once.y, once.w, once.h]).toEqual([14, 7, 6, 2]); expect(once.cut).toEqual([[5, 0]])
    const twice = rotateItem(once, hall)
    expect([twice.x, twice.y, twice.w, twice.h]).toEqual([18, 5, 2, 6]); expect(twice.cut).toEqual([[1, 5]])
  })

  it('a shape is its box minus the cut cells; toggling keeps at least one cell and returns a new item', () => {
    const l = { ...base, x: 2, y: 3, w: 2, h: 2, cut: [[1, 0]] as [number, number][] }
    expect(cellsOf(l)).toEqual([[2, 3], [2, 4], [3, 4]])
    const filled = toggleCell(l, { x: 3, y: 3 }, true)
    expect([filled.w, filled.h, filled.cut]).toEqual([2, 2, undefined]); expect(l.cut).toEqual([[1, 0]])
    const one = setCells(base, [[5, 5]])
    expect(toggleCell(one, { x: 5, y: 5 }, false)).toEqual(one)
    expect(setCells(base, [[4, 1], [6, 1]])).toMatchObject({ x: 4, y: 1, w: 3, h: 1, cut: [[1, 0]] })
  })

  it('labelBox is the largest solid rectangle and clampToHall keeps the item inside', () => {
    expect(labelBox({ ...base, x: 0, y: 0, w: 3, h: 3, cut: [[0, 0], [0, 1]] })).toEqual({ x: 1, y: 0, w: 2, h: 3 })
    expect(clampToHall({ ...base, x: 18, y: -2, w: 30, h: 4 }, { w: 20, h: 20 })).toMatchObject({ x: 0, y: 0, w: 20, h: 4 })
  })
})
