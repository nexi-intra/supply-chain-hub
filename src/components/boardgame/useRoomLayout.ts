import { useEffect, useState, type RefObject } from 'react'
import type { Rect } from '@/lib/hubertRoutine'
import { roomLayout, type RoomLayout } from '@/lib/roomLayout'
import manifest from '@/assets/multiplayer/hubert.json'

const FRAME_ASPECT = manifest.frameWidth / manifest.frameHeight

export interface RoomRefs {
  room: RefObject<HTMLElement | null>
  lane: RefObject<HTMLElement | null>
  corner: RefObject<HTMLElement | null>
  table: RefObject<HTMLElement | null>
  play: RefObject<HTMLElement | null>
  board: RefObject<HTMLElement | null>
  topbar: RefObject<HTMLElement | null>
}

/** Slots on the table that Hubert keeps clear of (tray, panels, props), marked by the room. */
const OBSTACLES = '[data-room-obstacle]'

function measure(refs: RoomRefs): RoomLayout | null {
  const { room, lane, corner, table, play, board, topbar } = refs
  if (!room.current || !lane.current || !table.current || !play.current || !board.current || !topbar.current) return null
  const origin = room.current.getBoundingClientRect()
  const rel = (element: Element): Rect => {
    const box = element.getBoundingClientRect()
    return { x: Math.round(box.left - origin.left), y: Math.round(box.top - origin.top), w: Math.round(box.width), h: Math.round(box.height) }
  }
  const cornerBox = corner.current ? rel(corner.current) : null
  return roomLayout({
    width: Math.round(origin.width),
    bottom: Math.round(Math.min(origin.height, window.innerHeight - origin.top)),
    lane: rel(lane.current),
    table: rel(table.current),
    corner: cornerBox && cornerBox.w > 0 ? cornerBox : null,
    board: rel(board.current),
    play: rel(play.current),
    obstacles: [...Array.from(topbar.current.children, rel), ...Array.from(table.current.querySelectorAll(OBSTACLES), rel)],
  }, FRAME_ASPECT)
}

/** Measures the room's slots so Hubert knows where the floor is free; re-measures when anything resizes. */
export function useRoomLayout(refs: RoomRefs, ready: boolean): RoomLayout | null {
  const [layout, setLayout] = useState<RoomLayout | null>(null)

  useEffect(() => {
    if (!ready) return
    let frame = 0
    let last = ''
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = measure(refs)
        const key = JSON.stringify(next)
        if (key === last) return
        last = key
        setLayout(next)
      })
    }
    const observer = new ResizeObserver(update)
    for (const ref of [refs.room, refs.table, refs.lane, refs.board]) if (ref.current) observer.observe(ref.current)
    window.addEventListener('resize', update)
    update()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
    // The refs are stable objects; `ready` flips once the table exists.
  }, [ready])

  return layout
}
