import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveDraft, getDraft, deleteDraft, draftKey, listDrafts, draftLabel } from './guideStore'
import type { GuideDraft } from './guideTypes'

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const store = new Map<string, unknown>()
  vi.stubGlobal('window', {
    kv: {
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, value: unknown) => { store.set(key, value) }),
      delete: vi.fn(async (key: string) => { store.delete(key) }),
      keys: vi.fn(async () => [...store.keys()]),
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

describe('listDrafts', () => {
  it('returns only the signed-in users own drafts, newest first', async () => {
    fixture()
    await saveDraft({ ...draft, guideId: 'mine-old', lastAutoSavedAt: 1000 })
    await saveDraft({ ...draft, guideId: 'mine-new', lastAutoSavedAt: 5000 })
    await saveDraft({ ...draft, guideId: 'theirs', savedBy: 'someone.else@example.test', lastAutoSavedAt: 9000 })
    expect((await listDrafts('user@example.test')).map((entry) => entry.guideId)).toEqual(['mine-new', 'mine-old'])
  })
  it('ignores unrelated keys so guides and versions are never listed as drafts', async () => {
    const f = fixture()
    f.store.set('guides', [{ id: 'g1' }])
    f.store.set('guide-versions-g1', [{ version: '1.00' }])
    await saveDraft(draft)
    expect((await listDrafts('user@example.test')).map((entry) => entry.guideId)).toEqual(['g1'])
  })
})

describe('draftLabel', () => {
  it('uses the title when there is one', () => {
    expect(draftLabel(draft)).toBe('Kladde-titel')
  })
  it('falls back to the first written text so an untitled draft is still recognisable', () => {
    expect(draftLabel({ ...draft, title: '   ' })).toBe('H')
    expect(draftLabel({ ...draft, title: '', sections: [{ id: 's1', heading: '', steps: [{ id: 'st1', text: 'Første trin', imageIds: [] }] }] })).toBe('Første trin')
  })
  it('returns an empty string when the draft is completely empty', () => {
    expect(draftLabel({ ...draft, title: '', sections: [] })).toBe('')
  })
})
