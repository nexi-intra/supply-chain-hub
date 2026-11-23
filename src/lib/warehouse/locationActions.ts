import { toast } from 'sonner'
import { trackPendingWrite } from '@/lib/pendingWrites'
import type { DocumentLookup, LocationList, MapContents, MaterialCard, PalletInput, RackCard, StockLineView } from '@/types/warehouse'
import { errorMessage } from './errors'
import { deferredText, formatDate, isDeferred, isShelfPlace, locationKeyOf, palletLimitOf } from './locations'
import { t } from './text'

type Listed = LocationList['locations'][number]

// Placeringer's own actions on their way to M: (one action is a transaction of 15-40 s). The screen shows each result at
// once; a re-read that overlaps one of them can be older than the screen, so it is dropped, and the screens read again
// when an action is done (`settled`). Every action is handed to the Hub at once: nothing waits in this window, so a
// close, reload or crash of the window loses nothing. The Hub keeps them in the order they were sent, writes the daily
// ones to this PC's disk first and runs them one at a time (electron/warehouse/register.cjs, locations/outbox.cjs).
let inFlight = 0
let generation = 0
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
  /** A button on the error toast for this refusal (like "Gem alligevel"), or null for none. */
  offer?: (error: unknown) => { label: string; onClick: () => void } | null
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
  // Sent now, in the order they are made: the Hub runs them one after another in that order (they lock the same files
  // on M: anyway, and a later action can depend on an earlier one: take the rest of a pallet after taking part of it).
  let running: Promise<T>
  try { running = Promise.resolve(write()) } catch (error) { running = Promise.reject(error) }
  return trackPendingWrite(running).then(
    result => {
      if (result && typeof result === 'object' && isDeferred(result)) { toast.warning(deferredText(result)); return true }
      options.confirmed?.(result)
      return true
    },
    error => {
      try { options.rollback?.(error) } finally {
        const message = options.failure ? options.failure(error) : errorMessage(error)
        const action = options.offer?.(error)
        // The choice stays a while (the person may count again first), and can be closed.
        if (action) toast.error(message, { action, duration: 60000, closeButton: true })
        else toast.error(message)
      }
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

/**
 * Why an action kept on this PC (M: down) was refused when it was sent later. Only the code comes back; a refused count
 * has no "Gem alligevel" button there, so its text only says to count again.
 */
export function replayFailureText(code: string): string {
  if (code === 'STOCK_CHANGED') return t('Antallet var ændret, da handlingen blev sendt. Tæl igen.', 'The quantity had changed when the action was sent. Count again.')
  return errorMessage(new Error(code))
}

/** A 49/50 number as the backend stores it ("5000032337 2026 0001"), or null when it is not one. Mirrors normalizeMatdoc. */
export function matdocOf(value: string): string | null {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  return /^\d{10}( \d{4}( \d{1,4})?)?$/.test(text) ? text : null
}

/** A place where a pallet or shelf line with a looked-up 49/50 number already is: who put it there and when. */
export interface PlacedBefore { id: string; name: string; by: string; at: number | null }
/** What of one material of a looked-up 49/50 number is already put away: the places, and how many of its serials are on a pallet. */
export interface PlacedFound { places: PlacedBefore[]; serials: number }

/** The pallets and shelf lines of one material that have the number, and the pallets with one of its serials, oldest first. */
export function placedFor(placed: DocumentLookup['placed'], material: string, serials: string[]): PlacedFound {
  const mine = new Set(serials.map(serial => serial.trim().toUpperCase()))
  const onPallets = placed.serials.filter(item => mine.has(item.serial))
  const places = new Map<string, PlacedBefore>()
  for (const item of [...placed.pallets.filter(pallet => pallet.material === material), ...placed.lines.filter(line => line.material === material)]) places.set(item.id, { id: item.id, name: item.name, by: item.by, at: item.at })
  for (const item of onPallets) if (!places.has(item.pallet)) places.set(item.pallet, { id: item.pallet, name: item.name, by: item.by, at: item.at })
  return { places: [...places.values()].sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || a.name.localeCompare(b.name, 'da', { numeric: true })), serials: new Set(onPallets.map(item => item.serial)).size }
}

/** "i dag", "i går" or the date. */
export function whenLabel(at: number | null, now = Date.now()): string {
  if (!at) return ''
  const day = (ms: number) => { const date = new Date(ms); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() }
  const days = Math.round((day(now) - day(at)) / 86400000)
  if (days === 0) return t('i dag', 'today')
  if (days === 1) return t('i går', 'yesterday')
  return formatDate(at)
}

const SHOWN_PLACES = 3

/** "Allerede sat på plads: A2.4 (Bo, i går). 2 af serienumrene står allerede på en palle.", or null when nothing is. */
export function placedSummary(found: PlacedFound | null, now = Date.now()): string | null {
  if (!found || (!found.places.length && !found.serials)) return null
  const parts: string[] = []
  if (found.places.length) {
    const shown = found.places.slice(0, SHOWN_PLACES).map(place => {
      const detail = [place.by, whenLabel(place.at, now)].filter(Boolean).join(', ')
      return detail ? `${place.name} (${detail})` : place.name
    }).join(', ')
    const more = found.places.length - SHOWN_PLACES
    parts.push(t(`Allerede sat på plads: ${shown}${more > 0 ? ` og ${more} flere` : ''}.`, `Already put away: ${shown}${more > 0 ? ` and ${more} more` : ''}.`))
  }
  if (found.serials) parts.push(found.serials === 1 ? t('1 af serienumrene står allerede på en palle.', '1 of the serial numbers is already on a pallet.') : t(`${found.serials} af serienumrene står allerede på en palle.`, `${found.serials} of the serial numbers are already on a pallet.`))
  return parts.join(' ')
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

/**
 * A pallet edit as it is sent: only the fields that differ from the pallet as shown (compared as editPallet does), and
 * for each the value shown (`expected`), so M: refuses the edit when someone else changed one of them meanwhile.
 */
export function palletEdit<T extends object>(shown: T, next: Partial<T>): { changes: Partial<T>; expected: Partial<T> } {
  const fields = (Object.keys(next) as (keyof T)[]).filter(field => JSON.stringify(shown[field] ?? null) !== JSON.stringify(next[field] ?? null))
  return {
    changes: Object.fromEntries(fields.map(field => [field, next[field]])) as Partial<T>,
    expected: Object.fromEntries(fields.map(field => [field, shown[field] ?? null])) as Partial<T>,
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

/**
 * The places and what stands on them after pallets were put away (a pick place uses its pallet up: nothing is added there).
 * Without the map's contents (no drawing) only the list is counted.
 */
export function withPutAway<T extends { list: LocationList; contents: MapContents | null }>(data: T, pallets: PalletInput[]): T {
  const byId = new Map(data.list.locations.map(location => [location.id, location]))
  const places = { ...data.contents?.places }
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
    contents: data.contents && { ...data.contents, places },
  }
}

/** The list after a put-away M: refused: its pallets are no longer counted on their places (the map follows at the next read). */
export function withoutPutAway<T extends { list: LocationList }>(data: T, pallets: PalletInput[]): T {
  const byId = new Map(data.list.locations.map(location => [location.id, location]))
  const removed = new Map<string, number>()
  for (const input of pallets) {
    const place = byId.get(locationKeyOf(input.location))
    if (place && place.purpose !== 'pick') removed.set(place.id, (removed.get(place.id) || 0) + 1)
  }
  return { ...data, list: { ...data.list, locations: data.list.locations.map(location => (removed.has(location.id) ? { ...location, used: Math.max(0, location.used - removed.get(location.id)!) } : location)) } }
}

/**
 * Each pallet's place in Sæt palle på plads checked as the backend's roomIn would, with the pallets before it in the form
 * counted on their places. An empty place is left to Gem's own message; without the list (not read) M: checks it.
 */
export function putAwayPlaceChecks(locations: string[], places: Record<string, Listed> | null): { note: string | null; blocked: boolean }[] {
  const unchecked = { note: null, blocked: false }
  if (!places) return locations.map(() => unchecked)
  const before = new Map<string, number>()
  return locations.map(location => {
    if (!location.trim()) return unchecked
    const place = places[locationKeyOf(location)] || null
    if (!place) return moveTargetCheck(location, null, undefined)
    const counted = before.get(place.id) || 0
    before.set(place.id, counted + 1)
    return moveTargetCheck(location, { ...place, used: place.used + counted }, undefined)
  })
}