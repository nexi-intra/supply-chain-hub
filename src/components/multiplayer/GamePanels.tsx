import { memo, type ReactNode } from 'react'
import { FoldedCard, IndexCard, ScorePad } from '@/components/boardgame/Paper'
import type { MultiplayerGame, MultiplayerMoveError, MultiplayerWord } from '@/lib/multiplayer'
import type { MultiplayerLabels } from '@/lib/multiplayerLabels'

export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; words: MultiplayerWord[]; total: number; bingo: boolean }
  | { status: 'invalid'; error: MultiplayerMoveError }
  | { status: 'error'; message: string }

type MatchLabels = MultiplayerLabels['match']

export const PlayersCard = memo(function PlayersCard({ game, labels, teamName }: { game: MultiplayerGame; labels: MatchLabels; teamName: (code: string) => string }) {
  const playing = game.status === 'active' || game.status === 'awaiting-approval'
  return (
    <ScorePad title={labels.players} label={labels.players}>
      {game.players.map((player, seat) => {
        const onTurn = playing && game.turn === player.email
        return (
          <div key={player.email} className="wp-player" data-turn={onTurn ? '' : undefined}>
            <span className="wp-player__avatar" aria-hidden="true">
              <span className="wp-tile"><span className="wp-tile__letter">{player.name.trim().charAt(0).toUpperCase()}</span></span>
            </span>
            <span>
              <span className="wp-player__name">{player.name}</span>
              <span className="wp-player__meta">{teamName(player.teamCode)}</span>
            </span>
            <span className="wp-player__score">
              {game.scores[seat]}
              <small>{labels.points}</small>
            </span>
            {onTurn && <span className="wp-player__turn">{labels.onTurn}</span>}
          </div>
        )
      })}
      <div className="wp-meta-row">
        <span>{labels.bag}: <strong>{game.bagCount}</strong></span>
        <span>{labels.theirTiles(game.opponentRackCount)}</span>
      </div>
    </ScorePad>
  )
})

function WordList({ words, labels }: { words: readonly MultiplayerWord[]; labels: MatchLabels }) {
  return (
    <ul className="wp-words">
      {words.map((word, index) => (
        <li key={`${word.word}-${index}`}>
          <span className="wp-words__word">{word.word}</span>
          <span className="wp-words__score">+{word.score}</span>
          {word.known === false && <span className="wp-words__flag">{labels.preview.unknownWord}</span>}
        </li>
      ))}
    </ul>
  )
}

export interface MoveCardProps {
  game: MultiplayerGame
  labels: MatchLabels
  moveErrors: MultiplayerLabels['moveErrors']
  preview: PreviewState
  placedCount: number
  canMove: boolean
  /** Word-check decision and pass, swap and resign, shown under the move. */
  footer?: ReactNode
}

/** The live score of the move being built, or the words that wait for approval. */
export function MoveCard({ game, labels, moveErrors, preview, placedCount, canMove, footer }: MoveCardProps) {
  const pending = game.pending
  if (pending) {
    return (
      <IndexCard tone="attention" title={labels.preview.title} label={labels.preview.title}>
        <WordList words={pending.words} labels={labels} />
        <div className="wp-words__total"><span>{labels.preview.total}</span><strong>{pending.total}</strong></div>
        {pending.bingo && <p className="bgr-note">{labels.preview.bingo}</p>}
        {footer}
      </IndexCard>
    )
  }
  if (game.status !== 'active') return null

  let body
  if (!canMove) body = <p className="bgr-note">{labels.waitHint}</p>
  else if (placedCount === 0) body = <p className="bgr-note">{labels.preview.hint}</p>
  else if (preview.status === 'loading' || preview.status === 'idle') body = <p className="bgr-note" role="status">{labels.preview.checking}</p>
  else if (preview.status === 'invalid') body = <p className="bgr-note" data-tone="warn" role="status">{moveErrors[preview.error]}</p>
  else if (preview.status === 'error') body = <p className="bgr-note" data-tone="bad" role="status">{preview.message}</p>
  else {
    const unknown = preview.words.some(word => word.known === false)
    body = (
      <>
        <WordList words={preview.words} labels={labels} />
        <div className="wp-words__total"><span>{labels.preview.total}</span><strong>{preview.total}</strong></div>
        {preview.bingo && <p className="bgr-note">{labels.preview.bingo}</p>}
        {unknown && <p className="bgr-note" data-tone="warn">{labels.preview.unknownHint}</p>}
      </>
    )
  }
  return (
    <IndexCard title={labels.preview.title} label={labels.preview.title}>
      {body}
      {footer}
    </IndexCard>
  )
}

export const HistoryCard = memo(function HistoryCard({ game, labels }: { game: MultiplayerGame; labels: MatchLabels }) {
  const moves = [...game.moves].reverse()
  return (
    <FoldedCard title={labels.history.title} count={moves.length} className="wp-history-card">
      {moves.length === 0 ? (
        <p className="bgr-note">{labels.history.empty}</p>
      ) : (
        <ul className="wp-history">
          {moves.map((move, index) => {
            const name = game.players[move.by].name
            const text = move.kind === 'play'
              ? labels.history.play(name, (move.words ?? []).map(word => word.word).join(', '))
              : move.kind === 'pass'
                ? labels.history.pass(name)
                : move.kind === 'exchange'
                  ? labels.history.exchange(name, move.count ?? 0)
                  : labels.history.resign(name)
            return (
              <li key={`${move.at}-${index}`} data-me={move.by === game.me ? '' : undefined}>
                <span>{text}</span>
                {move.kind === 'play' && <b>+{move.score}</b>}
              </li>
            )
          })}
        </ul>
      )}
    </FoldedCard>
  )
})

export const KeyboardHelp = memo(function KeyboardHelp({ labels }: { labels: MatchLabels['keyboard'] }) {
  return (
    <FoldedCard title={labels.title} className="wp-kbd-help">
      <dl>
        {labels.items.map(item => (
          <div key={item.keys} style={{ display: 'contents' }}>
            <dt>{item.keys}</dt>
            <dd>{item.text}</dd>
          </div>
        ))}
      </dl>
    </FoldedCard>
  )
})
