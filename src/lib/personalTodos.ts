// Delt oprettelseslogik for en personlig to-do — brugt af BÅDE To Do-visningen
// (ProjectBoard.tsx) og Hubert's "opret to-do"-skill (HubAssistant.tsx), så
// begge veje skriver via præcis samme KV-struktur. Ingen ny/parallel skrivevej.
import { newId } from './utils'
import { appendToKvArray } from './kvArrays'

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
  /** Valgfri forfaldsdato (YYYY-MM-DD) - naar opgaven skal vaere lavet. */
  dueDate?: string
}

export function personalTodosKey(userEmail: string): string {
  return `todos-personal-${userEmail}`
}

/** Kaster hvis titlen er tom. */
export async function createPersonalTodo(userEmail: string, title: string, description?: string, dueDate?: string): Promise<PersonalTodo> {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error('MISSING_TITLE')

  const todo: PersonalTodo = {
    id: newId('todo'),
    title: trimmedTitle,
    description: description?.trim() || undefined,
    status: 'open',
    createdAt: new Date().toISOString(),
    dueDate: dueDate?.trim() || undefined,
  }
  await appendToKvArray<PersonalTodo>(personalTodosKey(userEmail), [todo])
  return todo
}
