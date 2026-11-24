import { describe, expect, it } from 'vitest'
import { parcelLabels } from './labels'

describe('Parcel Pilot-tekster', () => {
  it('har samme spilnavn og oversatte zoner på dansk, engelsk og finsk', () => {
    expect(parcelLabels('da').menu.title).toBe('Parcel Pilot')
    expect(parcelLabels('en').menu.title).toBe('Parcel Pilot')
    expect(parcelLabels('fi').menu.title).toBe('Parcel Pilot')
    expect(parcelLabels('da').zone(4)).toBe('Zone 4 · Stormen')
    expect(parcelLabels('en').zone(5)).toBe('Zone 5 · The Harbour')
    expect(parcelLabels('fi').zone(3)).toBe('Vyöhyke 3 · Revontulet')
  })

  it('formaterer point efter sproget og falder tilbage til dansk', () => {
    expect(parcelLabels('da').points(12500)).toBe('12.500')
    expect(parcelLabels('en').points(12500)).toBe('12,500')
    expect(parcelLabels('xx').readyHint).toBe(parcelLabels('da').readyHint)
  })
})
