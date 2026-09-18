import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveDraft, getDraft, deleteDraft, draftKey } from './guideStore'
import type { GuideDraft } from './guideTypes'

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const store = new Map<string, unknown>()
  vi.stubGlobal('window', {
    kv: {
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, value: unknown) => { store.set(key, value) }),
      delete: vi.fn(async (key: string) => { store.delete(key) }),
    },
  })
  return { store }
}

const draft: GuideDraft = {
  guideId: 'g1',
  title: 'Kladde-titel',
  category: 'General',
  tags: 'a, b',
  language: 'da',
  sections: [{ id: 's1', heading: 'H', steps: [{ id: 'st1', text: 'T', imageIds: [] }] }],
  coverImageId: undefined,
  reviewInterval: null,
  otherTeamCodes: [],
  savedBy: 'user@example.test',
  lastAutoSavedAt: 1000,
}

describe('guide draft autosave storage', () => {
  it('draftKey namespaces by guide id, separate from published guides/versions', () => {
    expect(draftKey('g1')).toBe('guide-draft-g1')
  })
  it('saveDraft then getDraft round-trips the exact draft', async () => {
    fixture()
    await saveDraft(draft)
    expect(await getDraft('g1')).toEqual(draft)
  })
  it('getDraft returns undefined when no draft was ever saved', async () => {
    fixture()
    expect(await getDraft('missing')).toBeUndefined()
  })
  it('deleteDraft removes a previously saved draft', async () => {
    const f = fixture()
    await saveDraft(draft)
    await deleteDraft('g1')
    expect(await getDraft('g1')).toBeUndefined()
    expect(f.store.has(draftKey('g1'))).toBe(false)
  })
  it('drafts for different guide ids do not collide', async () => {
    fixture()
    await saveDraft(draft)
    await saveDraft({ ...draft, guideId: 'g2', title: 'Anden kladde' })
    expect((await getDraft('g1'))?.title).toBe('Kladde-titel')
    expect((await getDraft('g2'))?.title).toBe('Anden kladde')
  })
})
