import type { ReactNode } from 'react'
import { ArrowRight, Horse, Joystick } from '@phosphor-icons/react'
import '@/views/arcade.css'

interface SectionTileProps {
  game: string
  title: string
  description: string
  cta: string
  art: ReactNode
  onClick: () => void
  /** The accessible name when it should be just the title (the button otherwise reads its whole text). */
  label?: string
}

/** Selection card in the `.arcade-tile` family; the accent comes from `data-game` in arcade.css. */
export function SectionTile({ game, title, description, cta, art, onClick, label }: SectionTileProps) {
  return (
    <button
      type="button"
      data-game={game}
      onClick={onClick}
      aria-label={label}
      className="arcade-tile section-tile group flex h-full min-h-[270px] w-full flex-col overflow-hidden rounded-md border border-border text-left"
    >
      <span className="arcade-tile-art section-tile-art relative flex h-28 items-center px-6" aria-hidden="true">{art}</span>
      <span className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4 sm:px-6">
        <span className="block text-lg font-semibold text-foreground">{title}</span>
        <span className="flex-1 text-sm leading-relaxed text-muted-foreground">{description}</span>
        <span className="section-tile-cta inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          {cta}
          <ArrowRight size={16} weight="bold" aria-hidden="true" />
        </span>
      </span>
    </button>
  )
}

/** Module page header badge showing the same art and accent as the section's tile. */
export function SectionBadge({ game, art }: { game: string; art: ReactNode }) {
  return <span data-game={game} className="section-badge" aria-hidden="true">{art}</span>
}

function IsoCube({ className, evil = false }: { className?: string; evil?: boolean }) {
  return (
    <svg className={`section-cube ${className ?? ''}`} viewBox="0 0 40 46">
      <polygon className="section-cube-top" points="20,0 40,11.5 20,23 0,11.5" />
      <polygon className="section-cube-left" points="0,11.5 20,23 20,46 0,34.5" />
      <polygon className="section-cube-right" points="20,23 40,11.5 40,34.5 20,46" />
      {evil && (
        <g className="section-cube-eyes">
          <polygon points="3.5,21 9,25.6 9,28 3.5,24.2" />
          <polygon points="11.5,30.4 17,28.2 17,31 11.5,33" />
        </g>
      )}
    </svg>
  )
}

const INVADER = [
  '..X.....X..',
  '...X...X...',
  '..XXXXXXX..',
  '.XX.XXX.XX.',
  'XXXXXXXXXXX',
  'X.XXXXXXX.X',
  'X.X.....X.X',
  '...XX.XX...',
]

export function ArcadeArt() {
  return (
    <span className="section-art-arcade flex items-center gap-5">
      <svg className="section-invader" viewBox="0 0 11 8" shapeRendering="crispEdges">
        {INVADER.flatMap((row, y) => [...row].map((cell, x) => cell === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null))}
      </svg>
      <span className="section-pixels">
        <i /><i /><i />
      </span>
      <Joystick className="section-joystick" size={52} weight="duotone" />
    </span>
  )
}

export function ModernArt() {
  return (
    <span className="section-art-modern relative flex h-full w-40 items-center">
      <svg className="section-orbit" viewBox="0 0 160 60"><ellipse cx="62" cy="34" rx="58" ry="17" /></svg>
      <IsoCube className="section-cube-main" />
      <IsoCube className="section-cube-float" />
    </span>
  )
}

export function MultiplayerArt() {
  return (
    <span className="section-art-multiplayer flex items-center gap-2">
      <span className="section-letter" data-score="4">V</span>
      <span className="section-letter" data-score="1">S</span>
      <Horse className="section-knight" size={50} weight="duotone" />
    </span>
  )
}

export function CubeBasherArt() {
  return (
    <span className="section-art-cubes flex items-end gap-1.5">
      <IsoCube className="section-cube-a" evil />
      <IsoCube className="section-cube-b" evil />
      <IsoCube className="section-cube-c" evil />
    </span>
  )
}
