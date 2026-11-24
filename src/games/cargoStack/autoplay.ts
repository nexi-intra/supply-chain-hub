import { COLS, ROWS } from './config'
import type { Action, Cell, GameState } from './engine'
import { pieceCells, type PieceType, type Rotation } from './pieces'

export interface Placement {
  rotation: Rotation
  x: number
}

// Klassiske vægte for en grådig Tetris-AI (højde, rækker, huller, ujævnhed).
const WEIGHTS = { height: -0.51, lines: 0.76, holes: -0.36, bumpiness: -0.18 }

function fitsOn(board: Cell[][], type: PieceType, rotation: Rotation, x: number, y: number): boolean {
  for (const [cx, cy] of pieceCells(type, rotation)) {
    const bx = x + cx
    const by = y + cy
    if (bx < 0 || bx >= COLS || by >= ROWS) return false
    if (by >= 0 && board[by][bx] !== null) return false
  }
  return true
}

function evaluate(board: Cell[][], type: PieceType, rotation: Rotation, x: number, startY: number): number | null {
  if (!fitsOn(board, type, rotation, x, startY)) return null
  let y = startY
  while (fitsOn(board, type, rotation, x, y + 1)) y++
  const next = board.map((row) => [...row])
  for (const [cx, cy] of pieceCells(type, rotation)) if (y + cy >= 0) next[y + cy][x + cx] = type
  const remaining = next.filter((row) => !row.every((cell) => cell !== null))
  const lines = ROWS - remaining.length
  const grid = [...Array.from({ length: lines }, () => new Array<Cell>(COLS).fill(null)), ...remaining]
  const heights: number[] = []
  let holes = 0
  for (let column = 0; column < COLS; column++) {
    let top = ROWS
    for (let row = 0; row < ROWS; row++) {
      if (grid[row][column] !== null) {
        if (top === ROWS) top = row
      } else if (top !== ROWS) {
        holes++
      }
    }
    heights.push(ROWS - top)
  }
  const height = heights.reduce((sum, h) => sum + h, 0)
  let bumpiness = 0
  for (let column = 1; column < COLS; column++) bumpiness += Math.abs(heights[column] - heights[column - 1])
  return WEIGHTS.height * height + WEIGHTS.lines * lines + WEIGHTS.holes * holes + WEIGHTS.bumpiness * bumpiness
}

/** Den bedste placering for den aktive brik, set fra dens nuværende højde. */
export function planPlacement(state: GameState): Placement | null {
  const piece = state.active
  if (!piece) return null
  let best: { placement: Placement; score: number } | null = null
  const rotations: Rotation[] = piece.type === 'O' ? [0] : [0, 1, 2, 3]
  for (const rotation of rotations) {
    for (let x = -2; x < COLS; x++) {
      const score = evaluate(state.board, piece.type, rotation, x, piece.y)
      if (score !== null && (!best || score > best.score)) best = { placement: { rotation, x }, score }
    }
  }
  return best?.placement ?? null
}

/** Handlingerne der fører den aktive brik fra spawn til placeringen og slipper den. */
export function planActions(state: GameState, placement: Placement | null): Action[] {
  const piece = state.active
  if (!piece || !placement) return ['hardDrop']
  const turns = (placement.rotation - piece.rotation + 4) % 4
  const actions: Action[] = turns === 3 ? ['rotateCCW'] : Array.from({ length: turns }, () => 'rotateCW' as const)
  const dx = placement.x - piece.x
  for (let i = 0; i < Math.abs(dx); i++) actions.push(dx < 0 ? 'left' : 'right')
  actions.push('hardDrop')
  return actions
}

/** Det næste enkelte skridt mod placeringen, til en demo der flytter brikken synligt. */
export function nextAction(state: GameState, placement: Placement | null): Action | null {
  const piece = state.active
  if (!piece) return null
  if (!placement) return 'hardDrop'
  if (piece.rotation !== placement.rotation) return (placement.rotation - piece.rotation + 4) % 4 === 3 ? 'rotateCCW' : 'rotateCW'
  if (piece.x < placement.x) return 'right'
  if (piece.x > placement.x) return 'left'
  return 'hardDrop'
}
