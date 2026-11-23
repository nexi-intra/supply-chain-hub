import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Barcode, CheckCircle, Stack, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatNumber } from '@/lib/warehouse/format'
import { addToStock, sendLocationAction, startLocationsRead } from '@/lib/warehouse/locationActions'
import { isShelfPlace, locationKeyOf, materialLabel, newActionId, singleFlight } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { DocumentLookup, LocationCard, MaterialCard } from '@/types/warehouse'
import { MaterialPicker } from './MaterialPicker'
import { nextUnsaved } from './scanChoices'

/** The materials of a 49/50 number with several, and which of them are put on a shelf already. */
type DocumentLines = { document: string; materials: DocumentLookup['materials']; saved: number[] }

/**
 * "Læg på hylde": the shelf (scan or type "E9 H5"), the material (suggestions with SAP's description), the quantity –
 * or a 49/50 number that fills material and quantity from SAP. A number with several materials shows one button each;
 * the number stays until all are put on a shelf. The same material on the shelf is added to.
 */
export function ShelfPut({ shelf: initial, version, onDone }: { shelf?: string; version: number; onDone: () => void }) {
  const [shelf, setShelf] = useState(initial || '')
  const [place, setPlace] = useState<LocationCard | null>(null)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [material, setMaterial] = useState<string | null>(null)
  const [card, setCard] = useState<MaterialCard | null>(null)
  const [quantity, setQuantity] = useState('')
  const [document, setDocument] = useState('')
  const [lines, setLines] = useState<DocumentLines | null>(null)
  const [line, setLine] = useState<number | null>(null)
  const [looking, setLooking] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  // What is typed now: a refused put comes back only into an empty form.
  const materialRef = useRef<string | null>(null)
  const quantityRef = useRef('')
  materialRef.current = material
  quantityRef.current = quantity
  // Enter pressed twice must not put the quantity on twice.
  const once = useRef(singleFlight()).current
  const bridge = window.electronWarehouse!.locations

  // The shelf as it is now: is it a lagerhylde, and what stands there. A re-read during a put on its way is older than the screen.
  useEffect(() => {
    const name = shelf.trim()
    if (!name) { setPlace(null); setPlaceError(null); return }
    let current = true
    const timer = window.setTimeout(() => {
      const fresh = startLocationsRead()
      bridge.locationCard({ location: name })
        .then(result => { if (current) { setPlace(value => (value?.location.id === result.location.id && !fresh() ? value : result)); setPlaceError(isShelfPlace(result.location) ? null : t(`${result.location.name} er ikke en lagerhylde`, `${result.location.name} is not a storage shelf`)) } })
        .catch(() => { if (current) { setPlace(null); setPlaceError(t(`${name.toUpperCase()} findes ikke`, `${name.toUpperCase()} does not exist`)) } })
    }, 200)
    return () => { current = false; window.clearTimeout(timer) }
  }, [bridge, shelf, version])

  // Where the material already stands on shelves: suggested first.
  useEffect(() => {
    if (!material) { setCard(null); return }
    let current = true
    bridge.materialCard({ material }).then(result => { if (current) setCard(result) }).catch(() => {})
    return () => { current = false }
  }, [bridge, material, version])

  function chooseLine(materials: DocumentLookup['materials'], index: number) {
    const chosen = materials[index]
    setLine(index)
    setMaterial(chosen.material)
    setQuery(chosen.material)
    setQuantity(String(chosen.quantity))
  }

  async function lookup() {
    if (!document.trim()) return
    setLooking(true)
    try {
      const found = await bridge.lookupDocument({ document: document.trim() })
      if (!found.materials.length) { toast.warning(t('Ingen materialer på 49/50-nummeret', 'No materials on the 49/50 number')); return }
      // Scanning the same number again keeps what is already put on a shelf.
      const saved = lines?.document === found.document ? lines.saved : []
      setDocument(found.document)
      setLines(found.materials.length > 1 ? { document: found.document, materials: found.materials, saved } : null)
      chooseLine(found.materials, nextUnsaved(found.materials.length, saved, null) ?? 0)
      if (found.materials.length > 1) toast.info(t(`Nummeret har ${found.materials.length} materialer. Vælg dem et ad gangen under nummeret.`, `The number has ${found.materials.length} materials. Choose them one at a time below the number.`))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLooking(false)
    }
  }

  const amount = Number(quantity)
  const existing = place && material ? place.stock.find(line => line.material === material) : undefined
  const valid = Boolean(place && !placeError && material && amount >= 1)

  // Shown at once (the shelf's lines and the material's shelves count it); M: gets it in the background (15-40 s).
  // A refusal puts the material and quantity back, unless something new has been typed since.
  const save = () => once(async () => {
    if (!valid || !place || !material) return
    const [shelfCard, code, count, typed, doc, docLines, docLine] = [place, material, amount, query, document, lines, line]
    const description = card?.material === code ? card.description : ''
    const text = t(`${formatNumber(count)} stk. ${code} på ${shelfCard.location.name}`, `${formatNumber(count)} pcs ${code} on ${shelfCard.location.name}`)
    const stockLine = { location: shelfCard.location.id, material: code, description }
    setSaved(text)
    setPlace(value => (value?.location.id === stockLine.location ? { ...value, stock: addToStock(value.stock, stockLine, count) } : value))
    // The same shelf often gets several materials: it stays, the rest is cleared for the next. A 49/50 number with
    // several materials stays with the next one not saved yet chosen, until all are done.
    const savedNow = docLines ? (docLine === null ? docLines.saved : [...docLines.saved, docLine]) : []
    const next = docLines ? nextUnsaved(docLines.materials.length, savedNow, docLine) : null
    if (docLines && next !== null) {
      setLines({ ...docLines, saved: savedNow })
      chooseLine(docLines.materials, next)
    } else {
      setQuery('')
      setMaterial(null)
      setQuantity('')
      setDocument('')
      setLines(null)
      setLine(null)
    }
    void sendLocationAction(() => bridge.shelfPut({ actionId: newActionId(), label: t(`Læg ${code} på ${shelfCard.location.name}`, `Put ${code} on ${shelfCard.location.name}`), location: shelfCard.location.id, material: code, quantity: count }), {
      success: t(`Lagt på ${shelfCard.location.name}: ${formatNumber(count)} stk. ${code}`, `Put on ${shelfCard.location.name}: ${formatNumber(count)} pcs ${code}`),
      rollback: () => {
        setSaved(value => (value === text ? null : value))
        setPlace(value => (value?.location.id === stockLine.location ? { ...value, stock: addToStock(value.stock, stockLine, -count) } : value))
        // The material of the number is not put on a shelf after all: its button is open again.
        if (docLines && docLine !== null) setLines(value => (value?.document === docLines.document ? { ...value, saved: value.saved.filter(index => index !== docLine) } : value))
        if (!materialRef.current && !quantityRef.current) {
          setQuery(typed); setMaterial(code); setQuantity(String(count)); setDocument(doc)
          if (docLines) { setLines(value => value ?? docLines); setLine(docLine) }
        }
      },
      settled: onDone,
    })
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('Læg på hylde', 'Put on shelf')}</h1>
        <p className="text-sm text-muted-foreground">{t('Scan hylden, vælg materialet og skriv antallet. Står materialet der i forvejen, lægges antallet til.', 'Scan the shelf, choose the material and type the quantity. If the material is already there, the quantity is added.')}</p>
      </div>

      {saved && (
        <p className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm">
          <CheckCircle size={16} weight="fill" className="text-emerald-600" /> {t('Lagt på', 'Put on')}: {saved} – {t('klar til næste', 'ready for the next')}
        </p>
      )}

      <Card>
        <CardContent className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="shelf-name">{t('Hylde', 'Shelf')}</Label>
            <Input id="shelf-name" autoFocus value={shelf} onChange={event => setShelf(event.target.value.toUpperCase())} placeholder="E9 H5" className="h-11 w-56 font-mono" />
            {placeError && <p className="flex items-center gap-1.5 text-sm text-destructive"><Warning size={14} /> {placeError}</p>}
            {place && !placeError && <p className="text-xs text-muted-foreground">{place.stock.length ? t(`På hylden: ${place.stock.map(line => `${line.material} ${formatNumber(line.quantity)}`).join(', ')}`, `On the shelf: ${place.stock.map(line => `${line.material} ${formatNumber(line.quantity)}`).join(', ')}`) : t('Hylden er tom.', 'The shelf is empty.')}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="shelf-document">{t('49/50-nummer (valgfrit)', '49/50 number (optional)')}</Label>
            <div className="flex gap-2">
              <Input id="shelf-document" value={document} onChange={event => { setDocument(event.target.value); if (lines && event.target.value.trim() !== lines.document) { setLines(null); setLine(null) } }} onKeyDown={event => { if (event.key === 'Enter') void lookup() }} placeholder={t('Scan eller skriv, fx 5000032337 eller 5000032337 2026 0001', 'Scan or type, e.g. 5000032337 or 5000032337 2026 0001')} />
              <Button variant="outline" onClick={() => lookup()} loading={looking} disabled={!document.trim()}><Barcode size={16} /> {t('Hent fra SAP', 'Get from SAP')}</Button>
            </div>
            {lines && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Materialer på nummeret', 'Materials on the number')}>
                {lines.materials.map((item, index) => {
                  const done = lines.saved.includes(index)
                  return (
                    <button key={index} type="button" disabled={done} aria-pressed={line === index} onClick={() => chooseLine(lines.materials, index)}
                      className={cn('inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs', line === index ? 'border-primary bg-primary text-primary-foreground' : done ? 'text-muted-foreground' : 'hover:bg-secondary')}>
                      {done && <CheckCircle size={12} weight="fill" className="text-emerald-600" />}
                      <span className="font-mono font-semibold">{item.material}</span> · {t(`${formatNumber(item.quantity)} stk.`, `${formatNumber(item.quantity)} pcs`)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t('Materiale', 'Material')}</span>
            <MaterialPicker value={query} chosen={material} listId="shelf-suggestions" label={t('Materiale', 'Material')} placeholder="R162-0717"
              onValueChange={value => { setQuery(value); setMaterial(null); setLine(null) }} onChoose={code => { setQuery(code); setMaterial(code); setLine(index => (index !== null && lines?.materials[index]?.material === code ? index : null)) }} />
            {card && <p className="text-xs text-muted-foreground">{materialLabel(card.material, card.description)}</p>}
            {card && card.shelves.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('Står allerede på', 'Already on')}</span>
                {card.shelves.map(item => (
                  <button key={item.location} type="button" onClick={() => setShelf(item.name)}
                    className={cn('rounded-md border px-2.5 py-1 text-xs', locationKeyOf(shelf) === item.location ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}>
                    <span className="font-mono font-semibold">{item.name}</span> · {t(`${formatNumber(item.quantity)} stk.`, `${formatNumber(item.quantity)} pcs`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="shelf-amount">{t('Antal', 'Quantity')}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input id="shelf-amount" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value.replace(/\D/g, ''))} onKeyDown={event => { if (event.key === 'Enter') void save() }} className="w-32" />
              {existing && amount >= 1 && (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  {t(`${formatNumber(existing.quantity)} stk.`, `${formatNumber(existing.quantity)} pcs`)} <ArrowRight size={14} /> <strong>{t(`${formatNumber(existing.quantity + amount)} stk.`, `${formatNumber(existing.quantity + amount)} pcs`)}</strong>
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="lg" onClick={() => void save()} disabled={!valid}><Stack size={18} /> {t('Gem', 'Save')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
