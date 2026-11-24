import { createContext, useCallback, useContext, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { Translate } from '@phosphor-icons/react'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GuideLanguage } from '@/lib/translator'
import type { Language } from '@/lib/translations'
import { cn } from '@/lib/utils'

interface Scope {
  showOriginal: boolean
  from: GuideLanguage | null
  toggle: () => void
  report: (id: string, from: GuideLanguage | null) => void
}

const ScopeContext = createContext<Scope | null>(null)

/** The AutoTexts inside report what they translated, so one note can offer "show original" for all of them. */
export function TranslationScope({ children }: { children: ReactNode }) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [sources, setSources] = useState<Record<string, GuideLanguage>>({})
  const report = useCallback((id: string, from: GuideLanguage | null) => {
    setSources(current => {
      if (from) return current[id] === from ? current : { ...current, [id]: from }
      if (!(id in current)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])
  const toggle = useCallback(() => setShowOriginal(value => !value), [])
  const from = Object.values(sources)[0] ?? null
  const scope = useMemo(() => ({ showOriginal, from, toggle, report }), [showOriginal, from, toggle, report])
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

export const useTranslationScope = () => useContext(ScopeContext)

const NAMES: Record<Language, Record<GuideLanguage, string>> = {
  da: { da: 'dansk', en: 'engelsk', fi: 'finsk', sv: 'svensk' },
  en: { da: 'Danish', en: 'English', fi: 'Finnish', sv: 'Swedish' },
  fi: { da: 'tanska', en: 'englanti', fi: 'suomi', sv: 'ruotsi' },
  sv: { da: 'danska', en: 'engelska', fi: 'finska', sv: 'svenska' },
}

export const TRANSLATION_NOTE: Record<Language, { translated: (name: string) => string; original: (name: string) => string; showOriginal: string; showTranslation: string }> = {
  da: { translated: name => `Oversat fra ${name}`, original: name => `Original (${name})`, showOriginal: 'Vis original', showTranslation: 'Vis oversættelse' },
  en: { translated: name => `Translated from ${name}`, original: name => `Original (${name})`, showOriginal: 'Show original', showTranslation: 'Show translation' },
  fi: { translated: name => `Käännetty (${name})`, original: name => `Alkuperäinen (${name})`, showOriginal: 'Näytä alkuperäinen', showTranslation: 'Näytä käännös' },
  sv: { translated: name => `Översatt från ${name}`, original: name => `Original (${name})`, showOriginal: 'Visa original', showTranslation: 'Visa översättning' },
}

/** "Oversat fra finsk · Vis original" under content that was shown in another language than it was written in. */
export function TranslationNote({ className }: { className?: string }) {
  const scope = useTranslationScope()
  const { language } = useLanguage()
  if (!scope?.from) return null
  const labels = TRANSLATION_NOTE[language] ?? TRANSLATION_NOTE.da
  const name = (NAMES[language] ?? NAMES.da)[scope.from]
  const onClick = (event: MouseEvent) => { event.stopPropagation(); scope.toggle() }
  return (
    <p className={cn('flex flex-wrap items-center gap-1 text-xs text-muted-foreground', className)} data-translation-note={scope.from}>
      <Translate size={12} aria-hidden="true" />
      <span>{scope.showOriginal ? labels.original(name) : labels.translated(name)}</span>
      <span aria-hidden="true">·</span>
      <button type="button" className="font-medium text-primary hover:underline" onClick={onClick}>
        {scope.showOriginal ? labels.showTranslation : labels.showOriginal}
      </button>
    </p>
  )
}
