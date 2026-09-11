import { useEffect, useState } from 'react'
import type { StorageConnectionStatus, StorageSyncResult } from '@/lib/electronKvBridge'

export type { StorageConnectionStatus, StorageSyncResult }

/**
 * Live forbindelsesstatus til den delte datamappe. Kun relevant i Electron —
 * i browseren (localStorage) er der intet netværksdrev at miste forbindelsen til.
 */
export function useStorageConnection(): StorageConnectionStatus | null {
  const [status, setStatus] = useState<StorageConnectionStatus | null>(null)

  useEffect(() => {
    if (!window.electronKv) return
    let cancelled = false

    window.electronKv.getConnectionStatus()
      .then((initial) => { if (!cancelled) setStatus(initial) })
      .catch((error) => console.error('Kunne ikke hente forbindelsesstatus:', error))

    const unsubscribe = window.electronKv.onConnectionChanged((next) => setStatus(next))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return status
}
