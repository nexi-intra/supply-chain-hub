import { ActionChip } from '@/components/boardgame/ActionChip'
import { useGameChangeWatch } from '@/hooks/useGameChangeWatch'
import { acknowledgeMultiplayerNotifications } from '@/lib/multiplayerAcknowledge'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowCounterClockwise, ArrowLeft, Check, CircleNotch, Flag, Trophy } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BoardGameRoom, RoomCalls } from '@/components/boardgame/BoardGameRoom'
import { ChatPanel } from '@/components/boardgame/ChatPanel'
import { IndexCard, PaperNote, ScorePad, TapedNote } from '@/components/boardgame/Paper'
import { ChessKeyboardHelp } from '@/components/chess/ChessPanels'
import type { BackgammonStep, HubertFood, MultiplayerAnyGame, MultiplayerBackgammonGame, MultiplayerCommand, MultiplayerReactionEmoji } from '@/lib/multiplayer'
import { sameJson } from '@/lib/multiplayerSnapshotStore'
import { getMultiplayerLabels, type MultiplayerLabels } from '@/lib/multiplayerLabels'
import { applyStep, describeSteps, nextSteps, removeDie, turnPlan, type BgColor, type BgPosition } from '@/lib/backgammon'
import { canMove, multiplayerErrorInfo, newOperationId, opponentOf, outcomeFor } from '@/lib/multiplayerView'
import { isAnyDialogOpen } from '@/lib/modalStack'
import { createGameCommandQueue } from '@/lib/gameCommandQueue'
import { reactionScope } from '@/lib/multiplayerReactions'
import { BackgammonBoard } from './BackgammonBoard'
import '@/components/multiplayer/multiplayer.css'
import './backgammon.css'

export interface BackgammonGameProps {
  gameId: string
  myEmail: string
  teamName: (code: string) => string
  unreadNotificationIds: string[]
  onBack: () => void
}

const NO_STEPS: BackgammonStep[] = []
const wire = ({ from, to, die }: BackgammonStep): BackgammonStep => ({ from, to, die })

/** Both players: colour, pip count and checkers borne off; the opponent on top, as across the board. */
const PlayersCard = memo(function PlayersCard({ game, labels, teamName }: { game: MultiplayerBackgammonGame; labels: MultiplayerLabels; teamName: (code: string) => string }) {
  const b = labels.backgammon
  const playing = game.status === 'active'
  const order = game.me === 0 ? [1, 0] : [0, 1]
  return (
    <ScorePad title={labels.match.players} label={labels.match.players}>
      {order.map(seat => {
        const player = game.players[seat]
        const color: BgColor = seat === game.whiteIndex ? 'white' : 'black'
        const onTurn = playing && game.turn === player.email
        return (
          <div key={player.email} className="wp-player bgm-player" data-turn={onTurn ? '' : undefined} data-me={seat === game.me ? '' : undefined}>
            <span className="bgm-chip-checker" data-color={color} aria-hidden="true" />
            <span>
              <span className="wp-player__name">{player.name}</span>
              <span className="wp-player__meta">{teamName(player.teamCode)} · {b.colors[color]}</span>
            </span>
            <span className="wp-player__score bgm-player__score">
              <span>{b.pips} {game.bg.pips[color]}</span>
              <span>{b.off} {game.bg.off[color]}/15</span>
            </span>
            {onTurn && <span className="wp-player__turn">{labels.match.onTurn}</span>}
          </div>
        )
      })}
    </ScorePad>
  )
})

export const BackgammonGame = memo(function BackgammonGame({ gameId, myEmail, teamName, unreadNotificationIds, onBack }: BackgammonGameProps) {
  const { language } = useLanguage()
  const labels = getMultiplayerLabels(language)
  const l = labels.match
  const b = labels.backgammon
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  const api = typeof window === 'undefined' ? undefined : window.electronMultiplayer

  const [game, setGame] = useState<MultiplayerBackgammonGame | null>(null)
  const gameRef = useRef<MultiplayerBackgammonGame | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [commands] = useState(createGameCommandQueue)
  const [sendingTurn, setSendingTurn] = useState(false)
  const inFlight = useRef(false)
  const dirty = useRef(false)
  const generation = useRef(0)
  const [staged, setStaged] = useState<BackgammonStep[]>(NO_STEPS)
  const [selected, setSelected] = useState<number | 'bar' | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const errorText = useCallback((error: unknown): string => {
    const text = labelsRef.current
    const info = multiplayerErrorInfo(error)
    if (info.code === 'MULTIPLAYER_INVALID_MOVE' && info.detail) return text.moveErrors[info.detail]
    return info.code ? text.errors[info.code] : text.errors.generic
  }, [])

  const applyGame = useCallback((next: MultiplayerAnyGame) => {
    if (next.type !== 'backgammon') return
    const current = gameRef.current
    if (current && (next.revision < current.revision || sameJson(next, current))) return
    if (!current || next.revision !== current.revision) {
      setStaged(NO_STEPS)
      setSelected(null)
    }
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

  const run = useCallback(async (build: (revision: number) => MultiplayerCommand, { quiet = false }: { quiet?: boolean } = {}): Promise<boolean> => {
    // A second turn/resign while one is on its way is a double click; a chat message (quiet) never locks the board.
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
          if (code === 'MULTIPLAYER_CONFLICT' || code === 'MULTIPLAYER_STATE' || code === 'MULTIPLAYER_NOT_YOUR_TURN' || code === 'MULTIPLAYER_INVALID_MOVE') {
            setStaged(NO_STEPS)
            void load()
          }
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

  // Escape: a picked checker first, then the staged moves, then back to the lobby.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (isAnyDialogOpen()) return
      if (event.target instanceof Element && event.target.closest('[data-own-escape]')) return
      event.preventDefault()
      if (selected !== null) setSelected(null)
      else onBack()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [selected, onBack])

  // The opponent's turn is announced for screen readers.
  const turnCount = game?.bg.turnCount ?? 0
  const seenTurns = useRef<number | null>(null)
  useEffect(() => {
    const current = gameRef.current
    if (!current) return
    const before = seenTurns.current
    seenTurns.current = turnCount
    if (before === null || turnCount <= before || !current.bg.lastTurn) return
    const last = current.bg.lastTurn
    const seat = last.by === 'white' ? current.whiteIndex : 1 - current.whiteIndex
    const text = labelsRef.current.backgammon
    const dice = text.dice(last.dice[0], last.dice[1])
    setAnnouncement(last.steps.length
      ? text.lastTurn(current.players[seat].name, dice, describeSteps(last.steps, last.by, text.bar, text.off))
      : text.lastTurnBlocked(current.players[seat].name, dice))
  }, [turnCount])

  // ------------------------------------------------------------ the turn being built

  const moveAllowed = game ? canMove(game, myEmail) : false
  // The opponent's move appears as soon as its game file is saved (see useGameChangeWatch).
  useGameChangeWatch(api, gameId, {
    active: Boolean(game) && game?.status !== 'finished',
    waiting: game?.status === 'active' && !moveAllowed,
    onChange: () => { if (inFlight.current) dirty.current = true; else void load() },
  })
  const myColor: BgColor = game?.bg.myColor ?? 'white'
  const plan = useMemo(() => {
    if (!game || !moveAllowed) return null
    return turnPlan({ points: game.bg.points, bar: game.bg.bar, off: game.bg.off }, game.bg.myColor, game.bg.dice)
  }, [game, moveAllowed])

  const working = useMemo(() => {
    if (!game) return null
    let position: BgPosition = { points: game.bg.points, bar: game.bg.bar, off: game.bg.off }
    let remaining = plan ? plan.dice : []
    const played: BackgammonStep[] = []
    for (const step of staged) {
      const result = applyStep(position, myColor, step)
      position = result.position
      remaining = removeDie(remaining, step.die)
      played.push({ ...step, ...(result.hit ? { hit: true } : {}) })
    }
    const options = plan && !busy ? nextSteps(position, myColor, plan, staged, remaining) : NO_STEPS
    return { position, remaining, played, options }
  }, [game, plan, staged, myColor, busy])

  const stage = useCallback((step: BackgammonStep) => {
    setStaged(current => [...current, wire(step)])
    setSelected(null)
  }, [])
  const undo = () => { setStaged(NO_STEPS); setSelected(null) }
  const submit = async () => {
    const steps = staged.map(wire)
    // Answer the click at once: the turn shows as handed in while it is saved to the shared drive (can take seconds).
    setSendingTurn(true)
    try {
      const ok = await run(revision => ({ operationId: newOperationId(), type: 'bg-move', gameId, expectedRevision: revision, steps }))
      if (!ok) setStaged(NO_STEPS)
    } finally {
      setSendingTurn(false)
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

  const sendChat = useCallback((text: string) => run(() => ({ operationId: newOperationId(), type: 'chat', gameId, text }), { quiet: true }), [run, gameId])

  const sendReaction = async (emoji: MultiplayerReactionEmoji) => {
    if (!api) return
    try {
      const result = await api.command({ operationId: newOperationId(), type: 'react', gameId, emoji })
      if (result.game) applyGame(result.game)
    } catch (error) {
      toast.error(multiplayerErrorInfo(error).code === 'MULTIPLAYER_TOO_SOON' ? labelsRef.current.match.react.tooSoon : errorText(error))
    }
  }

  const rematch = async () => {
    const current = gameRef.current
    if (!api || !current || busyRef.current) return
    const opponent = opponentOf(current, myEmail)
    busyRef.current = true
    setBusy(true)
    try {
      await api.command({ operationId: newOperationId(), type: 'challenge', opponentEmail: opponent.email, gameType: 'backgammon', color: current.bg.myColor === 'white' ? 'black' : 'white' })
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

  if (!game || !working) {
    return (
      <BoardGameRoom
        className="bgm-room"
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

  const bg = game.bg
  const opponent = opponentOf(game, myEmail)
  const playing = game.status === 'active'
  const finished = game.status === 'finished'
  const outcome = outcomeFor(game, myEmail)
  const diceText = bg.dice.length === 2 ? b.dice(bg.dice[0], bg.dice[1]) : ''
  const required = plan?.required ?? 0
  const blocked = moveAllowed && required === 0
  const turnReady = moveAllowed && !blocked && working.options.length === 0 && staged.length > 0
  const usedDice = staged.map(step => step.die)
  const last = bg.lastTurn
  const lastSeat = last ? (last.by === 'white' ? game.whiteIndex : 1 - game.whiteIndex) : null

  const topbar = (
    <>
      {backButton}
      <h1 className="bgr-title">
        <span className="bgm-chip-checker bgm-title-chip" data-color={myColor} aria-hidden="true" />
        <span className="bgr-title__name">{labels.gameNames.backgammon}</span>
        <span className="bgr-title__sub">{b.playsAs(b.colors[myColor])}</span>
      </h1>
      {playing && (
        <span className="bgr-turn" data-mine={moveAllowed && !sendingTurn ? '' : undefined} role="status">
          {sendingTurn ? b.sending : moveAllowed ? b.yourTurn : b.theirTurn(opponent.name)}
        </span>
      )}
    </>
  )

  let hint: string
  if (sendingTurn) hint = b.sendingHint(opponent.name)
  else if (!moveAllowed) hint = last && lastSeat !== null ? (last.steps.length ? b.lastTurn(game.players[lastSeat].name, b.dice(last.dice[0], last.dice[1]), describeSteps(last.steps, last.by, b.bar, b.off)) : b.lastTurnBlocked(game.players[lastSeat].name, b.dice(last.dice[0], last.dice[1]))) : b.opening(bg.opening?.white ?? 0, bg.opening?.black ?? 0)
  else if (blocked) hint = `${b.rolled(diceText)} ${b.noMoves}`
  else if (turnReady) hint = b.doneHint
  else if (selected !== null) hint = b.targetHint
  else if (working.position.bar[myColor] > 0) hint = `${b.rolled(diceText)} ${b.mustEnter}`
  else if (working.options.some(step => step.to === 'off')) hint = `${b.rolled(diceText)} ${b.bearOff}`
  else hint = `${b.rolled(diceText)} ${b.selectHint}`

  const playArea = (
    <div className="bgm-board-wrap">
      <BackgammonBoard
        position={working.position}
        me={myColor}
        dice={playing ? bg.dice : []}
        usedDice={usedDice}
        diceKey={`${bg.turnCount}-${bg.dice.join('')}`}
        options={working.options}
        selected={selected}
        onSelect={setSelected}
        onMove={stage}
        lastFrom={!moveAllowed && last ? last.steps.map(step => step.from) : []}
        lastTo={!moveAllowed && last ? last.steps.map(step => step.to) : []}
        labels={b}
      />
    </div>
  )

  const kind = game.winPoints ? b.finished.kinds[Math.min(3, Math.max(1, game.winPoints)) - 1] : b.finished.kinds[0]
  const finishTitle = outcome === 'won' ? b.finished.won(kind) : b.finished.lost(opponent.name, kind)

  const tray = (
    <>
      {finished && (
        <div className="wp-banner bgm-banner">
          <TapedNote tone={outcome === 'won' ? 'win' : undefined} role="status">
            <div className="wp-banner__row">
              <Trophy size={30} weight="duotone" aria-hidden="true" />
              <strong>{finishTitle}</strong>
              <p>{game.finishedReason ? labels.lobby.reason[game.finishedReason] : ''}</p>
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
          <p className="bgr-hint" data-testid="bgm-hint">{hint}</p>
          <div className="wp-actions bgm-actions">
            <RoomCalls />
            {moveAllowed && !blocked && (
              <>
                <span className="bgm-left" aria-live="polite">{b.left(Math.max(0, required - staged.length))}</span>
                <button type="button" className="bgr-chip" disabled={busy || staged.length === 0} onClick={undo}>
                  <ArrowCounterClockwise size={16} aria-hidden="true" />{b.undo}
                </button>
                <button type="button" className="bgr-chip" data-tone="primary" disabled={busy || !turnReady} aria-busy={sendingTurn || undefined} onClick={() => void submit()}>
                  {sendingTurn ? <CircleNotch size={16} weight="bold" aria-hidden="true" className="motion-safe:animate-spin" /> : <Check size={16} weight="bold" aria-hidden="true" />}{sendingTurn ? b.sending : b.confirm}
                </button>
              </>
            )}
            {blocked && (
              <button type="button" className="bgr-chip" data-tone="primary" disabled={busy} aria-busy={sendingTurn || undefined} onClick={() => void submit()}>
                {sendingTurn ? <CircleNotch size={16} weight="bold" aria-hidden="true" className="motion-safe:animate-spin" /> : <Check size={16} weight="bold" aria-hidden="true" />}{sendingTurn ? b.sending : b.pass}
              </button>
            )}
          </div>
        </>
      )}
    </>
  )

  const panels = (
    <>
      <PlayersCard game={game} labels={labels} teamName={teamName} />
      <IndexCard title={b.rules.title} label={b.rules.title} className="bgm-rules-card">
        <ul className="bgm-rules">
          {b.rules.items.map(item => <li key={item}>{item}</li>)}
        </ul>
        {playing && (
          <div className="wp-more">
            <button type="button" className="bgr-chip" data-tone="danger" disabled={busy} onClick={() => setConfirmResign(true)}>
              <Flag size={16} aria-hidden="true" />{l.resign}
            </button>
          </div>
        )}
      </IndexCard>
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
        <ChessKeyboardHelp labels={b.keyboard} />
      </div>
    </>
  )

  const overlay: ReactNode = (
    <>
      <p className="bgr-sr" aria-live="polite">{announcement}</p>
      <AlertDialog open={confirmResign} onOpenChange={setConfirmResign}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{l.confirmResign.title}</AlertDialogTitle>
            <AlertDialogDescription>{l.confirmResign.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{l.keepPlaying}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmResign(false)
                void run(revision => ({ operationId: newOperationId(), type: 'resign', gameId, expectedRevision: revision }))
              }}
            >
              {l.confirmResign.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return (
    <BoardGameRoom
      className="bgm-room"
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
