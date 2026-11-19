import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { LIBRARY_KEYS, type LibraryKind } from '@/lib/libraryConfig'
import { adaptLibraryText, adaptLibraryTranslations } from '@/lib/libraryTerms'

const LibraryKindContext = createContext<LibraryKind>('guides')

export function LibraryProvider({ kind, children }: { kind: LibraryKind; children: ReactNode }) {
  return <LibraryKindContext.Provider value={kind}>{children}</LibraryKindContext.Provider>
}

export function useLibraryKind(): LibraryKind {
  return useContext(LibraryKindContext)
}

/** useLanguage() for the shared library components: same shape, plus storage keys and Knowledge Base wording. */
export function useLibraryLanguage() {
  const context = useLanguage()
  const kind = useLibraryKind()
  return useMemo(() => ({
    ...context,
    kind,
    keys: LIBRARY_KEYS[kind],
    t: adaptLibraryTranslations(context.t, context.language, kind),
    lt: (text: string) => adaptLibraryText(text, context.language, kind),
  }), [context, kind])
}
