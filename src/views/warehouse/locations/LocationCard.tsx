import { useEffect, useState } from 'react'
import { MapTrifold, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { canShowOnMap } from '@/lib/warehouse/layout/map'
import { formatAge, formatDate, isShelfPlace, materialLabel, purposeLabel, typeLabel, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationCard as LocationCardData, LocationList } from '@/types/warehouse'
import { HistoryList } from './HistoryList'
import { ShelfLines } from './ShelfLines'

/** One place: what it is for, what stands there and what happened there. */
export function LocationCard({ location, version, canAdmin, drawing, onOpen, onChanged }: { location: string; version: number; canAdmin: boolean; drawing: LocationList['drawing']; onOpen: (target: LocationsTarget) => void; onChanged: () => void }) {
  const [card, setCard] = useState<LocationCardData | null>(null)
  useEffect(() => {
    let current = true
    window.electronWarehouse!.locations.locationCard({ location }).then(result => { if (current) setCard(result) }).catch(error => toast.error(errorMessage(error)))
    return () => { current = false }
  }, [location, version])

  if (!card) return <Skeleton className="h-80 rounded-xl" />
  const place = card.location
  const shelf = isShelfPlace(place)

  async function remove() {
    try {
      const result = await window.electronWarehouse!.locations.deleteLocations({ locations: [place.id] })
      if (result.kept.length) { toast.error(result.kept[0].reason); return }
      toast.success(t(`${place.name} er slettet`, `${place.name} has been deleted`))
      onChanged()
      onOpen(place.rack ? { kind: 'rack', id: place.rack } : { kind: 'admin' })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  const occupancyText = shelf
    ? t(`${card.stock.length} materialer`, `${card.stock.length} materials`)
    : card.occupancy.capacity === null
      ? t(`${card.occupancy.used} paller`, `${card.occupancy.used} pallets`)
      : t(`${card.occupancy.used} af ${card.occupancy.capacity} pladser optaget`, `${card.occupancy.used} of ${card.occupancy.capacity} places used`)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{place.name}</h1>
        <Badge variant="secondary">{purposeLabel(place.purpose)}</Badge>
        <Badge variant="outline">{typeLabel(place.type)}</Badge>
        <span className="text-sm text-muted-foreground">{t(`Område ${place.area}`, `Area ${place.area}`)}</span>
        {!place.active && <Badge variant="outline" className="border-destructive/50 text-destructive">{t('Deaktiveret', 'Deactivated')}</Badge>}
        {place.rack && <button type="button" className="text-sm text-primary hover:underline" onClick={() => onOpen({ kind: 'rack', id: place.rack! })}>{t(`Reol ${place.rack}`, `Rack ${place.rack}`)}</button>}
        {(place.purpose === 'reserve' || place.purpose === 'pick') && <span className="ml-auto text-sm">{occupancyText}</span>}
        {canShowOnMap(place.id, drawing) && <Button size="sm" variant="outline" onClick={() => onOpen({ kind: 'map', id: place.id })}><MapTrifold size={16} /> {t('Vis på kort', 'Show on map')}</Button>}
        {canAdmin && (
          <Button size="sm" variant="ghost" className="text-destructive" disabled={card.pallets.length > 0 || card.stock.length > 0}
            title={card.pallets.length || card.stock.length ? t('Kun en tom placering kan slettes', 'Only an empty location can be deleted') : undefined}
            onClick={() => void remove()}><Trash size={14} /> {t('Slet', 'Delete')}</Button>
        )}
      </div>
      {place.note && <p className="text-sm text-muted-foreground">{place.note}</p>}

      {card.fixed.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{place.purpose === 'reserve' ? t('Fast plads for', 'Fixed place for') : t('Materialer', 'Materials')}</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {card.fixed.map(item => (
              <div key={item.material} className="flex flex-wrap items-center gap-2 text-sm">
                <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen({ kind: 'material', id: item.material })}>{materialLabel(item.material, item.description)}</button>
                {place.purpose === 'pick' && <Button size="sm" variant="outline" onClick={() => onOpen({ kind: 'refill', id: `${place.id}|${item.material}` })}>{t('Fyld op', 'Refill')}</Button>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {shelf && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{t('På hylden', 'On the shelf')}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => onOpen({ kind: 'shelf', id: place.name })}>{t('Læg på hylde', 'Put on shelf')}</Button>
          </CardHeader>
          <CardContent><ShelfLines shelf={place.name} lines={card.stock} onOpen={onOpen} onChanged={onChanged} /></CardContent>
        </Card>
      )}

      {((place.purpose === 'reserve' && !shelf) || card.pallets.length > 0) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t('Paller', 'Pallets')}</CardTitle></CardHeader>
          <CardContent>
            {!card.pallets.length && <p className="text-sm text-muted-foreground">{t('Pladsen er tom.', 'The place is empty.')}</p>}
            <div className="divide-y">
              {card.pallets.map(pallet => (
                <button key={pallet.id} type="button" onClick={() => onOpen({ kind: 'pallet', id: pallet.id })} className="flex w-full flex-wrap items-center gap-3 px-1 py-2 text-left text-sm hover:bg-secondary">
                  <span className="min-w-0 flex-1 truncate">{materialLabel(pallet.material, pallet.description)}</span>
                  <span>{pallet.quantity === null ? '' : formatNumber(pallet.quantity)}</span>
                  <span className="text-muted-foreground">{formatDate(pallet.receivedAt)} · {formatAge(pallet.ageDays)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{pallet.sloc}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t('Historik', 'History')}</CardTitle></CardHeader>
        <CardContent><HistoryList events={card.history} /></CardContent>
      </Card>
    </div>
  )
}
