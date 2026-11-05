import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowsClockwise, ArrowsLeftRight, BookOpen, ClockCounterClockwise, Gear, HandGrabbing, MagnifyingGlass, MapTrifold, Package, Stack, Storefront, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import type { LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationList, LocationsOverview, WarehouseUser } from '@/types/warehouse'
import { SearchResults } from './SearchResults'

interface TaskButton { target: LocationsTarget | 'search'; title: string; hint: string; icon: ReactNode }

/** Placeringer's front page: search first, the four daily tasks and how full each area is. */
export function LocationsHome({ user, canAdmin, drawn, drawing, version, onOpen }: { user: WarehouseUser; canAdmin: boolean; drawn: boolean; drawing: LocationList['drawing']; version: number; onOpen: (target: LocationsTarget) => void }) {
  const [overview, setOverview] = useState<LocationsOverview | null>(null)
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let current = true
    window.electronWarehouse!.locations.overview()
      .then(result => { if (current) setOverview(result) })
      .catch(error => toast.error(errorMessage(error)))
    return () => { current = false }
  }, [version])

  const tasks: TaskButton[] = [
    { target: { kind: 'putaway' }, title: t('Sæt palle på plads', 'Put a pallet away'), hint: t('Efter varemodtagelse – scan 49/50-nummeret', 'After goods receipt – scan the 49/50 number'), icon: <Package weight="duotone" /> },
    { target: { kind: 'shelf' }, title: t('Læg på hylde', 'Put on shelf'), hint: t('Materiale og antal på en hylde i en reol', 'Material and quantity on a shelf in a rack'), icon: <Stack weight="duotone" /> },
    { target: { kind: 'take' }, title: t('Tag', 'Take'), hint: t('Paller (ældste først) og fra hylder', 'Pallets (oldest first) and from shelves'), icon: <HandGrabbing weight="duotone" /> },
    { target: { kind: 'refill' }, title: t('Fyld pluk-plads op', 'Refill a pick place'), hint: t('Når en pluk-lokation/-palle er tom', 'When a pick location/pallet is empty'), icon: <ArrowsClockwise weight="duotone" /> },
    { target: { kind: 'fetch' }, title: t('Hvor henter jeg?', 'Where do I fetch it?'), hint: t('Skriv materialenummeret – se hvor du henter det', 'Type the material number – see where to fetch it'), icon: <Storefront weight="duotone" /> },
    { target: { kind: 'move' }, title: t('Flyt', 'Move'), hint: t('En palle, eller varer fra en hylde til en anden', 'A pallet, or goods from one shelf to another'), icon: <ArrowsLeftRight weight="duotone" /> },
    { target: 'search', title: t('Find materiale', 'Find a material'), hint: t('Hvor står det, og hvor meget er der?', 'Where is it, and how much is there?'), icon: <BookOpen weight="duotone" /> },
  ]
  if (drawing) tasks.push({ target: { kind: 'map' }, title: t('Kort over lageret', 'Map of the warehouse'), hint: t('Find en plads eller et materiale på tegningen', 'Find a place or a material on the drawing'), icon: <MapTrifold weight="duotone" /> })

  if (!overview) return <Skeleton className="h-96 rounded-xl" />
  const empty = overview.counts.locations === 0

  return (
    <div className="space-y-6">
      <div className="relative">
        <MagnifyingGlass size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={search}
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('Søg eller scan: materiale, beskrivelse, placering, 49/50-nummer eller serienummer', 'Search or scan: material, description, location, 49/50 number or serial number')}
          className="h-12 pl-10 text-base"
          aria-label={t('Søg i placeringer', 'Search locations')}
        />
      </div>

      {query.trim() ? <SearchResults query={query} version={version} onOpen={onOpen} /> : (
        <>
          {empty && (
            <Card className="border-dashed">
              <CardContent className="flex flex-wrap items-center gap-3 py-5 text-sm">
                <Warning size={20} className="text-amber-600" />
                <span className="flex-1">{canAdmin && drawn
                  ? t('Pladser oprettes og ændres nu på tegningen', 'Locations are now created and changed on the drawing')
                  : canAdmin
                  ? t(`Der er ingen placeringer i ${user.team} endnu. Opret dem, eller importér placeringsarket.`, `There are no locations in ${user.team} yet. Create them, or import the placement sheet.`)
                  : t(`Der er ingen placeringer i ${user.team} endnu. En manager eller admin opretter dem.`, `There are no locations in ${user.team} yet. A manager or admin creates them.`)}</span>
                {canAdmin && drawn && <Button size="sm" onClick={() => onOpen({ kind: 'layout' })}><MapTrifold size={16} /> {t('Tegning af lageret', 'Drawing of the warehouse')}</Button>}
                {canAdmin && !drawn && user.team === 'TCD' && <Button size="sm" onClick={() => onOpen({ kind: 'import' })}>{t('Importér placeringsarket', 'Import the placement sheet')}</Button>}
                {canAdmin && !drawn && <Button size="sm" variant="outline" onClick={() => onOpen({ kind: 'admin' })}>{t('Opret placeringer', 'Create locations')}</Button>}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map(task => (
              <button
                key={task.title}
                type="button"
                disabled={empty && task.target !== 'search'}
                onClick={() => (task.target === 'search' ? search.current?.focus() : onOpen(task.target))}
                className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="rounded-lg bg-primary/10 p-2 text-primary [&>svg]:h-7 [&>svg]:w-7">{task.icon}</span>
                <span>
                  <span className="block font-semibold">{task.title}</span>
                  <span className="block text-xs text-muted-foreground">{task.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {overview.areas.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t('Kapacitet pr. område', 'Capacity per area')}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {overview.areas.map(area => {
                  const used = area.capacity ? Math.round((area.used / area.capacity) * 100) : 0
                  return (
                    <div key={area.area} className="rounded-lg border bg-card px-3 py-2">
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-sm font-semibold">{area.area}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${used}%` }} /></div>
                      <p className="mt-1 text-xs text-muted-foreground">{t(`${area.free} ledige af ${area.capacity}`, `${area.free} free of ${area.capacity}`)}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!empty && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpen({ kind: 'log' })}><ClockCounterClockwise size={16} /> {t('Log', 'Log')}</Button>
              {canAdmin && drawn && <Button variant="ghost" size="sm" onClick={() => onOpen({ kind: 'layout' })}><MapTrifold size={16} /> {t('Tegning af lageret', 'Drawing of the warehouse')}</Button>}
              {canAdmin && <Button variant="ghost" size="sm" onClick={() => onOpen({ kind: 'admin' })}><Gear size={16} /> {t('Administrér placeringer', 'Manage locations')}</Button>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
