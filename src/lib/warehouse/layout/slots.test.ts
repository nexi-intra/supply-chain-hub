import { describe, expect, it } from 'vitest'
import type { LayoutItem, WarehouseLayout } from '@/types/warehouse'
import { bayNo, bayPos, drawnPurposeOf, duplicateNames, fillPattern, proposeNames, pullNo, regenerateSlots, slotKey, slotLabel, tooLongNames } from './slots'

let next = 0
const ids = () => () => `s${++next}`
const base: LayoutItem = { id: 'r1', type: 'rack', x: 0, y: 0, w: 10, h: 2, name: '', note: '', slots: [] }
const rackBase = base
const floorrowBase: LayoutItem = { ...base, id: 'f1', type: 'floorrow' }
const shelfBase: LayoutItem = { ...base, id: 'h1', type: 'shelfrack' }
const withSlots = (item: LayoutItem) => proposeNames({ ...item, slots: regenerateSlots(item, ids()) }, {})
const slotAt = (item: LayoutItem, pos: number, level: number) => item.slots.find(s => s.pos === pos && s.level === level)!
const names = (item: LayoutItem, pos: number) => Object.fromEntries(item.slots.filter(s => s.pos === pos).map(s => [s.level, s.name]))

const rack0: LayoutItem = { ...base, name: 'K', bays: 3, levels: 2 }
const rack: LayoutItem = { ...rack0, slots: regenerateSlots(rack0, ids()).map(s => (s.pos === 1 && s.level === 1 ? { ...s, id: 'keep' } : s)) }
const p0: LayoutItem = { ...base, name: 'P', bays: 22, levels: 3 }
const p22 = proposeNames({ ...p0, slots: regenerateSlots(p0, ids()).map(s => (s.pos === 22 && s.level === 1 ? { ...s, kind: 'pick-unnamed' as const } : s)) }, {})
const rackS = withSlots({ ...base, name: 'S', bays: 31, levels: 2 })
const a1 = withSlots({ ...base, id: 'a', name: 'A', bays: 1, levels: 1 })
const other = withSlots({ ...base, id: 'b', name: 'B', bays: 1, levels: 1 })
const trr = withSlots({ ...base, id: 'c', name: 'A', bays: 1, levels: 1, owner: 'TRR' })
const twoA11: WarehouseLayout = {
  version: 1, hall: { w: 20, h: 20 }, notes: '',
  items: [a1, { ...other, slots: other.slots.map(s => ({ ...s, name: ' a1.1 ', manual: true })) }, trr, { ...a1, id: 'v', visual: true }],
}

describe('layout slots', () => {
  it('numbers bays from firstNo, reversed when the first bay is at the end', () => {
    const end = { ...base, bays: 5, firstNo: 1, firstBay: 'end' as const }
    expect([bayNo(end, 1), bayNo(end, 5), bayPos(end, 5), bayPos(end, 1)]).toEqual([5, 1, 1, 5])
    expect(pullNo({ ...base, pull: { count: 4, firstNo: 0, shelves: 1 } }, 1)).toBe(0)
    expect(slotKey({ id: 'x', name: '', kind: 'shelf', purpose: 'reserve', unit: 2, shelf: 3 })).toBe('u2-h3')
  })

  it('names count from the floor; an aisle keeps its number and pick without name is skipped', () => {
    const rack = { ...base, name: 'A', bays: 11, levels: 3, firstNo: 1, aisles: [10], slots: [] }
    const named = proposeNames({ ...rack, slots: regenerateSlots(rack, ids()) }, {})
    expect(names(named, 10)).toEqual({ 1: '', 2: 'A10.2', 3: 'A10.3' })
    expect(slotLabel(p22, slotAt(p22, 22, 1))).toBe('Pluk under P22'); expect(slotAt(p22, 22, 2).name).toBe('P22.1')
  })

  it('levelPatterns name S31 GULV and S31 on the two levels', () => {
    const s = proposeNames({ ...rackS, levelPatterns: { 1: '{reol}{fag} GULV', 2: '{reol}{fag}' } }, {})
    expect([slotAt(s, 31, 1).name, slotAt(s, 31, 2).name]).toEqual(['S31 GULV', 'S31'])
  })

  it('a level pattern longer than 30 characters is cut and counted by tooLongNames', () => {
    const s = proposeNames({ ...rackS, levelPatterns: { 1: `{reol}{fag} ${'G'.repeat(30)}` } }, {})
    expect(slotAt(s, 31, 1).name).toBe(`S31 ${'G'.repeat(26)}`)
    expect([tooLongNames(s), tooLongNames(rackS)]).toEqual([31, 0])
  })

  it('a hand-typed name is kept by patterns unless the slot is chosen', () => {
    const typed = { ...rackS, slots: rackS.slots.map(s => (s.pos === 1 && s.level === 1 ? { ...s, name: 'GULV', manual: true } : s)) }
    const again = proposeNames({ ...typed, pattern: '{reol}{fag}-{niveau}' }, {})
    expect([slotAt(again, 1, 1).name, slotAt(again, 1, 2).name]).toEqual(['GULV', 'S1-2'])
    const chosen = proposeNames({ ...typed, pattern: '{reol}{fag}-{niveau}' }, { slotIds: [slotAt(typed, 1, 1).id] })
    expect([slotAt(chosen, 1, 1).name, slotAt(chosen, 1, 1).manual, slotAt(chosen, 1, 2).name]).toEqual(['S1-1', undefined, 'S1.2'])
  })

  it('regenerateSlots keeps id and a hand-typed name when the rack grows, and drops removed positions', () => {
    const grown = regenerateSlots({ ...rack, levels: 4, slots: rack.slots.map(s => (s.id === 'keep' ? { ...s, name: 'K1.GULV' } : s)) }, ids())
    expect(grown.find(s => s.id === 'keep')!.name).toBe('K1.GULV'); expect(grown.length).toBe(rack.bays! * 4)
    expect(regenerateSlots({ ...rack, bays: 1 }, ids()).every(s => s.pos === 1)).toBe(true)
  })

  it('pull-outs are named E9 H1 with H1 at the top, floorrow S0 holds depth pallets, a visual shelf rack has no slots', () => {
    const e = withSlots({ ...rackBase, name: 'E', bays: 20, levels: 2, pull: { count: 28, firstNo: 0, shelves: 5, owner: 'TCD' } })
    expect(e.slots.filter(s => s.unit === 10).map(s => [s.shelf, s.name])).toEqual([[1, 'E9 H1'], [2, 'E9 H2'], [3, 'E9 H3'], [4, 'E9 H4'], [5, 'E9 H5']])
    const s = withSlots({ ...floorrowBase, name: 'S', count: 8, depth: 2, firstNo: 0 })
    expect(s.slots.slice(0, 2).map(x => [x.name, x.capacity])).toEqual([['S0', 2], ['S1', 2]])
    expect(withSlots({ ...shelfBase, visual: true, shelves: 5 }).slots).toEqual([])
    expect(withSlots({ ...shelfBase, name: 'H', shelves: 15 }).slots.slice(0, 2).map(x => [x.name, x.kind])).toEqual([['H1', 'shelf'], ['H2', 'shelf']])
  })

  it('a floor row slot capacity follows the depth when the row is regenerated', () => {
    const s = withSlots({ ...floorrowBase, name: 'S', count: 8, depth: 2, firstNo: 0 })
    const deeper = regenerateSlots({ ...s, depth: 3 }, ids())
    expect(deeper.map(x => x.capacity)).toEqual(Array(8).fill(3))
    expect(deeper.map(x => [x.id, x.name])).toEqual(s.slots.map(x => [x.id, x.name]))
  })

  it('a floor row holds 1 to 6 pallets per place', () => {
    expect(withSlots({ ...floorrowBase, name: 'S', count: 2, depth: 9 }).slots.map(x => x.capacity)).toEqual([6, 6])
    expect(withSlots({ ...floorrowBase, name: 'S', count: 2, depth: 0 }).slots.map(x => x.capacity)).toEqual([1, 1])
  })

  it('the pull-out placeholder may be written {udtræk} or {udtraek}', () => {
    const values = { reol: 'E', udtraek: 9, hylde: 1 }
    expect([fillPattern('{reol}{udtræk} H{hylde}', values), fillPattern('{reol}{udtraek} H{hylde}', values)]).toEqual(['E9 H1', 'E9 H1'])
  })

  it('duplicateNames finds A1.1 used twice regardless of spelling', () => expect([...duplicateNames(twoA11, 'TCD')]).toEqual(['A1.1']))

  it('drawnPurposeOf reads the purpose of the team\'s slot, not a special one or another team\'s', () => {
    const pick = { ...a1, slots: a1.slots.map(s => ({ ...s, purpose: 'pick' as const })) }
    const special = { ...a1, id: 'sp', type: 'special' as const, slots: [{ id: 'x', name: 'Swap', kind: 'special' as const, purpose: 'reserve' as const }] }
    const layout = { items: [pick, trr, special] }
    expect(drawnPurposeOf(layout, 'TCD', 'A1.1')).toBe('pick')
    expect(drawnPurposeOf(layout, 'TRR', 'A1.1')).toBe('reserve')
    expect([drawnPurposeOf(layout, 'TCD', 'SWAP'), drawnPurposeOf(layout, 'TCD', 'B1.1')]).toEqual([null, null])
  })
})
