import type { CountLine, StockType } from '@/types/warehouse'

export type ExistingChoice = 'replace' | 'add'

/** A place as the drive compares it: saved like countService `clean(place, 60)`, looked up without case. */
export const placeKey = (place: string) => place.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase()

/** The line already counted on the place for this material and stock type; of several, the last (as the material list shows it). */
export function findExistingLine(lines: CountLine[], { place, material, stockType }: { place: string; material: string; stockType: StockType }): CountLine | null {
  const key = placeKey(place)
  if (!key) return null
  let found: CountLine | null = null
  for (const line of lines) if (line.material === material && line.stockType === stockType && placeKey(line.place) === key) found = line
  return found
}

/** The quantity to save on the existing line: the new one to replace it, the old plus the new to add to it. */
export const qtyForExisting = (existing: Pick<CountLine, 'qty'>, value: number, choice: ExistingChoice) => (choice === 'add' ? existing.qty + value : value)
