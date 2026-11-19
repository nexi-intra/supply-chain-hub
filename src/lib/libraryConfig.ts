// Electron enforces items/shared/requests in electron/libraryKeys.cjs; libraryConfig.test.ts keeps both in sync.
export type LibraryKind = 'guides' | 'knowledge'

export interface LibraryKeys {
  items: string
  shared: string
  requests: string
  categories: string
  reviewRequests: string
  archived: string
  versionsPrefix: string
  draftPrefix: string
}

export const LIBRARY_KEYS: Record<LibraryKind, LibraryKeys> = {
  guides: {
    items: 'guides', shared: 'shared-guides', requests: 'guide-access-requests', categories: 'categories',
    reviewRequests: 'guide-review-requests', archived: 'archived-guides', versionsPrefix: 'guide-versions-', draftPrefix: 'guide-draft-',
  },
  knowledge: {
    items: 'knowledge-articles', shared: 'shared-knowledge-articles', requests: 'knowledge-access-requests', categories: 'knowledge-categories',
    reviewRequests: 'knowledge-review-requests', archived: 'archived-knowledge-articles', versionsPrefix: 'knowledge-versions-', draftPrefix: 'knowledge-draft-',
  },
}
