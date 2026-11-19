import { describe, expect, it } from 'vitest'
import type { LayoutItem, LocationList, MapContents, WarehouseLayout } from '@/types/warehouse'
import { contextOf } from './map'
import { itemTitle, levelText, neighbourSlots, peekOf } from './peek'
import { proposeNames, regenerateSlots } from './slots'
import { place } from './testFixtures'

let next = 0
const build = (item: LayoutItem): LayoutItem => proposeNames({ ...item, slots: regenerateSlots(item, () => `s${++next}`) }, {})
const base: LayoutItem = { id: '', type: 'rack', x: 0, y: 0, w: 10, h: 2, name: '', note: '', slots: [] }

const rackC = build({ ...base, id: 'C', name: 'C', bays: 5, levels: 4, pull: { count: 2, firstNo: 1, shelves: 3 } })
const rowS = build({ ...base, id: 'S', type: 'floorrow', name: 'S', count: 3, depth: 2 })
const shelfRack = build({ ...base, id: 'H', type: 'shelfrack', name: 'H-reol 1', sections: 2, shelves: 4 })
const floorA = build({ ...base, id: 'G', type: 'floor', name: 'GA' })
const upstairs = build({ ...base, id: 'U', type: 'floor', name: 'UP1', floor: 'mezz' })
const items = [rackC, rowS, shelfRack, floorA, upstairs]
const layout: Pick<WarehouseLayout, 'items'> = { items }

const slotAt = (item: LayoutItem, at: { pos?: number; level?: number; unit?: number; shelf?: number; section?: number }) =>
  item.slots.find(s => (Object.keys(at) as (keyof typeof at)[]).every(key => s[key] === at[key]))!
const slotById = (item: LayoutItem, id: string) => item.slots.find(s => s.id === id)!
const cols = (item: LayoutItem, ids: Set<string>) => [...new Set([...ids].map(id => slotById(item, id).pos!))].sort((a, b) => a - b)

const names = items.flatMap(item => item.slots.map(s => s.name)).filter(Boolean)
const list: LocationList = {
  locations: [...names, 'K1.1'].map(name => place(name)),
  tags: [], canAdmin: false, imported: true, live: true,
  drawing: { version: 2, linked: names },
}
const contents: MapContents = { places: {}, oldest: {} }
const ctx = contextOf(list, contents, 'TCD')

describe('peek rules', () => {
  it('levelText names the level in plain words', () => {
    expect(levelText(rackC, slotAt(rackC, { pos: 3, level: 1 }))).toBe('gulvniveau')
    expect(levelText(rackC, slotAt(rackC, { pos: 3, level: 3 }))).toBe('3. niveau fra gulvet')
    expect(levelText(rackC, slotAt(rackC, { unit: 1, shelf: 2 }))).toBe('hylde 2 fra oven')
    expect(levelText(shelfRack, slotAt(shelfRack, { section: 1, shelf: 4 }))).toBe('hylde 4 fra oven')
    expect(levelText(rowS, slotAt(rowS, { pos: 1 }))).toBe('gulvplads (plads til 2 paller)')
    expect(levelText(floorA, floorA.slots[0])).toBe('gulvområde')
  })

  it('levelText says "1 palle" for a floor place of depth 1 and nothing for a special place', () => {
    const row1 = build({ ...base, id: 'S1', type: 'floorrow', name: 'T', count: 1, depth: 1 })
    expect(levelText(row1, row1.slots[0])).toBe('gulvplads (plads til 1 palle)')
    const special = build({ ...base, id: 'X', type: 'special', name: 'Bord' })
    expect(levelText(special, special.slots[0])).toBe('')
  })

  it('itemTitle calls a pallet rack "Reol C" and anything else by its name', () => {
    expect(itemTitle(rackC)).toBe('Reol C')
    expect(itemTitle(shelfRack)).toBe('H-reol 1')
    expect(itemTitle(rowS)).toBe('S')
  })

  it('neighbourSlots shows the bay ± 1, only one neighbour at the edge, and only the pull-out block for a pull-out shelf', () => {
    expect(cols(rackC, neighbourSlots(rackC, slotAt(rackC, { pos: 3, level: 2 })))).toEqual([2, 3, 4])
    expect(cols(rackC, neighbourSlots(rackC, slotAt(rackC, { pos: 1, level: 2 })))).toEqual([1, 2])
    const pull = neighbourSlots(rackC, slotAt(rackC, { unit: 1, shelf: 2 }))
    expect([...pull].every(id => slotById(rackC, id).unit != null)).toBe(true)
  })

  it('neighbourSlots takes every level of the shown bays, and the section or floor position ± 1', () => {
    expect(neighbourSlots(rackC, slotAt(rackC, { pos: 3, level: 2 })).size).toBe(12)
    expect(neighbourSlots(rackC, slotAt(rackC, { unit: 1, shelf: 2 })).size).toBe(6)
    const sections = neighbourSlots(shelfRack, slotAt(shelfRack, { section: 2, shelf: 1 }))
    expect([...sections].map(id => slotById(shelfRack, id).section)).toEqual([1, 1, 1, 1, 2, 2, 2, 2])
    expect(cols(rowS, neighbourSlots(rowS, slotAt(rowS, { pos: 3 })))).toEqual([2, 3])
  })

  it('peekOf finds a typed place however it is written, and gives null off the drawing', () => {
    expect(peekOf(layout, ' c3.3 ', ctx)).toMatchObject({ placeId: 'C3.3', level: '3. niveau fra gulvet', title: 'Reol C' })
    expect(peekOf(layout, 'K1.1', ctx)).toBeNull()
    expect(peekOf(layout, 'UP1', ctx)?.floor).toBe('mezz')
  })

  it('peekOf names the place as the list does and points at its item, slot and neighbours', () => {
    const peek = peekOf(layout, 'c3.3', ctx)!
    const slot = slotAt(rackC, { pos: 3, level: 3 })
    expect(peek).toMatchObject({ name: 'C3.3', slotId: slot.id, floor: 'ground' })
    expect(peek.item.id).toBe('C')
    expect(peek.visible).toEqual(neighbourSlots(rackC, slot))
    expect(peekOf(layout, '', ctx)).toBeNull()
  })
})
