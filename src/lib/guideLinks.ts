import type { Guide, GuideSection, GuideStep } from './guideTypes'
import { guidePlainText } from './guideTypes'
import { createRichContent, getStepDocument } from './guideRichText'
import type { GuideRichNode } from './guideRichText'

export interface GuideLinkEntry {
  guide: Guide
  scope: 'team' | 'shared'
  teamCode?: string
  archived?: boolean
  fileLoader?: (fileUrl: string) => Promise<Blob>
}

export type GuideLinkTarget = Record<string, string>

export type GuideLinkResolution =
  | { status: 'unavailable' | 'archived' }
  | { status: 'available'; guide: Guide; section?: GuideSection; step?: GuideStep }
  | { status: 'missing-section'; guide: Guide }
  | { status: 'missing-step'; guide: Guide; section: GuideSection }

export interface GuideLinkSummary {
  title: string
  category: string
  text: string
}

export function hasGuideLinkAccess(requests: readonly {
  guideId: string; requestingUserEmail: string; requestingTeamCode: string;
  status: string; requestedAt: string; expiresAt?: string
}[], guideId: string, userEmail: string, homeTeamCode: string, now = Date.now()): boolean {
  const request = requests.filter(row => row.guideId === guideId && row.requestingUserEmail.trim().toLowerCase() === userEmail.trim().toLowerCase()
    && row.requestingTeamCode === homeTeamCode).sort((first, second) => second.requestedAt.localeCompare(first.requestedAt))[0]
  if (!request || request.status !== 'approved') return false
  if (!request.expiresAt) return true
  const expiresAt = Date.parse(request.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt > now
}

function validatedTarget(target: GuideLinkTarget): GuideLinkTarget | null {
  try {
    const content = createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [{
      type: 'text', text: 'link', marks: [{ type: 'guideLink', attrs: target }],
    }] }] })
    return content.document.content?.[0].content?.[0].marks?.[0].attrs || null
  } catch {
    return null
  }
}

function guideIdentity(target: GuideLinkTarget): string {
  return JSON.stringify([target.guideId, target.scope, target.scope === 'team' ? target.teamCode : ''])
}

function entryMatches(entry: GuideLinkEntry, target: GuideLinkTarget): boolean {
  return entry.guide.id === target.guideId && entry.scope === target.scope
    && (entry.scope === 'shared' || entry.teamCode === target.teamCode)
}

export function collectGuideLinks(guide: Pick<Guide, 'sections'>): GuideLinkTarget[] {
  const targets: GuideLinkTarget[] = []
  const seen = new Set<string>()
  const visit = (node: GuideRichNode): void => {
    for (const mark of node.marks || []) {
      if (mark.type !== 'guideLink' || !mark.attrs) continue
      const target = mark.attrs
      const identity = JSON.stringify([guideIdentity(target), target.sectionId || '', target.stepId || ''])
      if (seen.has(identity)) continue
      seen.add(identity)
      targets.push({ ...target })
    }
    for (const child of node.content || []) visit(child)
  }
  for (const section of guide.sections || []) {
    visit(getStepDocument({ text: section.heading, richContent: section.headingRichContent }))
    for (const step of section.steps) visit(getStepDocument(step))
  }
  return targets
}

export function resolveGuideLink(target: GuideLinkTarget, entries: readonly GuideLinkEntry[]): GuideLinkResolution {
  const validated = validatedTarget(target)
  if (!validated) return { status: 'unavailable' }
  const entry = entries.find(candidate => !candidate.archived && entryMatches(candidate, validated))
  if (!entry) {
    return { status: entries.some(candidate => candidate.archived && entryMatches(candidate, validated)) ? 'archived' : 'unavailable' }
  }
  const guide = entry.guide
  if (!validated.sectionId) return { status: 'available', guide }
  const section = guide.sections?.find(candidate => candidate.id === validated.sectionId)
  if (!section) return { status: 'missing-section', guide }
  if (!validated.stepId) return { status: 'available', guide, section }
  const step = section.steps.find(candidate => candidate.id === validated.stepId)
  if (!step) return { status: 'missing-step', guide, section }
  return { status: 'available', guide, section, step }
}

export function findGuideBacklinks(target: GuideLinkTarget, entries: readonly GuideLinkEntry[]): GuideLinkEntry[] {
  const validated = validatedTarget(target)
  if (!validated) return []
  const targetIdentity = guideIdentity(validated)
  const backlinks: GuideLinkEntry[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    if (entry.archived || entryMatches(entry, validated)) continue
    const identity = JSON.stringify([entry.guide.id, entry.scope, entry.scope === 'team' ? entry.teamCode : ''])
    if (seen.has(identity) || !collectGuideLinks(entry.guide).some(link => guideIdentity(link) === targetIdentity)) continue
    seen.add(identity)
    backlinks.push(entry)
  }
  return backlinks
}

export function summariseGuideLink(guide: Guide): GuideLinkSummary {
  return { title: guide.title, category: guide.category, text: guidePlainText(guide).slice(0, 180) }
}