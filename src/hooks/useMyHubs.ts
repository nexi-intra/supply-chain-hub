import { useEffect, useSyncExternalStore } from 'react'
import type { MyHub } from '@/lib/electronRegistryBridge'
import { HUB_SWITCHED_EVENT } from '@/lib/hubSwitch'

// Waiting counts in the other hubs are not watched live, so they are refreshed now and then.
const REFRESH_MS = 60_000
// Change notices arrive in bursts (several keys, several windows); one reload covers them all.
const COALESCE_MS = 400

// One shared copy for every component that shows the hubs (Hub, command palette, profile).
// Each used to poll on its own: three identical 60 s polls plus a reload per change notice,
// and every call costs several reads on the shared drive.
let hubs: MyHub[] = []
const listeners = new Set<() => void>()
let inFlight: Promise<void> | null = null
let queued: ReturnType<typeof setTimeout> | null = null
let subscribers = 0
let stopWatching: (() => void) | null = null

function emit() {
  for (const listener of listeners) listener()
}

function load(): Promise<void> {
  if (!window.electronRegistry) return Promise.resolve()
  if (inFlight) return inFlight
  inFlight = window.electronRegistry.listMyHubs()
    .then(next => { hubs = next; emit() })
    .catch(() => {})
    .finally(() => { inFlight = null })
  return inFlight
}

function scheduleReload() {
  if (queued) return
  queued = setTimeout(() => { queued = null; void load() }, COALESCE_MS)
}

function startWatching(): () => void {
  const registry = window.electronRegistry
  if (!registry) return () => {}
  void load()
  const timer = setInterval(() => { if (document.visibilityState === 'visible') scheduleReload() }, REFRESH_MS)
  const onVisible = () => { if (document.visibilityState === 'visible') scheduleReload() }
  const unsubscribe = registry.onHubsChanged(scheduleReload)
  const unsubscribeKv = window.kv.subscribe(keys => { if (keys.includes('users') || keys.includes('vacation-entries')) scheduleReload() })
  window.addEventListener(HUB_SWITCHED_EVENT, scheduleReload)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(timer)
    if (queued) { clearTimeout(queued); queued = null }
    unsubscribe()
    unsubscribeKv()
    window.removeEventListener(HUB_SWITCHED_EVENT, scheduleReload)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const snapshot = () => hubs

export function useMyHubs(): { hubs: MyHub[]; reload: () => void } {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    if (subscribers++ === 0) stopWatching = startWatching()
    return () => {
      if (--subscribers === 0) { stopWatching?.(); stopWatching = null }
    }
  }, [])
  return { hubs: current, reload: scheduleReload }
}
