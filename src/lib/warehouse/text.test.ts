import { afterEach, describe, expect, it } from 'vitest'
import { setWarehouseLanguage, t, warehouseLanguage, warehouseLocale } from './text'

afterEach(() => setWarehouseLanguage('da'))

describe('warehouse text', () => {
  it('Optælling is Danish or English; Swedish and Finnish get English', () => {
    expect(warehouseLanguage('da')).toBe('da')
    for (const language of ['en', 'sv', 'fi', 'xx']) expect(warehouseLanguage(language)).toBe('en')
  })

  it('t() picks the text for the active language', () => {
    expect(t('Optællinger', 'Counts')).toBe('Optællinger')
    setWarehouseLanguage('sv')
    expect(t('Optællinger', 'Counts')).toBe('Counts')
    expect(warehouseLocale()).toBe('en-GB')
    setWarehouseLanguage('da')
    expect(warehouseLocale()).toBe('da-DK')
  })
})
