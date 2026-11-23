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
