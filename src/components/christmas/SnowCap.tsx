import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { snowCapPath } from '@/lib/christmas'

const BAUBLE_COLORS = ['#c8352d', '#1f6b43', '#d9a63c']

/** Snow lying on top of a module card. The parent needs `relative` and the class `xmas-tile` for the hover drizzle. */
export function SnowCap({ seed, bauble = false }: { seed: number; bauble?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(80, Math.round(entry.contentRect.width))))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])
  // Drawn at the card's real width, so icicles keep their shape on a narrow card and on the wide board alike.
  const path = useMemo(() => snowCapPath(seed, width), [seed, width])
  const fill = `xmas-cap-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <div ref={boxRef} aria-hidden="true" className="xmas-cap pointer-events-none absolute -left-1.5 -right-1.5 -top-[15px] z-20 h-9">
      <svg viewBox={`0 0 ${width} 40`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" /><stop offset=".72" stopColor="#eef4fc" /><stop offset="1" stopColor="#c9d9ee" />
          </linearGradient>
        </defs>
        <path d={path} fill={`url(#${fill})`} stroke="#b6c8e0" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="xmas-sprinkle">
        {[0, 1, 2, 3, 4, 5].map(index => <i key={index} style={{ left: `${12 + index * 15}%`, animationDelay: `${index * 0.07}s` }} />)}
      </span>
      {bauble && (
        <span className="xmas-bauble" style={{ left: `${56 + (seed % 3) * 7}%` }}>
          <svg width={22} height={48} viewBox="0 0 22 48">
            <line className="xmas-thread" x1={11} y1={0} x2={11} y2={22} stroke="#cdb57a" strokeWidth={1} />
            <rect x={7.5} y={20} width={7} height={5} rx={1.2} fill="#e3b54f" />
            <circle cx={11} cy={35} r={11} fill={BAUBLE_COLORS[seed % BAUBLE_COLORS.length]} />
            <ellipse cx={7.5} cy={31} rx={3} ry={4.2} fill="#ffffff" opacity={0.5} />
          </svg>
        </span>
      )}
    </div>
  )
}
