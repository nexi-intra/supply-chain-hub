import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowsLeftRight, CheckCircle, MagnifyingGlass, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { errorCode, errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { deferredText, formatAge, isDeferred, isShelfPlace, locationKeyOf, materialLabel, newActionId, palletLimitOf, reasonLabel, shownQuantity, singleFlight } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationList, PalletView, SlotSuggestion, StockLineView } from '@/types/warehouse'

/**
 * "Flyt": move pallets around the warehouse – find what to move (a place, a material or a 49/50 number), pick the
 * pallet, then where to, with the Hub's free places as suggestions. Scanning a lagerhylde moves goods from it to
 * another shelf instead (a line, a quantity, the new shelf). Ready for the next at once.
 */
export function MovePallet({ pallet: initialPallet, version, onDone }: { pallet?: string; version: number; onDone: () => void }) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<PalletView[] | null>(null)
  const [pallet, setPallet] = useState<PalletView | null>(null)
  const [target, setTarget] = useState('')
  const [slots, setSlots] = useState<SlotSuggestion[]>([])
  const [places, setPlaces] = useState<Record<string, LocationList['locations'][number]>>({})
  const [busy, setBusy] = useState(false)
  const [moved, setMoved] = useState<string | null>(null)
  // A lagerhylde scanned: its lines, the chosen line, how many, and the new shelf.
  const [shelf, setShelf] = useState<{ name: string; lines: StockLineView[] } | null>(null)
  const [line, setLine] = useState<StockLineView | null>(null)
  const [amount, setAmount] = useState('')
  const once = useRef(singleFlight()).current
  const bridge = window.electronWarehouse!.locations

  // Every place (for the target check: reserved, pick place, full).
  useEffect(() => {
    let current = true
    bridge.list().then(result => { if (current) setPlaces(Object.fromEntries(result.locations.map(location => [location.id, location]))) }).catch(() => {})
    return () => { current = false }
  }, [bridge, version])

  // Opened from a pallet card: that pallet is chosen at once.
  useEffect(() => {
    if (!initialPallet) return
    bridge.palletCard({ pallet: initialPallet }).then(card => choose(card.pallet)).catch(error => toast.error(errorMessage(error)))
  }, [initialPallet]) // eslint-disable-line react-hooks/exhaustive-deps

  /** A place gives its pallets, a material its pallets oldest first, anything else the search's pallets (49/50 number, serial). */
  async function find(text: string) {
    const value = text.trim()
    if (!value) return
    setMoved(null)
    try {
      const found = await bridge.search({ query: value })
      const key = locationKeyOf(value)
      const place = found.locations.find(location => location.id === key)
      const material = found.materials.find(item => item.material === value.toUpperCase())
      setShelf(null)
      setLine(null)
      if (place && isShelfPlace(place)) {
        const card = await bridge.locationCard({ location: place.id })
        setCandidates(null)
        setPallet(null)
        setShelf({ name: place.name, lines: card.stock })
        setTarget('')
        if (card.stock.length === 1) setLine(card.stock[0])
        return
      }
      let list: PalletView[]
      if (place) list = (await bridge.locationCard({ location: place.id })).pallets
      else if (material) {
        const card = await bridge.materialCard({ material: material.material })
        list = card.reserve.map(item => ({ ...item, description: card.description }))
      } else list = found.pallets
      setCandidates(list)
      setPallet(null)
      if (list.length === 1) choose(list[0])
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  function choose(next: PalletView) {
    setPallet(next)
    setTarget('')
    setSlots([])
    bridge.suggest({ material: next.material }).then(result => setSlots(result.slots.filter(slot => slot.location !== next.location))).catch(() => {})
  }

  const targetPlace = places[locationKeyOf(target)] || null
  const full = (place: LocationList['locations'][number]) => place.purpose === 'reserve' && place.used >= palletLimitOf(place)
  const targetNote = !target.trim() ? null
    : !targetPlace ? t(`${target.trim().toUpperCase()} findes ikke`, `${target.trim().toUpperCase()} does not exist`)
    : targetPlace.id === pallet?.location ? t('Pallen står der allerede', 'The pallet is already there')
    : targetPlace.purpose === 'reserved' || targetPlace.purpose === 'station' ? t(`${targetPlace.name} kan ikke tage paller`, `${targetPlace.name} cannot take pallets`)
    : !targetPlace.active ? t(`${targetPlace.name} er deaktiveret`, `${targetPlace.name} is deactivated`)
    : isShelfPlace(targetPlace) ? t(`${targetPlace.name} er en hylde – brug Læg på hylde`, `${targetPlace.name} is a shelf – use Put on shelf`)
    : full(targetPlace) ? t(`${targetPlace.name} er fuld – vælg en anden plads`, `${targetPlace.name} is full – choose another place`)
    : targetPlace.purpose === 'pick' ? t(`${targetPlace.name} er en pluk-plads – pallen bruges op der`, `${targetPlace.name} is a pick place – the pallet is used up there`)
    : null
  const blocked = !targetPlace || targetPlace.id === pallet?.location || targetPlace.purpose === 'reserved' || targetPlace.purpose === 'station' || !targetPlace.active || isShelfPlace(targetPlace) || full(targetPlace)

  // Moving goods between shelves: the new shelf must be another active lagerhylde.
  const shelfTarget = places[locationKeyOf(target)] || null
  const shelfNote = !shelf || !target.trim() ? null
    : !shelfTarget ? t(`${target.trim().toUpperCase()} findes ikke`, `${target.trim().toUpperCase()} does not exist`)
    : !isShelfPlace(shelfTarget) ? t(`${shelfTarget.name} er ikke en lagerhylde`, `${shelfTarget.name} is not a storage shelf`)
    : !shelfTarget.active ? t(`${shelfTarget.name} er deaktiveret`, `${shelfTarget.name} is deactivated`)
    : line && shelfTarget.id === line.location ? t('Varerne står der allerede', 'The goods are already there')
    : null
  const moveAmount = shownQuantity(amount, line?.quantity ?? 0)
  const shelfBlocked = !line || !shelfTarget || Boolean(shelfNote) || moveAmount < 1 || moveAmount > (line?.quantity ?? 0)

  const moveFromShelf = () => once(async () => {
    if (!shelf || !line || !shelfTarget || shelfBlocked) return
    setBusy(true)
    try {
      const result = await bridge.shelfMove({ actionId: newActionId(), label: t(`Flyt ${line.material} fra ${shelf.name} til ${shelfTarget.name}`, `Move ${line.material} from ${shelf.name} to ${shelfTarget.name}`), from: line.location, to: shelfTarget.id, material: line.material, quantity: moveAmount })
      if (isDeferred(result)) toast.warning(deferredText(result))
      else toast.success(t(`${formatNumber(moveAmount)} stk. flyttet fra ${shelf.name} til ${shelfTarget.name}`, `${formatNumber(moveAmount)} pcs moved from ${shelf.name} to ${shelfTarget.name}`))
      setMoved(`${materialLabel(line.material, line.description)}: ${shelf.name} → ${shelfTarget.name} (${formatNumber(moveAmount)})`)
      setShelf(null)
      setLine(null)
      setAmount('')
      setTarget('')
      setQuery('')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  })

  async function move() {
    if (!pallet || !targetPlace || blocked) return
    setBusy(true)
    try {
      const result = await bridge.move({ actionId: newActionId(), label: t(`Flyt ${pallet.material} fra ${pallet.location} til ${targetPlace.name}`, `Move ${pallet.material} from ${pallet.location} to ${targetPlace.name}`), pallet: pallet.id, to: targetPlace.id })
      if (isDeferred(result)) toast.warning(deferredText(result))
      else toast.success(t(`${pallet.material} er flyttet fra ${pallet.location} til ${targetPlace.name}`, `${pallet.material} moved from ${pallet.location} to ${targetPlace.name}`))
      setMoved(t(`${materialLabel(pallet.material, pallet.description)}: ${pallet.location} → ${targetPlace.name}`, `${materialLabel(pallet.material, pallet.description)}: ${pallet.location} → ${targetPlace.name}`))
      setPallet(null)
      setCandidates(null)
      setTarget('')
      setQuery('')
      onDone()
    } catch (error) {
      toast.error(errorCode(error) === 'LOCATION_FULL' ? t(`${targetPlace.name} er fuld – vælg en anden plads`, `${targetPlace.name} is full – choose another place`) : errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('Flyt', 'Move')}</h1>
        <p className="text-sm text-muted-foreground">{t('Find pallen, vælg hvortil, og flyt. Scanner du en hylde, flytter du varer derfra til en anden hylde. Alt kommer i historikken.', 'Find the pallet, choose where to, and move it. Scan a shelf to move goods from it to another shelf. Everything goes into the history.')}</p>
      </div>

      {moved && (
        <p className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm">
          <CheckCircle size={16} weight="fill" className="text-emerald-600" /> {t('Flyttet', 'Moved')}: {moved} – {t('klar til næste palle', 'ready for the next pallet')}
        </p>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t('1. Hvad skal flyttes?', '1. What is to be moved?')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void find(query) }}>
            <Input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Scan eller skriv placering, materiale eller 49/50-nummer', 'Scan or type location, material or 49/50 number')} className="h-11" aria-label={t('Hvad skal flyttes', 'What is to be moved')} />
            <Button type="submit" size="lg"><MagnifyingGlass size={18} /> {t('Find', 'Find')}</Button>
          </form>
          {candidates && !candidates.length && <p className="text-sm text-muted-foreground">{t('Ingen paller fundet.', 'No pallets found.')}</p>}
          {candidates && candidates.length > 0 && (
            <div className="divide-y rounded-md border" role="radiogroup" aria-label={t('Paller', 'Pallets')}>
              {candidates.map(item => (
                <button key={item.id} type="button" role="radio" aria-checked={pallet?.id === item.id} onClick={() => choose(item)}
                  className={cn('flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left text-sm', pallet?.id === item.id ? 'bg-primary/10' : 'hover:bg-secondary')}>
                  <span className="w-20 font-mono font-semibold">{item.location}</span>
                  <span className="min-w-0 flex-1 truncate">{materialLabel(item.material, item.description)}</span>
                  <span className="text-muted-foreground">{item.quantity === null ? '' : `${formatNumber(item.quantity)} · `}{formatAge(item.ageDays)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{item.sloc}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {shelf && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t(`Fra hylden ${shelf.name}`, `From the shelf ${shelf.name}`)}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!shelf.lines.length && <p className="text-sm text-muted-foreground">{t('Hylden er tom.', 'The shelf is empty.')}</p>}
            {shelf.lines.length > 0 && (
              <div className="divide-y rounded-md border" role="radiogroup" aria-label={t('Varer på hylden', 'Goods on the shelf')}>
                {shelf.lines.map(item => (
                  <button key={item.id} type="button" role="radio" aria-checked={line?.id === item.id} onClick={() => { setLine(item); setAmount('') }}
                    className={cn('flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left text-sm', line?.id === item.id ? 'bg-primary/10' : 'hover:bg-secondary')}>
                    <span className="min-w-0 flex-1 truncate">{materialLabel(item.material, item.description)}</span>
                    <span className="tabular-nums">{t(`${formatNumber(item.quantity)} stk.`, `${formatNumber(item.quantity)} pcs`)}</span>
                  </button>
                ))}
              </div>
            )}
            {line && (
              <div className="flex flex-wrap items-center gap-2">
                <Input inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} placeholder={t(`Alle ${line.quantity}`, `All ${line.quantity}`)} className="h-11 w-28" aria-label={t('Antal at flytte', 'Quantity to move')} />
                <Input autoFocus value={target} onChange={event => setTarget(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === 'Enter') void moveFromShelf() }}
                  placeholder="E9 H2" className="h-11 w-44 font-mono" aria-label={t('Ny hylde', 'New shelf')} />
                <ArrowRight size={18} className="text-muted-foreground" />
                <Button size="lg" onClick={() => moveFromShelf()} disabled={shelfBlocked} loading={busy}><ArrowsLeftRight size={18} /> {t('Flyt', 'Move')}</Button>
              </div>
            )}
            {shelfNote && <p className="flex items-center gap-1.5 text-sm text-destructive"><Warning size={14} /> {shelfNote}</p>}
          </CardContent>
        </Card>
      )}

      {pallet && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t('2. Hvortil?', '2. Where to?')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <span className="font-mono font-semibold">{pallet.location}</span> · {materialLabel(pallet.material, pallet.description)}{pallet.quantity === null ? '' : ` · ${formatNumber(pallet.quantity)}`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input autoFocus value={target} onChange={event => setTarget(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === 'Enter') void move() }}
                placeholder={t('Scan eller skriv ny plads', 'Scan or type the new place')} className="h-11 w-56 font-mono" aria-label={t('Ny plads', 'New place')} />
              <ArrowRight size={18} className="text-muted-foreground" />
              <Button size="lg" onClick={() => move()} disabled={blocked} loading={busy}><ArrowsLeftRight size={18} /> {t('Flyt', 'Move')}</Button>
            </div>
            {targetNote && <p className={cn('flex items-center gap-1.5 text-sm', blocked ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}><Warning size={14} /> {targetNote}</p>}
            {slots.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{t('Forslag', 'Suggestions')}</p>
                <div className="flex flex-wrap gap-2">
                  {slots.map(slot => (
                    <button key={slot.location} type="button" onClick={() => setTarget(slot.location)}
                      className={cn('rounded-md border px-2.5 py-1 text-left text-xs transition', locationKeyOf(target) === slot.location ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary')}>
                      <span className="font-mono font-semibold">{slot.location}</span> <span className="opacity-75">{reasonLabel(slot.reason)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!slots.length && <Badge variant="outline">{t('Ingen ledige pladser at foreslå – skriv pladsen', 'No free places to suggest – type the place')}</Badge>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
