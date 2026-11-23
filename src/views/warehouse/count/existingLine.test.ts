import { describe, expect, it } from 'vitest'
import type { CountLine } from '@/types/warehouse'
import { addLineTarget, findExistingLine, placeKey, qtyForExisting } from './existingLine'

const line = (changes: Partial<CountLine>): CountLine => ({ lineId: 'ln-1', place: 'Reol 3', area: 'A', material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 10, status: 'counted', comment: '', by: 'anna@x.dk', byName: 'Anna', at: 1, ...changes })

describe('existingLine', () => {
  it('compares places as the drive saves them: spaces collapsed and trimmed, case ignored', () => {
    expect(placeKey('  reol   3 ')).toBe(placeKey('Reol 3'))
    expect(placeKey('Reol\t3')).toBe(placeKey('Reol 3'))
    expect(placeKey('Reol 3')).not.toBe(placeKey('Reol 33'))
  })

  it('finds the line on the same place, material and stock type', () => {
    const lines = [line({ lineId: 'ln-a' }), line({ lineId: 'ln-b', material: 'R162-0718' }), line({ lineId: 'ln-c', stockType: 'blocked' }), line({ lineId: 'ln-d', place: 'Reol 4' })]
    expect(findExistingLine(lines, { place: ' reol  3', material: 'R162-0717', stockType: 'unrestricted' })?.lineId).toBe('ln-a')
    expect(findExistingLine(lines, { place: 'Reol 3', material: 'R162-0717', stockType: 'blocked' })?.lineId).toBe('ln-c')
    expect(findExistingLine(lines, { place: 'Reol 5', material: 'R162-0717', stockType: 'unrestricted' })).toBeNull()
    expect(findExistingLine(lines, { place: '', material: 'R162-0717', stockType: 'unrestricted' })).toBeNull()
  })

  it('takes the last of several lines on the place, as the material list shows it', () => {
    const lines = [line({ lineId: 'ln-a', qty: 4 }), line({ lineId: 'ln-b', qty: 7 })]
    expect(findExistingLine(lines, { place: 'Reol 3', material: 'R162-0717', stockType: 'unrestricted' })?.lineId).toBe('ln-b')
  })

  it('sends the new quantity to replace and the old plus the new to add', () => {
    expect(qtyForExisting(line({ qty: 10 }), 6, 'replace')).toBe(6)
    expect(qtyForExisting(line({ qty: 10 }), 6, 'add')).toBe(16)
    expect(qtyForExisting(line({ qty: 10 }), 0, 'add')).toBe(10)
  })

  it('in Tilføj tællelinje overwrites the line only to replace; to add it saves a separate line of its own', () => {
    expect(addLineTarget(line({ lineId: 'ln-a' }), 'replace')?.lineId).toBe('ln-a')
    expect(addLineTarget(line({ lineId: 'ln-a' }), 'add')).toBeNull()
    expect(addLineTarget(null, 'replace')).toBeNull()
  })
})
