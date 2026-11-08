import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HubLoader, HubMark, hubLoaderLabel } from './HubMark'

describe('HubMark', () => {
  it('is the Kæde-H tile with a name for screen readers', () => {
    const html = renderToStaticMarkup(<HubMark size={40} />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Supply Chain Hub"')
    expect(html).toContain('width="40"')
    expect(html).toContain('#F8DC9C')
    expect(html).toContain('#1D2E47')
  })

  it('can be decorative next to a visible name', () => {
    const html = renderToStaticMarkup(<HubMark decorative />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('role="img"')
  })

  it('two marks on one page do not share gradient ids', () => {
    const html = renderToStaticMarkup(<><HubMark /><HubMark /></>)
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1])
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('HubLoader', () => {
  it('tells screen readers that something is loading', () => {
    const html = renderToStaticMarkup(<HubLoader label="Indlæser" />)
    expect(html).toContain('role="status"')
    expect(html).toContain('Indlæser')
    expect(html).toContain('hub-loader')
  })

  it('has a loading text in every app language', () => {
    expect(['da', 'en', 'fi', 'sv'].map(language => hubLoaderLabel(language))).toEqual(['Indlæser', 'Loading', 'Ladataan', 'Laddar'])
  })
})

describe('the mark is where the app presents itself', () => {
  const source = (...path: string[]) => readFileSync(join(__dirname, '..', ...path), 'utf8')

  it('login, front page, hub picker and what is new show the mark', () => {
    for (const file of [['views', 'Auth.tsx'], ['views', 'Hub.tsx'], ['components', 'HubPicker.tsx'], ['components', 'WhatsNewDialog.tsx']]) {
      expect(source(...file), file.join('/')).toContain('<HubMark')
    }
  })

  it('whole modules load behind the chain loader', () => {
    expect(source('App.tsx')).toContain('<HubLoader')
    expect(source('views', 'GameCorner.tsx')).toContain('<HubLoader')
  })
})
