import { useEffect, useState } from 'react'
import { HandGrabbing } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { formatAge, formatDate, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { MaterialCard as MaterialCardData } from '@/types/warehouse'
import { HistoryList } from './HistoryList'

/** Everything about one material: station, pick places with status, reserve pallets oldest first, total. */
export function MaterialCard({ material, version, onOpen }: { material: string; version: number; onOpen: (target: LocationsTarget) => void }) {
  const [card, setCard] = useState<MaterialCardData | null>(null)
  useEffect(() => {
    let current = true
    window.electronWarehouse!.locations.materialCard({ material }).then(result => { if (current) setCard(result) }).catch(error => toast.error(errorMessage(error)))
    return () => { current = false }
  }, [material, version])

  if (!card) return <Skeleton className="h-80 rounded-xl" />
  const place = (id: string) => <button type="button" className="font-mono font-semibold hover:underline" onClick={() => onOpen({ kind: 'location', id })}>{id}</button>

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{card.material}</h1>
          <p className="text-muted-foreground">{card.description || t('Ingen beskrivelse fra SAP endnu', 'No description from SAP yet')}</p>
        </div>
        <Button onClick={() => onOpen({ kind: 'take', id: card.material })} disabled={!card.reserve.length && !card.shelves.length}><HandGrabbing size={16} /> {t('Tag', 'Take')}</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t('Arbejdsstation', 'Work station')}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">{card.stations.length ? card.stations.map(station => <div key={station.id}>{place(station.id)}</div>) : <span className="text-muted-foreground">–</span>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t('Pluk-plads', 'Pick place')}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {card.pickPlaces.length ? card.pickPlaces.map(pick => (
              <div key={pick.id} className="flex items-center gap-2">
                {place(pick.id)}
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onOpen({ kind: 'refill', id: `${pick.id}|${card.material}` })}>{t('Fyld op', 'Refill')}</Button>
              </div>
            )) : <span className="text-muted-foreground">–</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t('På lager', 'In stock')}</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="text-2xl font-semibold">{formatNumber(card.total)}</p>
            <p className="text-xs text-muted-foreground">{t(`på ${card.reserve.length} reservepaller og ${card.shelves.length} hylder`, `on ${card.reserve.length} reserve pallets and ${card.shelves.length} shelves`)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t('Reservepaller – ældste først', 'Reserve pallets – oldest first')}</CardTitle></CardHeader>
        <CardContent>
          {!card.reserve.length && <p className="text-sm text-muted-foreground">{t('Ingen reservepaller.', 'No reserve pallets.')}</p>}
          <div className="divide-y">
            {card.reserve.map(pallet => (
              <button key={pallet.id} type="button" onClick={() => onOpen({ kind: 'pallet', id: pallet.id })} className="flex w-full flex-wrap items-center gap-3 px-1 py-2 text-left text-sm hover:bg-secondary">
                <span className="w-20 font-mono font-semibold">{pallet.location}</span>
                <span className="text-muted-foreground">{formatDate(pallet.receivedAt)} · {formatAge(pallet.ageDays)}</span>
                <span>{pallet.quantity === null ? '' : formatNumber(pallet.quantity)}</span>
                <span className="font-mono text-xs text-muted-foreground">{pallet.sloc}</span>
                {pallet.tags.map(tag => <Badge key={tag} variant="outline">{tag}</Badge>)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {card.shelves.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t('På hylder', 'On shelves')}</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {card.shelves.map(shelf => (
              <button key={shelf.location} type="button" onClick={() => onOpen({ kind: 'location', id: shelf.location })} className="flex w-full items-center gap-3 px-1 py-2 text-left text-sm hover:bg-secondary">
                <span className="w-24 font-mono font-semibold">{shelf.name}</span>
                <span>{t(`${formatNumber(shelf.quantity)} stk.`, `${formatNumber(shelf.quantity)} pcs`)}</span>
              </button>
            ))}
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
