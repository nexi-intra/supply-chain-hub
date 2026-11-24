import { describe, expect, it } from 'vitest'
import { createRng } from '../chickenInvaders/rng'
import { createBag, kicksFor, PIECE_TYPES, pieceCells, type PieceType, type Rotation } from './pieces'

const sorted = (cells: Array<[number, number]>) => [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0])

describe('brikker', () => {
  it('har syv brikker med fire celler i alle fire retninger', () => {
    expect(PIECE_TYPES).toEqual(['I', 'O', 'T', 'S', 'Z', 'J', 'L'])
    for (const type of PIECE_TYPES) for (const rotation of [0, 1, 2, 3] as Rotation[]) expect(pieceCells(type, rotation)).toHaveLength(4)
  })

  it('følger SRS-formerne for T og I', () => {
    expect(sorted(pieceCells('T', 0))).toEqual([[1, 0], [0, 1], [1, 1], [2, 1]])
    expect(sorted(pieceCells('T', 1))).toEqual([[1, 0], [1, 1], [2, 1], [1, 2]])
    expect(sorted(pieceCells('I', 0))).toEqual([[0, 1], [1, 1], [2, 1], [3, 1]])
    expect(sorted(pieceCells('I', 1))).toEqual([[2, 0], [2, 1], [2, 2], [2, 3]])
    expect(sorted(pieceCells('O', 2))).toEqual(sorted(pieceCells('O', 0)))
  })

  it('bruger SRS-kicks med y nedad', () => {
    expect(kicksFor('T', 0, 1)).toEqual([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]])
    expect(kicksFor('I', 0, 1)).toEqual([[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]])
    expect(kicksFor('O', 0, 1)).toEqual([[0, 0]])
  })
})

describe('7-bag', () => {
  it('giver alle syv brikker i hver pose og er deterministisk', () => {
    const draw = (seed: number) => {
      const next = createBag(createRng(seed))
      return Array.from({ length: 70 }, () => next())
    }
    const pieces = draw(4)
    for (let bag = 0; bag < 10; bag++) expect(new Set(pieces.slice(bag * 7, bag * 7 + 7))).toEqual(new Set<PieceType>(PIECE_TYPES))
    expect(draw(4)).toEqual(pieces)
    expect(draw(5)).not.toEqual(pieces)
  })
})
