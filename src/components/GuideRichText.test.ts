import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { createRichContent, type GuideRichNode } from '@/lib/guideRichText'
import type { GuideStep } from '@/lib/guideTypes'
import { GuideRichText } from './GuideRichText'

type Step = Pick<GuideStep, 'text' | 'richContent'>

function richStep(document: GuideRichNode): Step {
  const richContent = createRichContent(JSON.parse(JSON.stringify(document)))
  return { text: richContent.text, richContent }
}

async function render(step: Step, locale: 'da' | 'en' | 'fi' | 'sv' = 'en') {
  return renderToStaticMarkup(createElement(GuideRichText, { step, locale }))
}

describe('GuideRichText SSR', () => {
  it('separates the label and paragraphs in inline heading notes', () => {
    const step = richStep({ type: 'doc', content: [{ type: 'note', attrs: { kind: 'note' }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
    ] }] })
    const html = renderToStaticMarkup(createElement(GuideRichText, { step, locale: 'en', inline: true }))
    expect(html).toContain('</span> <span class="m-0">First</span><br/><span class="m-0">Second</span>')
  })

  it('renders formatted heading content as inline phrasing content', async () => {
    const step = richStep({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Heading', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }] }] }] })
    const html = renderToStaticMarkup(createElement(GuideRichText, { step, locale: 'en', inline: true }))
    expect(html).toContain('<strong>Heading</strong>')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toMatch(/<(?:div|p|aside)\b/)
  })

  it('keeps unmarked website references clickable after formatting or legacy fallback', async () => {
    const text = 'See https://example.com/help'
    const richContent = createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }] })
    expect(await render({ text, richContent })).toContain('href="https://example.com/help"')
    expect(await render({ text: 'Updated https://example.com/help', richContent })).toContain('href="https://example.com/help"')
  })

  it('does not create nested links when an explicit linked label contains a URL', async () => {
    const html = await render(richStep({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'https://example.com', marks: [{ type: 'link', attrs: { href: 'https://example.com/target' } }] }] }] }))
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).toContain('href="https://example.com/target"')
  })

  it('renders approved formatting with semantic marks and fixed styles', async () => {
    const html = await render(richStep({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{
        type: 'text', text: 'Formatted instruction',
        marks: [
          { type: 'bold' }, { type: 'italic' }, { type: 'underline' },
          { type: 'textStyle', attrs: { color: '#1d4ed8', fontSize: '18px' } },
        ],
      }] }],
    }))

    expect(html).toContain('<strong>')
    expect(html).toContain('<em>')
    expect(html).toContain('<u>')
    expect(html).toContain('style="color:#1d4ed8;font-size:18px"')
    expect(html).toContain('Formatted instruction')
  })

  it('preserves hard breaks without wrapping them in link or style marks', async () => {
    const html = await render(richStep({
      type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'First' },
        { type: 'hardBreak', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        { type: 'text', text: 'Second' },
      ] }],
    }))

    expect(html).toContain('First<br/>Second')
    expect(html).not.toContain('<a ')
  })

  it('preserves plain lines, blank lines and the existing typography', async () => {
    const step = { text: 'First  line\n\nLast line\n' }
    const html = await render(step)
    const explicit = await render(richStep({
      type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First  line' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Last line' }] },
        { type: 'paragraph' },
      ],
    }))

    expect(html).toBe(explicit)
    expect(html.match(/<p\b/g)).toHaveLength(4)
    expect(html.match(/<br\/>/g)).toHaveLength(2)
    expect(html).toContain('whitespace-pre-wrap')
    expect(html).toContain('font-family:Calibri, sans-serif')
    expect(html).toContain('First  line')
  })

  it('renders web and HTTPS document links as safe external anchors, and UNC as a command', async () => {
    const html = await render(richStep({
      type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Website', marks: [{ type: 'link', attrs: { href: 'https://example.com/help?a=1&b=2' } }] },
        { type: 'text', text: 'Document', marks: [{ type: 'documentLink', attrs: { href: 'https://example.com/manual.pdf' } }] },
        { type: 'text', text: 'Shared PDF', marks: [{ type: 'documentLink', attrs: { href: '\\\\server\\share\\manual.pdf' } }] },
      ] }],
    }))

    expect(html).toContain('href="https://example.com/help?a=1&amp;b=2"')
    expect(html).toContain('href="https://example.com/manual.pdf"')
    expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2)
    expect(html).toContain('<button type="button"')
    expect(html).toContain('Shared PDF</button>')
    expect(html).not.toContain('href="\\\\server')
  })

  it('renders guide links as disabled buttons when navigation is unavailable', async () => {
    const html = await render(richStep({
      type: 'doc', content: [{ type: 'paragraph', content: [{
        type: 'text', text: 'Related guide', marks: [{ type: 'guideLink', attrs: {
          scope: 'team', teamCode: 'TCD', guideId: 'guide-1', sectionId: 'section-1', stepId: 'step-1',
        } }],
      }] }],
    }))

    expect(html).toContain('<button type="button"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Related guide</button>')
    expect(html).not.toContain('href=')
  })

  it.each(['onGuideLink', 'onGuidePreview'] as const)('keeps guide links available with %s without calling callbacks during SSR', callback => {
    const received: Record<string, string>[] = []
    const step = richStep({
      type: 'doc', content: [{ type: 'paragraph', content: [{
        type: 'text', text: 'Related guide', marks: [{ type: 'guideLink', attrs: {
          scope: 'shared', guideId: 'guide-1', sectionId: 'section-1',
        } }],
      }] }],
    })
    const html = renderToStaticMarkup(createElement(GuideRichText, {
      step, locale: 'en', [callback]: (target: Record<string, string>) => { received.push(target) },
    }))

    expect(html).toContain('<button type="button"')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('href=')
    expect(received).toEqual([])
  })

  it.each([
    ['da', 'Bem\u00e6rk', 'Vigtigt'],
    ['en', 'Note', 'Important'],
    ['fi', 'Huomautus', 'T\u00e4rke\u00e4'],
    ['sv', 'Notering', 'Viktigt'],
  ] as const)('renders labeled semantic notes in %s without nested cards', async (locale, note, important) => {
    const html = await render(richStep({
      type: 'doc', content: [
        { type: 'note', attrs: { kind: 'note' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Information' }] }] },
        { type: 'note', attrs: { kind: 'important' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Check carefully' }] }] },
      ],
    }), locale)

    expect(html.match(/<aside\b/g)).toHaveLength(2)
    expect(html).toContain(`aria-label="${note}"`)
    expect(html).toContain(`aria-label="${important}"`)
    expect(html).toContain(`>${note}</`)
    expect(html).toContain(`>${important}</`)
    expect(html.match(/<svg\b/g)).toHaveLength(2)
    expect(html).toContain('border-l-')
    expect(html).not.toContain('rounded')
    expect(html).not.toContain('bg-card')
  })

  it('uses the real LanguageProvider for normal context-driven rendering in node', async () => {
    const step = richStep({
      type: 'doc', content: [{ type: 'note', attrs: { kind: 'important' } }],
    })
    const html = renderToStaticMarkup(createElement(LanguageProvider, {
      children: createElement(GuideRichText, { step }),
    }))

    expect(html).toContain('aria-label="Vigtigt"')
  })

  it('escapes HTML-like content in both rich and plain text', async () => {
    const text = '<script>alert("x")</script> & <img src=x onerror=alert(1)>'
    const step = richStep({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })
    const html = await render(step)

    expect(html).toBe(await render({ text }))
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;img')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
  })

  it.each([
    '{"version":1,"document":',
    null,
    { version: 1, text: 'Safe fallback', document: { type: 'html', text: '<script>bad</script>' } },
    { version: 1, text: 'Safe fallback', document: { type: 'doc', content: [{ type: 'paragraph', content: [{
      type: 'text', text: 'Safe fallback', marks: [{ type: 'textStyle', attrs: { color: 'red;position:fixed', fontSize: '999px' } }],
    }] }] } },
    { version: 1, text: 'Safe fallback', document: { type: 'doc', content: [{ type: 'paragraph', content: [{
      type: 'text', text: 'Safe fallback', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
    }] }] } },
    { version: 1, text: 'Safe fallback', document: { type: 'doc', content: [{ type: 'paragraph', content: [{
      type: 'text', text: 'Safe fallback', marks: [{ type: 'documentLink', attrs: { href: '\\\\server\\share\\payload.exe' } }],
    }] }] } },
  ])('uses plain fallback for malformed or unsafe rich content %#', async richContent => {
    const step = { text: 'Safe fallback', richContent } as unknown as Step

    expect(await render(step)).toBe(await render({ text: step.text }))
  })

  it('uses current plain text when rich content is stale', async () => {
    const step = richStep({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old', marks: [{ type: 'bold' }] }] }],
    })

    expect(await render({ ...step, text: 'Updated' })).toBe(await render({ text: 'Updated' }))
  })
})