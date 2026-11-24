import { useEffect, useState } from 'react'
import type { CountNotice } from '@/types/warehouse'

// Lagerstyring's folder on M: has no watcher, so Optælling is asked. Also while the window is hidden, or the Windows
// notifications (which only show when the Hub is not in front) would never come.
const VISIBLE_POLL_MS = 60_000
const HIDDEN_POLL_MS = 120_000
const CHANGE_DEBOUNCE_MS = 200

interface CountNotificationState {
  items: CountNotice[]
  /** True once the first answer came (also an error, or a Hub without Lagerstyring). */
  loaded: boolean
}

/** Optælling's notifications for the Hub's bell: join requests, materials sent for approval and the answers. */
export function useCountNotifications(userEmail: string): CountNotificationState {
  const [state, setState] = useState<CountNotificationState>({ items: [], loaded: false })

  useEffect(() => {
    const bridge = typeof window === 'undefined' ? undefined : window.electronWarehouse?.counts
    const api = typeof bridge?.notifications === 'function' && typeof bridge.onChanged === 'function' ? bridge : undefined
    setState({ items: [], loaded: !api || !userEmail })
    if (!api || !userEmail) return
    let active = true
    let reading = false
    let dirty = false
    let poll: ReturnType<typeof setTimeout> | undefined
    let debounce: ReturnType<typeof setTimeout> | undefined

    const schedule = () => {
      if (poll) clearTimeout(poll)
      poll = setTimeout(() => { void load() }, document.visibilityState === 'visible' ? VISIBLE_POLL_MS : HIDDEN_POLL_MS)
    }
    const load = async () => {
      if (!active) return
      if (reading) { dirty = true; return }
      reading = true
      dirty = false
      try {
        const items = await api.notifications()
        if (active) setState({ items, loaded: true })
      } catch {
        // A Hub without Lagerstyring has nothing here; with the drive away, the last answer is kept.
        if (active) setState(current => (current.loaded ? current : { items: [], loaded: true }))
      } finally {
        reading = false
        if (active) {
          if (dirty) void load()
          else schedule()
        }
      }
    }
    const soon = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => { debounce = undefined; void load() }, CHANGE_DEBOUNCE_MS)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') soon() }

    const unsubscribe = api.onChanged(soon)
    document.addEventListener('visibilitychange', onVisible)
    void load()
    return () => {
      active = false
      if (poll) clearTimeout(poll)
      if (debounce) clearTimeout(debounce)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userEmail])

  return state
}
