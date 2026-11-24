// Delt oprettelseslogik for en personlig to-do — brugt af BÅDE To Do-visningen
// (ProjectBoard.tsx) og Hubert's "opret to-do"-skill (HubAssistant.tsx), så
// begge veje skriver via præcis samme KV-struktur. Ingen ny/parallel skrivevej.
import { newId } from './utils'
import { appendToKvArray } from './kvArrays'
import { shiftTimeError, toShiftTime } from './shiftTimes'

// Samme union som ProjectBoard.tsx's ProjectStatus — holdt lokalt for at
// undgå en views->lib->views afhængighedscirkel (ProjectBoard importerer
// createPersonalTodo herfra).
type PersonalTodoStatus = 'open' | 'in-progress' | 'completed'

export interface PersonalTodo {
  id: string
  title: string
  description?: string
  status: PersonalTodoStatus
  createdAt: string
  completedAt?: string
  done?: boolean
  /** Valgfri forfaldsdato (YYYY-MM-DD) - naar opgaven skal vaere lavet. For en aftale: dagen den ligger paa. */
  dueDate?: string
  /** 'event' = en aftale uden flueben; mangler = almindelig to-do. */
  kind?: 'todo' | 'event'
  /** Valgfrit 'HH:mm' paa dueDate. */
  startTime?: string
  endTime?: string
}

export interface PersonalTodoSchedule {
  kind?: 'todo' | 'event'
  startTime?: string
  endTime?: string
}

export function personalTodosKey(userEmail: string): string {
  return `todos-personal-${userEmail}`
}

/** A time or an appointment needs a date, and the time range must be valid. */
export function personalTodoScheduleProblem(dueDate: string | undefined, schedule: PersonalTodoSchedule = {}): 'MISSING_DATE' | 'INVALID_TIME' | null {
  const start = schedule.startTime?.trim() || ''
  const end = schedule.endTime?.trim() || ''
  if ((schedule.kind === 'event' || start || end) && !dueDate?.trim()) return 'MISSING_DATE'
  return shiftTimeError(start, end) ? 'INVALID_TIME' : null
}

/** Kaster hvis titlen er tom, eller hvis tid/aftale mangler dato eller har en ugyldig tid. */
export async function createPersonalTodo(userEmail: string, title: string, description?: string, dueDate?: string, identity?: Pick<PersonalTodo, 'id' | 'createdAt'>, schedule?: PersonalTodoSchedule): Promise<PersonalTodo> {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error('MISSING_TITLE')
  const problem = personalTodoScheduleProblem(dueDate, schedule)
  if (problem) throw new Error(problem)

  const todo: PersonalTodo = {
    id: identity?.id || newId('todo'),
    title: trimmedTitle,
    description: description?.trim() || undefined,
    status: 'open',
    createdAt: identity?.createdAt || new Date().toISOString(),
    dueDate: dueDate?.trim() || undefined,
    kind: schedule?.kind === 'event' ? 'event' : undefined,
    ...toShiftTime(schedule?.startTime || '', schedule?.endTime || ''),
  }
  await appendToKvArray<PersonalTodo>(personalTodosKey(userEmail), [todo])
  return todo
}
