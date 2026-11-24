import { describe, expect, it } from 'vitest'
import type { CountLine } from '@/types/warehouse'
import { addLineTarget, existingTotal, findExistingLines, materialRowSave, mayReplace, placeKey } from './existingLine'

const line = (changes: Partial<CountLine>): CountLine => ({ lineId: 'ln-1', place: 'Reol 3', area: 'A', material: 'R162-0717', sloc: 'D000', stockType: 'unrestricted', qty: 10, status: 'counted', comment: '', by: 'anna@x.dk', byName: 'Anna', at: 1, ...changes })
const query = { place: 'Reol 3', material: 'R162-0717', stockType: 'unrestricted' as const }

describe('existingLine', () => {
  it('compares places as the drive saves them: spaces collapsed and trimmed, case ignored', () => {
    expect(placeKey('  reol   3 ')).toBe(placeKey('Reol 3'))
    expect(placeKey('Reol\t3')).toBe(placeKey('Reol 3'))
    expect(placeKey('Reol 3')).not.toBe(placeKey('Reol 33'))
  })

  it('finds every line on the same place, material and stock type', () => {
    const lines = [line({ lineId: 'ln-a' }), line({ lineId: 'ln-b', material: 'R162-0718' }), line({ lineId: 'ln-c', stockType: 'blocked' }), line({ lineId: 'ln-d', place: 'Reol 4' }), line({ lineId: 'ln-e', place: 'REOL  3' })]
    expect(findExistingLines(lines, { ...query, place: ' reol  3' }).map(item => item.lineId)).toEqual(['ln-a', 'ln-e'])
    expect(findExistingLines(lines, { ...query, stockType: 'blocked' }).map(item => item.lineId)).toEqual(['ln-c'])
    expect(findExistingLines(lines, { ...query, place: 'Reol 5' })).toEqual([])
    expect(findExistingLines(lines, { ...query, place: '' })).toEqual([])
  })

  it('asks with the total of all lines on the place and offers Erstat only for a single line', () => {
    const one = [line({ qty: 10 })]
    const several = [line({ lineId: 'ln-a', qty: 4 }), line({ lineId: 'ln-b', qty: 7 })]
    expect(existingTotal(one)).toBe(10)
    expect(existingTotal(several)).toBe(11)
    expect(mayReplace(one)).toBe(true)
    expect(mayReplace(several)).toBe(false)
  })

  it('Anden placering: one line is replaced or added to; several lines get the new quantity on the last one', () => {
    expect(materialRowSave([line({ lineId: 'ln-a', qty: 10 })], 6, 'replace')).toEqual({ lineId: 'ln-a', qty: 6 })
    expect(materialRowSave([line({ lineId: 'ln-a', qty: 10 })], 6, 'add')).toEqual({ lineId: 'ln-a', qty: 16 })
    const several = [line({ lineId: 'ln-a', qty: 4 }), line({ lineId: 'ln-b', qty: 7 })]
    expect(materialRowSave(several, 6, 'add')).toEqual({ lineId: 'ln-b', qty: 13 })
    // Erstat is never offered for several lines; if it came anyway, nothing counted is lost.
    expect(materialRowSave(several, 6, 'replace')).toEqual({ lineId: 'ln-b', qty: 13 })
  })

  it('Tilføj tællelinje overwrites only a single line to replace; to add it saves a separate line of its own', () => {
    expect(addLineTarget([line({ lineId: 'ln-a' })], 'replace')?.lineId).toBe('ln-a')
    expect(addLineTarget([line({ lineId: 'ln-a' })], 'add')).toBeNull()
    expect(addLineTarget([line({ lineId: 'ln-a' }), line({ lineId: 'ln-b' })], 'replace')).toBeNull()
    expect(addLineTarget([], 'replace')).toBeNull()
  })
})