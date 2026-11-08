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
    <svg viewBox="0 0 128 128" width={size} height={size} overflow="visible" className={cn('shrink-0', className)} {...a11y}>
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
      {/* Shown only in the Christmas season (main.css: html[data-christmas]). Drawn outside the tile on purpose. */}
      <g className="hub-mark-hat" transform="translate(100 8) rotate(22)">
        <path d="M-34 6 C-28 -20 -10 -40 16 -50 C22 -52 30 -48 34 -40 C24 -38 18 -22 22 6 Z" fill="#c8352d" />
        <path d="M-10 6 C-6 -16 4 -30 16 -38 C10 -24 8 -10 10 6 Z" fill="#a52a23" opacity=".55" />
        <rect x="-38" y="0" width="64" height="15" rx="7.5" fill="#f7fbff" />
        <circle cx="36" cy="-38" r="9" fill="#f7fbff" />
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