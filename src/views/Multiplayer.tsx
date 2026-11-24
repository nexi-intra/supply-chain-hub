import { lazy, Suspense, useCallback } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ChallengeDialog } from '@/components/multiplayer/ChallengeDialog'
import { HubertNapping } from '@/components/boardgame/Hubert'
import { ROOM_STYLE } from '@/components/boardgame/RoomScene'
import { LanguageFlag } from '@/components/multiplayer/LanguageFlag'
import {
  GameRow, LeaderboardPanel, LobbyCabinet, LobbyNotices, LobbySections, MatchLoading, RivalsPanel, TopWordsPanel, useLobby,
} from '@/components/multiplayer/Lobby'
import { WordTile } from '@/components/multiplayer/WordTile'
import { useStableValue } from '@/hooks/useStable'
import type { MultiplayerWordPuzzleEntry } from '@/lib/multiplayer'
import { isWordPuzzleEntry, opponentOf, seatOf, unreadGameNotificationIds } from '@/lib/multiplayerView'
import '@/components/arcade/arcadeCabinet.css'
import '@/components/multiplayer/multiplayer.css'
import './arcade.css'

const WordPuzzleGame = lazy(() => import('@/components/multiplayer/WordPuzzleGame').then(m => ({ default: m.WordPuzzleGame })))

const NO_IDS: string[] = []

export interface MultiplayerProps {
  onNavigateBack: () => void
  backLabel?: string
  userEmail?: string
  /** Game to open when the section mounts (deep link). */
  initialGameId?: string | null
  /** Game to open while the section is already showing (deep link); change it to open another one. */
  openGameId?: string | null
  onOpenGameConsumed?: () => void
}

// Crossword fragment on the marquee: [word, row, col, direction].
const MARQUEE_WORDS: Array<[string, number, number, 'across' | 'down']> = [
  ['HUBERT', 2, 0, 'across'], ['VUF', 1, 1, 'down'], ['WORD', 0, 4, 'down'],
]

function MarqueeTiles() {
  const cells = new Map<string, { row: number; col: number; letter: string }>()
  for (const [word, row, col, direction] of MARQUEE_WORDS) {
    for (const [index, letter] of [...word].entries()) {
      const r = direction === 'down' ? row + index : row
      const c = direction === 'across' ? col + index : col
      cells.set(`${r}-${c}`, { row: r, col: c, letter })
    }
  }
  return (
    <div className="wp-marquee-tiles">
      {[...cells.values()].map(cell => (
        <span
          key={`${cell.row}-${cell.col}`}
          className="wp-marquee-tile"
          style={{ gridRow: cell.row + 1, gridColumn: cell.col + 1, transform: `rotate(${(((cell.row * 7 + cell.col * 3) % 5) - 2) * 0.8}deg)` }}
        >
          <WordTile letter={cell.letter} language="en" />
        </span>
      ))}
    </div>
  )
}

/** The Word-Puzzle lobby. */
export function Multiplayer({ onNavigateBack, backLabel, userEmail, initialGameId = null, openGameId = null, onOpenGameConsumed }: MultiplayerProps) {
  const lobby = useLobby<MultiplayerWordPuzzleEntry>({
    gameType: 'word-puzzle', isGame: isWordPuzzleEntry, userEmail, initialGameId, openGameId, onOpenGameConsumed, onNavigateBack,
  })
  const { labels, language, snapshot, busy, me, teamName, openGame, setOpenGame } = lobby
  const l = labels.lobby
  // Same ids, same array: the open match is not re-rendered by lobby changes that do not concern it.
  const unreadIds = useStableValue(snapshot && openGame ? unreadGameNotificationIds(snapshot.notifications, openGame, me) : NO_IDS)
  const closeGame = useCallback(() => setOpenGame(null), [setOpenGame])
  const openEntry = openGame ? snapshot?.games.find(entry => entry.id === openGame) : undefined

  if (openGame) {
    return (
      <Suspense fallback={<MatchLoading />}>
        <WordPuzzleGame
          gameId={openGame}
          languageHint={openEntry?.type === 'word-puzzle' ? openEntry.language : undefined}
          myEmail={me}
          teamName={teamName}
          unreadNotificationIds={unreadIds}
          onBack={closeGame}
        />
      </Suspense>
    )
  }

  const renderRow = (entry: MultiplayerWordPuzzleEntry, group: Parameters<typeof GameRow>[0]['group']) => {
    const opponent = opponentOf(entry, me)
    const seat = seatOf(entry, me) ?? 0
    return (
      <GameRow
        key={entry.id}
        entry={entry}
        group={group}
        lobby={lobby}
        art={<WordTile letter={opponent.name.trim().charAt(0).toLocaleUpperCase() || '?'} language={entry.language} />}
        detail={<span><LanguageFlag language={entry.language} /> {labels.languageNames[entry.language]}</span>}
        score={l.score(entry.scores[seat], entry.scores[seat === 0 ? 1 : 0])}
      />
    )
  }

  return (
    <div className="arcade-library wp-lobby min-h-screen text-foreground" data-arcade-theme="word" style={ROOM_STYLE}>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Button onClick={onNavigateBack} variant="outline" className="mb-8 gap-2">
          <ArrowLeft size={18} aria-hidden="true" />
          {backLabel ?? labels.backToGameCorner}
        </Button>

        <LobbyCabinet
          title={labels.gameName}
          tagline={l.tagline}
          labels={l}
          myStats={snapshot?.myStats}
          disabled={!snapshot}
          onChallenge={() => lobby.openChallenge(null)}
          art={(
            <>
              <div className="wp-marquee-art" />
              <HubertNapping className="wp-marquee-hubert" />
              <MarqueeTiles />
            </>
          )}
        />

        <LobbyNotices lobby={lobby} />

        {snapshot && (
          <div className="wp-lobby-grid">
            <LobbySections lobby={lobby} renderRow={renderRow} />
            <aside className="wp-lobby-side">
              <RivalsPanel lobby={lobby} rivals={snapshot.rivals.filter(rival => rival.type === 'word-puzzle')} />
              <LeaderboardPanel lobby={lobby} stats={snapshot.stats} />
              <TopWordsPanel lobby={lobby} words={snapshot.topWords ?? []} />
            </aside>
          </div>
        )}
      </div>

      {snapshot && (
        <ChallengeDialog
          open={lobby.challengeOpen}
          onOpenChange={lobby.setChallengeOpen}
          gameType="word-puzzle"
          people={snapshot.people}
          teams={snapshot.teams}
          defaultLanguage={language}
          initialEmail={lobby.rematchEmail}
          busy={busy}
          labels={labels}
          onSubmit={(person, choice) => void lobby.sendChallenge(person, operationId => ({
            operationId, type: 'challenge', opponentEmail: person.email, language: choice.language,
          }))}
        />
      )}
    </div>
  )
}
