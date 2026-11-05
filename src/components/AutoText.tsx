import { useEffect, useId, type ElementType, type ComponentPropsWithoutRef } from 'react'
import { useAutoTranslation } from '@/lib/useAutoTranslate'
import { useTranslationScope } from '@/components/TranslationScope'
import type { GuideLanguage } from '@/lib/translator'

type AutoTextProps<T extends ElementType> = {
  text?: string | null
  /** Kendt kildesprog (fx 'da' for faste UI-tekster); ellers detekteres sproget. */
  from?: GuideLanguage
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, 'children' | 'as'>

/** Renderer der viser `text` auto-oversat til appens valgte sprog. Se useAutoTranslate. */
export function AutoText<T extends ElementType = 'span'>({ text, from, as, ...rest }: AutoTextProps<T>) {
  const Component = (as || 'span') as ElementType
  const translation = useAutoTranslation(text, from)
  const scope = useTranslationScope()
  const id = useId()
  const report = scope?.report
  useEffect(() => {
    if (!report) return
    report(id, translation.from)
    return () => report(id, null)
  }, [report, id, translation.from])
  return <Component {...rest}>{scope?.showOriginal ? (text ?? '') : translation.text}</Component>
}
