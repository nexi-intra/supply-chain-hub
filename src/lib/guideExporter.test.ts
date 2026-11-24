import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Guide } from './guideTypes'
import { chooseAndSaveExportRoot, exportOriginalGuideToLibrary } from './guideExporter'

const originalGuide: Guide = {
  id: 'original', title: 'Status', category: 'General', tags: [], content: '',
  createdAt: 1, updatedAt: 2, sections: [], preserveWordLayout: true,
  fileUrl: 'kv://original', wordFileName: 'status.docx', version: '1.00',
}

afterEach(() => vi.unstubAllGlobals())

describe('exportOriginalGuideToLibrary', () => {
  it('exports the exact original DOCX bytes without generating a new document', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 99, 42])
    const exportDocx = vi.fn().mockResolvedValue('saved.docx')
    vi.stubGlobal('window', { electronGuides: { exportDocx } })
    const loadFile = vi.fn().mockResolvedValue(new Blob([bytes]))

    expect(await exportOriginalGuideToLibrary(originalGuide, 'C:\\guides', loadFile)).toBe('saved.docx')
    expect(loadFile).toHaveBeenCalledWith('kv://original')
    const request = exportDocx.mock.calls[0][0]
    expect(request).toMatchObject({ root: 'C:\\guides', category: 'General' })
    expect(request.fileName).toMatch(/\.docx$/)
    expect(new Uint8Array(request.data)).toEqual(bytes)
  })

  it('refuses missing original attachments', async () => {
    await expect(exportOriginalGuideToLibrary({ ...originalGuide, fileUrl: undefined }, 'C:\\guides')).rejects.toThrow()
  })
})
describe('chooseAndSaveExportRoot', () => {
  it('returns the chosen folder without waiting for the slow settings write', async () => {
    const set = vi.fn(() => new Promise<void>(() => {}))
    vi.stubGlobal('window', { kv: { set }, electronGuides: { chooseExportDir: vi.fn().mockResolvedValue('C:\\guides') } })
    expect(await chooseAndSaveExportRoot('guides')).toBe('C:\\guides')
    expect(set).toHaveBeenCalledWith('guide-library-settings', { exportRoot: 'C:\\guides' })
  })

  it('reports a failed settings write through the callback', async () => {
    const onSaveFailed = vi.fn()
    vi.stubGlobal('window', { kv: { set: vi.fn().mockRejectedValue(new Error('drive offline')) }, electronGuides: { chooseExportDir: vi.fn().mockResolvedValue('C:\\guides') } })
    expect(await chooseAndSaveExportRoot('knowledge', onSaveFailed)).toBe('C:\\guides')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSaveFailed).toHaveBeenCalledOnce()
  })

  it('does not write anything when the folder dialog is cancelled', async () => {
    const set = vi.fn()
    vi.stubGlobal('window', { kv: { set }, electronGuides: { chooseExportDir: vi.fn().mockResolvedValue(null) } })
    expect(await chooseAndSaveExportRoot()).toBeNull()
    expect(set).not.toHaveBeenCalled()
  })
})