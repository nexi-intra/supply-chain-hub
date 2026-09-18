import { describe, expect, it } from 'vitest'
import type { Guide, GuideReviewRequest } from './guideTypes'
import { canReviewGuideRequest, hasGuideReviewConflict, isGuideReviewAlreadyApplied, isOpenGuideReview } from './guideReview'

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

  it('recognizes an interrupted approval whose effect already went through', () => {
    // create: forslaget (v1.00) er allerede udgivet, men requesten blev aldrig lukket
    expect(isGuideReviewAlreadyApplied(request({ action: 'create', baseVersion: undefined, proposedGuide: guide('1.00') }), guide('1.00'), [])).toBe(true)
    // update: præcis forslags-versionen er udgivet
    expect(isGuideReviewAlreadyApplied(request(), guide('1.01'), [])).toBe(true)
    // update: udgivet version er stadig basen — ikke anvendt endnu
    expect(isGuideReviewAlreadyApplied(request(), guide('1.00'), [])).toBe(false)
    // delete: guiden fjernet + arkivpost for denne request
    expect(isGuideReviewAlreadyApplied(request({ action: 'delete', proposedGuide: undefined }), undefined, [{ requestId: 'review-1' }])).toBe(true)
    // delete: guiden fjernet men ingen arkivpost — ukendt tilstand, ikke "anvendt"
    expect(isGuideReviewAlreadyApplied(request({ action: 'delete', proposedGuide: undefined }), undefined, [{ requestId: 'other' }])).toBe(false)
    // delete: guiden findes stadig
    expect(isGuideReviewAlreadyApplied(request({ action: 'delete', proposedGuide: undefined }), guide('1.00'), [{ requestId: 'review-1' }])).toBe(false)
    // restore: gendannelsen (bumpet version) er allerede udgivet
    expect(isGuideReviewAlreadyApplied(request({ action: 'restore', baseVersion: undefined, proposedGuide: guide('1.01') }), guide('1.01'), [])).toBe(true)
  })
})
