export async function persistKvChange<T>(key: string, previous: T, change: T | ((current: T) => T)): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await window.kv.get<T>(key)
    const functional = typeof change === 'function'
    // A direct replacement was prepared against previous. Do not silently
    // overwrite a changed record. Functional changes can be recomputed afresh.
    if (!functional && current !== undefined && JSON.stringify(current) !== JSON.stringify(previous)) throw new Error('KV_CONFLICT: Data changed. Reload and try again.')
    const next = functional ? (change as (value: T) => T)(structuredClone(current === undefined ? previous : current)) : change as T
    try { return await window.kv.compareAndSet(key, current, next) } catch (error) {
      if (!functional || attempt === 4 || !String(error).includes('KV_CONFLICT')) throw error
    }
  }
  throw new Error('KV_CONFLICT: Data changed. Reload and try again.')
}
