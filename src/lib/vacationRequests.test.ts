import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitVacationRequest } from './vacationRequests'

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
})
