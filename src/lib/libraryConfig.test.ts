import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { LIBRARY_KEYS } from './libraryConfig'

const electronLibraries = createRequire(import.meta.url)('../../electron/libraryKeys.cjs').LIBRARIES

describe('LIBRARY_KEYS', () => {
  it('keeps every existing guide key unchanged', () => {
    expect(LIBRARY_KEYS.guides).toEqual({
      items: 'guides', shared: 'shared-guides', requests: 'guide-access-requests', categories: 'categories',
      reviewRequests: 'guide-review-requests', archived: 'archived-guides', versionsPrefix: 'guide-versions-', draftPrefix: 'guide-draft-',
    })
  })

  it('gives the Knowledge Base keys that never overlap the guide keys', () => {
    const guideKeys = new Set(Object.values(LIBRARY_KEYS.guides))
    for (const key of Object.values(LIBRARY_KEYS.knowledge)) expect(guideKeys.has(key)).toBe(false)
    expect(LIBRARY_KEYS.knowledge.items).toBe('knowledge-articles')
  })

  it('matches the keys the Electron access policy enforces', () => {
    for (const kind of ['guides', 'knowledge'] as const) {
      const { items, shared, requests } = LIBRARY_KEYS[kind]
      expect({ items, shared, requests }).toEqual(electronLibraries[kind])
    }
  })
})
