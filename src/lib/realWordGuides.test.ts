import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { importGuideFromDocx } from './docxImporter'
import { exportOriginalGuideToLibrary } from './guideExporter'
import { fileStorage } from './fileStorage'
import type { Guide } from './guideTypes'

const sampleDirectory = process.env.REAL_GUIDE_DOCX_DIR
const samples = sampleDirectory ? readdirSync(sampleDirectory).filter((name) => name.toLowerCase().endsWith('.docx')) : []

afterEach(() => vi.unstubAllGlobals())

describe.skipIf(samples.length === 0)('real Word guide round-trip', () => {
  it.each(samples)('preserves every byte of %s through import, storage and export', async (name) => {
    const bytes = readFileSync(join(sampleDirectory!, name))
    const entries = new Map<string, unknown>()
    const exportDocx = vi.fn(async (payload: { data: ArrayBuffer }) => {
      expect(Buffer.compare(Buffer.from(payload.data), bytes)).toBe(0)
      return 'saved.docx'
    })
    vi.stubGlobal('window', {
      kv: {
        set: async (key: string, value: unknown) => { entries.set(key, value) },
        get: async (key: string) => entries.get(key),
        delete: async (key: string) => { entries.delete(key) },
      },
      electronGuides: { exportDocx },
    })
    const source = new File([new Uint8Array(bytes)], name)
    const draft = await importGuideFromDocx(source, undefined, { preserveOriginal: true })
    expect(draft.preserveWordLayout).toBe(true)
    expect(draft.sections).toEqual([])

    const stored = await fileStorage.uploadFile(draft.originalFile)
    expect(Buffer.compare(Buffer.from(await (await fileStorage.downloadFile(stored.url)).arrayBuffer()), bytes)).toBe(0)
    const guide = {
      id: 'real-guide', title: draft.title, category: 'General', tags: [], content: '',
      createdAt: 1, updatedAt: 1, sections: [], fileUrl: stored.url,
      wordFileName: name, preserveWordLayout: true, version: '1.00',
    } satisfies Guide
    expect(await exportOriginalGuideToLibrary(guide, 'local-test')).toBe('saved.docx')
    expect(exportDocx).toHaveBeenCalledOnce()
  }, 30000)

  it.each(samples)('stores the real PDF preview for %s without changing its bytes', async (name) => {
    const pdfPath = join(process.env.REAL_GUIDE_PDF_DIR || '', name.replace(/\.docx$/i, '.pdf'))
    if (!process.env.REAL_GUIDE_PDF_DIR || !existsSync(pdfPath)) return
    const pdfBytes = readFileSync(pdfPath)
    const entries = new Map<string, unknown>()
    vi.stubGlobal('window', { kv: {
      set: async (key: string, value: unknown) => { entries.set(key, value) },
      get: async (key: string) => entries.get(key),
      delete: async (key: string) => { entries.delete(key) },
    } })
    const saved = await fileStorage.uploadPdf(new File([new Uint8Array(pdfBytes)], `${name}.pdf`, { type: 'application/pdf' }))
    const restored = await fileStorage.downloadFile(saved.url)
    expect(restored.type).toBe('application/pdf')
    expect(Buffer.compare(Buffer.from(await restored.arrayBuffer()), pdfBytes)).toBe(0)
    await expect(fileStorage.uploadPdf(new File([new Uint8Array([1, 2])], 'invalid.pdf', { type: 'application/pdf' }))).rejects.toThrow('gyldig PDF')
  })
})