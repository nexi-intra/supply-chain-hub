export interface ActivityClock {
  current: number
}

interface ActivityTarget {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

interface InactivityWatcherOptions {
  target: ActivityTarget
  events: readonly string[]
  lastActivity: ActivityClock
  /** When false, activity is still tracked but no logout timer runs. */
  enforce: boolean
  timeoutMs: number
  checkEveryMs: number
  onTimeout: () => void
  now?: () => number
}

/**
 * Tracks activity in a mutable clock (no React state) and, when enforcing, calls onTimeout
 * checkEveryMs after the last activity and then every checkEveryMs while idle.
 */
export function watchInactivity(options: InactivityWatcherOptions): () => void {
  const { target, events, lastActivity, enforce, timeoutMs, checkEveryMs, onTimeout } = options
  const now = options.now ?? Date.now
  let timer: ReturnType<typeof setTimeout> | undefined

  const check = () => {
    if (now() - lastActivity.current > timeoutMs) onTimeout()
    timer = setTimeout(check, checkEveryMs)
  }
  if (enforce) timer = setTimeout(check, checkEveryMs)

  const handleActivity = () => {
    lastActivity.current = now()
    if (enforce) {
      clearTimeout(timer)
      timer = setTimeout(check, checkEveryMs)
    }
  }

  for (const event of events) target.addEventListener(event, handleActivity)
  return () => {
    clearTimeout(timer)
    for (const event of events) target.removeEventListener(event, handleActivity)
  }
}
