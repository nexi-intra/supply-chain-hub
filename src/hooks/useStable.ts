import { useCallback, useRef } from 'react'

/** A callback with a fixed identity that always runs the latest closure, so memoised children are not re-rendered by it. */
export function useStableCallback<A extends unknown[], R>(callback: (...args: A) => R): (...args: A) => R {
  const latest = useRef(callback)
  latest.current = callback
  return useCallback((...args: A) => latest.current(...args), [])
}

/** Keeps the previous reference while the value is structurally equal (JSON data only). */
export function useStableValue<T>(value: T): T {
  const kept = useRef<{ value: T; json: string } | null>(null)
  const json = JSON.stringify(value)
  if (!kept.current || kept.current.json !== json) kept.current = { value, json }
  return kept.current.value
}
