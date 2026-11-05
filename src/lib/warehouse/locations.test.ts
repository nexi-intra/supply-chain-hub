import { afterEach, describe, expect, it } from 'vitest'
import type { Location, LocationEvent } from '@/types/warehouse'
import { describeEvent, describeUndoEffect, formatAge, isDeferred, linkedChanges, linkedPurposes, locationKeyOf, materialLabel, palletLimitOf, shownQuantity, singleFlight, storedCapacityOf, targetFromItem } from './locations'
import { setWarehouseLanguage } from './text'

afterEach(() => setWarehouseLanguage('da'))

describe('Placeringer helpers', () => {
  it('materialLabel shows the SAP description next to the number when there is one', () => {
    expect(materialLabel('R162-0717', 'Ethernet Cable RJ45 2m')).toBe('R162-0717 · Ethernet Cable RJ45 2m')
    expect(materialLabel('R162-0717', '')).toBe('R162-0717')
    expect(materialLabel('R162-0717')).toBe('R162-0717')
  })

  it('formatAge says today, one day and many days in Danish and English', () => {
    setWarehouseLanguage('da')
    expect([formatAge(0), formatAge(1), formatAge(701)]).toEqual(['i dag', '1 dag', '701 dage'])
    setWarehouseLanguage('en')
    expect([formatAge(0), formatAge(1), formatAge(701)]).toEqual(['today', '1 day', '701 days'])
  })

  it('targetFromItem reads deep links from Hubert', () => {
    expect(targetFromItem('material:R162-0717')).toEqual({ kind: 'material', id: 'R162-0717' })
    expect(targetFromItem('location:A2.4')).toEqual({ kind: 'location', id: 'A2.4' })
    expect(targetFromItem('pallet:imp-12')).toEqual({ kind: 'pallet', id: 'imp-12' })
    expect(targetFromItem('refill')).toEqual({ kind: 'refill' })
    expect(targetFromItem('fetch:R162-0717')).toEqual({ kind: 'fetch', id: 'R162-0717' })
    expect(targetFromItem('move')).toEqual({ kind: 'move' })
    expect(targetFromItem('move:p1')).toEqual({ kind: 'move', id: 'p1' })
    expect(targetFromItem('log')).toEqual({ kind: 'log' })
    expect(targetFromItem('log:A1.1')).toEqual({ kind: 'log', id: 'A1.1' })
    expect(targetFromItem('')).toEqual({ kind: 'home' })
    expect(targetFromItem('nonsense:1')).toEqual({ kind: 'home' })
  })

  it('locationKeyOf writes a place like the backend: case and spaces do not matter', () => {
    expect(locationKeyOf(' a2.4 ')).toBe('A2.4')
    expect(locationKeyOf('Reol  X 1')).toBe('REOL X 1')
  })

  it('palletLimitOf mirrors palletLimit for a Palle with capacity 2', () => {
    expect(palletLimitOf({ type: 'Palle', purpose: 'reserve', capacity: 2 })).toBe(2)
    expect(palletLimitOf({ type: 'Palle', purpose: 'reserve', capacity: 1 })).toBe(1)
  })

  it('a place made a Palle in the dialog gets the capacity the backend stores: its own when it already is a Palle, else 1', () => {
    const limitAsPalle = (typed: number, previous: Pick<Location, 'type' | 'capacity'> | null) => palletLimitOf({ type: 'Palle', purpose: 'reserve', capacity: storedCapacityOf('Palle', typed, previous) })
    expect(limitAsPalle(3, { type: 'Bord', capacity: 3 })).toBe(1)
    expect(limitAsPalle(5, { type: 'Palle', capacity: 2 })).toBe(2)
    expect(limitAsPalle(1, null)).toBe(1)
    expect(storedCapacityOf('Bord', 4, { type: 'Bord', capacity: 3 })).toBe(4)
  })

  it('linkedPurposes switches a place on the drawing only between its drawn purpose and reserved', () => {
    expect(linkedPurposes('pick', null)).toEqual(['pick', 'reserved'])
    expect(linkedPurposes('reserve', 'pick')).toEqual(['reserve', 'reserved'])
    expect(linkedPurposes('reserved', 'pick')).toEqual(['reserved', 'pick'])
    expect(linkedPurposes('reserved', null)).toEqual(['reserved'])
    expect(linkedPurposes('station', 'reserve')).toEqual(['station'])
  })

  it('linkedChanges leaves out name, type and capacity, which the drawing owns', () => {
    expect(linkedChanges({ name: 'X', area: 'A', type: 'Bord', purpose: 'reserved', capacity: 3, fixedMaterials: ['R1'], note: 'n' }))
      .toEqual({ area: 'A', purpose: 'reserved', fixedMaterials: ['R1'], note: 'n' })
  })

  it('isDeferred tells a queued or repeated action from a result', () => {
    expect(isDeferred({ queued: true })).toBe(true)
    expect(isDeferred({ duplicate: true })).toBe(true)
    expect(isDeferred({ created: [] })).toBe(false)
  })

  it('describeEvent words every kind of line in the log, also an undo', () => {
    const by = { email: 'a@x', name: 'Anna' }
    expect(describeEvent({ id: '1', at: 1, by, type: 'take', location: 'A1.1', quantity: 10 })).toBe('Taget fra A1.1 · 10')
    expect(describeEvent({ id: '2', at: 1, by, type: 'undo', location: 'A1.1' })).toBe('Fortrød en handling på A1.1')
    expect(describeEvent({ id: '3', at: 1, by, type: 'undo' })).toBe('Fortrød en handling')
    setWarehouseLanguage('en')
    expect(describeEvent({ id: '2', at: 1, by, type: 'undo', location: 'A1.1' })).toBe('Undid an action on A1.1')
  })
  it('describeUndoEffect says what undoing the whole action does', () => {
    const none = { remove: [], restore: [], change: [] }
    expect(describeUndoEffect({ pallets: { ...none, remove: ['A2.1', 'A2.2'] }, places: none })).toEqual(['2 paller fjernes fra A2.1, A2.2'])
    expect(describeUndoEffect({ pallets: { ...none, change: [{ location: 'A2.3', from: 85, to: 100 }] }, places: none })).toEqual(['Pallen på A2.3 får 100 stk. igen (nu 85)'])
    expect(describeUndoEffect({ pallets: { ...none, change: [{ location: 'C1.1', from: 3, to: 3, now: 'C1.3' }], restore: ['A1.1'] }, places: { ...none, remove: ['C9.9'] } })).toEqual(['1 palle kommer tilbage på A1.1', 'Pallen på C1.3 kommer tilbage på C1.1', 'Placeringen C9.9 fjernes'])
    setWarehouseLanguage('en')
    expect(describeUndoEffect({ pallets: { ...none, remove: ['A2.1'] }, places: none })).toEqual(['1 pallet is removed from A2.1'])
  })

  it('words shelf work, racks, deletion and the shelf migration in the log', () => {
    const by = { email: 'a@x', name: 'Anna' }
    const line = (type: LocationEvent['type'], extra: Partial<LocationEvent> = {}): LocationEvent => ({ id: '1', at: 1, by, type, ...extra })
    expect(describeEvent(line('shelf-put', { location: 'E9 H5', quantity: 40 }))).toBe('Lagt på E9 H5 · 40')
    expect(describeEvent(line('shelf-take', { location: 'E9 H5', quantity: 5 }))).toBe('Taget fra E9 H5 · 5')
    expect(describeEvent(line('shelf-move', { from: 'E9 H5', to: 'E9 H2', quantity: 10 }))).toBe('Flyttet E9 H5 → E9 H2 · 10')
    expect(describeEvent(line('shelf-set', { location: 'E9 H5', changes: { quantity: [40, 38] } }))).toBe('Antal rettet på E9 H5: 40 → 38')
    expect(describeEvent(line('migrate'))).toBe('Hyldepaller lagt om til hyldelager')
    expect(describeEvent(line('location', { location: 'C1.1', changes: { deleted: ['C1.1', null] } }))).toBe('Placeringen C1.1 slettet')
    expect(describeEvent(line('location', { changes: { deleted: ['C1.1, C1.2, C1.3', null] } }))).toBe('3 placeringer slettet')
    expect(describeEvent(line('location', { changes: { rack: [null, 'E9 (5 hylder)'] } }))).toBe('Reol E9 oprettet (5 hylder)')
    expect(describeEvent(line('location', { count: 4, changes: { active: [true, false] } }))).toBe('4 placeringer deaktiveret')
    expect(targetFromItem('rack:E9')).toEqual({ kind: 'rack', id: 'E9' })
    expect(targetFromItem('shelf:E9 H5')).toEqual({ kind: 'shelf', id: 'E9 H5' })
    expect(targetFromItem('shelf')).toEqual({ kind: 'shelf' })
    setWarehouseLanguage('en')
    expect(describeEvent(line('shelf-put', { location: 'E9 H5', quantity: 40 }))).toBe('Put on E9 H5 · 40')
    expect(describeEvent(line('location', { changes: { rack: [null, 'E9 (5 hylder)'] } }))).toBe('Rack E9 created (5 shelves)')
  })

  it('describes a drawing publish', () => {
    expect(describeEvent({ id: 'e', at: 1, by: { email: 'm', name: 'M' }, type: 'layout', changes: { version: [0, 1] }, counts: { create: 12, rename: 3, change: 0, remove: 2 } } as LocationEvent))
      .toBe('Tegningen udgivet (version 1): 12 nye, 3 omdøbt, 2 nedlagt')
    setWarehouseLanguage('en')
    expect(describeEvent({ id: 'e', at: 1, by: { email: 'm', name: 'M' }, type: 'layout', changes: { version: [1, 2] }, counts: { create: 1, rename: 0, change: 4, remove: 0 } } as LocationEvent))
      .toBe('Drawing published (version 2): 1 new, 0 renamed, 0 removed')
    expect(targetFromItem('layout')).toEqual({ kind: 'layout' })
  })

  it('"Tag alt" and an empty quantity mean the quantity shown, not whatever is there when it runs', () => {
    expect(shownQuantity('', 40)).toBe(40)
    expect(shownQuantity('5', 40)).toBe(5)
    expect(shownQuantity(' ', 40)).toBe(40)
  })

  it('a single-flight guard ignores a second run while the first is busy (Enter pressed twice)', async () => {
    const guard = singleFlight()
    let calls = 0
    let release: () => void = () => {}
    const slow = () => new Promise<void>(resolve => { calls++; release = resolve })
    const first = guard(slow)
    const second = guard(slow)
    expect(calls).toBe(1)
    release()
    await Promise.all([first, second])
    await guard(async () => { calls++ })
    expect(calls).toBe(2)
  })

  it('describeUndoEffect says what an undo does to shelf lines', () => {
    const none = { remove: [], restore: [], change: [] }
    const effect = (stock: NonNullable<Parameters<typeof describeUndoEffect>[0]['stock']>) => describeUndoEffect({ pallets: none, places: none, stock })
    expect(effect([{ location: 'E9 H5', material: 'R162-0717', from: 35, to: 40 }])).toEqual(['R162-0717 på E9 H5 får 40 stk. igen (nu 35)'])
    expect(effect([{ location: 'E9 H5', material: 'R162-0717', from: 40, to: null }])).toEqual(['R162-0717 fjernes fra E9 H5'])
    expect(effect([{ location: 'E9 H5', material: 'R162-0717', from: null, to: 40 }])).toEqual(['R162-0717 kommer tilbage på E9 H5 (40 stk.)'])
    expect(effect([{ location: 'E9 H5', material: 'R162-0717', from: 40, to: 35 }])).toEqual(['R162-0717 på E9 H5 går fra 40 til 35 stk.'])
    setWarehouseLanguage('en')
    expect(effect([{ location: 'E9 H5', material: 'R162-0717', from: 35, to: 40 }])).toEqual(['R162-0717 on E9 H5 gets 40 pcs back (now 35)'])
  })
})
