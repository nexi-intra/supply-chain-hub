// Writes to the shared drive that are still on their way. Many screens show a change at once and save it in the
// background (a write to M: takes up to 90 s); this counts them. Nothing is shown for it on screen (07.11: a visible
// "Gemmer …" made the app feel slow) - a failed write still shows an error toast.

let pending = 0
const listeners = new Set<(count: number) => void>()

const emit = () => listeners.forEach(listener => listener(pending))

export function trackPendingWrite<T>(write: Promise<T>): Promise<T> {
  pending++
  emit()
  return write.finally(() => {
    pending--
    emit()
  })
}

export function pendingWriteCount(): number {
  return pending
}

export function subscribePendingWrites(listener: (count: number) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
