import { brickPatternForLevel, BRICK_PATTERN_COLS } from '../../lib/brickBreakLevels'
import { FIELD, SETTINGS, type Difficulty } from './config'

export type BrickKind = 'glass' | 'armored' | 'crystal' | 'reactor'

export interface Brick {
  id: number
  x: number
  y: number
  width: number
  height: number
  kind: BrickKind
  hp: number
  maxHp: number
  colorIndex: number
  dead: boolean
}

const BRICK_WIDTH = 52
const BRICK_HEIGHT = 20
const COLUMN_GAP = 6
const ROW_GAP = 6
const FIRST_ROW_Y = 72
const WINDOW_MARGIN = 18

/** Rammen om vinduets ruder; rendereren tegner blyindfatning og lysindfald ud fra den. */
export function windowBounds(difficulty: Difficulty): { x: number; y: number; width: number; height: number } {
  const rows = Math.min(8, SETTINGS[difficulty].rows)
  const totalWidth = BRICK_PATTERN_COLS * BRICK_WIDTH + (BRICK_PATTERN_COLS - 1) * COLUMN_GAP
  const totalHeight = rows * BRICK_HEIGHT + (rows - 1) * ROW_GAP
  return {
    x: (FIELD.width - totalWidth) / 2 - WINDOW_MARGIN,
    y: FIRST_ROW_Y - WINDOW_MARGIN,
    width: totalWidth + WINDOW_MARGIN * 2,
    height: totalHeight + WINDOW_MARGIN * 2,
  }
}

export function buildLevel(level: number, difficulty: Difficulty): Brick[] {
  const rows = Math.min(8, SETTINGS[difficulty].rows)
  const pattern = brickPatternForLevel(level, rows)
  const totalWidth = BRICK_PATTERN_COLS * BRICK_WIDTH + (BRICK_PATTERN_COLS - 1) * COLUMN_GAP
  const firstColumnX = (FIELD.width - totalWidth) / 2
  const bricks: Brick[] = []

  for (let row = 0; row < pattern.length; row++) {
    for (let column = 0; column < BRICK_PATTERN_COLS; column++) {
      if (!pattern[row][column]) continue
      const mirroredColumn = Math.min(column, BRICK_PATTERN_COLS - 1 - column)
      const variant = (Math.max(1, level) * 7 + row * 11 + mirroredColumn * 13) % 23
      let kind: BrickKind = 'glass'

      if (level === 1 && row === 0 && (column === 6 || column === 7)) {
        kind = 'crystal'
      } else if (level === 1 && row === 1 && (column === 3 || column === 10)) {
        kind = 'reactor'
      } else if (variant === 0) {
        kind = 'reactor'
      } else if (variant >= 1 && variant <= 4) {
        kind = 'armored'
      } else if (variant === 5 || variant === 6) {
        kind = 'crystal'
      }

      const hp = kind === 'armored'
        ? Math.min(3, 2 + (level >= 5 && variant === 1 ? 1 : 0))
        : kind === 'reactor' ? 2 : 1

      bricks.push({
        id: bricks.length + 1,
        x: firstColumnX + column * (BRICK_WIDTH + COLUMN_GAP),
        y: FIRST_ROW_Y + row * (BRICK_HEIGHT + ROW_GAP),
        width: BRICK_WIDTH,
        height: BRICK_HEIGHT,
        kind,
        hp,
        maxHp: hp,
        colorIndex: (Math.max(1, level) + row + mirroredColumn) % 6,
        dead: false,
      })
    }
  }

  return bricks
}