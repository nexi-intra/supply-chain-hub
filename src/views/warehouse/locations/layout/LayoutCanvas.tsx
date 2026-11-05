import { useId, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { locationKeyOf } from '@/lib/warehouse/locations'
import { cellsOf, labelBox } from '@/lib/warehouse/layout/geometry'
import { bayNo, isSpacer, levelsOf, pullNo } from '@/lib/warehouse/layout/slots'
import { t } from '@/lib/warehouse/text'
import type { LayoutItem, LayoutItemType, LayoutOwner, WarehouseLayout } from '@/types/warehouse'

export type FloorView = 'all' | 'ground' | 'mezz'
export type CanvasPointer = { kind: 'down' | 'move' | 'up'; x: number; y: number; itemId?: string; handle?: 'resize' }

export const ITEM_TYPES: LayoutItemType[] = ['rack', 'floorrow', 'shelfrack', 'floor', 'special', 'dock', 'station', 'receiving', 'gate', 'pc', 'office', 'text']
export const TYPE_COLORS: Record<LayoutItemType, string> = {
  rack: '#3b82f6', floorrow: '#10b981', shelfrack: '#8b5cf6', floor: '#10b981', special: '#f97316', dock: '#14b8a6',
  station: '#ec4899', receiving: '#0ea5e9', gate: '#64748b', pc: '#ef4444', office: '#94a3b8', text: '#a1a1a6',
}
// Only these types carry an owner; the others are never places of a team.
export const OWNED: LayoutItemType[] = ['rack', 'floorrow', 'floor']
const VISUAL = '#94a3b8'
const PULL = '#0d9488'

export function typeLabel(type: LayoutItemType): string {
  switch (type) {
    case 'rack': return t('Pallereol (række)', 'Pallet rack (row)')
    case 'floorrow': return t('Gulvpladser i række (fx S)', 'Floor places in a row (e.g. S)')
    case 'shelfrack': return t('Reol med hylder', 'Shelf rack')
    case 'floor': return t('Gulvpladser (område)', 'Floor places (area)')
    case 'special': return t('Særlig plads (bord, swap …)', 'Special place (table, swap …)')
    case 'dock': return t('Loading dock / sluse', 'Loading dock')
    case 'station': return t('Arbejdsstation', 'Work station')
    case 'receiving': return t('Varemodtagelse', 'Goods receipt')
    case 'gate': return t('Port', 'Gate')
    case 'pc': return 'PC'
    case 'office': return t('Kontor / væg / blokeret', 'Office / wall / blocked')
    case 'text': return t('Tekst', 'Text')
  }
}

const textProps = { fill: 'currentColor', textAnchor: 'middle', dominantBaseline: 'central' } as const

function NameTag({ item, horiz }: { item: LayoutItem; horiz: boolean }) {
  const { x, y, w, h } = item
  const fill = item.name ? 'currentColor' : '#f59e0b'
  return horiz
    ? <text x={x - 0.35} y={y + h / 2} fill={fill} fontSize={1.1} fontWeight={700} textAnchor="end" dominantBaseline="central">{item.name || '?'}</text>
    : <text x={x + w / 2} y={y - 0.5} fill={fill} fontSize={1.1} fontWeight={700} textAnchor="middle">{item.name || '?'}</text>
}

function Rack({ item, color, hatch, foreign }: { item: LayoutItem; color: string; hatch: string; foreign: boolean }) {
  const { x, y, w, h } = item
  const horiz = w >= h
  const n = Math.max(1, item.bays ?? 1)
  const len = horiz ? w : h
  const thick = horiz ? h : w
  const seg = len / n
  const palletThick = item.pull ? thick * 0.6 : thick
  const fs = Math.max(0.25, Math.min(seg * 0.3, palletThick * 0.45, 0.75))
  const aisles = new Set(item.aisles ?? [])
  const bays = Array.from({ length: n }, (_, i) => i + 1).map(pos => {
    const i = pos - 1
    const no = bayNo(item, pos)
    const box = horiz ? [x + i * seg, y, seg, h] : [x, y + i * seg, w, seg]
    const cx = horiz ? x + (i + 0.5) * seg : x + palletThick / 2
    const cy = horiz ? y + palletThick / 2 : y + (i + 0.5) * seg
    const line = i > 0 && (horiz
      ? <line x1={x + i * seg} y1={y} x2={x + i * seg} y2={y + h} stroke={color} strokeWidth={0.04} />
      : <line x1={x} y1={y + i * seg} x2={x + w} y2={y + i * seg} stroke={color} strokeWidth={0.04} />)
    if (isSpacer(item, pos)) {
      return (
        <g key={pos}>
          {line}
          <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="var(--background)" opacity={0.75} />
          <text x={cx} y={cy} {...textProps} fontSize={fs * 0.7} opacity={0.45}>{t(`(${no}) tomt`, `(${no}) empty`)}</text>
        </g>
      )
    }
    const own = item.bayLevels?.[pos]
    const levels = levelsOf(item, pos)
    const bay = item.slots.filter(slot => slot.pos === pos && slot.unit == null)
    const picks = bay.filter(slot => slot.kind === 'pick-unnamed' || slot.purpose === 'pick').length
    const shelves = bay.filter(slot => slot.kind === 'shelf').length
    const levelFill = picks ? '#f59e0b' : shelves ? PULL : own != null ? '#8b5cf6' : 'currentColor'
    return (
      <g key={pos}>
        {aisles.has(pos) && <path d={`M${box[0]} ${box[1]}L${box[0] + box[2]} ${box[1] + box[3]}M${box[0] + box[2]} ${box[1]}L${box[0]} ${box[1] + box[3]}`} stroke={color} strokeWidth={0.06} opacity={0.7} />}
        {line}
        <text x={cx} y={cy - fs * 0.3} {...textProps} fontSize={fs} fontWeight={no === 1 ? 700 : undefined}>{`${item.name}${no}`}</text>
        <text x={cx} y={cy + fs * 0.65} {...textProps} fill={levelFill} fontSize={fs * 0.62} fontWeight={levelFill === 'currentColor' ? undefined : 700} opacity={levelFill === 'currentColor' ? 0.6 : 1}>
          {t(`${levels} niv.`, `${levels} lev.`)}{picks ? t(' · pluk', ' · pick') : ''}{shelves ? t(' · hyl', ' · shelf') : ''}
        </text>
      </g>
    )
  })
  const pull = item.pull
  const m = pull ? Math.max(1, pull.count) : 0
  const pThick = thick - palletThick
  const pSeg = len / Math.max(1, m)
  const pfs = Math.max(0.16, Math.min(pSeg * 0.42, pThick * 0.6, 0.5))
  return (
    <g>
      {foreign && (horiz
        ? <rect x={x} y={y} width={w} height={palletThick} fill={`url(#${hatch})`} />
        : <rect x={x} y={y} width={palletThick} height={h} fill={`url(#${hatch})`} />)}
      {bays}
      {pull && (
        <g>
          {horiz
            ? <rect x={x} y={y + palletThick} width={w} height={pThick} fill={PULL} fillOpacity={0.3} stroke={PULL} strokeWidth={0.05} />
            : <rect x={x + palletThick} y={y} width={pThick} height={h} fill={PULL} fillOpacity={0.3} stroke={PULL} strokeWidth={0.05} />}
          {Array.from({ length: m }, (_, j) => (
            <g key={j}>
              {j > 0 && (horiz
                ? <line x1={x + j * pSeg} y1={y + palletThick} x2={x + j * pSeg} y2={y + h} stroke={PULL} strokeWidth={0.03} />
                : <line x1={x + palletThick} y1={y + j * pSeg} x2={x + w} y2={y + j * pSeg} stroke={PULL} strokeWidth={0.03} />)}
              <text x={horiz ? x + (j + 0.5) * pSeg : x + palletThick + pThick / 2} y={horiz ? y + palletThick + pThick / 2 : y + (j + 0.5) * pSeg} {...textProps} fontSize={pfs}>{pullNo(item, j + 1)}</text>
            </g>
          ))}
        </g>
      )}
      <NameTag item={item} horiz={horiz} />
      {foreign && (horiz
        ? <text x={x - 0.35} y={y + h / 2 + 0.95} fill="#64748b" fontSize={0.5} fontWeight={700} textAnchor="end">{item.owner}</text>
        : <text x={x + w / 2} y={y - 1.6} fill="#64748b" fontSize={0.5} fontWeight={700} textAnchor="middle">{item.owner}</text>)}
    </g>
  )
}

function FloorRow({ item, color }: { item: LayoutItem; color: string }) {
  const { x, y, w, h } = item
  const horiz = w >= h
  const n = Math.max(1, item.count ?? 1)
  const depth = Math.min(6, Math.max(1, item.depth ?? 1))
  const seg = (horiz ? w : h) / n
  const cell = (horiz ? h : w) / depth
  const fs = Math.max(0.2, Math.min(seg * 0.3, (horiz ? h : w) * 0.4, 0.7))
  return (
    <g>
      {Array.from({ length: depth - 1 }, (_, d) => (horiz
        ? <line key={`d${d}`} x1={x} y1={y + (d + 1) * cell} x2={x + w} y2={y + (d + 1) * cell} stroke={color} strokeWidth={0.03} strokeDasharray=".15 .1" />
        : <line key={`d${d}`} x1={x + (d + 1) * cell} y1={y} x2={x + (d + 1) * cell} y2={y + h} stroke={color} strokeWidth={0.03} strokeDasharray=".15 .1" />))}
      {Array.from({ length: n }, (_, i) => {
        const slot = item.slots.find(s => s.pos === i + 1)
        return (
          <g key={i}>
            {i > 0 && (horiz
              ? <line x1={x + i * seg} y1={y} x2={x + i * seg} y2={y + h} stroke={color} strokeWidth={0.05} />
              : <line x1={x} y1={y + i * seg} x2={x + w} y2={y + i * seg} stroke={color} strokeWidth={0.05} />)}
            <text x={horiz ? x + (i + 0.5) * seg : x + w / 2} y={horiz ? y + h / 2 : y + (i + 0.5) * seg} {...textProps} fontSize={fs}>{slot?.name ?? ''}</text>
          </g>
        )
      })}
      <NameTag item={item} horiz={horiz} />
    </g>
  )
}

/** The box, or the cells of a cut shape with an outline around them. */
function Shape({ item, fill, fillOpacity, stroke }: { item: LayoutItem; fill: string; fillOpacity?: number; stroke?: { color: string; width: number; dash?: string } }) {
  const edge = stroke ? { stroke: stroke.color, strokeWidth: stroke.width, strokeDasharray: stroke.dash } : { stroke: 'none' }
  if (!item.cut?.length) return <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={0.15} fill={fill} fillOpacity={fillOpacity} {...edge} />
  const cells = cellsOf(item)
  const set = new Set(cells.map(([cx, cy]) => `${cx},${cy}`))
  let d = ''
  for (const [cx, cy] of cells) {
    if (!set.has(`${cx},${cy - 1}`)) d += `M${cx} ${cy}H${cx + 1}`
    if (!set.has(`${cx},${cy + 1}`)) d += `M${cx} ${cy + 1}H${cx + 1}`
    if (!set.has(`${cx - 1},${cy}`)) d += `M${cx} ${cy}V${cy + 1}`
    if (!set.has(`${cx + 1},${cy}`)) d += `M${cx + 1} ${cy}V${cy + 1}`
  }
  return (
    <g>
      {cells.map(([cx, cy]) => <rect key={`${cx},${cy}`} x={cx} y={cy} width={1.02} height={1.02} fill={fill} fillOpacity={fillOpacity} />)}
      {stroke && <path d={d} fill="none" {...edge} />}
    </g>
  )
}

function Label({ item }: { item: LayoutItem }) {
  const name = item.name || typeLabel(item.type)
  const sub = item.type !== 'shelfrack' ? '' : item.visual ? t('ikke lager', 'not stock') : (item.sections ?? 1) > 1 ? t(`${item.sections} sektioner`, `${item.sections} sections`) : t(`${item.shelves ?? 0} hylder`, `${item.shelves ?? 0} shelves`)
  const box = labelBox(item)
  const fit = (len: number, thick: number) => Math.min(thick * 0.4, len / (Math.max(4, name.length) * 0.6), 0.9)
  const across = fit(box.w, box.h)
  const along = fit(box.h, box.w)
  const vertical = along > across * 1.25
  const fs = Math.max(0.3, vertical ? along : across)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const turn = vertical ? `rotate(-90 ${cx} ${cy})` : undefined
  return (
    <g transform={turn}>
      <text x={cx} y={cy - (sub ? fs * 0.35 : 0)} {...textProps} fontSize={fs} fontWeight={600}>{name}</text>
      {sub && <text x={cx} y={cy + fs * 0.7} {...textProps} fontSize={fs * 0.7} opacity={0.7}>{sub}</text>}
    </g>
  )
}

type ItemProps = { item: LayoutItem; hatch: string; team: LayoutOwner; selected: boolean; duplicate: boolean; highlighted: boolean; editable: boolean; cursor?: string }

function Item({ item, hatch, team, selected, duplicate, highlighted, editable, cursor }: ItemProps) {
  const { x, y, w, h } = item
  const base = TYPE_COLORS[item.type]
  const mezz = item.floor === 'mezz'
  const color = item.visual ? VISUAL : base
  const foreign = OWNED.includes(item.type) && (item.owner ?? 'TCD') !== team
  const opacity = mezz ? 0.35 : item.visual ? 0.12 : 0.22
  return (
    <g data-item={item.id} style={{ cursor: cursor ?? (editable ? 'move' : undefined) }}>
      {item.type === 'text' ? (
        <>
          <rect x={x} y={y} width={w} height={h} fill="transparent" />
          <text x={x + w / 2} y={y + h / 2} {...textProps} fontSize={Math.min(h * 0.7, 1.2)}>{item.name || typeLabel('text')}</text>
        </>
      ) : (
        <>
          <Shape item={item} fill={color} fillOpacity={opacity} stroke={{ color, width: mezz ? 0.12 : 0.08, dash: mezz ? '.4 .2' : item.visual ? '.25 .15' : undefined }} />
          {mezz && <text x={x + w - 0.15} y={y + h + 0.55} fontSize={0.5} fill={base} fontWeight={700} textAnchor="end">{t('OVENPÅ', 'UPSTAIRS')}</text>}
          {foreign && item.type !== 'rack' && (
            <>
              <Shape item={item} fill={`url(#${hatch})`} />
              <text x={x + 0.15} y={y - 0.2} fill="#64748b" fontSize={0.5} fontWeight={700}>{item.owner}</text>
            </>
          )}
          {item.type === 'rack' ? <Rack item={item} color={base} hatch={hatch} foreign={foreign} /> : item.type === 'floorrow' ? <FloorRow item={item} color={base} /> : <Label item={item} />}
        </>
      )}
      {duplicate && <rect x={x - 0.15} y={y - 0.15} width={w + 0.3} height={h + 0.3} fill="none" stroke="#ef4444" strokeWidth={0.16} />}
      {highlighted && <rect x={x - 0.25} y={y - 0.25} width={w + 0.5} height={h + 0.5} rx={0.2} fill="none" stroke="#f59e0b" strokeWidth={0.22} />}
      {selected && (
        <>
          <rect x={x - 0.1} y={y - 0.1} width={w + 0.2} height={h + 0.2} fill="none" stroke="var(--primary)" strokeWidth={0.14} strokeDasharray=".4 .25" />
          {editable && <rect data-handle="resize" x={x + w - 0.25} y={y + h - 0.25} width={0.5} height={0.5} fill="var(--primary)" style={{ cursor: 'nwse-resize' }} />}
        </>
      )}
    </g>
  )
}

type Props = {
  layout: Pick<WarehouseLayout, 'hall' | 'items'>
  selected?: string | null
  /** Item ids drawn with a highlight. */
  highlight?: string[]
  /** Place ids (locationKey) used twice; items holding one get a red outline. */
  duplicates?: Set<string>
  floorView: FloorView
  /** 1 = the canvas width. */
  zoom: number
  readOnly?: boolean
  team?: LayoutOwner
  cursor?: string
  preview?: { x: number; y: number; w: number; h: number; color: string } | null
  onPointer?(event: CanvasPointer): void
}

/** The hall as SVG, 1 unit = 1 grid cell. Pointer positions are reported in cells (not rounded). */
export function LayoutCanvas({ layout, selected, highlight, duplicates, floorView, zoom, readOnly, team = 'TCD', cursor, preview, onPointer }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const hatch = `hatch${uid}`
  const { w, h } = layout.hall

  function report(kind: CanvasPointer['kind'], event: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix || !onPointer) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    const target = event.target as Element
    const itemId = target.closest('[data-item]')?.getAttribute('data-item') ?? undefined
    const handle = target.closest('[data-handle]') ? 'resize' as const : undefined
    if (kind === 'down') svg.setPointerCapture(event.pointerId)
    onPointer({ kind, x: point.x, y: point.y, itemId, handle })
  }

  const isDuplicate = (item: LayoutItem) => !!duplicates?.size && !item.visual && item.slots.some(slot => duplicates.has(locationKeyOf(slot.name)))
  const draw = (item: LayoutItem) => (
    <Item key={item.id} item={item} hatch={hatch} team={team} selected={item.id === selected} duplicate={isDuplicate(item)} highlighted={!!highlight?.includes(item.id)} editable={!readOnly} cursor={cursor} />
  )

  return (
    <svg
      ref={svgRef}
      viewBox={`-2 -2.5 ${w + 4} ${h + 4.5}`}
      className="block h-auto touch-none select-none text-foreground"
      style={{ width: `${zoom * 100}%`, cursor }}
      onPointerDown={event => { if (event.button === 0) report('down', event) }}
      onPointerMove={event => report('move', event)}
      onPointerUp={event => report('up', event)}
      role="img"
      aria-label={t('Tegning af lageret', 'Drawing of the warehouse')}
    >
      <defs>
        <pattern id={`g1${uid}`} width={1} height={1} patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={0.03} /></pattern>
        <pattern id={`g5${uid}`} width={5} height={5} patternUnits="userSpaceOnUse"><rect width={5} height={5} fill={`url(#g1${uid})`} /><path d="M5 0H0V5" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={0.06} /></pattern>
        <pattern id={hatch} width={0.45} height={0.45} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={0.45} stroke="#64748b" strokeWidth={0.09} opacity={0.55} /></pattern>
      </defs>
      <rect x={0} y={0} width={w} height={h} fill={`url(#g5${uid})`} />
      <rect x={0} y={0} width={w} height={h} fill="none" stroke="currentColor" strokeWidth={0.14} />
      {layout.items.map(item => {
        const upstairs = item.floor === 'mezz'
        if (floorView === 'ground' && upstairs) return null
        if (floorView === 'mezz' && !upstairs) return <g key={item.id} opacity={0.25} pointerEvents="none">{draw(item)}</g>
        return draw(item)
      })}
      {preview && <rect x={preview.x} y={preview.y} width={preview.w} height={preview.h} fill={preview.color} fillOpacity={0.15} stroke={preview.color} strokeWidth={0.1} strokeDasharray=".3 .2" pointerEvents="none" />}
    </svg>
  )
}
