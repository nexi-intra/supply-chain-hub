import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAccessRequests, reviewAccessRequest } from './libraryAccess'
import type { GuideAccessRequest } from './types'

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const store = new Map<string, GuideAccessRequest[]>()
  const update = vi.fn(async (key: string, operation: { op: string; items: GuideAccessRequest[] }) => {
    const rows = store.get(key) || []
    const next = [...rows.filter((row) => !operation.items.some((item) => item.id === row.id)), ...operation.items]
    store.set(key, next)
    return next
  })
  vi.stubGlobal('window', { kv: { get: vi.fn(async (key: string) => store.get(key)), update } })
  return { store, update }
}

const request: GuideAccessRequest = {
  id: 'r1', guideId: 'k1', guideTitle: 'LocalMode result codes', requestingTeamCode: 'B', requestingUserEmail: 'user@example.test',
  requestingUserName: 'Synthetic User', status: 'pending', requestedAt: '2026-10-06T08:00:00.000Z',
}

describe('library access requests', () => {
  it('loads guide and knowledge requests from their own keys', async () => {
    const { store } = fixture()
    store.set('guide-access-requests', [{ ...request, id: 'g' }])
    store.set('knowledge-access-requests', [request])
    expect((await loadAccessRequests('guides')).map((row) => row.id)).toEqual(['g'])
    expect((await loadAccessRequests('knowledge')).map((row) => row.id)).toEqual(['r1'])
  })

  it('approves a knowledge request for two days in the knowledge key only', async () => {
    const { store, update } = fixture()
    store.set('knowledge-access-requests', [request])
    const now = Date.parse('2026-10-06T10:00:00.000Z')
    await reviewAccessRequest('knowledge', request, 'approved', 'manager@example.test', now)
    expect(update).toHaveBeenCalledWith('knowledge-access-requests', expect.objectContaining({ op: 'upsert' }))
    expect(store.get('knowledge-access-requests')?.[0]).toMatchObject({ status: 'approved', reviewedBy: 'manager@example.test', expiresAt: '2026-10-08T10:00:00.000Z' })
    expect(store.has('guide-access-requests')).toBe(false)
  })

  it('rejects a guide request without an expiry, exactly as before', async () => {
    const { store } = fixture()
    await reviewAccessRequest('guides', request, 'rejected', 'manager@example.test', Date.parse('2026-10-06T10:00:00.000Z'))
    const [row] = store.get('guide-access-requests') || []
    expect(row).toMatchObject({ status: 'rejected', reviewedBy: 'manager@example.test', reviewedAt: '2026-10-06T10:00:00.000Z' })
    expect(row.expiresAt).toBeUndefined()
  })
})
