import { describe, expect, it } from 'vitest'
import type { CountListEntry, CountStatus, StatusOverview } from '@/types/warehouse'
import { deleteInBackground, isBeingDeleted, withoutDeleted } from './pendingDeletes'

const entry = (id: string, reached: number, total: number): CountListEntry => ({ id, name: id, status: 'open', summary: { percent: 0, reached, total, valueDiff: -10, updatedAt: 1 } } as unknown as CountListEntry)
const status = (id: string, counts: CountListEntry[]): CountStatus => ({ id, name: id, state: 'open', counts, progress: { counts: counts.length, closed: 0, reached: 0, total: 0, percent: 0, valueDiff: 0 }, taken: counts.map(item => ({ countId: item.id })) } as unknown as CountStatus)

function overview(): StatusOverview {
  const active = status('s1', [entry('c1', 5, 10), entry('c2', 10, 10)])
  return { active, statuses: [active, status('s0', [])], unassigned: [entry('c3', 0, 0)], canManage: true }
}

describe('deleting on the shared drive shows at once', () => {
  it('hides a count everywhere while it is deleted, with the status figures counted again', async () => {
    let finish!: () => void
    const deleted = deleteInBackground({ counts: ['c1'] }, () => new Promise<void>(resolve => { finish = resolve }))
    const shown = withoutDeleted(overview())
    expect(shown.active!.counts.map(item => item.id)).toEqual(['c2'])
    expect(shown.active!.taken!.map(item => item.countId)).toEqual(['c2'])
    expect([shown.active!.progress.counts, shown.active!.progress.percent, shown.active!.progress.valueDiff]).toEqual([1, 100, -10])
    expect(shown.statuses[0]).toEqual(shown.active)
    await new Promise(resolve => setTimeout(resolve, 0))
    finish()
    expect(await deleted).toBe(true)
    expect(isBeingDeleted('count', 'c1')).toBe(true)
  })

  it('a failed delete shows the status and its counts again', async () => {
    const deleted = deleteInBackground({ status: 's0', counts: ['c3'] }, () => Promise.reject(new Error('M: utilgængeligt')))
    expect(withoutDeleted(overview()).statuses.map(item => item.id)).not.toContain('s0')
    expect(withoutDeleted(overview()).unassigned).toEqual([])
    await expect(deleted).rejects.toThrow('M: utilgængeligt')
    expect(withoutDeleted(overview()).statuses.map(item => item.id)).toContain('s0')
    expect(withoutDeleted(overview()).unassigned.map(item => item.id)).toEqual(['c3'])
  })
})
