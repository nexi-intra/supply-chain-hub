import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

// Session-lived cache of the last value under each key, surviving unmount.
const cache = new Map<string, unknown>()

// useState variant whose value is remembered across unmount/remount within the
// session. A re-mounted view (e.g. returning to the Hub) renders its previous
// content instantly while its effects revalidate against the shared folder in
// the background, instead of showing an empty widget for seconds on a slow
// network. Drop-in replacement for useState with a stable cacheKey.
export function useCachedState<T>(cacheKey: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (cache.has(cacheKey) ? (cache.get(cacheKey) as T) : initial))
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      cache.set(cacheKey, resolved)
      return resolved
    })
  }, [cacheKey])
  return [value, set]
}
