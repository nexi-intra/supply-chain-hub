import type { CSSProperties } from 'react'
import { useChristmas } from '@/contexts/ChristmasContext'
import { cn } from '@/lib/utils'
import { useNisse } from './NisseContext'

/**
 * peek: only the head and mittens show above an edge (sits on the edge, body hidden behind it).
 * hang: the kravlenisse hanging by its arms from the edge above it.
 * stand: the old grey farm nisse with his porridge bowl, standing on a "floor" beside something.
 */
export type NissePose = 'peek' | 'hang' | 'stand'

const HAT = '#c8352d'
const FACE = '#f2c4a2'
const EYE = '#2a1a12'
const CHEEK = '#ef8f86'

const SIZE: Record<NissePose, string> = {
  peek: 'h-[19px] w-[26px]',
  hang: 'h-[24px] w-[16px]',
  stand: 'h-[25px] w-[16px]',
}

function PeekingNisse() {
  return (
    <svg viewBox="0 0 44 32" width={26} height={19} aria-hidden="true">
      <path d="M9 17 C10 8 17 3 25 3 C32 3 37 7 39.5 13 C36.5 11 33 11.5 31.5 14 C33 15 33 16 33 17 Z" fill={HAT} />
      <circle cx={39.6} cy={14.6} r={3.4} fill="#ffffff" />
      <rect x={7} y={15.5} width={28} height={5} rx={2.5} fill="#ffffff" />
      <path d="M10.6 20 C10.6 27 14.6 30.6 21 30.6 C27.4 30.6 31.4 27 31.4 20 Z" fill={FACE} />
      <ellipse cx={17} cy={23.2} rx={1.7} ry={2.1} fill={EYE} />
      <ellipse cx={25} cy={23.2} rx={1.7} ry={2.1} fill={EYE} />
      <circle cx={13.6} cy={26.6} r={1.9} fill={CHEEK} opacity={0.55} />
      <circle cx={28.4} cy={26.6} r={1.9} fill={CHEEK} opacity={0.55} />
      <circle cx={21} cy={26.2} r={1.8} fill="#e07a6c" />
      <ellipse cx={9} cy={29.6} rx={3.8} ry={2.6} fill="#2f7a4c" />
      <ellipse cx={33} cy={29.6} rx={3.8} ry={2.6} fill="#2f7a4c" />
    </svg>
  )
}

function HangingNisse() {
  return (
    <svg viewBox="4 0 34 52" width={16} height={24} aria-hidden="true">
      <path d="M13 17 L9 5 M25 17 L29 5" stroke={HAT} strokeWidth={3.6} strokeLinecap="round" />
      <circle cx={9} cy={4.4} r={3} fill="#2f7a4c" />
      <circle cx={29} cy={4.4} r={3} fill="#2f7a4c" />
      <circle cx={19} cy={19} r={6.8} fill={FACE} />
      <path d="M11.6 17 C12 10 16 7.5 19.5 7.5 C24 7.5 26.5 10 26.6 14 C29 13 32 15 33.2 19.5 C30 17.6 28 18 26.6 17 Z" fill={HAT} />
      <circle cx={33.5} cy={20.4} r={2.6} fill="#ffffff" />
      <rect x={11} y={15.4} width={16.6} height={3.4} rx={1.7} fill="#ffffff" />
      <circle cx={16.4} cy={20.6} r={1} fill={EYE} />
      <circle cx={21.6} cy={20.6} r={1} fill={EYE} />
      <path d="M16.8 23.4 Q19 25.2 21.2 23.4" stroke="#8a3a30" strokeWidth={1} fill="none" strokeLinecap="round" />
      <circle cx={14.4} cy={22.6} r={1.4} fill={CHEEK} opacity={0.55} />
      <circle cx={23.6} cy={22.6} r={1.4} fill={CHEEK} opacity={0.55} />
      <rect x={12} y={25.6} width={14} height={11.4} rx={4} fill={HAT} />
      <rect x={12} y={32} width={14} height={2} fill={EYE} />
      <g strokeLinecap="round" strokeWidth={3.6}>
        <path d="M15.4 37 L13 47" stroke="#ffffff" />
        <path d="M15.4 37 L13 47" stroke={HAT} strokeDasharray="2 2" />
        <path d="M22.6 37 L26 45.6" stroke="#ffffff" />
        <path d="M22.6 37 L26 45.6" stroke={HAT} strokeDasharray="2 2" />
      </g>
      <ellipse cx={12.2} cy={48.6} rx={3} ry={2} fill={EYE} />
      <ellipse cx={27} cy={47.2} rx={3} ry={2} fill={EYE} />
    </svg>
  )
}

function StandingNisse() {
  return (
    <svg viewBox="5 0 32 50" width={16} height={25} aria-hidden="true">
      <path d="M13 19 C13 9 19 2 30 1.5 C27.5 6 27 12 30 19 Z" fill={HAT} />
      <circle cx={30.2} cy={2} r={2.2} fill="#ffffff" />
      <circle cx={21} cy={21.5} r={6.6} fill={FACE} />
      <circle cx={18.6} cy={20.6} r={1} fill={EYE} />
      <circle cx={23.4} cy={20.6} r={1} fill={EYE} />
      <path d="M14.6 23 C15 31 19 35.5 21 37 C23 35.5 27 31 27.4 23 C25 25 17 25 14.6 23 Z" fill="#fbfbf8" />
      <circle cx={21} cy={23.4} r={2} fill="#e07a6c" />
      <path d="M11 33 C11 28 15 26.5 18 27.5 L24 27.5 C27 26.5 31 28 31 33 L31 41 L11 41 Z" fill="#8c929c" />
      <rect x={11} y={37} width={20} height={2.2} fill="#4a3a2c" />
      <path d="M13.5 38.5 C15 36 27 36 28.5 38.5 C27.5 42 14.5 42 13.5 38.5 Z" fill="#b8794a" />
      <ellipse cx={21} cy={38.4} rx={7.2} ry={1.7} fill="#fbf4e6" />
      <circle cx={21} cy={38} r={1.4} fill="#f2c94c" />
      <circle cx={13.3} cy={38} r={2.3} fill="#8c929c" />
      <circle cx={28.7} cy={38} r={2.3} fill="#8c929c" />
      <rect x={13} y={41} width={5} height={4} fill={HAT} />
      <rect x={24} y={41} width={5} height={4} fill={HAT} />
      <ellipse cx={14.5} cy={46.5} rx={4.4} ry={2.3} fill="#9a6a3c" />
      <ellipse cx={27.5} cy={46.5} rx={4.4} ry={2.3} fill="#9a6a3c" />
    </svg>
  )
}

/**
 * One of the 24 hiding places. Renders the nisse only when main says today's nisse in this hub hides exactly here and
 * the person plays along (Christmas theme on). Each place has the kind of nisse that fits it (`pose`); the parent
 * places it with `className` (usually absolute, on or under an edge). It stands still and does not glow – it has to
 * be found.
 */
export function NisseSpot({ spot, pose, className, style }: { spot: string; pose: NissePose; className?: string; style?: CSSProperties }) {
  const christmas = useChristmas()
  const { state, claim, label } = useNisse()
  if (!christmas.active || christmas.mode === 'off' || state.status !== 'hiding' || state.spot !== spot) return null
  return (
    <button
      type="button"
      aria-label={label}
      style={style}
      onClick={event => { event.stopPropagation(); void claim(spot) }}
      className={cn(`xmas-hidden-nisse xmas-nisse-${pose} pointer-events-auto z-30 inline-block cursor-pointer rounded-sm p-0 leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`, SIZE[pose], className)}
    >
      {pose === 'peek' ? <PeekingNisse /> : pose === 'hang' ? <HangingNisse /> : <StandingNisse />}
    </button>
  )
}
