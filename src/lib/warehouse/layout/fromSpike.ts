import type { LayoutDraft, LayoutItem, LayoutItemType, LayoutOwner, LayoutPull, LayoutSlot } from '@/types/warehouse'
import { t } from '../text'
import { NAME_MAX, proposeNames, regenerateSlots } from './slots'

type Raw = Record<string, unknown>

const TYPES: Record<string, LayoutItemType> = {
  rack: 'rack', floorrow: 'floorrow', dock: 'dock', shelfrack: 'shelfrack', pick: 'floor', floor: 'floor',
  station: 'station', receiving: 'receiving', gate: 'gate', pc: 'pc', office: 'office', text: 'text',
}
const KINDS: Record<string, Pick<LayoutSlot, 'kind' | 'purpose'>> = {
  pallet: { kind: 'pallet', purpose: 'reserve' },
  'pick-named': { kind: 'pallet', purpose: 'pick' },
  pick: { kind: 'pick-unnamed', purpose: 'reserve' },
  shelf: { kind: 'shelf', purpose: 'reserve' },
  blocked: { kind: 'blocked', purpose: 'reserve' },
}
const OWNERS: LayoutOwner[] = ['TCD', 'TRR', 'Andet']
const PLACE_KINDS = ['pallet', 'shelf', 'floor', 'special']
const HALL_MIN = 10
const HALL_MAX = 300
const ITEM_SLOTS_MAX = 400
const SLOTS_MAX = 5000

const invalid = (detail?: string) => new Error(detail ? `LAYOUT_INVALID: ${detail}` : 'LAYOUT_INVALID')
const isObject = (value: unknown): value is Raw => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const whole = (value: unknown, min = 1) => (Number.isInteger(value) && (value as number) >= min ? (value as number) : undefined)
const ownerOf = (value: unknown) => (OWNERS.includes(value as LayoutOwner) ? (value as LayoutOwner) : undefined)
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const defined = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T

// The spike's input limits; a number outside them is a broken file, not something to guess at.
function limited(value: unknown, min: number, max: number, detail: string): number | undefined {
  if (typeof value !== 'number') return undefined
  if (!Number.isInteger(value) || value < min || value > max) throw invalid(detail)
  return value
}

function numberMap(value: unknown, max: number, limit: number, detail: string): Record<number, number> | undefined {
  if (!isObject(value)) return undefined
  const entries = Object.entries(value).filter(([key, n]) => whole(Number(key)) && Number(key) <= max && limited(n, 1, limit, detail))
  return entries.length ? Object.fromEntries(entries.map(([key, n]) => [Number(key), n as number])) : undefined
}

const positions = (value: unknown, max: number) => (Array.isArray(value) ? value.filter((pos): pos is number => !!whole(pos) && pos <= max) : undefined)

function pullOf(value: unknown, label: string): LayoutPull | undefined {
  if (!isObject(value) || !value.on) return undefined
  const count = limited(value.count, 1, 200, t(`Udtrækket i ${label} skal have 1–200 udtræk`, `The pull-out in ${label} must have 1–200 units`)) ?? 1
  const shelves = limited(value.shelves, 1, 20, t(`Udtrækket i ${label} skal have 1–20 hylder`, `The pull-out in ${label} must have 1–20 shelves`)) ?? 1
  const perUnit = numberMap(value.perUnit, count, 20, t(`Udtrækket i ${label} skal have 1–20 hylder pr. udtræk`, `The pull-out in ${label} must have 1–20 shelves per unit`))
  return defined({ count, firstNo: whole(value.firstNo, 0) ?? 1, shelves, perUnit, owner: ownerOf(value.owner) })
}

function itemOf(raw: unknown, hall: { w: number; h: number }): { item: LayoutItem; spikeSlots: Raw; pickArea: boolean } {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id || !TYPES[text(raw.type)]) throw invalid()
  if (![raw.x, raw.y, raw.w, raw.h].every(finite) || (raw.w as number) <= 0 || (raw.h as number) <= 0) throw invalid()
  const type = TYPES[text(raw.type)]
  const w = Math.min(raw.w as number, hall.w)
  const h = Math.min(raw.h as number, hall.h)
  const label = text(raw.name) || text(raw.type)
  const bays = limited(raw.bays, 1, 200, t(`${label} skal have 1–200 fag`, `${label} must have 1–200 bays`))
  const rot = isObject(raw.rot) && [raw.rot.cx, raw.rot.cy, raw.rot.x, raw.rot.y].every(finite) ? (raw.rot as LayoutItem['rot']) : undefined
  const cut = Array.isArray(raw.cut) ? raw.cut.filter((cell): cell is [number, number] => Array.isArray(cell) && cell.length === 2 && cell.every(finite)) : undefined
  const item: LayoutItem = defined({
    id: raw.id, type,
    x: clamp(raw.x as number, 0, hall.w - w), y: clamp(raw.y as number, 0, hall.h - h), w, h,
    rot, cut: cut?.length ? cut : undefined,
    name: text(raw.name), note: text(raw.note),
    owner: ownerOf(raw.owner),
    floor: raw.level === 'mezz' || raw.level === 'ground' ? raw.level : undefined,
    visual: raw.visual === true ? true : undefined,
    bays, levels: limited(raw.levels, 1, 12, t(`${label} skal have 1–12 niveauer`, `${label} must have 1–12 levels`)),
    firstNo: whole(raw.firstNo, 0),
    firstBay: raw.firstBay === 'end' || raw.firstBay === 'start' ? raw.firstBay : undefined,
    bayLevels: type === 'rack' ? numberMap(raw.bayLevels, bays ?? 1, 12, t(`${label} skal have 1–12 niveauer pr. fag`, `${label} must have 1–12 levels per bay`)) : undefined,
    aisles: type === 'rack' ? positions(raw.aisles, bays ?? 1) : undefined,
    spacers: type === 'rack' ? positions(raw.spacers, bays ?? 1) : undefined,
    pull: type === 'rack' ? pullOf(raw.pull, label) : undefined,
    count: limited(raw.count, 1, 200, t(`${label} skal have 1–200 pladser`, `${label} must have 1–200 places`)),
    depth: limited(raw.depth, 1, 6, t(`${label} skal have en dybde på 1–6`, `${label} must have a depth of 1–6`)),
    depthFlip: type === 'floorrow' ? !!raw.depthFlip : undefined,
    sections: type === 'shelfrack' ? 1 : undefined,
    shelves: type === 'shelfrack' ? limited(raw.shelves, 1, 20, t(`${label} skal have 1–20 hylder`, `${label} must have 1–20 shelves`)) : undefined,
    slots: [],
  })
  return { item, spikeSlots: isObject(raw.slots) ? raw.slots : {}, pickArea: raw.type === 'pick' }
}

// Names the backend would refuse: too long gets cut (and kept as typed), none means no place.
function storable(slot: LayoutSlot): LayoutSlot {
  if (slot.name.length > NAME_MAX) return { ...slot, name: slot.name.slice(0, NAME_MAX).trim(), manual: true }
  if (!slot.name && PLACE_KINDS.includes(slot.kind)) return { ...slot, kind: 'blocked' }
  return slot
}

function slotsOf(item: LayoutItem, spikeSlots: Raw, pickArea: boolean, newId: () => string): LayoutSlot[] {
  const slots = regenerateSlots(item, newId).map(slot => {
    const kind = slot.unit == null && slot.level != null ? KINDS[text(spikeSlots[`${slot.pos}-${slot.level}`])] : undefined
    if (kind) return { ...slot, ...kind }
    return pickArea ? { ...slot, purpose: 'pick' as const } : slot
  })
  return proposeNames({ ...item, slots }, {}).slots.map(storable)
}

/** The throwaway drawing tool's saved JSON as a first draft. Throws LAYOUT_INVALID for anything else. */
export function fromSpike(raw: unknown, newId: () => string): Omit<LayoutDraft, 'editedBy' | 'editedAt'> {
  if (!isObject(raw) || !isObject(raw.hall) || !finite(raw.hall.w) || !finite(raw.hall.h) || !Array.isArray(raw.items)) throw invalid()
  const hall = { w: clamp(raw.hall.w, HALL_MIN, HALL_MAX), h: clamp(raw.hall.h, HALL_MIN, HALL_MAX) }
  let total = 0
  const items = raw.items.map(spike => {
    const { item, spikeSlots, pickArea } = itemOf(spike, hall)
    const slots = slotsOf(item, spikeSlots, pickArea, newId)
    const label = item.name || item.type
    if (slots.length > ITEM_SLOTS_MAX) throw invalid(t(`${label} har mere end ${ITEM_SLOTS_MAX} pladser`, `${label} has more than ${ITEM_SLOTS_MAX} places`))
    total += slots.length
    if (total > SLOTS_MAX) throw invalid(t(`Højst ${SLOTS_MAX} pladser på tegningen`, `At most ${SLOTS_MAX} places in the drawing`))
    return { ...item, slots }
  })
  return { version: 0, basedOn: 0, hall, notes: text(raw.notes), items, decisions: { outside: [], remove: [] } }
}
