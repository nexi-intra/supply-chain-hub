import { describe, expect, it } from 'vitest'
import type { Guide, GuideReviewRequest } from './guideTypes'
import { canReviewGuideRequest, hasGuideReviewConflict, isOpenGuideReview } from './guideReview'

const guide = (version = '1.00'): Guide => ({
  id: 'guide-1', title: 'Test', category: 'General', tags: [], content: '',
  sections: [], version, createdAt: 1, updatedAt: 1,
})

const request = (patch: Partial<GuideReviewRequest> = {}): GuideReviewRequest => ({
  id: 'review-1', guideId: 'guide-1', guideTitle: 'Test', action: 'update',
  status: 'pending', baseVersion: '1.00', baseGuide: guide(), proposedGuide: guide('1.01'),
  submittedBy: 'author@nexigroup.com', submittedAt: 1, updatedAt: 1, ...patch,
})

describe('guide review rules', () => {
  it('allows a manager to review their own submission', () => {
    expect(canReviewGuideRequest(request(), 'author@nexigroup.com', true)).toBe(true)
  })

  it('prevents a Guide Admin from reviewing their own submission', () => {
    expect(canReviewGuideRequest(request(), 'AUTHOR@nexigroup.com', false)).toBe(false)
    expect(canReviewGuideRequest(request(), 'other@nexigroup.com', false)).toBe(true)
  })

  it('detects stale update and deletion requests', () => {
    expect(hasGuideReviewConflict(request(), guide('1.00'))).toBe(false)
    expect(hasGuideReviewConflict(request(), guide('1.01'))).toBe(true)
    expect(hasGuideReviewConflict(request({ action: 'delete' }), undefined)).toBe(true)
  })

  it('will not create or restore over an existing published guide', () => {
    expect(hasGuideReviewConflict(request({ action: 'create', baseVersion: undefined }), undefined)).toBe(false)
    expect(hasGuideReviewConflict(request({ action: 'create', baseVersion: undefined }), guide())).toBe(true)
    expect(hasGuideReviewConflict(request({ action: 'restore', baseVersion: undefined }), undefined)).toBe(false)
    expect(hasGuideReviewConflict(request({ action: 'restore', baseVersion: undefined }), guide())).toBe(true)
  })

  it('distinguishes active workflow entries from completed ones', () => {
    expect(isOpenGuideReview(request({ status: 'draft' }))).toBe(true)
    expect(isOpenGuideReview(request({ status: 'changes_requested' }))).toBe(true)
    expect(isOpenGuideReview(request({ status: 'approved' }))).toBe(false)
  })
})
