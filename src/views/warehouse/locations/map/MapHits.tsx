import { t } from '@/lib/warehouse/text'
import type { MapHit, MapHitPlace } from '@/lib/warehouse/layout/map'

/** The line under the map's search field: each hit with its places; a place off the drawing opens its place card. */
export function MapHits({ hits, onPlace }: { hits: MapHit[]; onPlace: (place: MapHitPlace) => void }) {
  if (!hits.length) return <p data-testid="map-hits" className="text-sm text-muted-foreground">{t('Ingen plads eller materiale på kortet matcher', 'No place or material on the map matches')}</p>
  return (
    <div data-testid="map-hits" className="space-y-1 text-sm">
      {hits.map(hit => (
        <div key={hit.kind === 'material' ? `m:${hit.material}` : `p:${hit.places[0].id}`} className="flex flex-wrap items-center gap-1.5">
          {hit.kind === 'material' && (
            <span><span className="font-mono font-semibold">{hit.material}</span>{hit.description ? ` · ${hit.description}` : ''}</span>
          )}
          {hit.places.map(place => (
            <button
              key={place.id}
              type="button"
              onClick={() => onPlace(place)}
              className="rounded-md border bg-card px-2 py-0.5 font-mono text-xs hover:border-primary/50 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
            >
              {place.name}
              {place.oldest && <span className="ml-1 font-sans font-semibold text-amber-600">{t('ældste', 'oldest')}</span>}
              {place.itemId === null && <span className="ml-1 font-sans text-muted-foreground">{t('ikke på kortet', 'not on the map')}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
