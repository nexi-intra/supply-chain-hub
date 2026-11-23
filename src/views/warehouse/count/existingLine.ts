import type { CountLine, StockType } from '@/types/warehouse'

export type ExistingChoice = 'replace' | 'add'

/** A place as the drive compares it: saved like countService `clean(place, 60)`, looked up without case. */
export const placeKey = (place: string) => place.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase()

/** Every line already counted on the place for this material and stock type, in list order. */
export function findExistingLines(lines: CountLine[], { place, material, stockType }: { place: string; material: string; stockType: StockType }): CountLine[] {
  const key = placeKey(place)
  if (!key) return []
  return lines.filter(line => line.material === material && line.stockType === stockType && placeKey(line.place) === key)
}

/** What is counted on the place in total ({n} in the question). */
export const existingTotal = (lines: Pick<CountLine, 'qty'>[]) => lines.reduce((sum, line) => sum + line.qty, 0)

/** Erstat only for a single line: the dialog must never delete other counters' lines. */
export const mayReplace = (lines: CountLine[]) => lines.length === 1

/** Anden placering saves on the last line: the new quantity to replace a single line, otherwise its quantity plus the new. */
export function materialRowSave(lines: CountLine[], value: number, choice: ExistingChoice) {
  const last = lines[lines.length - 1]
  return { lineId: last.lineId, qty: choice === 'replace' && mayReplace(lines) ? value : last.qty + value }
}

/** Tilføj tællelinje: the single line to overwrite when the counter replaces it; adding saves a separate line, so each counter keeps their own name. */
export const addLineTarget = (lines: CountLine[], choice: ExistingChoice) => (choice === 'replace' && mayReplace(lines) ? lines[0] : null)