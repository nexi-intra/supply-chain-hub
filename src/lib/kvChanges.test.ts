import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveListChange, saveRecordChange } from './kvChanges'

afterEach(() => vi.unstubAllGlobals())

function stubKv() {
  const update = vi.fn(async () => [])
  const updateField = vi.fn(async () => ({}))
  vi.stubGlobal('window', { kv: { get: vi.fn(async () => undefined), update, updateField } })
  return { update, updateField }
}

describe('saving an edit of a shared list as only what changed', () => {
  it('removes the gone items and upserts the new and changed ones, nothing else', async () => {
    const { update } = stubKv()
    const before = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }]
    const after = [{ id: 'a', n: 1 }, { id: 'b', n: 5 }, { id: 'd', n: 4 }]
    await saveListChange('shift-assignments', before, after)
    expect(update).toHaveBeenCalledWith('shift-assignments', { op: 'remove', ids: ['c'] })
    expect(update).toHaveBeenCalledWith('shift-assignments', { op: 'upsert', items: [{ id: 'b', n: 5 }, { id: 'd', n: 4 }] })
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('writes nothing when nothing changed', async () => {
    const { update } = stubKv()
    await saveListChange('shift-roles', [{ id: 'a' }], [{ id: 'a' }])
    expect(update).not.toHaveBeenCalled()
  })

  it('sets or deletes only the changed fields of a lookup object', async () => {
    const { updateField } = stubKv()
    await saveRecordChange('team-status-notes', { 'd|a': 'x', 'd|b': 'y' }, { 'd|a': 'x', 'd|c': 'z' })
    expect(updateField).toHaveBeenCalledWith('team-status-notes', { op: 'deleteField', field: 'd|b' })
    expect(updateField).toHaveBeenCalledWith('team-status-notes', { op: 'setField', field: 'd|c', value: 'z' })
    expect(updateField).toHaveBeenCalledTimes(2)
  })
})
