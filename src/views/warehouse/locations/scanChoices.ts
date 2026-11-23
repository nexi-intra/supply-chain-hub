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