import { describe, expect, it } from 'vitest'
import { vacationPreviewEntries } from './vacationPreview'
import type { VacationEntry } from './types'

const request = (id: string, status: VacationEntry['status'], startDate: string, endDate = startDate): VacationEntry => ({
  id, status, startDate, endDate, userId: id, userEmail: `${id}@example.test`,
})

describe('vacationPreviewEntries', () => {
  it('includes approved and pending overlaps once, excluding rejected and other months', () => {
    const selected = request('selected', 'pending', '2026-09-23')
    const approved = request('approved', 'approved', '2026-09-22', '2026-09-24')
    const pending = request('pending', 'pending', '2026-09-23')
    const rejected = request('rejected', 'rejected', '2026-09-23')
    const october = request('october', 'pending', '2026-10-01')
    expect(vacationPreviewEntries([approved, selected, pending, rejected, october], selected, 8, 2026).map((entry) => entry.id))
      .toEqual(['approved', 'selected', 'pending'])
    expect(vacationPreviewEntries([approved, pending], selected, 8, 2026).map((entry) => entry.id))
      .toEqual(['approved', 'pending', 'selected'])
  })
})