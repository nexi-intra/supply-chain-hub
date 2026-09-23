import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './button'

describe('Button saving feedback', () => {
  it('keeps the label, disables repeated clicks and exposes busy progress', () => {
    const html = renderToStaticMarkup(<Button loading>Gemmer…</Button>)
    expect(html).toContain('Gemmer…')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('motion-safe:animate-pulse')
  })

  it('does not block a normal command or draw a progress strip', () => {
    const html = renderToStaticMarkup(<Button>Gem</Button>)
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('aria-busy')
    expect(html).not.toContain('animate-pulse')
  })
})