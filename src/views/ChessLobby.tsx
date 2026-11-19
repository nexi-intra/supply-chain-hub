import { lazy, Suspense, useCallback, type CSSProperties } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ChallengeDialog } from '@/components/multiplayer/ChallengeDialog'
import { HubertNapping } from '@/components/boardgame/Hubert'
import { ROOM_STYLE } from '@/components/boardgame/RoomScene'
import {
  GameRow, LeaderboardPanel, LobbyCabinet, LobbyNotices, LobbySections, MatchLoading, RivalsPanel, useLobby, type RowGroup,
} from '@/components/multiplayer/Lobby'
import { BOARD_IMAGE, PIECE_BASE_Y, pieceImage, type PieceCode } from '@/components/chess/pieces'
import { useStableValue } from '@/hooks/useStable'
import type { MultiplayerChessEntry } from '@/lib/multiplayer'
import { isChessEntry, seatOf, unreadGameNotificationIds } from '@/lib/multiplayerView'
import '@/components/arcade/arcadeCabinet.css'
import '@/components/multiplayer/multiplayer.css'
import '@/components/chess/chess.css'
import './arcade.css'

const ChessGame = lazy(() => import('@/components/chess/ChessGame').then(m => ({ default: m.ChessGame })))

const NO_IDS: string[] = []

export interface ChessLobbyProps {
  onNavigateBack: () => void
  backLabel?: string
  userEmail?: string
  initialGameId?: string | null
  openGameId?: string | null
  onOpenGameConsumed?: () => void
}

const LOBBY_STYLE = { ...ROOM_STYLE, '--cx-board': `url("${BOARD_IMAGE}")` } as CSSProperties

// The marquee shows e8-h6 just after Qf6#: [piece, column, row (from the top), fallen].
const MARQUEE: Array<[PieceCode, number, number, boolean?]> = [
  ['bk', 3, 0, true], ['wn', 0, 1], ['bp', 0, 2], ['wq', 1, 2], ['wp', 2, 2],
]
// Must match .cx-marquee-board::before: 4x3 squares tilted rotateX(30deg) about the bottom edge, perspective 13 squares.
const MARQUEE_COLS = 4
const MARQUEE_ROWS = 3
const MARQUEE_TILT = (30 * Math.PI) / 180
const MARQUEE_PERSPECTIVE = 13
const PIECE_HEIGHT = 4 / 3

/** Screen position (in squares) of a square's centre on the tilted board, and how much it shrinks with depth. */
function marqueeFoot(col: number, row: number) {
  const dx = col + 0.5 - MARQUEE_COLS / 2
  const dy = row + 0.5 - MARQUEE_ROWS
  const scale = MARQUEE_PERSPECTIVE / (MARQUEE_PERSPECTIVE - dy * Math.sin(MARQUEE_TILT))
  return { x: MARQUEE_COLS / 2 + dx * scale, y: MARQUEE_ROWS + dy * Math.cos(MARQUEE_TILT) * scale, scale }
}

const mq = (n: number) => `calc(var(--mq) * ${n.toFixed(3)})`

function MarqueeBoard() {
  return (
    <div className="cx-marquee-board">
      {MARQUEE.map(([code, col, row, fallen]) => {
        const { x, y, scale } = marqueeFoot(col, row)
        return (
          <span
            key={code}
            className="cx-marquee-piece"
            data-fallen={fallen ? '' : undefined}
            style={{
              left: mq(x - scale / 2),
              top: mq(y - scale * PIECE_HEIGHT * PIECE_BASE_Y),
              width: mq(scale),
              height: mq(scale * PIECE_HEIGHT),
              zIndex: row + 1,
            }}
          >
            <img src={pieceImage(code[0] as 'w' | 'b', code[1] as 'k')} alt="" />
          </span>
        )
      })}
    </div>
  )
}

/** The chess lobby: the same walnut cabinet as Word-Puzzle with a chess marquee. */
export function ChessLobby({ onNavigateBack, backLabel, userEmail, initialGameId = null, openGameId = null, onOpenGameConsumed }: ChessLobbyProps) {
  const lobby = useLobby<MultiplayerChessEntry>({
    gameType: 'chess', isGame: isChessEntry, userEmail, initialGameId, openGameId, onOpenGameConsumed, onNavigateBack,
  })
  const { labels, language, snapshot, busy, me, teamName, openGame, setOpenGame } = lobby
  const l = labels.lobby
  const c = labels.chess
  // Same ids, same array: the open match is not re-rendered by lobby changes that do not concern it.
  const unreadIds = useStableValue(snapshot && openGame ? unreadGameNotificationIds(snapshot.notifications, openGame, me) : NO_IDS)
  const closeGame = useCallback(() => setOpenGame(null), [setOpenGame])

  if (openGame) {
    return (
      <Suspense fallback={<MatchLoading />}>
        <ChessGame
          gameId={openGame}
          myEmail={me}
          teamName={teamName}
          unreadNotificationIds={unreadIds}
          onBack={closeGame}
        />
      </Suspense>
    )
  }

  const renderRow = (entry: MultiplayerChessEntry, group: RowGroup) => {
    const seat = seatOf(entry, me) ?? 0
    const myColor = entry.whiteIndex === null ? null : entry.whiteIndex === seat ? 'white' : 'black'
    const requested = seat === 0 ? entry.challengerColor : entry.challengerColor === 'random' ? 'random' : entry.challengerColor === 'white' ? 'black' : 'white'
    const shownColor = myColor ?? requested
    const finished = entry.status === 'finished'
    const score = finished
      ? `${entry.scores[seat] === 0.5 ? '½' : entry.scores[seat]}\u2013${entry.scores[seat === 0 ? 1 : 0] === 0.5 ? '½' : entry.scores[seat === 0 ? 1 : 0]}`
      : null
    return (
      <GameRow
        key={entry.id}
        entry={entry}
        group={group}
        lobby={lobby}
        art={(
          <span className="cx-row-art">
            <img src={pieceImage(shownColor === 'black' ? 'b' : 'w', shownColor === 'random' ? 'n' : 'k')} alt="" />
          </span>
        )}
        detail={<span>{c.playsAs(c.colors[shownColor])}</span>}
        score={score}
      />
    )
  }

  const rivals = (snapshot?.rivals ?? []).filter(rival => rival.type === 'chess')

  return (
    <div className="arcade-library wp-lobby cx-lobby min-h-screen text-foreground" data-arcade-theme="word" style={LOBBY_STYLE}>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Button onClick={onNavigateBack} variant="outline" className="mb-8 gap-2">
          <ArrowLeft size={18} aria-hidden="true" />
          {backLabel ?? labels.backToGameCorner}
        </Button>

        <LobbyCabinet
          title={labels.gameNames.chess}
          tagline={c.tagline}
          labels={l}
          myStats={snapshot?.myStatsByType?.chess}
          disabled={!snapshot}
          onChallenge={() => lobby.openChallenge(null)}
          art={(
            <>
              <div className="wp-marquee-art" />
              <HubertNapping className="wp-marquee-hubert" />
              <MarqueeBoard />
            </>
          )}
        />

        <LobbyNotices lobby={lobby} />

        {snapshot && (
          <div className="wp-lobby-grid">
            <LobbySections lobby={lobby} renderRow={renderRow} />
            <aside className="wp-lobby-side">
              <RivalsPanel lobby={lobby} rivals={rivals} />
              <LeaderboardPanel lobby={lobby} stats={snapshot.statsByType?.chess ?? []} />
            </aside>
          </div>
        )}
      </div>

      {snapshot && (
        <ChallengeDialog
          open={lobby.challengeOpen}
          onOpenChange={lobby.setChallengeOpen}
          gameType="chess"
          people={snapshot.people}
          teams={snapshot.teams}
          defaultLanguage={language}
          initialEmail={lobby.rematchEmail}
          busy={busy}
          labels={labels}
          onSubmit={(person, choice) => void lobby.sendChallenge(person, operationId => ({
            operationId, type: 'challenge', opponentEmail: person.email, gameType: 'chess', color: choice.color,
          }))}
        />
      )}
    </div>
  )
}
