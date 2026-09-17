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

describe('Finnish UI translations', () => {
  it('contains every English translation key', () => {
    const englishKeys = leafEntries(translations.en).map(([key]) => key)
    const finnishKeys = leafEntries(translations.fi).map(([key]) => key)
    expect(finnishKeys).toEqual(englishKeys)
  })

  it('preserves interpolation placeholders', () => {
    const finnish = new Map(leafEntries(translations.fi))
    for (const [key, english] of leafEntries(translations.en)) {
      expect(placeholders(finnish.get(key) || ''), key).toEqual(placeholders(english))
    }
  })
})
