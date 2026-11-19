import type { ReactNode } from 'react'
import { memo, useEffect, useRef } from 'react'
import { FoldedCard, IndexCard, ScorePad } from '@/components/boardgame/Paper'
import type { MultiplayerChessGame } from '@/lib/multiplayer'
import type { MultiplayerLabels } from '@/lib/multiplayerLabels'
import { advantage, figurineSan, scoreSheet } from '@/lib/chessView'
import { pieceImage } from './pieces'

type Labels = MultiplayerLabels

/** Both players on the score pad: the opponent on top, as across the board, with colour and material. */
export const ChessPlayersCard = memo(function ChessPlayersCard({ game, labels, teamName }: { game: MultiplayerChessGame; labels: Labels; teamName: (code: string) => string }) {
  const c = labels.chess
  const playing = game.status === 'active'
  const order = game.me === 0 ? [1, 0] : [0, 1]
  return (
    <ScorePad title={labels.match.players} label={labels.match.players}>
      {order.map(seat => {
        const player = game.players[seat]
        const color = seat === game.whiteIndex ? 'white' : 'black'
        const onTurn = playing && game.turn === player.email
        const lead = advantage(game.chess.captured, color)
        return (
          <div key={player.email} className="wp-player cx-player" data-turn={onTurn ? '' : undefined} data-me={seat === game.me ? '' : undefined}>
            <span className="cx-player__king" aria-hidden="true">
              <img src={pieceImage(color === 'white' ? 'w' : 'b', 'k')} alt="" draggable={false} />
            </span>
            <span>
              <span className="wp-player__name">{player.name}</span>
              <span className="wp-player__meta">{teamName(player.teamCode)} · {c.colors[color]}</span>
            </span>
            <span className="wp-player__score cx-player__lead" data-empty={lead > 0 ? undefined : ''}>
              {lead > 0 ? c.captured.advantage(lead) : '\u00a0'}
            </span>
            {onTurn && <span className="wp-player__turn">{game.chess.inCheck ? `${labels.match.onTurn} · ${c.check}` : labels.match.onTurn}</span>}
          </div>
        )
      })}
    </ScorePad>
  )
})

/** The score sheet: numbered rows, white and black, in figurine notation; the newest move is marked. */
export function ScoreSheet({ game, labels, footer }: { game: MultiplayerChessGame; labels: Labels; footer?: ReactNode }) {
  const c = labels.chess
  const rows = scoreSheet(game.chess.moves)
  const list = useRef<HTMLDivElement>(null)
  const count = game.chess.moves.length
  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [count])
  const last = game.chess.moves[count - 1]
  return (
    <IndexCard title={c.sheet.title} label={c.sheet.title} className="cx-sheet-card">
      {rows.length === 0 ? (
        <p className="bgr-note">{c.sheet.empty}</p>
      ) : (
        <div className="cx-sheet" ref={list}>
          <table>
            <thead>
              <tr><th scope="col" aria-label="#" /><th scope="col">{c.sheet.white}</th><th scope="col">{c.sheet.black}</th></tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.number}>
                  <th scope="row">{row.number}.</th>
                  {[row.white, row.black].map((move, index) => (
                    <td key={index} data-last={move && move === last ? '' : undefined} aria-label={move?.san}>
                      {move ? figurineSan(move.san) : index === 0 ? '\u2026' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </IndexCard>
  )
}

export const ChessKeyboardHelp = memo(function ChessKeyboardHelp({ labels }: { labels: Labels['chess']['keyboard'] }) {
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
