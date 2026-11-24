import type { Rng } from '../chickenInvaders/rng'

export const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const
export type PieceType = (typeof PIECE_TYPES)[number]
export type Rotation = 0 | 1 | 2 | 3
type Cell = [number, number]

const BASE: Record<PieceType, { size: number; cells: Cell[] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
}

const ROTATED: Record<PieceType, Cell[][]> = Object.fromEntries(
  PIECE_TYPES.map((type) => {
    const { size, cells } = BASE[type]
    const states: Cell[][] = [cells]
    for (let i = 1; i < 4; i++) states.push(states[i - 1].map(([x, y]) => [size - 1 - y, x] as Cell))
    return [type, states]
  }),
) as Record<PieceType, Cell[][]>

export function pieceSize(type: PieceType): number {
  return BASE[type].size
}

/** Cellerne i brikkens kasse for en retning (x højre, y nedad). */
export function pieceCells(type: PieceType, rotation: Rotation): Cell[] {
  return ROTATED[type][rotation]
}

// SRS-kicks fra guideline-tabellen (y opad), her omregnet til y nedad.
const flip = (table: Record<string, Cell[]>) => Object.fromEntries(Object.entries(table).map(([key, kicks]) => [key, kicks.map(([x, y]) => [x, y === 0 ? 0 : -y] as Cell)]))

const JLSTZ_KICKS = flip({
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
})

const I_KICKS = flip({
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
})

export function kicksFor(type: PieceType, from: Rotation, to: Rotation): Cell[] {
  if (type === 'O') return [[0, 0]]
  return (type === 'I' ? I_KICKS : JLSTZ_KICKS)[`${from}${to}`]
}

/** 7-bag: hver pose indeholder alle syv brikker i tilfældig rækkefølge. */
export function createBag(rng: Rng): () => PieceType {
  let bag: PieceType[] = []
  return () => {
    if (bag.length === 0) {
      bag = [...PIECE_TYPES]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
    }
    return bag.shift()!
  }
}
