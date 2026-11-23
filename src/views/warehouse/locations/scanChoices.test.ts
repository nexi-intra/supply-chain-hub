import { describe, expect, it } from 'vitest'
import type { LocationSearch } from '@/types/warehouse'
import { enterChoice, enterOnSearch, nextUnsaved, openWhenReady, youngerThanOldest } from './scanChoices'

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

const found = (part: Partial<LocationSearch>): LocationSearch => ({ materials: [], locations: [], pallets: [], racks: [], ...part })
const oneMaterial = found({ materials: [{ material: 'R162-0717', description: '' }] })
const oneRack = found({ racks: ['E9'] })
const twoMaterials = found({ materials: [{ material: 'R162-0717', description: '' }, { material: 'R162-0800', description: '' }] })

describe('enterOnSearch and openWhenReady (front-page search Enter)', () => {
  it('opens the single hit at once when the result belongs to the text', () => {
    expect(enterOnSearch({ query: 'R162-0717', found: oneMaterial }, 'R162-0717')).toEqual({ open: { kind: 'material', id: 'R162-0717' }, waitFor: null })
  })

  it('opens nothing when the result for the text has several hits or none', () => {
    expect(enterOnSearch({ query: 'R162', found: twoMaterials }, 'R162')).toEqual({ open: null, waitFor: null })
    expect(enterOnSearch({ query: 'X', found: found({}) }, 'X')).toEqual({ open: null, waitFor: null })
  })

  it('never opens the hit of the previous text: it waits for the result of this one', () => {
    expect(enterOnSearch({ query: 'E9', found: oneRack }, 'R162-0717')).toEqual({ open: null, waitFor: 'R162-0717' })
    expect(enterOnSearch(null, 'R162-0717')).toEqual({ open: null, waitFor: 'R162-0717' })
  })

  it('opens when the right result comes, only with exactly one hit', () => {
    expect(openWhenReady('R162-0717', { query: 'R162-0717', found: oneMaterial })).toEqual({ open: { kind: 'material', id: 'R162-0717' }, waitFor: null })
    expect(openWhenReady('R162', { query: 'R162', found: twoMaterials })).toEqual({ open: null, waitFor: null })
  })

  it('keeps waiting while an older result comes, and does nothing when no Enter is waiting', () => {
    expect(openWhenReady('R162-0717', { query: 'E9', found: oneRack })).toEqual({ open: null, waitFor: 'R162-0717' })
    expect(openWhenReady(null, { query: 'E9', found: oneRack })).toEqual({ open: null, waitFor: null })
  })
})
describe('youngerThanOldest (Tag and Fyld op ask before a younger pallet)', () => {
  const reserve = [{ id: 'p1', receivedAt: 100 }, { id: 'p2', receivedAt: 200 }, { id: 'p3', receivedAt: 100 }]

  it('asks when the chosen pallet was received later than the oldest reserve pallet', () => {
    expect(youngerThanOldest(reserve, reserve[1])).toBe(true)
  })

  it('does not ask for the oldest itself, for one received the same day, or without reserve pallets', () => {
    expect(youngerThanOldest(reserve, reserve[0])).toBe(false)
    expect(youngerThanOldest(reserve, reserve[2])).toBe(false)
    expect(youngerThanOldest([], reserve[1])).toBe(false)
  })
})
describe('nextUnsaved (Læg på hylde with a 49/50 number of several materials)', () => {
  it('starts with the first material that is not saved yet', () => {
    expect(nextUnsaved(3, [], null)).toBe(0)
    expect(nextUnsaved(3, [0], null)).toBe(1)
  })

  it('after a save, preselects the next one not saved, going round to the start', () => {
    expect(nextUnsaved(3, [0], 0)).toBe(1)
    expect(nextUnsaved(3, [0, 1], 1)).toBe(2)
    expect(nextUnsaved(3, [1, 2], 2)).toBe(0)
  })

  it('is null when all are done', () => {
    expect(nextUnsaved(3, [0, 1, 2], 2)).toBeNull()
    expect(nextUnsaved(0, [], null)).toBeNull()
  })
})