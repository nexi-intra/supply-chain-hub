import { useEffect, useRef, useState } from 'react'
import { Cube, MapPin, MapTrifold, Package, Rows } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { canShowOnMap } from '@/lib/warehouse/layout/map'
import { formatAge, materialLabel, purposeLabel, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationList } from '@/types/warehouse'
import { enterOnSearch, openWhenReady, type SearchResult } from './scanChoices'

/**
 * Search as you type; with a scanner (Enter after the code) a single hit opens at once. The Enter usually comes before
 * the search has answered, so it waits for the result of that text and never opens the hit of the previous one.
 */
export function SearchResults({ query, version, drawing, onOpen }: { query: string; version: number; drawing: LocationList['drawing']; onOpen: (target: LocationsTarget) => void }) {
  const [result, setResult] = useState<SearchResult | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const latest = useRef({ query, result, onOpen })
  latest.current = { query, result, onOpen }
  // The text an Enter is waiting for the result of.
  const waitFor = useRef<string | null>(null)

  useEffect(() => {
    if (waitFor.current !== query) waitFor.current = null
    let current = true
    const timer = window.setTimeout(() => {
      window.electronWarehouse!.locations.search({ query })
        .then(found => {
          if (!current) return
          const next = { query, found }
          setResult(next)
          setFailed(null)
          const step = openWhenReady(waitFor.current, next)
          waitFor.current = step.waitFor
          if (step.open) latest.current.onOpen(step.open)
        })
        .catch(error => { if (current) { waitFor.current = null; setFailed(errorMessage(error)) } })
    }, 200)
    return () => { current = false; window.clearTimeout(timer) }
  }, [query, version])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      const step = enterOnSearch(latest.current.result, latest.current.query)
      waitFor.current = step.waitFor
      if (step.open) latest.current.onOpen(step.open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (failed) return <p role="alert" className="text-sm text-destructive">{failed}</p>
  if (!result) return <Skeleton className="h-40 rounded-xl" />
  const { found } = result
  const nothing = !found.materials.length && !found.locations.length && !found.pallets.length && !found.racks.length
  if (nothing) return <p className="py-6 text-center text-sm text-muted-foreground">{t(`Intet fundet for "${result.query.trim()}".`, `Nothing found for "${result.query.trim()}".`)}</p>

  const row = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary'
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {found.materials.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Cube size={16} /> {t('Materialer', 'Materials')}</h2>
          {found.materials.map(item => (
            <button key={item.material} type="button" className={row} onClick={() => onOpen({ kind: 'material', id: item.material })}>
              <span className="min-w-0 truncate">{materialLabel(item.material, item.description)}</span>
            </button>
          ))}
        </section>
      )}
      {found.racks.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Rows size={16} /> {t('Reoler', 'Racks')}</h2>
          {found.racks.map(rack => (
            <button key={rack} type="button" className={row} onClick={() => onOpen({ kind: 'rack', id: rack })}>
              <span className="font-mono font-semibold">{rack}</span>
            </button>
          ))}
        </section>
      )}
      {found.locations.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><MapPin size={16} /> {t('Placeringer', 'Locations')}</h2>
          {found.locations.map(location => (
            <div key={location.id} className="flex items-center gap-1">
              <button type="button" className={row} onClick={() => onOpen({ kind: 'location', id: location.id })}>
                <span className="font-mono font-semibold">{location.name}</span>
                <span className="text-xs text-muted-foreground">{purposeLabel(location.purpose)}</span>
                {!location.active && <Badge variant="outline">{t('Deaktiveret', 'Deactivated')}</Badge>}
              </button>
              {canShowOnMap(location.id, drawing) && (
                <Button size="sm" variant="ghost" className="shrink-0" onClick={event => { event.stopPropagation(); onOpen({ kind: 'map', id: location.id }) }}>
                  <MapTrifold size={16} /> {t('Vis på kort', 'Show on map')}
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      {found.pallets.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Package size={16} /> {t('Paller', 'Pallets')}</h2>
          {found.pallets.map(pallet => (
            <button key={pallet.id} type="button" className={row} onClick={() => onOpen({ kind: 'pallet', id: pallet.id })}>
              <span className="font-mono font-semibold">{pallet.location}</span>
              <span className="min-w-0 flex-1 truncate">{materialLabel(pallet.material, pallet.description)}</span>
              <span className="text-xs text-muted-foreground">{pallet.quantity === null ? '' : formatNumber(pallet.quantity)} · {formatAge(pallet.ageDays)}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
