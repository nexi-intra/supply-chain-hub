import { useState } from 'react'

// A list a screen keeps in its own state (read from M: with window.kv.get) that shows a change at once, while the
// write behind it can take 20-90 s. A change stays shown until its write has ended, also when the list is read again
// meanwhile; a failed write puts the item back as it was.

export function applyOverrides<T>(list: T[], overrides: Map<string, T | null>, idOf: (item: T) => string): T[] {
  if (overrides.size === 0) return list
  const seen = new Set<string>()
  const next: T[] = []
  for (const item of list) {
    const id = idOf(item)
    if (!overrides.has(id)) { next.push(item); continue }
    seen.add(id)
    const replacement = overrides.get(id)
    if (replacement) next.push(replacement)
  }
  for (const [id, item] of overrides) if (item && !seen.has(id)) next.push(item)
  return next
}

export interface OptimisticList<T> {
  readonly items: T[]
  /** The list as read from the drive; changes still on their way are laid over it. */
  show(stored: T[]): void
  /**
   * Shows `changes` (id -> new item, or null = removed) at once. Resolves to whether `write` saved them: it failed if it
   * rejected or resolved to false/null, and then the items are put back as they were.
   */
  change(changes: Array<[string, T | null]>, write: Promise<unknown>): Promise<boolean>
}

export function createOptimisticList<T>(idOf: (item: T) => string, publish: (items: T[]) => void): OptimisticList<T> {
  let items: T[] = []
  const pending = new Map<string, T | null>()
  const set = (next: T[]) => { items = next; publish(next) }
  return {
    get items() { return items },
    show(stored) { set(applyOverrides(stored, pending, idOf)) },
    change(changes, write) {
      const mine = new Map(changes)
      const previous = new Map(items.filter(item => mine.has(idOf(item))).map(item => [idOf(item), item]))
      for (const [id, item] of mine) pending.set(id, item)
      set(applyOverrides(items, mine, idOf))
      return write.then(result => result !== false && result !== null, error => {
        console.error('Ændringen blev ikke gemt:', error)
        return false
      }).then(saved => {
        const undo = new Map<string, T | null>()
        for (const [id, item] of mine) {
          // A newer change to the same item is still on its way: that one decides what is shown.
          if (pending.get(id) !== item) continue
          pending.delete(id)
          if (!saved) undo.set(id, previous.get(id) ?? null)
        }
        if (undo.size > 0) set(applyOverrides(items, undo, idOf))
        return saved
      })
    },
  }
}

export function useOptimisticList<T>(idOf: (item: T) => string): [T[], OptimisticList<T>] {
  const [items, setItems] = useState<T[]>([])
  const [list] = useState(() => createOptimisticList(idOf, setItems))
  return [items, list]
}
