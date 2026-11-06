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
import { isShelfPlace, linkedChanges, linkedPurposes, palletLimitOf, PURPOSES, purposeLabel, storedCapacityOf, TYPES, typeLabel, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { DeleteResult, LayoutOwner, LocationInput, LocationList, LocationPurpose, LocationType, WarehouseUser } from '@/types/warehouse'

type Listed = LocationList['locations'][number]
type Dialogs = { kind: 'create' } | { kind: 'edit'; location: Listed } | { kind: 'series' } | { kind: 'tags' } | { kind: 'rack' } | { kind: 'delete' } | { kind: 'deleted'; result: DeleteResult } | null
const SERIES_MAX = 500
/** The type decides how many pallets fit; only Bord, Swap and the old Reol type have a capacity number. */
const hasCapacity = (type: LocationType) => type !== 'Palle' && type !== 'Gulv' && type !== 'Hylde'
const SHELF_NAME = /^(.+?)\s+H(\d{1,2})$/i
const isEmpty = (location: Listed) => location.used === 0 && location.stockCount === 0
/** "3/1", "7" on a floor, "2 mat." on a shelf. */
const usedText = (location: Listed) => (isShelfPlace(location) ? t(`${location.stockCount} mat.`, `${location.stockCount} mat.`) : Number.isFinite(palletLimitOf(location)) ? `${location.used}/${palletLimitOf(location)}` : String(location.used))

/** Maintain the hub's places: list per area, type and "only empty"; create one, a series or a rack; edit; select many to delete or deactivate; labels. */
export function Admin({ user, version, onOpen, onChanged }: { user: WarehouseUser; version: number; onOpen: (target: LocationsTarget) => void; onChanged: () => void }) {
  const [list, setList] = useState<LocationList | null>(null)
  const [area, setArea] = useState('')
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [type, setType] = useState<LocationType | ''>('')
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialogs>(null)
  const bridge = window.electronWarehouse!.locations

  useEffect(() => {
    let current = true
    bridge.list().then(result => { if (current) setList(result) }).catch(error => toast.error(errorMessage(error)))
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

  async function setActive(location: Listed, active: boolean) {
    if (togglingId) return
    setTogglingId(location.id)
    try {
      await bridge.setActive({ location: location.id, active })
      if (active) toast.success(t(`${location.name} er aktiv igen`, `${location.name} is active again`))
      else if (location.used > 0) toast.success(t(`${location.name} er deaktiveret`, `${location.name} is deactivated`), { description: t('Pallerne bliver stående, men tælles ikke med i FIFO, mens pladsen er deaktiveret.', 'The pallets stay, but are left out of FIFO while the place is deactivated.') })
      else toast.success(t(`${location.name} er deaktiveret`, `${location.name} is deactivated`))
      onChanged()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setTogglingId(null)
    }
  }

  const closeAndReload = () => { setDialog(null); onChanged() }
  const toggle = (id: string) => setSelected(value => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next })

  async function deleteChosen() {
    setBusy(true)
    try {
      const result = await bridge.deleteLocations({ locations: chosen.map(location => location.id) })
      toast.success(t(`${result.deleted.length} placeringer slettet`, `${result.deleted.length} locations deleted`))
      setSelected(new Set())
      onChanged()
      setDialog(result.kept.length ? { kind: 'deleted', result } : null)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function deactivateChosen() {
    setBusy(true)
    try {
      const { changed } = await bridge.setActiveMany({ locations: chosen.map(location => location.id), active: false })
      toast.success(t(`${changed} placeringer deaktiveret`, `${changed} locations deactivated`))
      setSelected(new Set())
      onChanged()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

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
            <Button size="sm" variant="outline" onClick={() => void deactivateChosen()} disabled={busy} loading={busy && !dialog}><Prohibit size={14} /> {t('Deaktivér valgte', 'Deactivate selected')}</Button>
            <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: 'delete' })} disabled={busy}><Trash size={14} /> {t('Slet valgte', 'Delete selected')}</Button>
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
                  <Button size="sm" variant="ghost" loading={togglingId === location.id} onClick={() => void setActive(location, !location.active)}>{location.active ? t('Deaktivér', 'Deactivate') : t('Aktivér', 'Activate')}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && <LocationDialog location={dialog.kind === 'edit' ? dialog.location : null} linked={dialog.kind === 'edit' && linked.has(dialog.location.id)} team={user.team} onClose={() => setDialog(null)} onDone={closeAndReload} />}
      {dialog?.kind === 'series' && <SeriesDialog onClose={() => setDialog(null)} onDone={closeAndReload} />}
      {dialog?.kind === 'tags' && <TagsDialog tags={list.tags} onClose={() => setDialog(null)} onDone={closeAndReload} />}
      {dialog?.kind === 'rack' && <RackDialog onClose={() => setDialog(null)} onDone={rack => { setDialog(null); onChanged(); onOpen({ kind: 'rack', id: rack }) }} />}
      {dialog?.kind === 'delete' && (
        <Dialog open onOpenChange={open => { if (!open && !busy) setDialog(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(`Slet ${chosen.length} placeringer?`, `Delete ${chosen.length} locations?`)}</DialogTitle>
              <DialogDescription>{t('Kun tomme slettes – står der paller eller varer, bliver pladsen og du får at vide hvorfor. Sletningen står i loggen og kan fortrydes.', 'Only empty ones are deleted – a place with pallets or goods stays, and you are told why. The deletion is logged and can be undone.')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>{t('Annullér', 'Cancel')}</Button>
              <Button variant="destructive" onClick={() => void deleteChosen()} loading={busy}><Trash size={16} /> {t('Slet', 'Delete')}</Button>
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
function LocationDialog({ location, linked, team, onClose, onDone }: { location: Listed | null; linked: boolean; team: LayoutOwner; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(location?.name || '')
  const [area, setArea] = useState(location?.area || '')
  const [type, setType] = useState<LocationType>(location?.type || 'Palle')
  const [purpose, setPurpose] = useState<LocationPurpose>(location?.purpose || 'reserve')
  const [capacity, setCapacity] = useState(String(location?.capacity || 1))
  const [materials, setMaterials] = useState((location?.fixedMaterials || []).join(' '))
  const [note, setNote] = useState(location?.note || '')
  const [busy, setBusy] = useState(false)
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

  async function save() {
    const input: LocationInput = { name, area: area.trim() || undefined, type, purpose, ...(hasCapacity(type) ? { capacity: Number(capacity) } : {}), fixedMaterials: materialsFrom(materials), note }
    setBusy(true)
    try {
      if (location) await window.electronWarehouse!.locations.editLocation({ location: location.id, changes: linked ? linkedChanges(input) : input, usePallets: becomesPick })
      else await window.electronWarehouse!.locations.createLocation(input)
      toast.success(location ? t(`${name} er rettet`, `${name} has been edited`) : t(`${name} er oprettet`, `${name} has been created`))
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
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
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => void save()} loading={busy} disabled={!name.trim() || (needsMaterial && !materialsFrom(materials).length)}>{becomesPick ? t('Gem – pallen bliver pluk-palle', 'Save – the pallet becomes the pick pallet') : t('Gem', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SeriesDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [prefix, setPrefix] = useState('')
  const [aisles, setAisles] = useState(['1', '1'])
  const [places, setPlaces] = useState(['1', '6'])
  const [type, setType] = useState<LocationType>('Palle')
  const [purpose, setPurpose] = useState<LocationPurpose>('reserve')
  const [capacity, setCapacity] = useState('1')
  const [busy, setBusy] = useState(false)
  const range = (pair: string[]): [number, number] => [Number(pair[0] || 0), Number(pair[1] || 0)]
  const [a, p] = [range(aisles), range(places)]
  const valid = prefix.trim() && a[1] >= a[0] && p[1] >= p[0]
  const total = valid ? (a[1] - a[0] + 1) * (p[1] - p[0] + 1) : 0
  const names = valid ? [`${prefix.trim()}${a[0]}.${p[0]}`, `${prefix.trim()}${a[0]}.${Math.min(p[0] + 1, p[1])}`, `${prefix.trim()}${a[1]}.${p[1]}`] : []

  async function save() {
    setBusy(true)
    try {
      const result = await window.electronWarehouse!.locations.createSeries({ prefix: prefix.trim(), aisles: a, places: p, type, purpose, ...(hasCapacity(type) ? { capacity: Number(capacity) || 1 } : {}) })
      toast.success(t(`${result.created.length} placeringer oprettet${result.skipped.length ? `, ${result.skipped.length} fandtes allerede` : ''}`, `${result.created.length} locations created${result.skipped.length ? `, ${result.skipped.length} already existed` : ''}`))
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
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
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
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
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => void save()} loading={busy} disabled={!valid || total > SERIES_MAX}>{t('Opret', 'Create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Opret reol": a rack with its shelves "E9 H1" … "E9 Hn" in one go. */
function RackDialog({ onClose, onDone }: { onClose: () => void; onDone: (rack: string) => void }) {
  const [name, setName] = useState('')
  const [shelves, setShelves] = useState('5')
  const [area, setArea] = useState('')
  const [purpose, setPurpose] = useState<'reserve' | 'pick'>('reserve')
  const [busy, setBusy] = useState(false)
  const count = Number(shelves || 0)
  const rack = name.trim().replace(/\s+/g, ' ').toUpperCase()
  const valid = Boolean(rack) && count >= 1 && count <= 20

  async function save() {
    setBusy(true)
    try {
      await window.electronWarehouse!.locations.createRack({ name: rack, shelves: count, area: area.trim() || undefined, purpose })
      toast.success(t(`Reol ${rack} oprettet med ${count} hylder`, `Rack ${rack} created with ${count} shelves`))
      onDone(rack)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
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
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => void save()} loading={busy} disabled={!valid}>{t('Opret', 'Create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TagsDialog({ tags, onClose, onDone }: { tags: string[]; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState(tags.join('\n'))
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await window.electronWarehouse!.locations.setTags({ tags: text.split('\n').map(item => item.trim()).filter(Boolean) })
      toast.success(t('Mærkaterne er gemt', 'The labels are saved'))
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Mærkater', 'Labels')}</DialogTitle>
          <DialogDescription>{t('Ét mærkat pr. linje, fx Sluse oppe eller Brandskab. De kan sættes på paller.', 'One label per line, e.g. Sluse oppe or Brandskab. They can be put on pallets.')}</DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={event => setText(event.target.value)} className="min-h-40" aria-label={t('Mærkater', 'Labels')} />
        <div className="flex flex-wrap gap-1">{text.split('\n').map(item => item.trim()).filter(Boolean).map(item => <Badge key={item} variant="outline">{item}</Badge>)}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Annullér', 'Cancel')}</Button>
          <Button onClick={() => void save()} loading={busy}>{t('Gem', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
