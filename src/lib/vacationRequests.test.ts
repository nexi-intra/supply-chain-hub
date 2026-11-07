import { afterEach, describe, expect, it, vi } from 'vitest'
import { decideVacationRequests, submitVacationRequest } from './vacationRequests'

afterEach(() => vi.unstubAllGlobals())

function fixture(users: Record<string, { email: string; password: string; fullName: string; isManager: boolean }> = {}) {
  const store = new Map<string, unknown[]>()
  const update = vi.fn(async (key: string, operation: { op: string; items?: unknown[] }) => {
    if (operation.op === 'append') store.set(key, [...(store.get(key) || []), ...(operation.items || [])])
    return store.get(key) || []
  })
  vi.stubGlobal('window', { kv: { get: vi.fn(async (key: string) => (key === 'users' ? users : store.get(key))), update } })
  return { store }
}

describe('submitVacationRequest', () => {
  it('rejects a request missing a start or end date without writing anything', async () => {
    const f = fixture()
    await expect(submitVacationRequest({ userEmail: 'a@test', startDate: '', endDate: '2026-10-10' })).rejects.toThrow('MISSING_DATES')
    expect(f.store.has('vacation-entries')).toBe(false)
  })

  it('rejects an end date before the start date without writing anything', async () => {
    const f = fixture()
    await expect(submitVacationRequest({ userEmail: 'a@test', startDate: '2026-10-10', endDate: '2026-10-01' })).rejects.toThrow('END_BEFORE_START')
    expect(f.store.has('vacation-entries')).toBe(false)
  })

  it('creates a pending vacation entry for the requesting user', async () => {
    const f = fixture()
    const entry = await submitVacationRequest({ userEmail: 'a@test', startDate: '2026-10-05', endDate: '2026-10-10', notes: 'Family trip' })
    expect(entry.status).toBe('pending')
    expect(entry.userEmail).toBe('a@test')
    const saved = f.store.get('vacation-entries') as Array<{ userEmail: string; status: string }>
    expect(saved).toHaveLength(1)
    expect(saved[0].userEmail).toBe('a@test')
  })

  it('notifies every manager and sends the requester a confirmation', async () => {
    const f = fixture({
      manager1: { email: 'manager1@test', password: '', fullName: 'Manager One', isManager: true },
      staff: { email: 'a@test', password: '', fullName: 'Staff', isManager: false },
    })
    await submitVacationRequest({ userEmail: 'a@test', startDate: '2026-10-05', endDate: '2026-10-10' })
    const emails = f.store.get('emails') as Array<{ to: string; type: string }>
    expect(emails.some(email => email.to === 'manager1@test' && email.type === 'vacation-request')).toBe(true)
    expect(emails.some(email => email.to === 'a@test' && email.type === 'vacation-confirmation')).toBe(true)
  })

  it('tells the caller once the request is saved, then sends all mails in one write and all notifications in one (a write to M: takes 20 s)', async () => {
    const f = fixture({
      manager1: { email: 'manager1@test', password: '', fullName: 'Manager One', isManager: true },
      manager2: { email: 'manager2@test', password: '', fullName: 'Manager Two', isManager: true },
      staff: { email: 'a@test', password: '', fullName: 'Staff', isManager: false },
    })
    const order: string[] = []
    const update = (window as unknown as { kv: { update: ReturnType<typeof vi.fn> } }).kv.update
    const original = update.getMockImplementation() as (key: string, operation: { op: string; items?: unknown[] }) => Promise<unknown>
    update.mockImplementation(async (key: string, operation: { op: string; items?: unknown[] }) => { order.push(key); return original(key, operation) })
    await submitVacationRequest({ userEmail: 'a@test', startDate: '2026-10-05', endDate: '2026-10-10', onSaved: () => order.push('saved') })
    expect(order).toEqual(['vacation-entries', 'saved', 'emails', 'email-notifications'])
    expect(f.store.get('emails')).toHaveLength(3)
    expect(f.store.get('email-notifications')).toHaveLength(3)
  })
})

describe('decideVacationRequests', () => {
  function decisionFixture(entries: unknown[]) {
    let stored = structuredClone(entries)
    const compareAndSet = vi.fn(async (_key: string, expected: unknown, next: unknown) => {
      if (JSON.stringify(expected) !== JSON.stringify(stored)) throw new Error('KV_CONFLICT')
      stored = structuredClone(next) as unknown[]
      return next
    })
    vi.stubGlobal('window', { kv: { get: vi.fn(async () => structuredClone(stored)), compareAndSet } })
    return { compareAndSet, read: () => stored as Array<{ id: string; status: string; reviewedBy?: string }>, write: (next: unknown[]) => { stored = structuredClone(next) } }
  }

  it('decides every selected request in one write and leaves the others alone', async () => {
    const f = decisionFixture([{ id: 'v1', status: 'pending' }, { id: 'v2', status: 'pending' }, { id: 'v3', status: 'pending' }])
    const decided = await decideVacationRequests(['v1', 'v3'], 'approved', 'boss@test', new Date('2026-11-07T10:00:00Z'))
    expect(f.compareAndSet).toHaveBeenCalledTimes(1)
    expect(decided.map(entry => entry.id)).toEqual(['v1', 'v3'])
    expect(f.read().map(entry => entry.status)).toEqual(['approved', 'pending', 'approved'])
    expect(f.read()[0].reviewedBy).toBe('boss@test')
  })

  it('tries again on the fresh list when another client changed it meanwhile, keeping their change', async () => {
    const f = decisionFixture([{ id: 'v1', status: 'pending' }])
    f.compareAndSet.mockImplementationOnce(async () => {
      f.write([{ id: 'v1', status: 'pending' }, { id: 'other', status: 'pending' }])
      throw new Error('KV_CONFLICT')
    })
    await decideVacationRequests(['v1'], 'rejected', 'boss@test')
    expect(f.compareAndSet).toHaveBeenCalledTimes(2)
    expect(f.read().map(entry => [entry.id, entry.status])).toEqual([['v1', 'rejected'], ['other', 'pending']])
  })

  it('writes nothing when none of the requests are there any more', async () => {
    const f = decisionFixture([{ id: 'v1', status: 'pending' }])
    expect(await decideVacationRequests(['gone'], 'approved', 'boss@test')).toEqual([])
    expect(f.compareAndSet).not.toHaveBeenCalled()
  })
})
