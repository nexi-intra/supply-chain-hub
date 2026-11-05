import { describe, expect, it } from 'vitest'
import { resolveShiftDayComment, setShiftDayNote, updateShiftDayAssignments } from './shiftDayComments'
import type { ShiftAssignment } from './types'

const assignments: ShiftAssignment[] = [
  { id: 'sa', employeeId: 'lasse@example.com', employeeName: 'Lasse', date: '2026-09-24', roleId: 'sa', comment: 'Går tidligt' },
  { id: 'close', employeeId: 'lasse@example.com', employeeName: 'Lasse', date: '2026-09-24', roleId: 'close' },
  { id: 'tomorrow', employeeId: 'lasse@example.com', employeeName: 'Lasse', date: '2026-09-25', roleId: 'sa' },
  { id: 'other', employeeId: 'else@example.com', employeeName: 'Else', date: '2026-09-24', roleId: 'sa' },
]

describe('one shift comment per employee and day', () => {
  it('shows a legacy comment on every task without changing another day or person', () => {
    expect(resolveShiftDayComment({}, '2026-09-24', 'lasse@example.com', assignments)).toBe('Går tidligt')
    const updated = updateShiftDayAssignments(assignments, '2026-09-24', 'lasse@example.com', 'Kommer sent')
    expect(updated.slice(0, 2).map(a => a.comment)).toEqual(['Kommer sent', 'Kommer sent'])
    expect(updated.slice(2)).toEqual(assignments.slice(2))
  })

  it('lets a daily note override a repeating task and explicitly clear an old comment', () => {
    const changed = setShiftDayNote({}, '2026-09-24', 'lasse@example.com', 'Ny besked')
    expect(resolveShiftDayComment(changed, '2026-09-24', 'lasse@example.com', assignments)).toBe('Ny besked')
    const cleared = setShiftDayNote(changed, '2026-09-24', 'lasse@example.com', '')
    expect(resolveShiftDayComment(cleared, '2026-09-24', 'lasse@example.com', assignments)).toBe('')
  })
})
