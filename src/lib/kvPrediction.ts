// What a kv:update will leave in the shared folder, computed locally so the screen can show it at once – a write to
// M: takes 20 s. Mirrors computeUpdate in electron/store.cjs; anything it cannot be sure of returns undefined (no guess).

export interface KvOperation {
  op: string
  [field: string]: unknown
}

type Item = { id?: unknown }
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function predictKvUpdate(current: unknown, operation: KvOperation): unknown {
  if (Array.isArray(operation.path) && operation.path.length > 0) return undefined
  const { op } = operation
  if (op === 'setField' || op === 'deleteField' || op === 'renameField') {
    if (current !== undefined && !isObject(current)) return undefined
    const field = operation.field
    if (typeof field !== 'string' || !field) return undefined
    const next: Record<string, unknown> = { ...(current || {}) }
    if (op === 'setField') next[field] = structuredClone(operation.value)
    else if (op === 'deleteField') delete next[field]
    else {
      if (typeof operation.newField !== 'string' || !operation.newField) return undefined
      delete next[field]
      next[operation.newField] = structuredClone(operation.value)
    }
    return next
  }
  if (!['append', 'upsert', 'remove', 'replaceItem'].includes(op)) return undefined
  if (current !== undefined && !Array.isArray(current)) return undefined
  const list = (current || []) as Item[]
  if (op === 'remove') {
    if (!Array.isArray(operation.ids)) return undefined
    const ids = new Set(operation.ids)
    return list.filter(entry => !entry || !ids.has(entry.id))
  }
  if (op === 'replaceItem') {
    const index = list.findIndex(entry => entry?.id === operation.id)
    if (index === -1 || !isObject(operation.item)) return undefined
    const next = [...list]
    next[index] = structuredClone(operation.item)
    return next
  }
  if (!Array.isArray(operation.items)) return undefined
  const next = [...list]
  for (const item of operation.items as Item[]) {
    const index = next.findIndex(entry => entry?.id === item?.id)
    if (index === -1) next.push(structuredClone(item))
    else if (op === 'upsert') next[index] = structuredClone(item)
  }
  return next
}
