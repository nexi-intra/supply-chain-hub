import { useEffect, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { locationKeyOf } from '@/lib/warehouse/locations'
import type { EditorAction } from '@/lib/warehouse/layout/editor'
import { bayNo, fillPattern, isSpacer, isUnnamed, levelsOf, NAME_MAX, pullNo, shelvesOfUnit, slotKey, slotLabel, slotValues } from '@/lib/warehouse/layout/slots'
import { t } from '@/lib/warehouse/text'
import type { LayoutItem, LayoutSlot } from '@/types/warehouse'

export type SlotLink = 'linked' | 'new' | 'blocked'
export type SlotStatus = 'empty' | 'used' | 'pick' | 'reserved' | 'other-team' | 'none'

type Props = {
  item: LayoutItem
  mode: 'edit' | 'view'
  duplicates?: Set<string>
  /** By slot id. */
  link?: Record<string, SlotLink>
  /** By slot id. */
  status?: Record<string, SlotStatus>
  /** By slot id. What stands on the place (view mode only): a short cell text and a longer title. */
  content?: Record<string, { text: string; title: string }>
  highlight?: string
  /** In edit mode it takes over a click (the slot is being picked). */
  onSlot?: (slotId: string) => void
  dispatch?: Dispatch<EditorAction>
}

type Column = { label: string; spacer?: boolean }
type Block = { key: string; axis?: string; cols: Column[]; rows: { label: string; cells: (LayoutSlot | null)[] }[] }

const LINK_FILL: Record<SlotLink, string> = { linked: '#10b981', new: '#3b82f6', blocked: '#ef4444' }
export const STATUS_FILL: Record<SlotStatus, string> = { empty: '#10b981', used: '#3b82f6', pick: '#f59e0b', reserved: '#8b5cf6', 'other-team': '#94a3b8', none: '#cbd5e1' }
const CLICK_MS = 500
const range = (n: number) => Array.from({ length: Math.max(1, n) }, (_, i) => i + 1)

function kindFill(slot: LayoutSlot): string {
  if (slot.kind === 'pallet') return slot.purpose === 'pick' ? '#f59e0b' : '#3b82f6'
  if (slot.kind === 'pick-unnamed') return '#f59e0b'
  if (slot.kind === 'shelf') return '#0d9488'
  return '#94a3b8'
}

function kindLabel(item: LayoutItem, slot: LayoutSlot): string {
  if (slot.unit != null || item.type === 'shelfrack') return t('Hylde', 'Shelf')
  if (item.type === 'floorrow') return t(`Gulvplads til ${slot.capacity ?? 1} paller`, `Floor place for ${slot.capacity ?? 1} pallets`)
  switch (slot.kind) {
    case 'pallet': return slot.purpose === 'pick' ? t('Plukplads med navn (tæller som palleplads)', 'Pick place with a name (counts as a pallet place)') : t('Palleplads', 'Pallet place')
    case 'pick-unnamed': return t('Plukplads uden navn (tæller ikke)', 'Pick place without a name (does not count)')
    case 'shelf': return t('Reolsystem med hylder (tæller ikke som palleplads)', 'Shelf system (does not count as a pallet place)')
    case 'blocked': return t('Ingen plads / spærret', 'No place / blocked')
    case 'aisle': return t('Køregang – sættes i feltet "Køregang"', 'Aisle – set in the "Aisle" field')
    default: return ''
  }
}

function blocksOf(item: LayoutItem): Block[] {
  const byKey = new Map(item.slots.map(slot => [slotKey(slot), slot]))
  if (item.type === 'rack') {
    const positions = range(item.bays ?? 1).sort((a, b) => bayNo(item, a) - bayNo(item, b))
    const real = positions.filter(pos => !isSpacer(item, pos))
    const top = Math.max(1, ...real.map(pos => levelsOf(item, pos)))
    const blocks: Block[] = [{
      key: 'bays',
      cols: positions.map(pos => (isSpacer(item, pos) ? { label: `(${bayNo(item, pos)})`, spacer: true } : { label: `${item.name}${bayNo(item, pos)}` })),
      rows: range(top).reverse().map(level => ({ label: String(level), cells: positions.map(pos => byKey.get(slotKey({ pos, level })) ?? null) })),
    }]
    if (item.pull) {
      const units = range(item.pull.count).sort((a, b) => pullNo(item, a) - pullNo(item, b))
      const shelves = Math.max(1, ...units.map(unit => shelvesOfUnit(item, unit)))
      blocks.push({
        key: 'pull',
        cols: units.map(unit => ({ label: `${item.name}${pullNo(item, unit)}` })),
        rows: range(shelves).map(shelf => ({ label: `H${shelf}`, cells: units.map(unit => byKey.get(slotKey({ unit, shelf })) ?? null) })),
      })
    }
    return blocks
  }
  if (item.type === 'shelfrack') {
    const sections = range(item.sections ?? 1)
    const shelves = Math.max(1, ...item.slots.map(slot => slot.shelf ?? 1))
    return [{
      key: 'sections', axis: t('Sektion', 'Section'),
      cols: sections.map(section => ({ label: String(section) })),
      rows: range(shelves).map(shelf => ({ label: `H${shelf}`, cells: sections.map(section => byKey.get(slotKey({ section, shelf })) ?? null) })),
    }]
  }
  if (item.type === 'floorrow') {
    const slots = item.slots.filter(slot => slot.pos != null).sort((a, b) => Number(slotValues(item, a).nr) - Number(slotValues(item, b).nr))
    return [{ key: 'row', cols: slots.map(slot => ({ label: String(slotValues(item, slot).nr) })), rows: [{ label: '', cells: slots }] }]
  }
  return []
}

function countsText(item: LayoutItem): string {
  const of = (test: (slot: LayoutSlot) => boolean) => item.slots.filter(test).length
  if (item.type === 'floorrow') {
    const capacity = item.slots.reduce((sum, slot) => sum + (slot.capacity ?? 1), 0)
    return t(`${item.slots.length} gulvpladser · plads til ${capacity} paller`, `${item.slots.length} floor places · room for ${capacity} pallets`)
  }
  if (item.type === 'shelfrack') return t(`${item.slots.length} hylder`, `${item.slots.length} shelves`)
  const pallets = of(slot => slot.unit == null && slot.kind === 'pallet')
  const picks = of(slot => slot.unit == null && slot.kind === 'pallet' && slot.purpose === 'pick')
  const unnamed = of(slot => slot.kind === 'pick-unnamed')
  const shelf = of(slot => slot.unit == null && slot.kind === 'shelf')
  const pulls = of(slot => slot.unit != null)
  return [
    t(`Pallepladser: ${pallets}${picks ? ` (heraf ${picks} pluk med navn)` : ''}`, `Pallet places: ${pallets}${picks ? ` (${picks} of them pick with a name)` : ''}`),
    unnamed ? t(`pluk uden navn: ${unnamed}`, `pick without a name: ${unnamed}`) : '',
    shelf ? t(`rum med reolsystem: ${shelf}`, `rooms with a shelf system: ${shelf}`) : '',
    pulls ? t(`hylder i udtræk: ${pulls}`, `pull-out shelves: ${pulls}`) : '',
  ].filter(Boolean).join(' · ')
}

function cellText(slot: LayoutSlot, column: string): string {
  if (slot.kind === 'aisle') return t('kør', 'aisle')
  if (slot.kind === 'blocked') return '—'
  if (slot.kind === 'pick-unnamed') return t('pluk', 'pick')
  const name = slot.name
  return name.startsWith(column) && name.length > column.length ? name.slice(column.length).trim() : name || '?'
}

const cyclable = (item: LayoutItem, slot: LayoutSlot) => item.type === 'rack' && slot.unit == null && slot.level != null && slot.kind !== 'aisle'

/** A rack, shelf rack or floor row seen from the front: levels (top first) × bays, with every slot. */
export function RackFront({ item, mode, duplicates, link, status, content, highlight, onSlot, dispatch }: Props) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set())
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const cancelled = useRef(false)
  const lastCycle = useRef<{ slot: LayoutSlot; at: number } | null>(null)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const edit = mode === 'edit' && !!dispatch
  const shown = mode === 'view' ? content : undefined
  const blocks = blocksOf(item)
  const selected = item.slots.filter(slot => chosen.has(slot.id))
  const tooLong = asking == null ? 0 : selected.filter(slot => !isUnnamed(slot) && fillPattern(asking.trim(), slotValues(item, slot)).length > NAME_MAX).length
  const isDuplicate = (slot: LayoutSlot) => !!duplicates?.size && !isUnnamed(slot) && duplicates.has(locationKeyOf(slot.name))

  function toggle(slotId: string) {
    setChosen(current => {
      const next = new Set(current)
      if (!next.delete(slotId)) next.add(slotId)
      return next
    })
  }

  function onClick(slot: LayoutSlot, event: ReactMouseEvent) {
    if (!edit || onSlot) { onSlot?.(slot.id); return }
    if (picking || event.shiftKey || event.ctrlKey || event.metaKey) { toggle(slot.id); return }
    window.clearTimeout(timer.current)
    // A double-click renames, so the first click waits a moment before it changes the kind.
    if (event.detail > 1) return
    // Only the cycle from a double-click's own first click may be undone.
    lastCycle.current = null
    if (!cyclable(item, slot)) return
    timer.current = window.setTimeout(() => {
      lastCycle.current = { slot, at: Date.now() }
      dispatch!({ type: 'cycleSlot', itemId: item.id, slotId: slot.id })
    }, CLICK_MS)
  }

  function onDoubleClick(slot: LayoutSlot) {
    window.clearTimeout(timer.current)
    if (!edit || picking || onSlot) return
    // A slow double-click (longer than CLICK_MS) already changed the kind: take that back first.
    const cycled = lastCycle.current
    lastCycle.current = null
    const before = cycled && cycled.slot.id === slot.id && Date.now() - cycled.at < 2 * CLICK_MS ? cycled.slot : null
    if (before) dispatch!({ type: 'undo' })
    if (isUnnamed(before ?? slot)) return
    cancelled.current = false
    setEditing(slot.id)
  }

  function commitName(slot: LayoutSlot, value: string) {
    setEditing(null)
    const name = value.trim()
    if (cancelled.current || !name || name === slot.name) return
    dispatch!({ type: 'renameSlot', itemId: item.id, slotId: slot.id, name })
  }

  function applyPattern(pattern: string) {
    if (!pattern.trim()) return
    dispatch!({ type: 'renameSlots', itemId: item.id, slotIds: selected.map(slot => slot.id), pattern: pattern.trim() })
    setAsking(null)
    setChosen(new Set())
    setPicking(false)
  }

  function fillOf(slot: LayoutSlot): { fill: string; dashed: boolean } {
    const linked = link?.[slot.id]
    if (linked) return { fill: LINK_FILL[linked], dashed: false }
    const state = mode === 'view' ? status?.[slot.id] : undefined
    if (state) return { fill: STATUS_FILL[state], dashed: false }
    return { fill: kindFill(slot), dashed: slot.kind === 'pick-unnamed' }
  }

  function titleOf(slot: LayoutSlot): string {
    const parts = [slotLabel(item, slot), kindLabel(item, slot)]
    if (isDuplicate(slot)) parts.push(t('navnet bruges to gange', 'the name is used twice'))
    return parts.join(' – ')
  }

  function contentText(slot: LayoutSlot): string | null {
    const entry = shown?.[slot.id]
    if (!entry) return null
    return entry.text || (status?.[slot.id] === 'empty' ? t('tom', 'empty') : '')
  }

  return (
    <div className="space-y-2" data-testid="rack-front">
      {edit && (
        <>
          <p className="text-xs text-muted-foreground">{item.type === 'rack'
            ? t('Klik skifter: palleplads → pluk med navn → pluk uden navn (stiplet) → reolsystem → ingen plads. Dobbeltklik retter navnet. Shift/Ctrl-klik vælger flere.', 'Click changes: pallet place → pick with a name → pick without a name (dashed) → shelf system → no place. Double-click edits the name. Shift/Ctrl-click selects several.')
            : t('Dobbeltklik retter navnet. Shift/Ctrl-klik vælger flere.', 'Double-click edits the name. Shift/Ctrl-click selects several.')}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant={picking ? 'default' : 'outline'} aria-pressed={picking} onClick={() => setPicking(!picking)}>{t('Vælg flere', 'Select several')}</Button>
            {selected.length > 0 && (
              <>
                <span className="text-xs">{t(`${selected.length} valgt`, `${selected.length} selected`)}</span>
                <Button size="sm" variant="outline" onClick={() => setAsking(item.pattern ?? '')}>{t('Giv navne efter mønster …', 'Name by pattern …')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setChosen(new Set())}>{t('Ryd valg', 'Clear selection')}</Button>
              </>
            )}
          </div>
        </>
      )}

      {blocks.map(block => (
        <div key={block.key} className="overflow-x-auto pb-1">
          <table className="border-separate border-spacing-0.5 text-[10px]">
            <tbody>
              {block.rows.map(row => (
                <tr key={row.label}>
                  <td className="pr-1 text-right text-muted-foreground">{row.label}</td>
                  {row.cells.map((slot, index) => {
                    if (!slot) return <td key={index} />
                    const { fill, dashed } = fillOf(slot)
                    const column = block.cols[index].label
                    const duplicate = isDuplicate(slot)
                    const clickable = edit && !onSlot ? picking || cyclable(item, slot) || !isUnnamed(slot) : !!onSlot
                    const title = shown?.[slot.id]?.title ?? titleOf(slot)
                    const below = contentText(slot)
                    const label = (
                      <>
                        {cellText(slot, column)}
                        {item.type === 'floorrow' && <span className="ml-0.5 font-normal opacity-70">×{slot.capacity ?? 1}</span>}
                      </>
                    )
                    return (
                      <td key={slot.id} className="p-0">
                        {editing === slot.id
                          ? <input
                            autoFocus aria-label={t('Pladsens navn', 'Name of the place')} maxLength={NAME_MAX} defaultValue={slot.name}
                            className="h-6 w-20 rounded border border-primary bg-background px-1 text-[11px] font-semibold"
                            onBlur={event => commitName(slot, event.target.value)}
                            onKeyDown={event => {
                              if (event.key === 'Enter') event.currentTarget.blur()
                              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled.current = true; event.currentTarget.blur() }
                            }}
                          />
                          : <button
                            type="button" data-slot={slot.id} title={title} aria-label={title} aria-pressed={edit ? chosen.has(slot.id) : undefined}
                            className={cn(
                              'flex items-center justify-center whitespace-nowrap rounded px-1 font-semibold',
                              shown ? 'h-10 min-w-20 flex-col leading-tight' : 'h-6 min-w-9',
                              clickable ? 'cursor-pointer' : 'cursor-default',
                              chosen.has(slot.id) && 'ring-2 ring-primary ring-offset-1',
                              highlight === slot.id && 'outline-2 outline-offset-1 outline-amber-500',
                            )}
                            style={{ background: `${fill}33`, border: duplicate ? '2px solid #dc2626' : `1px ${dashed ? 'dashed' : 'solid'} ${fill}`, color: duplicate ? '#dc2626' : undefined }}
                            onClick={event => onClick(slot, event)}
                            onDoubleClick={() => onDoubleClick(slot)}
                          >
                            {shown
                              ? (
                                <>
                                  <span>{label}</span>
                                  {below && <span className="font-mono font-normal">{below}</span>}
                                </>
                              )
                              : label}
                          </button>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <td className="pr-1 text-right text-muted-foreground">{block.axis}</td>
                {block.cols.map((column, index) => (
                  <td key={index} className={cn('text-center text-muted-foreground', column.spacer && 'opacity-50')} title={column.spacer ? t('Tomt fag – tæller ikke', 'Empty bay – not counted') : undefined}>{column.label}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {edit && <p className="text-xs text-muted-foreground" data-testid="rack-front-counts">{countsText(item)}</p>}

      {asking != null && (
        <Dialog open onOpenChange={open => { if (!open) setAsking(null) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t(`Giv ${selected.length} pladser navne efter mønster`, `Name ${selected.length} places by a pattern`)}</DialogTitle>
              <DialogDescription>{t('Pladsholdere: {reol} {fag} {n} {niveau} {nr} {udtræk} {hylde}. Navnene regnes som rettet i hånden.', 'Placeholders: {reol} {fag} {n} {niveau} {nr} {udtraek} {hylde}. The names count as typed by hand.')}</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus aria-label={t('Mønster', 'Pattern')} value={asking} placeholder="{reol}{fag}.{n}"
              onChange={event => setAsking(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') applyPattern(asking) }}
            />
            {tooLong > 0 && <p className="text-xs font-medium text-destructive" data-testid="pattern-too-long">{t(`${tooLong} navne bliver længere end ${NAME_MAX} tegn og skæres af.`, `${tooLong} names are longer than ${NAME_MAX} characters and are cut.`)}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAsking(null)}>{t('Annullér', 'Cancel')}</Button>
              <Button disabled={!asking.trim()} onClick={() => applyPattern(asking)}>{t('Giv navne', 'Name them')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
