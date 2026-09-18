import { useState, useEffect, useCallback, useRef } from 'react'
import { persistKvChange } from '../lib/persistKvChange'
import { toast } from 'sonner'

type SetValue<T> = T | ((current: T) => T)

// Session-lived snapshot of the last value seen for each key. Lets a view that
// re-mounts (e.g. returning to the Hub) render the previous data instantly and
// revalidate against the shared folder in the background, instead of showing an
// empty widget for seconds while the slow network read completes.
const kvSnapshotCache = new Map<string, unknown>()

// Under aktivt spil (data-game-active paa <body>) udskydes KV-genindlaesninger,
// saa den store re-render-kaede ikke blokerer spillets mus/tastatur-input. Naar
// spillet slutter og attributten fjernes, genindlaeses de udskudte noegler.
let kvGamesActive = false
let kvWatchStarted = false
const kvResumeListeners = new Set<() => void>()
function ensureGameActiveWatch() {
  if (kvWatchStarted || typeof document === 'undefined' || !document.body) return
  kvWatchStarted = true
  const sync = () => {
    const active = document.body.hasAttribute('data-game-active')
    if (active === kvGamesActive) return
    kvGamesActive = active
    if (!active) kvResumeListeners.forEach((fn) => fn())
  }
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-game-active'] })
  sync()
}

// React hook over the app KV store (window.kv — shared folder in the desktop
// app, localStorage in the browser). Subscribes to changes so edits made by
// other clients/tabs show up live in open views.
export function useKV<T>(key: string, initialValue: T, options?: { initializeIfMissing?: boolean }): [T, (value: SetValue<T>) => Promise<void>, () => void] {
  const [value, setValueState] = useState<T>(() => (kvSnapshotCache.has(key) ? (kvSnapshotCache.get(key) as T) : initialValue))
  const valueRef = useRef(value)
  valueRef.current = value
  const saveChain = useRef<Promise<void>>(Promise.resolve())
  const pendingSave = useRef(false)
  const loadSequence = useRef(0)
  const keyRef = useRef(key)
  keyRef.current = key
  const lifecycle = useRef(0)
  const initialValueRef = useRef(initialValue)
  const initializeIfMissingRef = useRef(options?.initializeIfMissing !== false)

  useEffect(() => {
    ensureGameActiveWatch()
    lifecycle.current++
    pendingSave.current = false
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    // Show the last value we saw for this key right away (survives navigation)
    // while the fresh read below revalidates it.
    if (kvSnapshotCache.has(key)) {
      const cached = kvSnapshotCache.get(key) as T
      valueRef.current = cached
      setValueState(cached)
    }

    const load = (attempt = 0) => {
      const sequence = ++loadSequence.current
      window.kv.get<T>(key).then((stored) => {
        if (cancelled || sequence !== loadSequence.current || pendingSave.current) return
        if (stored !== undefined) {
          valueRef.current = stored
          setValueState(stored)
          kvSnapshotCache.set(key, stored)
        } else if (initializeIfMissingRef.current) {
          void window.kv.compareAndSet(key, undefined, initialValueRef.current).catch(error => {
            if (!cancelled && String(error).includes('KV_CONFLICT')) load()
            else console.error('KV initialization failed', error)
          })
        }
      }).catch((error) => {
        console.error(`Kunne ikke læse KV-nøglen "${key}":`, error)
        if (!cancelled && attempt < 5) {
          retryTimer = setTimeout(() => load(attempt + 1), (attempt + 1) * 1000)
        }
      })
    }

    load()
    // Only reload when *this specific key* changes (not on all changes).
    // This prevents unnecessary re-renders when other keys are modified.
    let deferredReload = false
    const unsubscribe = window.kv.subscribe((changedKeys) => {
      if (!changedKeys.includes(key)) return
      // Udskyd genindlaesning under spil — ellers blokerer re-render kaeden input.
      if (kvGamesActive) { deferredReload = true; return }
      load()
    })
    const onGamesEnded = () => { if (deferredReload) { deferredReload = false; load() } }
    kvResumeListeners.add(onGamesEnded)

    return () => {
      lifecycle.current++
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      unsubscribe()
      kvResumeListeners.delete(onGamesEnded)
    }
  }, [key])

  const setValue = useCallback((newValue: SetValue<T>) => {
    const previous = structuredClone(valueRef.current)
    const generation = lifecycle.current
    // Keep controls responsive while shared-folder I/O is pending. Each queued
    // edit captures the previous local prediction; the server still checks its
    // real snapshot and rejects stale direct replacements.
    const predicted = typeof newValue === 'function' ? (newValue as (current: T) => T)(structuredClone(previous)) : newValue
    pendingSave.current = true
    loadSequence.current++
    valueRef.current = predicted
    setValueState(predicted)
    kvSnapshotCache.set(key, predicted)
    const promise: Promise<void> = saveChain.current.catch(() => {}).then(async () => {
      if (keyRef.current !== key || lifecycle.current !== generation) throw new Error('Hubben blev skiftet under gemningen')
      const next = await persistKvChange(key, previous, newValue)
      if (keyRef.current !== key || lifecycle.current !== generation || saveChain.current !== promise) return
      pendingSave.current = false
      loadSequence.current++
      valueRef.current = next
      setValueState(next)
      kvSnapshotCache.set(key, next)
    })
    saveChain.current = promise
    // Existing fire-and-forget callers still receive a visible failure; callers
    // that await the returned promise can stop their success flow on failure.
    void promise.catch(async error => {
      console.error('KV save failed', error)
      toast.error(String(error).includes('KV_CONFLICT') ? 'Data er ændret af en anden bruger. Genindlæs og prøv igen.' : 'Ændringen kunne ikke gemmes. Prøv igen.')
      if (keyRef.current !== key || lifecycle.current !== generation || saveChain.current !== promise) return
      pendingSave.current = false
      const sequence = ++loadSequence.current
      try {
        const stored = await window.kv.get<T>(key)
        if (keyRef.current !== key || lifecycle.current !== generation || pendingSave.current || sequence !== loadSequence.current) return
        const restored = stored === undefined ? initialValueRef.current : stored
        valueRef.current = restored
        setValueState(restored)
        kvSnapshotCache.set(key, restored)
      } catch (reloadError) { console.error('KV reload after failed save failed', reloadError) }
    })
    return promise
  }, [key])

  const deleteValue = useCallback(() => {
    void window.kv.delete(key).then(() => { kvSnapshotCache.delete(key); if (keyRef.current === key) setValueState(initialValueRef.current) }).catch(error => console.error('KV delete failed', error))
  }, [key])

  return [value, setValue, deleteValue]
}
