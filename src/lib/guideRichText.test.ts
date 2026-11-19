import { describe, expect, it } from 'vitest'
import { createRichContent, getStepDocument, isAllowedDocumentTarget, plainTextDocument, prepareSectionHeading, prepareStepContent, richDocumentText } from './guideRichText'

describe('guide rich-text content', () => {
  it('preserves formatted section headings through save and keeps legacy headings compatible', () => {
    const headingRichContent = createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: ' Important heading ', marks: [{ type: 'bold' }] }] }] })
    expect(prepareSectionHeading({ heading: headingRichContent.text, headingRichContent })).toEqual({ heading: headingRichContent.text, headingRichContent })
    expect(prepareSectionHeading({ heading: ' Legacy heading ' })).toEqual({ heading: 'Legacy heading', headingRichContent: undefined })
    expect(prepareSectionHeading({ heading: 'Changed heading', headingRichContent })).toEqual({ heading: 'Changed heading', headingRichContent: undefined })
  })

  it('round trips legacy text, including empty lines, without changing its content', () => {
    const text = 'First step\n\nNext step'
    expect(richDocumentText(plainTextDocument(text))).toBe(text)
  })

  it('preserves supported formatting and produces the plain-text projection', () => {
    const document = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Important', marks: [{ type: 'bold' }] }] }],
    }
    const richContent = createRichContent(document)
    expect(richContent.text).toBe('Important')
    expect(richContent.document).toEqual(document)
    expect(getStepDocument({ text: 'Important', richContent })).toEqual(document)
  })

  it('uses a later plain-text edit instead of stale rich content from an older client', () => {
    const richContent = createRichContent(plainTextDocument('Original'))
    expect(richDocumentText(getStepDocument({ text: 'Edited by older client', richContent }))).toBe('Edited by older client')
  })

  it('preserves formatted whitespace on preview/save but keeps legacy plain-text trimming', () => {
    const richContent = createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: ' Important ', marks: [{ type: 'bold' }] }] }] })
    expect(prepareStepContent({ text: richContent.text, richContent })).toEqual({ text: richContent.text, richContent })
    expect(prepareStepContent({ text: ' Legacy ' })).toEqual({ text: 'Legacy', richContent: undefined })
    expect(prepareStepContent({ text: ' New edit ', richContent })).toEqual({ text: 'New edit', richContent: undefined })
  })

  it('rejects unsafe link targets and arbitrary content nodes', () => {
    const link = (href: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open', marks: [{ type: 'link', attrs: { href } }] }] }] })
    expect(() => createRichContent(link('javascript:alert(1)'))).toThrow('INVALID_GUIDE_RICH_CONTENT')
    expect(() => createRichContent(link('data:text/html,test'))).toThrow('INVALID_GUIDE_RICH_CONTENT')
    expect(() => createRichContent({ type: 'doc', content: [{ type: 'script' }] })).toThrow('INVALID_GUIDE_RICH_CONTENT')
    expect(createRichContent(link('https://example.com/document.pdf')).text).toBe('Open')
  })

  it('accepts portable document targets but rejects executables and local drive mappings', () => {
    expect(isAllowedDocumentTarget('https://example.com/document')).toBe(true)
    expect(isAllowedDocumentTarget('\\\\server\\share\\Guide.docx')).toBe(true)
    expect(isAllowedDocumentTarget('\\\\server\\share\\Run.exe')).toBe(false)
    expect(isAllowedDocumentTarget('M:\\Guide.docx')).toBe(false)
  })

  it('rejects explicit executable downloads even in encoded HTTPS paths and filenames', () => {
    for (const target of ['https://example.com/run.exe', 'https://example.com/run%2eexe', 'https://example.com/download?file=run.exe', 'https://example.com/run.lnk', 'https://example.com/run.cpl', 'https://example.com/run%2ecpl', 'https://example.com/download?file=run.wsf']) {
      expect(isAllowedDocumentTarget(target), target).toBe(false)
      expect(() => createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open', marks: [{ type: 'link', attrs: { href: target } }] }] }] })).toThrow('INVALID_GUIDE_RICH_CONTENT')
    }
  })

  it('accepts legitimate encoded percent signs in document paths and query values', () => {
    expect(isAllowedDocumentTarget('https://example.com/100%25-complete.pdf')).toBe(true)
    expect(isAllowedDocumentTarget('https://example.com/download?file=100%25-complete.pdf')).toBe(true)
  })

  it('counts normalized empty blocks in the node budget and can reload every accepted result', () => {
    const notes = (count: number) => ({ type: 'doc', content: Array.from({ length: count }, () => ({ type: 'note', attrs: { kind: 'note' } })) })
    expect(() => createRichContent(notes(2500))).toThrow('INVALID_GUIDE_RICH_CONTENT')
    const accepted = createRichContent(notes(2499))
    expect(createRichContent(accepted.document)).toEqual(accepted)
    expect(getStepDocument({ text: accepted.text, richContent: accepted })).toEqual(accepted.document)
  })

  it('rejects reserved and ambiguous Windows document paths', () => {
    for (const target of ['\\\\server\\share\\CON.pdf', '\\\\server\\share\\NUL.txt', '\\\\server\\share\\folder.\\Guide.pdf', '\\\\server\\share\\\\Guide.pdf']) {
      expect(isAllowedDocumentTarget(target), target).toBe(false)
    }
  })

  it('preserves valid marks on hard breaks without discarding the document', () => {
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }, { type: 'hardBreak', marks: [{ type: 'bold' }] }, { type: 'hardBreak', marks: [] }, { type: 'text', text: 'Two' }] }] }
    expect(createRichContent(document).text).toBe('One\n\nTwo')
  })

  it('normalizes an empty root to a valid empty paragraph', () => {
    expect(createRichContent({ type: 'doc', content: [] }).document).toEqual(plainTextDocument(''))
    expect(createRichContent({ type: 'doc' }).document).toEqual(plainTextDocument(''))
  })

  it('stores stable guide and step identifiers and requires a team scope', () => {
    const document = (attrs: Record<string, string>) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See step', marks: [{ type: 'guideLink', attrs }] }] }] })
    const target = { guideId: 'guide-123', scope: 'team', teamCode: 'TCD', sectionId: 'section-1', stepId: 'step-2' }
    expect(createRichContent(document(target)).document).toEqual(document(target))
    expect(() => createRichContent(document({ guideId: 'guide-123', scope: 'team' }))).toThrow('INVALID_GUIDE_RICH_CONTENT')
    expect(() => createRichContent(document({ guideId: 'guide-123', scope: 'shared', stepId: 'step-2' }))).toThrow('INVALID_GUIDE_RICH_CONTENT')
  })

  it('supports approved styling and notes while stripping unknown attributes', () => {
    const richContent = createRichContent({ type: 'doc', content: [{ type: 'note', attrs: { kind: 'important', onclick: 'unsafe' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Check first', marks: [{ type: 'textStyle', attrs: { color: '#B91C1C', fontSize: '16px', onclick: 'unsafe' } }] }] }] }] })
    expect(richContent.text).toBe('Check first')
    expect(richContent.document.content?.[0].attrs).toEqual({ kind: 'important' })
    expect(richContent.document.content?.[0].content?.[0].content?.[0].marks?.[0].attrs).toEqual({ color: '#b91c1c', fontSize: '16px' })
  })

  it('falls back when a matching payload contains invalid nodes or a forged text projection', () => {
    const step = { text: 'Visible', richContent: { version: 1, text: 'Visible', document: { type: 'doc', content: [{ type: 'script' }] } } }
    expect(richDocumentText(getStepDocument(step))).toBe('Visible')
    expect(richDocumentText(getStepDocument({ text: 'Visible', richContent: { version: 1, text: 'Visible', document: plainTextDocument('Other') } }))).toBe('Visible')
    expect(richDocumentText(getStepDocument({ text: 'Legacy' }))).toBe('Legacy')
  })

  it('rejects conflicting link marks and excessive text/node counts', () => {
    expect(() => createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }, { type: 'documentLink', attrs: { href: 'https://example.com/guide.pdf' } }] }] }] })).toThrow('INVALID_GUIDE_RICH_CONTENT')
    expect(() => createRichContent(plainTextDocument('a'.repeat(200001)))).toThrow('INVALID_GUIDE_RICH_CONTENT')
    expect(() => createRichContent({ type: 'doc', content: Array.from({ length: 5001 }, () => ({ type: 'paragraph' })) })).toThrow('INVALID_GUIDE_RICH_CONTENT')
  })

  it('falls back to plain text if stored rich content is malformed or a future version', () => {
    expect(richDocumentText(getStepDocument({ text: 'Still readable', richContent: { version: 99, document: {} } }))).toBe('Still readable')
  })

  it('rejects excessively deep content rather than recursively parsing unbounded input', () => {
    let document: unknown = { type: 'paragraph' }
    for (let depth = 0; depth < 100; depth++) document = { type: 'note', attrs: { kind: 'note' }, content: [document] }
    expect(() => createRichContent({ type: 'doc', content: [document] })).toThrow('INVALID_GUIDE_RICH_CONTENT')
  })
})