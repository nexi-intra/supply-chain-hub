import { describe, expect, it } from 'vitest'
import type { LayoutDraft, LayoutItem } from '@/types/warehouse'
import { editingOf, editorReducer, initEditor, type EditorState } from './editor'
import { duplicateNames, proposeNames, regenerateSlots, slotLabel } from './slots'

let next = 0
const newId = () => `id${++next}`
const withSlots = (item: LayoutItem) => proposeNames({ ...item, slots: regenerateSlots(item, newId) }, {})
const draftWith = (items: LayoutItem[]): LayoutDraft => ({
  version: 1, basedOn: 1, hall: { w: 60, h: 70 }, notes: '', items,
  editedBy: { email: 'a@b.c', name: 'A' }, editedAt: 0, decisions: { outside: [], remove: [] },
})
const init = (items: LayoutItem[]) => initEditor(draftWith(items), { newId })

const rackA = withSlots({ id: 'ra', type: 'rack', x: 0, y: 0, w: 10, h: 1, name: 'A', note: '', bays: 1, levels: 1, slots: [] })
const itemId = 'rp'
const rackP = withSlots({ id: itemId, type: 'rack', x: 0, y: 0, w: 44, h: 2, name: 'P', note: '', bays: 22, levels: 3, slots: [] })
const start = init([rackP])
const start22 = start
const itemOf = (s: EditorState) => s.draft.items.find(x => x.id === itemId)!
const bay22 = (s: EditorState) => itemOf(s).slots.filter(x => x.pos === 22).sort((a, b) => a.level! - b.level!)
const [l1, l2, l3] = bay22(start).map(x => x.id)
const levelOf = (s: EditorState, id: string) => itemOf(s).slots.find(x => x.id === id)!

describe('layout editor', () => {
  it('paste gives the copy new ids for the item and every slot', () => {
    let s = initEditor(draftWith([rackA]))
    s = editorReducer(s, { type: 'copy', id: rackA.id }); s = editorReducer(s, { type: 'paste', x: 0, y: 10 })
    const [a, b] = s.draft.items
    expect(b.id).not.toBe(a.id); expect(b.slots.some(x => a.slots.some(y => y.id === x.id))).toBe(false)
    expect([...duplicateNames(s.draft, 'TCD')]).toContain('A1.1')
  })

  it('undo goes back one change; select does not count', () => {
    let s = editorReducer(initEditor(draftWith([])), { type: 'add', itemType: 'rack', x: 1, y: 1, w: 10, h: 1 })
    const id = s.draft.items[0].id
    s = editorReducer(editorReducer(s, { type: 'select', id }), { type: 'move', id, x: 5, y: 5 })
    s = editorReducer(s, { type: 'undo' }); expect([s.draft.items[0].x, s.draft.items[0].y]).toEqual([1, 1])
    s = editorReducer(s, { type: 'undo' }); expect(s.draft.items).toEqual([])
  })

  it('cycling P22 level 1 to pick without name renames P22.2 to P22.1, but keeps a hand-typed name', () => {
    // reol P, fag 22, 3 niveauer: P22.1, P22.2, P22.3 (slots l1, l2, l3)
    let s = editorReducer(start, { type: 'renameSlot', itemId, slotId: l3, name: 'P22 TOP' })
    s = editorReducer(editorReducer(s, { type: 'cycleSlot', itemId, slotId: l1 }), { type: 'cycleSlot', itemId, slotId: l1 })
    expect(bay22(s).map(x => x.name)).toEqual(['', 'P22.1', 'P22 TOP'])
    expect(slotLabel(itemOf(s), bay22(s)[0])).toBe('Pluk under P22')
  })

  it('shrinking a rack drops the slots of the removed bays', () => {
    const s = editorReducer(start22, { type: 'set', id: itemId, patch: { bays: 20 } })
    expect(itemOf(s).slots.every(x => (x.pos ?? 0) <= 20)).toBe(true)
  })

  it('replace swaps the whole drawing as one undo step', () => {
    const other = draftWith([rackA])
    let s = editorReducer(editorReducer(start, { type: 'select', id: itemId }), { type: 'replace', draft: other })
    expect([s.draft, s.selected, s.dirty]).toEqual([other, null, true])
    s = editorReducer(s, { type: 'undo' }); expect(s.draft.items.map(x => x.id)).toEqual([itemId])
  })

  it('decide marks a list place as outside or to remove, and null clears it', () => {
    let s = editorReducer(start, { type: 'decide', name: 'K1.1', as: 'outside' }); expect(s.draft.decisions).toEqual({ outside: ['K1.1'], remove: [] })
    s = editorReducer(s, { type: 'decide', name: 'K1.1', as: 'remove' }); expect(s.draft.decisions).toEqual({ outside: [], remove: ['K1.1'] })
    s = editorReducer(s, { type: 'decide', name: 'K1.1', as: null }); expect(s.draft.decisions).toEqual({ outside: [], remove: [] })
  })

  it('a new rack takes the next free letter, its bays from its length, and named slots', () => {
    const s = editorReducer(init([rackA]), { type: 'add', itemType: 'rack', x: 0, y: 5, w: 6, h: 1 })
    const b = s.draft.items[1]
    expect([b.name, b.bays, b.levels, b.slots.length, b.slots[0].name, s.selected]).toEqual(['B', 6, 4, 24, 'B1.1', b.id])
    const row = editorReducer(s, { type: 'add', itemType: 'floorrow', x: 0, y: 10, w: 0, h: 0 }).draft.items[2]
    expect([row.name, row.w, row.h, row.count, row.depth, row.slots[0].name, row.slots[0].capacity]).toEqual(['S', 12, 2, 6, 2, 'S0', 2])
  })

  it('cycles a rack slot pallet → pick → pick without name → shelf → blocked → pallet', () => {
    let s = start
    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
      s = editorReducer(s, { type: 'cycleSlot', itemId, slotId: l2 })
      seen.push(`${levelOf(s, l2).kind}/${levelOf(s, l2).purpose}`)
    }
    expect(seen).toEqual(['pallet/pick', 'pick-unnamed/reserve', 'shelf/reserve', 'blocked/reserve', 'pallet/reserve'])
    expect(bay22(s).map(x => x.name)).toEqual(['P22.1', 'P22.2', 'P22.3'])
  })

  it('renaming the rack renames the slots that were not typed by hand', () => {
    let s = editorReducer(start, { type: 'renameSlot', itemId, slotId: l3, name: 'TOP' })
    expect([levelOf(s, l3).manual, s.dirty]).toEqual([true, true])
    s = editorReducer(s, { type: 'set', id: itemId, patch: { name: 'Q', levelPatterns: { 1: '{reol}{fag} GULV' } } })
    expect(bay22(s).map(x => x.name)).toEqual(['Q22 GULV', 'Q22.2', 'TOP'])
  })

  it('an aisle bay turns its floor slot into an aisle and back', () => {
    let s = editorReducer(start, { type: 'set', id: itemId, patch: { aisles: [22] } })
    expect(bay22(s).map(x => [x.kind, x.name])).toEqual([['aisle', ''], ['pallet', 'P22.2'], ['pallet', 'P22.3']])
    s = editorReducer(s, { type: 'set', id: itemId, patch: { aisles: [] } })
    expect(bay22(s).map(x => [x.id, x.kind, x.name])).toEqual([[l1, 'pallet', 'P22.1'], [l2, 'pallet', 'P22.2'], [l3, 'pallet', 'P22.3']])
  })

  it('renameSlots names the chosen slots from a pattern and marks them as typed', () => {
    const s = editorReducer(start, { type: 'renameSlots', itemId, slotIds: [l1, l2], pattern: '{reol}{fag}-{niveau}' })
    expect(bay22(s).map(x => [x.name, x.manual])).toEqual([['P22-1', true], ['P22-2', true], ['P22.3', undefined]])
  })

  it('renameSlots uses the pattern for pull-out slots too', () => {
    const rackE = withSlots({ id: 're', type: 'rack', x: 0, y: 0, w: 10, h: 1, name: 'E', note: '', bays: 1, levels: 1, pull: { count: 1, firstNo: 9, shelves: 2 }, slots: [] })
    const pulls = rackE.slots.filter(x => x.unit != null).map(x => x.id)
    const s = editorReducer(init([rackE]), { type: 'renameSlots', itemId: 're', slotIds: pulls, pattern: '{reol}{udtraek}-{hylde}' })
    expect(s.draft.items[0].slots.filter(x => x.unit != null).map(x => [x.name, x.manual])).toEqual([['E9-1', true], ['E9-2', true]])
  })

  it('resetNames proposes every slot from the patterns again and clears manual; slotIds limits it', () => {
    let s = editorReducer(start, { type: 'renameSlots', itemId, slotIds: [l1, l2, l3], pattern: 'X{niveau}' })
    s = editorReducer(s, { type: 'set', id: itemId, patch: { levelPatterns: { 1: '{reol}{fag} GULV' } } })
    expect(bay22(s).map(x => x.name)).toEqual(['X1', 'X2', 'X3'])
    const some = editorReducer(s, { type: 'resetNames', itemId, slotIds: [l2] })
    expect(bay22(some).map(x => [x.name, x.manual])).toEqual([['X1', true], ['P22.2', undefined], ['X3', true]])
    const all = editorReducer(s, { type: 'resetNames', itemId })
    expect(bay22(all).map(x => [x.name, x.manual])).toEqual([['P22 GULV', undefined], ['P22.2', undefined], ['P22.3', undefined]])
    expect(editorReducer(all, { type: 'resetNames', itemId })).toBe(all)
  })

  it('names are cut to 30 characters: renameSlot, renameSlots, patterns and resetNames', () => {
    const long = 'L'.repeat(40)
    let s = editorReducer(start, { type: 'renameSlot', itemId, slotId: l1, name: long })
    expect(levelOf(s, l1).name).toBe('L'.repeat(30))
    s = editorReducer(s, { type: 'renameSlots', itemId, slotIds: [l2], pattern: `${long}{niveau}` })
    expect(levelOf(s, l2).name).toBe('L'.repeat(30))
    s = editorReducer(s, { type: 'set', id: itemId, patch: { levelPatterns: { 3: `{reol}{fag} ${long}` } } })
    expect(levelOf(s, l3).name).toBe(`P22 ${'L'.repeat(26)}`)
    s = editorReducer(s, { type: 'set', id: itemId, patch: { pattern: `{reol}{fag}.{n} ${long}` } })
    const all = editorReducer(s, { type: 'resetNames', itemId })
    expect(bay22(all).map(x => x.name.length)).toEqual([30, 30, 30])
    expect(itemOf(all).slots.every(x => x.name.length <= 30)).toBe(true)
  })

  it('a hand-named slot cycled to pick without name loses its name and manual flag', () => {
    let s = editorReducer(start, { type: 'renameSlot', itemId, slotId: l2, name: 'HAND' })
    s = editorReducer(editorReducer(s, { type: 'cycleSlot', itemId, slotId: l2 }), { type: 'cycleSlot', itemId, slotId: l2 })
    expect([levelOf(s, l2).kind, levelOf(s, l2).name, levelOf(s, l2).manual]).toEqual(['pick-unnamed', '', undefined])
  })

  it('renameSlots leaves a blocked slot unnamed and not manual; cycling it to pallet names it', () => {
    let s = start
    for (let i = 0; i < 4; i++) s = editorReducer(s, { type: 'cycleSlot', itemId, slotId: l2 })
    s = editorReducer(s, { type: 'renameSlots', itemId, slotIds: [l1, l2, l3], pattern: '{reol}{fag}-{niveau}' })
    expect([levelOf(s, l2).kind, levelOf(s, l2).name, levelOf(s, l2).manual]).toEqual(['blocked', '', undefined])
    s = editorReducer(s, { type: 'cycleSlot', itemId, slotId: l2 })
    expect([levelOf(s, l2).kind, levelOf(s, l2).name, levelOf(s, l2).manual]).toEqual(['pallet', 'P22.2', undefined])
  })

  it('setSlotKind blocks a rack slot like the cycle does, and any shelf rack or floor slot; an aisle stays', () => {
    let s = editorReducer(start, { type: 'setSlotKind', itemId, slotId: l1, kind: 'blocked' })
    expect(bay22(s).map(x => `${x.kind}:${x.name}`)).toEqual(['blocked:', 'pallet:P22.1', 'pallet:P22.2'])
    expect(editorReducer(s, { type: 'setSlotKind', itemId, slotId: l1, kind: 'blocked' })).toBe(s)
    const shelves = withSlots({ id: 'sr', type: 'shelfrack', x: 0, y: 5, w: 3, h: 1, name: 'E', note: '', sections: 1, shelves: 2, slots: [] })
    const floor = withSlots({ id: 'fl', type: 'floor', x: 0, y: 8, w: 4, h: 3, name: 'GULV1', note: '', slots: [] })
    s = init([shelves, floor])
    s = editorReducer(s, { type: 'setSlotKind', itemId: 'sr', slotId: shelves.slots[0].id, kind: 'blocked' })
    s = editorReducer(s, { type: 'setSlotKind', itemId: 'fl', slotId: floor.slots[0].id, kind: 'blocked' })
    expect(s.draft.items.map(item => item.slots.map(x => `${x.kind}:${x.name}`))).toEqual([['blocked:', `shelf:${shelves.slots[1].name}`], ['blocked:']])
    s = editorReducer(s, { type: 'undo' })
    expect(s.draft.items[1].slots[0]).toEqual(floor.slots[0])
    const aisle = withSlots({ ...rackP, id: 'ai', aisles: [1], slots: [] })
    const slot = aisle.slots.find(x => x.kind === 'aisle')!
    const t0 = init([aisle])
    expect(editorReducer(t0, { type: 'setSlotKind', itemId: 'ai', slotId: slot.id, kind: 'blocked' })).toBe(t0)
  })

  it('move, resize, rotate and setHall stay inside the hall', () => {
    let s = editorReducer(start, { type: 'move', id: itemId, x: 50, y: 100 })
    expect([itemOf(s).x, itemOf(s).y]).toEqual([16, 68])
    s = editorReducer(s, { type: 'resize', id: itemId, w: 80, h: 3 })
    expect([itemOf(s).x, itemOf(s).w, itemOf(s).h]).toEqual([0, 60, 3])
    s = editorReducer(s, { type: 'rotate', id: itemId })
    expect([itemOf(s).w, itemOf(s).h]).toEqual([3, 60])
    s = editorReducer(s, { type: 'setHall', w: 40, h: 5 })
    expect([s.draft.hall, itemOf(s).h, itemOf(s).y]).toEqual([{ w: 40, h: 10 }, 10, 0])
  })

  it('toggleCell cuts a cell; remove clears the selection; select and copy change nothing', () => {
    let s = editorReducer(start, { type: 'toggleCell', id: itemId, x: 0, y: 0, add: false })
    expect(itemOf(s).cut).toEqual([[0, 0]])
    s = editorReducer(editorReducer(s, { type: 'select', id: itemId }), { type: 'copy', id: itemId })
    expect([s.undo.length, s.clipboard?.id]).toEqual([1, itemId])
    s = editorReducer(s, { type: 'remove', id: itemId })
    expect([s.draft.items, s.selected, s.undo.length]).toEqual([[], null, 2])
    expect(editorReducer(start, { type: 'select', id: itemId }).dirty).toBe(false)
  })

  it('keeps at most 200 undo steps', () => {
    let s = start
    for (let i = 0; i < 205; i++) s = editorReducer(s, { type: 'move', id: itemId, x: i % 2, y: 0 })
    expect(s.undo.length).toBe(200)
  })
})

describe('who edits the drawing', () => {
  it('names the editor, but a fresh draft after a publish or discard is free and names no one', () => {
    const owned = { ...draftWith([]), rev: 3, editedAt: 5 }
    expect(editingOf(owned)).toEqual({ name: 'A', since: 5 })
    expect(editingOf({ ...owned, free: { rev: 3 } })).toBeNull()
    expect(editingOf({ ...owned, free: { rev: 2 } })).toEqual({ name: 'A', since: 5 })
  })
})
