import type { ShiftAssignment } from './types'

export type ShiftDayNotes = Record<string, string>

export function shiftDayNoteKey(date: string, employeeId: string): string {
  return `${date}|${employeeId}`
}

// Nye dagsnoter har forrang. Gamle kommentarer paa enkelte tildelinger og
// gentagne vagter kan stadig laeses uden at aendre eksisterende data.
export function resolveShiftDayComment(
  notes: ShiftDayNotes | undefined,
  date: string,
  employeeId: string,
  assignments: Pick<ShiftAssignment, 'employeeId' | 'date' | 'comment'>[],
): string {
  const key = shiftDayNoteKey(date, employeeId)
  if (notes && Object.prototype.hasOwnProperty.call(notes, key)) return notes[key] || ''
  return assignments.find(a => a.employeeId === employeeId && a.date === date && a.comment?.trim())?.comment?.trim() || ''
}

export function setShiftDayNote(notes: ShiftDayNotes | undefined, date: string, employeeId: string, comment: string): ShiftDayNotes {
  return { ...(notes || {}), [shiftDayNoteKey(date, employeeId)]: comment.trim() }
}

export function updateShiftDayAssignments(assignments: ShiftAssignment[] | undefined, date: string, employeeId: string, comment: string): ShiftAssignment[] {
  const trimmed = comment.trim() || undefined
  return (assignments || []).map(a => a.employeeId === employeeId && a.date === date ? { ...a, comment: trimmed } : a)
}
