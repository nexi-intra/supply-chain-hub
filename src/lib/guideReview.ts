import type { ArchivedGuideEntry, Guide, GuideReviewRequest } from './guideTypes'

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

/**
 * Sandt når godkendelsens virkning allerede er slået igennem, men requesten
 * aldrig blev lukket (afbrudt fler-trins godkendelse, fx netværksfejl mod det
 * delte drev). create/update/restore: præcis dette forslag er allerede udgivet
 * (versioner bumpes ved hver gemning, så versionslighed identificerer forslaget).
 * delete: guiden er fjernet og arkiveret for netop denne request. Gør godkendelse
 * idempotent i stedet for at melde falsk versionskonflikt og fastlåse guiden.
 */
export function isGuideReviewAlreadyApplied(
  request: GuideReviewRequest,
  published: Guide | undefined,
  archived: Array<Pick<ArchivedGuideEntry, 'requestId'>>,
): boolean {
  if (request.action === 'delete') {
    return !published && archived.some((entry) => entry.requestId === request.id)
  }
  return Boolean(published && request.proposedGuide && published.version === request.proposedGuide.version)
}

export function isOpenGuideReview(request: GuideReviewRequest): boolean {
  return request.status === 'pending' || request.status === 'draft' || request.status === 'changes_requested'
}
