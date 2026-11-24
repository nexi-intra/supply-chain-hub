import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cardOrnament, snowCapPath, type Ornament } from '@/lib/christmas'
import { HangingOrnament } from './HangingOrnament'
import { useChristmas } from '@/contexts/ChristmasContext'

function seedFrom(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 100000
}

const SPOTS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]
const BUSY = 'button, input, select, textarea, a, svg, img, [role=switch], [role=button]'

/** Text, buttons and fields in the top `depth` px of the card. Branches that start lower are skipped unmeasured,
 *  so a card holding hundreds of rows only costs a handful of measurements. */
function busyNearTop(card: HTMLElement, limit: number) {
  const found: DOMRect[] = []
  const visit = (element: Element) => {
    for (const child of element.children) {
      if (child.classList.contains('xmas-cap')) continue
      const rect = child.getBoundingClientRect()
      if (rect.top >= limit) continue
      if (child.matches(BUSY) || (child.childElementCount === 0 && child.textContent?.trim())) {
        if (rect.width > 0) found.push(rect)
        continue
      }
      visit(child)
    }
  }
  visit(card)
  return found
}

/** Where along the card (0–1) a decoration can hang without covering text, buttons or fields – or null. */
function freeSpot(card: HTMLElement, depth: number, start: number): number | null {
  const box = card.getBoundingClientRect()
  const busy = busyNearTop(card, box.top + depth)
  const order = [...SPOTS.slice(start), ...SPOTS.slice(0, start)]
  for (const spot of order) {
    const x = box.left + box.width * spot
    if (!busy.some(rect => rect.left < x + 16 && rect.right > x - 16)) return spot
  }
  return null
}

interface SnowCapProps {
  seed?: number
  ornament?: Ornament | null
  /** On any card in the app: fit the snow to the card and only hang something on cards big enough to carry it. */
  auto?: boolean
}

/** Snow lying on top of a card. The parent needs `relative`; with the class `xmas-tile` it drizzles on hover. */
export function SnowCap({ seed: givenSeed, ornament: givenOrnament, auto = false }: SnowCapProps) {
  const id = useId()
  // On work screens the decoration stays small and short, inside the card's top padding, so it never hides data.
  const calm = useChristmas().mode === 'calm'
  const seed = givenSeed ?? seedFrom(id)
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const ornament = givenOrnament !== undefined ? givenOrnament : auto ? cardOrnament(seed) : null
  const hasOrnament = !!ornament
  // Fixed cards (the module tiles) hang it in the middle; any other card looks for a free spot itself.
  const [inset, setInset] = useState(false)
  const [spot, setSpot] = useState<number | null>(auto ? null : 0.48 + (seed % 5) * 0.04)

  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const card = box.parentElement
    const style = card ? getComputedStyle(card) : null
    // A card that clips its overflow would cut the snow flat at the edge: let it lie just inside instead.
    const clipped = !!style && /hidden|clip/.test(`${style.overflow} ${style.overflowY}`)
    setInset(clipped)
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setWidth(Math.max(80, Math.round(box.getBoundingClientRect().width)))
        if (!auto || !card) return
        const roomy = card.clientWidth >= 280 && card.clientHeight >= 120
        // How far down the decoration reaches, measured from the card's top edge.
        const depth = (clipped ? -4 : -15) + 21 + (calm ? 26 : 50)
        setSpot(roomy && hasOrnament ? freeSpot(card, depth, seed % SPOTS.length) : null)
      })
    }
    update()
    const resize = new ResizeObserver(update)
    resize.observe(box)
    if (card) resize.observe(card)
    // Text often arrives after the card (data from the shared drive): look again when it does – only cards that
    // actually carry a decoration, so long lists of cards (Locations, Counts) don't all watch their content.
    const content = card && auto && hasOrnament ? new MutationObserver(update) : null
    if (card) content?.observe(card, { childList: true, subtree: true, characterData: true })
    return () => { cancelAnimationFrame(frame); resize.disconnect(); content?.disconnect() }
  }, [auto, calm, hasOrnament, seed])

  // Drawn at the card's real width, so icicles keep their shape on a narrow card and on a wide board alike.
  const path = useMemo(() => snowCapPath(seed, width), [seed, width])
  const fill = `xmas-cap-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <div ref={boxRef} aria-hidden="true" className={`xmas-cap pointer-events-none absolute -left-1.5 -right-1.5 z-20 h-9 !border-0 ${inset ? '-top-1' : '-top-[15px]'}`}>
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
      {ornament && spot !== null && (
        <span className={calm ? 'xmas-hanging is-small' : 'xmas-hanging'} style={{ left: `calc(${spot * 100}% - 14px)`, animationDelay: `-${(seed % 7) * 0.6}s` }}>
          <HangingOrnament kind={ornament.kind} color={ornament.color} thread={calm ? 2 : 8 + (seed % 4) * 3} />
        </span>
      )}
    </div>
  )
}