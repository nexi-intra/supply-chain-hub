import type { LayoutItem, LayoutOwner, LayoutSlot, LayoutSlotKind, WarehouseLayout } from '@/types/warehouse'
import { locationKeyOf } from '../locations'
import { t } from '../text'

const count = (v: number | undefined, fallback = 1) => Math.max(1, Math.round(v ?? fallback) || fallback)
const reversed = (item: LayoutItem) => item.firstBay === 'end'

// pos = physical bay from the start (1..bays); aisles, per-bay levels and slots are stored by pos.
export const bayNo = (item: LayoutItem, pos: number) => (item.firstNo ?? 1) + (reversed(item) ? count(item.bays) - pos : pos - 1)
export const bayPos = (item: LayoutItem, no: number) => (reversed(item) ? count(item.bays) - (no - (item.firstNo ?? 1)) : no - (item.firstNo ?? 1) + 1)
export const levelsOf = (item: LayoutItem, pos: number) => count(item.bayLevels?.[pos] ?? item.levels)
export const isSpacer = (item: LayoutItem, pos: number) => (item.spacers ?? []).includes(pos)
export const pullNo = (item: LayoutItem, unit: number) => (item.pull?.firstNo ?? 1) + (reversed(item) ? count(item.pull?.count) - unit : unit - 1)
export const shelvesOfUnit = (item: LayoutItem, unit: number) => count(item.pull?.perUnit?.[unit] ?? item.pull?.shelves)
const shelvesOfSection = (item: LayoutItem, section: number) => count(item.perSection?.[section] ?? item.shelves)
const floorNo = (item: LayoutItem, pos: number) => (item.firstNo ?? 0) + (reversed(item) ? count(item.count) - pos : pos - 1)

export function slotKey(slot: Partial<LayoutSlot>): string {
  if (slot.unit != null) return `u${slot.unit}-h${slot.shelf}`
  if (slot.section != null) return `s${slot.section}-h${slot.shelf}`
  if (slot.level != null) return `b${slot.pos}-l${slot.level}`
  if (slot.pos != null) return `p${slot.pos}`
  return 'one'
}

type Position = Omit<LayoutSlot, 'id' | 'name'>

function positionsOf(item: LayoutItem): Position[] {
  if (item.visual) return []
  const out: Position[] = []
  switch (item.type) {
    case 'rack':
      for (let pos = 1; pos <= count(item.bays); pos++) {
        if (isSpacer(item, pos)) continue
        for (let level = 1; level <= levelsOf(item, pos); level++) {
          out.push({ kind: level === 1 && (item.aisles ?? []).includes(pos) ? 'aisle' : 'pallet', purpose: 'reserve', pos, level })
        }
      }
      if (item.pull) {
        for (let unit = 1; unit <= count(item.pull.count); unit++) {
          for (let shelf = 1; shelf <= shelvesOfUnit(item, unit); shelf++) out.push({ kind: 'shelf', purpose: 'reserve', unit, shelf })
        }
      }
      return out
    case 'shelfrack':
      for (let section = 1; section <= count(item.sections); section++) {
        for (let shelf = 1; shelf <= shelvesOfSection(item, section); shelf++) out.push({ kind: 'shelf', purpose: 'reserve', section, shelf })
      }
      return out
    case 'floorrow':
      for (let pos = 1; pos <= count(item.count); pos++) out.push({ kind: 'pallet', purpose: 'reserve', capacity: Math.min(6, count(item.depth)), pos })
      return out
    case 'floor':
      return [{ kind: 'floor', purpose: 'reserve' }]
    case 'special':
      return [{ kind: 'special', purpose: 'reserve' }]
    default:
      return []
  }
}

/** The slots for the item's current size; existing slots are kept by position, new ones get a proposed name. */
export function regenerateSlots(item: LayoutItem, newId: () => string): LayoutSlot[] {
  const existing = new Map(item.slots.map(slot => [slotKey(slot), slot]))
  const created: string[] = []
  const slots = positionsOf(item).map(position => {
    const kept = existing.get(slotKey(position))
    if (kept) return item.type === 'floorrow' ? { ...kept, capacity: position.capacity } : kept
    const id = newId()
    created.push(id)
    return { id, name: '', ...position }
  })
  return proposeNames({ ...item, slots }, { slotIds: created }).slots
}

const PULL_PATTERN = '{reol}{udtraek} H{hylde}'
const COUNTED: LayoutSlotKind[] = ['pallet', 'shelf', 'aisle']
const UNNAMED: LayoutSlotKind[] = ['aisle', 'blocked', 'pick-unnamed']

function patternOf(item: LayoutItem, slot: LayoutSlot): string {
  if (slot.unit != null) return PULL_PATTERN
  if (item.type === 'rack') return (slot.level != null ? item.levelPatterns?.[slot.level] : undefined) ?? item.pattern ?? '{reol}{fag}.{n}'
  if (item.type === 'shelfrack' || item.type === 'floorrow') return item.pattern ?? '{reol}{nr}'
  return item.pattern ?? '{reol}'
}

/** Fills `{key}` placeholders (æ may be written ae, so `{udtræk}` = `{udtraek}`); unknown ones stay as typed. */
export function fillPattern(pattern: string, values: Record<string, string | number | undefined>): string {
  return pattern
    .replace(/\{([^{}]+)\}/gu, (match, key: string) => {
      const name = key.replace(/æ/gu, 'ae')
      return name in values ? String(values[name] ?? '') : match
    })
    .trim()
}

export const isUnnamed = (slot: LayoutSlot) => UNNAMED.includes(slot.kind)

/** The longest place name the backend takes. */
export const NAME_MAX = 30
export const capName = (name: string) => name.slice(0, NAME_MAX).trim()

/** The placeholder values (reol, fag, n, niveau, udtraek, hylde, nr) for a slot of the item. */
export function slotValues(item: LayoutItem, slot: LayoutSlot): Record<string, string | number | undefined> {
  const values: Record<string, string | number | undefined> = { reol: item.name, niveau: slot.level, hylde: slot.shelf }
  if (slot.unit != null) values.udtraek = pullNo(item, slot.unit)
  else if (item.type === 'rack' && slot.pos != null) {
    values.fag = bayNo(item, slot.pos)
    values.n = item.slots.filter(s => s.pos === slot.pos && s.unit == null && (s.level ?? 0) <= (slot.level ?? 0) && COUNTED.includes(s.kind)).length
  } else if (item.type === 'floorrow' && slot.pos != null) values.nr = floorNo(item, slot.pos)
  else if (item.type === 'shelfrack') {
    const order = item.slots.filter(s => s.section != null).sort((a, b) => a.section! - b.section! || a.shelf! - b.shelf!)
    values.nr = (item.firstNo ?? 1) + order.findIndex(s => s.id === slot.id)
  }
  return values
}

const patternName = (item: LayoutItem, slot: LayoutSlot) => (isUnnamed(slot) ? '' : fillPattern(patternOf(item, slot), slotValues(item, slot)))
const proposedName = (item: LayoutItem, slot: LayoutSlot) => capName(patternName(item, slot))

/** How many of the item's slots get a name from the patterns that is longer than NAME_MAX (and is cut). */
export const tooLongNames = (item: LayoutItem) => item.slots.filter(slot => !slot.manual && patternName(item, slot).length > NAME_MAX).length

/** Names from the patterns; a hand-typed (`manual`) name is kept unless its slot is in `slotIds`. */
export function proposeNames(item: LayoutItem, { slotIds }: { slotIds?: string[] }): LayoutItem {
  const chosen = slotIds ? new Set(slotIds) : null
  const slots = item.slots.map(slot => {
    if (chosen ? !chosen.has(slot.id) : slot.manual) return slot
    const { manual: _manual, ...rest } = slot
    return { ...rest, name: proposedName(item, slot) }
  })
  return { ...item, slots }
}

export function slotLabel(item: LayoutItem, slot: LayoutSlot): string {
  if (slot.name) return slot.name
  if (slot.kind === 'pick-unnamed') {
    const bay = `${item.name}${slot.pos != null ? bayNo(item, slot.pos) : ''}`
    return t(`Pluk under ${bay}`, `Pick below ${bay}`)
  }
  if (slot.kind === 'aisle') return t('Køregang', 'Aisle')
  return t('Ingen plads', 'No place')
}

const PLACE_KINDS: LayoutSlotKind[] = ['pallet', 'shelf', 'floor', 'special']

/** A slot that becomes one of the team's places when the drawing is published. */
export const isPlaceSlot = (item: LayoutItem, slot: LayoutSlot, team: LayoutOwner) =>
  !item.visual && PLACE_KINDS.includes(slot.kind) && ((slot.unit != null ? item.pull?.owner : item.owner) ?? 'TCD') === team

/** The reserve/pick the published drawing gives a place; null for a special place or one not on it. */
export function drawnPurposeOf(layout: Pick<WarehouseLayout, 'items'>, team: LayoutOwner, id: string): 'reserve' | 'pick' | null {
  for (const item of layout.items) {
    for (const slot of item.slots) if (slot.kind !== 'special' && isPlaceSlot(item, slot, team) && locationKeyOf(slot.name) === id) return slot.purpose
  }
  return null
}

/** Place ids used by more than one of the team's place slots. */
export function duplicateNames(layout: Pick<WarehouseLayout, 'items'>, team: LayoutOwner): Set<string> {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const item of layout.items) {
    for (const slot of item.slots) {
      const id = locationKeyOf(slot.name)
      if (!id || !isPlaceSlot(item, slot, team)) continue
      if (seen.has(id)) twice.add(id)
      seen.add(id)
    }
  }
  return twice
}
