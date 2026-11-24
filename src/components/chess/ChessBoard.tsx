import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  MultiplayerChessColor, MultiplayerChessLegalMove, MultiplayerChessMove, MultiplayerChessPieceType, MultiplayerChessPromotion,
} from '@/lib/multiplayer'
import type { ChessLabels } from '@/lib/multiplayerLabels'
import {
  PROMOTION_ORDER, applyMove, cellToSquare, findLegal, glideDuration, moveFocus, movableSquares, needsPromotion, reconcile, sideOf,
  squareToCell, targetsFrom, trayOrder, type BoardState, type MovePlan, type Side, type TrackedPiece,
} from '@/lib/chessView'
import type { ChessSound } from './audio'
import { BOARD_IMAGE, pieceImage } from './pieces'

export interface ChessBoardProps {
  fen: string
  moves: readonly MultiplayerChessMove[]
  /** The colour nearest the player. */
  bottom: MultiplayerChessColor
  legalMoves: readonly MultiplayerChessLegalMove[]
  interactive: boolean
  lastMove: { from: string; to: string } | null
  checkSquare: string | null
  /** The king that lies down at the end (checkmate or resignation). */
  fallenKing: Side | null
  captured: Record<MultiplayerChessColor, readonly MultiplayerChessPieceType[]>
  /** Change it to make the board drop an optimistic move the service refused. */
  syncKey: number
  selected: string | null
  onSelect: (square: string | null) => void
  onMove: (from: string, to: string, promotion?: MultiplayerChessPromotion) => void
  onSound?: (sound: ChessSound) => void
  labels: ChessLabels
  /** Accessible name of the side that captured, by colour (for the trays). */
  trayLabels: { top: string; bottom: string }
  advantage: { top: number; bottom: number }
}

interface Falling { key: string; piece: TrackedPiece; by: Side; pushX: number; delay: number }
interface Running { key: number; plan: MovePlan; dropped: string | null }

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
/** Where the most recently captured piece sits in a sorted tray. */
const newestIndex = (raw: readonly MultiplayerChessPieceType[], sorted: readonly MultiplayerChessPieceType[]) => sorted.lastIndexOf(raw[raw.length - 1])
const SETTLE = [
  { transform: 'translateY(-4%) scale(1.03)' },
  { transform: 'translateY(1.5%) scale(1.02, 0.97)', offset: 0.55 },
  { transform: 'none' },
]

function liftFrames(hop: boolean): Keyframe[] {
  return hop
    ? [
        { offset: 0, transform: 'translateY(-10%) scale(1.05)', easing: 'cubic-bezier(.3,.6,.4,1)' },
        { offset: 0.45, transform: 'translateY(-46%) scale(1.12) rotate(-8deg)', easing: 'cubic-bezier(.6,0,.8,.6)' },
        { offset: 0.8, transform: 'translateY(0) scale(1) rotate(0deg)', easing: 'ease-out' },
        { offset: 0.9, transform: 'translateY(2%) scale(1.03, 0.96)', easing: 'ease-in-out' },
        { offset: 1, transform: 'none' },
      ]
    : [
        { offset: 0, transform: 'translateY(-10%) scale(1.05) rotate(-2deg)', easing: 'ease-out' },
        { offset: 0.45, transform: 'translateY(-14%) scale(1.06) rotate(-1deg)', easing: 'ease-in' },
        { offset: 0.82, transform: 'translateY(0) scale(1) rotate(0deg)', easing: 'ease-out' },
        { offset: 0.91, transform: 'translateY(1.5%) scale(1.02, 0.97)', easing: 'ease-in-out' },
        { offset: 1, transform: 'none' },
      ]
}

function shadowFrames(hop: boolean): Keyframe[] {
  return [
    { offset: 0, opacity: 0.55, transform: 'scale(1.2)' },
    { offset: 0.45, opacity: hop ? 0.22 : 0.42, transform: hop ? 'scale(1.55)' : 'scale(1.32)' },
    { offset: 0.82, opacity: 1, transform: 'scale(1)' },
    { offset: 1, opacity: 1, transform: 'scale(1)' },
  ]
}

export const ChessBoard = memo(function ChessBoard({
  fen, moves, bottom, legalMoves, interactive, lastMove, checkSquare, fallenKing, captured, syncKey, selected, onSelect, onMove, onSound,
  labels, trayLabels, advantage,
}: ChessBoardProps) {
  const [shown, setShown] = useState<BoardState>(() => reconcile(null, { fen, moves }).state)
  const shownRef = useRef(shown)
  shownRef.current = shown
  const [running, setRunning] = useState<Running | null>(null)
  const [falling, setFalling] = useState<Falling[]>([])
  const [morph, setMorph] = useState<{ id: string; from: MultiplayerChessPieceType; delay: number } | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const [focus, setFocus] = useState<{ x: number; y: number }>({ x: 4, y: 6 })
  const [drag, setDrag] = useState<{ id: string; from: string; over: string | null } | null>(null)
  const runKey = useRef(0)
  const timers = useRef<number[]>([])
  const pieceEls = useRef(new Map<string, HTMLDivElement>())
  const boardEl = useRef<HTMLDivElement>(null)
  const gridEl = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ id: string; from: string; x: number; y: number; moved: boolean; pointerId: number } | null>(null)
  const soundRef = useRef(onSound)
  soundRef.current = onSound
  // When a knocked-off piece reaches its tray, by capturing side (performance.now() time).
  const arrival = useRef<Record<Side, number>>({ w: 0, b: 0 })
  const trayDelays = useRef(new Map<string, number>())
  const [settled, setSettled] = useState<Record<Side, number>>({ w: captured.white.length, b: captured.black.length })

  const startPlan = useCallback((plan: MovePlan, dropped: string | null) => {
    const reduce = reducedMotion() || document.hidden
    const mover = plan.travels[0]
    const duration = reduce ? 0 : glideDuration(mover.from, mover.to, mover.hop)
    if (plan.captured && !reduce) {
      const from = squareToCell(mover.from, bottom)
      const at = squareToCell(plan.captured.square, bottom)
      const delay = dropped ? 0 : Math.round(duration * 0.74)
      arrival.current[plan.captured.by] = performance.now() + delay + 760
      setFalling(list => [...list, {
        key: `${plan.captured!.id}-${runKey.current + 1}`, piece: plan.captured!, by: plan.captured!.by,
        pushX: Math.sign(at.x - from.x) || 1, delay,
      }])
    }
    setMorph(plan.promotion && !reduce ? { id: plan.promotion.id, from: plan.promotion.from, delay: dropped ? 60 : duration } : null)
    runKey.current += 1
    setRunning({ key: runKey.current, plan, dropped })
    const landing = dropped ? 30 : Math.round(duration * 0.82)
    const sound: ChessSound = plan.captured ? 'capture' : plan.travels.length > 1 ? 'castle' : 'place'
    timers.current.push(window.setTimeout(() => soundRef.current?.(sound), landing))
  }, [bottom])

  // A new position from the service: animate the newest move when the board is one move behind.
  const moveCount = moves.length
  useEffect(() => {
    const { state, plan } = reconcile(shownRef.current, { fen, moves })
    if (state !== shownRef.current) setShown(state)
    if (plan) startPlan(plan, null)
    setPromotion(null)
    // moveCount and syncKey stand in for the move list.
  }, [fen, moveCount, syncKey, startPlan])

  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer) }, [])

  // Act the move out once React has put the pieces on their new squares.
  useLayoutEffect(() => {
    if (!running || reducedMotion() || document.hidden) return
    let first = 0
    const animations: Animation[] = []
    for (const travel of running.plan.travels) {
      const element = pieceEls.current.get(travel.id)
      if (!element) continue
      const body = element.querySelector<HTMLElement>('.cx-piece__body')
      const shadow = element.querySelector<HTMLElement>('.cx-piece__shadow')
      if (running.dropped === travel.id) {
        if (body) animations.push(body.animate(SETTLE, { duration: 220, easing: 'ease-out' }))
        continue
      }
      const from = squareToCell(travel.from, bottom)
      const to = squareToCell(travel.to, bottom)
      const duration = glideDuration(travel.from, travel.to, travel.hop)
      const delay = travel.delay ? Math.round(first * 0.55) : 0
      if (!travel.delay) first = duration
      element.style.zIndex = '150'
      const glide = element.animate(
        [{ transform: `translate(${(from.x - to.x) * 100}%, ${(from.y - to.y) * 100}%)` }, { transform: 'translate(0, 0)' }],
        { duration, delay, easing: travel.hop ? 'cubic-bezier(.45,.05,.35,1)' : 'cubic-bezier(.55,.06,.3,1)', fill: 'backwards' },
      )
      glide.onfinish = () => { element.style.zIndex = '' }
      animations.push(glide)
      if (body) animations.push(body.animate(liftFrames(travel.hop), { duration, delay, fill: 'backwards' }))
      if (shadow) animations.push(shadow.animate(shadowFrames(travel.hop), { duration, delay, fill: 'backwards' }))
    }
    return () => { for (const animation of animations) animation.cancel() }
  }, [running, bottom])

  useEffect(() => {
    if (!morph) return
    const timer = window.setTimeout(() => setMorph(null), morph.delay + 1100)
    return () => clearTimeout(timer)
  }, [morph])

  // ------------------------------------------------------------ moving

  const targets = useMemo(() => (selected && interactive ? targetsFrom(legalMoves, selected) : new Map<string, { capture: boolean; promotion: boolean }>()), [selected, interactive, legalMoves])
  const movable = useMemo(() => (interactive ? movableSquares(legalMoves) : new Set<string>()), [interactive, legalMoves])
  const pieceAt = useCallback((square: string) => shown.pieces.find(piece => piece.square === square) ?? null, [shown])

  const commit = useCallback((from: string, to: string, promote: MultiplayerChessPromotion | undefined, dropped: boolean) => {
    const legal = findLegal(legalMoves, from, to, promote)
    if (!legal) return
    const current = shownRef.current
    const applied = applyMove(current.pieces, { from, to, flags: legal.flags, promotion: promote })
    if (!applied) return
    setShown({ fen: '', moveCount: current.moveCount + 1, pieces: applied.pieces })
    startPlan(applied.plan, dropped ? applied.plan.travels[0].id : null)
    onSelect(null)
    onMove(from, to, promote)
  }, [legalMoves, onMove, onSelect, startPlan])

  const tryMove = useCallback((from: string, to: string, dropped: boolean) => {
    if (needsPromotion(legalMoves, from, to)) {
      setPromotion({ from, to })
      return
    }
    commit(from, to, undefined, dropped)
  }, [legalMoves, commit])

  const activate = useCallback((square: string) => {
    if (!interactive || promotion) return
    if (selected && targets.has(square)) {
      tryMove(selected, square, false)
      return
    }
    if (movable.has(square)) {
      if (selected === square) onSelect(null)
      else {
        onSelect(square)
        soundRef.current?.('lift')
      }
      return
    }
    onSelect(null)
  }, [interactive, promotion, selected, targets, movable, tryMove, onSelect])

  const squareFromPoint = (clientX: number, clientY: number): string | null => {
    const rect = gridEl.current?.getBoundingClientRect()
    if (!rect) return null
    const x = Math.floor(((clientX - rect.left) / rect.width) * 8)
    const y = Math.floor(((clientY - rect.top) / rect.height) * 8)
    return x >= 0 && x < 8 && y >= 0 && y < 8 ? cellToSquare(x, y, bottom) : null
  }

  const onPiecePointerDown = (event: ReactPointerEvent<HTMLDivElement>, piece: TrackedPiece) => {
    if (!interactive || promotion || event.button !== 0 || !movable.has(piece.square)) return
    event.preventDefault()
    const cell = squareToCell(piece.square, bottom)
    setFocus(cell)
    gridEl.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
    event.currentTarget.setPointerCapture(event.pointerId)
    pointer.current = { id: piece.id, from: piece.square, x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId }
  }

  const onPiecePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointer.current
    if (!state || state.pointerId !== event.pointerId) return
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    if (!state.moved) {
      if (Math.hypot(dx, dy) < 5) return
      state.moved = true
      if (selected !== state.from) {
        onSelect(state.from)
        soundRef.current?.('lift')
      }
      document.body.classList.add('cx-dragging')
    }
    event.currentTarget.style.transform = `translate(${dx}px, ${dy}px)`
    const over = squareFromPoint(event.clientX, event.clientY)
    setDrag(previous => (previous && previous.over === over && previous.id === state.id ? previous : { id: state.id, from: state.from, over }))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const state = pointer.current
    if (!state || state.pointerId !== event.pointerId) return
    pointer.current = null
    document.body.classList.remove('cx-dragging')
    const element = event.currentTarget
    setDrag(null)
    if (!state.moved) {
      activate(state.from)
      return
    }
    const to = cancelled ? null : squareFromPoint(event.clientX, event.clientY)
    const legal = to !== null && targetsFrom(legalMoves, state.from).has(to)
    if (legal && to) {
      // Keep the dragged offset until React has moved the piece to its new square, then settle in place.
      const offset = element.style.transform
      element.style.transform = ''
      if (needsPromotion(legalMoves, state.from, to)) {
        element.animate([{ transform: offset }, { transform: 'translate(0, 0)' }], { duration: 200, easing: 'ease-out' })
        setPromotion({ from: state.from, to })
        return
      }
      commit(state.from, to, undefined, true)
      return
    }
    const offset = element.style.transform
    element.style.transform = ''
    if (offset && !reducedMotion()) element.animate([{ transform: offset }, { transform: 'translate(0, 0)' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' })
  }

  // ------------------------------------------------------------ keyboard

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setFocus(cell => moveFocus(cell, event.key))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate(cellToSquare(focus.x, focus.y, bottom))
    }
  }

  // ------------------------------------------------------------ render

  const pieceName = (piece: { color: Side; type: MultiplayerChessPieceType }) =>
    labels.pieceName(piece.color === 'w' ? labels.sides.white : labels.sides.black, labels.pieces[piece.type])
  const files = bottom === 'white' ? 'abcdefgh' : 'hgfedcba'
  const ranks = bottom === 'white' ? '87654321' : '12345678'
  const focusSquare = cellToSquare(focus.x, focus.y, bottom)
  const mySide = sideOf(bottom)
  const topSide: Side = mySide === 'w' ? 'b' : 'w'
  const trayFor = (side: Side) => trayOrder(captured[side === 'w' ? 'white' : 'black'])
  // A newly captured piece appears in its tray when the knocked-off piece gets there.
  const trayDelay = (side: Side, count: number): number => {
    const key = `${side}${count}`
    if (!trayDelays.current.has(key)) {
      const now = performance.now()
      const planned = arrival.current[side]
      let delay = 0
      if (planned && now - planned < 3000) delay = Math.max(0, planned - now)
      else if (!reducedMotion()) {
        const last = moves[moves.length - 1]
        if (last?.captured && sideOf(last.by) === side) delay = glideDuration(last.from, last.to, last.piece === 'n') * 0.74 + 760
      }
      trayDelays.current.set(key, Math.round(delay))
    }
    return trayDelays.current.get(key) ?? 0
  }
  const capturedWhite = captured.white.length
  const capturedBlack = captured.black.length
  useEffect(() => {
    if (capturedWhite === settled.w && capturedBlack === settled.b) return
    const timer = window.setTimeout(() => setSettled({ w: capturedWhite, b: capturedBlack }), 2600)
    return () => clearTimeout(timer)
  }, [capturedWhite, capturedBlack, settled])

  const promotionCell = promotion ? squareToCell(promotion.to, bottom) : null

  return (
    <div className="cx-board-wrap">
      <div className="cx-frame">
        <div className="cx-coords cx-coords--files" aria-hidden="true">{[...files].map(file => <span key={file}>{file}</span>)}</div>
        <div className="cx-coords cx-coords--ranks" aria-hidden="true">{[...ranks].map(rank => <span key={rank}>{rank}</span>)}</div>
        <div className="cx-board" ref={boardEl} data-bottom={bottom} data-interactive={interactive ? '' : undefined}>
          <div className="cx-field" aria-hidden="true" style={{ backgroundImage: `url("${BOARD_IMAGE}")` }} />
          <div
            ref={gridEl}
            className="cx-grid"
            role="grid"
            aria-label={labels.boardLabel}
            tabIndex={0}
            aria-activedescendant={`cx-sq-${focusSquare}`}
            onKeyDown={handleKey}
          >
            {Array.from({ length: 8 }, (_, y) => (
              <div key={y} role="row" className="cx-row">
                {Array.from({ length: 8 }, (_, x) => {
                  const square = cellToSquare(x, y, bottom)
                  const piece = pieceAt(square)
                  const target = targets.get(square)
                  const label = piece ? labels.onSquare(pieceName(piece), square) : labels.emptySquare(square)
                  return (
                    <div
                      key={square}
                      id={`cx-sq-${square}`}
                      role="gridcell"
                      aria-label={label}
                      aria-selected={selected === square}
                      className="cx-sq"
                      data-square={square}
                      data-last={lastMove && (lastMove.from === square || lastMove.to === square) ? '' : undefined}
                      data-selected={selected === square ? '' : undefined}
                      data-target={target ? (target.capture ? 'capture' : 'move') : undefined}
                      data-over={drag?.over === square && target ? '' : undefined}
                      data-check={checkSquare === square ? '' : undefined}
                      data-focus={focusSquare === square ? '' : undefined}
                      onClick={() => {
                        setFocus({ x, y })
                        activate(square)
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>

          <div className="cx-pieces">
            {shown.pieces.map(piece => {
              const cell = squareToCell(piece.square, bottom)
              const lifted = selected === piece.square && interactive
              const canGrab = interactive && movable.has(piece.square) && !promotion
              const morphing = morph && morph.id === piece.id ? morph : null
              const style = { left: `${cell.x * 12.5}%`, top: `${cell.y * 12.5}%`, zIndex: lifted || drag?.id === piece.id ? 160 : cell.y * 10 + 2, '--morph-delay': `${morphing?.delay ?? 0}ms` } as CSSProperties
              return (
                <div
                  key={piece.id}
                  ref={node => { if (node) pieceEls.current.set(piece.id, node); else pieceEls.current.delete(piece.id) }}
                  className="cx-piece"
                  style={style}
                  data-color={piece.color}
                  data-type={piece.type}
                  data-lifted={lifted ? '' : undefined}
                  data-grab={canGrab ? '' : undefined}
                  data-dragging={drag?.id === piece.id ? '' : undefined}
                  data-fallen={fallenKing && piece.type === 'k' && piece.color === fallenKing ? '' : undefined}
                  data-morph={morphing ? '' : undefined}
                  onPointerDown={canGrab ? event => onPiecePointerDown(event, piece) : undefined}
                  onPointerMove={canGrab ? onPiecePointerMove : undefined}
                  onPointerUp={canGrab ? event => endDrag(event, false) : undefined}
                  onPointerCancel={canGrab ? event => endDrag(event, true) : undefined}
                  aria-hidden="true"
                >
                  <span className="cx-piece__shadow" />
                  {morphing && <span className="cx-piece__glow" />}
                  <span className="cx-piece__body">
                    {morphing && <img className="cx-piece__old" src={pieceImage(piece.color, morphing.from)} alt="" draggable={false} />}
                    <img className="cx-piece__img" src={pieceImage(piece.color, piece.type)} alt="" draggable={false} />
                  </span>
                </div>
              )
            })}
            {falling.map(item => (
              <FallingPiece
                key={item.key}
                item={item}
                bottom={bottom}
                towardBottom={item.by === mySide}
                onDone={() => setFalling(list => list.filter(entry => entry.key !== item.key))}
              />
            ))}
          </div>

          {promotion && promotionCell && (
            <div className="cx-promotion" role="dialog" aria-label={labels.promotion.title} style={{ left: `${promotionCell.x * 12.5}%` }} data-own-escape="">
              <p className="cx-promotion__title">{labels.promotion.title}</p>
              {PROMOTION_ORDER.map((type, index) => (
                <button
                  key={type}
                  type="button"
                  className="cx-promotion__option"
                  aria-label={labels.pieces[type]}
                  autoFocus={index === 0}
                  onKeyDown={event => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      setPromotion(null)
                      gridEl.current?.focus()
                    }
                  }}
                  onClick={() => {
                    const choice = promotion
                    setPromotion(null)
                    commit(choice.from, choice.to, type, false)
                  }}
                >
                  <img src={pieceImage(mySide, type)} alt="" draggable={false} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="cx-trays" aria-label={labels.captured.title}>
        {([['top', topSide === 'w' ? 'b' : 'w', topSide], ['bottom', mySide === 'w' ? 'b' : 'w', mySide]] as const).map(([place, lostSide, byside]) => {
          const pieces = trayFor(byside)
          const before = settled[byside]
          const fresh = pieces.length > before
          const delay = fresh ? trayDelay(byside, pieces.length) : 0
          const lead = advantage[place]
          return (
            <div key={place} className="cx-tray" data-place={place} aria-label={trayLabels[place]}>
              <ul className="cx-tray__list">
                {pieces.map((type, index) => (
                  <li
                    key={`${type}-${index}`}
                    className="cx-tray__piece"
                    data-fresh={fresh && index === newestIndex(captured[byside === 'w' ? 'white' : 'black'], pieces) ? '' : undefined}
                    style={{ '--fresh-delay': `${delay}ms` } as CSSProperties}
                  >
                    <img src={pieceImage(lostSide, type)} alt={labels.pieces[type]} draggable={false} />
                  </li>
                ))}
              </ul>
              {lead > 0 && <span className="cx-tray__lead">{labels.captured.advantage(lead)}</span>}
            </div>
          )
        })}
      </aside>
    </div>
  )
})

function FallingPiece({ item, bottom, towardBottom, onDone }: { item: Falling; bottom: MultiplayerChessColor; towardBottom: boolean; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  done.current = onDone
  const cell = squareToCell(item.piece.square, bottom)

  useLayoutEffect(() => {
    const element = ref.current
    const body = element?.querySelector<HTMLElement>('.cx-piece__body')
    const shadow = element?.querySelector<HTMLElement>('.cx-piece__shadow')
    if (!element || !body) return
    const tx = (9.55 - cell.x) * 100
    const ty = ((towardBottom ? 5.7 : 1.5) - cell.y) * 100
    const tip = item.pushX >= 0 ? 1 : -1
    const timing = { duration: 940, delay: item.delay, fill: 'both' as const }
    const glide = element.animate([
      { transform: 'translate(0, 0)', easing: 'cubic-bezier(.2,.8,.4,1)' },
      { transform: `translate(${item.pushX * 22}%, -4%)`, offset: 0.22, easing: 'cubic-bezier(.45,0,.6,.6)' },
      { transform: `translate(${(item.pushX * 22 + tx) / 2}%, ${ty / 2 - 45}%)`, offset: 0.56, easing: 'cubic-bezier(.3,.4,.5,1)' },
      { transform: `translate(${tx}%, ${ty}%)`, opacity: 1, offset: 0.86 },
      { transform: `translate(${tx}%, ${ty}%)`, opacity: 0 },
    ], timing)
    const fall = body.animate([
      { transform: 'none', easing: 'cubic-bezier(.4,0,.8,.5)' },
      { transform: `rotate(${tip * 24}deg)`, offset: 0.2, easing: 'cubic-bezier(.3,.5,.4,1)' },
      { transform: `rotate(${tip * 90}deg) translateX(${tip * -6}%)`, offset: 0.42 },
      { transform: `rotate(${tip * 100}deg) translateX(${tip * -6}%) scale(0.85)`, offset: 0.7 },
      { transform: `rotate(${tip * 90}deg) translateX(${tip * -6}%) scale(0.6)` },
    ], timing)
    const fade = shadow?.animate([{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], timing)
    glide.onfinish = () => done.current()
    return () => { glide.cancel(); fall.cancel(); fade?.cancel() }
  }, [cell.x, cell.y, item.delay, item.pushX, towardBottom])

  return (
    <div ref={ref} className="cx-piece" data-falling="" style={{ left: `${cell.x * 12.5}%`, top: `${cell.y * 12.5}%`, zIndex: 140 }} aria-hidden="true">
      <span className="cx-piece__shadow" />
      <span className="cx-piece__body">
        <img className="cx-piece__img" src={pieceImage(item.piece.color, item.piece.type)} alt="" draggable={false} />
      </span>
    </div>
  )
}
