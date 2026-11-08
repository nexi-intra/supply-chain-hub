import { useEffect, useMemo, useRef, useState } from 'react'
import { garland, snowRidgePath, type ChristmasMode } from '@/lib/christmas'
import { useChristmas } from '@/contexts/ChristmasContext'

function useWindowWidth() {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  useEffect(() => {
    const update = () => setWidth(window.innerWidth)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return width
}

/** Software rendering or "reduce motion": the snow lies still instead of falling. */
function prefersStill() {
  if (typeof window === 'undefined') return true
  return document.documentElement.dataset.renderMode === 'software' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

interface Flake { x: number; y: number; z: number; phase: number }

function Snowfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const still = prefersStill()
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    let flakes: Flake[] = []
    let width = 0
    let height = 0

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const count = Math.round(Math.min(still ? 120 : 240, (width * height) / (still ? 12000 : 6500)))
      flakes = Array.from({ length: count }, () => ({ x: Math.random() * width, y: Math.random() * height, z: Math.random(), phase: Math.random() * Math.PI * 2 }))
      if (still) draw(0)
    }

    const draw = (time: number) => {
      const dark = document.documentElement.classList.contains('dark')
      context.clearRect(0, 0, width, height)
      for (const flake of flakes) {
        const radius = 0.7 + flake.z * 2.6
        const sway = Math.sin(time * 0.0009 + flake.phase) * (4 + flake.z * 8)
        context.beginPath()
        context.arc(flake.x + sway, flake.y, radius, 0, Math.PI * 2)
        context.globalAlpha = 0.45 + flake.z * 0.5
        context.fillStyle = '#ffffff'
        context.fill()
        // On a light background white snow needs a soft blue-grey edge to be seen at all.
        if (!dark) {
          context.lineWidth = 0.8
          context.strokeStyle = 'rgba(96, 122, 160, 0.55)'
          context.stroke()
        }
      }
      context.globalAlpha = 1
    }

    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const step = Math.min(50, now - last) / 16.7
      last = now
      const wind = Math.sin(now * 0.00025) * 0.35
      for (const flake of flakes) {
        flake.y += (0.3 + flake.z * 1.1) * step
        flake.x += (wind + 0.12) * (0.4 + flake.z) * step
        if (flake.y > height + 6) { flake.y = -6; flake.x = Math.random() * width }
        if (flake.x > width + 12) flake.x = -12
        if (flake.x < -12) flake.x = width + 12
      }
      draw(now)
      frame = requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener('resize', resize)
    if (!still) frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="xmas-snowfall absolute inset-0 h-full w-full" />
}

const GARLAND = { period: 150, top: 7, sag: 12, perPeriod: 5 }
// Work screens: a short, tight string that stays inside the top ~22 px, above any header buttons.
const GARLAND_COMPACT = { period: 110, top: 5, sag: 4, perPeriod: 5 }

function Garland({ twinkle, compact = false }: { twinkle: boolean; compact?: boolean }) {
  const width = useWindowWidth()
  const options = compact ? GARLAND_COMPACT : GARLAND
  const lights = useMemo(() => garland(width + options.period, options), [width, options])
  const scale = compact ? 0.72 : 1
  return (
    <svg className={twinkle ? 'xmas-garland xmas-twinkle absolute left-0 top-0' : 'xmas-garland absolute left-0 top-0'} width={width} height={48} viewBox={`0 0 ${width} 48`}>
      <path d={lights.path} fill="none" stroke="#1c3124" strokeWidth={compact ? 1.6 : 2} strokeLinecap="round" />
      {lights.bulbs.map((bulb, index) => (
        <g key={index} transform={`translate(${bulb.x.toFixed(1)} ${bulb.y.toFixed(1)}) rotate(${bulb.tilt.toFixed(1)}) scale(${scale})`} style={{ ['--xmas-delay' as string]: `${-((index * 0.37) % 2.6).toFixed(2)}s` }}>
          <circle className="xmas-glow" cx={0} cy={10} r={9.5} fill={bulb.color} />
          <rect className="xmas-socket" x={-2.6} y={-1.6} width={5.2} height={5.4} rx={1.1} fill="#22352a" />
          <path className="xmas-bulb" d="M-3.4 3.6 C-4.8 7.5 -4.1 12.4 0 16 C4.1 12.4 4.8 7.5 3.4 3.6 Z" fill={bulb.color} />
          <ellipse cx={-1.3} cy={8.4} rx={0.9} ry={2.6} fill="#ffffff" opacity={0.55} />
        </g>
      ))}
    </svg>
  )
}

function SnowRidge() {
  const width = useWindowWidth()
  const path = useMemo(() => snowRidgePath(width, 5), [width])
  return (
    <svg className="xmas-ridge absolute left-0 top-0" width={width} height={28} viewBox={`0 0 ${width} 28`}>
      <defs>
        <linearGradient id="xmas-ridge-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#eef4fc" /><stop offset="1" stopColor="#cddcf0" />
        </linearGradient>
      </defs>
      <path d={path} fill="url(#xmas-ridge-fill)" stroke="#b6c8e0" strokeWidth={0.8} />
    </svg>
  )
}

// A fir twig drawn from its own geometry: needles grow out of the twig along its curve, snow rests on top.
function twigPoint(t: number) {
  const x = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * 120 + t * t * 232
  const y = (1 - t) * (1 - t) * 14 + 2 * (1 - t) * t * 16 + t * t * 66
  const dx = 2 * (1 - t) * 120 + 2 * t * (232 - 120)
  const dy = 2 * (1 - t) * (16 - 14) + 2 * t * (66 - 16)
  return { x, y, angle: Math.atan2(dy, dx) }
}

/** Snow resting on the twig: a soft, lumpy pad that follows the curve on its upper side and thins out at the tip. */
function snowOnTwig(from: number, to: number) {
  const top: string[] = []
  const bottom: string[] = []
  const steps = 18
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps
    const p = twigPoint(t)
    const up = { x: Math.sin(p.angle), y: -Math.cos(p.angle) }
    const fade = Math.sin((Math.PI * i) / steps)
    const thickness = (3 + 6 * fade) * (1 + 0.25 * Math.sin(i * 1.9))
    top.push(`${(p.x + up.x * (thickness + 2)).toFixed(1)} ${(p.y + up.y * (thickness + 2)).toFixed(1)}`)
    bottom.unshift(`${(p.x - up.x * 1.5).toFixed(1)} ${(p.y - up.y * 1.5).toFixed(1)}`)
  }
  return `M${top.join(' L')} L${bottom.join(' L')} Z`
}

function needles(from: number, to: number, count: number, length: number) {
  const lines: string[] = []
  for (let i = 0; i <= count; i++) {
    const t = from + ((to - from) * i) / count
    const p = twigPoint(t)
    for (const side of [-1, 1]) {
      for (const lean of [0.55, 0.95]) {
        const angle = p.angle + side * lean
        const l = length * (1 - t * 0.35) * (lean > 0.7 ? 0.85 : 1)
        lines.push(`M${p.x.toFixed(1)} ${p.y.toFixed(1)}l${(Math.cos(angle) * l).toFixed(1)} ${(Math.sin(angle) * l).toFixed(1)}`)
      }
    }
  }
  return lines.join('')
}

function FirBranch({ side }: { side: 'left' | 'right' }) {
  const drawing = useMemo(() => {
    const baublePoint = twigPoint(0.58)
    return { dark: needles(0.02, 0.97, 46, 15), light: needles(0.04, 0.95, 30, 12), snow: snowOnTwig(0.03, 0.62), baublePoint, cone: twigPoint(0.82) }
  }, [])
  return (
    <svg className={`xmas-branch absolute top-[10px] ${side === 'left' ? '-left-3' : '-right-3 -scale-x-100'}`} width={250} height={130} viewBox="0 0 250 130">
      <path d="M0 14 Q120 16 232 66" fill="none" stroke="#4a3221" strokeWidth={4} strokeLinecap="round" />
      <path d={drawing.dark} stroke="#1b5234" strokeWidth={2.4} strokeLinecap="round" />
      <path d={drawing.light} stroke="#2f7d4f" strokeWidth={2} strokeLinecap="round" />
      <ellipse cx={drawing.cone.x + 4} cy={drawing.cone.y + 11} rx={6} ry={10} fill="#7a4b2a" />
      <path d={`M${drawing.cone.x - 1} ${drawing.cone.y + 6}h10M${drawing.cone.x - 1} ${drawing.cone.y + 11}h10M${drawing.cone.x} ${drawing.cone.y + 16}h8`} stroke="#5a351c" strokeWidth={1.4} />
      <path d={drawing.snow} fill="#f7fbff" stroke="#c4d4ea" strokeWidth={0.7} strokeLinejoin="round" />
      <line x1={drawing.baublePoint.x} y1={drawing.baublePoint.y} x2={drawing.baublePoint.x} y2={drawing.baublePoint.y + 26} stroke="#cdb57a" strokeWidth={1} />
      <rect x={drawing.baublePoint.x - 3.5} y={drawing.baublePoint.y + 24} width={7} height={5} rx={1.2} fill="#e3b54f" />
      <circle cx={drawing.baublePoint.x} cy={drawing.baublePoint.y + 41} r={13} fill="#c8352d" />
      <ellipse cx={drawing.baublePoint.x - 4} cy={drawing.baublePoint.y + 36} rx={3.4} ry={4.6} fill="#ffffff" opacity={0.5} />
    </svg>
  )
}

function Snowdrift() {
  return (
    <>
      <svg className="xmas-drift absolute bottom-0 left-0 h-[56px] w-full" viewBox="0 0 1200 70" preserveAspectRatio="none">
        <path d="M0 40 C90 22 170 36 260 30 C380 20 440 42 560 34 C680 26 740 14 860 28 C960 40 1050 20 1130 26 C1170 29 1190 26 1200 25 L1200 70 L0 70 Z" fill="#dbe6f4" />
      </svg>
      <svg className="xmas-nisse absolute bottom-[12px] right-[14%]" width={48} height={64} viewBox="0 0 48 64">
        <path d="M6 28 C11 12 22 3 41 5 C35 11 35 19 37 28 Z" fill="#c8352d" />
        <circle cx={42} cy={6} r={4.2} fill="#ffffff" />
        <rect x={3} y={25} width={38} height={7.5} rx={3.75} fill="#ffffff" />
        <circle cx={22} cy={40} r={11.5} fill="#f2c4a2" />
        <circle cx={18} cy={38} r={1.6} fill="#2a1a12" />
        <circle cx={26} cy={38} r={1.6} fill="#2a1a12" />
        <circle cx={22} cy={42.5} r={2.4} fill="#e0897a" />
        <path d="M10 43 C13 62 31 62 34 43 C29 48 15 48 10 43 Z" fill="#ffffff" />
      </svg>
      <svg className="xmas-drift absolute bottom-0 left-0 h-[40px] w-full" viewBox="0 0 1200 52" preserveAspectRatio="none">
        <defs>
          <linearGradient id="xmas-drift-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e3ecf8" />
          </linearGradient>
        </defs>
        <path d="M0 30 C120 12 230 34 370 24 C510 14 600 36 760 26 C900 18 1040 34 1200 18 L1200 52 L0 52 Z" fill="url(#xmas-drift-fill)" stroke="#bfd0e8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
    </>
  )
}

/** Pure by mode, so it can be tested: full on front pages, still on work screens, nothing in games. */
export function ChristmasDecorations({ mode }: { mode: ChristmasMode }) {
  if (mode === 'off') return null
  const full = mode === 'full'
  // Never catches a click and stays below dialogs (z-50). Full sits under the front page's top bar (z-20);
  // calm only uses the top ~22 px, so it may sit above work screens' sticky headers (z-30/40) to be seen at all.
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: full ? 15 : 45 }}>
      <Garland twinkle={full} compact={!full} />
      <SnowRidge />
      {full && <FirBranch side="left" />}
      {full && <FirBranch side="right" />}
      {full && <Snowdrift />}
      {full && <Snowfall />}
    </div>
  )
}

export function ChristmasLayer() {
  const christmas = useChristmas()
  return christmas.active ? <ChristmasDecorations mode={christmas.mode} /> : null
}
