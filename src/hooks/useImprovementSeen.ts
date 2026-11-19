import { useCallback, useEffect, useRef, useState } from 'react'
import { lastForeignActivity, type ImprovementCase, type ImprovementSeenState } from '@/lib/improvements'

const WRITE_DELAY_MS = 800

/** Per-user record of when each suggestion was last opened, kept in the user's own team store. */
export function useImprovementSeen(userEmail: string) {
  const email = userEmail.trim().toLowerCase()
  const key = `improvement-seen-${email}`
  const [seen, setSeen] = useState<ImprovementSeenState | null>(null)
  const latest = useRef<ImprovementSeenState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = undefined
    if (latest.current && typeof window !== 'undefined' && window.kv) void window.kv.set(key, latest.current).catch(() => {})
  }, [key])

  useEffect(() => {
    if (!email || typeof window === 'undefined' || !window.kv) return
    let active = true
    window.kv.get<ImprovementSeenState>(key).then(stored => {
      if (!active) return
      const value = stored && typeof stored.since === 'string' && stored.cases && typeof stored.cases === 'object'
        ? stored
        : { since: new Date().toISOString(), cases: {} }
      latest.current = value
      setSeen(value)
      if (value !== stored) flush()
    }, () => {})
    return () => { active = false; flush() }
  }, [email, key, flush])

  const markSeen = useCallback((entry: ImprovementCase) => {
    const current = latest.current
    if (!current) return
    // Another machine's clock may run ahead; never record a time before the change itself.
    const activity = Date.parse(lastForeignActivity(entry, email) ?? '') || 0
    if (activity <= (Date.parse(current.cases[entry.id] ?? '') || 0)) return
    const at = new Date(Math.max(Date.now(), activity)).toISOString()
    const next = { ...current, cases: { ...current.cases, [entry.id]: at } }
    latest.current = next
    setSeen(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, WRITE_DELAY_MS)
  }, [email, flush])

  return { seen, markSeen }
}
