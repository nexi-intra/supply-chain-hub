import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SapStatus } from '@/types/warehouse'

const POLL_INTERVAL_MS = 5000
const UNKNOWN: SapStatus = { state: 'error', ready: false, system: null, client: null, user: null, reason: 'failed' }

interface SapStatusContextValue {
  status: SapStatus | null
  checking: boolean
  /** fresh = skip the short main-process cache; use it right before a SAP action. */
  refresh: (fresh?: boolean) => Promise<SapStatus>
}

const SapStatusContext = createContext<SapStatusContextValue | undefined>(undefined)

export function SapStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SapStatus | null>(null)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async (fresh = false) => {
    const bridge = window.electronWarehouse
    if (!bridge) return UNKNOWN
    if (fresh) setChecking(true)
    try {
      const next = await bridge.sap.status({ fresh })
      setStatus(next)
      return next
    } catch {
      setStatus(UNKNOWN)
      return UNKNOWN
    } finally {
      if (fresh) setChecking(false)
    }
  }, [])

  useEffect(() => {
    // Poll only while the window is in front: no SAP traffic from a window nobody looks at.
    const active = () => document.visibilityState === 'visible' && document.hasFocus()
    const tick = () => { if (active()) void refresh() }
    void refresh()
    const timer = window.setInterval(tick, POLL_INTERVAL_MS)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh])

  return <SapStatusContext.Provider value={{ status, checking, refresh }}>{children}</SapStatusContext.Provider>
}

export function useSapStatus() {
  const context = useContext(SapStatusContext)
  if (!context) throw new Error('useSapStatus must be used within SapStatusProvider')
  return context
}
