import { useEffect, useMemo, useState } from 'react'
import { FileArrowDown, MapTrifold, PencilSimple, Plus, Prohibit, Rows, Stack, Tag, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { NativeSelect, Textarea } from '@/components/warehouse/ui'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/warehouse/errors'
import { drawnPurposeOf } from '@/lib/warehouse/layout/slots'
import { isPlaceHidden, sendLocationAction, startLocationsRead, type LocationActionOptions } from '@/lib/warehouse/locationActions'
import { isShelfPlace, linkedChanges, linkedPurposes, locationKeyOf, palletLimitOf, PURPOSES, purposeLabel, storedCapacityOf, TYPES, typeLabel, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { DeleteResult, LayoutOwner, LocationInput, LocationList, LocationPurpose, LocationType, RackCard as RackCardData, CountingUser } from '@/types/warehouse'

type Listed = LocationList['locations'][number]
type Dialogs = { kind: 'create' } | { kind: 'edit'; location: Listed } | { kind: 'series' } | { kind: 'tags' } | { kind: 'rack' } | { kind: 'delete' } | { kind: 'deleted'; result: DeleteResult } | null
const SERIES_MAX = 500
/** The type decides how many pallets fit; only Bord, Swap and the old Reol type have a capacity number. */
const hasCapacity = (type: LocationType) => type !== 'Palle' && type !== 'Gulv' && type !== 'Hylde'
const SHELF_NAME = /^(.+?)\s+H(\d{1,2})$/i
const isEmpty = (location: Listed) => location.used === 0 && location.stockCount === 0
/** "3/1", "7" on a floor, "2 mat." on a shelf. */
const usedText = (location: Listed) => (isShelfPlace(location) ? t(`${location.stockCount} mat.`, `${location.stockCount} mat.`) : Number.isFinite(palletLimitOf(location)) ? `${location.used}/${palletLimitOf(location)}` : String(location.used))
/** The backend's list order. */
const sortedByName = (locations: Listed[]) => [...locations].sort((a, b) => a.name.localeCompare(b.name, 'da', { numeric: true }))
/** Why the backend keeps a place it is asked to delete (as deleteLocations decides), or null when it is deleted. */
function keptReason(location: Listed, linked: Set<string>): string | null {
  if (linked.has(location.id)) return t(`${location.name} er på tegningen – fjern den på tegningen`, `${location.name} is on the drawing – remove it on the drawing`)
  if (location.used) return t(`Der står ${location.used === 1 ? '1 palle' : `${location.used} paller`} på ${location.name}`, `There ${location.used === 1 ? 'is 1 pallet' : `are ${location.used} pallets`} on ${location.name}`)
  if (location.stockCount) return t(`Der står ${location.stockCount === 1 ? '1 materiale' : `${location.stockCount} materialer`} på ${location.name}`, `There ${location.stockCount === 1 ? 'is 1 material' : `are ${location.stockCount} materials`} on ${location.name}`)
  return null
}
const areaOfName = (name: string) => /^[A-Za-zÆØÅæøå]+/.exec(name.trim())?.[0].toUpperCase() ?? ''
/** The place as the backend's locationFrom stores it, shown in the list before M: has it; `previous` keeps what is not changed. */
function placeFrom(input: Partial<LocationInput>, previous: Listed | null): Listed {
  const name = String(input.name ?? previous?.name ?? '').trim().replace(/\s+/g, ' ')
  const type = input.type ?? previous?.type ?? 'Palle'
  const capacity = type === 'Palle' ? (previous?.type === 'Palle' ? previous.capacity || 1 : 1) : type === 'Gulv' ? 0 : input.capacity ?? (previous?.capacity || 1)
  const shelf = type === 'Hylde' ? SHELF_NAME.exec(name) : null
  return {
    id: locationKeyOf(name), name, area: String(input.area ?? previous?.area ?? areaOfName(name)).trim().toUpperCase() || areaOfName(name), type, purpose: input.purpose ?? previous?.purpose ?? 'reserve', capacity,
    fixedMaterials: input.fixedMaterials ?? previous?.fixedMaterials ?? [], ...(shelf ? { rack: shelf[1].toUpperCase(), shelf: Number(shelf[2]) } : {}),
    active: previous?.active ?? true, note: String(input.note ?? previous?.note ?? '').trim().slice(0, 500), updatedAt: Date.now(), updatedBy: { email: '', name: '' },
    used: previous?.used ?? 0, stockCount: previous?.stockCount ?? 0,
  }
}
/** A dialog's places sent to M: in the background: shown at once in place of `replaced`. */
type SendRows = (rows: Listed[], replaced: Listed[], write: () => Promise<unknown>, success: string) => void

/** Maintain the hub's places: list per area, type and "only empty"; create one, a series or a rack; edit; select many to delete or deactivate; labels. */
// Every change shows in the list at once and is written to M: in the background (15-40 s); a refusal puts the list back.
export function Admin({ user, version, onOpen, onChanged, onTags }: { user: CountingUser; version: number; onOpen: (target: LocationsTarget) => void; onChanged: () => void; onTags: (tags: string[]) => void }) {
  const [list, setList] = useState<LocationList | null>(null)
  const [area, setArea] = useState('')
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [type, setType] = useState<LocationType | ''>('')
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<Dialogs>(null)
  const bridge = window.electronWarehouse!.locations

  useEffect(() => {
    let current = true
    // A re-read during this PC's own change on its way to M: is older than the list, which already shows the change.
    const fresh = startLocationsRead()
    bridge.list().then(result => {
      if (!current) return
      const next = { ...result, locations: result.locations.filter(location => !isPlaceHidden(location.id)) }
      setList(value => (value && !fresh() ? value : next))
    }).catch(error => toast.error(errorMessage(error)))
    return () => { current = false }
  }, [bridge, version])

  const areas = useMemo(() => [...new Set((list?.locations || []).map(location => location.area))].sort((a, b) => a.localeCompare(b, 'da')), [list])
  const shown = useMemo(() => {
    const query = filter.trim().toUpperCase()
    return (list?.locations || []).filter(location => (!area || location.area === area) && (!type || location.type === type) && (!onlyEmpty || isEmpty(location)) && (showInactive || location.active) && (!query || location.id.includes(query) || location.fixedMaterials.some(material => material.includes(query))))
  }, [list, area, type, onlyEmpty, filter, showInactive])
  // Only places that still exist stay selected.
  const chosen = useMemo(() => (list?.locations || []).filter(location => selected.has(location.id)), [list, selected])
  const linked = useMemo(() => new Set(list?.drawing?.linked || []), [list])
  const drawn = Boolean(list?.drawing)

  if (!list) return <Skeleton className="h-96 rounded-xl" />
  if (!list.canAdmin) return <p className="text-sm text-muted-foreground">{t('Kun managere og admins kan vedligeholde placeringer.', 'Only managers and admins can maintain locations.')}</p>

  const patchList = (change: (locations: Listed[]) => Listed[]) => setList(value => value && { ...value, locations: change(value.locations) })
  const withActive = (ids: Set<string>, active: boolean) => patchList(locations => locations.map(location => (ids.has(location.id) ? { ...location, active } : location)))
  /** Rows put back (a refused delete) or added (a create), in the backend's name order. */
  const putBack = (rows: Listed[]) => patchList(locations => sortedByName([...locations.filter(location => !rows.some(row => row.id === location.id)), ...rows]))
  const removeRows = (ids: Set<string>) => patchList(locations => locations.filter(location => !ids.has(location.id)))

  function setActive(location: Listed, active: boolean) {
    const ids = new Set([location.id])
    withActive(ids, active)
    if (active) toast.success(t(`${location.name} er aktiv igen`, `${location.name} is active again`))
    else if (location.used > 0) toast.success(t(`${location.name} er deaktiveret`, `${location.name} is deactivated`), { description: t('Pallerne bliver stående, men tælles ikke med i FIFO, mens pladsen er deaktiveret.', 'The pallets stay, but are left out of FIFO while the place is deactivated.') })
    else toast.success(t(`${location.name} er deaktiveret`, `${location.name} is deactivated`))
    void sendLocationAction(() => bridge.setActive({ location: location.id, active }), { rollback: () => withActive(ids, location.active), settled: onChanged })
  }

  const toggle = (id: string) => setSelected(value => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next })

  // Only empty places that are not on the drawing are deleted (as the backend decides); the rest stay, with the reason.
  function deleteChosen() {
    const kept = chosen.flatMap(location => { const reason = keptReason(location, linked); return reason ? [{ name: location.name, reason }] : [] })
    const doomed = chosen.filter(location => !keptReason(location, linked))
    setSelected(new Set())
    setDialog(kept.length ? { kind: 'deleted', result: { deleted: doomed.map(location => location.name), kept } } : null)
    if (!doomed.length) return
    const ids = new Set(doomed.map(location => location.id))
    removeRows(ids)
    void sendLocationAction(() => bridge.deleteLocations({ locations: [...ids] }), {
      success: t(`${doomed.length} placeringer slettet`, `${doomed.length} locations deleted`),
      confirmed: result => { if (result.kept.length) toast.error(t(`${result.kept.length} placeringer blev ikke slettet`, `${result.kept.length} locations were not deleted`), { description: result.kept.map(item => item.reason).join('\n') }) },
      rollback: () => putBack(doomed),
      hides: [...ids],
      settled: onChanged,
    })
  }

  function deactivateChosen() {
    const changed = chosen.filter(location => location.active)
    setSelected(new Set())
    toast.success(t(`${changed.length} placeringer deaktiveret`, `${changed.length} locations deactivated`))
    if (!changed.length) return
    const ids = new Set(changed.map(location => location.id))
    withActive(ids, false)
    void sendLocationAction(() => bridge.setActiveMany({ locations: [...ids], active: false }), { rollback: () => withActive(ids, true), settled: onChanged })
  }

  /** A dialog's places shown at once (`rows`, replacing `replaced`); a refusal takes them out and puts `replaced` back. */
  function sendRows(rows: Listed[], replaced: Listed[], write: () => Promise<unknown>, success: string, extra: Partial<LocationActionOptions<unknown>> = {}) {
    setDialog(null)
    const gone = new Set(replaced.map(location => location.id))
    patchList(locations => sortedByName([...locations.filter(location => !gone.has(location.id) && !rows.some(row => row.id === location.id)), ...rows]))
    void sendLocationAction(write, {
      success,
      rollback: () => {
        const added = new Set(rows.map(row => row.id))
        patchList(locations => sortedByName([...locations.filter(location => !added.has(location.id)), ...replaced]))
      },
      settled: onChanged,
      ...extra,
    })
  }

  function saveTags(tags: string[]) {
    const before = list?.tags ?? []
    setDialog(null)
    // Unchanged: nothing to write on M:.
    if (JSON.stringify(tags) === JSON.stringify(before)) return
    setList(value => value && { ...value, tags })
    onTags(tags)
    void sendLocationAction(() => bridge.setTags({ tags }), {
      success: t('Mærkaterne er gemt', 'The labels are saved'),
      rollback: () => { setList(value => value && { ...value, tags: before }); onTags(before) },
      settled: onChanged,
    })
  }

  // Names already in the list: creating one again is refused by the backend, so it is said in the dialog.
  const taken = (id: string) => Boolean(list?.locations.some(location => location.id === id))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">{t('Administrér placeringer', 'Manage locations')}</h1>
          <p className="text-sm text-muted-foreground">{t(`${list.locations.length} placeringer i ${user.team}. Alt kan rettes bagefter.`, `${list.locations.length} locations in ${user.team}. Everything can be corrected afterwards.`)}</p>
          {drawn && <p className="text-sm font-medium">{t('Pladser oprettes og ændres nu på tegningen', 'Locations are now created and changed on the drawing')}</p>}
        </div>
        {!drawn && <Button onClick={() => setDialog({ kind: 'create' })}><Plus size={16} /> {t('Opret placering', 'Create location')}</Button>}
        {!drawn && <Button variant="outline" onClick={() => setDialog({ kind: 'series' })}><Rows size={16} /> {t('Opret serie', 'Create series')}</Button>}
        {!drawn && <Button variant="outline" onClick={() => setDialog({ kind: 'rack' })}><Stack size={16} /> {t('Opret reol', 'Create rack')}</Button>}
        <Button variant="outline" onClick={() => setDialog({ kind: 'tags' })}><Tag size={16} /> {t('Mærkater', 'Labels')}</Button>
        <Button variant={drawn ? 'default' : 'outline'} onClick={() => onOpen({ kind: 'layout' })}><MapTrifold size={16} /> {t('Tegning af lageret', 'Drawing of the warehouse')}</Button>
        {!drawn && user.team === 'TCD' && !list.live && <Button variant="outline" onClick={() => onOpen({ kind: 'import' })}><FileArrowDown size={16} /> {t('Importér placeringsarket', 'Import the placement sheet')}</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={area} onChange={event => setArea(event.target.value)} aria-label={t('Område', 'Area')}>
          <option value="">{t('Alle områder', 'All areas')}</option>
          {areas.map(item => <option key={item} value={item}>{item}</option>)}
        </NativeSelect>
        <NativeSelect value={type} onChange={event => setType(event.target.value as LocationType | '')} aria-label="Type">
          <option value="">{t('Alle typer', 'All types')}</option>
          {TYPES.map(item => <option key={item} value={item}>{typeLabel(item)}</option>)}
        </NativeSelect>
        <Input value={filter} onChange={event => setFilter(event.target.value)} placeholder={t('Filtrér på navn eller materiale', 'Filter by name or material')} className="w-64" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyEmpty} onChange={event => setOnlyEmpty(event.target.checked)} /> {t('Kun tomme', 'Only empty')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} /> {t('Vis deaktiverede', 'Show deactivated')}</label>
        <span className="ml-auto text-xs text-muted-foreground">{t(`${shown.length} vist`, `${shown.length} shown`)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!shown.length} onClick={() => setSelected(new Set(shown.slice(0, SERIES_MAX).map(location => location.id)))}>{t('Vælg alle i søgningen', 'Select all in the search')}</Button>
        {chosen.length > 0 && (
          <>
            <span className="text-sm">{t(`${chosen.length} valgt`, `${chosen.length} selected`)}</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('Fravælg', 'Clear')}</Button>
            <Button size="sm" variant="outline" onClick={() => deactivateChosen()}><Prohibit size={14} /> {t('Deaktivér valgte', 'Deactivate selected')}</Button>
            <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: 'delete' })}><Trash size={14} /> {t('Slet valgte', 'Delete selected')}</Button>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2"><span className="sr-only">{t('Valgt', 'Selected')}</span></th>
              <th className="px-3 py-2">{t('Navn', 'Name')}</th>
              <th className="px-3 py-2">{t('Område', 'Area')}</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">{t('Formål', 'Purpose')}</th>
              <th className="px-3 py-2 text-right">{t('Optaget', 'Used')}</th>
              <th className="px-3 py-2">{t('Faste materialer', 'Fixed materials')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.slice(0, 1000).map(location => (
              <tr key={location.id} className={cn(!location.active && 'opacity-60', selected.has(location.id) && 'bg-primary/5')}>
                <td className="px-3 py-1.5"><input type="checkbox" checked={selected.has(location.id)} onChange={() => toggle(location.id)} aria-label={t(`Vælg ${location.name}`, `Select ${location.name}`)} /></td>
                <td className="px-3 py-1.5">
                  <button type="button" className="font-mono font-semibold hover:underline" onClick={() => onOpen({ kind: 'location', id: location.id })}>{location.name}</button>
                  {location.purpose === 'pick' && !location.fixedMaterials.length && <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-700 dark:text-amber-400">{t('mangler materiale', 'missing material')}</Badge>}
                  {drawn && !linked.has(location.id) && <Badge variant="outline" className="ml-2 text-muted-foreground">{t('ikke på kortet', 'not on the map')}</Badge>}
                </td>
                <td className="px-3 py-1.5 font-mono">{location.area}</td>
                <td className="px-3 py-1.5">{typeLabel(location.type)}</td>
                <td className="px-3 py-1.5">{purposeLabel(location.purpose)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{usedText(location)}</td>
                <td className="max-w-64 truncate px-3 py-1.5 font-mono text-xs">{location.fixedMaterials.join(', ')}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'edit', location })} aria-label={t(`Ret ${location.name}`, `Edit ${location.name}`)}><PencilSimple size={14} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setActive(location, !location.active)}>{location.active ? t('Deaktivér', 'Deactivate') : t('Aktivér', 'Activate')}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && <LocationDialog location={dialog.kind === 'edit' ? dialog.location : null} linked={dialog.kind === 'edit' && linked.has(dialog.location.id)} team={user.team} taken={taken} onClose={() => setDialog(null)} onSend={sendRows} />}
      {dialog?.kind === 'series' && <SeriesDialog taken={taken} onClose={() => setDialog(null)} onSend={sendRows} />}
      {dialog?.kind === 'tags' && <TagsDialog tags={list.tags} onClose={() => setDialog(null)} onSave={saveTags} />}
      {dialog?.kind === 'rack' && <RackDialog taken={taken} onClose={() => setDialog(null)} onSend={(rows, write, success, card) => { sendRows(rows, [], write, success, { rack: card }); onOpen({ kind: 'rack', id: card.rack }) }} />}
      {dialog?.kind === 'delete' && (
        <Dialog open onOpenChange={open => { if (!open) setDialog(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(`Slet ${chosen.length} placeringer?`, `Delete ${chosen.length} locations?`)}</DialogTitle>
              <DialogDescription>{t('Kun tomme slettes – står der paller eller varer, bliver pladsen og du får at vide hvorfor. Sletningen står i loggen og kan fortrydes.', 'Only empty ones are deleted – a place with pallets or goods stays, and you are told why. The deletion is logged and can be undone.')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialog(null)}>{t('Annullér', 'Cancel')}</Button>
              <Button variant="destructive" onClick={() => deleteChosen()}><Trash size={16} /> {t('Slet', 'Delete')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {dialog?.kind === 'deleted' && (
        <Dialog open onOpenChange={open => { if (!open) setDialog(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(`${dialog.result.deleted.length} slettet, ${dialog.result.kept.length} ikke slettet`, `${dialog.result.deleted.length} deleted, ${dialog.result.kept.length} not deleted`)}</DialogTitle>
              <DialogDescription>{t('Disse placeringer er ikke tomme og blev stående:', 'These locations are not empty and stayed:')}</DialogDescription>
            </DialogHeader>
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm" aria-label={t('Ikke slettet', 'Not deleted')}>
              {dialog.result.kept.map(item => <li key={item.name}><span className="font-mono font-semibold">{item.name}</span> – {item.reason}</li>)}
            </ul>
            <DialogFooter><Button onClick={() => setDialog(null)}>{t('OK', 'OK')}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

const materialsFrom = (text: string) => [...new Set(text.toUpperCase().split(/[\s,;]+/).filter(Boolean))]

/** `linked`: the place is on the published drawing, which owns its name, type, capacity and reserve/pick. */
function LocationDialog({ location, linked, team, taken, onClose, onSend }: { location: Listed | null; linked: boolean; team: LayoutOwner; taken: (id: string) => boolean; onClose: () => void; onSend: SendRows }) {
  const [name, setName] = useState(location?.name || '')
  const [area, setArea] = useState(location?.area || '')
  const [type, setType] = useState<LocationType>(location?.type || 'Palle')
  const [purpose, setPurpose] = useState<LocationPurpose>(location?.purpose || 'reserve')
  const [capacity, setCapacity] = useState(String(location?.capacity || 1))
  const [materials, setMaterials] = useState((location?.fixedMaterials || []).join(' '))
  const [note, setNote] = useState(location?.note || '')
  const [drawnPurpose, setDrawnPurpose] = useState<'reserve' | 'pick' | null>(null)
  const [layoutError, setLayoutError] = useState('')
  useEffect(() => {
    if (!linked || !location || location.purpose !== 'reserved') return
    let current = true
    window.electronWarehouse!.locations.layout()
      .then(({ layout }) => { if (current && layout) setDrawnPurpose(drawnPurposeOf(layout, team, location.id)) })
      .catch(error => { if (current) setLayoutError(errorMessage(error)) })
    return () => { current = false }
  }, [linked, location, team])
  const purposes = linked && location ? linkedPurposes(location.purpose, drawnPurpose) : PURPOSES
  const palletsHere = location?.used ?? 0
  const purposeChanged = Boolean(location) && location!.purpose !== purpose
  // Pallets on the place: as a pick place they become the pick pallet; a station or a reserved place cannot keep them.
  const becomesPick = purposeChanged && purpose === 'pick' && palletsHere > 0
  // Pallets on a station or a reserved place, or more pallets than the capacity, stay where they are – the person is told.
  const palletsStay = purposeChanged && (purpose === 'station' || purpose === 'reserved') && palletsHere > 0
  const limit = palletLimitOf({ type, purpose, capacity: storedCapacityOf(type, Number(capacity || 0), location) })
  const overFull = !becomesPick && Number.isFinite(limit) && limit >= 1 && palletsHere > limit
  const rack = type === 'Hylde' ? SHELF_NAME.exec(name.trim()) : null
  // A place on the drawing may still be without its materials (the backend allows it).
  const needsMaterial = !linked && (purpose === 'pick' || purpose === 'station') && !becomesPick

  // A place with this name exists already: the backend refuses it (LOCATION_EXISTS), so it is said here.
  const clash = Boolean(name.trim()) && locationKeyOf(name) !== location?.id && taken(locationKeyOf(name))

  function save() {
    const input: LocationInput = { name, area: area.trim() || undefined, type, purpose, ...(hasCapacity(type) ? { capacity: Number(capacity) } : {}), fixedMaterials: materialsFrom(materials), note }
    const changes = linked ? linkedChanges(input) : input
    // The pallets of a place made a pick place are used up there.
    const row = { ...placeFrom(changes, location), ...(becomesPick ? { used: 0 } : {}) }
    // Saved without a change: nothing to write on M:.
    if (location && !becomesPick && (['name', 'area', 'type', 'purpose', 'capacity', 'fixedMaterials', 'note'] as const).every(field => JSON.stringify(row[field]) === JSON.stringify(location[field]))) { onClose(); return }
    const bridge = window.electronWarehouse!.locations
    onSend([row], location ? [location] : [],
      location ? () => bridge.editLocation({ location: location.id, changes, usePallets: becomesPick }) : () => bridge.createLocation(input),
      location ? t(`${row.name} er rettet`, `${row.name} has been edited`) : t(`${row.name} er oprettet`, `${row.name} has been created`))
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{location ? t(`Ret ${location.name}`, `Edit ${location.name}`) : t('Opret placering', 'Create location')}</DialogTitle>
          <DialogDescription>{t('Området findes ud fra navnet (A2.4 → A), hvis du ikke skriver det.', 'The area comes from the name (A2.4 → A) if you leave it empty.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="loc-name">{t('Navn', 'Name')}</Label><Input id="loc-name" autoFocus className="font-mono" maxLength={30} value={name} disabled={linked} onChange={event => setName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="loc-area">{t('Område', 'Area')}</Label><Input id="loc-area" className="font-mono" value={area} onChange={event => setArea(event.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label htmlFor="loc-type">Type</Label><NativeSelect id="loc-type" className="w-full" value={type} disabled={linked} onChange={event => setType(event.target.value as LocationType)}>{TYPES.map(item => <option key={item} value={item}>{typeLabel(item)}</option>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="loc-purpose">{t('Formål', 'Purpose')}</Label><NativeSelect id="loc-purpose" className="w-full" value={purpose} disabled={purposes.length < 2} onChange={event => setPurpose(event.target.value as LocationPurpose)}>{purposes.map(item => <option key={item} value={item}>{purposeLabel(item)}</option>)}</NativeSelect></div>
          {hasCapacity(type) ? (
            <div className="space-y-1.5"><Label htmlFor="loc-capacity">{t('Kapacitet (paller)', 'Capacity (pallets)')}</Label><Input id="loc-capacity" inputMode="numeric" value={capacity} disabled={linked} onChange={event => setCapacity(event.target.value.replace(/\D/g, ''))} /></div>
          ) : (
            <p className="self-end pb-2 text-sm text-muted-foreground">{type === 'Palle' ? (limit === 1 ? t('1 palle', '1 pallet') : t(`${limit} paller`, `${limit} pallets`)) : type === 'Gulv' ? t('Paller – ingen grænse', 'Pallets – no limit') : purpose === 'reserve' ? t('Hyldelager: materiale og antal', 'Shelf stock: material and quantity') : t('Pluk-hylde', 'Pick shelf')}</p>
          )}
        </div>
        {linked && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapTrifold size={14} /> {t('Navn, type, kapacitet og pluk/reserve:', 'Name, type, capacity and pick/reserve:')} {t('Rettes på tegningen', 'Changed on the drawing')}</p>}
        {layoutError && <p role="alert" className="text-sm text-destructive">{t(`Tegningen kunne ikke læses, så pladsen bliver reserveret: ${layoutError}`, `The drawing could not be read, so the place stays reserved: ${layoutError}`)}</p>}
        {type === 'Hylde' && !linked && <p className="text-sm text-muted-foreground">{rack ? t(`Reol ${rack[1].toUpperCase()}, hylde ${Number(rack[2])}`, `Rack ${rack[1].toUpperCase()}, shelf ${Number(rack[2])}`) : t('Navngiv hylden som "E9 H5" (reol E9, hylde 5) for at den hører til en reol.', 'Name the shelf like "E9 H5" (rack E9, shelf 5) for it to belong to a rack.')}</p>}
        <div className="space-y-1.5">
          <Label htmlFor="loc-materials">{needsMaterial ? t('Materialer (påkrævet)', 'Materials (required)') : t('Fast plads for materialer (valgfri)', 'Fixed place for materials (optional)')}</Label>
          <Input id="loc-materials" className="font-mono" value={materials} placeholder="R162-0717 R133-0032" onChange={event => setMaterials(event.target.value)} aria-invalid={needsMaterial && !materialsFrom(materials).length} />
        </div>
        {becomesPick && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t(`Der står ${palletsHere === 1 ? 'en palle' : `${palletsHere} paller`} på ${location!.name}. Som pluk-plads bliver ${palletsHere === 1 ? 'pallen' : 'pallerne'} pluk-pallen og tælles ikke længere som reservepalle – historikken gemmer ${palletsHere === 1 ? 'den' : 'dem'}. Pallens materiale bliver fast på pladsen.`, `There ${palletsHere === 1 ? 'is a pallet' : `are ${palletsHere} pallets`} on ${location!.name}. As a pick place the pallet${palletsHere === 1 ? '' : 's'} become${palletsHere === 1 ? 's' : ''} the pick pallet and no longer count${palletsHere === 1 ? 's' : ''} as reserve – the history keeps ${palletsHere === 1 ? 'it' : 'them'}. The pallet's material is fixed on the place.`)}</p>
        )}
        {palletsStay && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t(`Der står paller på ${location!.name}. De bliver stående og kan flyttes eller tages bagefter, men tælles ikke med i FIFO, så længe pladsen er ${purposeLabel(purpose).toLowerCase()}.`, `There are pallets on ${location!.name}. They stay and can be moved or taken afterwards, but are left out of FIFO while the place is a ${purposeLabel(purpose).toLowerCase()}.`)}</p>
        )}
        {overFull && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t(`Der står ${palletsHere} paller på ${location!.name} – med plads til ${limit} står pladsen som fuld.`, `There are ${palletsHere} pallets on ${location!.name} – with room for ${limit} the place shows as full.`)}</p>
        )}
        <div className="space-y-1.5"><Label htmlFor="loc-note">{t('Note', 'Note')}</Label><Input id="loc-note" value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></div>
        {clash && <p role="alert" className="text-sm text-destructive">{t(`${name.trim()} findes allerede`, `${name.trim()} already exists`)}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => save()} disabled={!name.trim() || clash || (needsMaterial && !materialsFrom(materials).length)}>{becomesPick ? t('Gem – pallen bliver pluk-palle', 'Save – the pallet becomes the pick pallet') : t('Gem', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SeriesDialog({ taken, onClose, onSend }: { taken: (id: string) => boolean; onClose: () => void; onSend: SendRows }) {
  const [prefix, setPrefix] = useState('')
  const [aisles, setAisles] = useState(['1', '1'])
  const [places, setPlaces] = useState(['1', '6'])
  const [type, setType] = useState<LocationType>('Palle')
  const [purpose, setPurpose] = useState<LocationPurpose>('reserve')
  const [capacity, setCapacity] = useState('1')
  const range = (pair: string[]): [number, number] => [Number(pair[0] || 0), Number(pair[1] || 0)]
  const [a, p] = [range(aisles), range(places)]
  const valid = prefix.trim() && a[1] >= a[0] && p[1] >= p[0]
  const total = valid ? (a[1] - a[0] + 1) * (p[1] - p[0] + 1) : 0
  const names = valid ? [`${prefix.trim()}${a[0]}.${p[0]}`, `${prefix.trim()}${a[0]}.${Math.min(p[0] + 1, p[1])}`, `${prefix.trim()}${a[1]}.${p[1]}`] : []

  // As the backend makes the series: names that exist are skipped.
  function save() {
    const start = prefix.trim()
    const wanted: Listed[] = []
    for (let aisle = a[0]; aisle <= a[1]; aisle++) for (let place = p[0]; place <= p[1]; place++) wanted.push(placeFrom({ name: `${start}${aisle}.${place}`, type, purpose, capacity: hasCapacity(type) ? Number(capacity) || 1 : 1 }, null))
    const created = wanted.filter(location => !taken(location.id))
    const skipped = wanted.length - created.length
    const success = t(`${created.length} placeringer oprettet${skipped ? `, ${skipped} fandtes allerede` : ''}`, `${created.length} locations created${skipped ? `, ${skipped} already existed` : ''}`)
    if (!created.length) { toast.success(success); onClose(); return }
    onSend(created, [], () => window.electronWarehouse!.locations.createSeries({ prefix: start, aisles: a, places: p, type, purpose, ...(hasCapacity(type) ? { capacity: Number(capacity) || 1 } : {}) }), success)
  }

  const pairInput = (label: string, id: string, pair: string[], set: (value: string[]) => void) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-from`}>{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input id={`${id}-from`} inputMode="numeric" className="w-20" value={pair[0]} onChange={event => set([event.target.value.replace(/\D/g, ''), pair[1]])} aria-label={t(`${label} fra`, `${label} from`)} />
        <span>–</span>
        <Input inputMode="numeric" className="w-20" value={pair[1]} onChange={event => set([pair[0], event.target.value.replace(/\D/g, '')])} aria-label={t(`${label} til`, `${label} to`)} />
      </div>
    </div>
  )

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Opret serie', 'Create series')}</DialogTitle>
          <DialogDescription>{t('Fx forbogstav C, gange 1–20 og pladser 1–6 giver C1.1 … C20.6. Navne der findes, springes over.', 'E.g. prefix C, aisles 1–20 and places 1–6 gives C1.1 … C20.6. Existing names are skipped.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="series-prefix">{t('Forbogstav', 'Prefix')}</Label><Input id="series-prefix" autoFocus className="font-mono" value={prefix} onChange={event => setPrefix(event.target.value.toUpperCase())} /></div>
          {pairInput(t('Gange', 'Aisles'), 'series-aisles', aisles, setAisles)}
          {pairInput(t('Pladser', 'Places'), 'series-places', places, setPlaces)}
          <div className="space-y-1.5"><Label htmlFor="series-type">Type</Label><NativeSelect id="series-type" className="w-full" value={type} onChange={event => setType(event.target.value as LocationType)}>{TYPES.map(item => <option key={item} value={item}>{typeLabel(item)}</option>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="series-purpose">{t('Formål', 'Purpose')}</Label><NativeSelect id="series-purpose" className="w-full" value={purpose} onChange={event => setPurpose(event.target.value as LocationPurpose)}>{(['reserve', 'reserved'] as LocationPurpose[]).map(item => <option key={item} value={item}>{purposeLabel(item)}</option>)}</NativeSelect></div>
          {hasCapacity(type) && <div className="space-y-1.5"><Label htmlFor="series-capacity">{t('Kapacitet', 'Capacity')}</Label><Input id="series-capacity" inputMode="numeric" value={capacity} onChange={event => setCapacity(event.target.value.replace(/\D/g, ''))} /></div>}
        </div>
        {valid && (
          <p className={cn('rounded-md border px-3 py-2 text-sm', total > SERIES_MAX ? 'border-destructive/40 text-destructive' : 'bg-muted/40')}>
            {total > SERIES_MAX ? t(`${total} placeringer – højst ${SERIES_MAX} ad gangen.`, `${total} locations – at most ${SERIES_MAX} at a time.`) : <>{t(`${total} placeringer:`, `${total} locations:`)} <span className="font-mono">{names[0]}, {names[1]} … {names[2]}</span></>}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => save()} disabled={!valid || total > SERIES_MAX}>{t('Opret', 'Create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Opret reol": a rack with its shelves "E9 H1" … "E9 Hn" in one go; its card opens at once, as it will be. */
function RackDialog({ taken, onClose, onSend }: { taken: (id: string) => boolean; onClose: () => void; onSend: (rows: Listed[], write: () => Promise<unknown>, success: string, card: RackCardData) => void }) {
  const [name, setName] = useState('')
  const [shelves, setShelves] = useState('5')
  const [area, setArea] = useState('')
  const [purpose, setPurpose] = useState<'reserve' | 'pick'>('reserve')
  const count = Number(shelves || 0)
  const rack = name.trim().replace(/\s+/g, ' ').toUpperCase()
  const valid = Boolean(rack) && count >= 1 && count <= 20
  const rows = valid ? Array.from({ length: count }, (_, index) => placeFrom({ name: `${rack} H${index + 1}`, type: 'Hylde', purpose, ...(area.trim() ? { area: area.trim() } : {}) }, null)) : []
  // The backend refuses the rack when one of its shelves exists (LOCATION_EXISTS), so it is said here.
  const clash = rows.filter(location => taken(location.id)).map(location => location.name)

  function save() {
    const card: RackCardData = { rack, area: rows[0].area, purpose, shelves: [...rows].reverse().map(location => ({ location, stock: [] })), history: [] }
    onSend(rows, () => window.electronWarehouse!.locations.createRack({ name: rack, shelves: count, area: area.trim() || undefined, purpose }), t(`Reol ${rack} oprettet med ${count} hylder`, `Rack ${rack} created with ${count} shelves`), card)
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Opret reol', 'Create rack')}</DialogTitle>
          <DialogDescription>{t('Hylderne får navnene E9 H1, E9 H2 … og kan tilføjes eller fjernes bagefter på reolkortet.', 'The shelves are named E9 H1, E9 H2 … and can be added or removed afterwards on the rack card.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="rack-name">{t('Navn', 'Name')}</Label><Input id="rack-name" autoFocus className="font-mono" maxLength={25} value={name} placeholder="E9" onChange={event => setName(event.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label htmlFor="rack-shelves">{t('Antal hylder', 'Number of shelves')}</Label><Input id="rack-shelves" inputMode="numeric" value={shelves} onChange={event => setShelves(event.target.value.replace(/\D/g, ''))} /></div>
          <div className="space-y-1.5"><Label htmlFor="rack-area">{t('Område', 'Area')}</Label><Input id="rack-area" className="font-mono" value={area} placeholder={t('Fra navnet', 'From the name')} onChange={event => setArea(event.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label htmlFor="rack-purpose">{t('Formål', 'Purpose')}</Label>
            <NativeSelect id="rack-purpose" className="w-full" value={purpose} onChange={event => setPurpose(event.target.value as 'reserve' | 'pick')}>
              <option value="reserve">{t('Lager (materiale og antal)', 'Storage (material and quantity)')}</option>
              <option value="pick">{t('Pluk', 'Pick')}</option>
            </NativeSelect>
          </div>
        </div>
        {valid && <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">{t(`${count} hylder:`, `${count} shelves:`)} <span className="font-mono">{rack} H1{count > 1 ? ` … ${rack} H${count}` : ''}</span></p>}
        {count > 20 && <p className="text-sm text-destructive">{t('Højst 20 hylder.', 'At most 20 shelves.')}</p>}
        {clash.length > 0 && <p role="alert" className="text-sm text-destructive">{t(`${clash.join(', ')} findes allerede`, `${clash.join(', ')} already exist${clash.length === 1 ? 's' : ''}`)}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => save()} disabled={!valid || clash.length > 0}>{t('Opret', 'Create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TagsDialog({ tags, onClose, onSave }: { tags: string[]; onClose: () => void; onSave: (tags: string[]) => void }) {
  const [text, setText] = useState(tags.join('\n'))
  // The backend's tagsOf: trimmed, each once, at most 100.
  const save = () => onSave([...new Set(text.split('\n').map(item => item.trim()).filter(Boolean))].slice(0, 100))
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Mærkater', 'Labels')}</DialogTitle>
          <DialogDescription>{t('Ét mærkat pr. linje, fx Sluse oppe eller Brandskab. De kan sættes på paller.', 'One label per line, e.g. Sluse oppe or Brandskab. They can be put on pallets.')}</DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={event => setText(event.target.value)} className="min-h-40" aria-label={t('Mærkater', 'Labels')} />
        <div className="flex flex-wrap gap-1">{text.split('\n').map(item => item.trim()).filter(Boolean).map(item => <Badge key={item} variant="outline">{item}</Badge>)}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => save()}>{t('Gem', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
