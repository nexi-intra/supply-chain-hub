import { memo, type KeyboardEventHandler, type PointerEvent as ReactPointerEvent, type Ref } from 'react'
import { BOARD_SIZE, CENTER, PREMIUM_TEXT, letterPoints, premiumAt } from '@/games/wordPuzzle/display'
import type { MultiplayerBoard, MultiplayerLanguage, MultiplayerPlacement } from '@/lib/multiplayer'
import type { MultiplayerLabels } from '@/lib/multiplayerLabels'
import type { Cursor, Direction, Draft, DraftTile } from '@/lib/multiplayerView'
import { WordTile } from './WordTile'

const STAR = 'M12 2l2.9 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8l-6.5 3.9 1.8-7.3-5.7-4.9 7.5-.6z'

export interface WordBoardProps {
  board: MultiplayerBoard
  language: MultiplayerLanguage
  draft: Draft
  /** Words waiting for the opponent's approval, drawn highlighted. */
  pending: readonly MultiplayerPlacement[]
  cursor: Cursor | null
  direction: Direction
  interactive: boolean
  labels: MultiplayerLabels['match']
  boardRef: Ref<HTMLDivElement>
  onSquareClick: (row: number, col: number) => void
  onDraftPointerDown: (event: ReactPointerEvent<HTMLElement>, tile: DraftTile) => void
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
  onFocus: () => void
}

export const WordBoard = memo(function WordBoard(props: WordBoardProps) {
  const { board, language, draft, pending, cursor, direction, interactive, labels } = props
  const draftAt = new Map(draft.tiles.map(tile => [tile.row * BOARD_SIZE + tile.col, tile]))
  const pendingAt = new Map(pending.map(item => [item.row * BOARD_SIZE + item.col, item]))

  return (
    <div className="wp-board-frame">
      <div
        ref={props.boardRef}
        className="wp-board"
        role="grid"
        aria-label={labels.boardLabel}
        aria-activedescendant={cursor ? `wp-cell-${cursor.row}-${cursor.col}` : undefined}
        tabIndex={0}
        onKeyDown={props.onKeyDown}
        onFocus={props.onFocus}
      >
        {Array.from({ length: BOARD_SIZE }, (_, row) => (
          <div key={row} className="wp-board-row" role="row">
            {Array.from({ length: BOARD_SIZE }, (_, col) => {
              const key = row * BOARD_SIZE + col
              const played = board[row]?.[col] ?? null
              const drafted = draftAt.get(key)
              const waiting = pendingAt.get(key)
              const premium = premiumAt(row, col)
              const centre = row === CENTER && col === CENTER
              const tile = played
                ? { letter: played.letter, blank: played.blank, state: undefined }
                : waiting
                  ? { letter: waiting.letter, blank: waiting.blank === true, state: 'pending' as const }
                  : drafted
                    ? { letter: drafted.letter, blank: drafted.blank, state: 'draft' as const }
                    : null
              const isCursor = cursor?.row === row && cursor.col === col
              const description = tile
                ? labels.tileLabel(tile.letter, tile.blank ? 0 : letterPoints(language, tile.letter))
                : `${labels.square(row + 1, col + 1)}${centre ? `, ${labels.centre}` : premium ? `, ${labels.premium[premium]}` : ''}`
              return (
                <div
                  key={col}
                  id={`wp-cell-${row}-${col}`}
                  className="wp-cell"
                  role="gridcell"
                  aria-label={description}
                  data-square=""
                  data-row={row}
                  data-col={col}
                  data-premium={premium ?? undefined}
                  data-centre={centre ? '' : undefined}
                  data-cursor={isCursor ? direction : undefined}
                  data-interactive={interactive && !tile ? '' : undefined}
                  onClick={() => props.onSquareClick(row, col)}
                >
                  {tile ? (
                    <span
                      className="wp-cell__tile"
                      onPointerDown={tile.state === 'draft' && drafted ? event => props.onDraftPointerDown(event, drafted) : undefined}
                      onClick={tile.state === 'draft' ? event => event.stopPropagation() : undefined}
                      style={tile.state === 'draft' ? { touchAction: 'none' } : undefined}
                    >
                      <WordTile letter={tile.letter} blank={tile.blank} language={language} state={tile.state} />
                    </span>
                  ) : centre ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} /></svg>
                  ) : premium ? (
                    <span aria-hidden="true">{PREMIUM_TEXT[premium]}</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
})
