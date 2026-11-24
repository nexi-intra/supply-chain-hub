import { useMemo, useSyncExternalStore } from 'react'
import { trackPendingWrite } from '@/lib/pendingWrites'
import type { ActiveStatusProgress, CountListEntry, CountStatus, StatusOverview, StatusProgress } from '@/types/warehouse'

// Deleting a count or a status is a write to M: of 15–90 s. What is being deleted on this PC disappears at once from
// every list (the overview read from the drive still has it until the write is done) and comes back if it fails.

const hiddenCounts = new Set<string>()
const hiddenStatuses = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

function changed() {
  version += 1
  for (const listener of listeners) listener()
}

/** Hides the counts (and the status) at once and runs the delete in the background. Resolves to whether it was deleted. */
export function deleteInBackground({ counts = [], status = null }: { counts?: string[]; status?: string | null }, write: () => Promise<unknown>): Promise<boolean> {
  for (const id of counts) hiddenCounts.add(id)
  if (status) hiddenStatuses.add(status)
  changed()
  return trackPendingWrite(Promise.resolve().then(write)).then(
    () => true,
    error => {
      for (const id of counts) hiddenCounts.delete(id)
      if (status) hiddenStatuses.delete(status)
      changed()
      throw error
    },
  )
}

export const isBeingDeleted = (kind: 'count' | 'status', id: string) => (kind === 'count' ? hiddenCounts : hiddenStatuses).has(id)

function progressOf(counts: Pick<CountListEntry, 'status' | 'summary'>[]): StatusProgress {
  const reached = counts.reduce((sum, item) => sum + (item.summary?.reached || 0), 0)
  const total = counts.reduce((sum, item) => sum + (item.summary?.total || 0), 0)
  const valueDiff = Math.round(counts.reduce((sum, item) => sum + (item.summary?.valueDiff || 0), 0) * 100) / 100
  return { counts: counts.length, closed: counts.filter(item => item.status === 'closed').length, reached, total, percent: total ? Math.round((reached / total) * 100) : 0, valueDiff }
}

function withoutCounts(status: CountStatus): CountStatus {
  if (!status.counts.some(item => hiddenCounts.has(item.id))) return status
  const counts = status.counts.filter(item => !hiddenCounts.has(item.id))
  return { ...status, counts, progress: progressOf(counts), ...(status.taken ? { taken: status.taken.filter(item => !hiddenCounts.has(item.countId)) } : {}) }
}

/** The overview without what this PC is deleting, with the progress of each status counted again. */
export function withoutDeleted(overview: StatusOverview): StatusOverview {
  if (!hiddenCounts.size && !hiddenStatuses.size) return overview
  const statuses = overview.statuses.filter(item => !hiddenStatuses.has(item.id)).map(withoutCounts)
  const active = overview.active && !hiddenStatuses.has(overview.active.id) ? withoutCounts(overview.active) : null
  return { ...overview, active, statuses, unassigned: overview.unassigned.filter(item => !hiddenCounts.has(item.id)) }
}

/** The tools page's active status without what this PC is deleting, with its progress counted again. */
export function withoutDeletedActive(active: ActiveStatusProgress | null): ActiveStatusProgress | null {
  if (!active || hiddenStatuses.has(active.id)) return null
  if (!active.counts.some(item => hiddenCounts.has(item.id))) return active
  const counts = active.counts.filter(item => !hiddenCounts.has(item.id))
  return { ...active, counts, progress: progressOf(counts) }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** `overview` as it should be shown: follows deletes started (or failed) anywhere in the app. */
export function useWithoutDeleted<T extends StatusOverview | null>(overview: T): T {
  const current = useSyncExternalStore(subscribe, () => version)
  return useMemo(() => (overview ? withoutDeleted(overview) : overview) as T, [overview, current])
}
