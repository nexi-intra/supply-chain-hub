import { describe, it, expect } from 'vitest'
import { importGuideFromDocx, isTocHeading } from './docxImporter'
import JSZip from 'jszip'

describe('original Word import', () => {
  it('preserves the original file without converting its layout', async () => {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types/>')
    zip.file('word/document.xml', '<document><table/></document>')
    const file = new File([await zip.generateAsync({ type: 'uint8array' })], 'status-guide.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const draft = await importGuideFromDocx(file, undefined, { preserveOriginal: true, language: 'en' })
    expect(draft).toMatchObject({ title: 'status guide', sections: [], originalFile: file, preserveWordLayout: true, language: 'en' })
  })

  it('rejects old Word format even when preserving the original', async () => {
    await expect(importGuideFromDocx(new File(['old'], 'old.doc'), undefined, { preserveOriginal: true })).rejects.toThrow('.docx')
  })
})

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
