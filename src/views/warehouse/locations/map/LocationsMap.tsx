import { useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, Minus, Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/warehouse/errors'
import { cellText, contentTitle, contextOf, findSlot, placeOfSlot, searchMap, slotStatus, type MapHitPlace } from '@/lib/warehouse/layout/map'
import type { LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LayoutItem, LayoutItemType, LocationList, MapContents, WarehouseLayout, WarehouseUser } from '@/types/warehouse'
import { LayoutCanvas, type CanvasPointer, type FloorView } from '../layout/LayoutCanvas'
import { RackFront, STATUS_FILL, type SlotStatus } from '../layout/RackFront'
import { MapHits } from './MapHits'

const ZOOMS = [1, 1.5, 2, 3]
// Items with several places show their front below the map; a floor area or a special place opens its place card.
const FRONTED: LayoutItemType[] = ['rack', 'floorrow', 'shelfrack']
const SINGLE: LayoutItemType[] = ['floor', 'special']

function legend(): { status: SlotStatus; label: string }[] {
  return [
    { status: 'empty', label: t('tom', 'empty') },
    { status: 'used', label: t('optaget', 'used') },
    { status: 'pick', label: t('pluk', 'pick') },
    { status: 'reserved', label: t('reserveret', 'reserved') },
    { status: 'other-team', label: t('andet team (fx TRR)', 'other team (e.g. TRR)') },
    { status: 'none', label: t('ingen plads', 'no place') },
  ]
}

function titleOf(item: LayoutItem): string {
  if (item.type === 'floorrow') return t(`Række ${item.name}`, `Row ${item.name}`)
  return t(`Reol ${item.name}`, `Rack ${item.name}`)
}

/** "Kort over lageret": the published drawing for everyone in the hub – find a place or a material, see what stands on each place. Read only. */
export function LocationsMap({ user, focus, drawing, version, onOpen }: { user: WarehouseUser; focus?: string; drawing: LocationList['drawing']; version: number; onOpen: (target: LocationsTarget) => void }) {
  const [layout, setLayout] = useState<WarehouseLayout | null | undefined>(undefined)
  const [data, setData] = useState<{ list: LocationList; contents: MapContents } | null>(null)
  const [layoutFailed, setLayoutFailed] = useState<string | null>(null)
  const [dataFailed, setDataFailed] = useState<string | null>(null)
  const [layoutTry, setLayoutTry] = useState(0)
  const [query, setQuery] = useState('')
  const [floorView, setFloorView] = useState<FloorView>('all')
  const [zoom, setZoom] = useState(1)
  const [chosen, setChosen] = useState<{ itemId: string; slotId?: string; scroll?: boolean } | null>(null)
  const pressed = useRef<string | undefined>(undefined)
  const pendingFocus = useRef(focus)
  const front = useRef<HTMLDivElement>(null)

  const drawingVersion = drawing?.version ?? null
  useEffect(() => {
    let current = true
    window.electronWarehouse!.locations.layout()
      .then(result => { if (current) { setLayout(result.layout); setLayoutFailed(null) } })
      .catch(error => { if (current) { setLayoutFailed(errorMessage(error)); toast.error(errorMessage(error)) } })
    return () => { current = false }
  }, [drawingVersion, layoutTry])

  // A failed read of the drawing is tried again on the next change, as long as there is no drawing to show.
  const layoutMissing = layout === undefined && !!layoutFailed
  useEffect(() => { if (layoutMissing) setLayoutTry(count => count + 1) }, [version]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let current = true
    const bridge = window.electronWarehouse!.locations
    Promise.all([bridge.list(), bridge.mapContents()])
      .then(([list, contents]) => { if (current) { setData({ list, contents }); setDataFailed(null) } })
      .catch(error => { if (current) { setDataFailed(errorMessage(error)); toast.error(errorMessage(error)) } })
    return () => { current = false }
  }, [version])

  const ctx = useMemo(() => (data ? contextOf(data.list, data.contents, user.team) : null), [data, user.team])
  const search = useMemo(() => (layout && ctx ? searchMap(query, layout, ctx) : null), [query, layout, ctx])

  // "Vis på kort" lands on its place once the map is read.
  useEffect(() => {
    if (!layout || !ctx || !pendingFocus.current) return
    const found = findSlot(layout, pendingFocus.current, ctx)
    pendingFocus.current = undefined
    if (found) setChosen({ ...found, scroll: true })
  }, [layout, ctx])

  const searchFocus = search?.focus ? `${search.focus.itemId}\n${search.focus.slotId}` : ''
  useEffect(() => {
    if (!searchFocus) return
    const [itemId, slotId] = searchFocus.split('\n')
    // Typing or scanning keeps the field and the hit list in view: the map highlights, but nothing scrolls.
    setChosen({ itemId, slotId })
  }, [searchFocus])

  useEffect(() => { if (chosen?.scroll) front.current?.scrollIntoView({ block: 'nearest' }) }, [chosen])

  const failed = (layout === undefined && layoutFailed) || (!data && dataFailed)
  if (failed) return <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">{failed}</p>
  if (layout === null) return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t('Tegningen er ikke udgivet endnu', 'The drawing has not been published yet')}</p>
  if (!layout || !ctx || !search) return <Skeleton className="h-96 rounded-xl" />

  const item = chosen ? layout.items.find(entry => entry.id === chosen.itemId) : undefined
  const shown = item && FRONTED.includes(item.type) && item.slots.length ? item : undefined

  function onPointer(event: CanvasPointer) {
    // The canvas captures the pointer on 'down', so 'up' may not name the item: the pressed one counts.
    if (event.kind === 'down') { pressed.current = event.itemId; return }
    if (event.kind !== 'up') return
    const itemId = event.itemId ?? pressed.current
    pressed.current = undefined
    const target = itemId ? layout!.items.find(entry => entry.id === itemId) : undefined
    if (!target) return
    if (FRONTED.includes(target.type) && target.slots.length) { setChosen({ itemId: target.id, scroll: true }); return }
    if (!SINGLE.includes(target.type)) return
    const id = target.slots.map(slot => placeOfSlot(target, slot, ctx!)).find(Boolean)
    if (id) onOpen({ kind: 'location', id })
  }

  function onHit(place: MapHitPlace) {
    goTo(place.id, place.itemId, place.slotId)
  }

  // A floor area, a special place or a place off the drawing opens its place card; a slot in a rack comes into view.
  function goTo(placeId: string, itemId: string | null, slotId: string | null) {
    if (itemId === null || slotId === null) { onOpen({ kind: 'location', id: placeId }); return }
    const target = layout!.items.find(entry => entry.id === itemId)
    if (target && SINGLE.includes(target.type)) { onOpen({ kind: 'location', id: placeId }); return }
    setChosen({ itemId, slotId, scroll: true })
  }

  const status: Record<string, SlotStatus> = {}
  const content: Record<string, { text: string; title: string }> = {}
  let places = 0
  let used = 0
  for (const slot of shown?.slots ?? []) {
    status[slot.id] = slotStatus(shown!, slot, ctx)
    const id = placeOfSlot(shown!, slot, ctx)
    if (!id) continue
    places += 1
    if (status[slot.id] === 'used') used += 1
    const entry = ctx.contents.places[id]
    content[slot.id] = { text: cellText(entry), title: contentTitle(ctx.places.get(id)?.name ?? slot.name, entry) }
  }

  const highlight = [...search.items, ...(item ? [item.id] : [])]
  const zoomAt = ZOOMS.indexOf(zoom)
  const floors: [FloorView, string][] = [['all', t('Alle', 'All')], ['ground', t('Gulv', 'Ground')], ['mezz', t('Ovenpå', 'Upstairs')]]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              // Enter (a scanner ends with it) shows the found place, and selects the text so the next scan replaces it.
              event.currentTarget.select()
              if (search.focus) goTo(search.focus.placeId, search.focus.itemId, search.focus.slotId)
            }}
            placeholder={t('Søg eller scan: plads eller materiale', 'Search or scan: place or material')}
            aria-label={t('Søg på kortet', 'Search the map')}
            className="h-10 pl-9"
          />
        </div>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t('Vis etage', 'Show floor')}>
          {floors.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={floorView === value} onClick={() => setFloorView(value)}
              className={cn('rounded px-2.5 py-1 text-sm', floorView === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{label}</button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label={t('Zoom ud', 'Zoom out')} disabled={zoomAt <= 0} onClick={() => setZoom(ZOOMS[zoomAt - 1])}><Minus size={16} /></Button>
          <span className="w-12 text-center text-xs text-muted-foreground">{zoom * 100} %</span>
          <Button size="icon" variant="outline" aria-label={t('Zoom ind', 'Zoom in')} disabled={zoomAt >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zoomAt + 1])}><Plus size={16} /></Button>
        </div>
      </div>

      {query.trim().length >= 2 && <MapHits hits={search.hits} contents={ctx.contents} onPlace={onHit} />}

      <div className="max-h-[70vh] overflow-auto rounded-lg border bg-card">
        <LayoutCanvas layout={layout} highlight={highlight} floorView={floorView} zoom={zoom} readOnly team={user.team} cursor="pointer" onPointer={onPointer} />
      </div>

      {shown && (
        <div ref={front} data-testid="map-front" className="space-y-2 rounded-lg border bg-card p-3">
          <h2 className="font-semibold">
            {titleOf(shown)}{' '}
            <span className="font-normal text-muted-foreground">{places === 1 ? t(`· 1 plads · ${used} optaget`, `· 1 place · ${used} used`) : t(`· ${places} pladser · ${used} optaget`, `· ${places} places · ${used} used`)}</span>
          </h2>
          <RackFront
            item={shown}
            mode="view"
            status={status}
            content={content}
            highlight={chosen?.itemId === shown.id ? chosen.slotId : undefined}
            onSlot={slotId => {
              const slot = shown.slots.find(entry => entry.id === slotId)
              const id = slot ? placeOfSlot(shown, slot, ctx) : null
              if (id) onOpen({ kind: 'location', id })
            }}
          />
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {legend().map(({ status: key, label }) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm" style={{ background: STATUS_FILL[key] }} />{label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
