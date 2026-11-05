import type { CSSProperties } from 'react'
import roomDay from '@/assets/multiplayer/room-day.webp'
import roomNight from '@/assets/multiplayer/room-night.webp'
import oak from '@/assets/multiplayer/oak.webp'
import walnut from '@/assets/multiplayer/walnut.webp'
import mug from '@/assets/multiplayer/prop-mug.webp'
import bag from '@/assets/multiplayer/prop-bag.webp'

// The living room is a Blender plate (scripts/blender/room.py) with depth of field, one for golden hour
// and one for the evening; the light on the floor and the table and the haze in the air are CSS so they
// stay crisp and can breathe. The plates are CSS backgrounds, so only the current theme's is fetched.

export const PLATES = { '--bgr-plate-day': `url("${roomDay}")`, '--bgr-plate-night': `url("${roomNight}")` } as CSSProperties

/** Plates and wood for the room; games and the lobby put this on their root. */
export const ROOM_STYLE = { ...PLATES, '--bgr-oak': `url("${oak}")`, '--bgr-walnut': `url("${walnut}")` } as CSSProperties

export function RoomBackdrop() {
  return (
    <div className="bgr-backdrop" aria-hidden="true">
      <div className="bgr-backdrop__plate" />
      <div className="bgr-backdrop__sunbeams" />
      <div className="bgr-backdrop__firelight" />
      <div className="bgr-backdrop__haze" />
    </div>
  )
}

/** The light that reaches the floor round Hubert's basket: low sun, or the standard lamp in the evening. */
export function FloorLight({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const style = { '--pool-x': `${Math.round(x)}px`, '--pool-y': `${Math.round(y)}px`, '--pool-w': `${Math.round(w)}px`, '--pool-h': `${Math.round(h)}px` } as CSSProperties
  return <div className="bgr-floorlight" style={style} aria-hidden="true" />
}

/** A coffee mug and a cloth bag stand on the table beside the board when there is room. */
export function TableProps() {
  return (
    <>
      <img className="bgr-prop bgr-prop--bag" src={bag} alt="" aria-hidden="true" decoding="async" />
      <span className="bgr-prop bgr-prop--mug" aria-hidden="true">
        <img src={mug} alt="" decoding="async" />
        <span className="bgr-steam" />
        <span className="bgr-steam" />
      </span>
    </>
  )
}
