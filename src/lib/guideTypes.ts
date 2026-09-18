// Guide Bibliotek 2.0 — domænetyper og hjælpere (se plans/guide-library-2.0.md).
// Guide-typen dækker både v1 (flad content) og v2 (sektioner/trin); migrateGuide
// opgraderer lazy ved load og er idempotent.

import { newId } from './utils'

export { newId }

export interface GuideStep {
  id: string
  text: string
  /** fileStorage-id'er (uden kv://-præfiks) */
  imageIds: string[]
}

export interface GuideSection {
  id: string
  heading: string
  steps: GuideStep[]
}

export interface Guide {
  id: string
  /** undefined = v1 (kun content), 2 = sektioner/trin */
  schemaVersion?: 2
  title: string
  category: string
  tags: string[]
  /** Guidens primære sprog — bruges af oversættelse og chatbot. */
  language?: 'da' | 'en' | 'fi'
  /** v1-brødtekst; bevares efter migrering som reserve/ekstra noter */
  content: string
  sections?: GuideSection[]
  coverImageId?: string
  /** Dokumentversion, fx "1.00" — bumpes ved hver gemning */
  version?: string
  author?: string
  createdBy?: string
  updatedBy?: string
  /** Personen der skal holde guiden opdateret - IKKE noedvendigvis forfatteren
   *  (fx en fagperson paa et omraade forfatteren ikke selv har ekspertise i).
   *  Bruges til at maalrette gennemgangs-paamindelser. */
  responsibleEmail?: string
  createdAt: number
  updatedAt: number
  /** null/undefined = intet opdaterings-interval */
  reviewIntervalMonths?: number | null
  /** updatedAt/lastReviewedAt + interval; null når intet interval */
  nextReviewAt?: number | null
  lastReviewedAt?: number
  // v1 Word-vedhæftning (bevares uændret)
  wordFileData?: string
  wordFileName?: string
  fileUrl?: string
  fileSize?: number
  /**
   * Tværgående deling (Fase 3, plans/guide-library-cross-team-links-format.md): ALLE deltagende
   * teams' koder (folderName), INKL. det oprettende team — undefined/tomt = normal lokal guide
   * (baglæns-kompatibelt). Når udfyldt (længde > 1) gemmes guiden i den platform-delte
   * 'shared-guides'-KV i stedet for teamets egen 'guides', så alle deltagende teams reelt deler
   * ÉN fil — en redigering fra ethvert team slår automatisk igennem for alle andre.
   */
  sharedWithTeamCodes?: string[]
}

export interface GuideVersionSnapshot {
  schemaVersion?: 2
  title: string
  category: string
  tags: string[]
  sections: GuideSection[]
  coverImageId?: string
  language?: 'da' | 'en' | 'fi'
  content?: string
  reviewIntervalMonths?: number | null
  responsibleEmail?: string
  fileUrl?: string
  wordFileName?: string
  fileSize?: number
  sharedWithTeamCodes?: string[]
}

/** KV: 'guide-versions-{guideId}' — nyeste først. */
export interface GuideVersionEntry {
  version: string
  savedAt: number
  savedBy: string
  changeNote?: string
  snapshot: GuideVersionSnapshot
}

/**
 * KV: 'guide-drafts-{guideId-eller-ny-id}' — privat, lokal arbejdskopi der
 * autogemmes mens en guide redigeres, så et crash/lukket vindue ikke koster
 * alt arbejde. Helt adskilt fra GuideReviewRequest (som er et REELT forslag
 * til godkendelse) — en kladde er kun brugerens egen ugemte tekst.
 */
export interface GuideDraft {
  guideId: string
  title: string
  category: string
  tags: string
  language: 'da' | 'en' | 'fi' | 'auto'
  sections: GuideSection[]
  coverImageId?: string
  reviewInterval: number | null
  /** yyyy-MM-dd, eller undefined = brug det automatisk foreslaaede naeste-tjek. */
  nextReviewDate?: string
  responsibleEmail?: string
  otherTeamCodes: string[]
  savedBy: string
  lastAutoSavedAt: number
}

export type GuideReviewAction = 'create' | 'update' | 'delete' | 'restore'
export type GuideReviewWorkflowStatus = 'draft' | 'pending' | 'changes_requested' | 'approved' | 'withdrawn'

/**
 * KV: `guide-review-requests`. Den udgivne guide ændres aldrig, mens denne
 * revision afventer. `baseGuide` er det låste sammenligningsgrundlag, mens
 * `proposedGuide` er den kopi, som forfatter og reviewer må redigere.
 */
export interface GuideReviewRequest {
  id: string
  guideId: string
  guideTitle: string
  action: GuideReviewAction
  status: GuideReviewWorkflowStatus
  baseVersion?: string
  baseGuide?: Guide
  proposedGuide?: Guide
  submittedBy: string
  submittedByName?: string
  submittedAt: number
  updatedAt: number
  changeNote?: string
  reviewerComment?: string
  claimedBy?: string
  claimedAt?: number
  reviewerEditedBy?: string
  reviewerEditedAt?: number
  reviewedBy?: string
  reviewedAt?: number
}

/** KV: `archived-guides`. Sletning er reversibel og beholder versionshistorikken. */
export interface ArchivedGuideEntry {
  id: string
  guide: Guide
  archivedAt: number
  archivedBy: string
  requestId: string
  restoredAt?: number
  restoredBy?: string
}

export const REVIEW_INTERVAL_CHOICES: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Intet interval' },
  { value: 1, label: '1 måned' },
  { value: 2, label: '2 måneder' },
  { value: 3, label: '3 måneder' },
  { value: 6, label: '6 måneder' },
  { value: 12, label: '1 år' },
]

export function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp)
  date.setMonth(date.getMonth() + months)
  return date.getTime()
}

export function computeNextReviewAt(fromTimestamp: number, intervalMonths: number | null | undefined): number | null {
  if (!intervalMonths) return null
  return addMonths(fromTimestamp, intervalMonths)
}

/** yyyy-MM-dd (lokal dato) -> tidsstempel ved middag, for at undgaa tidszone-off-by-one. */
export function dateStringToTimestamp(value: string): number {
  return new Date(`${value}T12:00:00`).getTime()
}

/** Tidsstempel -> yyyy-MM-dd (lokal dato), til brug i et <DatePickerField>. */
export function timestampToDateString(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function todayDateString(now: number = Date.now()): string {
  return timestampToDateString(now)
}

export type ReviewStatus = 'overdue' | 'due-soon' | 'ok' | 'none'

const DUE_SOON_MS = 14 * 24 * 60 * 60 * 1000

export function getReviewStatus(guide: Guide, now: number = Date.now()): ReviewStatus {
  if (!guide.reviewIntervalMonths || !guide.nextReviewAt) return 'none'
  if (now >= guide.nextReviewAt) return 'overdue'
  if (now >= guide.nextReviewAt - DUE_SOON_MS) return 'due-soon'
  return 'ok'
}

// Hvor mange dage før fristen forfatteren SELV skal begynde at få en pop-up-påmindelse
// (separat fra kortets 14-dages "due-soon"-badge ovenfor).
export const REVIEW_NOTICE_WINDOW_MS = 10 * 24 * 60 * 60 * 1000

/** KV-nøgle 'guide-review-notice-log': hvornår en bruger sidst har set en gennemgangs-pop-up pr. guide. */
export type GuideReviewNoticeLog = Record<string, Record<string, string>>

const todayStr = (now: number = Date.now()) => new Date(now).toISOString().slice(0, 10)

export function wasNotifiedToday(log: GuideReviewNoticeLog | undefined, userEmail: string, guideId: string, now: number = Date.now()): boolean {
  return log?.[userEmail]?.[guideId] === todayStr(now)
}

export function markNotifiedToday(log: GuideReviewNoticeLog | undefined, userEmail: string, guideIds: string[], now: number = Date.now()): GuideReviewNoticeLog {
  const next: GuideReviewNoticeLog = { ...(log || {}) }
  const userLog = { ...(next[userEmail] || {}) }
  for (const guideId of guideIds) userLog[guideId] = todayStr(now)
  next[userEmail] = userLog
  return next
}

/** Opgraderer en v1-guide til v2 (sektioner/trin). Idempotent. */
export function migrateGuide(guide: Guide): Guide {
  if (guide.schemaVersion === 2) return guide
  const sections: GuideSection[] =
    guide.content && guide.content.trim() && guide.content !== 'Se vedhæftet Word-dokument'
      ? [{
          id: newId('sec'),
          heading: 'Indhold',
          steps: [{ id: newId('step'), text: guide.content.trim(), imageIds: [] }],
        }]
      : []
  return {
    ...guide,
    schemaVersion: 2,
    sections,
    version: guide.version || '1.00',
    reviewIntervalMonths: guide.reviewIntervalMonths ?? null,
    nextReviewAt: guide.nextReviewAt ?? null,
  }
}

/** Al søgbar tekst i en guide (titel, kategori, tags, sektioner, trin, legacy-indhold). */
export function guidePlainText(guide: Guide): string {
  const parts: string[] = [guide.title, guide.category, guide.tags.join(' ')]
  if (guide.sections) {
    for (const section of guide.sections) {
      parts.push(section.heading)
      for (const step of section.steps) parts.push(step.text)
    }
  }
  if (guide.content) parts.push(guide.content)
  return parts.filter(Boolean).join(' ')
}

/** Kort uddrag af guidens indhold til kort/chat-visning. */
export function guideExcerpt(guide: Guide, maxLength = 150): string {
  let text = ''
  if (guide.sections && guide.sections.length > 0) {
    const firstStep = guide.sections[0].steps.find((s) => s.text.trim())
    text = firstStep?.text || guide.sections[0].heading
  }
  if (!text) text = guide.content || ''
  text = text.trim()
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text
}

/** Alle fileStorage-billede-id'er brugt af guiden (forside + trin). */
export function collectImageIds(guide: Guide): string[] {
  const ids: string[] = []
  if (guide.coverImageId) ids.push(guide.coverImageId)
  for (const section of guide.sections || []) {
    for (const step of section.steps) ids.push(...step.imageIds)
  }
  return ids
}
