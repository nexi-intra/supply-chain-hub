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
import { movedInList, moveTargetCheck, sendLocationAction, startLocationsRead } from '@/lib/warehouse/locationActions'
import { formatAge, isShelfPlace, locationKeyOf, materialLabel, newActionId, reasonLabel, shownQuantity, singleFlight } from '@/lib/warehouse/locations'
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
  const [moved, setMoved] = useState<string | null>(null)
  // A lagerhylde scanned: its lines, the chosen line, how many, and the new shelf.
  const [shelf, setShelf] = useState<{ name: string; lines: StockLineView[] } | null>(null)
  const [line, setLine] = useState<StockLineView | null>(null)
  const [amount, setAmount] = useState('')
  // What is chosen now: a refused move puts its choice back only when nothing else has been chosen since.
  const chosenRef = useRef<PalletView | null>(null)
  const shelfRef = useRef<{ name: string; lines: StockLineView[] } | null>(null)
  chosenRef.current = pallet
  shelfRef.current = shelf
  const once = useRef(singleFlight()).current
  const bridge = window.electronWarehouse!.locations

  // Every place (for the target check: reserved, pick place, full). A read during this PC's own move is older than the screen.
  useEffect(() => {
    let current = true
    const fresh = startLocationsRead()
    bridge.list().then(result => {
      if (!current) return
      const next = Object.fromEntries(result.locations.map(location => [location.id, location]))
      setPlaces(value => (Object.keys(value).length && !fresh() ? value : next))
    }).catch(() => {})
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
  const { note: targetNote, blocked } = moveTargetCheck(target, targetPlace, pallet?.location)

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

  // Shown at once and sent in the background (15-40 s on M:); a refusal puts the choice back so another can be made.
  const moveFromShelf = () => once(async () => {
    if (!shelf || !line || !shelfTarget || shelfBlocked) return
    const [from, chosen, quantity, to] = [shelf, line, moveAmount, shelfTarget]
    const text = `${materialLabel(chosen.material, chosen.description)}: ${from.name} → ${to.name} (${formatNumber(quantity)})`
    setMoved(text)
    setShelf(null)
    setLine(null)
    setAmount('')
    setTarget('')
    setQuery('')
    void sendLocationAction(() => bridge.shelfMove({ actionId: newActionId(), label: t(`Flyt ${chosen.material} fra ${from.name} til ${to.name}`, `Move ${chosen.material} from ${from.name} to ${to.name}`), from: chosen.location, to: to.id, material: chosen.material, quantity }), {
      success: t(`${formatNumber(quantity)} stk. flyttet fra ${from.name} til ${to.name}`, `${formatNumber(quantity)} pcs moved from ${from.name} to ${to.name}`),
      rollback: () => {
        setMoved(value => (value === text ? null : value))
        if (!chosenRef.current && !shelfRef.current) { setShelf(from); setLine(chosen) }
      },
      settled: onDone,
    })
  })

  function move() {
    if (!pallet || !targetPlace || blocked) return
    const [chosen, to, list] = [pallet, targetPlace, candidates]
    const text = `${materialLabel(chosen.material, chosen.description)}: ${chosen.location} → ${to.name}`
    setMoved(text)
    setPallet(null)
    setCandidates(null)
    setTarget('')
    setQuery('')
    // The places count the move at once, so the next pallet cannot be sent to a place that just became full.
    setPlaces(value => movedInList(value, chosen.location, to.id))
    void sendLocationAction(() => bridge.move({ actionId: newActionId(), label: t(`Flyt ${chosen.material} fra ${chosen.location} til ${to.name}`, `Move ${chosen.material} from ${chosen.location} to ${to.name}`), pallet: chosen.id, to: to.id }), {
      success: t(`${chosen.material} er flyttet fra ${chosen.location} til ${to.name}`, `${chosen.material} moved from ${chosen.location} to ${to.name}`),
      failure: error => (errorCode(error) === 'LOCATION_FULL' ? t(`${to.name} er fuld – vælg en anden plads`, `${to.name} is full – choose another place`) : errorMessage(error)),
      rollback: () => {
        setMoved(value => (value === text ? null : value))
        setPlaces(value => movedInList(value, to.id, chosen.location))
        if (!chosenRef.current && !shelfRef.current) { setPallet(chosen); setCandidates(list) }
      },
      settled: onDone,
    })
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
                <Button size="lg" onClick={() => void moveFromShelf()} disabled={shelfBlocked}><ArrowsLeftRight size={18} /> {t('Flyt', 'Move')}</Button>
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
              <Button size="lg" onClick={() => move()} disabled={blocked}><ArrowsLeftRight size={18} /> {t('Flyt', 'Move')}</Button>
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
