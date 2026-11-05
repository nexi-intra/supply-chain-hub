import { useCallback, useEffect, useState } from 'react'
import type { MyHub } from '@/lib/electronRegistryBridge'
import { HUB_SWITCHED_EVENT } from '@/lib/hubSwitch'

// Waiting counts in the other hubs are not watched live, so they are refreshed now and then.
const REFRESH_MS = 60_000

export function useMyHubs(): { hubs: MyHub[]; reload: () => void } {
  const [hubs, setHubs] = useState<MyHub[]>([])
  const reload = useCallback(() => {
    window.electronRegistry?.listMyHubs().then(setHubs).catch(() => {})
  }, [])

  useEffect(() => {
    if (!window.electronRegistry) return
    reload()
    const timer = setInterval(reload, REFRESH_MS)
    const unsubscribe = window.electronRegistry.onHubsChanged(reload)
    const unsubscribeKv = window.kv.subscribe(keys => { if (keys.includes('users') || keys.includes('vacation-entries')) reload() })
    window.addEventListener(HUB_SWITCHED_EVENT, reload)
    return () => { clearInterval(timer); unsubscribe(); unsubscribeKv(); window.removeEventListener(HUB_SWITCHED_EVENT, reload) }
  }, [reload])

  return { hubs, reload }
}
