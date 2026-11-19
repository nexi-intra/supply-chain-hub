import { lazy, Suspense, useCallback } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ChallengeDialog } from '@/components/multiplayer/ChallengeDialog'
import { HubertNapping } from '@/components/boardgame/Hubert'
import { ROOM_STYLE } from '@/components/boardgame/RoomScene'
import {
  GameRow, LeaderboardPanel, LobbyCabinet, LobbyNotices, LobbySections, MatchLoading, RivalsPanel, useLobby, type RowGroup,
} from '@/components/multiplayer/Lobby'
import { BackgammonStill } from '@/components/backgammon/BackgammonStill'
import { useStableValue } from '@/hooks/useStable'
import type { MultiplayerBackgammonEntry } from '@/lib/multiplayer'
import { isBackgammonEntry, seatOf, unreadGameNotificationIds } from '@/lib/multiplayerView'
import '@/components/arcade/arcadeCabinet.css'
import '@/components/multiplayer/multiplayer.css'
import '@/components/backgammon/backgammon.css'
import './arcade.css'

const BackgammonGame = lazy(() => import('@/components/backgammon/BackgammonGame').then(m => ({ default: m.BackgammonGame })))

const NO_IDS: string[] = []

export interface BackgammonLobbyProps {
  onNavigateBack: () => void
  backLabel?: string
  userEmail?: string
  initialGameId?: string | null
  openGameId?: string | null
  onOpenGameConsumed?: () => void
}

/** The backgammon lobby: the same walnut cabinet as the other board games, with a board in the marquee. */
export function BackgammonLobby({ onNavigateBack, backLabel, userEmail, initialGameId = null, openGameId = null, onOpenGameConsumed }: BackgammonLobbyProps) {
  const lobby = useLobby<MultiplayerBackgammonEntry>({
    gameType: 'backgammon', isGame: isBackgammonEntry, userEmail, initialGameId, openGameId, onOpenGameConsumed, onNavigateBack,
  })
  const { labels, language, snapshot, busy, me, teamName, openGame, setOpenGame } = lobby
  const l = labels.lobby
  const b = labels.backgammon
  const unreadIds = useStableValue(snapshot && openGame ? unreadGameNotificationIds(snapshot.notifications, openGame, me) : NO_IDS)
  const closeGame = useCallback(() => setOpenGame(null), [setOpenGame])

  if (openGame) {
    return (
      <Suspense fallback={<MatchLoading />}>
        <BackgammonGame
          gameId={openGame}
          myEmail={me}
          teamName={teamName}
          unreadNotificationIds={unreadIds}
          onBack={closeGame}
        />
      </Suspense>
    )
  }

  const renderRow = (entry: MultiplayerBackgammonEntry, group: RowGroup) => {
    const seat = seatOf(entry, me) ?? 0
    const myColor = entry.whiteIndex === null ? null : entry.whiteIndex === seat ? 'white' : 'black'
    const requested = seat === 0 ? entry.challengerColor : entry.challengerColor === 'random' ? 'random' : entry.challengerColor === 'white' ? 'black' : 'white'
    const shownColor = myColor ?? requested
    const playing = entry.status === 'active' || entry.status === 'finished'
    const score = playing ? `${entry.scores[seat]}\u2013${entry.scores[seat === 0 ? 1 : 0]}` : null
    return (
      <GameRow
        key={entry.id}
        entry={entry}
        group={group}
        lobby={lobby}
        art={(
          <span className="bgm-row-art">
            <span className="bgm-chip-checker" data-color={shownColor === 'black' ? 'black' : 'white'} />
          </span>
        )}
        detail={<span>{b.playsAs(b.colors[shownColor])}</span>}
        score={score}
      />
    )
  }

  const rivals = (snapshot?.rivals ?? []).filter(rival => rival.type === 'backgammon')

  return (
    <div className="arcade-library wp-lobby bgm-lobby min-h-screen text-foreground" data-arcade-theme="word" style={ROOM_STYLE}>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Button onClick={onNavigateBack} variant="outline" className="mb-8 gap-2">
          <ArrowLeft size={18} aria-hidden="true" />
          {backLabel ?? labels.backToGameCorner}
        </Button>

        <LobbyCabinet
          title={labels.gameNames.backgammon}
          tagline={b.tagline}
          labels={l}
          myStats={snapshot?.myStatsByType?.backgammon}
          disabled={!snapshot}
          onChallenge={() => lobby.openChallenge(null)}
          art={(
            <>
              <div className="wp-marquee-art" />
              <HubertNapping className="wp-marquee-hubert" />
              <div className="bgm-marquee" aria-hidden="true"><BackgammonStill labels={b} /></div>
            </>
          )}
        />

        <LobbyNotices lobby={lobby} />

        {snapshot && (
          <div className="wp-lobby-grid">
            <LobbySections lobby={lobby} renderRow={renderRow} />
            <aside className="wp-lobby-side">
              <RivalsPanel lobby={lobby} rivals={rivals} />
              <LeaderboardPanel lobby={lobby} stats={snapshot.statsByType?.backgammon ?? []} />
            </aside>
          </div>
        )}
      </div>

      {snapshot && (
        <ChallengeDialog
          open={lobby.challengeOpen}
          onOpenChange={lobby.setChallengeOpen}
          gameType="backgammon"
          people={snapshot.people}
          teams={snapshot.teams}
          defaultLanguage={language}
          initialEmail={lobby.rematchEmail}
          busy={busy}
          labels={labels}
          onSubmit={(person, choice) => void lobby.sendChallenge(person, operationId => ({
            operationId, type: 'challenge', opponentEmail: person.email, gameType: 'backgammon', color: choice.color,
          }))}
        />
      )}
    </div>
  )
}
