import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { validateDocx } from './validateDocx'

describe('validateDocx', () => {
  it('accepts a DOCX with the required Word package parts', async () => {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types/>')
    zip.file('word/document.xml', '<document/>')
    const file = new File([await zip.generateAsync({ type: 'uint8array' })], 'guide.docx')
    await expect(validateDocx(file)).resolves.toBeUndefined()
  })

  it('rejects arbitrary files and non-Word ZIPs', async () => {
    await expect(validateDocx(new File(['not a zip'], 'guide.docx'))).rejects.toThrow('gyldigt Word')
    const zip = new JSZip()
    zip.file('notes.txt', 'hello')
    await expect(validateDocx(new File([await zip.generateAsync({ type: 'uint8array' })], 'guide.docx'))).rejects.toThrow('gyldigt Word')
    await expect(validateDocx(new File(['old'], 'guide.doc'))).rejects.toThrow('.docx')
  })
})