import type { Guide, GuideReviewRequest } from './guideTypes'

const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Manager må godkende egen indsendelse; Guide Admin må ikke. */
export function canReviewGuideRequest(request: GuideReviewRequest, reviewerEmail: string, isManager: boolean): boolean {
  return isManager || normalizeEmail(request.submittedBy) !== normalizeEmail(reviewerEmail)
}

/** Beskytter mod at en gammel revision overskriver en nyere udgivelse. */
export function hasGuideReviewConflict(request: GuideReviewRequest, published?: Guide): boolean {
  if (request.action === 'create' || request.action === 'restore') return Boolean(published)
  return !published || published.version !== request.baseVersion
}

export function isOpenGuideReview(request: GuideReviewRequest): boolean {
  return request.status === 'pending' || request.status === 'draft' || request.status === 'changes_requested'
}
