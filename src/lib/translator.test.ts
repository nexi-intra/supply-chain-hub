import { describe, expect, it } from 'vitest'
import { detectLanguage, translateText, GUIDE_LANGUAGES } from './translator'

describe('guide translator languages', () => {
  it('offers Swedish as a guide view language', () => {
    expect(GUIDE_LANGUAGES).toEqual(['da', 'en', 'fi', 'sv'])
  })

  it('tells Swedish apart from Danish, Finnish and English', () => {
    expect(detectLanguage('Klicka på knappen och välj Spara. Det är inte svårt.')).toBe('sv')
    expect(detectLanguage('Öppna menyn och tryck på OK')).toBe('sv')
    expect(detectLanguage('Klik på knappen og tryk på OK')).toBe('da')
    expect(detectLanguage('Åbn menuen og vælg Gem')).toBe('da')
    expect(detectLanguage('Avaa valikko ja valitse tallenna')).toBe('fi')
    expect(detectLanguage('Tämä on päivitys, joka asennetaan')).toBe('fi')
    expect(detectLanguage('Open the menu and select Save')).toBe('en')
  })

  it('has a Swedish dictionary fallback like Finnish when the neural models are missing', () => {
    expect(translateText('Press button and select menu', 'en', 'sv')).toBe('Tryck knapp och välj meny')
    expect(translateText('Tryck knapp och välj meny', 'sv', 'en')).toBe('Press button and select menu')
    expect(translateText('Stäng skärm', 'sv', 'fi')).toBe('Sulje näyttö')
    // Danish pivots through English, exactly like Danish↔Finnish.
    const danishToSwedish = translateText('Tryk på knappen', 'da', 'sv')
    expect(danishToSwedish).not.toBe(translateText('Tryk på knappen', 'da', 'en'))
    expect(danishToSwedish).toMatch(/Tryck/)
  })

  it('keeps the existing Danish/English/Finnish dictionary behaviour', () => {
    expect(translateText('Åbn', 'da', 'en')).not.toBe('Åbn')
  })
})
