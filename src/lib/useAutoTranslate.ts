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
export function useAutoTranslate(text: string | undefined | null, sourceLanguage?: GuideLanguage): string {
  return useAutoTranslation(text, sourceLanguage).text
}

/**
 * Som useAutoTranslate, men fortæller også hvilket sprog teksten er oversat fra (null = ikke oversat).
 * `sourceLanguage` springer sprogdetektionen over — til faste UI-tekster hvor korte ord som "Tilbage" ellers gættes forkert.
 */
export function useAutoTranslation(text: string | undefined | null, sourceLanguage?: GuideLanguage): { text: string; from: GuideLanguage | null } {
  const { language } = useLanguage()
  const original = text ?? ''
  const [state, setState] = useState<{ text: string; from: GuideLanguage | null }>({ text: original, from: null })

  useEffect(() => {
    const untranslated = { text: original, from: null }
    if (!original.trim()) {
      setState(untranslated)
      return
    }
    const target = (language || 'da') as GuideLanguage
    const source = sourceLanguage ?? detectLanguage(original, target)
    if (source === target) {
      setState(untranslated)
      return
    }
    const show = (result: string) => setState({ text: result, from: result.trim() !== original.trim() ? source : null })
    const key = cacheKey(source, target, original)
    const cached = cache.get(key)
    if (cached !== undefined) {
      show(cached)
      return
    }
    let cancelled = false
    setState(untranslated)
    translateTextAsync(original, source, target).then((result) => {
      if (cancelled) return
      // A word-list fallback is not kept, so the neural translation replaces it once it is available.
      if (result.engine === 'neural') cache.set(key, result.text)
      show(result.text)
    }).catch((error) => {
      console.error('Auto-oversættelse fejlede, viser original tekst:', error)
    })
    return () => {
      cancelled = true
    }
  }, [original, language, sourceLanguage])

  return state
}
