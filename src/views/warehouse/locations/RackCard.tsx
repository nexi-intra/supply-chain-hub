import { useEffect, useState } from 'react'
import { MapTrifold } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { canShowOnMap } from '@/lib/warehouse/layout/map'
import { materialLabel, purposeLabel, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationList, RackCard as RackCardData } from '@/types/warehouse'
import { HistoryList } from './HistoryList'
import { RackAdmin } from './RackAdmin'

/** A rack: its shelves from the top down with what stands on each; admins add, remove and delete shelves. */
export function RackCard({ rack, version, canAdmin, drawn, drawing, onOpen, onChanged }: { rack: string; version: number; canAdmin: boolean; drawn: boolean; drawing: LocationList['drawing']; onOpen: (target: LocationsTarget) => void; onChanged: () => void }) {
  const [card, setCard] = useState<RackCardData | null>(null)
  useEffect(() => {
    let current = true
    window.electronWarehouse!.locations.rackCard({ rack }).then(result => { if (current) setCard(result) }).catch(error => toast.error(errorMessage(error)))
    return () => { current = false }
  }, [rack, version])

  if (!card) return <Skeleton className="h-80 rounded-xl" />
  const onMap = card.shelves.find(({ location }) => canShowOnMap(location.id, drawing))?.location.id

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('Reol', 'Rack')} <span className="font-mono">{card.rack}</span></h1>
        <Badge variant="secondary">{card.purpose === 'reserve' ? t('Lager', 'Storage') : purposeLabel(card.purpose)}</Badge>
        <span className="text-sm text-muted-foreground">{t(`Område ${card.area} · ${card.shelves.length} hylder`, `Area ${card.area} · ${card.shelves.length} shelves`)}</span>
        {onMap && <Button size="sm" variant="outline" onClick={() => onOpen({ kind: 'map', id: onMap })}><MapTrifold size={16} /> {t('Vis på kort', 'Show on map')}</Button>}
        {canAdmin && <RackAdmin card={card} drawn={drawn} onOpen={onOpen} onChanged={onChanged} />}
      </div>

      <div className="space-y-2">
        {card.shelves.map(({ location, stock }) => (
          <Card key={location.id} className={location.active ? '' : 'opacity-60'}>
            <CardContent className="flex flex-wrap items-start gap-3 py-3">
              <button type="button" className="w-24 font-mono font-semibold hover:underline" onClick={() => onOpen({ kind: 'location', id: location.id })}>{location.name}</button>
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                {location.purpose === 'pick' && <span className="text-muted-foreground">{location.fixedMaterials.length ? location.fixedMaterials.join(', ') : t('Pluk – ingen materialer endnu', 'Pick – no materials yet')}</span>}
                {location.purpose !== 'pick' && !stock.length && <span className="text-muted-foreground">{t('Tom', 'Empty')}</span>}
                {stock.map(line => (
                  <div key={line.id} className="flex gap-3">
                    <span className="min-w-0 flex-1 truncate">{materialLabel(line.material, line.description)}</span>
                    <span className="tabular-nums">{t(`${formatNumber(line.quantity)} stk.`, `${formatNumber(line.quantity)} pcs`)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t('Historik', 'History')}</CardTitle></CardHeader>
        <CardContent><HistoryList events={card.history} /></CardContent>
      </Card>
    </div>
  )
}
