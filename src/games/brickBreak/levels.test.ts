import { describe, expect, it } from 'vitest'
import { brickPatternForLevel, BRICK_PATTERN_COLS } from '../../lib/brickBreakLevels'
import { FIELD, SETTINGS } from './config'
import { buildLevel, windowBounds } from './levels'

describe('buildLevel', () => {
  it('uses the existing mask density and difficulty row count', () => {
    for (const [difficulty, settings] of Object.entries(SETTINGS)) {
      const bricks = buildLevel(1, difficulty as keyof typeof SETTINGS)
      const mask = brickPatternForLevel(1, settings.rows)
      expect(bricks).toHaveLength(mask.flat().filter(Boolean).length)
      expect(new Set(bricks.map((brick) => brick.y)).size).toBe(settings.rows)
      expect(BRICK_PATTERN_COLS).toBe(14)
    }
  })

  it('places every row symmetrically around the field center', () => {
    const bricks = buildLevel(3, 'expert')
    for (const brick of bricks) {
      const mirroredBrick = bricks.find((candidate) =>
        candidate.y === brick.y && Math.abs(candidate.x - (FIELD.width - brick.x - brick.width)) < 1e-8,
      )
      expect(mirroredBrick).toMatchObject({ kind: brick.kind, hp: brick.hp, colorIndex: brick.colorIndex })
    }
  })

  it('guarantees early crystals and a symmetric reactor pair', () => {
    const bricks = buildLevel(1, 'easy')
    const cellAt = (row: number, column: number) =>
      bricks.find((brick) => brick.y === 72 + row * 26 && Math.round((brick.x - 77) / 58) === column)

    expect(cellAt(0, 6)?.kind).toBe('crystal')
    expect(cellAt(0, 7)?.kind).toBe('crystal')
    expect(cellAt(1, 3)?.kind).toBe('reactor')
    expect(cellAt(1, 10)?.kind).toBe('reactor')
  })

  it('is deterministic for the same level and difficulty', () => {
    expect(buildLevel(9, 'hard')).toEqual(buildLevel(9, 'hard'))
  })

  it('keeps brick health bounded and most bricks one-hit', () => {
    const bricks = buildLevel(40, 'expert')
    const singleHitCount = bricks.filter((brick) => brick.hp === 1).length

    expect(bricks.every((brick) => brick.hp >= 1 && brick.hp <= 3 && brick.maxHp <= 3)).toBe(true)
    expect(singleHitCount / bricks.length).toBeGreaterThan(0.65)
  })

  it('increases row count by difficulty but never above eight', () => {
    expect(buildLevel(1, 'easy').map((brick) => brick.y).filter((coordinate, index, positions) => positions.indexOf(coordinate) === index)).toHaveLength(5)
    expect(buildLevel(20, 'expert').map((brick) => brick.y).filter((coordinate, index, positions) => positions.indexOf(coordinate) === index)).toHaveLength(8)
  })
})

describe('windowBounds', () => {
  it('omslutter alle ruder med en ramme og holder sig inden for banen', () => {
    for (const difficulty of ['easy', 'expert'] as const) {
      const bricks = buildLevel(3, difficulty)
      const frame = windowBounds(difficulty)
      for (const brick of bricks) {
        expect(brick.x).toBeGreaterThan(frame.x)
        expect(brick.y).toBeGreaterThan(frame.y)
        expect(brick.x + brick.width).toBeLessThan(frame.x + frame.width)
        expect(brick.y + brick.height).toBeLessThan(frame.y + frame.height)
      }
      expect(frame.x).toBeGreaterThanOrEqual(0)
      expect(frame.x + frame.width).toBeLessThanOrEqual(FIELD.width)
      expect(frame.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('bliver højere med flere rækker', () => {
    expect(windowBounds('expert').height).toBeGreaterThan(windowBounds('easy').height)
  })
})