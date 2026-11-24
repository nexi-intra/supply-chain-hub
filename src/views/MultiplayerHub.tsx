import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, GameController } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { SectionBadge, MultiplayerArt } from '@/components/arcade/SectionTile'
import { useLanguage } from '@/contexts/LanguageContext'
import { WordTile } from '@/components/multiplayer/WordTile'
import { BOARD_IMAGE, pieceImage } from '@/components/chess/pieces'
import type { MultiplayerGameEntry } from '@/lib/multiplayer'
import { useMultiplayerSnapshot } from '@/hooks/useMultiplayerSnapshot'
import { getMultiplayerLabels } from '@/lib/multiplayerLabels'
import { groupGames, isBackgammonEntry, isChessEntry, isWordPuzzleEntry } from '@/lib/multiplayerView'
import { isAnyDialogOpen } from '@/lib/modalStack'
import { BackgammonStill } from '@/components/backgammon/BackgammonStill'
import '@/components/multiplayer/multiplayer.css'
import '@/components/chess/chess.css'
import '@/components/backgammon/backgammon.css'
import './arcade.css'

const Multiplayer = lazy(() => import('@/views/Multiplayer').then(m => ({ default: m.Multiplayer })))
const ChessLobby = lazy(() => import('@/views/ChessLobby').then(m => ({ default: m.ChessLobby })))
const BackgammonLobby = lazy(() => import('@/views/BackgammonLobby').then(m => ({ default: m.BackgammonLobby })))

export interface MultiplayerHubProps {
  onNavigateBack: () => void
  userEmail?: string
  /** Deep link: open the game's lobby directly, and the game itself once it has started. */
  initialGameId?: string | null
  startInGame?: boolean
  openGameId?: string | null
  onOpenGameConsumed?: () => void
}

type HubView = 'hub' | 'wordpuzzle' | 'chess' | 'backgammon' | 'resolving'
type LobbyView = 'wordpuzzle' | 'chess' | 'backgammon'
/** A game to show in a lobby, picked by a deep link; `open` is false for an invitation that has no match yet. */
interface Target { lobby: LobbyView; gameId: string; open: boolean }

const PLAYABLE = ['active', 'awaiting-approval', 'finished']

function Loading() {
  return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
}

/** Which lobby a game belongs to; unknown games go to Word-Puzzle as before chess existed. */
export function lobbyFor(games: readonly MultiplayerGameEntry[], gameId: string): Target {
  const entry = games.find(game => game.id === gameId)
  return { lobby: entry && isChessEntry(entry) ? 'chess' : entry && isBackgammonEntry(entry) ? 'backgammon' : 'wordpuzzle', gameId, open: entry ? PLAYABLE.includes(entry.status) : true }
}

export function MultiplayerHub({ onNavigateBack, userEmail, initialGameId = null, startInGame = false, openGameId = null, onOpenGameConsumed }: MultiplayerHubProps) {
  const { language } = useLanguage()
  const labels = getMultiplayerLabels(language)
  const h = labels.hub
  const [view, setView] = useState<HubView>(initialGameId ? 'resolving' : startInGame ? 'wordpuzzle' : 'hub')
  const [initial, setInitial] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const api = typeof window === 'undefined' ? undefined : window.electronMultiplayer

  // A deep link names a game; its type decides the lobby, its status whether the match opens.
  const resolve = useCallback(async (gameId: string): Promise<Target> => {
    if (!api) return { lobby: 'wordpuzzle', gameId, open: true }
    try {
      return lobbyFor((await api.snapshot()).games, gameId)
    } catch {
      return { lobby: 'wordpuzzle', gameId, open: true }
    }
  }, [api])

  // The newest deep link wins; a slower answer for an older one is dropped.
  const request = useRef(0)
  useEffect(() => () => { request.current = -1 }, [])

  useEffect(() => {
    if (!initialGameId) return
    const id = ++request.current
    void resolve(initialGameId).then(target => {
      if (id !== request.current) return
      setInitial(target.open ? target.gameId : null)
      setView(target.lobby)
    })
    // Only the link the hub opened with.
  }, [])

  // A notification clicked while Multiplayer is showing must still reach the game, in the right lobby.
  useEffect(() => {
    if (!openGameId) return
    const id = ++request.current
    onOpenGameConsumed?.()
    void resolve(openGameId).then(target => {
      if (id !== request.current) return
      setView(target.lobby)
      setPending(target.open ? target.gameId : null)
    })
  }, [openGameId, onOpenGameConsumed, resolve])

  const clearPending = useCallback(() => setPending(null), [])

  // The badges follow the app-wide shared snapshot while the hub itself is showing.
  const snapshot = useMultiplayerSnapshot({ enabled: view === 'hub' }).state.snapshot

  useEffect(() => {
    if (view !== 'hub') return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isAnyDialogOpen()) return
      onNavigateBack()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [view, onNavigateBack])

  const status = useMemo(() => {
    const count = (games: MultiplayerGameEntry[]) => {
      if (!snapshot) return []
      const groups = groupGames(games, snapshot.actor.email)
      return [
        groups.yourTurn.length ? h.yourTurn(groups.yourTurn.length) : null,
        groups.invitationsIn.length ? h.invitations(groups.invitationsIn.length) : null,
      ].filter((text): text is string => Boolean(text))
    }
    return {
      wordpuzzle: count((snapshot?.games ?? []).filter(isWordPuzzleEntry)),
      chess: count((snapshot?.games ?? []).filter(isChessEntry)),
      backgammon: count((snapshot?.games ?? []).filter(isBackgammonEntry)),
    }
  }, [snapshot, h])

  const backToHub = () => { setInitial(null); setPending(null); setView('hub') }

  if (view === 'resolving') return <Loading />

  if (view === 'wordpuzzle') {
    return (
      <Suspense fallback={<Loading />}>
        <Multiplayer
          onNavigateBack={backToHub}
          backLabel={h.backToMultiplayer}
          userEmail={userEmail}
          initialGameId={initial}
          openGameId={pending}
          onOpenGameConsumed={clearPending}
        />
      </Suspense>
    )
  }

  if (view === 'chess') {
    return (
      <Suspense fallback={<Loading />}>
        <ChessLobby
          onNavigateBack={backToHub}
          backLabel={h.backToMultiplayer}
          userEmail={userEmail}
          initialGameId={initial}
          openGameId={pending}
          onOpenGameConsumed={clearPending}
        />
      </Suspense>
    )
  }

  if (view === 'backgammon') {
    return (
      <Suspense fallback={<Loading />}>
        <BackgammonLobby
          onNavigateBack={backToHub}
          backLabel={h.backToMultiplayer}
          userEmail={userEmail}
          initialGameId={initial}
          openGameId={pending}
          onOpenGameConsumed={clearPending}
        />
      </Suspense>
    )
  }

  const tileLanguage = language === 'en' || language === 'sv' || language === 'fi' ? language : 'da'
  const badges = (texts: string[]) => texts.length > 0 && (
    <span className="flex flex-wrap gap-2">
      {texts.map(text => <span key={text} className="wp-badge" data-tone="turn">{text}</span>)}
    </span>
  )

  return (
    <div className="arcade-library min-h-screen text-foreground" style={{ '--cx-board': `url("${BOARD_IMAGE}")` } as CSSProperties}>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Button onClick={onNavigateBack} variant="outline" className="mb-10 gap-2">
          <ArrowLeft size={18} aria-hidden="true" />
          {labels.backToGameCorner}
        </Button>
        <header className="mb-8 flex items-center gap-4 border-b border-border pb-7">
          <SectionBadge game="section-multiplayer" art={<MultiplayerArt />} />
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">{labels.sectionName}</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">{h.tagline}</p>
          </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <button type="button" data-game="wordpuzzle" onClick={() => setView('wordpuzzle')} className="arcade-tile group flex min-h-[270px] flex-col overflow-hidden rounded-md border border-border text-left transition-colors hover:border-primary/50">
            <span className="arcade-tile-art flex h-28 items-center px-6" aria-hidden="true">
              <span className="arcade-tile-words">
                {[...'ORD'].map(letter => <WordTile key={letter} letter={letter} language={tileLanguage} />)}
              </span>
            </span>
            <span className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4 sm:px-6">
              <span className="block text-lg font-semibold text-foreground">{labels.gameName}</span>
              <span className="flex-1 text-sm leading-relaxed text-muted-foreground">{h.wordPuzzle}</span>
              {badges(status.wordpuzzle)}
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <GameController size={18} weight="duotone" aria-hidden="true" />
                {h.openGame}
              </span>
            </span>
          </button>
          <button type="button" data-game="chess" onClick={() => setView('chess')} className="arcade-tile group flex min-h-[270px] flex-col overflow-hidden rounded-md border border-border text-left transition-colors hover:border-primary/50">
            <span className="arcade-tile-art cx-tile-art flex h-28 items-center px-6" aria-hidden="true">
              <span className="cx-tile-pieces">
                <img src={pieceImage('w', 'n')} alt="" />
                <img src={pieceImage('b', 'k')} alt="" />
                <img src={pieceImage('w', 'p')} alt="" />
              </span>
            </span>
            <span className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4 sm:px-6">
              <span className="block text-lg font-semibold text-foreground">{labels.gameNames.chess}</span>
              <span className="flex-1 text-sm leading-relaxed text-muted-foreground">{h.chess}</span>
              {badges(status.chess)}
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <GameController size={18} weight="duotone" aria-hidden="true" />
                {h.openGame}
              </span>
            </span>
          </button>
          <button type="button" data-game="backgammon" onClick={() => setView('backgammon')} className="arcade-tile group flex min-h-[270px] flex-col overflow-hidden rounded-md border border-border text-left transition-colors hover:border-primary/50">
            <span className="arcade-tile-art bgm-tile-art flex h-28 items-center px-6" aria-hidden="true">
              <BackgammonStill labels={labels.backgammon} />
            </span>
            <span className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4 sm:px-6">
              <span className="block text-lg font-semibold text-foreground">{labels.gameNames.backgammon}</span>
              <span className="flex-1 text-sm leading-relaxed text-muted-foreground">{h.backgammon}</span>
              {badges(status.backgammon)}
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <GameController size={18} weight="duotone" aria-hidden="true" />
                {h.openGame}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
