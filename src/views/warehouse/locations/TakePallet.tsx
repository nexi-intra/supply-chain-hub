import { useCallback, useEffect, useState } from 'react'
import { HandGrabbing, MagnifyingGlass } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { countedInCard, sendLocationAction, startLocationsRead, takeFromCard, takeFromCardShelf } from '@/lib/warehouse/locationActions'
import { formatAge, formatDate, materialLabel, newActionId } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { MaterialCard } from '@/types/warehouse'
import { CountPallet } from './CountPallet'
import { OlderPalletWarning } from './OlderPalletWarning'
import { youngerThanOldest } from './scanChoices'

type Reserve = MaterialCard['reserve'][number]

/** Take: the reserve pallets of a material, oldest first (taking a younger one asks once), and the material on shelves. */
export function TakePallet({ material: initial, version, onDone }: { material?: string; version: number; onDone: () => void }) {
  const [query, setQuery] = useState(initial || '')
  const [card, setCard] = useState<MaterialCard | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<{ pallet: Reserve; quantity?: number } | null>(null)
  const [shelfAmounts, setShelfAmounts] = useState<Record<string, string>>({})
  const bridge = window.electronWarehouse!.locations

  // The card shows a take at once; M: gets it in the background (15-40 s) and the card is read again when it is done.
  function takeFromShelf(shelf: MaterialCard['shelves'][number], quantity?: number) {
    if (!card) return
    const material = card.material
    setCard(value => (value ? takeFromCardShelf(value, shelf.location, quantity) : value))
    setShelfAmounts(value => ({ ...value, [shelf.location]: '' }))
    void sendLocationAction(() => bridge.shelfTake({ actionId: newActionId(), label: t(`Tag ${material} fra ${shelf.name}`, `Take ${material} from ${shelf.name}`), location: shelf.location, material, quantity }), {
      success: t(`${formatNumber(quantity ?? shelf.quantity)} stk. taget fra ${shelf.name}`, `${formatNumber(quantity ?? shelf.quantity)} pcs taken from ${shelf.name}`),
      settled: onDone,
    })
  }

  /** `refresh`: a re-read after a change, which must not put back what a take on its way has already removed. */
  const load = useCallback(async (material: string, refresh = false) => {
    if (!material.trim()) return
    const fresh = startLocationsRead()
    try {
      const next = await bridge.materialCard({ material: material.trim() })
      setCard(value => (refresh && value && !fresh() ? value : next))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [bridge])
  useEffect(() => { if (card || initial) void load(card?.material || initial || '', true) }, [version]) // eslint-disable-line react-hooks/exhaustive-deps

  function take(pallet: Reserve, quantity?: number, sure = false) {
    if (!sure && card && youngerThanOldest(card.reserve, pallet)) { setConfirm({ pallet, quantity }); return }
    setConfirm(null)
    const whole = quantity === undefined || (pallet.quantity !== null && quantity >= pallet.quantity)
    setCard(value => (value ? takeFromCard(value, pallet.id, quantity) : value))
    setAmounts(value => ({ ...value, [pallet.id]: '' }))
    const partText = pallet.quantity === null
      ? t(`${formatNumber(quantity ?? 0)} stk. taget fra ${pallet.location} (pallen bliver stående)`, `${formatNumber(quantity ?? 0)} taken from ${pallet.location} (the pallet stays)`)
      : t(`${formatNumber(quantity ?? 0)} stk. taget fra ${pallet.location}`, `${formatNumber(quantity ?? 0)} taken from ${pallet.location}`)
    void sendLocationAction(() => bridge.take({ actionId: newActionId(), label: t(`Tag ${pallet.material} fra ${pallet.location}`, `Take ${pallet.material} from ${pallet.location}`), pallet: pallet.id, quantity }), {
      success: whole ? t(`Pallen på ${pallet.location} er taget`, `The pallet on ${pallet.location} has been taken`) : partText,
      settled: onDone,
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('Tag', 'Take')}</h1>
        <p className="text-sm text-muted-foreground">{t('Søg eller scan materialet. Pallerne står med den ældste først – tag den, så kører vi FIFO. Under dem står materialet på hylder.', 'Search or scan the material. The pallets are listed oldest first – take that one and we run FIFO. Below them, the material on shelves.')}</p>
      </div>
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void load(query) }}>
        <Input autoFocus value={query} onChange={event => setQuery(event.target.value.toUpperCase())} placeholder="R162-0717" className="h-11 font-mono" aria-label={t('Materiale', 'Material')} />
        <Button type="submit" size="lg"><MagnifyingGlass size={18} /> {t('Find', 'Find')}</Button>
      </form>

      {card && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-lg font-semibold">{materialLabel(card.material, card.description)}</h2>
              <span className="text-sm text-muted-foreground">{t(`${card.reserve.length} paller · ${formatNumber(card.total)} stk.`, `${card.reserve.length} pallets · ${formatNumber(card.total)} pcs`)}</span>
            </div>
            {!card.reserve.length && <p className="text-sm text-muted-foreground">{t('Der står ingen reservepaller med materialet.', 'There are no reserve pallets with the material.')}</p>}
            {card.shelves.length > 0 && (
              <section aria-label={t('På hylder', 'On shelves')} className="space-y-1.5">
                <h3 className="text-sm font-medium">{t('På hylder', 'On shelves')}</h3>
                <div className="divide-y rounded-md border">
                  {card.shelves.map(shelf => (
                    <div key={shelf.location} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm" data-shelf={shelf.name}>
                      <span className="font-mono font-semibold">{shelf.name}</span>
                      <span>{t(`${formatNumber(shelf.quantity)} stk.`, `${formatNumber(shelf.quantity)} pcs`)}</span>
                      <span className="ml-auto flex items-center gap-2">
                        <Input inputMode="numeric" value={shelfAmounts[shelf.location] || ''} placeholder={t('stk.', 'pcs')} className="h-9 w-20" aria-label={t('Antal at tage fra hylden', 'Quantity to take from the shelf')}
                          onChange={event => setShelfAmounts(value => ({ ...value, [shelf.location]: event.target.value.replace(/\D/g, '') }))} />
                        <Button size="sm" variant="outline" disabled={!shelfAmounts[shelf.location] || Number(shelfAmounts[shelf.location]) > shelf.quantity} onClick={() => takeFromShelf(shelf, Number(shelfAmounts[shelf.location]))}>{t(`Tag ${shelfAmounts[shelf.location] || 'X'} stk.`, `Take ${shelfAmounts[shelf.location] || 'X'}`)}</Button>
                        <Button size="sm" variant="ghost" onClick={() => takeFromShelf(shelf, shelf.quantity)}>{t('Tag alt', 'Take all')}</Button>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="divide-y rounded-md border">
              {card.reserve.map((pallet, index) => (
                <div key={pallet.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  {index === 0 && <Badge>{t('Ældst', 'Oldest')}</Badge>}
                  <span className="w-20 font-mono font-semibold">{pallet.location}</span>
                  <span className="text-muted-foreground">{formatAge(pallet.ageDays)} · {formatDate(pallet.receivedAt)}</span>
                  <span>{pallet.quantity === null ? t('antal ukendt', 'quantity unknown') : t(`${formatNumber(pallet.quantity)} stk.`, `${formatNumber(pallet.quantity)} pcs`)}</span>
                  {pallet.document && <span className="font-mono text-xs text-muted-foreground">{pallet.document}</span>}
                  <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {pallet.quantity === null && <span className="text-xs text-muted-foreground">{t('stk. taget (pallen bliver stående)', 'pcs taken (the pallet stays)')}</span>}
                    <Input inputMode="numeric" value={amounts[pallet.id] || ''} placeholder={t('stk.', 'pcs')} className="h-9 w-20" aria-label={pallet.quantity === null ? t('stk. taget (pallen bliver stående)', 'pcs taken (the pallet stays)') : t('Antal at tage', 'Quantity to take')}
                      onChange={event => setAmounts(value => ({ ...value, [pallet.id]: event.target.value.replace(/\D/g, '') }))} />
                    <Button size="sm" variant="outline" disabled={!amounts[pallet.id]} onClick={() => take(pallet, Number(amounts[pallet.id]))}>{t(`Tag ${amounts[pallet.id] || 'X'} stk.`, `Take ${amounts[pallet.id] || 'X'}`)}</Button>
                    <Button size="sm" onClick={() => take(pallet)}><HandGrabbing size={16} /> {t('Tag hele pallen', 'Take the whole pallet')}</Button>
                    {pallet.quantity === null && <CountPallet pallet={pallet} onCounted={quantity => setCard(value => (value ? countedInCard(value, pallet.id, quantity) : value))} onDone={onDone} />}
                  </span>
                  {confirm?.pallet.id === pallet.id && (
                    <OlderPalletWarning oldest={card.reserve[0]} confirmLabel={t('Tag alligevel', 'Take anyway')} onCancel={() => setConfirm(null)} onConfirm={() => take(confirm.pallet, confirm.quantity, true)} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

