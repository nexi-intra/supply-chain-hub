import { describe, expect, it } from 'vitest'
import { translations } from './translations'

function leafEntries(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]]
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    leafEntries(child, prefix ? `${prefix}.${key}` : key)
  )
}

function placeholders(value: string) {
  return value.match(/\{[^{}]+\}/g) || []
}

describe.each(['fi', 'sv'] as const)('%s UI translations', language => {
  it('exists as a selectable language', () => {
    expect(Object.keys(translations)).toContain(language)
  })

  it('contains every English translation key', () => {
    const englishKeys = leafEntries(translations.en).map(([key]) => key)
    const localKeys = leafEntries((translations as Record<string, unknown>)[language]).map(([key]) => key)
    expect(localKeys).toEqual(englishKeys)
  })

  it('preserves interpolation placeholders', () => {
    const local = new Map(leafEntries((translations as Record<string, unknown>)[language]))
    for (const [key, english] of leafEntries(translations.en)) {
      expect(placeholders(local.get(key) || ''), key).toEqual(placeholders(english))
    }
  })
})
