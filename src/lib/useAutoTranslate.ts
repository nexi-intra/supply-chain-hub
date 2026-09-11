// App-wide auto-oversættelse af brugerindhold (projekter, madplan, mails, m.fl.).
// Original tekst i lageret røres aldrig — kun det der vises på skærmen oversættes,
// via samme Bergamot/ordbog-kæde som guiderne bruger (se translator.ts).
import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { translateTextAsync, detectLanguage, type GuideLanguage } from '@/lib/translator'

// Delt cache på tværs af hele appen så samme tekst ikke oversættes flere gange.
const cache = new Map<string, string>()

function cacheKey(from: GuideLanguage, to: GuideLanguage, text: string): string {
  return `${from}>${to}:${text}`
}

/**
 * Returnerer `text` oversat til appens aktuelle sprog, hvis det afviger fra det
 * detekterede kildesprog. Viser originalen mens oversættelsen (neural, async) kører.
 */
export function useAutoTranslate(text: string | undefined | null): string {
  const { language } = useLanguage()
  const original = text ?? ''
  const [translated, setTranslated] = useState(original)

  useEffect(() => {
    if (!original.trim()) {
      setTranslated(original)
      return
    }
    const target = (language || 'da') as GuideLanguage
    const source = detectLanguage(original, target)
    if (source === target) {
      setTranslated(original)
      return
    }
    const key = cacheKey(source, target, original)
    const cached = cache.get(key)
    if (cached !== undefined) {
      setTranslated(cached)
      return
    }
    let cancelled = false
    setTranslated(original)
    translateTextAsync(original, source, target).then((result) => {
      if (cancelled) return
      cache.set(key, result.text)
      setTranslated(result.text)
    }).catch((error) => {
      console.error('Auto-oversættelse fejlede, viser original tekst:', error)
    })
    return () => {
      cancelled = true
    }
  }, [original, language])

  return translated
}
