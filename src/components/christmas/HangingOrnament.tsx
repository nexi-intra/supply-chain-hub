import { useId, type CSSProperties } from 'react'
import type { OrnamentKind } from '@/lib/christmas'

interface HangingOrnamentProps { kind: OrnamentKind; color: string; thread: number; className?: string; style?: CSSProperties }

const W = 28

/** One classic Danish decoration hanging on a thread from (14, 0). Drawn, not fetched: no images from the web. */
export function HangingOrnament({ kind, color, thread, className, style }: HangingOrnamentProps) {
  const pattern = `xmas-weave-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const t = thread
  const height = t + 34
  return (
    <svg className={`xmas-ornament xmas-ornament-${kind} ${className ?? ''}`} width={W} height={height} viewBox={`0 0 ${W} ${height}`} overflow="visible" style={style} aria-hidden="true">
      <line className="xmas-thread" x1={14} y1={0} x2={14} y2={t + (kind === 'heart' || kind === 'cone' ? 1 : 2)} stroke="#cdb57a" strokeWidth={1} />
      {kind === 'bauble' && (
        <g>
          <rect x={10.5} y={t} width={7} height={5} rx={1.2} fill="#e3b54f" />
          <circle cx={14} cy={t + 15} r={10} fill={color} />
          <path d={`M5 ${t + 15} Q14 ${t + 19} 23 ${t + 15}`} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.6} fill="none" />
          <ellipse cx={10.5} cy={t + 11} rx={2.8} ry={4} fill="#ffffff" opacity={0.5} />
        </g>
      )}
      {kind === 'heart' && (
        // Woven paper heart (flettet julehjerte): red and white strips plaited in a check, with a paper handle.
        <g>
          <defs>
            <pattern id={pattern} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={6} height={6} fill="#fbf7f0" />
              <rect width={3} height={3} fill={color} />
              <rect x={3} y={3} width={3} height={3} fill={color} />
            </pattern>
          </defs>
          <path d={`M8 ${t + 9} C8 ${t + 1} 20 ${t + 1} 20 ${t + 9}`} stroke={color} strokeWidth={1.8} fill="none" />
          <path d={`M14 ${t + 31} C6 ${t + 25} 2.5 ${t + 19} 3 ${t + 13} C3.5 ${t + 6.5} 11 ${t + 5} 14 ${t + 11} C17 ${t + 5} 24.5 ${t + 6.5} 25 ${t + 13} C25.5 ${t + 19} 22 ${t + 25} 14 ${t + 31} Z`} fill={`url(#${pattern})`} stroke="#9e2a24" strokeWidth={0.8} />
        </g>
      )}
      {kind === 'star' && (
        // Folded paper star: each point creased down the middle.
        <g>
          <path d={starPath(14, t + 15, 12, 5)} fill={color} stroke={color === '#f4efe2' ? '#c9bfa4' : '#00000033'} strokeWidth={0.8} />
          <path d={starCreases(14, t + 15, 12)} stroke="#000000" strokeOpacity={0.14} strokeWidth={0.8} />
        </g>
      )}
      {kind === 'cone' && (
        // Kræmmerhus: a glossy paper cone with a handle and sweets peeking out.
        <g>
          <path d={`M6 ${t + 7} C6 ${t - 1} 22 ${t - 1} 22 ${t + 7}`} stroke="#e3b54f" strokeWidth={1.4} fill="none" />
          <circle cx={10.5} cy={t + 6.5} r={2.4} fill="#ffd25e" />
          <circle cx={15} cy={t + 5.8} r={2.6} fill="#7a3fa0" />
          <circle cx={18.5} cy={t + 6.8} r={2.2} fill="#3fd27a" />
          <path d={`M4.5 ${t + 8} L23.5 ${t + 8} L14 ${t + 32} Z`} fill={color} />
          <path d={`M8 ${t + 8} L14 ${t + 32} M14 ${t + 8} L14 ${t + 32} M20 ${t + 8} L14 ${t + 32}`} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1.4} />
          <rect x={4} y={t + 7} width={20} height={2.4} rx={1} fill="#e3b54f" />
        </g>
      )}
      {kind === 'pinecone' && (
        <g>
          <ellipse cx={14} cy={t + 15} rx={6.5} ry={11} fill="#7a4b2a" />
          {[0, 1, 2, 3, 4].map(row => (
            <path key={row} d={`M${8.5 + row * 0.4} ${t + 8 + row * 4} Q14 ${t + 11 + row * 4} ${19.5 - row * 0.4} ${t + 8 + row * 4}`} stroke="#4f2f19" strokeWidth={1.1} fill="none" />
          ))}
          <ellipse cx={14} cy={t + 5} rx={6} ry={2.4} fill="#f7fbff" />
        </g>
      )}
      {kind === 'drum' && (
        // Tromme: red drum, gold rims, white zig-zag cord.
        <g>
          <rect x={5} y={t + 7} width={18} height={17} fill={color} />
          <path d={`M5 ${t + 9} L9.5 ${t + 22} L14 ${t + 9} L18.5 ${t + 22} L23 ${t + 9}`} stroke="#ffffff" strokeWidth={1.2} fill="none" />
          <ellipse cx={14} cy={t + 7} rx={9} ry={2.6} fill="#f4e7c8" stroke="#e3b54f" strokeWidth={1.4} />
          <path d={`M5 ${t + 24} A9 2.6 0 0 0 23 ${t + 24}`} fill="none" stroke="#e3b54f" strokeWidth={1.6} />
        </g>
      )}
      {kind === 'nisse' && (
        <g>
          <circle cx={14} cy={t + 2.5} r={2.6} fill="#ffffff" />
          <path d={`M7 ${t + 14} C9 ${t + 7} 11 ${t + 3} 14 ${t + 3} C17 ${t + 3} 19 ${t + 7} 21 ${t + 14} Z`} fill={color} />
          <rect x={6} y={t + 12.5} width={16} height={3.6} rx={1.8} fill="#ffffff" />
          <circle cx={14} cy={t + 20.5} r={5.6} fill="#f2c4a2" />
          <circle cx={12} cy={t + 19.6} r={0.9} fill="#2a1a12" />
          <circle cx={16} cy={t + 19.6} r={0.9} fill="#2a1a12" />
          <path d={`M8.5 ${t + 21.5} C10 ${t + 30} 18 ${t + 30} 19.5 ${t + 21.5} C17 ${t + 24} 11 ${t + 24} 8.5 ${t + 21.5} Z`} fill="#ffffff" />
        </g>
      )}
      {kind === 'straw' && (
        // Halmstjerne: straw rays tied in the middle with red thread.
        <g>
          <path d={strawRays(14, t + 15, 12)} stroke="#d9b867" strokeWidth={1.9} strokeLinecap="round" />
          <path d={strawRays(14, t + 15, 7, Math.PI / 8)} stroke="#e8cf8c" strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={14} cy={t + 15} r={2.6} fill="none" stroke={color} strokeWidth={1.4} />
        </g>
      )}
    </svg>
  )
}

function starPath(cx: number, cy: number, outer: number, inner: number) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? outer : inner
    return `${(cx + Math.cos(angle) * r).toFixed(2)} ${(cy + Math.sin(angle) * r).toFixed(2)}`
  })
  return `M${points.join(' L')} Z`
}

function starCreases(cx: number, cy: number, outer: number) {
  return Array.from({ length: 5 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    return `M${cx} ${cy} L${(cx + Math.cos(angle) * outer).toFixed(2)} ${(cy + Math.sin(angle) * outer).toFixed(2)}`
  }).join(' ')
}

function strawRays(cx: number, cy: number, length: number, offset = 0) {
  return Array.from({ length: 4 }, (_, i) => {
    const angle = offset + (i * Math.PI) / 4
    const dx = Math.cos(angle) * length
    const dy = Math.sin(angle) * length
    return `M${(cx - dx).toFixed(2)} ${(cy - dy).toFixed(2)} L${(cx + dx).toFixed(2)} ${(cy + dy).toFixed(2)}`
  }).join(' ')
}
