// Shared write paths used by both the module screens and Hubert's actions (HubAssistant.tsx),
// so a confirmed Hubert proposal writes exactly what the manual form would.
import { appendToKvArray, removeFromKvArray } from './kvArrays'
import { newId } from './utils'
import { personalTodoScheduleProblem } from './personalTodos'
import { toShiftTime } from './shiftTimes'
import type { Email, HomeOfficeException } from './types'
import type { Note } from '@/views/VirtualNotebook'
import type { Project } from '@/views/ProjectBoard'

/** One day as home office (or office); replaces the user's existing exception for that date. */
export async function setHomeOfficeDay(userEmail: string, date: string, isHomeOffice = true): Promise<HomeOfficeException> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_DATE')
  const current = (await window.kv.get<HomeOfficeException[]>('home-office-exceptions')) || []
  const stale = current.filter(item => item.userEmail === userEmail && item.date === date).map(item => item.id)
  if (stale.length) await removeFromKvArray<HomeOfficeException>('home-office-exceptions', stale)
  const entry: HomeOfficeException = { id: newId('homeoffice'), userEmail, date, isHomeOffice }
  await appendToKvArray('home-office-exceptions', [entry])
  return entry
}

export interface CreateNoteParams {
  userEmail: string
  userName: string
  title: string
  content: string
  isPersonal: boolean
  tags?: string[]
  identity?: { id: string; createdAt: string }
}

export async function createNote({ userEmail, userName, title, content, isPersonal, tags = [], identity }: CreateNoteParams): Promise<Note> {
  if (!title.trim()) throw new Error('MISSING_TITLE')
  if (!content.trim()) throw new Error('MISSING_CONTENT')
  const creation = identity || { id: newId('note'), createdAt: new Date().toISOString() }
  const note: Note = {
    id: creation.id,
    title: title.trim(),
    content: content.trim(),
    creatorEmail: userEmail,
    creatorName: userName,
    createdAt: creation.createdAt,
    updatedAt: creation.createdAt,
    isPersonal,
    ...(tags.length > 0 ? { tags } : {}),
  }
  await appendToKvArray('notebook-notes', [note])
  return note
}

export interface SendMessageParams {
  from: string
  to: string
  subject: string
  message: string
  threadId?: string | null
}

/** Internal mail to a colleague in the same team; throws USER_NOT_FOUND when the recipient is not in the team's users. */
export async function sendInternalMessage({ from, to, subject, message, threadId }: SendMessageParams): Promise<Email> {
  if (!to || !subject.trim() || !message.trim()) throw new Error('MISSING_FIELDS')
  const users = (await window.kv.get<Record<string, { email: string }>>('users')) || {}
  if (!Object.values(users).some(user => user?.email === to) && !users[to]) throw new Error('USER_NOT_FOUND')
  const email: Email = {
    id: newId('email'),
    from,
    to,
    subject: subject.trim(),
    message: message.trim(),
    timestamp: Date.now(),
    read: false,
    ...(threadId ? { threadId } : {}),
  }
  await appendToKvArray('emails', [email])
  await appendToKvArray('email-notifications', [{
    id: newId('notif'),
    type: 'email' as const,
    message: `Ny email fra ${from}: ${email.subject}`,
    timestamp: Date.now(),
    read: false,
    from,
    emailId: email.id,
  }])
  return email
}

export interface CreateTeamTodoParams {
  userEmail: string
  userName: string
  title: string
  description?: string
  dueDate?: string
  startTime?: string
  endTime?: string
  identity?: { id: string; createdAt: string }
}

export async function createTeamTodo({ userEmail, userName, title, description = '', dueDate, startTime = '', endTime = '', identity }: CreateTeamTodoParams): Promise<Project> {
  if (!title.trim()) throw new Error('MISSING_TITLE')
  const problem = personalTodoScheduleProblem(dueDate, { startTime, endTime })
  if (problem) throw new Error(problem)
  const creation = identity || { id: newId('project'), createdAt: new Date().toISOString() }
  const project: Project = {
    id: creation.id,
    title: title.trim(),
    description: description.trim(),
    createdBy: userEmail,
    createdByName: userName,
    createdAt: creation.createdAt,
    status: 'open',
    teamMembers: [],
    dueDate: dueDate?.trim() || undefined,
    ...toShiftTime(startTime, endTime),
  }
  await appendToKvArray('projects', [project])
  return project
}
