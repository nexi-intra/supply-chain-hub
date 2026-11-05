import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNote, createTeamTodo, sendInternalMessage, setHomeOfficeDay } from './moduleWrites'
import { registerSickLeave } from './sickLeave'

afterEach(() => vi.unstubAllGlobals())

function fixture(initial: Record<string, unknown> = {}, failKey?: string) {
  const store = new Map<string, unknown>(Object.entries(initial))
  const update = vi.fn(async (key: string, operation: { op: string; items?: Array<{ id: string }>; ids?: string[] }) => {
    if (key === failKey) throw new Error('disk full')
    const list = (store.get(key) as Array<{ id: string }> | undefined) || []
    if (operation.op === 'append') store.set(key, [...list, ...(operation.items || [])])
    if (operation.op === 'remove') store.set(key, list.filter(item => !(operation.ids || []).includes(item.id)))
    return store.get(key) || []
  })
  vi.stubGlobal('window', { kv: { get: vi.fn(async (key: string) => store.get(key)), update } })
  return { store, update }
}

describe('setHomeOfficeDay', () => {
  it('replaces only the user’s own exception for that date', async () => {
    const { store } = fixture({ 'home-office-exceptions': [
      { id: 'a', userEmail: 'me@test', date: '2026-10-07', isHomeOffice: false },
      { id: 'b', userEmail: 'bo@test', date: '2026-10-07', isHomeOffice: true },
      { id: 'c', userEmail: 'me@test', date: '2026-10-08', isHomeOffice: true },
    ] })
    const entry = await setHomeOfficeDay('me@test', '2026-10-07')
    const saved = store.get('home-office-exceptions') as Array<{ id: string; userEmail: string; date: string; isHomeOffice: boolean }>
    expect(saved.map(item => item.id)).toEqual(['b', 'c', entry.id])
    expect(entry).toMatchObject({ userEmail: 'me@test', date: '2026-10-07', isHomeOffice: true })
  })

  it('rejects anything but an ISO day', async () => {
    const { update } = fixture()
    await expect(setHomeOfficeDay('me@test', 'i morgen')).rejects.toThrow('INVALID_DATE')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('createNote', () => {
  it('stores the note with the creator and the chosen visibility', async () => {
    const { store } = fixture()
    const note = await createNote({ userEmail: 'me@test', userName: 'Me', title: ' Labels ', content: ' Bestil nye labels ', isPersonal: false })
    expect(note).toMatchObject({ title: 'Labels', content: 'Bestil nye labels', creatorEmail: 'me@test', creatorName: 'Me', isPersonal: false })
    expect(note.tags).toBeUndefined()
    expect(store.get('notebook-notes')).toEqual([note])
  })

  it('refuses an empty title or content', async () => {
    fixture()
    await expect(createNote({ userEmail: 'me@test', userName: 'Me', title: ' ', content: 'x', isPersonal: true })).rejects.toThrow('MISSING_TITLE')
    await expect(createNote({ userEmail: 'me@test', userName: 'Me', title: 'x', content: ' ', isPersonal: true })).rejects.toThrow('MISSING_CONTENT')
  })
})

describe('sendInternalMessage', () => {
  it('writes the mail and the recipient’s notification', async () => {
    const { store } = fixture({ users: { 'bo@test': { email: 'bo@test', fullName: 'Bo' } } })
    const email = await sendInternalMessage({ from: 'me@test', to: 'bo@test', subject: 'Møde', message: 'Flyttet til kl. 10' })
    expect(store.get('emails')).toEqual([email])
    expect(store.get('email-notifications')).toEqual([expect.objectContaining({ type: 'email', from: 'me@test', emailId: email.id, read: false })])
  })

  it('refuses a recipient outside the team without writing', async () => {
    const { update } = fixture({ users: { 'bo@test': { email: 'bo@test' } } })
    await expect(sendInternalMessage({ from: 'me@test', to: 'zoe@other', subject: 'Hej', message: 'Hej' })).rejects.toThrow('USER_NOT_FOUND')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('createTeamTodo', () => {
  it('creates an open shared to-do with no members yet', async () => {
    const { store } = fixture()
    const todo = await createTeamTodo({ userEmail: 'me@test', userName: 'Me', title: ' Ryd op ', dueDate: '2026-10-09' })
    expect(todo).toMatchObject({ title: 'Ryd op', description: '', createdBy: 'me@test', createdByName: 'Me', status: 'open', teamMembers: [], dueDate: '2026-10-09' })
    expect(store.get('projects')).toEqual([todo])
  })
})

describe('registerSickLeave', () => {
  it('writes an approved entry and the manager notice', async () => {
    const { store } = fixture()
    const { entry, notified } = await registerSickLeave({ reporterEmail: 'me@test', reporterName: 'Me', userEmail: 'me@test', userName: 'Me', date: new Date('2026-10-07T12:00:00'), type: 'child' })
    expect(notified).toBe(true)
    expect(entry).toMatchObject({ userEmail: 'me@test', status: 'approved', type: 'child', reportedBy: undefined })
    expect(store.get('sick-leave-entries')).toEqual([entry])
    const [notice] = store.get('email-notifications') as Array<{ subject: string; body: string; type: string }>
    expect(notice).toMatchObject({ subject: 'Barn syg - Me', type: 'sick-leave' })
    expect(notice.body).toContain('Me (me@test) har meldt barn syg.')
  })

  it('keeps the note on the entry but never copies it into the notice', async () => {
    const { store } = fixture()
    const { entry } = await registerSickLeave({ reporterEmail: 'me@test', reporterName: 'Me', userEmail: 'me@test', userName: 'Me', date: new Date('2026-10-07T12:00:00'), type: 'self', reason: 'går hjem kl. 12' })
    expect(entry.reason).toBe('går hjem kl. 12')
    const [notice] = store.get('email-notifications') as Array<{ body: string }>
    expect(notice.body).not.toContain('går hjem')
  })

  it('keeps the registration when only the notice fails', async () => {
    const { store } = fixture({}, 'email-notifications')
    const { notified } = await registerSickLeave({ reporterEmail: 'boss@test', reporterName: 'Boss', userEmail: 'me@test', userName: 'Me', date: new Date('2026-10-07T12:00:00'), type: 'self' })
    expect(notified).toBe(false)
    expect(store.get('sick-leave-entries')).toEqual([expect.objectContaining({ reportedBy: 'boss@test', type: 'self' })])
  })
})
