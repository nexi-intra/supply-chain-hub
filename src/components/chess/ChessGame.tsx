import { ActionChip } from '@/components/boardgame/ActionChip'
import { useGameChangeWatch } from '@/hooks/useGameChangeWatch'
import { acknowledgeMultiplayerNotifications } from '@/lib/multiplayerAcknowledge'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowCounterClockwise, ArrowLeft, Check, Flag, Handshake, SpeakerHigh, SpeakerSlash, Trophy } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BoardGameRoom, RoomCalls } from '@/components/boardgame/BoardGameRoom'
import { ChatPanel } from '@/components/boardgame/ChatPanel'
import { PaperNote, TapedNote } from '@/components/boardgame/Paper'
import type { HubertFood, MultiplayerAnyGame, MultiplayerChessGame, MultiplayerChessLegalMove, MultiplayerChessPromotion, MultiplayerCommand, MultiplayerReactionEmoji } from '@/lib/multiplayer'
import { sameJson } from '@/lib/multiplayerSnapshotStore'
import { useStableCallback } from '@/hooks/useStable'
import { getMultiplayerLabels } from '@/lib/multiplayerLabels'
import { advantage, parseFen, pendingStillValid, type PendingMove, type Side } from '@/lib/chessView'
import { canMove, multiplayerErrorInfo, newOperationId, opponentOf, outcomeFor } from '@/lib/multiplayerView'
import { isAnyDialogOpen } from '@/lib/modalStack'
import { reactionScope } from '@/lib/multiplayerReactions'
import { createChessAudio, loadChessSound, saveChessSound, type ChessSound } from './audio'
import { ChessBoard } from './ChessBoard'
import { ChessKeyboardHelp, ChessPlayersCard, ScoreSheet } from './ChessPanels'
import { pieceImage } from './pieces'
import '@/components/multiplayer/multiplayer.css'
import './chess.css'

export interface ChessGameProps {
  gameId: string
  myEmail: string
  teamName: (code: string) => string
  unreadNotificationIds: string[]
  onBack: () => void
}

const safeStorage = () => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

const NO_MOVES: readonly MultiplayerChessLegalMove[] = []

export const ChessGame = memo(function ChessGame({ gameId, myEmail, teamName, unreadNotificationIds, onBack }: ChessGameProps) {
  const { language } = useLanguage()
  const labels = getMultiplayerLabels(language)
  const l = labels.match
  const c = labels.chess
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  const api = typeof window === 'undefined' ? undefined : window.electronMultiplayer

  const [game, setGame] = useState<MultiplayerChessGame | null>(null)
  const gameRef = useRef<MultiplayerChessGame | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendingMove, setSendingMove] = useState(false)
  const inFlight = useRef(false)
  const dirty = useRef(false)
  const generation = useRef(0)
  const [syncKey, setSyncKey] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  // A move made on our own board that waits for "Confirm"; nothing is sent until then.
  const [pending, setPending] = useState<PendingMove | null>(null)
  const pendingRef = useRef<PendingMove | null>(null)
  pendingRef.current = pending
  const [confirm, setConfirm] = useState<'resign' | 'draw' | null>(null)
  const [soundOn, setSoundOn] = useState(() => loadChessSound(safeStorage()))
  const [announcement, setAnnouncement] = useState('')

  const audio = useMemo(() => createChessAudio({ enabled: soundOn }), [])
  useEffect(() => () => audio.dispose(), [audio])
  useEffect(() => { audio.setEnabled(soundOn) }, [audio, soundOn])
  const play = useCallback((sound: ChessSound) => audio.play(sound), [audio])

  const errorText = useCallback((error: unknown): string => {
    const text = labelsRef.current
    const info = multiplayerErrorInfo(error)
    if (info.code === 'MULTIPLAYER_INVALID_MOVE' && info.detail) return text.moveErrors[info.detail]
    return info.code ? text.errors[info.code] : text.errors.generic
  }, [])

  const applyGame = useCallback((next: MultiplayerAnyGame) => {
    if (next.type !== 'chess') return
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

  useEffect(() => {
    document.body.setAttribute('data-game-active', 'true')
    return () => document.body.removeAttribute('data-game-active')
  }, [])

  const run = useCallback(async (build: (revision: number) => MultiplayerCommand): Promise<boolean> => {
    const current = gameRef.current
    if (!api || !current || inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    try {
      const result = await api.command(build(current.revision))
      if (result.game) applyGame(result.game)
      return true
    } catch (error) {
      toast.error(errorText(error))
      const code = multiplayerErrorInfo(error).code
      if (code === 'MULTIPLAYER_CONFLICT' || code === 'MULTIPLAYER_STATE' || code === 'MULTIPLAYER_NOT_YOUR_TURN' || code === 'MULTIPLAYER_INVALID_MOVE') void load()
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
      if (dirty.current) {
        dirty.current = false
        void load()
      }
    }
  }, [api, applyGame, errorText, load])

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

  // A new move: announce it, chime on check, sound the end of the game.
  const moveCount = game?.chess.moves.length ?? 0
  const seenMoves = useRef<number | null>(null)
  const finishedNow = game?.status === 'finished'
  useEffect(() => {
    const current = gameRef.current
    if (!current) return
    const before = seenMoves.current
    seenMoves.current = moveCount
    if (before === null || moveCount <= before) return
    const last = current.chess.moves[moveCount - 1]
    const seat = last.by === 'white' ? current.whiteIndex : 1 - current.whiteIndex
    setAnnouncement(labelsRef.current.chess.moved(current.players[seat].name, last.san))
    if (current.chess.inCheck && !current.chess.outcome.over) {
      const timer = window.setTimeout(() => play('check'), 560)
      return () => clearTimeout(timer)
    }
  }, [moveCount, play])
  const wasFinished = useRef<boolean | null>(null)
  useEffect(() => {
    if (!loaded) return
    if (wasFinished.current === false && finishedNow) {
      const timer = window.setTimeout(() => play('end'), 900)
      wasFinished.current = finishedNow
      return () => clearTimeout(timer)
    }
    wasFinished.current = finishedNow
  }, [loaded, finishedNow, play])

  // ------------------------------------------------------------ commands

  const moveAllowed = game ? canMove(game, myEmail) : false
  // The opponent's move appears as soon as its game file is saved (see useGameChangeWatch).
  useGameChangeWatch(api, gameId, {
    active: Boolean(game) && game?.status !== 'finished',
    waiting: game?.status === 'active' && !moveAllowed,
    onChange: () => { if (inFlight.current) dirty.current = true; else void load() },
  })

  const sendMove = async (from: string, to: string, promotion?: MultiplayerChessPromotion) => {
    // The board already shows the move; the turn now also passes at once while it is saved (can take seconds on M:).
    setSendingMove(true)
    try {
      const ok = await run(revision => ({ operationId: newOperationId(), type: 'chess-move', gameId, expectedRevision: revision, from, to, ...(promotion ? { promotion } : {}) }))
      if (!ok) setSyncKey(key => key + 1)
    } finally {
      setSendingMove(false)
    }
  }

  const feedHubert = async (kind: HubertFood) => {
    if (!api) return
    try {
      const result = await api.command({ operationId: newOperationId(), type: 'hubert', gameId, kind })
      if (result.game) applyGame(result.game)
    } catch (error) {
      toast.error(errorText(error))
    }
  }

  const sendChat = useCallback((text: string) => run(() => ({ operationId: newOperationId(), type: 'chat', gameId, text })), [run, gameId])

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

  // The move stays on our own board until "Confirm"; the board already shows it and plays the landing sound.
  const onMove = useStableCallback((from: string, to: string, promotion?: MultiplayerChessPromotion) => {
    const current = gameRef.current
    if (!current) return
    setPending({ from, to, ...(promotion ? { promotion } : {}), fen: current.chess.fen })
  })
  const undoPending = useStableCallback(() => {
    if (!pendingRef.current) return
    pendingRef.current = null
    setPending(null)
    setSyncKey(key => key + 1)
  })
  // Fortryd/Bekræft unmount their own button; keyboard players keep their place on the board.
  const focusBoard = () => document.querySelector<HTMLElement>('.cx-room .cx-grid')?.focus({ preventScroll: true })
  const confirmPending = useStableCallback(() => {
    const move = pendingRef.current
    // Another command is still running: keep the move staged so the player can confirm again.
    if (!move || busy || inFlight.current) return
    // Cleared before sending so a double click or a repeated Enter cannot send the move twice.
    pendingRef.current = null
    setPending(null)
    void sendMove(move.from, move.to, move.promotion)
  })

  // A new position (opponent), a finished game (resigned, draw agreed, game over), no longer my move, or a move that
  // is no longer legal drops the waiting move. Chat, emoji and Hubert change the revision but not these, so they keep it.
  const currentFen = game?.chess.fen ?? ''
  const currentLegal = game?.chess.legalMoves ?? NO_MOVES
  const myMoveNow = moveAllowed && game?.status === 'active'
  useEffect(() => {
    if (pending && !pendingStillValid(pending, currentFen, currentLegal, myMoveNow)) undoPending()
  }, [pending, currentFen, currentLegal, myMoveNow, undoPending])

  // Enter confirms a waiting move. Escape: the promotion card and Hubert's menu close themselves; then a waiting
  // move is undone; then a lifted piece is put down; then back to the lobby.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Enter') {
        if (!pending || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isAnyDialogOpen()) return
        // Only from the board or with nothing focused; other widgets (chat, buttons, the keyboard help) keep their own Enter.
        const target = event.target
        if (target !== document.body && !(target instanceof Element && target.closest('.cx-board-wrap'))) return
        if (target instanceof Element && target.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"])')) return
        event.preventDefault()
        if (!event.repeat) confirmPending()
        return
      }
      if (event.key !== 'Escape') return
      if (isAnyDialogOpen() || document.body.classList.contains('cx-dragging')) return
      if (event.target instanceof Element && event.target.closest('[data-own-escape]')) return
      event.preventDefault()
      if (pending) undoPending()
      else if (selected) setSelected(null)
      else onBack()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [pending, selected, onBack, confirmPending, undoPending])

  const opponentName = game ? opponentOf(game, myEmail).name : ''
  const capturedPieces = game?.chess.captured
  const myColorNow = game?.chess.myColor
  const trayLabels = useMemo(() => ({ top: `${c.captured.title}: ${opponentName}`, bottom: `${c.captured.title}: ${c.captured.mine}` }), [c, opponentName])
  const material = useMemo(() => {
    if (!capturedPieces || !myColorNow) return { top: 0, bottom: 0 }
    return { top: advantage(capturedPieces, myColorNow === 'white' ? 'black' : 'white'), bottom: advantage(capturedPieces, myColorNow) }
  }, [capturedPieces, myColorNow])

  const rematch = async () => {
    const current = gameRef.current
    if (!api || !current || inFlight.current) return
    const opponent = opponentOf(current, myEmail)
    inFlight.current = true
    setBusy(true)
    try {
      await api.command({ operationId: newOperationId(), type: 'challenge', opponentEmail: opponent.email, gameType: 'chess', color: current.chess.myColor === 'white' ? 'black' : 'white' })
      toast.success(labelsRef.current.toast.rematchSent(opponent.name))
      onBack()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    saveChessSound(next, safeStorage())
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
        className="cx-room"
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

  const chess = game.chess
  const opponent = opponentOf(game, myEmail)
  const playing = game.status === 'active'
  const finished = game.status === 'finished'
  const outcome = outcomeFor(game, myEmail)
  const myColor = chess.myColor
  const theirColor = myColor === 'white' ? 'black' : 'white'
  const drawOffer = playing ? game.drawOffer : null
  const offerIsMine = drawOffer?.by === game.me
  const incomingOffer = drawOffer && !offerIsMine
  const winnerSeat = game.winner && game.winner !== 'draw' ? game.players.findIndex(player => player.email === game.winner) : -1
  const fallenKing: Side | null = finished && winnerSeat >= 0 && (game.finishedReason === 'checkmate' || game.finishedReason === 'resigned')
    ? (winnerSeat === game.whiteIndex ? 'b' : 'w')
    : null
  const selectedPiece = selected ? parseFen(chess.fen).get(selected) : undefined
  const pieceName = (side: Side, type: keyof typeof c.pieces) => c.pieceName(side === 'w' ? c.sides.white : c.sides.black, c.pieces[type])

  const scoreText = (seat: 0 | 1) => {
    const value = game.winner === 'draw' ? 0.5 : game.winner === game.players[seat].email ? 1 : 0
    return value === 0.5 ? '½' : String(value)
  }

  const topbar = (
    <>
      {backButton}
      <h1 className="bgr-title">
        <img className="cx-title-piece" src={pieceImage('w', 'n')} alt="" aria-hidden="true" />
        <span className="bgr-title__name">{labels.gameNames.chess}</span>
        <span className="bgr-title__sub">{c.playsAs(c.colors[myColor])}</span>
      </h1>
      {playing && (
        <span className="bgr-turn" data-mine={moveAllowed && !sendingMove ? '' : undefined} data-check={chess.inCheck && !sendingMove ? '' : undefined} role="status">
          {sendingMove ? c.sending : moveAllowed ? (chess.inCheck ? `${c.yourTurn} · ${c.check}` : c.yourTurn) : c.theirTurn(opponent.name)}
          {/* Screen readers hear that a staged move still waits for Confirm (role="status" is atomic, so the whole line is read). */}
          {pending && !sendingMove ? <span className="bgr-sr">. {c.pendingHint}</span> : null}
        </span>
      )}
    </>
  )

  let hint: string
  if (pending) hint = c.pendingHint
  else if (sendingMove) hint = c.sendingHint(opponent.name)
  else if (!moveAllowed) hint = c.waitHint
  else if (selectedPiece) hint = c.targetHint(pieceName(selectedPiece.color, selectedPiece.type))
  else hint = chess.inCheck ? `${c.inCheck} ${c.selectHint}` : c.selectHint

  const playArea = (
    <ChessBoard
      fen={chess.fen}
      moves={chess.moves}
      bottom={myColor}
      legalMoves={moveAllowed && !busy && !pending ? chess.legalMoves : NO_MOVES}
      interactive={moveAllowed && !busy && !pending}
      lastMove={chess.lastMove}
      checkSquare={chess.checkSquare}
      fallenKing={fallenKing}
      captured={chess.captured}
      syncKey={syncKey}
      selected={selected}
      onSelect={setSelected}
      onMove={onMove}
      onSound={play}
      labels={c}
      trayLabels={trayLabels}
      advantage={material}
    />
  )

  const finishTitle = outcome === 'won'
    ? (game.finishedReason === 'checkmate' ? `${c.finished.checkmate} ${l.finished.won}` : l.finished.won)
    : outcome === 'draw' ? l.finished.draw : l.finished.lost(opponent.name)

  const tray = (
    <>
      {finished && (
        <div className="wp-banner cx-banner">
          <TapedNote tone={outcome === 'won' ? 'win' : undefined} role="status">
            <div className="wp-banner__row">
              <Trophy size={30} weight="duotone" aria-hidden="true" />
              <strong>{finishTitle}</strong>
              <p>
                {l.finished.final}: {game.players[0].name} {scoreText(0)}, {game.players[1].name} {scoreText(1)}
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

      {incomingOffer && (
        <div className="wp-banner cx-banner">
          <TapedNote role="alert">
            <div className="wp-banner__row">
              <Handshake size={28} weight="duotone" aria-hidden="true" />
              <strong>{c.draw.incoming(opponent.name)}</strong>
              <p>{c.draw.incomingBody}</p>
            </div>
            <div className="wp-banner__row">
              <ActionChip className="bgr-chip" data-tone="good" disabled={busy} onAction={() => run(revision => ({ operationId: newOperationId(), type: 'respond-draw', gameId, expectedRevision: revision, accept: true }))}>
                {c.draw.accept}
              </ActionChip>
              <ActionChip className="bgr-chip" disabled={busy} onAction={() => run(revision => ({ operationId: newOperationId(), type: 'respond-draw', gameId, expectedRevision: revision, accept: false }))}>
                {c.draw.decline}
              </ActionChip>
            </div>
          </TapedNote>
        </div>
      )}

      {playing && (
        <>
          <p className="bgr-hint" data-tone={moveAllowed && chess.inCheck && !sendingMove && !pending ? 'check' : undefined}>{hint}</p>
          <div className="wp-actions cx-actions">
            <RoomCalls />
            {pending && (
              <>
                <button type="button" className="bgr-chip" onClick={() => { undoPending(); focusBoard() }}>
                  <ArrowCounterClockwise size={16} aria-hidden="true" />{c.undo}
                </button>
                <button type="button" className="bgr-chip" data-tone="primary" disabled={busy} onClick={() => { confirmPending(); focusBoard() }}>
                  <Check size={16} weight="bold" aria-hidden="true" />{c.confirm}
                </button>
              </>
            )}
            <button type="button" className="bgr-chip" aria-pressed={soundOn} onClick={toggleSound} title={soundOn ? c.sound.off : c.sound.on}>
              {soundOn ? <SpeakerHigh size={16} aria-hidden="true" /> : <SpeakerSlash size={16} aria-hidden="true" />}
              {soundOn ? c.sound.on : c.sound.off}
            </button>
          </div>
        </>
      )}
    </>
  )

  const sheetFooter = playing ? (
    <div className="wp-more">
      <button type="button" className="bgr-chip" disabled={busy || Boolean(drawOffer)} onClick={() => setConfirm('draw')}>
        <Handshake size={16} aria-hidden="true" />{offerIsMine ? c.draw.offered : c.draw.offer}
      </button>
      <button type="button" className="bgr-chip" data-tone="danger" disabled={busy} onClick={() => setConfirm('resign')}>
        <Flag size={16} aria-hidden="true" />{l.resign}
      </button>
    </div>
  ) : null

  const panels = (
    <>
      <ChessPlayersCard game={sendingMove && playing ? { ...game, turn: opponent.email } : game} labels={labels} teamName={teamName} />
      <ScoreSheet game={game} labels={labels} footer={sheetFooter} />
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
        <ChessKeyboardHelp labels={c.keyboard} />
      </div>
    </>
  )

  const overlay: ReactNode = (
    <>
      <p className="bgr-sr" aria-live="polite">{announcement}</p>
      <AlertDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'draw' ? c.draw.confirmTitle : l.confirmResign.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === 'draw' ? c.draw.confirmBody : l.confirmResign.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{l.keepPlaying}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const kind = confirm
                setConfirm(null)
                if (kind === 'resign') void run(revision => ({ operationId: newOperationId(), type: 'resign', gameId, expectedRevision: revision }))
                else if (kind === 'draw') void run(revision => ({ operationId: newOperationId(), type: 'offer-draw', gameId, expectedRevision: revision }))
              }}
            >
              {confirm === 'draw' ? c.draw.confirm : l.confirmResign.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return (
    <BoardGameRoom
      className="cx-room"
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
