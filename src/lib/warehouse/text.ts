import { useLanguage } from '@/contexts/LanguageContext'

/** Optælling is Danish or English; the Hub's Swedish and Finnish users get English. */
export type WarehouseLanguage = 'da' | 'en'

export const warehouseLanguage = (language: string): WarehouseLanguage => (language === 'da' ? 'da' : 'en')

// One person, one window: the active language is module state, so formatters and error texts need no parameter.
let active: WarehouseLanguage = 'da'

export function setWarehouseLanguage(language: string) {
  active = warehouseLanguage(language)
}

export const currentWarehouseLanguage = () => active

/** The Danish or English text for the active language. */
export const t = (da: string, en: string) => (active === 'da' ? da : en)

export const warehouseLocale = () => (active === 'da' ? 'da-DK' : 'en-GB')

/** Re-renders the caller when the Hub language changes and keeps `t()` in step with it. */
export function useWarehouseLanguage(): WarehouseLanguage {
  const { language } = useLanguage()
  setWarehouseLanguage(language)
  return active
}
