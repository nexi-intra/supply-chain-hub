import { getSchema } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createRichContent, GUIDE_TEXT_COLORS, GUIDE_TEXT_SIZES } from './guideRichText'
import { createGuideEditorExtensions, normalizeGuideColor, normalizeGuideFontSize, validateGuideLink } from './guideEditorExtensions'

describe('guide editor extensions', () => {
  it('registers only domain nodes and marks, with exclusive link kinds', () => {
    const schema = getSchema(createGuideEditorExtensions())
    expect(Object.keys(schema.nodes).sort()).toEqual(['doc', 'hardBreak', 'note', 'paragraph', 'text'])
    expect(Object.keys(schema.marks).sort()).toEqual(['bold', 'documentLink', 'guideLink', 'italic', 'link', 'textStyle', 'underline'])
    const web = schema.marks.link.create({ href: 'https://example.com' })
    const guide = schema.marks.guideLink.create({ guideId: 'saved-guide', scope: 'shared' })
    expect(guide.addToSet([web]).map(mark => mark.type.name)).toEqual(['guideLink'])
    expect(web.addToSet([guide]).map(mark => mark.type.name)).toEqual(['link'])
  })

  it('round trips a stored guide target without needing loaded guide options', () => {
    const schema = getSchema(createGuideEditorExtensions())
    const content = createRichContent({ type: 'doc', content: [{ type: 'note', attrs: { kind: 'important' }, content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Read', marks: [{ type: 'guideLink', attrs: { guideId: 'saved-guide', scope: 'team', teamCode: 'TCD', sectionId: 'saved-section', stepId: 'saved-step' } }] },
      { type: 'hardBreak', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'Next', marks: [{ type: 'textStyle', attrs: { color: '#b91c1c', fontSize: '18px' } }] },
    ] }] }] })
    const restored = createRichContent(schema.nodeFromJSON(content.document).toJSON())
    expect(restored).toEqual(content)
  })

  it('normalizes browser CSS colors and drops unsupported pasted styling', () => {
    for (const color of GUIDE_TEXT_COLORS) expect(normalizeGuideColor(color.toUpperCase())).toBe(color)
    expect(normalizeGuideColor('rgb(185, 28, 28)')).toBe('#b91c1c')
    expect(normalizeGuideColor('rgb(29 78 216)')).toBe('#1d4ed8')
    for (const size of GUIDE_TEXT_SIZES) expect(normalizeGuideFontSize(size)).toBe(size)
    for (const color of ['red', '#ffffff', 'rgba(185, 28, 28, 0.5)', 'var(--unsafe)']) expect(normalizeGuideColor(color)).toBeNull()
    for (const size of ['80px', '2em', 'expression(test)']) expect(normalizeGuideFontSize(size)).toBeNull()
  })

  it('uses the domain validator for every link kind', () => {
    expect(validateGuideLink('link', { href: 'https://example.com/guide' })).toEqual({ href: 'https://example.com/guide' })
    expect(validateGuideLink('documentLink', { href: '\\\\server\\share\\Guide.pdf' })).toEqual({ href: '\\\\server\\share\\Guide.pdf' })
    expect(validateGuideLink('guideLink', { guideId: 'g', scope: 'shared', sectionId: 's', stepId: 't' })).toEqual({ guideId: 'g', scope: 'shared', sectionId: 's', stepId: 't' })
    expect(validateGuideLink('link', { href: 'https://example.com/run.exe' })).toBeNull()
    expect(validateGuideLink('link', { href: 'javascript:alert(1)' })).toBeNull()
    expect(validateGuideLink('documentLink', { href: 'M:\\Guide.pdf' })).toBeNull()
    expect(validateGuideLink('guideLink', { guideId: 'g', scope: 'team' })).toBeNull()
    expect(validateGuideLink('guideLink', { guideId: 'g', scope: 'shared', stepId: 't' })).toBeNull()
  })
})