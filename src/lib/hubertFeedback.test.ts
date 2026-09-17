import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitHubertFeedback } from './hubertFeedback'

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

describe('submitHubertFeedback', () => {
  it('rejects an empty/whitespace-only question without writing anything', async () => {
    const f = fixture()
    await expect(submitHubertFeedback({ userEmail: 'a@test', question: '   ', mode: 'data', helpful: true })).rejects.toThrow('MISSING_QUESTION')
    expect(f.store.has('hubert-feedback')).toBe(false)
  })

  it('records positive feedback for a given question and answer mode', async () => {
    const f = fixture()
    const feedback = await submitHubertFeedback({ userEmail: 'a@test', question: 'hvor er Anne i dag?', mode: 'data', helpful: true })
    expect(feedback.helpful).toBe(true)
    expect(feedback.mode).toBe('data')
    const saved = f.store.get('hubert-feedback') as Array<{ userEmail: string; helpful: boolean }>
    expect(saved).toHaveLength(1)
    expect(saved[0].userEmail).toBe('a@test')
    expect(saved[0].helpful).toBe(true)
  })

  it('records negative feedback', async () => {
    const f = fixture()
    const feedback = await submitHubertFeedback({ userEmail: 'a@test', question: 'hvem har flest opgaver?', mode: 'ai', helpful: false })
    expect(feedback.helpful).toBe(false)
    const saved = f.store.get('hubert-feedback') as Array<{ helpful: boolean }>
    expect(saved[0].helpful).toBe(false)
  })

  it('truncates an overly long question to 1000 characters', async () => {
    fixture()
    const feedback = await submitHubertFeedback({ userEmail: 'a@test', question: 'a'.repeat(2000), mode: 'data', helpful: true })
    expect(feedback.question).toHaveLength(1000)
  })
})
