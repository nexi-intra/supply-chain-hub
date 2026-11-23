import { useEffect, useMemo, useState } from 'react'
import { ArrowsClockwise, MagnifyingGlass, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { countedInCard, sendLocationAction, startLocationsRead, takeFromCard, takeFromCardShelf } from '@/lib/warehouse/locationActions'
import { formatAge, materialLabel, newActionId } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { Location, MaterialCard } from '@/types/warehouse'
import { CountPallet } from './CountPallet'

/** Refill a pick place: choose the place (and its material), and fetch from the oldest reserve pallet (FIFO). */
export function Refill({ id, version, onDone }: { id?: string; version: number; onDone: () => void }) {
  const [initialPlace, initialMaterial] = (id || '').split('|')
  const [places, setPlaces] = useState<Location[] | null>(null)
  const [filter, setFilter] = useState('')
  const [place, setPlace] = useState<string | null>(initialPlace || null)
  const [material, setMaterial] = useState<string | null>(initialMaterial || null)
  const [card, setCard] = useState<MaterialCard | null>(null)
  const [quantity, setQuantity] = useState('')
  const bridge = window.electronWarehouse!.locations

  useEffect(() => {
    let current = true
    bridge.list().then(result => { if (current) setPlaces(result.locations.filter(location => location.purpose === 'pick' && location.active)) }).catch(error => toast.error(errorMessage(error)))
    return () => { current = false }
  }, [bridge, version])

  const selected = places?.find(location => location.id === place) || null
  // A place with one material needs no choice.
  const chosen = selected ? (selected.fixedMaterials.includes(material || '') ? material : selected.fixedMaterials.length === 1 ? selected.fixedMaterials[0] : null) : null
  const shown = useMemo(() => {
    const query = filter.trim().toUpperCase()
    return (places || []).filter(location => !query || location.id.includes(query) || location.fixedMaterials.some(code => code.includes(query)))
  }, [places, filter])

  // A re-read during a refill on its way to M: is older than the card, which already shows the refill.
  useEffect(() => {
    if (!chosen) { setCard(null); return }
    let current = true
    const fresh = startLocationsRead()
    bridge.materialCard({ material: chosen }).then(result => { if (current) setCard(value => (value?.material === result.material && !fresh() ? value : result)) }).catch(error => toast.error(errorMessage(error)))
    return () => { current = false }
  }, [bridge, chosen, version])

  // Shown at once; M: gets it in the background (15-40 s) and the card is read again when it is done.
  function refillFromShelf(shelf: MaterialCard['shelves'][number]) {
    if (!selected || !chosen || !quantity.trim()) return
    const amount = Number(quantity)
    setCard(value => (value ? takeFromCardShelf(value, shelf.location, amount) : value))
    setQuantity('')
    void sendLocationAction(() => bridge.refill({ actionId: newActionId(), label: t(`Fyld ${selected.name} op fra ${shelf.name}`, `Refill ${selected.name} from ${shelf.name}`), location: selected.id, shelf: shelf.location, material: chosen, quantity: amount }), {
      success: t(`${selected.name} er fyldt op fra ${shelf.name}`, `${selected.name} has been refilled from ${shelf.name}`),
      settled: onDone,
    })
  }

  function refill(pallet: MaterialCard['reserve'][number]) {
    if (!selected) return
    const amount = quantity.trim() ? Number(quantity) : undefined
    setCard(value => (value ? takeFromCard(value, pallet.id, amount) : value))
    setQuantity('')
    void sendLocationAction(() => bridge.refill({ actionId: newActionId(), label: t(`Fyld ${selected.name} op fra ${pallet.location}`, `Refill ${selected.name} from ${pallet.location}`), location: selected.id, pallet: pallet.id, quantity: amount }), {
      success: amount !== undefined && pallet.quantity === null
        ? t(`${selected.name} er fyldt op fra ${pallet.location} (pallen bliver stående)`, `${selected.name} has been refilled from ${pallet.location} (the pallet stays)`)
        : t(`${selected.name} er fyldt op fra ${pallet.location}`, `${selected.name} has been refilled from ${pallet.location}`),
      settled: onDone,
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('Fyld pluk-plads op', 'Refill a pick place')}</h1>
        <p className="text-sm text-muted-foreground">{t('Når en kasse ved arbejdsstationen er tom: vælg pluk-pladsen, så foreslår Hubben den ældste reservepalle med materialet.', 'When a box at the work station is empty: choose the pick place and the Hub suggests the oldest reserve pallet with the material.')}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t('Pluk-pladser', 'Pick places')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={filter} onChange={event => setFilter(event.target.value)} placeholder={t('Søg eller scan plads eller materiale', 'Search or scan place or material')} className="pl-8" aria-label={t('Søg pluk-plads', 'Search pick place')}
                onKeyDown={event => { if (event.key === 'Enter' && shown.length === 1) { setPlace(shown[0].id); setMaterial(null) } }} />
            </div>
            {places && !places.length && <p className="text-sm text-muted-foreground">{t('Der er ingen pluk-pladser endnu.', 'There are no pick places yet.')}</p>}
            <div className="max-h-[28rem] space-y-0.5 overflow-y-auto">
              {shown.map(location => (
                <button key={location.id} type="button" onClick={() => { setPlace(location.id); setMaterial(null) }}
                  className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm', place === location.id ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-secondary')}>
                  <span className="w-16 font-mono font-semibold">{location.name}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{location.fixedMaterials.join(', ')}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          {!selected && <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t('Vælg en pluk-plads til venstre.', 'Choose a pick place on the left.')}</p>}
          {selected && selected.fixedMaterials.length > 1 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Materiale', 'Material')}>
              <span className="text-sm text-muted-foreground">{t('Hvilket materiale?', 'Which material?')}</span>
              {selected.fixedMaterials.map(code => (
                <button key={code} type="button" aria-pressed={chosen === code} onClick={() => setMaterial(code)}
                  className={cn('rounded-md border px-2.5 py-1 font-mono text-xs', chosen === code ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}>{code}</button>
              ))}
            </div>
          )}
          {selected && card && chosen && (
            <Card>
              <CardContent className="space-y-3 py-4">
                <h2 className="text-lg font-semibold"><span className="font-mono">{selected.name}</span> · {materialLabel(card.material, card.description)}</h2>
                {!card.reserve.length && !card.shelves.length && <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400"><Warning size={16} /> {t('Der står ingen reservepaller med materialet.', 'There are no reserve pallets with the material.')}</p>}
                {!card.reserve.length && card.shelves.length > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <Input inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} className="w-36" aria-label={t('Antal taget fra hylden', 'Quantity taken from the shelf')} />
                      <span className="text-xs text-muted-foreground">{t('Ingen reservepalle – fyld op fra en hylde', 'No reserve pallet – refill from a shelf')}</span>
                    </div>
                    <div className="divide-y rounded-md border">
                      {card.shelves.map(shelf => (
                        <div key={shelf.location} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                          {shelf.location === card.refillShelf && <Badge>{t('Forslag', 'Suggested')}</Badge>}
                          <span className="font-mono font-semibold">{shelf.name}</span>
                          <span>{t(`${formatNumber(shelf.quantity)} stk.`, `${formatNumber(shelf.quantity)} pcs`)}</span>
                          <Button size="sm" className="ml-auto" variant={shelf.location === card.refillShelf ? 'default' : 'outline'} disabled={!quantity.trim() || Number(quantity) > shelf.quantity} onClick={() => refillFromShelf(shelf)}>
                            <ArrowsClockwise size={16} /> {t(`Fyldt op fra ${shelf.name}`, `Refilled from ${shelf.name}`)}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {card.reserve.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} placeholder={t('Hele pallen', 'Whole pallet')} className="w-36"
                        aria-label={card.reserve[0].quantity === null ? t('stk. taget (pallen bliver stående)', 'pcs taken (the pallet stays)') : t('Antal taget fra pallen', 'Quantity taken from the pallet')} />
                      <span className="text-xs text-muted-foreground">{t('Tomt felt = hele pallen er brugt', 'Empty = the whole pallet was used')}</span>
                      {card.reserve.some(pallet => pallet.quantity === null) && <span className="text-xs text-muted-foreground">{t('Ved antal ukendt: stk. taget (pallen bliver stående)', 'Quantity unknown: pcs taken (the pallet stays)')}</span>}
                    </div>
                    <div className="divide-y rounded-md border">
                      {card.reserve.map((pallet, index) => (
                        <div key={pallet.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                          {index === 0 && <Badge>{t('Forslag', 'Suggested')}</Badge>}
                          <span className="font-mono font-semibold">{pallet.location}</span>
                          <span className="text-muted-foreground">{formatAge(pallet.ageDays)}</span>
                          <span>{pallet.quantity === null ? t('antal ukendt', 'quantity unknown') : t(`${formatNumber(pallet.quantity)} stk.`, `${formatNumber(pallet.quantity)} pcs`)}</span>
                          {pallet.quantity === null && quantity.trim() && <span className="text-xs text-muted-foreground">{t(`${formatNumber(Number(quantity))} stk. taget (pallen bliver stående)`, `${formatNumber(Number(quantity))} pcs taken (the pallet stays)`)}</span>}
                          <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                            {pallet.quantity === null && <CountPallet pallet={pallet} onCounted={count => setCard(value => (value ? countedInCard(value, pallet.id, count) : value))} onDone={onDone} />}
                            <Button size="sm" variant={index === 0 ? 'default' : 'outline'} onClick={() => refill(pallet)}>
                              <ArrowsClockwise size={16} /> {t(`Fyldt op fra ${pallet.location}`, `Refilled from ${pallet.location}`)}
                            </Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
