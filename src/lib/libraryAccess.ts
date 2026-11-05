import { upsertInKvArray } from './kvArrays'
import { LIBRARY_KEYS, type LibraryKind } from './libraryConfig'
import type { GuideAccessRequest } from './types'

const ACCESS_DAYS = 2

export async function loadAccessRequests(kind: LibraryKind): Promise<GuideAccessRequest[]> {
  return (await window.kv.get<GuideAccessRequest[]>(LIBRARY_KEYS[kind].requests)) || []
}

/** Approval grants read access to the content for two days; the latest decision wins (see guideGrants.cjs). */
export async function reviewAccessRequest(kind: LibraryKind, request: GuideAccessRequest, status: 'approved' | 'rejected', reviewerEmail: string, now = Date.now()): Promise<void> {
  await upsertInKvArray<GuideAccessRequest>(LIBRARY_KEYS[kind].requests, [{
    ...request,
    status,
    reviewedBy: reviewerEmail,
    reviewedAt: new Date(now).toISOString(),
    ...(status === 'approved' ? { expiresAt: new Date(now + ACCESS_DAYS * 24 * 60 * 60 * 1000).toISOString() } : {}),
  }])
}
