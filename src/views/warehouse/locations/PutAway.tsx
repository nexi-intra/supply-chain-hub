import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowsClockwise, FloppyDisk, Plus, Trash, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { contextOf, type MapContext } from '@/lib/warehouse/layout/map'
import { peekOf } from '@/lib/warehouse/layout/peek'
import { holdSerials, holdUntilSent, keepsPlaces, placedFor, placedSummary, putAwayPlaceChecks, sendLocationAction, serialOverlapNotes, serialsOnTheirWay, startLocationsRead, withoutPutAway, withPutAway, type PlacedFound } from '@/lib/warehouse/locationActions'
import { locationKeyOf, newActionId, reasonLabel, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationList, MapContents, PalletInput, SlotSuggestion, WarehouseLayout, CountingUser } from '@/types/warehouse'
import { PlacePeek } from './map/PlacePeek'

interface Draft {
  key: number
  document: string
  material: string
  description: string
  quantity: string
  serials: string[]
  location: string
  sloc: string
  date: string
  tags: string[]
  note: string
  slots: SlotSuggestion[]
  /** The material has been looked up: its description and place suggestions are known. */
  checked: boolean
  /** The suggestion last shown with "Vis"; null shows the chosen place. Any change of `location` or `material`, or a suggestion list without it, clears it. */
  shown: string | null
  /** What of this material of the looked-up 49/50 number is already put away; a new number or material clears it. */
  placed: PlacedFound | null
}

/** The published drawing and what stands on its places, read once for the whole form. */
interface PeekMap { layout: WarehouseLayout; ctx: MapContext }

let nextKey = 1
const today = () => new Date().toISOString().slice(0, 10)
const blank = (): Draft => ({ key: nextKey++, document: '', material: '', description: '', quantity: '', serials: [], location: '', sloc: 'D000', date: today(), tags: [], note: '', slots: [], checked: false, shown: null, placed: null })
// Typing waits this long before the place view follows, so it does not flicker on every key.
const TYPING_MS = 250
// Noon local time, so the day never shifts with the time zone.
const dateMs = (value: string) => new Date(`${value}T12:00:00`).getTime()

/** Put one or more pallets away after goods receipt: the 49/50 number fills in the rest, the Hub suggests a place. */
export function PutAway({ user, tags, drawing, version, onOpen, onDone }: {
  user: CountingUser; tags: string[]; drawing: LocationList['drawing']; version: number; onOpen: (target: LocationsTarget) => void; onDone: () => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>([blank()])
  const [layout, setLayout] = useState<WarehouseLayout | null | undefined>(undefined)
  // The places (always, for the check under each place field) and, with a drawing, what stands on them for the map.
  const [data, setData] = useState<{ list: LocationList; contents: MapContents | null } | null>(null)
  const [layoutFailed, setLayoutFailed] = useState(false)
  const [dataFailed, setDataFailed] = useState(false)
  const [layoutTry, setLayoutTry] = useState(0)
  // A new place or material clears the suggestion being looked at, and so does a suggestion list without it, so the view shows what will be saved.
  // What is already put away belongs to the looked-up number and material: a change of either clears it.
  const update = (key: number, patch: Partial<Draft>) => setDrafts(list => list.map(item => {
    if (item.key !== key) return item
    let next = { ...item, ...patch }
    const stale = 'location' in patch || next.material !== item.material
      || (next.shown !== null && !next.slots.some(slot => locationKeyOf(slot.location) === locationKeyOf(next.shown!)))
    if (stale && !('shown' in patch)) next = { ...next, shown: null }
    if ((next.document !== item.document || next.material !== item.material) && !('placed' in patch)) next = { ...next, placed: null }
    return next
  }))
  // The drafts as they are now, for "Gem alligevel" on a refusal that comes back later.
  const draftsNow = useRef(drafts)
  draftsNow.current = drafts
  const bridge = window.electronWarehouse!.locations

  // As on the map: the drawing is read when it changes, the places (and with a drawing what stands on them) when
  // Placeringer changes. A failed re-read keeps the last good data, so the view never vanishes mid-registration.
  const drawingVersion = drawing?.version ?? null
  const published = drawingVersion !== null
  useEffect(() => {
    if (!published) return
    let current = true
    window.electronWarehouse!.locations.layout()
      .then(result => { if (current) { setLayout(result.layout); setLayoutFailed(false) } })
      .catch(() => { if (current) setLayoutFailed(true) })
    return () => { current = false }
  }, [published, drawingVersion, layoutTry])

  // A failed read of the drawing is tried again on the next change, as long as there is no drawing to show.
  const layoutMissing = layout === undefined && layoutFailed
  useEffect(() => { if (layoutMissing) setLayoutTry(count => count + 1) }, [version]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bumps can come faster than M: answers: a newer read wins, but an older one still lands while nothing newer has.
  const dataRead = useRef({ started: 0, landed: 0 })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const reads = dataRead.current
    const seq = ++reads.started
    const api = window.electronWarehouse!.locations
    // A read during a put-away on its way to M: is older than the view, which already shows the pallets. The list is a
    // cached read on this PC (as in Flyt and the pallet card); the map's contents only when there is a map.
    const fresh = startLocationsRead()
    Promise.all([api.list(), published ? api.mapContents() : null])
      .then(([list, contents]) => { if (alive.current && seq > reads.landed) { reads.landed = seq; setData(value => (value && (!fresh() || keepsPlaces(value.list, list)) ? value : { list, contents })); setDataFailed(false) } })
      .catch(() => { if (alive.current && seq > reads.landed) setDataFailed(true) })
  }, [published, version])

  const map = useMemo<PeekMap | null>(() => (published && layout && data?.contents ? { layout, ctx: contextOf(data.list, data.contents, user.team) } : null), [published, layout, data, user.team])
  // The quiet failure line only while nothing could be loaded at all.
  const mapFailed = published && ((layout === undefined && layoutFailed) || (!data?.contents && dataFailed))

  // Each place is checked here as M: will (exists, active, a pallet place, room), with the pallets before it in the form
  // counted, so a wrong place is changed now instead of the whole put-away coming back 15-40 s later. Only a reserved,
  // deactivated or shelf place blocks Gem; "fuld" and "findes ikke" come from a list that may be old and only warn.
  const places = useMemo(() => (data ? Object.fromEntries(data.list.locations.map(location => [location.id, location])) : null), [data])
  const checks = useMemo(() => putAwayPlaceChecks(drafts.map(item => item.location), places), [drafts, places])
  const blocked = checks.some(check => check.blocked)
  // Serials also on an earlier pallet of the form: only a note (M: takes one delivery split over pallets).
  const sharedSerials = useMemo(() => serialOverlapNotes(drafts.map(item => item.serials), new Set()).map(note => note.earlier), [drafts])

  function showOnMap(placeId: string) {
    const typed = drafts.some(item => item.material.trim() || item.location.trim() || item.document.trim())
    if (typed && !window.confirm(t('Forlad uden at gemme?', 'Leave without saving?'))) return
    onOpen({ kind: 'map', id: placeId })
  }

  async function describe(key: number, material: string) {
    const code = material.trim().toUpperCase()
    if (!code) return
    try {
      const [card, suggestion] = await Promise.all([bridge.materialCard({ material: code }), bridge.suggest({ material: code })])
      update(key, { material: code, description: card.description, slots: suggestion.slots, checked: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function lookup(draft: Draft) {
    try {
      const found = await bridge.lookupDocument({ document: draft.document })
      if (!found.materials.length) { toast.warning(t('Materialedokumentet har ingen serienumre i SAP.', 'The material document has no serial numbers in SAP.')); return }
      // One pallet per material on the document, each with what of it is already put away.
      const [first, ...rest] = found.materials
      const extra = rest.map(item => ({ ...blank(), document: found.document, material: item.material, description: item.description, quantity: String(item.quantity), serials: item.serials, sloc: draft.sloc, date: draft.date, placed: placedFor(found.placed, item.material, item.serials) }))
      setDrafts(list => list.flatMap(item => (item.key === draft.key ? [{ ...item, shown: null, document: found.document, material: first.material, description: first.description, quantity: String(first.quantity), serials: first.serials, placed: placedFor(found.placed, first.material, first.serials) }, ...extra] : [item])))
      for (const item of [{ key: draft.key, material: first.material }, ...extra]) void describe(item.key, item.material)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const invalidDrafts = (ready: Draft[]) => {
    if (ready.length && ready.every(item => item.material && item.location)) return false
    toast.error(t('Hver palle skal have materiale og plads.', 'Every pallet needs a material and a place.'))
    return true
  }

  function save() {
    const ready = drafts.filter(item => item.material || item.location)
    if (invalidDrafts(ready) || blocked) return
    // The same delivery put away again is asked first, in one question: the 49/50 number or serials already put away,
    // and serials of this window's put-aways still on their way to M:. A yes to serials sends allowDuplicate; a partial
    // delivery (the same number with other serials) only warns, and M: still refuses a serial put away meanwhile on
    // another PC. Serials shared by pallets of this form (one delivery split over pallets) are fine on M: and not asked.
    const readyKeys = new Set(ready.map(item => item.key))
    const sending = serialOverlapNotes(drafts.map(item => (readyKeys.has(item.key) ? item.serials : [])), serialsOnTheirWay())
    const warned = drafts.map((item, index) => ({ item, index, placed: readyKeys.has(item.key) ? placedSummary(item.placed) : null, onTheirWay: sending[index].onTheirWay }))
      .filter(entry => entry.placed || entry.onTheirWay)
    let allowDuplicate = false
    if (warned.length) {
      const lines = warned.map(({ index, placed, onTheirWay }) => {
        const text = [placed, onTheirWay].filter(Boolean).join(' ')
        return drafts.length > 1 ? `${t(`Palle ${index + 1}`, `Pallet ${index + 1}`)}: ${text}` : text
      })
      if (!window.confirm(`${lines.join('\n')}\n\n${t('Gem alligevel?', 'Save anyway?')}`)) return
      allowDuplicate = warned.some(({ item, onTheirWay }) => Boolean(onTheirWay) || (item.placed?.serials ?? 0) > 0)
    }
    setDrafts([blank()])
    send(ready, allowDuplicate)
  }

  /** The pallets go to M: in the background; `allowDuplicate` puts them away even with a serial already on a pallet. */
  function send(ready: Draft[], allowDuplicate: boolean) {
    const pallets: PalletInput[] = ready.map(item => ({
      location: item.location, material: item.material, quantity: item.quantity.trim() === '' ? null : Number(item.quantity), document: item.document || null,
      serials: item.serials, sloc: item.sloc, receivedAt: dateMs(item.date), tags: item.tags, note: item.note,
    }))
    // The form is cleared and the result shown at once; M: gets the pallets in the background (15-40 s). A refusal (the
    // place is full or unknown) brings the pallets back into the form, in front of anything typed since.
    const kept = ready
    const placeOf = (name: string) => data?.list.locations.find(location => location.id === locationKeyOf(name))
    const pick = pallets.length === 1 && placeOf(pallets[0].location)?.purpose === 'pick'
    const where = locationKeyOf(pallets[0].location)
    // The places view counts the new pallets at once, so the next pallet sees the place as taken.
    setData(value => value && withPutAway(value, pallets))
    // Its serials count as put away for the next save until M: has answered; one only kept on this PC (M: down) holds
    // them until the Hub's outbox no longer has it (Locations reads the outbox every 15 s).
    const actionId = newActionId()
    const release = holdSerials(pallets.flatMap(item => item.serials || []))
    let onlyOnThisPc = false
    // A serial already on a pallet (put away on another PC meanwhile) is refused; "Gem alligevel" sends the pallets as
    // they stand in the form now, without the check.
    const again = () => {
      const keys = new Set(kept.map(item => item.key))
      const current = draftsNow.current.filter(item => keys.has(item.key))
      if (!current.length || invalidDrafts(current)) return
      setDrafts(list => { const rest = list.filter(item => !keys.has(item.key)); return rest.length ? rest : [blank()] })
      send(current, true)
    }
    void sendLocationAction(() => bridge.putAway({ actionId, label: t('Sæt på plads: ', 'Put away: ') + pallets.map(item => `${item.material} → ${item.location}`).join(', '), pallets, ...(allowDuplicate ? { allowDuplicate } : {}) }), {
      success: pallets.length > 1 ? t(`${pallets.length} paller er sat på plads`, `${pallets.length} pallets put away`)
        : pick ? t(`${where} er fyldt op`, `${where} has been refilled`)
        : t(`Pallen står nu på ${where}`, `The pallet is now on ${where}`),
      rollback: () => {
        setDrafts(list => [...kept, ...list.filter(item => item.material || item.location || item.document)])
        // Its places are free again, so the pallets back in the form are not checked against themselves.
        setData(value => value && withoutPutAway(value, pallets))
      },
      offer: error => (!allowDuplicate && errorCode(error) === 'SERIAL_ON_PALLET' ? { label: t('Gem alligevel', 'Save anyway'), onClick: again } : null),
      deferred: result => { if ('queued' in result) { onlyOnThisPc = true; holdUntilSent(actionId, release) } },
      settled: () => { if (!onlyOnThisPc) release(); onDone() },
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('Sæt palle på plads', 'Put a pallet away')}</h1>
        <p className="text-sm text-muted-foreground">{t('Scan 49/50-nummeret, så henter Hubben materiale, antal og serienumre fra SAP. Uden SAP: skriv materiale og antal.', 'Scan the 49/50 number and the Hub fetches material, quantity and serial numbers from SAP. Without SAP: type material and quantity.')}</p>
      </div>
      {drafts.map((draft, index) => (
        <DraftCard key={draft.key} draft={draft} index={index} tags={tags} canRemove={drafts.length > 1} map={map} mapFailed={mapFailed} check={checks[index]} shared={sharedSerials[index]} onShowOnMap={showOnMap}
          onChange={patch => update(draft.key, patch)} onLookup={() => lookup(draft)} onDescribe={material => void describe(draft.key, material)}
          onRemove={() => setDrafts(list => list.filter(item => item.key !== draft.key))} />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setDrafts(list => [...list, { ...blank(), sloc: list[list.length - 1]?.sloc || 'D000', date: list[list.length - 1]?.date || today() }])}><Plus size={16} /> {t('Tilføj næste palle', 'Add next pallet')}</Button>
        <Button className="ml-auto" disabled={blocked} onClick={() => save()}><FloppyDisk size={16} /> {drafts.length > 1 ? t('Gem alle', 'Save all') : t('Gem', 'Save')}</Button>
      </div>
    </div>
  )
}

function DraftCard({ draft, index, tags, canRemove, map, mapFailed, check, shared, onShowOnMap, onChange, onLookup, onDescribe, onRemove }: {
  draft: Draft; index: number; tags: string[]; canRemove: boolean; map: PeekMap | null; mapFailed: boolean; check: { note: string | null; blocked: boolean }; shared: string | null; onShowOnMap: (placeId: string) => void
  onChange: (patch: Partial<Draft>) => void; onLookup: () => Promise<void>; onDescribe: (material: string) => void; onRemove: () => void
}) {
  const id = (name: string) => `putaway-${draft.key}-${name}`
  const placed = placedSummary(draft.placed)
  // The place the view follows: a typed place after a short pause, a chosen suggestion at once.
  const [settled, setSettled] = useState(draft.location)
  useEffect(() => {
    if (draft.location === settled) return
    const timer = window.setTimeout(() => setSettled(draft.location), TYPING_MS)
    return () => window.clearTimeout(timer)
  }, [draft.location, settled])
  const choose = (location: string) => { onChange({ location }); setSettled(location) }

  // While a typed place is pending nothing is claimed: the old view only keeps its room, hidden.
  const pending = draft.shown === null && settled !== draft.location
  const looked = draft.shown ?? settled
  const peek = useMemo(() => (map && looked.trim() ? peekOf(map.layout, looked, map.ctx) : null), [map, looked])
  const chosen = !!peek && peek.placeId === locationKeyOf(draft.location)
  // "Vis" only for suggestions that are on the drawing.
  const onMap = useMemo(() => new Set(map ? draft.slots.filter(slot => peekOf(map.layout, slot.location, map.ctx)).map(slot => slot.location) : []), [map, draft.slots])
  const showSlot = (location: string) => {
    // A second press on the pressed "Vis" goes back to the chosen place.
    const again = draft.shown !== null && locationKeyOf(draft.shown) === locationKeyOf(location)
    if (again || locationKeyOf(location) === locationKeyOf(draft.location)) { if (draft.shown !== null) onChange({ shown: null }); return }
    onChange({ shown: location })
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t(`Palle ${index + 1}`, `Pallet ${index + 1}`)}</Badge>
          {canRemove && <Button variant="ghost" size="sm" className="ml-auto" onClick={onRemove} aria-label={t('Fjern pallen', 'Remove the pallet')}><Trash size={16} /></Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor={id('document')}>{t('49/50-nummer (materialedokument)', '49/50 number (material document)')}</Label>
            <Input id={id('document')} value={draft.document} placeholder={t('Scan eller skriv, fx 5000032337 eller 5000032337 2026 0001', 'Scan or type, e.g. 5000032337 or 5000032337 2026 0001')} onChange={event => onChange({ document: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && draft.document.trim()) void onLookup() }} />
          </div>
          <SapActionButton variant="outline" className="self-end" disabled={!draft.document.trim()} onAction={onLookup}><ArrowsClockwise size={16} /> {t('Hent fra SAP', 'Fetch from SAP')}</SapActionButton>
        </div>
        {placed && <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"><Warning size={14} className="mt-px shrink-0" /> {placed}</p>}
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={id('material')}>{t('Materiale', 'Material')}</Label>
            <Input id={id('material')} value={draft.material} className="font-mono" onChange={event => onChange({ material: event.target.value.toUpperCase(), description: '', checked: false })} onBlur={event => onDescribe(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') onDescribe(draft.material) }} />
            {draft.description && <p className="truncate text-xs text-muted-foreground">{draft.description}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('quantity')}>{t('Antal', 'Quantity')}</Label>
            <Input id={id('quantity')} inputMode="numeric" value={draft.quantity} onChange={event => onChange({ quantity: event.target.value.replace(/\D/g, '') })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('sloc')}>Storage location</Label>
            <Input id={id('sloc')} value={draft.sloc} className="font-mono" maxLength={4} onChange={event => onChange({ sloc: event.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('date')}>{t('Dato', 'Date')}</Label>
            <Input id={id('date')} type="date" value={draft.date} onChange={event => onChange({ date: event.target.value || today() })} />
          </div>
        </div>
        {draft.serials.length > 0 && <p className="text-xs text-muted-foreground">{t(`${draft.serials.length} serienumre fra SAP`, `${draft.serials.length} serial numbers from SAP`)}</p>}
        {shared && <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"><Warning size={14} className="mt-px shrink-0" /> {shared}</p>}

        <div className="space-y-1.5">
          <Label htmlFor={id('location')}>{t('Plads', 'Place')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input id={id('location')} value={draft.location} className="w-36 font-mono" placeholder="A2.4" onChange={event => onChange({ location: event.target.value.toUpperCase() })} />
            {draft.slots.map(slot => {
              const isShown = !pending && !!peek && peek.placeId === locationKeyOf(slot.location)
              return (
                <span key={slot.location} className="inline-flex items-center gap-1">
                  <button type="button" onClick={() => choose(slot.location)}
                    className={cn('rounded-md border px-2.5 py-1 text-left text-xs transition', draft.location === slot.location ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary')}>
                    <span className="font-mono font-semibold">{slot.location}</span> <span className="opacity-75">{reasonLabel(slot.reason)}</span>
                  </button>
                  {onMap.has(slot.location) && (
                    <button type="button" aria-pressed={isShown} aria-label={t(`Vis ${slot.location}`, `Show ${slot.location}`)} onClick={() => showSlot(slot.location)}
                      className={cn('rounded-md border px-1.5 py-1 text-xs transition', isShown ? 'border-primary bg-primary/10 text-foreground' : 'text-primary hover:bg-secondary')}>
                      {t('Vis', 'Show')}
                    </button>
                  )}
                </span>
              )
            })}
            {draft.checked && !draft.slots.length && <span className="text-xs text-muted-foreground">{t('Ingen ledige pladser at foreslå', 'No free places to suggest')}</span>}
          </div>
          {check.note && settled === draft.location && <p className={cn('flex items-center gap-1.5 text-xs', check.blocked ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}><Warning size={14} className="shrink-0" /> {check.note}</p>}
          {mapFailed && draft.location.trim() && <p className="text-xs text-muted-foreground">{t('Kortet kunne ikke hentes', 'The map could not be loaded')}</p>}
          {map && looked.trim() && (
            <div className={cn(pending && 'invisible')} aria-hidden={pending || undefined}>
              {peek
                ? <PlacePeek peek={peek} ctx={map.ctx} layout={map.layout} chosen={chosen} onChoose={() => choose(looked)} onShowOnMap={() => onShowOnMap(peek.placeId)} />
                : <p className="text-xs text-muted-foreground">{t('Pladsen er ikke på kortet', 'The place is not on the map')}</p>}
            </div>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Mærkater', 'Labels')}>
            {tags.map(tag => {
              const on = draft.tags.includes(tag)
              return (
                <button key={tag} type="button" aria-pressed={on} onClick={() => onChange({ tags: on ? draft.tags.filter(item => item !== tag) : [...draft.tags, tag] })}
                  className={cn('rounded-full border px-2.5 py-0.5 text-xs transition', on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {tag}
                </button>
              )
            })}
          </div>
        )}
        <Input value={draft.note} maxLength={500} placeholder={t('Note (valgfri)', 'Note (optional)')} onChange={event => onChange({ note: event.target.value })} aria-label={t('Note', 'Note')} />
      </CardContent>
    </Card>
  )
}
