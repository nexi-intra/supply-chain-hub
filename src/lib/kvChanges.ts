// Saves an edit of a shared list or lookup object as the smallest atomic kvArrays operations: only the items or
// fields that changed, under the file lock. Every open view of the key shows the change at once (and keeps showing
// it while the save is on its way – up to 90 s on the shared drive); a failed save is rolled back in all of them.
// A whole-list useKV setter only updated the screen that made the change, and rewrote every other item too.
import { deleteKvObjectField, removeFromKvArray, setKvObjectField, upsertInKvArray } from './kvArrays'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Removes the items that are gone and upserts the new and changed ones (two writes at most, at the same time). */
export function saveListChange<T extends { id: string }>(key: string, before: readonly T[], after: readonly T[]): Promise<unknown> {
  const previous = new Map(before.map(item => [item.id, item]))
  const kept = new Set(after.map(item => item.id))
  const removed = before.filter(item => !kept.has(item.id)).map(item => item.id)
  const changed = after.filter(item => !previous.has(item.id) || !same(previous.get(item.id), item))
  return Promise.all([
    removed.length ? removeFromKvArray<T>(key, removed) : undefined,
    changed.length ? upsertInKvArray<T>(key, changed) : undefined,
  ])
}

/** Sets or deletes each field that changed in a lookup object (usually one), at the same time. */
export function saveRecordChange(key: string, before: Readonly<Record<string, unknown>>, after: Readonly<Record<string, unknown>>): Promise<unknown> {
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(field => !same(before[field], after[field]))
  return Promise.all(fields.map(field => Object.prototype.hasOwnProperty.call(after, field)
    ? setKvObjectField(key, field, after[field])
    : deleteKvObjectField(key, field)))
}
