import { describe, expect, it } from 'vitest'
import { translations, type Language } from './translations'
import { adaptLibraryText, adaptLibraryTranslations, LIBRARY_TEXT_NAMESPACES } from './libraryTerms'

const GUIDE_WORD = /(?<!\p{L})(guide|guiden|guides|guider|guiderna|guidens|guidene|opas|oppaan|opasta|oppaat|oppaita|oppaiden|oppaalle|oppaasta|oppaassa|oppaaseen|oppaana|oppaaksi|oppaille|oppaissa|oppaisiin|oppaista|opaskirjasto\p{L}*|guidebibliotek\p{L}*)(?!\p{L})/iu

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

describe('adaptLibraryText', () => {
  it('leaves the Guide Library text untouched', () => {
    expect(adaptLibraryText('Guiden er sendt til review', 'da', 'guides')).toBe('Guiden er sendt til review')
  })

  it.each<[Language, string, string]>([
    ['da', 'Guiden er sendt til review', 'Vidensartiklen er sendt til review'],
    ['da', 'Der findes allerede en åben revision af denne guide', 'Der findes allerede en åben revision af denne vidensartikel'],
    ['da', 'Der er ingen guides, som afventer review.', 'Der er ingen vidensartikler, som afventer review.'],
    ['da', 'Guide Bibliotek', 'Knowledge Base'],
    ['da', 'guidens version', 'vidensartiklens version'],
    ['da', 'så guider ikke alle forfalder samtidig', 'så vidensartikler ikke alle forfalder samtidig'],
    ['en', 'Create a guide', 'Create an article'],
    ['en', 'Guide submitted for review', 'Article submitted for review'],
    ['en', 'No guides are awaiting review.', 'No articles are awaiting review.'],
    ['en', 'Guide Library', 'Knowledge Base'],
    ['en', 'A guided tour', 'A guided tour'],
    ['sv', 'Guiden skickades till granskning', 'Artikeln skickades till granskning'],
    ['sv', 'Inga guider väntar på granskning.', 'Inga artiklar väntar på granskning.'],
    ['sv', 'Guidebiblioteket', 'Knowledge Base'],
    ['sv', 'Ny guide', 'Ny artikel'],
    ['fi', 'Opas lähetettiin tarkistettavaksi', 'Artikkeli lähetettiin tarkistettavaksi'],
    ['fi', 'Tälle oppaalle on jo avoin pyyntö', 'Tälle artikkelille on jo avoin pyyntö'],
    ['fi', 'Tarkistusta odottavia oppaita ei ole.', 'Tarkistusta odottavia artikkeleita ei ole.'],
    ['fi', 'Opaskirjasto', 'Knowledge Base'],
  ])('%s: "%s" becomes "%s" in the Knowledge Base', (language, input, expected) => {
    expect(adaptLibraryText(input, language, 'knowledge')).toBe(expected)
  })
})

describe('adaptLibraryTranslations', () => {
  it('returns the same translation object for the Guide Library', () => {
    expect(adaptLibraryTranslations(translations.da, 'da', 'guides')).toBe(translations.da)
  })

  it.each<Language>(['da', 'en', 'fi', 'sv'])('%s: no library string still names guides in the Knowledge Base', (language) => {
    const adapted = adaptLibraryTranslations(translations[language], language, 'knowledge')
    const leftovers = LIBRARY_TEXT_NAMESPACES.flatMap((namespace) => strings(adapted[namespace])).filter((text) => GUIDE_WORD.test(text))
    expect(leftovers).toEqual([])
  })

  it('keeps every other namespace and the key structure unchanged', () => {
    const adapted = adaptLibraryTranslations(translations.en, 'en', 'knowledge')
    expect(adapted.common).toBe(translations.en.common)
    expect(Object.keys(adapted.guideLibrary)).toEqual(Object.keys(translations.en.guideLibrary))
  })
})
