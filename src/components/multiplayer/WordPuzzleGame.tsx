import { ActionChip } from '@/components/boardgame/ActionChip'
import { useGameChangeWatch } from '@/hooks/useGameChangeWatch'
import { acknowledgeMultiplayerNotifications } from '@/lib/multiplayerAcknowledge'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowsClockwise, ArrowsLeftRight, CircleNotch, Flag, HandPalm, Shuffle, Trophy } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BoardGameRoom, RoomCalls } from '@/components/boardgame/BoardGameRoom'
import { ChatPanel } from '@/components/boardgame/ChatPanel'
import { PaperNote, TapedNote } from '@/components/boardgame/Paper'
import { alphabet } from '@/games/wordPuzzle/display'
import type { HubertFood, MultiplayerAnyGame, MultiplayerCommand, MultiplayerGame, MultiplayerLanguage, MultiplayerPlacement, MultiplayerReactionEmoji } from '@/lib/multiplayer'
import { sameJson } from '@/lib/multiplayerSnapshotStore'
import { useStableCallback } from '@/hooks/useStable'
import { getMultiplayerLabels } from '@/lib/multiplayerLabels'
import {
  backspace, canApprove, canExchange, canMove, defaultCursor, draftToPlacements, emptyDraft, moveCursor, moveDraftTile,
  multiplayerErrorInfo, newOperationId, opponentOf, outcomeFor, placeTile, recallAll, recallTile, shuffleRack, squareFree,
  typeLetter, type Cursor, type Direction, type Draft, type DraftTile,
} from '@/lib/multiplayerView'
import { isAnyDialogOpen } from '@/lib/modalStack'
import { createGameCommandQueue } from '@/lib/gameCommandQueue'
import { reactionScope } from '@/lib/multiplayerReactions'
import { BlankPicker } from './BlankPicker'
import { HistoryCard, KeyboardHelp, MoveCard, PlayersCard, type PreviewState } from './GamePanels'
import { LanguageFlag } from './LanguageFlag'
import { TileRack } from './TileRack'
import { useTileDrag, type DragSource, type DropTarget } from './useTileDrag'
import { WordBoard } from './WordBoard'
import './multiplayer.css'

export interface WordPuzzleGameProps {
  gameId: string
  /** The language from the lobby entry, so the word list can start loading before the game itself has arrived. */
  languageHint?: MultiplayerLanguage
  myEmail: string
  teamName: (code: string) => string
  /** Unread notifications for this game; they are acknowledged while the match is visible. */
  unreadNotificationIds: string[]
  onBack: () => void
}

const PREVIEW_DELAY = 250
const NO_PLACEMENTS: readonly MultiplayerPlacement[] = []

export const WordPuzzleGame = memo(function WordPuzzleGame({ gameId, languageHint, myEmail, teamName, unreadNotificationIds, onBack }: WordPuzzleGameProps) {
  const { language } = useLanguage()
  const labels = getMultiplayerLabels(language)
  const l = labels.match
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  const api = typeof window === 'undefined' ? undefined : window.electronMultiplayer

  const [game, setGame] = useState<MultiplayerGame | null>(null)
  const gameRef = useRef<MultiplayerGame | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [commands] = useState(createGameCommandQueue)
  const [sendingMove, setSendingMove] = useState(false)
  const inFlight = useRef(false)
  const dirty = useRef(false)
  const generation = useRef(0)

  const [draft, setDraft] = useState<Draft>(() => emptyDraft(7))
  const [selected, setSelected] = useState<number | null>(null)
  const [swap, setSwap] = useState<Set<number> | null>(null)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [direction, setDirection] = useState<Direction>('across')
  const [blankPick, setBlankPick] = useState<{ rackIndex: number; row: number; col: number } | null>(null)
  const [confirm, setConfirm] = useState<'pass' | 'resign' | null>(null)
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })
  const boardRef = useRef<HTMLDivElement>(null)

  const errorText = useCallback((error: unknown): string => {
    const text = labelsRef.current
    const info = multiplayerErrorInfo(error)
    if (info.code === 'MULTIPLAYER_INVALID_MOVE' && info.detail) return text.moveErrors[info.detail]
    return info.code ? text.errors[info.code] : text.errors.generic
  }, [])

  const applyGame = useCallback((next: MultiplayerAnyGame) => {
    if (next.type !== 'word-puzzle') return
    const current = gameRef.current
    if (current && (next.revision < current.revision || sameJson(next, current))) return
    gameRef.current = next
    setGame(next)
  }, [])

  const load = useCallback(async () => {
    if (!api) return
    const request = ++generation.current
    try {
      const next = await api.game(gameId)
      if (request !== generation.current) return
      applyGame(next)
      setLoadError(null)
    } catch (error) {
      if (request !== generation.current) return
      if (!gameRef.current) setLoadError(errorText(error))
      else toast.error(errorText(error))
    }
  }, [api, gameId, applyGame, errorText])

  useEffect(() => {
    if (!api) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (inFlight.current) dirty.current = true
        else void load()
      }, 180)
    }
    const unsubscribe = api.onChanged(schedule)
    void load()
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [api, load])

  // The match is open: Escape steps back here first (same convention as the Arcade games).
  useEffect(() => {
    document.body.setAttribute('data-game-active', 'true')
    return () => document.body.removeAttribute('data-game-active')
  }, [])

  // Start loading the word list now, so the first preview and move do not wait for it.
  const warmLanguage = game?.language ?? languageHint
  const warmWanted = !game || game.status === 'active' || game.status === 'awaiting-approval'
  useEffect(() => {
    if (!api || !warmLanguage || !warmWanted) return
    void api.warmWords(warmLanguage).catch(() => {})
  }, [api, warmLanguage, warmWanted])

  const moveAllowed = game ? canMove(game, myEmail) : false
  const approver = game ? canApprove(game, myEmail) : false
  // The opponent's move appears as soon as its game file is saved (see useGameChangeWatch).
  useGameChangeWatch(api, gameId, {
    active: Boolean(game) && game?.status !== 'finished',
    waiting: (game?.status === 'active' || game?.status === 'awaiting-approval') && !moveAllowed && !approver,
    onChange: () => { if (inFlight.current) dirty.current = true; else void load() },
  })

  // Any change to the board, the rack or the pending word makes a half-built move meaningless.
  const draftKey = game ? `${game.moves.length}|${game.status}|${game.rack.join('')}|${game.pending?.at ?? ''}` : ''
  useEffect(() => {
    const current = gameRef.current
    if (!current) return
    setDraft(emptyDraft(current.rack.length))
    setSelected(null)
    setSwap(null)
    setBlankPick(null)
  }, [draftKey])

  const placements = useMemo(() => draftToPlacements(draft), [draft])
  const placementsKey = JSON.stringify(placements)
  useEffect(() => {
    if (!api || !moveAllowed || placements.length === 0) {
      setPreview({ status: 'idle' })
      return
    }
    setPreview({ status: 'loading' })
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const result = await api.preview({ gameId, placements })
        if (cancelled) return
        setPreview(result.ok ? { status: 'ok', words: result.words, total: result.total, bingo: result.bingo } : { status: 'invalid', error: result.error })
      } catch (error) {
        if (!cancelled) setPreview({ status: 'error', message: errorText(error) })
      }
    }, PREVIEW_DELAY)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // placementsKey stands in for placements so an equal move never restarts the debounce.
  }, [api, gameId, placementsKey, moveAllowed, errorText])

  const run = useCallback(async (build: (revision: number) => MultiplayerCommand, { quiet = false }: { quiet?: boolean } = {}): Promise<boolean> => {
    // A second move/pass while one is on its way is a double click; a chat message (quiet) never locks the board.
    if (!api || !gameRef.current || (!quiet && busyRef.current)) return false
    if (!quiet) { busyRef.current = true; setBusy(true) }
    inFlight.current = true
    try {
      return await commands.enqueue(async () => {
        const current = gameRef.current
        if (!current) return false
        try {
          const result = await api.command(build(current.revision))
          if (result.game) applyGame(result.game)
          return true
        } catch (error) {
          toast.error(errorText(error))
          const code = multiplayerErrorInfo(error).code
          if (code === 'MULTIPLAYER_CONFLICT' || code === 'MULTIPLAYER_STATE' || code === 'MULTIPLAYER_NOT_YOUR_TURN') void load()
          return false
        }
      })
    } finally {
      inFlight.current = commands.active()
      if (!quiet) { busyRef.current = false; setBusy(false) }
      if (!inFlight.current && dirty.current) {
        dirty.current = false
        void load()
      }
    }
  }, [api, applyGame, errorText, load, commands])

  // Acknowledge this game's notifications while the match is on screen.
  const acknowledged = useRef(new Set<string>())
  const unreadKey = unreadNotificationIds.join('|')
  const loaded = game !== null
  useEffect(() => {
    if (!api || !loaded) return
    const acknowledge = () => {
      if (document.visibilityState !== 'visible') return
      const fresh = unreadNotificationIds.filter(id => !acknowledged.current.has(id)).slice(0, 100)
      if (fresh.length === 0) return
      for (const id of fresh) acknowledged.current.add(id)
      acknowledgeMultiplayerNotifications(fresh)
        .catch(() => { for (const id of fresh) acknowledged.current.delete(id) })
    }
    acknowledge()
    document.addEventListener('visibilitychange', acknowledge)
    return () => document.removeEventListener('visibilitychange', acknowledge)
    // unreadKey stands in for the id list.
  }, [api, loaded, unreadKey])

  // ------------------------------------------------------------ placing tiles

  const placeFromRack = (rackIndex: number, row: number, col: number) => {
    const current = gameRef.current
    if (!current) return
    if (current.rack[rackIndex] === '?') {
      if (squareFree(current.board, draft, row, col)) setBlankPick({ rackIndex, row, col })
      return
    }
    setDraft(placeTile(draft, current.board, current.rack, rackIndex, row, col))
    setSelected(null)
  }

  const handleDrop = (source: DragSource, target: DropTarget) => {
    const current = gameRef.current
    if (!current || swap !== null) return
    if (source.kind === 'rack') {
      if (target?.kind === 'square') placeFromRack(source.rackIndex, target.row, target.col)
      return
    }
    if (target?.kind === 'square') setDraft(moveDraftTile(draft, current.board, source, target))
    else setDraft(recallTile(draft, source.row, source.col))
  }

  const handleTap = (source: DragSource) => {
    if (source.kind === 'board') {
      setDraft(recallTile(draft, source.row, source.col))
      return
    }
    activateRackTile(source.rackIndex)
  }

  const activateRackTile = (rackIndex: number) => {
    if (swap) {
      const next = new Set(swap)
      if (!next.delete(rackIndex)) next.add(rackIndex)
      setSwap(next)
    } else setSelected(selected === rackIndex ? null : rackIndex)
  }

  const drag = useTileDrag({ enabled: moveAllowed && !busy, onDrop: handleDrop, onTap: handleTap })

  const handleSquareClick = (row: number, col: number) => {
    if (!moveAllowed || busy) return
    boardRef.current?.focus()
    if (selected !== null && swap === null) placeFromRack(selected, row, col)
    else setCursor({ row, col })
  }

  const handleBoardKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = gameRef.current
    if (!current || !moveAllowed || busy || swap !== null || event.ctrlKey || event.metaKey || event.altKey) return
    const state = { cursor: cursor ?? defaultCursor(current.board, draft), direction }
    const key = event.key
    if (key.startsWith('Arrow')) {
      event.preventDefault()
      setCursor(moveCursor(state.cursor, key))
    } else if (key === ' ') {
      event.preventDefault()
      setCursor(state.cursor)
      setDirection(direction === 'across' ? 'down' : 'across')
    } else if (key === 'Enter') {
      event.preventDefault()
      void play()
    } else if (key === 'Backspace' || key === 'Delete') {
      event.preventDefault()
      const result = backspace(draft, current.board, state)
      setDraft(result.draft)
      setCursor(result.state.cursor)
    } else if (key.length === 1) {
      const result = typeLetter(draft, current.board, current.rack, state, key, alphabet(current.language))
      if (result.placed) {
        event.preventDefault()
        setDraft(result.draft)
        setCursor(result.state.cursor)
        setSelected(null)
      }
    }
  }

  const handleBoardFocus = () => {
    const current = gameRef.current
    if (current && moveAllowed && !cursor) setCursor(defaultCursor(current.board, draft))
  }

  // Fixed identities, so the memoised board and rack are not re-rendered by unrelated state.
  const onSquareClick = useStableCallback(handleSquareClick)
  const onBoardKey = useStableCallback(handleBoardKey)
  const onBoardFocus = useStableCallback(handleBoardFocus)
  const onActivateRackTile = useStableCallback(activateRackTile)
  const onDraftPointerDown = useStableCallback((event: ReactPointerEvent<HTMLElement>, tile: DraftTile) => {
    const current = gameRef.current
    if (current) drag.begin(event, { kind: 'board', row: tile.row, col: tile.col }, { letter: tile.letter, blank: tile.blank, language: current.language })
  })
  const onRackPointerDown = useStableCallback((event: ReactPointerEvent<HTMLElement>, rackIndex: number) => {
    const current = gameRef.current
    const letter = current?.rack[rackIndex]
    if (current && letter !== undefined) drag.begin(event, { kind: 'rack', rackIndex }, { letter, blank: letter === '?', language: current.language })
  })

  // Escape: dialogs and Hubert's menu close themselves; then a selection or swap mode; otherwise back to the lobby.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (isAnyDialogOpen() || document.body.classList.contains('wp-dragging')) return
      if (event.target instanceof Element && event.target.closest('[data-own-escape]')) return
      event.preventDefault()
      if (selected !== null) setSelected(null)
      else if (swap !== null) setSwap(null)
      else onBack()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [selected, swap, onBack])

  // ------------------------------------------------------------ Hubert

  // The room acts the feeding out; this only tells the service.
  const feedHubert = async (kind: HubertFood) => {
    if (!api) return
    try {
      const result = await api.command({ operationId: newOperationId(), type: 'hubert', gameId, kind })
      if (result.game) applyGame(result.game)
    } catch (error) {
      toast.error(errorText(error))
    }
  }

  // ------------------------------------------------------------ commands

  // The room shows our emoji at once; this only stores it for the opponent.
  const sendReaction = async (emoji: MultiplayerReactionEmoji) => {
    if (!api) return
    try {
      const result = await api.command({ operationId: newOperationId(), type: 'react', gameId, emoji })
      if (result.game) applyGame(result.game)
    } catch (error) {
      toast.error(multiplayerErrorInfo(error).code === 'MULTIPLAYER_TOO_SOON' ? labelsRef.current.match.react.tooSoon : errorText(error))
    }
  }

  const play = async () => {
    if (preview.status !== 'ok' || !moveAllowed || busy) return
    // The turn passes on screen at once while the move is saved to the shared drive (can take seconds).
    setSendingMove(true)
    try {
      await run(revision => ({ operationId: newOperationId(), type: 'move', gameId, expectedRevision: revision, placements }))
    } finally {
      setSendingMove(false)
    }
  }

  const confirmSwap = async () => {
    const current = gameRef.current
    if (!current || !swap || swap.size === 0) return
    const letters = [...swap].sort((a, b) => a - b).map(index => current.rack[index])
    if (await run(revision => ({ operationId: newOperationId(), type: 'exchange', gameId, expectedRevision: revision, letters }))) setSwap(null)
  }

  const decideWords = (accept: boolean) => run(revision => ({ operationId: newOperationId(), type: 'approve-word', gameId, expectedRevision: revision, accept }))

  const sendChat = useCallback((text: string) => run(() => ({ operationId: newOperationId(), type: 'chat', gameId, text }), { quiet: true }), [run, gameId])

  const rematch = async () => {
    const current = gameRef.current
    if (!api || !current || busyRef.current) return
    const opponent = opponentOf(current, myEmail)
    busyRef.current = true
    setBusy(true)
    try {
      await api.command({ operationId: newOperationId(), type: 'challenge', opponentEmail: opponent.email, language: current.language })
      toast.success(labelsRef.current.toast.rematchSent(opponent.name))
      onBack()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  // ------------------------------------------------------------ render

  const backButton = (
    <button type="button" className="bgr-back" onClick={onBack}>
      <ArrowLeft size={16} weight="bold" aria-hidden="true" />
      {labels.backToLobby}
    </button>
  )

  if (!game) {
    return (
      <BoardGameRoom
        className="wp-room"
        topbar={backButton}
        board={(
          <PaperNote className="wp-status" role={loadError ? 'alert' : 'status'}>
            <p style={{ margin: 0 }}>{loadError ?? labels.loading}</p>
            {loadError && (
              <p style={{ margin: '0.75rem 0 0' }}>
                <button type="button" className="bgr-chip" onClick={() => { setLoadError(null); void load() }}>{labels.retry}</button>
              </p>
            )}
          </PaperNote>
        )}
        hubert={null}
        me={0}
        players={['', '']}
        hubertLabels={l.hubert}
      />
    )
  }

  const opponent = opponentOf(game, myEmail)
  const playing = game.status === 'active' || game.status === 'awaiting-approval'
  const finished = game.status === 'finished'
  const outcome = outcomeFor(game, myEmail)
  const placedCount = draft.tiles.length
  const swapCount = swap?.size ?? 0
  const turnMine = moveAllowed || approver

  const topbar = (
    <>
      {backButton}
      <h1 className="bgr-title">
        <LanguageFlag language={game.language} />
        <span className="bgr-title__name">{labels.gameName}</span>
        <span className="bgr-title__sub">{labels.languageNames[game.language]}</span>
      </h1>
      {playing && (
        <span className="bgr-turn" data-mine={turnMine && !sendingMove ? '' : undefined} role="status">
          {sendingMove ? l.sending : turnMine ? l.yourTurn : l.theirTurn(opponent.name)}
        </span>
      )}
    </>
  )

  const moreActions = playing && swap === null ? (
    <div className="wp-more">
      <button type="button" className="bgr-chip" disabled={!moveAllowed || busy} onClick={() => setConfirm('pass')}>
        <HandPalm size={16} aria-hidden="true" />{l.pass}
      </button>
      <button
        type="button"
        className="bgr-chip"
        disabled={!moveAllowed || busy || !canExchange(game)}
        title={canExchange(game) ? undefined : l.exchangeNeedsBag}
        onClick={() => { setDraft(recallAll(draft)); setSelected(null); setSwap(new Set()) }}
      >
        <ArrowsLeftRight size={16} aria-hidden="true" />{l.exchange}
      </button>
      <button type="button" className="bgr-chip" data-tone="danger" disabled={busy} onClick={() => setConfirm('resign')}>
        <Flag size={16} aria-hidden="true" />{l.resign}
      </button>
    </div>
  ) : null

  // The word check is decided on the move note, next to the words and their score.
  const decision = game.status === 'awaiting-approval' && game.pending ? (
    <div className="wp-decision" role="status">
      {approver ? (
        <>
          <strong>{l.approval.approverTitle(opponent.name)}</strong>
          <p>{l.approval.approverBody(opponent.name)}</p>
          <div className="wp-decision__actions">
            <ActionChip className="bgr-chip" data-tone="good" disabled={busy} onAction={() => decideWords(true)}>{l.approval.approve}</ActionChip>
            <ActionChip className="bgr-chip" disabled={busy} onAction={() => decideWords(false)}>{l.approval.reject}</ActionChip>
          </div>
        </>
      ) : (
        <>
          <strong>{l.approval.moverTitle(opponent.name)}</strong>
          <p>{l.approval.moverBody}</p>
        </>
      )}
    </div>
  ) : null

  const playArea = (
    <>
      <WordBoard
        board={game.board}
        language={game.language}
        draft={draft}
        pending={game.pending?.placements ?? NO_PLACEMENTS}
        cursor={moveAllowed ? cursor : null}
        direction={direction}
        interactive={moveAllowed && !busy}
        labels={l}
        boardRef={boardRef}
        onSquareClick={onSquareClick}
        onDraftPointerDown={onDraftPointerDown}
        onKeyDown={onBoardKey}
        onFocus={onBoardFocus}
      />
    </>
  )

  const tray = (
    <>
      {finished && (
        <div className="wp-banner">
          <TapedNote tone={outcome === 'won' ? 'win' : undefined} role="status">
            <div className="wp-banner__row">
              <Trophy size={30} weight="duotone" aria-hidden="true" />
              <strong>{outcome === 'won' ? l.finished.won : outcome === 'draw' ? l.finished.draw : l.finished.lost(opponent.name)}</strong>
              <p>
                {l.finished.final}: {game.players[0].name} {game.scores[0]}, {game.players[1].name} {game.scores[1]}
                {game.finishedReason ? `. ${labels.lobby.reason[game.finishedReason]}` : ''}
              </p>
            </div>
            <div className="wp-banner__row">
              <RoomCalls />
              <ActionChip className="bgr-chip" data-tone="primary" disabled={busy} onAction={() => rematch()}>{l.finished.rematch}</ActionChip>
              <button type="button" className="bgr-chip" onClick={onBack}>{labels.backToLobby}</button>
            </div>
          </TapedNote>
        </div>
      )}

      {playing && (
        <>
          <TileRack
            rack={game.rack}
            draft={draft}
            language={game.language}
            labels={l}
            selected={selected}
            swap={swap}
            active={moveAllowed && !busy}
            onPointerDown={onRackPointerDown}
            onActivate={onActivateRackTile}
          />

          {/* Always rendered so selecting a tile never changes the tray height (the board would resize). */}
          {swap === null && <p className="bgr-hint" data-reserved={selected === null ? '' : undefined}>{l.placeHint}</p>}

          {swap ? (
            <div className="wp-actions" data-mode="swap">
              <p className="bgr-hint">{l.exchangeHint}</p>
              <div className="wp-actions__group">
                <button type="button" className="bgr-chip" onClick={() => setSwap(null)}>{labels.cancel}</button>
                <ActionChip className="bgr-chip" data-tone="primary" disabled={busy || swapCount === 0} onAction={() => confirmSwap()}>
                  {l.exchangeConfirm(swapCount)}
                </ActionChip>
              </div>
            </div>
          ) : (
            <div className="wp-actions">
              <RoomCalls />
              <div className="wp-actions__group">
                <button type="button" className="bgr-chip" onClick={() => setDraft(shuffleRack(draft))}>
                  <Shuffle size={16} aria-hidden="true" />{l.shuffle}
                </button>
                <button type="button" className="bgr-chip" disabled={placedCount === 0 || busy} onClick={() => setDraft(recallAll(draft))}>
                  <ArrowsClockwise size={16} aria-hidden="true" />{l.recall}
                </button>
              </div>
              <div className="wp-actions__group">
                {preview.status === 'ok' && <span className="wp-score-chip" aria-hidden="true">+{preview.total}</span>}
                <button type="button" className="bgr-chip" data-tone="primary" disabled={preview.status !== 'ok' || !moveAllowed || busy} onClick={() => void play()}>
                  {sendingMove && <CircleNotch size={16} weight="bold" aria-hidden="true" className="motion-safe:animate-spin" />}{busy ? l.playing : l.play}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )

  const panels = (
    <>
      <PlayersCard game={sendingMove && playing ? { ...game, turn: opponent.email } : game} labels={l} teamName={teamName} />
      <MoveCard game={game} labels={l} moveErrors={labels.moveErrors} preview={preview} placedCount={placedCount} canMove={moveAllowed} footer={<>{decision}{moreActions}</>} />
      <ChatPanel
        messages={game.chat}
        me={game.me}
        opponentName={opponent.name}
        language={language}
        labels={l.chat}
        disabled={busy}
        onSend={sendChat}
      />
      <div className="bgr-panels__row">
        <HistoryCard game={game} labels={l} />
        <KeyboardHelp labels={l.keyboard} />
      </div>
    </>
  )

  const overlay: ReactNode = (
    <>
      {drag.ghost}

      <BlankPicker
        open={blankPick !== null}
        language={game.language}
        labels={l.blank}
        onClose={() => setBlankPick(null)}
        onPick={letter => {
          const pick = blankPick
          setBlankPick(null)
          if (pick) {
            setDraft(placeTile(draft, game.board, game.rack, pick.rackIndex, pick.row, pick.col, letter))
            setSelected(null)
          }
        }}
      />

      <AlertDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'resign' ? l.confirmResign.title : l.confirmPass.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === 'resign' ? l.confirmResign.body : l.confirmPass.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{l.keepPlaying}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const kind = confirm
                setConfirm(null)
                if (kind === 'resign') void run(revision => ({ operationId: newOperationId(), type: 'resign', gameId, expectedRevision: revision }))
                else if (kind === 'pass') void run(revision => ({ operationId: newOperationId(), type: 'pass', gameId, expectedRevision: revision }))
              }}
            >
              {confirm === 'resign' ? l.confirmResign.confirm : l.confirmPass.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return (
    <BoardGameRoom
      className="wp-room"
      topbar={topbar}
      board={playArea}
      tray={tray}
      panels={panels}
      overlay={overlay}
      hubert={game.hubert ?? null}
      me={game.me}
      players={[game.players[0].name, game.players[1].name]}
      hubertLabels={l.hubert}
      onFeedHubert={api ? feedHubert : undefined}
      reactions={game.reactions}
      reactionScope={reactionScope(myEmail, gameId)}
      reactionLabels={l.react}
      onReact={api ? sendReaction : undefined}
    />
  )
})
