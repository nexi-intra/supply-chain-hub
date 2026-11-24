import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileStorage } from './fileStorage'

afterEach(() => vi.unstubAllGlobals())

describe('fileStorage.deleteFile', () => {
  it('deletes the metadata and every chunk of an old chunked file at the same time', async () => {
    const pending: Array<() => void> = []
    const remove = vi.fn((_key: string) => new Promise<void>((resolve) => { pending.push(resolve) }))
    vi.stubGlobal('window', { kv: { get: vi.fn().mockResolvedValue({ chunkCount: 3 }), delete: remove } })
    const deletion = fileStorage.deleteFile('kv://file_1')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(remove.mock.calls.map(([key]) => key)).toEqual(['file_1_meta', 'file_1_chunk_0', 'file_1_chunk_1', 'file_1_chunk_2'])
    pending.forEach((finish) => finish())
    await deletion
  })

  it('deletes a legacy single-key file', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', { kv: { get: vi.fn().mockResolvedValue(undefined), delete: remove } })
    await fileStorage.deleteFile('kv://legacy')
    expect(remove).toHaveBeenCalledWith('legacy')
  })
})
