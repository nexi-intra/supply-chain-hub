import { useEffect, useState } from 'react'
import { HandGrabbing, MagnifyingGlass, MapPin, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { elsewhereNote, elsewhereReasonLabel, formatAge, formatDate, type LocationsTarget } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { MaterialCard } from '@/types/warehouse'
import { MaterialPicker } from './MaterialPicker'

/**
 * "Hvor henter jeg?": type (or scan) a material number – suggestions with SAP's description appear as you type – and
 * see where to fetch it: its pick place(s), the reserve pallets oldest first, and below them the pallets outside FIFO.
 */
export function FetchGuide({ material: initial, version, onOpen }: { material?: string; version: number; onOpen: (target: LocationsTarget) => void }) {
  const [query, setQuery] = useState(initial || '')
  const [material, setMaterial] = useState<string | null>(initial ? initial.toUpperCase() : null)
  const [card, setCard] = useState<MaterialCard | null>(null)
  const bridge = window.electronWarehouse!.locations

  useEffect(() => {
    if (!material) { setCard(null); return }
    let current = true
    bridge.materialCard({ material }).then(result => { if (current) setCard(result) }).catch(error => toast.error(errorMessage(error)))
    return () => { current = false }
  }, [bridge, material, version])

  function choose(code: string) {
    setMaterial(code)
    setQuery(code)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('Hvor henter jeg?', 'Where do I fetch it?')}</h1>
        <p className="text-sm text-muted-foreground">{t('Skriv eller scan materialenummeret (eller en del af beskrivelsen), så ser du, hvor du henter det.', 'Type or scan the material number (or part of the description) to see where to fetch it.')}</p>
      </div>

      <MaterialPicker value={query} chosen={material} listId="fetch-suggestions" label={t('Materialenummer', 'Material number')} autoFocus
        placeholder={t('Materialenummer, fx R162-0717', 'Material number, e.g. R162-0717')} className="h-12 pl-10 text-base"
        icon={<MagnifyingGlass size={20} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" />}
        onValueChange={value => { setQuery(value); setMaterial(null) }} onChoose={choose} />

      {material && !card && <Skeleton className="h-48 rounded-xl" />}
      {card && (
        <Card>
          <CardContent className="space-y-4 py-4">
            <div>
              <h2 className="font-mono text-xl font-semibold">{card.material}</h2>
              <p className="text-sm text-muted-foreground">{card.description || t('Ingen beskrivelse fra SAP endnu', 'No description from SAP yet')}</p>
            </div>

            {card.pickPlaces.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('Hent fra pluk-pladsen', 'Fetch from the pick place')}</p>
                <div className="flex flex-wrap gap-2">
                  {card.pickPlaces.map(place => (
                    <button key={place.id} type="button" onClick={() => onOpen({ kind: 'location', id: place.id })}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-mono text-lg font-semibold text-primary-foreground hover:bg-primary/90">
                      <MapPin size={20} weight="fill" /> {place.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400"><Warning size={16} /> {t('Materialet har ingen pluk-plads – hent fra den ældste reservepalle.', 'The material has no pick place – fetch from the oldest reserve pallet.')}</p>
            )}

            {card.shelves.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('På hylder', 'On shelves')}</p>
                <div className="flex flex-wrap gap-2">
                  {card.shelves.map(shelf => (
                    <button key={shelf.location} type="button" onClick={() => onOpen({ kind: 'location', id: shelf.location })} className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary">
                      <span className="font-mono font-semibold">{shelf.name}</span> · {t(`${formatNumber(shelf.quantity)} stk.`, `${formatNumber(shelf.quantity)} pcs`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('Reservepaller – ældste først', 'Reserve pallets – oldest first')}</p>
              {!card.reserve.length && <p className="text-sm text-muted-foreground">{t('Der står ingen reservepaller med materialet.', 'There are no reserve pallets with the material.')}</p>}
              <div className="divide-y rounded-md border">
                {card.reserve.slice(0, 6).map((pallet, index) => (
                  <button key={pallet.id} type="button" onClick={() => onOpen({ kind: 'pallet', id: pallet.id })} className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary">
                    {index === 0 && <Badge>{t('Ældst', 'Oldest')}</Badge>}
                    <span className="w-20 font-mono font-semibold">{pallet.location}</span>
                    <span className="text-muted-foreground">{formatDate(pallet.receivedAt)} · {formatAge(pallet.ageDays)}</span>
                    <span>{pallet.quantity === null ? '' : t(`${formatNumber(pallet.quantity)} stk.`, `${formatNumber(pallet.quantity)} pcs`)}</span>
                  </button>
                ))}
              </div>
              {card.reserve.length > 6 && <p className="text-xs text-muted-foreground">{t(`og ${card.reserve.length - 6} paller mere`, `and ${card.reserve.length - 6} more pallets`)}</p>}
            </div>

            {card.elsewhere.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('Andre paller (ikke i FIFO)', 'Other pallets (not in FIFO)')}</p>
                <p className="text-xs text-muted-foreground">{elsewhereNote()}</p>
                <div className="divide-y rounded-md border">
                  {card.elsewhere.slice(0, 6).map(pallet => (
                    <button key={pallet.id} type="button" onClick={() => onOpen({ kind: 'pallet', id: pallet.id })} className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary">
                      <span className="w-20 font-mono font-semibold">{pallet.location}</span>
                      <Badge variant="secondary">{elsewhereReasonLabel(pallet.reason)}</Badge>
                      <span className="text-muted-foreground">{formatDate(pallet.receivedAt)} · {formatAge(pallet.ageDays)}</span>
                      <span>{pallet.quantity === null ? '' : t(`${formatNumber(pallet.quantity)} stk.`, `${formatNumber(pallet.quantity)} pcs`)}</span>
                    </button>
                  ))}
                </div>
                {card.elsewhere.length > 6 && <p className="text-xs text-muted-foreground">{t(`og ${card.elsewhere.length - 6} paller mere`, `and ${card.elsewhere.length - 6} more pallets`)}</p>}
              </div>
            )}

            {(card.reserve.length > 0 || card.elsewhere.length > 0 || card.shelves.length > 0) && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => onOpen({ kind: 'take', id: card.material })}><HandGrabbing size={16} /> {t('Tag', 'Take')}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
