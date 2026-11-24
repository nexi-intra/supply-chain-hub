import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPersonalTodo, personalTodosKey } from './personalTodos'

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const store = new Map<string, unknown[]>()
  const update = vi.fn(async (key: string, operation: { op: string; items?: unknown[] }) => {
    if (operation.op === 'append') store.set(key, [...(store.get(key) || []), ...(operation.items || [])])
    return store.get(key) || []
  })
  vi.stubGlobal('window', { kv: { get: vi.fn(async (key: string) => store.get(key)), update } })
  return { store }
}

describe('personalTodosKey', () => {
  it('namespaces the key per user email', () => {
    expect(personalTodosKey('a@test')).toBe('todos-personal-a@test')
  })
})

describe('createPersonalTodo', () => {
  it('rejects an empty/whitespace-only title without writing anything', async () => {
    const f = fixture()
    await expect(createPersonalTodo('a@test', '   ')).rejects.toThrow('MISSING_TITLE')
    expect(f.store.has(personalTodosKey('a@test'))).toBe(false)
  })

  it('creates an open to-do under the user’s own personal key', async () => {
    const f = fixture()
    const todo = await createPersonalTodo('a@test', 'Ring til IT', 'Om printeren')
    expect(todo.status).toBe('open')
    expect(todo.title).toBe('Ring til IT')
    expect(todo.description).toBe('Om printeren')
    const saved = f.store.get(personalTodosKey('a@test')) as Array<{ title: string }>
    expect(saved).toHaveLength(1)
    expect(saved[0].title).toBe('Ring til IT')
  })

  it('trims the title and omits an empty description', async () => {
    fixture()
    const todo = await createPersonalTodo('a@test', '  Køb kaffe  ', '  ')
    expect(todo.title).toBe('Køb kaffe')
    expect(todo.description).toBeUndefined()
  })

  it('reuses a fixed creation identity when retrying a write with an uncertain result', async () => {
    const { store } = fixture()
    const identity = { id: 'todo-retry', createdAt: '2026-09-23T12:00:00.000Z' }
    const first = await createPersonalTodo('a@test', 'Ring til IT', 'Om printeren', undefined, identity)
    const retried = await createPersonalTodo('a@test', 'Ring til IT', 'Om printeren', undefined, identity)
    expect(retried).toEqual(first)
    expect((store.get(personalTodosKey('a@test')) as typeof first[]).map(todo => todo.id)).toEqual([identity.id, identity.id])
  })

  it('stores an optional time and the appointment kind', async () => {
    fixture()
    const todo = await createPersonalTodo('a@test', 'Ring til DHL', undefined, '2026-10-15', undefined, { startTime: '10:30' })
    expect(todo).toMatchObject({ dueDate: '2026-10-15', startTime: '10:30', endTime: undefined, kind: undefined })
    const meeting = await createPersonalTodo('a@test', 'Møde med Anna', undefined, '2026-10-15', undefined, { kind: 'event', startTime: '13:00', endTime: '14:00' })
    expect(meeting).toMatchObject({ kind: 'event', startTime: '13:00', endTime: '14:00' })
  })

  it('needs a date for a time or an appointment, and a valid time range', async () => {
    const { store } = fixture()
    await expect(createPersonalTodo('a@test', 'Ring', undefined, undefined, undefined, { startTime: '10:00' })).rejects.toThrow('MISSING_DATE')
    await expect(createPersonalTodo('a@test', 'Møde', undefined, '', undefined, { kind: 'event' })).rejects.toThrow('MISSING_DATE')
    await expect(createPersonalTodo('a@test', 'Møde', undefined, '2026-10-15', undefined, { startTime: '14:00', endTime: '13:00' })).rejects.toThrow('INVALID_TIME')
    expect(store.has(personalTodosKey('a@test'))).toBe(false)
  })
})
