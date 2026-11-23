import { toast } from 'sonner'
import { trackPendingWrite } from '@/lib/pendingWrites'
import type { LocationList, MapContents, MaterialCard, PalletInput, RackCard, StockLineView } from '@/types/warehouse'
import { errorMessage } from './errors'
import { deferredText, isDeferred, isShelfPlace, locationKeyOf, palletLimitOf } from './locations'
import { t } from './text'

type Listed = LocationList['locations'][number]

// Placeringer's own actions on their way to M: (one action is a transaction of 15-40 s). The screen shows each result at
// once; a re-read that overlaps one of them can be older than the screen, so it is dropped, and the screens read again
// when an action is done (`settled`).
let inFlight = 0
let generation = 0
let queue: Promise<unknown> = Promise.resolve()
// Places this PC is deleting, hidden from the lists until M: has answered; racks it is creating, shown as predicted.
const hidden = new Map<string, number>()
const racks = new Map<string, RackCard>()

/** A place being deleted on this PC: left out of every list, also one read before the delete landed. */
export const isPlaceHidden = (id: string) => hidden.has(id)
/** The rack card shown for a rack this PC is creating, until M: has it. */
export const predictedRack = (rack: string) => racks.get(rack) ?? null

/**
 * Taken when a re-read starts; the check says whether its answer may replace what is shown: false when one of this PC's
 * actions was on its way at any moment of the read. A screen with nothing shown yet takes the answer anyway.
 */
export function startLocationsRead(): () => boolean {
  const started = generation
  const quiet = inFlight === 0
  return () => quiet && inFlight === 0 && generation === started
}

export const locationActionsInFlight = () => inFlight

export interface LocationActionOptions<T> {
  /** Shown at once: the screen already shows the result. */
  success?: string
  /** Puts back what the screen showed when M: refuses the action; the error toast is shown anyway. */
  rollback?: (error: unknown) => void
  /** The error text; the backend's message when left out. */
  failure?: (error: unknown) => string
  /** M:'s answer, when the action was done there (not when it was only kept on this PC). */
  confirmed?: (result: T) => void
  /** Always after the answer: the screens read again, now that the write is done. */
  settled: () => void
  /** Places the action deletes: hidden everywhere while it is on its way. */
  hides?: string[]
  /** A rack the action creates: its card is shown before M: has it. */
  rack?: RackCard
}

/**
 * Sends one action in the background: the caller has already shown its result. A refusal rolls back and shows why; an
 * action kept on this PC (M: down) shows that. Resolves to whether M: took it; never rejects.
 */
export function sendLocationAction<T>(write: () => Promise<T>, options: LocationActionOptions<T>): Promise<boolean> {
  inFlight++
  generation++
  for (const id of options.hides || []) hidden.set(id, (hidden.get(id) || 0) + 1)
  if (options.rack) racks.set(options.rack.rack, options.rack)
  if (options.success) toast.success(options.success)
  // One after another, in the order they were made: they lock the same files on M: anyway, and a later action can
  // depend on an earlier one (take the rest of a pallet after taking part of it).
  const running = queue.then(() => write())
  queue = running.catch(() => {})
  return trackPendingWrite(running).then(
    result => {
      if (result && typeof result === 'object' && isDeferred(result)) { toast.warning(deferredText(result)); return true }
      options.confirmed?.(result)
      return true
    },
    error => {
      try { options.rollback?.(error) } finally { toast.error(options.failure ? options.failure(error) : errorMessage(error)) }
      return false
    },
  ).finally(() => {
    inFlight--
    generation++
    for (const id of options.hides || []) { const left = (hidden.get(id) || 1) - 1; if (left > 0) hidden.set(id, left); else hidden.delete(id) }
    if (options.rack && racks.get(options.rack.rack) === options.rack) racks.delete(options.rack.rack)
    options.settled()
  })
}

/** A 49/50 number as the backend stores it ("5000032337 2026 0001"), or null when it is not one. Mirrors normalizeMatdoc. */
export function matdocOf(value: string): string | null {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  return /^\d{10}( \d{4}( \d{1,4})?)?$/.test(text) ? text : null
}

/**
 * A material card after taking all (`quantity` left out or at least what is there) or part of one of its pallets. A
 * pallet with an unknown quantity stays after a part (still unknown, and it never counted in the total). Mirrors takeFrom.
 */
export function takeFromCard(card: MaterialCard, pallet: string, quantity?: number): MaterialCard {
  const found = card.reserve.find(item => item.id === pallet)
  if (!found) return card
  if (quantity !== undefined && found.quantity === null) return card
  const whole = quantity === undefined || (found.quantity !== null && quantity >= found.quantity)
  const taken = whole ? (found.quantity ?? 0) : quantity
  return {
    ...card,
    reserve: whole ? card.reserve.filter(item => item.id !== pallet) : card.reserve.map(item => (item.id === pallet ? { ...item, quantity: (item.quantity ?? 0) - taken } : item)),
    total: Math.max(0, card.total - taken),
  }
}

/** A material card after a pallet with an unknown quantity was counted: it has the quantity, and the total counts it. */
export function countedInCard(card: MaterialCard, pallet: string, quantity: number): MaterialCard {
  const found = card.reserve.find(item => item.id === pallet)
  if (!found) return card
  return {
    ...card,
    reserve: card.reserve.map(item => (item.id === pallet ? { ...item, quantity } : item)),
    total: card.total - (found.quantity ?? 0) + quantity,
  }
}

/** A material card after taking `quantity` (all when left out) from one of its shelves; the line goes at 0. */
export function takeFromCardShelf(card: MaterialCard, location: string, quantity?: number): MaterialCard {
  const found = card.shelves.find(item => item.location === location)
  if (!found) return card
  const taken = quantity === undefined ? found.quantity : Math.min(quantity, found.quantity)
  const left = found.quantity - taken
  return {
    ...card,
    shelves: left > 0 ? card.shelves.map(item => (item.location === location ? { ...item, quantity: left } : item)) : card.shelves.filter(item => item.location !== location),
    total: Math.max(0, card.total - taken),
  }
}

/** A shelf's lines with one material set to `quantity` (0 removes the line, a new material gets a line). */
export function withStockQuantity(lines: StockLineView[], line: Pick<StockLineView, 'location' | 'material' | 'description'>, quantity: number): StockLineView[] {
  const id = `${line.location}|${line.material}`
  const existing = lines.find(item => item.id === id)
  if (quantity <= 0) return lines.filter(item => item.id !== id)
  if (existing) return lines.map(item => (item.id === id ? { ...item, quantity } : item))
  return [...lines, { id, location: line.location, material: line.material, description: line.description, quantity, note: '', updatedAt: Date.now(), updatedBy: { email: '', name: '' } }]
}

/** A shelf's lines with `delta` added to one material (a take is negative). */
export function addToStock(lines: StockLineView[], line: Pick<StockLineView, 'location' | 'material' | 'description'>, delta: number): StockLineView[] {
  const existing = lines.find(item => item.id === `${line.location}|${line.material}`)
  return withStockQuantity(lines, line, (existing?.quantity ?? 0) + delta)
}

/** Whether a pallet can be moved to `target` (a place from the list, null when it does not exist), and the note shown. Mirrors roomIn. */
export function moveTargetCheck(target: string, place: Listed | null, from: string | undefined): { note: string | null; blocked: boolean } {
  const typed = target.trim().toUpperCase()
  if (!typed) return { note: null, blocked: true }
  if (!place) return { note: t(`${typed} findes ikke`, `${typed} does not exist`), blocked: true }
  if (place.id === from) return { note: t('Pallen står der allerede', 'The pallet is already there'), blocked: true }
  if (place.purpose === 'reserved' || place.purpose === 'station') return { note: t(`${place.name} kan ikke tage paller`, `${place.name} cannot take pallets`), blocked: true }
  if (!place.active) return { note: t(`${place.name} er deaktiveret`, `${place.name} is deactivated`), blocked: true }
  if (isShelfPlace(place)) return { note: t(`${place.name} er en hylde – brug Læg på hylde`, `${place.name} is a shelf – use Put on shelf`), blocked: true }
  if (place.purpose === 'reserve' && place.used >= palletLimitOf(place)) return { note: t(`${place.name} er fuld – vælg en anden plads`, `${place.name} is full – choose another place`), blocked: true }
  if (place.purpose === 'pick') return { note: t(`${place.name} er en pluk-plads – pallen bruges op der`, `${place.name} is a pick place – the pallet is used up there`), blocked: false }
  return { note: null, blocked: false }
}

/** The list after a pallet left `from` and came to `to` (a pick place uses it up, so nothing is added there). */
export function movedInList(places: Record<string, Listed>, from: string | null, to: string | null): Record<string, Listed> {
  const next = { ...places }
  if (from && next[from]) next[from] = { ...next[from], used: Math.max(0, next[from].used - 1) }
  if (to && next[to] && next[to].purpose !== 'pick') next[to] = { ...next[to], used: next[to].used + 1 }
  return next
}

/** The places and what stands on them after pallets were put away (a pick place uses its pallet up: nothing is added there). */
export function withPutAway<T extends { list: LocationList; contents: MapContents }>(data: T, pallets: PalletInput[]): T {
  const byId = new Map(data.list.locations.map(location => [location.id, location]))
  const places = { ...data.contents.places }
  const added = new Map<string, number>()
  for (const input of pallets) {
    const place = byId.get(locationKeyOf(input.location))
    if (!place || place.purpose === 'pick') continue
    added.set(place.id, (added.get(place.id) || 0) + 1)
    const material = input.material.trim().toUpperCase()
    const quantity = typeof input.quantity === 'number' ? input.quantity : null
    const receivedAt = input.receivedAt ?? Date.now()
    const materials = [...(places[place.id]?.materials || [])]
    const at = materials.findIndex(item => item.material === material)
    if (at >= 0) {
      const item = materials[at]
      materials[at] = { ...item, pallets: item.pallets + 1, quantity: quantity === null ? item.quantity : (item.quantity ?? 0) + quantity, oldestAt: item.oldestAt === null ? receivedAt : Math.min(item.oldestAt, receivedAt) }
    } else materials.push({ material, description: '', pallets: 1, quantity, oldestAt: receivedAt, fixed: false })
    places[place.id] = { materials }
  }
  return {
    ...data,
    list: { ...data.list, locations: data.list.locations.map(location => (added.has(location.id) ? { ...location, used: location.used + added.get(location.id)! } : location)) },
    contents: { ...data.contents, places },
  }
}