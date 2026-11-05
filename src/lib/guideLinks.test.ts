import { describe, expect, it } from 'vitest'
import { collectGuideLinks, findGuideBacklinks, hasGuideLinkAccess, resolveGuideLink, summariseGuideLink } from './guideLinks'
import type { GuideLinkEntry, GuideLinkTarget } from './guideLinks'
import { createRichContent } from './guideRichText'
import type { Guide, GuideStep } from './guideTypes'
import { guidePlainText } from './guideTypes'

function guide(id: string, changes: Partial<Guide> = {}): Guide {
  return {
    id, schemaVersion: 2, title: 'Receiving', category: 'Operations', tags: ['delivery'],
    content: '', createdAt: 1, updatedAt: 1,
    sections: [{ id: 'receiving-section', heading: 'Check delivery', steps: [{ id: 'check-step', text: 'Check the delivery', imageIds: [] }] }],
    ...changes,
  }
}

function linkedStep(id: string, targets: GuideLinkTarget[]): GuideStep {
  const richContent = createRichContent({
    type: 'doc',
    content: [{ type: 'note', attrs: { kind: 'important' }, content: [{
      type: 'paragraph',
      content: targets.map(attrs => ({ type: 'text', text: 'Read guide', marks: [{ type: 'guideLink', attrs }] })),
    }] }],
  })
  return { id, text: richContent.text, richContent, imageIds: [] }
}

function source(id: string, targets: GuideLinkTarget[]): Guide {
  return guide(id, { sections: [{ id: 'source-section', heading: 'References', steps: [linkedStep('source-step', targets)] }] })
}

const sharedTarget: GuideLinkTarget = { guideId: 'receiving-guide', scope: 'shared' }
const stepTarget: GuideLinkTarget = { ...sharedTarget, sectionId: 'receiving-section', stepId: 'check-step' }
const teamTarget: GuideLinkTarget = { guideId: 'receiving-guide', scope: 'team', teamCode: 'TCD' }

describe('section heading links', () => {
  it('includes heading links in link warnings and backlinks', () => {
    const headingRichContent = createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Related procedure', marks: [{ type: 'guideLink', attrs: sharedTarget }] }] }] })
    const input = guide('heading-source', { sections: [{ id: 'heading-section', heading: headingRichContent.text, headingRichContent, steps: [] }] })
    expect(collectGuideLinks(input)).toEqual([sharedTarget])
    expect(findGuideBacklinks(sharedTarget, [{ guide: input, scope: 'shared' }])).toHaveLength(1)
    input.sections![0].heading = 'Updated by an older client'
    expect(collectGuideLinks(input)).toEqual([])
  })
})

describe('guide-link grants', () => {
  const grant = { guideId: 'receiving-guide', requestingUserEmail: 'user@example.test', requestingTeamCode: 'TCD', status: 'approved', requestedAt: '2026-09-01T00:00:00Z' }
  const now = Date.parse('2026-10-01T00:00:00Z')

  it('accepts only the current account and home team', () => {
    expect(hasGuideLinkAccess([grant], grant.guideId, 'USER@example.test', 'TCD', now)).toBe(true)
    expect(hasGuideLinkAccess([grant], grant.guideId, 'other@example.test', 'TCD', now)).toBe(false)
    expect(hasGuideLinkAccess([grant], grant.guideId, grant.requestingUserEmail, 'TRR', now)).toBe(false)
  })

  it('rejects expired and invalid expiry values', () => {
    expect(hasGuideLinkAccess([{ ...grant, expiresAt: '2026-09-30T00:00:00Z' }], grant.guideId, grant.requestingUserEmail, 'TCD', now)).toBe(false)
    expect(hasGuideLinkAccess([{ ...grant, expiresAt: 'not-a-date' }], grant.guideId, grant.requestingUserEmail, 'TCD', now)).toBe(false)
  })

  it('does not revive an earlier approval after a later rejection', () => {
    expect(hasGuideLinkAccess([grant, { ...grant, status: 'rejected', requestedAt: '2026-09-20T00:00:00Z' }], grant.guideId, grant.requestingUserEmail, 'TCD', now)).toBe(false)
  })
})

describe('collectGuideLinks', () => {
  it('walks effective nested documents and deduplicates by scoped guide and stable anchor', () => {
    const sectionTarget = { ...sharedTarget, sectionId: 'receiving-section' }
    const otherTeam = { ...teamTarget, teamCode: 'TRR' }
    const otherGuide = { ...sharedTarget, guideId: 'another-guide' }
    const input = source('source-guide', [stepTarget, sharedTarget, sectionTarget, teamTarget, otherTeam, otherGuide, stepTarget])
    input.sections!.push({ id: 'other-section', heading: 'More', steps: [linkedStep('other-step', [sharedTarget, stepTarget])] })
    expect(collectGuideLinks(input)).toEqual([stepTarget, sharedTarget, sectionTarget, teamTarget, otherTeam, otherGuide])
  })

  it('ignores rich content made stale by an older plain-text client', () => {
    const input = source('source-guide', [stepTarget])
    input.sections![0].steps[0].text = 'Replaced by an older client'
    expect(collectGuideLinks(input)).toEqual([])
  })

  it('ignores forged text projections even when the stored projection matches the step', () => {
    const input = source('source-guide', [stepTarget])
    const step = input.sections![0].steps[0]
    step.richContent = { ...step.richContent!, text: 'Replacement' }
    step.text = 'Replacement'
    expect(collectGuideLinks(input)).toEqual([])
  })

  it('validates the actual stored link domain and strips extra attributes', () => {
    const input = source('source-guide', [{ ...sharedTarget, teamCode: 'ignored', title: 'Do not trust metadata' }])
    expect(collectGuideLinks(input)).toEqual([sharedTarget])
    input.sections![0].steps[0].richContent!.document.content![0].content![0].content![0].marks![0].attrs = { guideId: 'receiving-guide', scope: 'team' }
    expect(collectGuideLinks(input)).toEqual([])
  })

  it('ignores web and document links and plain legacy content', () => {
    const richContent = createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Web', marks: [{ type: 'link', attrs: { href: 'https://example.com/guide' } }] },
      { type: 'text', text: 'Document', marks: [{ type: 'documentLink', attrs: { href: '\\\\server\\share\\Guide.pdf' } }] },
    ] }] })
    const input = guide('source-guide', { sections: [{ id: 'section', heading: 'Files', steps: [{ id: 'step', text: richContent.text, richContent, imageIds: [] }] }] })
    expect(collectGuideLinks(input)).toEqual([])
    expect(collectGuideLinks(guide('legacy', { schemaVersion: undefined, sections: undefined, content: 'guideId: receiving-guide' }))).toEqual([])
  })

  it('collects valid links carried by hard breaks', () => {
    const richContent = createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'hardBreak', marks: [{ type: 'guideLink', attrs: sharedTarget }] }] }] })
    expect(collectGuideLinks(guide('source', { sections: [{ id: 'section', heading: 'References', steps: [{ id: 'step', text: richContent.text, richContent, imageIds: [] }] }] }))).toEqual([sharedTarget])
  })
})

describe('resolveGuideLink', () => {
  it('resolves stable IDs after titles, headings and step order change', () => {
    const destination = guide(sharedTarget.guideId, { title: 'Renamed guide' })
    const section = destination.sections![0]
    section.heading = 'Renamed section'
    const step = section.steps[0]
    step.text = 'Renamed instruction'
    section.steps.unshift({ id: 'new-step', text: 'First now', imageIds: [] })
    destination.sections!.unshift({ id: 'new-section', heading: 'First now', steps: [] })
    expect(resolveGuideLink(stepTarget, [{ guide: destination, scope: 'shared' }])).toEqual({ status: 'available', guide: destination, section, step })
  })

  it('resolves a guide or a section without inventing a step', () => {
    const destination = guide(sharedTarget.guideId)
    const entries: GuideLinkEntry[] = [{ guide: destination, scope: 'shared' }]
    expect(resolveGuideLink(sharedTarget, entries)).toEqual({ status: 'available', guide: destination })
    expect(resolveGuideLink({ ...sharedTarget, sectionId: 'receiving-section' }, entries)).toEqual({ status: 'available', guide: destination, section: destination.sections![0] })
  })

  it('falls back to the guide when the section is removed', () => {
    const destination = guide(sharedTarget.guideId, { sections: [{ id: 'different-section', heading: 'Replacement', steps: [{ id: 'check-step', text: 'Same step ID elsewhere', imageIds: [] }] }] })
    expect(resolveGuideLink(stepTarget, [{ guide: destination, scope: 'shared' }])).toEqual({ status: 'missing-section', guide: destination })
  })

  it('falls back to the section when the step is removed or moved elsewhere', () => {
    const destination = guide(sharedTarget.guideId)
    const step = destination.sections![0].steps.pop()!
    destination.sections!.push({ id: 'other-section', heading: 'Other', steps: [step] })
    expect(resolveGuideLink(stepTarget, [{ guide: destination, scope: 'shared' }])).toEqual({ status: 'missing-step', guide: destination, section: destination.sections![0] })
  })

  it('falls back to a legacy guide without generating new anchor IDs', () => {
    const destination = guide(sharedTarget.guideId, { schemaVersion: undefined, sections: undefined, content: 'Legacy instructions' })
    expect(resolveGuideLink(stepTarget, [{ guide: destination, scope: 'shared' }])).toEqual({ status: 'missing-section', guide: destination })
  })

  it('does not expose any archived guide or anchor metadata', () => {
    const destination = guide(sharedTarget.guideId)
    expect(resolveGuideLink(stepTarget, [{ guide: destination, scope: 'shared', archived: true }])).toEqual({ status: 'archived' })
  })

  it('prefers a supplied active entry over an archived duplicate', () => {
    const archived = guide(sharedTarget.guideId, { title: 'Old title' })
    const active = guide(sharedTarget.guideId)
    expect(resolveGuideLink(sharedTarget, [{ guide: archived, scope: 'shared', archived: true }, { guide: active, scope: 'shared' }])).toEqual({ status: 'available', guide: active })
  })

  it('treats absent, hidden and unknown guides identically as unavailable', () => {
    expect(resolveGuideLink(sharedTarget, [])).toEqual({ status: 'unavailable' })
    expect(resolveGuideLink(sharedTarget, [{ guide: guide('other-authorized-guide'), scope: 'shared' }])).toEqual({ status: 'unavailable' })
  })

  it('distinguishes the same guide ID in two teams and shared storage', () => {
    const tcd = guide(teamTarget.guideId, { title: 'TCD receiving' })
    const trr = guide(teamTarget.guideId, { title: 'TRR receiving' })
    const shared = guide(teamTarget.guideId, { title: 'Shared receiving' })
    const entries: GuideLinkEntry[] = [{ guide: trr, scope: 'team', teamCode: 'TRR' }, { guide: shared, scope: 'shared' }, { guide: tcd, scope: 'team', teamCode: 'TCD' }]
    expect(resolveGuideLink(teamTarget, entries)).toEqual({ status: 'available', guide: tcd })
    expect(resolveGuideLink({ ...teamTarget, teamCode: 'TRR' }, entries)).toEqual({ status: 'available', guide: trr })
    expect(resolveGuideLink(sharedTarget, entries)).toEqual({ status: 'available', guide: shared })
    expect(resolveGuideLink({ ...teamTarget, teamCode: 'PRIVATE' }, entries)).toEqual({ status: 'unavailable' })
  })

  it('does not reveal archive status from a different team', () => {
    expect(resolveGuideLink(teamTarget, [{ guide: guide(teamTarget.guideId), scope: 'team', teamCode: 'TRR', archived: true }])).toEqual({ status: 'unavailable' })
  })

  it('rejects invalid domains rather than resolving a partial or unscoped target', () => {
    const entries: GuideLinkEntry[] = [{ guide: guide(sharedTarget.guideId), scope: 'shared' }]
    const invalidTargets: GuideLinkTarget[] = [
      { guideId: sharedTarget.guideId, scope: 'global' },
      { guideId: sharedTarget.guideId, scope: 'team' },
      { ...sharedTarget, stepId: 'check-step' },
      { ...sharedTarget, sectionId: '' },
      { ...sharedTarget, guideId: '../receiving-guide' },
    ]
    for (const target of invalidTargets) expect(resolveGuideLink(target, entries)).toEqual({ status: 'unavailable' })
  })
})

describe('findGuideBacklinks', () => {
  it('returns only active supplied sources, ignores anchors, excludes self and deduplicates', () => {
    const referring: GuideLinkEntry = { guide: source('source-guide', [sharedTarget, stepTarget]), scope: 'team', teamCode: 'TCD' }
    const entries: GuideLinkEntry[] = [
      referring, referring,
      { guide: source(sharedTarget.guideId, [stepTarget]), scope: 'shared' },
      { guide: source('archived-source', [stepTarget]), scope: 'shared', archived: true },
      { guide: source('wrong-scope', [teamTarget]), scope: 'shared' },
      { guide: source('unrelated', [{ guideId: 'another-guide', scope: 'shared' }]), scope: 'shared' },
    ]
    expect(findGuideBacklinks({ ...stepTarget, sectionId: 'removed-section', stepId: 'removed-step' }, entries)).toEqual([referring])
    expect(findGuideBacklinks(sharedTarget, [])).toEqual([])
  })

  it('keeps backlink identities and targets distinct across team scopes', () => {
    const tcd: GuideLinkEntry = { guide: source('same-source-id', [teamTarget]), scope: 'team', teamCode: 'TCD' }
    const trr: GuideLinkEntry = { guide: source('same-source-id', [teamTarget]), scope: 'team', teamCode: 'TRR' }
    const sameIdOtherScope: GuideLinkEntry = { guide: source(teamTarget.guideId, [teamTarget]), scope: 'shared' }
    const wrongTeam: GuideLinkEntry = { guide: source('wrong-team', [{ ...teamTarget, teamCode: 'TRR' }]), scope: 'team', teamCode: 'TCD' }
    const self: GuideLinkEntry = { guide: source(teamTarget.guideId, [teamTarget]), scope: 'team', teamCode: 'TCD' }
    expect(findGuideBacklinks(teamTarget, [tcd, trr, sameIdOtherScope, wrongTeam, self, tcd])).toEqual([tcd, trr, sameIdOtherScope])
  })

  it('does not report backlinks from stale old-client edits', () => {
    const stale = source('stale-source', [sharedTarget])
    stale.sections![0].steps[0].text = 'Reference removed'
    expect(findGuideBacklinks(sharedTarget, [{ guide: stale, scope: 'shared' }])).toEqual([])
  })

  it('rejects an invalid target even when a supplied source links to that guide', () => {
    expect(findGuideBacklinks({ ...sharedTarget, stepId: 'check-step' }, [{ guide: source('source', [sharedTarget]), scope: 'shared' }])).toEqual([])
  })

  it('does not mutate the caller-provided entries or rich documents', () => {
    const entries: GuideLinkEntry[] = [{ guide: source('source', [stepTarget]), scope: 'shared' }, { guide: guide(sharedTarget.guideId), scope: 'shared' }]
    const before = structuredClone(entries)
    collectGuideLinks(entries[0].guide)
    resolveGuideLink(stepTarget, entries)
    findGuideBacklinks(stepTarget, entries)
    summariseGuideLink(entries[1].guide)
    expect(entries).toEqual(before)
  })
})

describe('summariseGuideLink', () => {
  it('returns only title, category and the first 180 characters of guidePlainText', () => {
    const input = guide('authorized-guide', { content: 'Long instructions '.repeat(30), author: 'Not preview metadata', fileUrl: 'kv://private-file' })
    expect(summariseGuideLink(input)).toEqual({ title: input.title, category: input.category, text: guidePlainText(input).slice(0, 180) })
    expect(summariseGuideLink(input).text).toHaveLength(180)
  })

  it('leaves short plain text unchanged and does not add an ellipsis', () => {
    const input = guide('authorized-guide', { title: 'Short', category: '', tags: [], sections: [], content: 'Text' })
    expect(summariseGuideLink(input)).toEqual({ title: 'Short', category: '', text: 'Short Text' })
  })
})