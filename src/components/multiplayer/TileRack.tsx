import { memo, type PointerEvent as ReactPointerEvent } from 'react'
import type { MultiplayerLanguage } from '@/lib/multiplayer'
import type { MultiplayerLabels } from '@/lib/multiplayerLabels'
import { unplacedRackIndexes, type Draft } from '@/lib/multiplayerView'
import { letterPoints } from '@/games/wordPuzzle/display'
import { WordTile } from './WordTile'

export interface TileRackProps {
  rack: readonly string[]
  draft: Draft
  language: MultiplayerLanguage
  labels: MultiplayerLabels['match']
  /** Rack index chosen with a click or tap, waiting for a square. */
  selected: number | null
  /** Rack indexes marked for a swap; null when the rack is not in swap mode. */
  swap: ReadonlySet<number> | null
  /** Tiles can be dragged and selected. */
  active: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, rackIndex: number) => void
  onActivate: (rackIndex: number) => void
}

export const TileRack = memo(function TileRack({ rack, draft, language, labels, selected, swap, active, onPointerDown, onActivate }: TileRackProps) {
  const free = new Set(unplacedRackIndexes(draft))
  return (
    <div className="wp-rack" data-rack="" data-disabled={active ? undefined : ''} role="group" aria-label={labels.rackLabel}>
      {draft.order.map(rackIndex => {
        const letter = rack[rackIndex]
        const onBoard = !free.has(rackIndex)
        const state = swap?.has(rackIndex) ? 'swap' : selected === rackIndex ? 'selected' : undefined
        return (
          <div key={rackIndex} className="wp-rack__slot">
            {!onBoard && letter !== undefined && (
              <button
                type="button"
                className="wp-rack__tile"
                disabled={!active}
                aria-pressed={swap ? swap.has(rackIndex) : selected === rackIndex}
                aria-label={letter === '?' ? labels.blankTile : labels.tileLabel(letter, letterPoints(language, letter))}
                onPointerDown={event => onPointerDown(event, rackIndex)}
                // Mouse presses are handled on pointer up; a click with no pointer detail is keyboard activation.
                onClick={event => { if (event.detail === 0) onActivate(rackIndex) }}
              >
                <WordTile letter={letter} language={language} state={state} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
})
