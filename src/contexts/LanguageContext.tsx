import { createContext, useContext, ReactNode } from 'react'
import { useKV } from '@/hooks/useKV'
import { translations, Language } from '@/lib/translations'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: typeof translations.da
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const languageKey = userId ? `app-language-${userId}` : 'app-language-guest'
  const [language, setLanguage] = useKV<Language>(languageKey, 'da')

  const t = translations[language || 'da']

  return (
    <LanguageContext.Provider value={{ language: language || 'da', setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
