// Rene, testbare regler for forfaldsdato-status paa en to-do (personlig eller
// team). Bruges baade til visning paa selve to-do-kortet (ProjectBoard.tsx) og
// til at afgoere hvilke notifikationer NotificationCenter skal vise.
export type TodoDueStatus = 'overdue' | 'today' | 'upcoming'

const localDateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** null naar der ikke er noget at vise: ingen dato sat, eller to-do'en er allerede faerdig. */
export function todoDueStatus(dueDate: string | undefined, isCompleted: boolean, now: Date = new Date()): TodoDueStatus | null {
  if (!dueDate || isCompleted) return null
  const today = localDateString(now)
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  return 'upcoming'
}
