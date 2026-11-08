import { useId } from 'react'
import { cn } from '@/lib/utils'

interface HubMarkProps {
  size?: number
  className?: string
  /** Next to visible "Supply Chain Hub" text the mark adds nothing for screen readers. */
  decorative?: boolean
  animated?: boolean
}

// Same geometry as public/app-logo.svg. Gold lives only inside this mark – never as UI colour.
export function HubMark({ size = 32, className, decorative = false, animated = false }: HubMarkProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const tile = `hm-tile-${id}`
  const gold = `hm-gold-${id}`
  const overLeft = `hm-left-${id}`
  const overRight = `hm-right-${id}`
  const part = (name: string) => (animated ? `hub-loader-${name}` : undefined)
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': 'Supply Chain Hub' }

  return (
    <svg viewBox="0 0 128 128" width={size} height={size} className={cn('shrink-0', className)} {...a11y}>
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1D2E47" /><stop offset="1" stopColor="#0A1220" /></linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F8DC9C" /><stop offset=".55" stopColor="#E6B04F" /><stop offset="1" stopColor="#C98A22" /></linearGradient>
        <clipPath id={overLeft}><rect x="38" y="66" width="16" height="16" /></clipPath>
        <clipPath id={overRight}><rect x="74" y="46" width="16" height="16" /></clipPath>
      </defs>
      <rect x="2" y="2" width="124" height="124" rx="30" fill={`url(#${tile})`} />
      <rect x="2.5" y="2.5" width="123" height="123" rx="29.5" fill="none" stroke="#F6D28B" strokeOpacity=".16" />
      <g fill="none" strokeWidth="7">
        <rect className={part('left')} x="27" y="25" width="19" height="78" rx="9.5" stroke={`url(#${gold})`} />
        <rect className={part('right')} x="82" y="25" width="19" height="78" rx="9.5" stroke={`url(#${gold})`} />
        <g className={part('bar')}>
          <rect x="35" y="54" width="58" height="20" rx="10" stroke="#111c2e" strokeWidth="13" />
          <rect x="35" y="54" width="58" height="20" rx="10" stroke={`url(#${gold})`} />
        </g>
        <g className={part('left')}>
          <g clipPath={`url(#${overLeft})`}>
            <rect x="27" y="25" width="19" height="78" rx="9.5" stroke="#111c2e" strokeWidth="13" />
            <rect x="27" y="25" width="19" height="78" rx="9.5" stroke={`url(#${gold})`} />
          </g>
        </g>
        <g className={part('right')}>
          <g clipPath={`url(#${overRight})`}>
            <rect x="82" y="25" width="19" height="78" rx="9.5" stroke="#111c2e" strokeWidth="13" />
            <rect x="82" y="25" width="19" height="78" rx="9.5" stroke={`url(#${gold})`} />
          </g>
        </g>
      </g>
    </svg>
  )
}

/** Shown while a whole module loads: the three links join into the H, like the startup intro. */
export function HubLoader({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" className={cn('hub-loader flex flex-col items-center gap-3', className)}>
      <HubMark size={56} decorative animated />
      <span className="sr-only">{label}</span>
    </div>
  )
}

const LOADER_LABELS: Record<string, string> = { da: 'Indlæser', en: 'Loading', fi: 'Ladataan', sv: 'Laddar' }

export function hubLoaderLabel(language: string): string {
  return LOADER_LABELS[language] ?? LOADER_LABELS.en
}