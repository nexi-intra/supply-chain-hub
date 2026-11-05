import type { Deferred, Location, LocationEvent, LocationInput, UndoEffect, LocationPurpose, LocationType, SlotSuggestion } from '@/types/warehouse'
import { formatNumber } from './format'
import { t, warehouseLocale } from './text'

/** Where Placeringer is: its front page, a daily task, a card or the administration. */
export type LocationsTarget =
  | { kind: 'home' }
  | { kind: 'putaway'; id?: string }
  | { kind: 'shelf'; id?: string }
  | { kind: 'rack'; id: string }
  | { kind: 'take'; id?: string }
  | { kind: 'refill'; id?: string }
  | { kind: 'fetch'; id?: string }
  | { kind: 'move'; id?: string }
  | { kind: 'log'; id?: string }
  | { kind: 'material'; id: string }
  | { kind: 'location'; id: string }
  | { kind: 'pallet'; id: string }
  | { kind: 'admin' }
  | { kind: 'import' }
  | { kind: 'layout' }
  | { kind: 'map'; id?: string }

/** A lagerhylde: holds material + quantity (hyldelager), never pallets. Mirrors the backend's isShelf. */
export const isShelfPlace = (location: Pick<Location, 'type' | 'purpose'>) => location.type === 'Hylde' && location.purpose === 'reserve'

/** How many pallets fit, by type: a pallet place 1 (or its capacity, like S0 with 2), a floor any number, a lagerhylde none. Mirrors palletLimit. */
export function palletLimitOf(location: Pick<Location, 'type' | 'purpose' | 'capacity'>): number {
  if (isShelfPlace(location)) return 0
  if (location.type === 'Palle') return location.capacity > 1 ? location.capacity : 1
  if (location.type === 'Gulv') return Infinity
  return location.capacity || 1
}

/** The capacity a dialog save stores, like the backend's locationFrom: a Palle keeps its own only if it already is one, else 1. */
export function storedCapacityOf(type: LocationType, typed: number, previous: Pick<Location, 'type' | 'capacity'> | null): number {
  if (type === 'Palle') return previous?.type === 'Palle' ? previous.capacity || 1 : 1
  return typed
}

/**
 * The purposes a place on the published drawing switches between: its drawn reserve/pick and 'reserved'. `drawn` is the
 * drawing's purpose for a reserved place (null when unknown: it stays reserved); a station stays one.
 */
export function linkedPurposes(current: LocationPurpose, drawn: 'reserve' | 'pick' | null): LocationPurpose[] {
  if (current === 'reserve' || current === 'pick') return [current, 'reserved']
  if (current === 'reserved') return drawn ? ['reserved', drawn] : ['reserved']
  return [current]
}

/** The drawing owns a linked place's name, type and capacity, so its edit sends only the rest. */
export const linkedChanges = ({ area, purpose, fixedMaterials, note }: LocationInput): Partial<LocationInput> => ({ area, purpose, fixedMaterials, note })

/** An empty quantity ("Tag alt", "Flyt" without a number) means the quantity shown, never whatever is there when it runs. */
export const shownQuantity = (typed: string, shown: number) => (typed.trim() ? Number(typed) : shown)

/** Runs one action at a time: a second call while the first is busy (Enter pressed twice) is ignored. */
export function singleFlight() {
  let busy = false
  return async (action: () => Promise<void>) => {
    if (busy) return
    busy = true
    try { await action() } finally { busy = false }
  }
}

/** "R162-0717 · Ethernet Cable RJ45 2m": a material is never only a number when SAP's description is known. */
export const materialLabel = (material: string, description?: string | null) => (description ? `${material} · ${description}` : material)

export function formatAge(days: number): string {
  if (days <= 0) return t('i dag', 'today')
  if (days === 1) return t('1 dag', '1 day')
  return t(`${days} dage`, `${days} days`)
}

/** A place written like the backend's locationKey: " a2.4 " and "A2.4" are the same place. */
export const locationKeyOf = (name: string) => String(name ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

export const formatDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString(warehouseLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–')

/** One history line in words ("Taget fra A1.1 · 10"); the log and the cards share it. */
export function describeEvent(event: LocationEvent): string {
  const quantity = event.quantity === null || event.quantity === undefined ? '' : ` · ${formatNumber(event.quantity)}`
  switch (event.type) {
    case 'putaway': return t(`Sat på plads på ${event.location}${quantity}`, `Put away on ${event.location}${quantity}`)
    case 'take': return t(`Taget fra ${event.location}${quantity}`, `Taken from ${event.location}${quantity}`)
    case 'move': return t(`Flyttet ${event.from} → ${event.to}`, `Moved ${event.from} → ${event.to}`)
    case 'sloc': return t(`Storage location ${event.from} → ${event.to}`, `Storage location ${event.from} → ${event.to}`)
    case 'empty': return t(`${event.location} løbet tør`, `${event.location} ran empty`)
    case 'refill': return t(`${event.location} fyldt op fra ${event.from}${quantity}`, `${event.location} refilled from ${event.from}${quantity}`)
    case 'edit-pallet': return t('Pallen rettet', 'Pallet edited')
    case 'shelf-put': return t(`Lagt på ${event.location}${quantity}`, `Put on ${event.location}${quantity}`)
    case 'shelf-take': return t(`Taget fra ${event.location}${quantity}`, `Taken from ${event.location}${quantity}`)
    case 'shelf-move': return t(`Flyttet ${event.from} → ${event.to}${quantity}`, `Moved ${event.from} → ${event.to}${quantity}`)
    case 'shelf-set': {
      const [before, after] = (event.changes?.quantity || []) as [number, number]
      return t(`Antal rettet på ${event.location}: ${before} → ${after}`, `Quantity corrected on ${event.location}: ${before} → ${after}`)
    }
    case 'migrate': return t('Hyldepaller lagt om til hyldelager', 'Shelf pallets turned into shelf stock')
    case 'location': {
      const deleted = event.changes?.deleted?.[0]
      if (typeof deleted === 'string') {
        const count = deleted.split(', ').length
        return count === 1 ? t(`Placeringen ${deleted} slettet`, `Location ${deleted} deleted`) : t(`${count} placeringer slettet`, `${count} locations deleted`)
      }
      const rack = /^(.*) \((\d+) hylder\)$/.exec(String(event.changes?.rack?.[1] ?? ''))
      if (rack) return t(`Reol ${rack[1]} oprettet (${rack[2]} hylder)`, `Rack ${rack[1]} created (${rack[2]} shelves)`)
      if (event.changes?.active && event.count && event.count > 1) {
        const on = Boolean(event.changes.active[1])
        return on ? t(`${event.count} placeringer aktiveret`, `${event.count} locations activated`) : t(`${event.count} placeringer deaktiveret`, `${event.count} locations deactivated`)
      }
      if (event.changes?.active) return event.changes.active[1] ? t(`Placeringen ${event.location} aktiveret`, `Location ${event.location} activated`) : t(`Placeringen ${event.location} deaktiveret`, `Location ${event.location} deactivated`)
      if (event.changes?.series) return t('Placeringer oprettet', 'Locations created')
      if (event.changes?.created) return t(`Placeringen ${event.location} oprettet`, `Location ${event.location} created`)
      return t(`Placeringen ${event.location} rettet`, `Location ${event.location} edited`)
    }
    case 'import': return t('Placeringsarket importeret', 'Placement sheet imported')
    case 'undo': return event.location ? t(`Fortrød en handling på ${event.location}`, `Undid an action on ${event.location}`) : t('Fortrød en handling', 'Undid an action')
    case 'layout': {
      const v = event.changes?.version?.[1]
      const c = event.counts || { create: 0, rename: 0, change: 0, remove: 0 }
      return t(`Tegningen udgivet (version ${v}): ${c.create} nye, ${c.rename} omdøbt, ${c.remove} nedlagt`, `Drawing published (version ${v}): ${c.create} new, ${c.rename} renamed, ${c.remove} removed`)
    }
    default: return event.type
  }
}

/** What undoing a whole action does, one line each, for the confirmation ("2 paller fjernes fra A2.1, A2.2"). */
export function describeUndoEffect(effect: UndoEffect): string[] {
  const list = (names: string[]) => [...new Set(names)].join(', ')
  const pallets = (n: number) => (n === 1 ? t('1 palle', '1 pallet') : t(`${n} paller`, `${n} pallets`))
  const lines: string[] = []
  const { remove, restore, change } = effect.pallets
  if (remove.length) lines.push(t(`${pallets(remove.length)} fjernes fra ${list(remove)}`, `${pallets(remove.length)} ${remove.length === 1 ? 'is' : 'are'} removed from ${list(remove)}`))
  if (restore.length) lines.push(t(`${pallets(restore.length)} kommer tilbage på ${list(restore)}`, `${pallets(restore.length)} ${restore.length === 1 ? 'comes' : 'come'} back on ${list(restore)}`))
  for (const item of change) {
    if (item.now) lines.push(t(`Pallen på ${item.now} kommer tilbage på ${item.location}`, `The pallet on ${item.now} goes back to ${item.location}`))
    else if (item.from !== item.to && item.to !== null && item.from !== null && item.to > item.from) lines.push(t(`Pallen på ${item.location} får ${formatNumber(item.to)} stk. igen (nu ${formatNumber(item.from)})`, `The pallet on ${item.location} gets ${formatNumber(item.to)} pcs back (now ${formatNumber(item.from)})`))
    else if (item.from !== item.to) lines.push(t(`Pallen på ${item.location} går fra ${item.from ?? '–'} til ${item.to ?? '–'} stk.`, `The pallet on ${item.location} goes from ${item.from ?? '–'} to ${item.to ?? '–'} pcs`))
    else lines.push(t(`Pallen på ${item.location} bliver som før`, `The pallet on ${item.location} is as before`))
  }
  for (const name of effect.places.remove) lines.push(t(`Placeringen ${name} fjernes`, `The location ${name} is removed`))
  for (const name of effect.places.restore) lines.push(t(`Placeringen ${name} kommer tilbage`, `The location ${name} comes back`))
  for (const name of effect.places.change) lines.push(t(`Placeringen ${name} bliver som før`, `The location ${name} is as before`))
  for (const item of effect.stock || []) {
    const { location, material, from, to } = item
    if (to === null) lines.push(t(`${material} fjernes fra ${location}`, `${material} is removed from ${location}`))
    else if (from === null) lines.push(t(`${material} kommer tilbage på ${location} (${formatNumber(to)} stk.)`, `${material} comes back on ${location} (${formatNumber(to)} pcs)`))
    else if (to > from) lines.push(t(`${material} på ${location} får ${formatNumber(to)} stk. igen (nu ${formatNumber(from)})`, `${material} on ${location} gets ${formatNumber(to)} pcs back (now ${formatNumber(from)})`))
    else lines.push(t(`${material} på ${location} går fra ${formatNumber(from)} til ${formatNumber(to)} stk.`, `${material} on ${location} goes from ${formatNumber(from)} to ${formatNumber(to)} pcs`))
  }
  return lines
}

/** Deep links (Hubert): "material:R162-0717", "location:A2.4", "pallet:<id>", or a task name. */
export function targetFromItem(item: string | undefined): LocationsTarget {
  const [kind, ...rest] = String(item || '').split(':')
  const id = rest.join(':')
  if ((kind === 'material' || kind === 'location' || kind === 'pallet' || kind === 'rack') && id) return { kind, id }
  if (kind === 'putaway' || kind === 'shelf' || kind === 'take' || kind === 'refill' || kind === 'fetch' || kind === 'move' || kind === 'log' || kind === 'map') return id ? { kind, id } : { kind }
  if (kind === 'admin' || kind === 'import' || kind === 'layout') return { kind }
  return { kind: 'home' }
}

export const isDeferred = (result: object): result is Deferred => 'queued' in result || 'duplicate' in result

/** Each daily action gets its own id, so a retry after a lost answer is never applied twice. */
export const newActionId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `a-${Date.now()}-${Math.random().toString(36).slice(2)}`)

export const PURPOSES: LocationPurpose[] = ['reserve', 'pick', 'station', 'reserved']
export const TYPES: LocationType[] = ['Palle', 'Hylde', 'Reol', 'Bord', 'Swap', 'Gulv']

export function purposeLabel(purpose: LocationPurpose): string {
  if (purpose === 'pick') return t('Pluk-plads', 'Pick place')
  if (purpose === 'station') return t('Arbejdsstation', 'Work station')
  if (purpose === 'reserved') return t('Reserveret', 'Reserved')
  return t('Reserve', 'Reserve')
}

export function typeLabel(type: LocationType): string {
  const labels: Record<LocationType, [string, string]> = { Palle: ['Palle', 'Pallet'], Hylde: ['Hylde', 'Shelf'], Reol: ['Reol', 'Rack'], Bord: ['Bord', 'Table'], Swap: ['Swap', 'Swap'], Gulv: ['Gulv', 'Floor'] }
  return t(...labels[type])
}

export function reasonLabel(reason: SlotSuggestion['reason']): string {
  if (reason === 'fixed') return t('Fast plads', 'Fixed place')
  if (reason === 'near') return t('Nær samme materiale', 'Near the same material')
  return t('Ledig', 'Free')
}

/** The toast for an action kept on this PC while M: is down. */
export const deferredText = (result: Deferred) => ('duplicate' in result
  ? t('Handlingen var allerede registreret.', 'The action was already registered.')
  : t('M: kan ikke nås – handlingen er gemt på denne PC og sendes, når forbindelsen er tilbage.', 'M: cannot be reached – the action is saved on this PC and sent when the connection is back.'))
