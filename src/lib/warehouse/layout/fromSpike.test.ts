import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { fromSpike } from './fromSpike'

const require = createRequire(import.meta.url)
const { normalizeDraft } = require('../../../../electron/warehouse/locations/layout.cjs')

let next = 0
const ids = () => () => `s${++next}`
const tcd = () => JSON.parse(readFileSync('plans/lager-tegning-tcd.json', 'utf8'))

describe('fromSpike', () => {
  it('reads the TCD drawing', () => {
    const draft = fromSpike(tcd(), ids())
    const all = draft.items.flatMap(i => i.slots.map(s => ({ item: i, s })))
    const byName = (n: string) => all.find(x => x.s.name === n)!
    expect(byName('A10.2').s.kind).toBe('pallet'); expect(all.find(x => x.item.name === 'A' && x.s.pos === 10 && x.s.level === 1)!.s.kind).toBe('aisle')
    expect([byName('S0').s.capacity, byName('S0').item.floor]).toEqual([2, 'mezz'])
    expect(byName('E0 H1').s.kind).toBe('shelf'); expect(byName('E0 H1').item.owner).toBe('TRR'); expect(byName('E0 H1').item.pull!.owner).toBe('TCD')
    expect(draft.items.filter(i => i.visual).every(i => i.slots.length === 0)).toBe(true)
    expect(draft.items.find(i => i.name === 'H' && i.type === 'shelfrack')!.slots.map(s => s.name).slice(0, 2)).toEqual(['H1', 'H2'])
    expect(draft.hall).toEqual({ w: 59, h: 68 })
  })

  it('keeps the spike kinds, its naming and its fields', () => {
    const draft = fromSpike(tcd(), ids())
    const a1 = draft.items.find(i => i.name === 'A')!.slots.find(s => s.pos === 1 && s.level === 1)!
    expect([a1.name, a1.kind, a1.purpose]).toEqual(['A1.1', 'pallet', 'pick'])
    const p22 = draft.items.find(i => i.id === '38fdqfg')!
    expect(p22.slots.filter(s => s.pos === 1).map(s => [s.level, s.kind, s.name])).toEqual([[1, 'pick-unnamed', ''], [2, 'blocked', ''], [3, 'pallet', 'p22.1'], [4, 'pallet', 'p22.2']])
    const e = draft.items.find(i => i.name === 'E')!
    expect(e.pull).toEqual({ count: 28, firstNo: 0, shelves: 5, perUnit: expect.objectContaining({ 9: 6 }), owner: 'TCD' })
    expect(draft.items.find(i => i.id === 'i6jhabb')).not.toHaveProperty('inside')
    expect(draft.items.every(i => !('level' in i) && typeof (i.depthFlip ?? false) === 'boolean')).toBe(true)
    expect([draft.version, draft.basedOn, draft.decisions]).toEqual([0, 0, { outside: [], remove: [] }])
  })

  it('is accepted by the backend as a draft', () => {
    const draft = fromSpike(tcd(), ids())
    const saved = normalizeDraft({ ...draft, editedBy: { email: 'a@b.c', name: 'A' }, editedAt: 1 })
    expect(saved.items.length).toBe(draft.items.length)
  })

  it('turns a pick area into a pick floor', () => {
    const draft = fromSpike({ hall: { w: 20, h: 20 }, notes: '', items: [{ id: 'x', type: 'pick', x: 1, y: 1, w: 2, h: 2, name: 'Pluk', note: '' }] }, ids())
    expect(draft.items[0].type).toBe('floor')
    expect(draft.items[0].slots.map(s => [s.kind, s.purpose, s.name])).toEqual([['floor', 'pick', 'Pluk']])
  })

  it('refuses something that is not a spike file', () => {
    expect(() => fromSpike({ foo: 1 }, ids())).toThrow('LAYOUT_INVALID')
    expect(() => fromSpike(null, ids())).toThrow('LAYOUT_INVALID')
    expect(() => fromSpike({ hall: { w: 20, h: 20 }, items: [{ id: 'x', type: 'robot', x: 0, y: 0, w: 1, h: 1 }] }, ids())).toThrow('LAYOUT_INVALID')
  })

  it('reads the spike select value for a flipped floor row', () => {
    const row = (depthFlip: unknown) => fromSpike({ hall: { w: 20, h: 20 }, items: [{ id: 'r', type: 'floorrow', x: 0, y: 0, w: 4, h: 2, name: 'S', count: 2, depth: 2, depthFlip }] }, ids()).items[0].depthFlip
    expect([row('1'), row(''), row(undefined)]).toEqual([true, false, false])
  })

  it('refuses counts outside the spike limits before making slots', () => {
    const rack = (extra: object) => ({ hall: { w: 50, h: 50 }, items: [{ id: 'r', type: 'rack', x: 0, y: 0, w: 10, h: 2, name: 'Z', bays: 10, levels: 4, ...extra }] })
    const started = Date.now()
    expect(() => fromSpike(rack({ bays: 1e7, levels: 1e3 }), ids())).toThrow('LAYOUT_INVALID: Z skal have 1–200 fag')
    expect(Date.now() - started).toBeLessThan(1000)
    expect(() => fromSpike(rack({ levels: 13 }), ids())).toThrow('LAYOUT_INVALID')
    expect(() => fromSpike(rack({ pull: { on: true, count: 201 } }), ids())).toThrow('LAYOUT_INVALID')
    expect(() => fromSpike({ hall: { w: 20, h: 20 }, items: [{ id: 'r', type: 'floorrow', x: 0, y: 0, w: 4, h: 2, name: 'S', count: 2, depth: 7 }] }, ids())).toThrow('LAYOUT_INVALID')
  })

  it('refuses an item with more slots than the backend allows', () => {
    const big = { hall: { w: 50, h: 50 }, items: [{ id: 'r', type: 'rack', x: 0, y: 0, w: 10, h: 2, name: 'Z', bays: 100, levels: 5 }] }
    expect(() => fromSpike(big, ids())).toThrow('LAYOUT_INVALID: Z har mere end 400 pladser')
  })
})
