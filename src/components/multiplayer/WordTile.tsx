import { letterPoints } from '@/games/wordPuzzle/display'
import type { MultiplayerLanguage } from '@/lib/multiplayer'

export type WordTileState = 'draft' | 'pending' | 'selected' | 'swap'

export interface WordTileProps {
  /** '?' is an undeclared blank tile on a rack. */
  letter: string
  blank?: boolean
  language: MultiplayerLanguage
  state?: WordTileState
}

/** A wooden/ivory tile: letter plus a small point value; blanks show their letter without points. */
export function WordTile({ letter, blank = false, language, state }: WordTileProps) {
  const isBlank = blank || letter === '?'
  const points = isBlank ? 0 : letterPoints(language, letter)
  return (
    <span className="wp-tile" data-blank={isBlank ? '' : undefined} data-state={state}>
      <span className="wp-tile__letter">{letter === '?' ? '' : letter}</span>
      {points > 0 && <span className="wp-tile__points" aria-hidden="true">{points}</span>}
    </span>
  )
}
