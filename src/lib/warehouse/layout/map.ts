import type { LayoutItem, LayoutItemType, LayoutOwner, LayoutSlot, LocationList, MapContents, MapPlaceContent, WarehouseLayout } from '@/types/warehouse'
import type { SlotStatus } from '@/views/warehouse/locations/layout/RackFront'
import { formatNumber } from '../format'
import { locationKeyOf } from '../locations'
import { t } from '../text'
import { isPlaceSlot } from './slots'

export type MapPlace = LocationList['locations'][number]
export interface MapContext { team: LayoutOwner; places: Map<string, MapPlace>; linked: Set<string>; contents: MapContents }

export interface MapHitPlace { id: string; name: string; itemId: string | null; slotId: string | null; oldest: boolean }
export interface MapHit { kind: 'place' | 'material'; material?: string; description?: string; places: MapHitPlace[] }
export interface MapSearch { hits: MapHit[]; focus: { itemId: string; slotId: string; placeId: string } | null; items: string[] }

// Only these types carry an owner (as on the drawing).
const OWNED: LayoutItemType[] = ['rack', 'floorrow', 'floor']
const MAX_HITS = 8
const MIN_QUERY = 2

export function contextOf(list: LocationList, contents: MapContents, team: LayoutOwner): MapContext {
  return {
    team,
    places: new Map(list.locations.map(place => [locationKeyOf(place.name), place])),
    linked: new Set((list.drawing?.linked ?? []).map(locationKeyOf)),
    contents,
  }
}

const otherTeam = (item: LayoutItem, slot: LayoutSlot, team: LayoutOwner) =>
  OWNED.includes(item.type) && ((slot.unit != null ? item.pull?.owner : item.owner) ?? 'TCD') !== team

/** The place id a slot stands for, or null (unnamed pick, aisle, blocked, another team's item, not in the list or not linked). */
export function placeOfSlot(item: LayoutItem, slot: LayoutSlot, ctx: MapContext): string | null {
  if (!isPlaceSlot(item, slot, ctx.team)) return null
  const id = locationKeyOf(slot.name)
  return id && ctx.linked.has(id) && ctx.places.has(id) ? id : null
}

export function slotStatus(item: LayoutItem, slot: LayoutSlot, ctx: MapContext): SlotStatus {
  if (otherTeam(item, slot, ctx.team)) return 'other-team'
  const id = placeOfSlot(item, slot, ctx)
  const place = id ? ctx.places.get(id) : undefined
  if (!place || !place.active) return 'none'
  if (place.purpose === 'reserved') return 'reserved'
  if (place.purpose === 'pick') return 'pick'
  return place.used > 0 || place.stockCount > 0 ? 'used' : 'empty'
}

/** "R162-0717", "R330-0001 +2", "" when empty. */
export function cellText(content: MapPlaceContent | undefined): string {
  const materials = content?.materials ?? []
  if (!materials.length) return ''
  return materials.length > 1 ? `${materials[0].material} +${materials.length - 1}` : materials[0].material
}

function amountOf({ pallets, quantity, fixed }: MapPlaceContent['materials'][number]): string {
  const stk = quantity != null ? `${formatNumber(quantity)} ${t('stk', 'pcs')}` : ''
  if (pallets > 0) {
    const count = pallets === 1 ? t('1 palle', '1 pallet') : t(`${formatNumber(pallets)} paller`, `${formatNumber(pallets)} pallets`)
    return stk ? `${count} · ${stk}` : count
  }
  return stk || (fixed ? t('fast', 'fixed') : '')
}

/** Tooltip: "A2.3 · 3 materialer\nR330-0001 · Kabelbakke 2m (1 palle)\n…\nKlik → pladskortet". */
export function contentTitle(name: string, content: MapPlaceContent | undefined): string {
  const materials = content?.materials ?? []
  const count = materials.length === 1 ? t('1 materiale', '1 material') : t(`${materials.length} materialer`, `${materials.length} materials`)
  const lines = materials.map(item => {
    const amount = amountOf(item)
    return `${item.material}${item.description ? ` · ${item.description}` : ''}${amount ? ` (${amount})` : ''}`
  })
  return [`${name} · ${count}`, ...lines, t('Klik → pladskortet', 'Click → the place card')].join('\n')
}

export function findSlot(layout: Pick<WarehouseLayout, 'items'>, placeId: string, ctx: MapContext): { itemId: string; slotId: string } | null {
  const id = locationKeyOf(placeId)
  if (!id) return null
  for (const item of layout.items) {
    for (const slot of item.slots) if (placeOfSlot(item, slot, ctx) === id) return { itemId: item.id, slotId: slot.id }
  }
  return null
}

export function canShowOnMap(placeId: string, drawing: LocationList['drawing']): boolean {
  const id = locationKeyOf(placeId)
  return !!drawing && !!id && drawing.linked.some(linked => locationKeyOf(linked) === id)
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

export function searchMap(query: string, layout: Pick<WarehouseLayout, 'items'>, ctx: MapContext): MapSearch {
  const text = query.trim()
  if (text.length < MIN_QUERY) return { hits: [], focus: null, items: [] }
  const key = locationKeyOf(text)
  const lower = text.toLowerCase()
  const hitPlace = (id: string, oldest = false): MapHitPlace => {
    const at = findSlot(layout, id, ctx)
    return { id, name: ctx.places.get(id)?.name ?? id, itemId: at?.itemId ?? null, slotId: at?.slotId ?? null, oldest }
  }

  const placeIds = [...ctx.places.keys()].filter(id => id.startsWith(key)).sort((a, b) => Number(b === key) - Number(a === key) || byName(a, b))
  const placeHits: MapHit[] = placeIds.map(id => ({ kind: 'place', places: [hitPlace(id)] }))

  const found = new Map<string, { description: string; ids: string[] }>()
  for (const [id, content] of Object.entries(ctx.contents.places)) {
    for (const { material, description } of content.materials) {
      if (!material.toUpperCase().startsWith(text.toUpperCase()) && !description.toLowerCase().includes(lower)) continue
      const entry = found.get(material) ?? { description, ids: [] }
      if (!entry.description) entry.description = description
      if (!entry.ids.includes(id)) entry.ids.push(id)
      found.set(material, entry)
    }
  }
  const materialHits: MapHit[] = [...found.keys()].sort(byName).map(material => {
    const { description, ids } = found.get(material)!
    const oldest = ctx.contents.oldest[material]
    const places = ids.sort((a, b) => Number(b === oldest) - Number(a === oldest) || byName(a, b)).map(id => hitPlace(id, id === oldest))
    return { kind: 'material', material, description, places }
  })

  const hits = [...placeHits, ...materialHits].slice(0, MAX_HITS)
  const items = [...new Set(hits.flatMap(hit => hit.places.map(p => p.itemId)).filter((id): id is string => id != null))]
  return { hits, focus: focusOf(hits, key, ctx), items }
}

function focusOf(hits: MapHit[], key: string, ctx: MapContext): MapSearch['focus'] {
  const exact = hits.find(hit => hit.kind === 'place' && hit.places[0].id === key)
  const target = exact ? exact.places[0] : materialTarget(hits.find(hit => hit.kind === 'material'), ctx)
  return target?.itemId && target.slotId ? { itemId: target.itemId, slotId: target.slotId, placeId: target.id } : null
}

/** The oldest pallet's place (as Tag); else the pick place with the material fixed; else its largest quantity – never a reserved or inactive place. */
function materialTarget(hit: MapHit | undefined, ctx: MapContext): MapHitPlace | undefined {
  if (!hit) return undefined
  const oldest = hit.places.find(p => p.oldest)
  if (oldest) return oldest
  const usable = hit.places.filter(p => {
    const place = ctx.places.get(p.id)
    return !!place && place.active && place.purpose !== 'reserved'
  })
  const entry = (id: string) => ctx.contents.places[id]?.materials.find(item => item.material === hit.material)
  const pick = usable.find(p => ctx.places.get(p.id)?.purpose === 'pick' && entry(p.id)?.fixed)
  if (pick) return pick
  return usable
    .filter(p => entry(p.id)?.quantity != null)
    .sort((a, b) => (entry(b.id)?.quantity ?? 0) - (entry(a.id)?.quantity ?? 0))[0]
}
