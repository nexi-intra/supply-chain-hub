import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { GuideStepEditor } from './GuideStepEditor'

describe('guide editor field presentation', () => {
  it('keeps a visible heading label and placeholder on an empty inactive field', () => {
    const html = renderToStaticMarkup(createElement(LanguageProvider, null, createElement(GuideStepEditor, {
      step: { id: 'heading-test', text: '', imageIds: [] },
      active: false, variant: 'heading', label: 'Sektionsoverskrift', placeholder: 'Skriv en overskrift',
      linkTargets: [], onChange: () => {},
    })))
    expect(html).toContain('>Sektionsoverskrift</')
    expect(html).toContain('>Skriv en overskrift</')
    expect(html).not.toContain('bg-white')
    expect(html).not.toContain('text-gray-900')
  })

  it('keeps the visible field label after text has been entered', () => {
    const html = renderToStaticMarkup(createElement(LanguageProvider, null, createElement(GuideStepEditor, {
      step: { id: 'step-test', text: 'Actual instruction', imageIds: [] },
      active: false, label: 'Trintekst', placeholder: 'Beskriv trinnet',
      linkTargets: [], onChange: () => {},
    })))
    expect(html).toContain('>Trintekst</')
    expect(html).toContain('Actual instruction')
    expect(html).not.toContain('>Beskriv trinnet</')
  })
})