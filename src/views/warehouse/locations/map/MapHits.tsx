import { t } from '@/lib/warehouse/text'
import { dayMonth, type MapHit, type MapHitPlace } from '@/lib/warehouse/layout/map'
import type { MapContents } from '@/types/warehouse'

// A common material can stand on many places: the line lists the first ones (the oldest always first), then "+N flere".
const PLACES_SHOWN = 8

/** The line under the map's search field: each hit with its places; a place off the drawing opens its place card. */
export function MapHits({ hits, contents, onPlace }: { hits: MapHit[]; contents: MapContents; onPlace: (place: MapHitPlace) => void }) {
  if (!hits.length) return <p data-testid="map-hits" className="text-sm text-muted-foreground">{t('Ingen plads eller materiale på kortet matcher', 'No place or material on the map matches')}</p>
  return (
    <div data-testid="map-hits" className="space-y-1 text-sm">
      {hits.map(hit => {
        const ordered = [...hit.places.filter(place => place.oldest), ...hit.places.filter(place => !place.oldest)]
        const places = ordered.slice(0, PLACES_SHOWN)
        const more = ordered.length - places.length
        const oldestAt = (place: MapHitPlace) => dayMonth(contents.places[place.id]?.materials.find(entry => entry.material === hit.material)?.oldestAt)
        return (
          <div key={hit.kind === 'material' ? `m:${hit.material}` : `p:${hit.places[0].id}`} className="flex flex-wrap items-center gap-1.5">
            {hit.kind === 'material' && (
              <span><span className="font-mono font-semibold">{hit.material}</span>{hit.description ? ` · ${hit.description}` : ''}</span>
            )}
            {places.map(place => {
              const date = place.oldest ? oldestAt(place) : ''
              return (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => onPlace(place)}
                  className="rounded-md border bg-card px-2 py-0.5 font-mono text-xs hover:border-primary/50 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {place.name}
                  {place.oldest && <span className="ml-1 font-sans font-semibold text-amber-600">{t('ældste', 'oldest')}{date ? `, ${date}` : ''}</span>}
                  {place.itemId === null && <span className="ml-1 font-sans text-muted-foreground">{t('ikke på kortet', 'not on the map')}</span>}
                </button>
              )
            })}
            {more > 0 && <span className="text-xs text-muted-foreground">{t(`+${more} flere`, `+${more} more`)}</span>}
          </div>
        )
      })}
    </div>
  )
}
