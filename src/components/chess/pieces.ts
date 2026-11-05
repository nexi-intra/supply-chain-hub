// Staunton pieces in boxwood and ebony, rendered with Blender (scripts/blender/chess.py). Every image uses the same
// frame (3:4), with the base centre at PIECE_BASE_Y of its height, so pieces line up on a square by their foot.
import wp from '@/assets/chess/wp.webp'
import wn from '@/assets/chess/wn.webp'
import wb from '@/assets/chess/wb.webp'
import wr from '@/assets/chess/wr.webp'
import wq from '@/assets/chess/wq.webp'
import wk from '@/assets/chess/wk.webp'
import bp from '@/assets/chess/bp.webp'
import bn from '@/assets/chess/bn.webp'
import bb from '@/assets/chess/bb.webp'
import br from '@/assets/chess/br.webp'
import bq from '@/assets/chess/bq.webp'
import bk from '@/assets/chess/bk.webp'
import board from '@/assets/chess/board.webp'
import type { MultiplayerChessPieceType } from '@/lib/multiplayer'
import type { Side } from '@/lib/chessView'

export type PieceCode = `${Side}${MultiplayerChessPieceType}`

export const PIECE_IMAGES: Record<PieceCode, string> = { wp, wn, wb, wr, wq, wk, bp, bn, bb, br, bq, bk }
export const BOARD_IMAGE = board
export const PIECE_BASE_Y = 0.86

export const pieceImage = (color: Side, type: MultiplayerChessPieceType) => PIECE_IMAGES[`${color}${type}`]
