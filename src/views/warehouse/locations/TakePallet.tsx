import { useCallback, useEffect, useState } from 'react'
import { HandGrabbing, MagnifyingGlass, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { deferredText, formatAge, formatDate, isDeferred, materialLabel, newActionId } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { MaterialCard } from '@/types/warehouse'

type Reserve = MaterialCard['reserve'][number]

/** Take: the reserve pallets of a material, oldest first (taking a younger one asks once), and the material on shelves. */
export function TakePallet({ material: initial, version, onDone }: { material?: string; version: number; onDone: () => void }) {
  const [query, setQuery] = useState(initial || '')
  const [card, setCard] = useState<MaterialCard | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<{ pallet: Reserve; quantity?: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [shelfAmounts, setShelfAmounts] = useState<Record<string, string>>({})
  const bridge = window.electronWarehouse!.locations

  async function takeFromShelf(shelf: MaterialCard['shelves'][number], quantity?: number, all = false) {
    if (!card) return
    setBusy(all ? `${shelf.location}:all` : shelf.location)
    try {
      const result = await bridge.shelfTake({ actionId: newActionId(), label: t(`Tag ${card.material} fra ${shelf.name}`, `Take ${card.material} from ${shelf.name}`), location: shelf.location, material: card.material, quantity })
      if (isDeferred(result)) toast.warning(deferredText(result))
      else toast.success(t(`${formatNumber(result.taken)} stk. taget fra ${shelf.name}`, `${formatNumber(result.taken)} pcs taken from ${shelf.name}`))
      setShelfAmounts(value => ({ ...value, [shelf.location]: '' }))
      await load(card.material)
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const load = useCallback(async (material: string) => {
    if (!material.trim()) return
    try {
      setCard(await bridge.materialCard({ material: material.trim() }))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [bridge])
  useEffect(() => { if (card || initial) void load(card?.material || initial || '') }, [version]) // eslint-disable-line react-hooks/exhaustive-deps

  async function take(pallet: Reserve, quantity?: number, sure = false) {
    const oldest = card?.reserve[0]
    if (!sure && oldest && oldest.id !== pallet.id && oldest.receivedAt < pallet.receivedAt) { setConfirm({ pallet, quantity }); return }
    setConfirm(null)
    setBusy(quantity === undefined ? pallet.id : `${pallet.id}:part`)
    try {
      const result = await bridge.take({ actionId: newActionId(), label: t(`Tag ${pallet.material} fra ${pallet.location}`, `Take ${pallet.material} from ${pallet.location}`), pallet: pallet.id, quantity })
      if (isDeferred(result)) toast.warning(deferredText(result))
      else toast.success(result.pallet ? t(`${formatNumber(quantity ?? 0)} stk. taget fra ${pallet.location}`, `${formatNumber(quantity ?? 0)} taken from ${pallet.location}`) : t(`Pallen på ${pallet.location} er taget`, `The pallet on ${pallet.location} has been taken`))
      setAmounts(value => ({ ...value, [pallet.id]: '' }))
      await load(pallet.material)
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
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
                        <Button size="sm" variant="outline" disabled={!shelfAmounts[shelf.location] || busy !== null} loading={busy === shelf.location} onClick={() => void takeFromShelf(shelf, Number(shelfAmounts[shelf.location]))}>{t(`Tag ${shelfAmounts[shelf.location] || 'X'} stk.`, `Take ${shelfAmounts[shelf.location] || 'X'}`)}</Button>
                        <Button size="sm" variant="ghost" disabled={busy !== null} loading={busy === `${shelf.location}:all`} onClick={() => void takeFromShelf(shelf, shelf.quantity, true)}>{t('Tag alt', 'Take all')}</Button>
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
                  <span className="ml-auto flex items-center gap-2">
                    <Input inputMode="numeric" value={amounts[pallet.id] || ''} placeholder={t('stk.', 'pcs')} className="h-9 w-20" aria-label={t('Antal at tage', 'Quantity to take')}
                      onChange={event => setAmounts(value => ({ ...value, [pallet.id]: event.target.value.replace(/\D/g, '') }))} />
                    <Button size="sm" variant="outline" disabled={!amounts[pallet.id] || busy !== null} loading={busy === `${pallet.id}:part`} onClick={() => void take(pallet, Number(amounts[pallet.id]))}>{t(`Tag ${amounts[pallet.id] || 'X'} stk.`, `Take ${amounts[pallet.id] || 'X'}`)}</Button>
                    <Button size="sm" disabled={busy !== null} loading={busy === pallet.id} onClick={() => void take(pallet)}><HandGrabbing size={16} /> {t('Tag hele pallen', 'Take the whole pallet')}</Button>
                  </span>
                  {confirm?.pallet.id === pallet.id && (
                    <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                      <Warning size={16} className="text-amber-600" />
                      <span className="flex-1">{t(`Der står en ældre palle på ${card.reserve[0].location} (${formatAge(card.reserve[0].ageDays)}).`, `There is an older pallet on ${card.reserve[0].location} (${formatAge(card.reserve[0].ageDays)}).`)}</span>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>{t('Annullér', 'Cancel')}</Button>
                      <Button size="sm" variant="outline" onClick={() => void take(confirm.pallet, confirm.quantity, true)}>{t('Tag alligevel', 'Take anyway')}</Button>
                    </div>
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

