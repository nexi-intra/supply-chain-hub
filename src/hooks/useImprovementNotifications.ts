import { useEffect, useMemo, useState } from 'react'
import { unreadImprovementNotifications, type ImprovementCase } from '@/lib/improvements'

interface ImprovementNotificationState {
  actorEmail: string
  cases: ImprovementCase[]
  /** True once the first snapshot has been answered (successfully or not). */
  loaded: boolean
}

const EMPTY: ImprovementNotificationState = { actorEmail: '', cases: [], loaded: false }

/** Ulæste Forbedringer-notifikationer til hubbens klokke; følger modulets egen ændrings-kanal. */
export function useImprovementNotificationState(userEmail: string) {
  const [state, setState] = useState<ImprovementNotificationState>(EMPTY)

  useEffect(() => {
    const api = window.electronImprovements
    const expected = userEmail.trim().toLowerCase()
    setState(api && expected ? EMPTY : { ...EMPTY, loaded: true })
    if (!api || !expected) return
    let active = true
    let reading = false
    let dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const load = async () => {
      if (!active) return
      if (reading) { dirty = true; return }
      reading = true
      dirty = false
      try {
        const result = await api.snapshot()
        if (!active) return
        const actorEmail = result.actor.email.trim().toLowerCase()
        setState(actorEmail === expected ? { actorEmail, cases: result.cases, loaded: true } : { ...EMPTY, loaded: true })
      } catch {
        // Klokken er sekundær: manglende adgang/forbindelse vises i selve modulet.
        if (active) setState({ ...EMPTY, loaded: true })
      } finally {
        reading = false
        if (active && dirty) void load()
      }
    }
    const unsubscribe = api.onChanged(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; void load() }, 200)
    })
    void load()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [userEmail])

  const items = useMemo(() => unreadImprovementNotifications(state.cases, state.actorEmail), [state])
  return { items, cases: state.cases, loaded: state.loaded }
}

export function useImprovementNotifications(userEmail: string) {
  return useImprovementNotificationState(userEmail).items
}
