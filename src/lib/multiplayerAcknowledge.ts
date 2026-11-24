import type { MultiplayerApi } from '@/lib/multiplayer'
import { newOperationId } from '@/lib/multiplayerView'

// Every acknowledge is a write to the shared multiplayer index, and on the network share one write
// takes from a few hundred ms to 10+ s. The bell and each open game used to send their own
// acknowledge every time the unread list changed. They now share one queue: ids that arrive
// within DELAY_MS go out as one command, and ids already acknowledged are never sent again.
const DELAY_MS = 1500
const BATCH = 100
const SENT_LIMIT = 2000

type Waiter = { ids: string[]; resolve: () => void; reject: (error: unknown) => void }

export function createAcknowledgeQueue(getApi: () => Pick<MultiplayerApi, 'command'> | undefined, { delayMs = DELAY_MS } = {}) {
  const sent = new Set<string>()
  let pending = new Set<string>()
  let waiters: Waiter[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  async function flush() {
    timer = null
    const ids = [...pending]
    const batchWaiters = waiters
    pending = new Set()
    waiters = []
    const api = getApi()
    const failed = new Set<string>()
    let firstError: unknown = null
    for (let start = 0; api && start < ids.length; start += BATCH) {
      const notificationIds = ids.slice(start, start + BATCH)
      try {
        await api.command({ operationId: newOperationId(), type: 'acknowledge', notificationIds })
        for (const id of notificationIds) sent.add(id)
      } catch (error) {
        firstError ??= error
        for (const id of notificationIds) failed.add(id)
      }
    }
    while (sent.size > SENT_LIMIT) sent.delete(sent.values().next().value as string)
    for (const waiter of batchWaiters) {
      if (waiter.ids.some(id => failed.has(id))) waiter.reject(firstError)
      else waiter.resolve()
    }
  }

  return function acknowledge(notificationIds: readonly string[]): Promise<void> {
    const fresh = notificationIds.filter(id => !sent.has(id))
    if (fresh.length === 0) return Promise.resolve()
    for (const id of fresh) pending.add(id)
    const promise = new Promise<void>((resolve, reject) => { waiters.push({ ids: fresh, resolve, reject }) })
    if (!timer) timer = setTimeout(() => { void flush() }, delayMs)
    return promise
  }
}

/** The one queue the whole renderer shares. */
export const acknowledgeMultiplayerNotifications = createAcknowledgeQueue(() => (typeof window === 'undefined' ? undefined : window.electronMultiplayer))
