import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChristmasContext } from '@/contexts/ChristmasContext'
import { nisseLabels } from '@/lib/nisseLabels'
import type { NisseToday } from '@/lib/nisse'
import { NisseContext } from './NisseContext'
import { NisseSpot } from './NisseSpot'

const season = { month: 12 as const, day: 16, daysToEve: 8, phase: 'advent' as const }
const render = (state: NisseToday, active: boolean, node: ReactNode) => renderToStaticMarkup(
  <ChristmasContext.Provider value={{ season, enabled: active, setEnabled: () => {}, active, mode: 'calm' }}>
    <NisseContext.Provider value={{ state, claim: async () => {}, label: 'Nisse' }}>{node}</NisseContext.Provider>
  </ChristmasContext.Provider>,
)
const hiding: NisseToday = { status: 'hiding', date: '2026-12-16', spot: 'meals' }

describe('NisseSpot', () => {
  it('shows a small nisse button exactly where today\'s nisse hides', () => {
    const html = render(hiding, true, <NisseSpot spot="meals" pose="stand" />)
    expect(html).toMatch(/<button[^>]*type="button"/)
    expect(html).toContain('aria-label="Nisse"')
  })

  it('comes in three kinds: peeking over an edge, hanging from one (kravlenisse) and the old farm nisse standing', () => {
    expect(render(hiding, true, <NisseSpot spot="meals" pose="peek" />)).toContain('xmas-nisse-peek')
    expect(render(hiding, true, <NisseSpot spot="meals" pose="hang" />)).toContain('xmas-nisse-hang')
    expect(render(hiding, true, <NisseSpot spot="meals" pose="stand" />)).toContain('xmas-nisse-stand')
  })

  it('shows nothing anywhere else, before 10, after it is found or without the Christmas theme', () => {
    expect(render(hiding, true, <NisseSpot spot="email" pose="stand" />)).toBe('')
    expect(render({ status: 'waiting', date: '2026-12-16', startsAt: 0 }, true, <NisseSpot spot="meals" pose="stand" />)).toBe('')
    expect(render({ status: 'found', date: '2026-12-16', finder: { name: 'Lasse', email: 'l@x.dk', at: '2026-12-16T09:42:00.000Z' } }, true, <NisseSpot spot="meals" pose="stand" />)).toBe('')
    expect(render(hiding, false, <NisseSpot spot="meals" pose="stand" />)).toBe('')
  })
})

describe('nisseLabels', () => {
  const keys = ['nisse', 'searching', 'wonTitle', 'wonBody', 'preview', 'failed', 'greetingTitle', 'greetingOn', 'greetingGo', 'close'] as const

  it('says who was first, in plain words', () => {
    expect(nisseLabels('da').taken('Lasse', '10:42')).toBe('Nissen er allerede fundet i dag af Lasse kl. 10:42.')
    expect(nisseLabels('da').foundLine('Lasse', '10:42')).toBe('Dagens nisse blev fundet af Lasse kl. 10:42')
    expect(nisseLabels('da').wonTitle).toBe('Du fandt dagens nisse! 🍫')
  })

  it('exists in every app language', () => {
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = nisseLabels(language)
      for (const key of keys) expect(labels[key], `${language}.${key}`).toBeTruthy()
      expect(labels.greetingBody('Hub X')).toContain('Hub X')
    }
  })

  it('never gives away where the nisse is', () => {
    const places = /madplan|kalender|vagtplan|email|notesbog|guide|knowledge|link|forbedring|profil|to do|logo|sne/i
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = nisseLabels(language)
      const texts = [...keys.map(key => labels[key]), labels.taken('A', '10:00'), labels.foundLine('A', '10:00'), labels.foundToast('A', '10:00'), labels.greetingBody('Hub')]
      for (const text of texts) expect(text).not.toMatch(places)
    }
  })

  it('reads like a person wrote it: no dashes in what people see', () => {
    for (const language of ['da', 'en', 'fi', 'sv']) {
      const labels = nisseLabels(language)
      const texts = [...keys.map(key => labels[key]), labels.taken('A', '10:00'), labels.foundLine('A', '10:00'), labels.foundToast('A', '10:00'), labels.greetingBody('Hub')]
      for (const text of texts) expect(text, text).not.toMatch(/[–—]/)
    }
  })
})
