import type { LayoutItem, LayoutSlot, WarehouseLayout } from '@/types/warehouse'
import { formatNumber } from '../format'
import { locationKeyOf } from '../locations'
import { t } from '../text'
import { findSlot, type MapContext } from './map'

export interface Peek { placeId: string; name: string; item: LayoutItem; slotId: string; floor: 'ground' | 'mezz'; level: string; title: string; visible: Set<string> }

/** "gulvniveau", "3. niveau fra gulvet", "hylde 2 fra oven", "gulvplads (plads til 2 paller)", "gulvområde"; '' for a special place. */
export function levelText(item: LayoutItem, slot: LayoutSlot): string {
  if (slot.unit != null || slot.section != null) return t(`hylde ${slot.shelf} fra oven`, `shelf ${slot.shelf} from the top`)
  if (slot.level != null) return slot.level === 1 ? t('gulvniveau', 'ground level') : t(`${slot.level}. niveau fra gulvet`, `level ${slot.level} from the floor`)
  if (item.type === 'floorrow') {
    const capacity = slot.capacity ?? 1
    const pallets = capacity === 1 ? t('1 palle', '1 pallet') : t(`${formatNumber(capacity)} paller`, `${formatNumber(capacity)} pallets`)
    return t(`gulvplads (plads til ${pallets})`, `floor place (room for ${pallets})`)
  }
  if (item.type === 'floor') return t('gulvområde', 'floor area')
  return ''
}

/** "Reol C" for a pallet rack, else the item's own name ("S", "H-reol 1"). */
export function itemTitle(item: LayoutItem): string {
  return item.type === 'rack' ? t(`Reol ${item.name}`, `Rack ${item.name}`) : item.name
}

/** The column of a slot within its block: bay or floor position (pos), pull-out unit or shelfrack section. */
function columnOf(slot: LayoutSlot): { block: 'unit' | 'section' | 'pos'; at: number } | null {
  if (slot.unit != null) return { block: 'unit', at: slot.unit }
  if (slot.section != null) return { block: 'section', at: slot.section }
  if (slot.pos != null) return { block: 'pos', at: slot.pos }
  return null
}

/** The slots shown in the peek: every slot in the slot's column ± 1 of the same block (bays, pull-out units, sections or floor positions). */
export function neighbourSlots(item: LayoutItem, slot: LayoutSlot): Set<string> {
  const own = columnOf(slot)
  if (!own) return new Set([slot.id])
  return new Set(item.slots.filter(other => {
    const col = columnOf(other)
    return !!col && col.block === own.block && Math.abs(col.at - own.at) <= 1
  }).map(other => other.id))
}

/** What the peek shows for a typed place; null when it is not on the drawing. */
export function peekOf(layout: Pick<WarehouseLayout, 'items'>, place: string, ctx: MapContext): Peek | null {
  const placeId = locationKeyOf(place)
  if (!placeId) return null
  const found = findSlot(layout, placeId, ctx)
  if (!found) return null
  const item = layout.items.find(entry => entry.id === found.itemId)
  const slot = item?.slots.find(entry => entry.id === found.slotId)
  if (!item || !slot) return null
  return {
    placeId,
    name: ctx.places.get(placeId)?.name ?? slot.name,
    item,
    slotId: slot.id,
    floor: item.floor ?? 'ground',
    level: levelText(item, slot),
    title: itemTitle(item),
    visible: neighbourSlots(item, slot),
  }
}
