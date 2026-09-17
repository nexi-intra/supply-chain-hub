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
})
