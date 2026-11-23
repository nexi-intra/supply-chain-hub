import { describe, expect, it } from 'vitest'
import { enterChoice } from './scanChoices'

const list = (...codes: string[]) => codes.map(material => ({ material, description: '' }))

describe('enterChoice (MaterialPicker Enter)', () => {
  it('takes the scanned number, not a highlighted suggestion that belongs to an earlier text', () => {
    expect(enterChoice({ value: 'R162-0999', suggestions: list('R162-0717', 'R162-0800'), suggestionsFor: 'R162', active: 0, open: true, moved: false })).toBe('R162-0999')
  })

  it('does not take a lone stale suggestion either', () => {
    expect(enterChoice({ value: 'R162-0999', suggestions: list('R162-0717'), suggestionsFor: 'R162', active: 0, open: false, moved: false })).toBe('R162-0999')
  })

  it('takes the highlighted suggestion when the suggestions belong to the text', () => {
    expect(enterChoice({ value: 'kabel', suggestions: list('R162-0717', 'R162-0800'), suggestionsFor: 'kabel', active: 1, open: true, moved: false })).toBe('R162-0800')
  })

  it('takes the highlighted suggestion when the user moved to it with the arrow keys', () => {
    expect(enterChoice({ value: 'R162 ', suggestions: list('R162-0717', 'R162-0800'), suggestionsFor: 'R16', active: 1, open: true, moved: true })).toBe('R162-0800')
  })

  it('an exact number in the list wins, and a single suggestion for the text is taken', () => {
    expect(enterChoice({ value: 'r162-0800', suggestions: list('R162-0717', 'R162-0800'), suggestionsFor: 'r162-0800', active: 0, open: true, moved: false })).toBe('R162-0800')
    expect(enterChoice({ value: 'ethernet', suggestions: list('R162-0717'), suggestionsFor: 'ethernet', active: 0, open: false, moved: false })).toBe('R162-0717')
  })

  it('takes the typed value in capitals when nothing fits, and nothing for an empty field', () => {
    expect(enterChoice({ value: ' r162-0999 ', suggestions: [], suggestionsFor: null, active: 0, open: false, moved: false })).toBe('R162-0999')
    expect(enterChoice({ value: '  ', suggestions: list('R162-0717'), suggestionsFor: 'R162', active: 0, open: true, moved: false })).toBeNull()
  })
})
