import { useEffect, useState } from 'react'
import { Cube, MapPin, MapTrifold, Package, Rows } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { canShowOnMap } from '@/lib/warehouse/layout/map'
import { formatAge, materialLabel, purposeLabel, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationList, LocationSearch } from '@/types/warehouse'

/** Search as you type; with a scanner (Enter after the code) a single hit opens at once. */
export function SearchResults({ query, version, drawing, onOpen }: { query: string; version: number; drawing: LocationList['drawing']; onOpen: (target: LocationsTarget) => void }) {
  const [result, setResult] = useState<LocationSearch | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      window.electronWarehouse!.locations.search({ query })
        .then(found => { if (current) { setResult(found); setFailed(null) } })
        .catch(error => { if (current) setFailed(errorMessage(error)) })
    }, 200)
    return () => { current = false; window.clearTimeout(timer) }
  }, [query, version])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !result) return
      const hits = [...result.materials.map(item => ({ kind: 'material' as const, id: item.material })), ...result.locations.map(item => ({ kind: 'location' as const, id: item.id })), ...result.pallets.map(item => ({ kind: 'pallet' as const, id: item.id })), ...result.racks.map(id => ({ kind: 'rack' as const, id }))]
      if (hits.length === 1) onOpen(hits[0])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, onOpen])

  if (failed) return <p role="alert" className="text-sm text-destructive">{failed}</p>
  if (!result) return <Skeleton className="h-40 rounded-xl" />
  const nothing = !result.materials.length && !result.locations.length && !result.pallets.length && !result.racks.length
  if (nothing) return <p className="py-6 text-center text-sm text-muted-foreground">{t(`Intet fundet for "${query.trim()}".`, `Nothing found for "${query.trim()}".`)}</p>

  const row = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary'
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {result.materials.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Cube size={16} /> {t('Materialer', 'Materials')}</h2>
          {result.materials.map(item => (
            <button key={item.material} type="button" className={row} onClick={() => onOpen({ kind: 'material', id: item.material })}>
              <span className="min-w-0 truncate">{materialLabel(item.material, item.description)}</span>
            </button>
          ))}
        </section>
      )}
      {result.racks.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Rows size={16} /> {t('Reoler', 'Racks')}</h2>
          {result.racks.map(rack => (
            <button key={rack} type="button" className={row} onClick={() => onOpen({ kind: 'rack', id: rack })}>
              <span className="font-mono font-semibold">{rack}</span>
            </button>
          ))}
        </section>
      )}
      {result.locations.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><MapPin size={16} /> {t('Placeringer', 'Locations')}</h2>
          {result.locations.map(location => (
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
      {result.pallets.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Package size={16} /> {t('Paller', 'Pallets')}</h2>
          {result.pallets.map(pallet => (
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
