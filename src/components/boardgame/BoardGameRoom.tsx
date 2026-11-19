// The shared room for every board game in the Hub. A new game plugs in by rendering <BoardGameRoom>
// with its board in `board`, its controls in `tray` and its paper panels in `panels`, and by setting
// --bgr-board-w on `style`; Hubert, the light, the table and the feeding come with the room.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Bone, Cookie, PawPrint } from '@phosphor-icons/react'
import { MULTIPLAYER_HUBERT_LIMIT, MULTIPLAYER_REACTION_COOLDOWN_MS, MULTIPLAYER_REACTION_EMOJIS, type HubertFood, type MultiplayerHubert, type MultiplayerReaction, type MultiplayerReactionEmoji, type MultiplayerSeat } from '@/lib/multiplayer'
import type { MultiplayerLabels } from '@/lib/multiplayerLabels'
import { shouldAnimateFeeding } from '@/lib/hubertRoutine'
import { Hubert, type HubertFeeding } from './Hubert'
import { ReactionCall, ReactionLayer, type ReactionLabels } from './Reactions'
import { FloorLight, ROOM_STYLE, RoomBackdrop, TableProps } from './RoomScene'
import { useReactionPops } from './useReactionPops'
import { useRoomLayout } from './useRoomLayout'
import './boardgame.css'

export type HubertLabels = MultiplayerLabels['match']['hubert']

export interface BoardGameRoomProps {
  /** The top bar: back button, title, whose turn it is (classes bgr-back, bgr-title, bgr-turn). */
  topbar: ReactNode
  /** The centre piece on the table. */
  board: ReactNode
  /** Under the board: rack, buttons, hints. */
  tray?: ReactNode
  /** Paper objects beside the board (ScorePad, IndexCard, NotebookPanel, FoldedCard). */
  panels?: ReactNode
  /** Rendered after the room: dialogs, drag ghosts. */
  overlay?: ReactNode
  /** What the players have given Hubert in this game; null before anything is known. */
  hubert: MultiplayerHubert | null
  me: MultiplayerSeat
  /** Player names by seat, for "Bo gave Hubert a treat". */
  players: readonly [string, string]
  hubertLabels: HubertLabels
  /** Sends the feeding to the game service. The game reports its own errors. */
  onFeedHubert?: (kind: HubertFood) => Promise<void>
  /** The emoji the players have sent in this game; the opponent's pop up over the table once. */
  reactions?: readonly MultiplayerReaction[]
  /** Identifies this person and game for the memory of what was already shown (reactionScope). */
  reactionScope?: string | null
  reactionLabels?: ReactionLabels
  /** Sends an emoji to the game service. The game reports its own errors. */
  onReact?: (emoji: MultiplayerReactionEmoji) => Promise<void>
  /** Mug and bag by default; null for a bare table. */
  tableProps?: ReactNode
  /** Must set --bgr-board-w (the board's width) so the corner and the table can share the room. */
  style?: CSSProperties
  className?: string
}

interface RoomContext {
  left: Record<HubertFood, number>
  feedBusy: boolean
  canFeed: boolean
  labels: HubertLabels
  feed: (kind: HubertFood) => void
  react: { labels: ReactionLabels | undefined; canReact: boolean; cooling: boolean; send: (emoji: MultiplayerReactionEmoji) => void }
}

const Context = createContext<RoomContext | null>(null)

/** A feeding of our own that comes back from the service after this long is acted out again. */
const OWN_ECHO_MS = 30_000

export function BoardGameRoom({
  topbar, board, tray, panels, overlay, hubert, me, players, hubertLabels, onFeedHubert, reactions, reactionScope, reactionLabels, onReact, tableProps, style, className = '',
}: BoardGameRoomProps) {
  const roomRef = useRef<HTMLDivElement>(null)
  const laneRef = useRef<HTMLDivElement>(null)
  const cornerRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const playRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const topbarRef = useRef<HTMLElement>(null)
  const layout = useRoomLayout({ room: roomRef, lane: laneRef, corner: cornerRef, table: tableRef, play: playRef, board: boardRef, topbar: topbarRef }, true)

  const [feeding, setFeeding] = useState<HubertFeeding | null>(null)
  const [feedBusy, setFeedBusy] = useState(false)
  const busy = useRef(false)
  const seen = useRef<string | null>(null)
  const ownAt = useRef(0)
  const text = useRef({ hubertLabels, players, me })
  text.current = { hubertLabels, players, me }

  // Feedings are shared: when either player gives Hubert something he acts it out on both screens, once,
  // and only while it is fresh (an old feeding found when the game opens is history).
  const last = hubert?.last ?? null
  useEffect(() => {
    if (!last || seen.current === last.id) return
    const fresh = shouldAnimateFeeding(last, seen.current, Date.now())
    seen.current = last.id
    const { hubertLabels: labels, players: names, me: seat } = text.current
    const mine = last.by === seat
    // Our own feeding is already being acted out from the click.
    if (!fresh || (mine && Date.now() - ownAt.current < OWN_ECHO_MS)) return
    setFeeding({ id: last.id, side: mine ? 'near' : 'far', kind: last.kind, caption: labels.fed(last.kind, mine ? null : names[last.by]) })
    // The id stands in for the record.
  }, [last?.id])

  const feed = async (kind: HubertFood) => {
    if (!onFeedHubert || busy.current) return
    busy.current = true
    setFeedBusy(true)
    ownAt.current = Date.now()
    setFeeding({ id: `local-${ownAt.current}-${kind}`, side: 'near', kind, caption: hubertLabels.fed(kind, null) })
    try {
      await onFeedHubert(kind)
    } catch {
      // The game has told the player already.
    } finally {
      ownAt.current = Date.now()
      busy.current = false
      setFeedBusy(false)
    }
  }

  const given = hubert ?? { treats: [0, 0], bones: [0, 0] }
  const [cooling, setCooling] = useState(false)
  const coolTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(coolTimer.current), [])
  const { pops, caption: reactionCaption, showOwn } = useReactionPops(reactions, me, reactionScope ?? null, reaction => {
    if (!reactionLabels) return ''
    return reactionLabels.received(players[reaction.by], reactionLabels.names[MULTIPLAYER_REACTION_EMOJIS.indexOf(reaction.emoji)] ?? reaction.emoji)
  })
  // Our own emoji pops at once; the service only has to store it. The button rests for the service's cooldown.
  const react = (emoji: MultiplayerReactionEmoji) => {
    if (!onReact || cooling) return
    setCooling(true)
    coolTimer.current = setTimeout(() => setCooling(false), MULTIPLAYER_REACTION_COOLDOWN_MS)
    showOwn(emoji)
    void onReact(emoji).catch(() => {})
  }
  const context: RoomContext = {
    left: {
      treat: Math.max(0, MULTIPLAYER_HUBERT_LIMIT.treat - given.treats[me]),
      bone: Math.max(0, MULTIPLAYER_HUBERT_LIMIT.bone - given.bones[me]),
    },
    feedBusy,
    canFeed: Boolean(onFeedHubert),
    labels: hubertLabels,
    feed: kind => void feed(kind),
    react: { labels: reactionLabels, canReact: Boolean(onReact && reactionLabels), cooling, send: react },
  }

  return (
    <Context.Provider value={context}>
      <div className={`bgr-room ${className}`.trim()} ref={roomRef} style={{ ...ROOM_STYLE, ...style }} data-measured={layout ? '' : undefined}>
        <RoomBackdrop />
        <header className="bgr-topbar" ref={topbarRef}>{topbar}</header>
        <div className="bgr-lane" ref={laneRef} aria-hidden="true" />
        {layout && (
          <FloorLight
            x={layout.basket.x + (layout.dog.w * layout.basketScale) / 2}
            y={layout.basket.y + layout.dog.h * layout.basketScale * 0.82}
            w={layout.dog.w * layout.basketScale * 2.2}
            h={layout.dog.h * layout.basketScale * 1.1}
          />
        )}
        {layout && (
          <Hubert
            world={layout.world}
            basket={layout.basket}
            basketScale={layout.basketScale}
            dog={layout.dog}
            lookAt={layout.lookAt}
            woofs={hubertLabels.woofs}
            feeding={feeding}
          />
        )}
        <p className="bgr-sr" aria-live="polite">{feeding?.caption ?? ''}</p>
        <p className="bgr-sr" role="status">{reactionCaption}</p>
        <div className="bgr-stage">
          <div className="bgr-corner" ref={cornerRef} aria-hidden="true" />
          <div className="bgr-table" ref={tableRef} data-wings={layout?.wings ? '' : undefined}>
            <div className="bgr-table__top" aria-hidden="true" />
            <div className="bgr-table__play" ref={playRef}>
              {tableProps === undefined ? <TableProps /> : tableProps}
              <div className="bgr-board" ref={boardRef}>{board}</div>
              {tray && <div className="bgr-tray" data-room-obstacle="">{tray}</div>}
            </div>
            {panels && <aside className="bgr-panels" data-room-obstacle="">{panels}</aside>}
          </div>
        </div>
        <ReactionLayer pops={pops} />
        {overlay}
      </div>
    </Context.Provider>
  )
}
/** Feeding state for controls of a game inside the room. */
export function useBoardGameRoom(): RoomContext {
  const context = useContext(Context)
  if (!context) throw new Error('useBoardGameRoom must be used inside BoardGameRoom')
  return context
}

/** The room's buttons for the player's own side of the table: call Hubert and send an emoji. */
export function RoomCalls() {
  const { react } = useBoardGameRoom()
  return (
    <div className="bgr-calls">
      <HubertCall />
      {react.canReact && react.labels && <ReactionCall labels={react.labels} cooling={react.cooling} onPick={react.send} />}
    </div>
  )
}

/**
 * The paw button that calls Hubert to the player's side with a treat or a meat bone. Escape inside the
 * menu closes it (the menu is marked data-own-escape so a game's own Escape handling leaves it alone).
 */
export function HubertCall() {
  const { left, feedBusy, canFeed, labels, feed } = useBoardGameRoom()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [open])

  if (!canFeed) return null
  return (
    <div
      className="bgr-hubert-call"
      ref={ref}
      data-own-escape={open ? '' : undefined}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        setOpen(false)
        button.current?.focus()
      }}
    >
      <button
        ref={button}
        type="button"
        className="bgr-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.call}
        title={labels.callHint}
        disabled={feedBusy}
        onClick={() => setOpen(value => !value)}
      >
        <PawPrint size={17} weight="fill" aria-hidden="true" />
        <span className="bgr-hubert-call__label">{labels.call}</span>
        <span className="bgr-hubert-call__count" aria-hidden="true">{left.treat + left.bone}</span>
      </button>
      {open && (
        <div className="bgr-hubert-menu" role="menu" aria-label={labels.call}>
          <p className="bgr-hubert-menu__title">{labels.callHint}</p>
          {(['treat', 'bone'] as const).map(kind => {
            const Icon = kind === 'treat' ? Cookie : Bone
            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                className="bgr-hubert-menu__item"
                disabled={left[kind] === 0}
                autoFocus={kind === 'treat'}
                onClick={() => { setOpen(false); feed(kind) }}
              >
                <Icon size={20} weight="duotone" aria-hidden="true" />
                {kind === 'treat' ? labels.treat(left.treat) : labels.bone(left.bone)}
                {left[kind] === 0 && <small>{kind === 'treat' ? labels.treatsGone : labels.bonesGone}</small>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
