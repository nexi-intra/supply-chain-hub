import { describe, it, expect } from 'vitest'
import { isTocHeading } from './docxImporter'

describe('isTocHeading', () => {
  it('genkender Words egne indholdsfortegnelse-overskrifter', () => {
    for (const heading of ['Indholdsfortegnelse', 'Indhold', 'INDHOLDSFORTEGNELSE', 'Table of Contents', 'Contents', 'Sisällysluettelo']) {
      expect(isTocHeading(heading), heading).toBe(true)
    }
  })

  it('tager nummerering og kolon med', () => {
    expect(isTocHeading('1. Indholdsfortegnelse')).toBe(true)
    expect(isTocHeading('Indhold:')).toBe(true)
  })

  it('rører ikke rigtige afsnit der blot nævner indhold', () => {
    for (const heading of ['Indhold i pakken', 'Sådan opdaterer du indholdet', 'Contents of the shipment', 'Formål']) {
      expect(isTocHeading(heading), heading).toBe(false)
    }
  })
})
