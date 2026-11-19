import { useEffect, useRef } from 'react'
import type { MultiplayerApi } from '@/lib/multiplayer'

// The opponent's move used to show up only after the mover's deferred index write and the 2 s
// shared-folder watcher (measured 4-7 s after the click). The game file is written first, so an
// open game now watches just that file's change marker (a metadata stat, no read): every second
// while waiting for the opponent, every 5 seconds otherwise (chat, reactions), never while hidden.
export const WAITING_POLL_MS = 1000
export const IDLE_POLL_MS = 5000

export interface StampWatcherOptions {
  read: () => Promise<string | null>
  onChange: () => void
  interval: () => number
  visible?: () => boolean
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}

/** Polls one stamp at a time (a slow share never builds a queue) and calls onChange when it differs from the last one seen. */
export function createStampWatcher({
  read, onChange, interval,
  visible = () => typeof document === 'undefined' || document.visibilityState === 'visible',
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: StampWatcherOptions) {
  let last: string | null | undefined
  let stopped = false
  let timer: unknown = null

  const schedule = () => { if (!stopped) timer = setTimer(() => { void tick() }, interval()) }

  async function tick() {
    if (stopped) return
    if (visible()) {
      try {
        const stamp = await read()
        if (stopped) return
        if (last !== undefined && stamp !== last) onChange()
        last = stamp
      } catch {
        // A failed stat is retried on the next tick; the regular change notice still arrives.
      }
    }
    schedule()
  }

  void tick()
  return {
    stop() {
      stopped = true
      if (timer !== null) clearTimer(timer)
    },
  }
}

export function useGameChangeWatch(
  api: Pick<MultiplayerApi, 'gameStamp'> | undefined,
  gameId: string,
  { active, waiting, onChange }: { active: boolean; waiting: boolean; onChange: () => void },
) {
  const waitingRef = useRef(waiting)
  const onChangeRef = useRef(onChange)
  waitingRef.current = waiting
  onChangeRef.current = onChange

  useEffect(() => {
    const gameStamp = api?.gameStamp
    if (!gameStamp || !active) return
    const watcher = createStampWatcher({
      read: () => gameStamp(gameId),
      onChange: () => onChangeRef.current(),
      interval: () => (waitingRef.current ? WAITING_POLL_MS : IDLE_POLL_MS),
    })
    return () => watcher.stop()
  }, [api, gameId, active])
}
