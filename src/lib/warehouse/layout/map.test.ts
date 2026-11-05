import { describe, expect, it } from 'vitest'
import type { LayoutItem, LayoutSlot, LocationList, MapContents, WarehouseLayout } from '@/types/warehouse'
import { canShowOnMap, cellText, contentTitle, contextOf, dayMonth, findSlot, frontData, placeOfSlot, searchMap, slotStatus } from './map'
import { m, place } from './testFixtures'

const base: LayoutItem = { id: 'r1', type: 'rack', x: 0, y: 0, w: 10, h: 2, name: '', note: '', slots: [] }
const rackSlot = (name: string, pos: number, level: number, extra: Partial<LayoutSlot> = {}): LayoutSlot => ({ id: `A-${pos}-${level}`, name, kind: 'pallet', purpose: 'reserve', pos, level, ...extra })
// Bay 3 holds the pick place without a name.
const rackA: LayoutItem = {
  ...base, id: 'A', name: 'A', bays: 3, levels: 2,
  slots: [rackSlot('A1.1', 1, 1), rackSlot('A1.2', 1, 2), rackSlot('A2.1', 2, 1, { purpose: 'pick' }), rackSlot('A2.2', 2, 2), rackSlot('', 3, 1, { kind: 'pick-unnamed', purpose: 'pick' })],
}
const unnamed = rackA.slots[4]
const trrRack: LayoutItem = { ...base, id: 'D', name: 'D', owner: 'TRR', bays: 1, levels: 1, slots: [{ id: 'D-1-1', name: 'A2.2', kind: 'pallet', purpose: 'reserve', pos: 1, level: 1 }] }
const layout: Pick<WarehouseLayout, 'items'> = { items: [trrRack, rackA] }
const slot = (name: string) => rackA.slots.find(s => s.name === name)!
const slotIdOf = (name: string) => slot(name).id

type Place = LocationList['locations'][number]

const listOf = (overrides: Record<string, Partial<Place>> = {}): LocationList => ({
  locations: [place('A1.1'), place('A1.2'), place('A2.1', { purpose: 'pick', fixedMaterials: ['X9'] }), place('A2.2'), place('K1.1')].map(p => ({ ...p, ...overrides[p.name] })),
  tags: [], canAdmin: false, imported: true, live: true,
  drawing: { version: 2, linked: ['A1.1', 'A1.2', 'A2.1', 'A2.2'] },
})
const contents: MapContents = {
  places: {
    'A1.1': { materials: [m('R162-0717', { description: 'Universal RJ45 kabel', pallets: 1, oldestAt: 200 }), m('X9', { quantity: 30 }), m('X8', { quantity: 5 })] },
    'A1.2': { materials: [m('X8', { quantity: 30 })] },
    'A2.1': { materials: [m('X9', { fixed: true })] },
    'A2.2': { materials: [m('R162-0717', { description: 'Universal RJ45 kabel', pallets: 1, oldestAt: 100 })] },
  },
  oldest: { 'R162-0717': 'A2.2' },
}
const ctx = contextOf(listOf(), contents, 'TCD')
const ctxWith = (overrides: Record<string, Partial<Place>>) => contextOf(listOf(overrides), contents, 'TCD')
const ctxNoOldest = contextOf(listOf(), { ...contents, oldest: {} }, 'TCD')

describe('map rules', () => {
  it('slotStatus follows the order other-team, none, inactive, reserved, pick, used, empty', () => {
    expect(slotStatus(trrRack, trrRack.slots[0], ctx)).toBe('other-team')
    expect(slotStatus(rackA, unnamed, ctx)).toBe('none')
    expect(slotStatus(rackA, slot('A1.1'), ctxWith({ 'A1.1': { active: false, used: 1 } }))).toBe('none')
    expect(slotStatus(rackA, slot('A1.1'), ctxWith({ 'A1.1': { purpose: 'reserved' } }))).toBe('reserved')
    expect(slotStatus(rackA, slot('A1.1'), ctxWith({ 'A1.1': { purpose: 'pick', used: 0 } }))).toBe('pick')
    expect(slotStatus(rackA, slot('A1.1'), ctxWith({ 'A1.1': { stockCount: 1 } }))).toBe('used')
    expect(slotStatus(rackA, slot('A1.1'), ctx)).toBe('empty')
  })

  it('a TRR slot named like a TCD place is never that place', () => {
    expect(placeOfSlot(trrRack, trrRack.slots[0], ctx)).toBeNull()
    expect(searchMap('A2.2', layout, ctx).focus).toEqual({ itemId: 'A', slotId: slotIdOf('A2.2'), placeId: 'A2.2' })
  })

  it('frontData gives the front its status and content: every slot a status, every place content (empty too)', () => {
    const contentsWithEmpty: MapContents = { ...contents, places: { ...contents.places, 'A1.2': { materials: [] } } }
    const front = frontData(rackA, contextOf(listOf({ 'A1.1': { stockCount: 1 } }), contentsWithEmpty, 'TCD'))
    expect(front.places).toBe(4)
    expect(front.used).toBe(1)
    expect(front.status).toEqual({ [slotIdOf('A1.1')]: 'used', [slotIdOf('A1.2')]: 'empty', [slotIdOf('A2.1')]: 'pick', [slotIdOf('A2.2')]: 'empty', [unnamed.id]: 'none' })
    expect(front.content[slotIdOf('A1.2')]).toEqual({ text: '', title: 'A1.2 · tom\nKlik → pladskortet' })
    expect(front.content[slotIdOf('A1.1')]).toEqual({ text: 'R162-0717 +2', title: contentTitle('A1.1', contents.places['A1.1']) })
    expect(front.content[unnamed.id]).toBeUndefined()
    expect(Object.keys(front.content)).toHaveLength(4)
  })

  it('cellText shows the first material and +N', () => {
    expect(cellText(undefined)).toBe('')
    expect(cellText({ materials: [m('R330-0001')] })).toBe('R330-0001')
    expect(cellText({ materials: [m('R330-0001'), m('R412-0090'), m('R550-1203')] })).toBe('R330-0001 +2')
  })

  it('contentTitle never shows undefined or an empty description', () => {
    const text = contentTitle('A2.3', { materials: [m('R330-0001', { description: '', pallets: 1 }), m('R550-1203', { description: 'Strips', pallets: 0, quantity: 40 })] })
    expect(text).toBe('A2.3 · 2 materialer\nR330-0001 (1 palle)\nR550-1203 · Strips (40 stk)\nKlik → pladskortet')
    expect(text).not.toMatch(/undefined| · \(/)
  })

  it('contentTitle calls a place without content "tom", not "0 materialer"', () => {
    expect(contentTitle('A1.4', undefined)).toBe('A1.4 · tom\nKlik → pladskortet')
    expect(contentTitle('A1.4', { materials: [] })).toBe('A1.4 · tom\nKlik → pladskortet')
  })

  it('contentTitle and frontData leave out "Klik → pladskortet" where a click does nothing (the put-away peek)', () => {
    expect(contentTitle('A1.4', undefined, { click: false })).toBe('A1.4 · tom')
    expect(contentTitle('A2.3', { materials: [m('R330-0001', { pallets: 1 })] }, { click: false })).not.toMatch(/Klik/)
    const contentsWithEmpty: MapContents = { ...contents, places: { ...contents.places, 'A1.2': { materials: [] } } }
    const peekCtx = contextOf(listOf({ 'A1.1': { stockCount: 1 } }), contentsWithEmpty, 'TCD')
    const front = frontData(rackA, peekCtx, { clickable: false })
    expect(front.content[slotIdOf('A1.2')]).toEqual({ text: '', title: 'A1.2 · tom' })
    expect(front.content[slotIdOf('A1.1')].title).toBe(contentTitle('A1.1', contents.places['A1.1'], { click: false }))
    expect(Object.values(front.content).every(entry => !entry.title.includes('Klik'))).toBe(true)
    expect(frontData(rackA, peekCtx)).toEqual({ ...front, content: frontData(rackA, peekCtx, { clickable: true }).content })
    expect(frontData(rackA, peekCtx).content[slotIdOf('A1.2')].title).toBe('A1.2 · tom\nKlik → pladskortet')
  })

  it('dayMonth writes a date as "dd.mm" like the spec\'s "ældste, 14.09"', () => {
    expect(dayMonth(new Date(2026, 8, 14, 9, 5).getTime())).toBe('14.09')
    expect(dayMonth(new Date(2026, 0, 3).getTime())).toBe('03.01')
    expect(dayMonth(null)).toBe('')
  })

  it('searchMap finds a typed or scanned place however it is written', () => {
    expect(searchMap(' a1.2 ', layout, ctx).focus?.placeId).toBe('A1.2')
    expect(searchMap('a', layout, ctx).hits).toEqual([])
  })

  it('searchMap points a material at the oldest pallet (same as Tag) and marks it', () => {
    const found = searchMap('R162', layout, ctx) // R162-0717 on A1.1 and A2.2; oldest: A2.2
    expect(found.focus?.placeId).toBe('A2.2')
    expect(found.hits[0].places.find(p => p.oldest)?.id).toBe('A2.2')
    expect(found.items).toEqual(['A'])
  })

  it('searchMap falls back to the pick place, then the largest quantity, when there is no oldest pallet', () => {
    // X9: fixed on the pick place A2.1 and 30 pcs on A1.1's shelf lines; X8: only 5 on A1.1 and 30 on A1.2; neither in `oldest`.
    expect(searchMap('X9', layout, ctxNoOldest).focus?.placeId).toBe('A2.1')
    expect(searchMap('X8', layout, ctxNoOldest).focus?.placeId).toBe('A1.2')
  })

  it('a place outside the drawing is "ikke på kortet": no slot and no Vis på kort', () => {
    const found = searchMap('K1.1', layout, ctx)
    expect(found.hits[0].places[0]).toMatchObject({ id: 'K1.1', itemId: null, slotId: null })
    expect(found.focus).toBeNull()
    expect(canShowOnMap('K1.1', { version: 2, linked: ['A1.1'] })).toBe(false)
    expect(canShowOnMap('a1.1', { version: 2, linked: ['A1.1'] })).toBe(true)
    expect(canShowOnMap('A1.1', null)).toBe(false)
  })

  it('findSlot finds the item and slot of a place, null for another team or an unknown place', () => {
    expect(findSlot(layout, 'A1.1', ctx)).toEqual({ itemId: 'A', slotId: slotIdOf('A1.1') })
    expect(findSlot(layout, 'NOPE', ctx)).toBeNull()
    expect(findSlot({ items: [trrRack] }, 'A2.2', ctx)).toBeNull()
  })

  it('searchMap shows at most 8 hits, the exact place first, and scans the drawing once', () => {
    const names = Array.from({ length: 12 }, (_, i) => `A1.${i + 1}`)
    const big: LocationList = { ...listOf(), locations: names.map(name => place(name)), drawing: { version: 2, linked: names } }
    let reads = 0
    const rack: LayoutItem = { ...base, id: 'B', name: 'A', bays: 12, levels: 1, slots: [] }
    const slots = names.map((name, i) => rackSlot(name, i + 1, 1))
    Object.defineProperty(rack, 'slots', { get: () => (reads++, slots) })
    const bigCtx = contextOf(big, { places: {}, oldest: {} }, 'TCD')

    const found = searchMap('A1', { items: [rack] }, bigCtx)
    expect(found.hits).toHaveLength(8)
    expect(found.hits.map(hit => hit.places[0].id)).toEqual(names.slice(0, 8))
    expect(found.hits.every(hit => hit.places[0].itemId === 'B')).toBe(true)
    expect(reads).toBe(1)

    const exact = searchMap('A1.12', { items: [rack] }, bigCtx)
    expect(exact.hits[0].places[0].id).toBe('A1.12')
    expect(exact.focus).toEqual({ itemId: 'B', slotId: slots[11].id, placeId: 'A1.12' })
  })

  it('searchMap caps material hits after the place hits', () => {
    const many: MapContents = { places: { 'A1.1': { materials: Array.from({ length: 10 }, (_, i) => m(`A1-${i}`)) } }, oldest: {} }
    const found = searchMap('A1', layout, contextOf(listOf(), many, 'TCD'))
    expect(found.hits).toHaveLength(8)
    expect(found.hits.slice(0, 2).map(hit => hit.kind)).toEqual(['place', 'place'])
    expect(found.hits.slice(2).map(hit => hit.material)).toEqual(['A1-0', 'A1-1', 'A1-2', 'A1-3', 'A1-4', 'A1-5'])
  })
})
