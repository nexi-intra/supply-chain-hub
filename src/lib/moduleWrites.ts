// Shared write paths used by both the module screens and Hubert's actions (HubAssistant.tsx),
// so a confirmed Hubert proposal writes exactly what the manual form would.
import { appendToKvArray, removeFromKvArray, upsertInKvArray } from './kvArrays'
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
  // The usual case (none or one old exception for the day) is one write: the old one is replaced in place. A write to
  // M: takes 20 s, and this was a remove and an append one after another.
  if (stale.length <= 1) {
    const entry: HomeOfficeException = { id: stale[0] || newId('homeoffice'), userEmail, date, isHomeOffice }
    await (stale.length ? upsertInKvArray('home-office-exceptions', [entry]) : appendToKvArray('home-office-exceptions', [entry]))
    return entry
  }
  // Several old exceptions for the day: the first is replaced in place and the rest removed, at the same time.
  const entry: HomeOfficeException = { id: stale[0], userEmail, date, isHomeOffice }
  await Promise.all([
    upsertInKvArray('home-office-exceptions', [entry]),
    removeFromKvArray<HomeOfficeException>('home-office-exceptions', stale.slice(1)),
  ])
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

/** The note createNote saves – also used by the screen to show it at once while it is saved. */
export function buildNote({ userEmail, userName, title, content, isPersonal, tags = [], identity }: CreateNoteParams): Note {
  if (!title.trim()) throw new Error('MISSING_TITLE')
  if (!content.trim()) throw new Error('MISSING_CONTENT')
  const creation = identity || { id: newId('note'), createdAt: new Date().toISOString() }
  return {
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
}

export async function createNote(params: CreateNoteParams): Promise<Note> {
  const note = buildNote(params)
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

/** Whether `to` is one of the team's users (the users record is keyed by e-mail). */
export function isTeamRecipient(users: Record<string, { email: string }> | null | undefined, to: string): boolean {
  return Boolean(users) && (Object.values(users!).some(user => user?.email === to) || Boolean(users![to]))
}

/** Internal mail to a colleague in the same team; throws USER_NOT_FOUND when the recipient is not in the team's users. */
export async function sendInternalMessage({ from, to, subject, message, threadId }: SendMessageParams): Promise<Email> {
  if (!to || !subject.trim() || !message.trim()) throw new Error('MISSING_FIELDS')
  const users = (await window.kv.get<Record<string, { email: string }>>('users')) || {}
  if (!isTeamRecipient(users, to)) throw new Error('USER_NOT_FOUND')
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
  const notification = {
    id: newId('notif'),
    type: 'email' as const,
    message: `Ny email fra ${from}: ${email.subject}`,
    timestamp: Date.now(),
    read: false,
    from,
    emailId: email.id,
  }
  // Two different keys: saved at the same time (each write to M: takes up to 30 s). A notice without its mail is
  // taken back again.
  const [mail, notice] = await Promise.allSettled([
    appendToKvArray('emails', [email]),
    appendToKvArray('email-notifications', [notification]),
  ])
  if (mail.status === 'rejected') {
    if (notice.status === 'fulfilled') void removeFromKvArray('email-notifications', [notification.id]).catch(error => console.error('Kunne ikke fjerne notifikationen:', error))
    throw mail.reason
  }
  if (notice.status === 'rejected') console.error('Kunne ikke gemme notifikationen:', notice.reason)
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
