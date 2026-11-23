import type { LocationsTarget } from '@/lib/warehouse/locations'
import type { LocationSearch } from '@/types/warehouse'

/** Small decisions of the Placeringer screens, kept apart from React so they can be tested. */

type Suggestion = { material: string }

/**
 * What Enter in the material field chooses. A scanner types the whole number and Enter before the suggestions for it
 * have come, so a highlighted suggestion counts only when it belongs to the text now, or the user moved to it with
 * the arrow keys. Otherwise the typed number is taken.
 */
export function enterChoice({ value, suggestions, suggestionsFor, active, open, moved }: { value: string; suggestions: Suggestion[]; suggestionsFor: string | null; active: number; open: boolean; moved: boolean }): string | null {
  const text = value.trim()
  if (!text) return null
  const typed = text.toUpperCase()
  const exact = suggestions.find(item => item.material === typed)
  if (exact) return exact.material
  const current = suggestionsFor === text
  const highlighted = open && (moved || current) ? suggestions[active] : undefined
  if (highlighted) return highlighted.material
  if (current && suggestions.length === 1) return suggestions[0].material
  return typed
}

/** A search answer together with the text it was found for. */
export type SearchResult = { query: string; found: LocationSearch }
type SearchEnter = { open: LocationsTarget | null; waitFor: string | null }

/** The one hit of a search, or null when it found none or several. */
export function singleHit(found: LocationSearch): LocationsTarget | null {
  const hits: LocationsTarget[] = [
    ...found.materials.map(item => ({ kind: 'material' as const, id: item.material })),
    ...found.locations.map(item => ({ kind: 'location' as const, id: item.id })),
    ...found.pallets.map(item => ({ kind: 'pallet' as const, id: item.id })),
    ...found.racks.map(id => ({ kind: 'rack' as const, id })),
  ]
  return hits.length === 1 ? hits[0] : null
}

/**
 * Enter in the front-page search. A scanner sends the code and Enter before the search has answered, so a result for an
 * earlier text is never opened: Enter then waits for the result of this text (`waitFor`).
 */
export function enterOnSearch(result: SearchResult | null, query: string): SearchEnter {
  if (result && result.query === query) return { open: singleHit(result.found), waitFor: null }
  return { open: null, waitFor: query }
}

/** A result has come: it opens what Enter waited for, only when it is for that text and has exactly one hit. */
export function openWhenReady(waitFor: string | null, result: SearchResult): SearchEnter {
  if (waitFor === null) return { open: null, waitFor: null }
  if (result.query !== waitFor) return { open: null, waitFor }
  return { open: singleHit(result.found), waitFor: null }
}
/** FIFO: the chosen pallet was received later than the oldest reserve pallet (`reserve` is oldest first), so Tag and Fyld op ask first. */
export function youngerThanOldest(reserve: { id: string; receivedAt: number }[], pallet: { id: string; receivedAt: number }): boolean {
  const oldest = reserve[0]
  return Boolean(oldest && oldest.id !== pallet.id && oldest.receivedAt < pallet.receivedAt)
}
/** A 49/50 number with several materials: the one to choose after `after` (or first) that is not saved yet, null when all are done. */
export function nextUnsaved(count: number, saved: number[], after: number | null): number | null {
  const start = after === null ? 0 : after + 1
  for (let step = 0; step < count; step += 1) {
    const index = (start + step) % count
    if (!saved.includes(index)) return index
  }
  return null
}
/** Per 49/50 number, the indexes of its materials put on a shelf on this screen. */
export type SavedLines = Record<string, number[]>

export function markSaved(saved: SavedLines, document: string, index: number): SavedLines {
  const done = saved[document] || []
  return done.includes(index) ? saved : { ...saved, [document]: [...done, index] }
}

/** A refused put: only its own line is open again, whatever was saved after it stays saved. */
export function unmarkSaved(saved: SavedLines, document: string, index: number): SavedLines {
  return { ...saved, [document]: (saved[document] || []).filter(item => item !== index) }
}

/** The saved lines of a number with `count` materials; one that is all done starts over when it is scanned again. */
export function savedOf(saved: SavedLines, document: string, count: number): number[] {
  const done = saved[document] || []
  return done.length >= count ? [] : done
}

/** Enter in the quantity field saves, but not a held key, nor a line preselected after a save the user has not touched. */
export function enterSaves({ repeat, freshSelection }: { repeat: boolean; freshSelection: boolean }): boolean {
  return !repeat && !freshSelection
}
/**
 * The buttons when a refused put comes back into an empty form: those of the refused number (with what is saved now),
 * never those of another number, whose line indexes would point at other materials.
 */
export function restoredLines<T extends { document: string; saved: number[] }>(current: T | null, refused: T | null, saved: number[]): T | null {
  if (!refused) return null
  if (current?.document === refused.document) return current
  return { ...refused, saved }
}