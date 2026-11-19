import { describe, expect, it } from 'vitest'
import { BRICK_PATTERN_COLS, brickPatternForLevel } from './brickBreakLevels'

describe('Brick Break level formations', () => {
  it('creates eight distinct, symmetric layouts at every difficulty size', () => {
    for (const rows of [5, 6, 7, 8]) {
      const layouts = Array.from({ length: 8 }, (_, index) => brickPatternForLevel(index + 1, rows))
      expect(new Set(layouts.map(layout => JSON.stringify(layout))).size).toBe(8)
      for (const layout of layouts) {
        expect(layout).toHaveLength(rows)
        for (const row of layout) {
          expect(row).toHaveLength(BRICK_PATTERN_COLS)
          expect(row).toEqual([...row].reverse())
        }
        expect(layout.flat().filter(Boolean).length).toBeGreaterThan(rows * BRICK_PATTERN_COLS * 0.35)
      }
    }
  })

  it('repeats the sequence predictably instead of adding random holes', () => {
    expect(brickPatternForLevel(1, 6)).toEqual(brickPatternForLevel(9, 6))
    expect(brickPatternForLevel(4, 6)).toEqual(brickPatternForLevel(4, 6))
  })
})
