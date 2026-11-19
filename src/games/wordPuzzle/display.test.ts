import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { MULTIPLAYER_LANGUAGES } from '@/lib/multiplayer'
import { BOARD_SIZE, CENTER, PREMIUM_TEXT, alphabet, letterPoints, premiumAt } from './display'

const require = createRequire(import.meta.url)
const board = require('../../../electron/games/wordPuzzle/board.cjs') as {
  SIZE: number
  CENTER: number
  premiumAt(row: number, col: number): 'TW' | 'DW' | 'TL' | 'DL' | null
}
const tileSets = require('../../../electron/games/wordPuzzle/tileSets.cjs') as {
  TILE_SETS: Record<string, { letters: Record<string, { count: number; points: number }> }>
}

describe('Word-Puzzle display data matches the rules engine', () => {
  it('uses the same board size and centre', () => {
    expect(BOARD_SIZE).toBe(board.SIZE)
    expect(CENTER).toBe(board.CENTER)
  })

  it('has the same premium on every square', () => {
    for (let row = 0; row < board.SIZE; row++) {
      for (let col = 0; col < board.SIZE; col++) {
        expect(premiumAt(row, col), `${row},${col}`).toBe(board.premiumAt(row, col))
      }
    }
  })

  it('returns no premium outside the board', () => {
    expect(premiumAt(-1, 0)).toBeNull()
    expect(premiumAt(0, BOARD_SIZE)).toBeNull()
    expect(premiumAt(1.5, 2)).toBeNull()
  })

  it.each(MULTIPLAYER_LANGUAGES)('has the same letters, order and points for %s', language => {
    const letters = tileSets.TILE_SETS[language].letters
    expect(alphabet(language)).toEqual(Object.keys(letters))
    for (const [letter, { points }] of Object.entries(letters)) {
      expect(letterPoints(language, letter), `${language} ${letter}`).toBe(points)
    }
  })

  it('values unknown letters and blanks at zero', () => {
    expect(letterPoints('da', '?')).toBe(0)
    expect(letterPoints('en', 'Æ')).toBe(0)
  })

  it('prints the four premium kinds', () => {
    expect(Object.values(PREMIUM_TEXT)).toEqual(['3W', '2W', '3L', '2L'])
  })
})
