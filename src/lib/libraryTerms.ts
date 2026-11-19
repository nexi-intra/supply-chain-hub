import type { Language } from './translations'
import type { LibraryKind } from './libraryConfig'

// Translation namespaces rendered by the shared Guide Library components.
export const LIBRARY_TEXT_NAMESPACES = ['guideLibrary', 'guideCard', 'guideEditor', 'guideViewer', 'guideImportStatus', 'categoryManager'] as const

const KNOWLEDGE_BASE = 'Knowledge Base'
type Rule = { pattern: RegExp; to: string; fixed?: boolean }
const rule = (from: string, to: string, fixed = false): Rule => ({ pattern: new RegExp(`(?<!\\p{L})${from}(?!\\p{L})`, 'giu'), to, fixed })

// Longest forms first so inflected words are never split by a shorter rule.
const KNOWLEDGE_RULES: Record<Language, Rule[]> = {
  da: [
    rule('guide ?bibliotek(?:ets|et)?', KNOWLEDGE_BASE, true),
    rule('guidenes', 'vidensartiklernes'), rule('guidene', 'vidensartiklerne'), rule('guiderne', 'vidensartiklerne'), rule('guidens', 'vidensartiklens'),
    rule('guiden', 'vidensartiklen'), rule('guides', 'vidensartikler'), rule('guider', 'vidensartikler'), rule('guide', 'vidensartikel'),
  ],
  en: [
    rule('guide library', KNOWLEDGE_BASE, true),
    rule('a guide', 'an article'), rule("guide's", "article's"), rule('guides', 'articles'), rule('guide', 'article'),
  ],
  sv: [
    rule('guide ?bibliotek(?:ets|et)?', KNOWLEDGE_BASE, true),
    rule('guidernas', 'artiklarnas'), rule('guiderna', 'artiklarna'), rule('guider', 'artiklar'),
    rule('guidens', 'artikelns'), rule('guiden', 'artikeln'), rule('guide', 'artikel'),
  ],
  fi: [
    rule('opaskirjasto\\p{L}*', KNOWLEDGE_BASE, true),
    rule('oppaiden', 'artikkeleiden'), rule('oppaisiin', 'artikkeleihin'), rule('oppaissa', 'artikkeleissa'), rule('oppaista', 'artikkeleista'),
    rule('oppaille', 'artikkeleille'), rule('oppaita', 'artikkeleita'), rule('oppaaseen', 'artikkeliin'), rule('oppaassa', 'artikkelissa'),
    rule('oppaasta', 'artikkelista'), rule('oppaalle', 'artikkelille'), rule('oppaana', 'artikkelina'), rule('oppaaksi', 'artikkeliksi'),
    rule('oppaan', 'artikkelin'), rule('oppaat', 'artikkelit'), rule('opasta', 'artikkelia'), rule('opas', 'artikkeli'),
  ],
}

const matchCase = (source: string, target: string) => source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()
  ? target[0].toUpperCase() + target.slice(1)
  : target

export function adaptLibraryText(text: string, language: Language, kind: LibraryKind): string {
  if (kind === 'guides' || !text) return text
  return KNOWLEDGE_RULES[language].reduce((result, { pattern, to, fixed }) => result.replace(pattern, (match) => fixed ? to : matchCase(match, to)), text)
}

function adaptDeep<T>(value: T, language: Language): T {
  if (typeof value === 'string') return adaptLibraryText(value, language, 'knowledge') as T
  if (Array.isArray(value)) return value.map((item) => adaptDeep(item, language)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, adaptDeep(item, language)])) as T
  return value
}

const adaptedCache = new WeakMap<object, unknown>()

export function adaptLibraryTranslations<T extends object>(t: T, language: Language, kind: LibraryKind): T {
  if (kind === 'guides') return t
  const cached = adaptedCache.get(t)
  if (cached) return cached as T
  const source = t as Record<string, unknown>
  const adapted = { ...source }
  for (const namespace of LIBRARY_TEXT_NAMESPACES) if (namespace in source) adapted[namespace] = adaptDeep(source[namespace], language)
  adaptedCache.set(t, adapted)
  return adapted as T
}
