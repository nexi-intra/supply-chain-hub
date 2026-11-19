import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from 'react'
import type { MultiplayerLanguage } from '@/lib/multiplayer'
import { WordTile } from './WordTile'

export type DragSource = { kind: 'rack'; rackIndex: number } | { kind: 'board'; row: number; col: number }
export type DropTarget = { kind: 'square'; row: number; col: number } | { kind: 'rack' } | null
export interface DragLook { letter: string; blank: boolean; language: MultiplayerLanguage }

interface Options {
  enabled: boolean
  onDrop: (source: DragSource, target: DropTarget) => void
  /** A press without enough movement to count as a drag. */
  onTap: (source: DragSource) => void
}

const DRAG_THRESHOLD = 5

/** Pointer-driven tile dragging. The ghost follows the pointer through direct style writes, so a drag never re-renders the board. */
export function useTileDrag(options: Options) {
  const optionsRef = useRef(options)
  useLayoutEffect(() => { optionsRef.current = options })
  const ghostRef = useRef<HTMLDivElement>(null)
  const position = useRef({ x: 0, y: 0 })
  const size = useRef(48)
  const stop = useRef<(() => void) | null>(null)
  const [dragging, setDragging] = useState<DragLook | null>(null)

  const place = useCallback(() => {
    const ghost = ghostRef.current
    if (ghost) ghost.style.transform = `translate(${position.current.x - size.current / 2}px, ${position.current.y - size.current / 2}px)`
  }, [])

  useLayoutEffect(() => { if (dragging) place() }, [dragging, place])
  useEffect(() => () => stop.current?.(), [])

  const begin = useCallback((event: ReactPointerEvent<HTMLElement>, source: DragSource, look: DragLook) => {
    if (!optionsRef.current.enabled || event.button !== 0 || stop.current) return
    event.preventDefault()
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    let active = false
    let hovered: Element | null = null
    size.current = event.currentTarget.getBoundingClientRect().width || 48
    position.current = { x: startX, y: startY }

    const hover = (element: Element | null) => {
      if (hovered === element) return
      hovered?.removeAttribute('data-drop')
      hovered = element
      hovered?.setAttribute('data-drop', '')
    }
    const teardown = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      hover(null)
      document.body.classList.remove('wp-dragging')
      setDragging(null)
      stop.current = null
    }
    function move(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      position.current = { x: e.clientX, y: e.clientY }
      if (!active) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return
        active = true
        document.body.classList.add('wp-dragging')
        setDragging(look)
      }
      place()
      hover(document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-square]') ?? null)
    }
    function up(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      teardown()
      if (!active) { optionsRef.current.onTap(source); return }
      const element = document.elementFromPoint(e.clientX, e.clientY)
      const square = element?.closest<HTMLElement>('[data-square]')
      if (square) optionsRef.current.onDrop(source, { kind: 'square', row: Number(square.dataset.row), col: Number(square.dataset.col) })
      else if (element?.closest('[data-rack]')) optionsRef.current.onDrop(source, { kind: 'rack' })
      else optionsRef.current.onDrop(source, null)
    }
    function cancel(e: PointerEvent) {
      if (e.pointerId === pointerId) teardown()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    stop.current = teardown
  }, [place])

  const ghost = dragging ? (
    <div ref={ghostRef} className="wp-ghost" aria-hidden="true" style={{ '--wp-ghost-size': `${size.current}px` } as CSSProperties}>
      <WordTile letter={dragging.letter} blank={dragging.blank} language={dragging.language} />
    </div>
  ) : null

  return { begin, ghost }
}
