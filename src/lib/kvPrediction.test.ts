import { describe, expect, it } from 'vitest'
import { predictKvUpdate } from './kvPrediction'

// Mirrors computeUpdate in electron/store.cjs for the operations the kvArrays helpers send.
describe('predictKvUpdate', () => {
  const list = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }]
  it('append adds new items and keeps an item with the same id (a replay)', () => {
    expect(predictKvUpdate(list, { op: 'append', items: [{ id: 'c', n: 3 }, { id: 'a', n: 1 }] })).toEqual([...list, { id: 'c', n: 3 }])
    expect(predictKvUpdate(undefined, { op: 'append', items: [{ id: 'c' }] })).toEqual([{ id: 'c' }])
  })
  it('upsert replaces by id or adds', () => {
    expect(predictKvUpdate(list, { op: 'upsert', items: [{ id: 'b', n: 9 }, { id: 'd', n: 4 }] })).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 9 }, { id: 'd', n: 4 }])
  })
  it('remove drops the ids', () => {
    expect(predictKvUpdate(list, { op: 'remove', ids: ['a'] })).toEqual([{ id: 'b', n: 2 }])
  })
  it('replaceItem replaces the item; an unknown id cannot be predicted', () => {
    expect(predictKvUpdate(list, { op: 'replaceItem', id: 'b', item: { id: 'b', n: 7 } })).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 7 }])
    expect(predictKvUpdate(list, { op: 'replaceItem', id: 'x', item: { id: 'x' } })).toBeUndefined()
  })
  it('setField, deleteField and renameField work on objects', () => {
    const users = { 'a@x': { name: 'A' }, 'b@x': { name: 'B' } }
    expect(predictKvUpdate(users, { op: 'setField', field: 'c@x', value: { name: 'C' } })).toEqual({ ...users, 'c@x': { name: 'C' } })
    expect(predictKvUpdate(undefined, { op: 'setField', field: 'c@x', value: 1 })).toEqual({ 'c@x': 1 })
    expect(predictKvUpdate(users, { op: 'deleteField', field: 'a@x' })).toEqual({ 'b@x': { name: 'B' } })
    expect(predictKvUpdate(users, { op: 'renameField', field: 'a@x', newField: 'z@x', value: { name: 'Z' } })).toEqual({ 'b@x': { name: 'B' }, 'z@x': { name: 'Z' } })
  })
  it('does not guess: nested paths, wrong shapes and unknown operations give undefined, and the input is never changed', () => {
    expect(predictKvUpdate({}, { op: 'upsert', path: ['easy'], items: [{ id: 'a' }] })).toBeUndefined()
    expect(predictKvUpdate({ a: 1 }, { op: 'append', items: [{ id: 'a' }] })).toBeUndefined()
    expect(predictKvUpdate(list, { op: 'setField', field: 'a', value: 1 })).toBeUndefined()
    expect(predictKvUpdate(list, { op: 'whatever' })).toBeUndefined()
    const before = structuredClone(list)
    predictKvUpdate(list, { op: 'remove', ids: ['a'] })
    expect(list).toEqual(before)
  })
})
