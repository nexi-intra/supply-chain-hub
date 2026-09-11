import type { ElementType, ComponentPropsWithoutRef } from 'react'
import { useAutoTranslate } from '@/lib/useAutoTranslate'

type AutoTextProps<T extends ElementType> = {
  text?: string | null
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, 'children' | 'as'>

/** Renderer der viser `text` auto-oversat til appens valgte sprog. Se useAutoTranslate. */
export function AutoText<T extends ElementType = 'span'>({ text, as, ...rest }: AutoTextProps<T>) {
  const Component = (as || 'span') as ElementType
  const translated = useAutoTranslate(text)
  return <Component {...rest}>{translated}</Component>
}
