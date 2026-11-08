import { useChristmas } from '@/contexts/ChristmasContext'
import { cn } from '@/lib/utils'
import { useNisse } from './NisseContext'

/**
 * One of the 24 hiding places. Renders the nisse only when main says today's nisse in this hub hides exactly here and
 * the person plays along (Christmas theme on). The parent places it with `className` (usually absolute, half tucked
 * behind an edge); it stands still and does not glow – it has to be found.
 */
export function NisseSpot({ spot, className }: { spot: string; className?: string }) {
  const christmas = useChristmas()
  const { state, claim, label } = useNisse()
  if (!christmas.active || christmas.mode === 'off' || state.status !== 'hiding' || state.spot !== spot) return null
  return (
    <button
      type="button"
      aria-label={label}
      onClick={event => { event.stopPropagation(); void claim(spot) }}
      className={cn('xmas-hidden-nisse pointer-events-auto z-30 inline-block h-[22px] w-[18px] cursor-pointer rounded-sm p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary', className)}
    >
      <svg viewBox="0 0 36 44" width={18} height={22} aria-hidden="true">
        <path d="M5 19 C9 8 17 2 31 3 C27 8 27 14 28 19 Z" fill="#c8352d" />
        <circle cx={31.5} cy={4} r={3.2} fill="#ffffff" />
        <rect x={3} y={17} width={28} height={5.5} rx={2.75} fill="#ffffff" />
        <circle cx={17} cy={28} r={8.5} fill="#f2c4a2" />
        <circle cx={14} cy={26.6} r={1.2} fill="#2a1a12" />
        <circle cx={20} cy={26.6} r={1.2} fill="#2a1a12" />
        <circle cx={17} cy={30} r={1.8} fill="#e0897a" />
        <path d="M8 30.5 C10.5 44 23.5 44 26 30.5 C22 34 12 34 8 30.5 Z" fill="#ffffff" />
      </svg>
    </button>
  )
}
