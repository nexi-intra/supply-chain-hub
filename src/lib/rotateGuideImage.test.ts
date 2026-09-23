import { afterEach, describe, expect, it, vi } from 'vitest'
import { rotateGuideImage } from './rotateGuideImage'

afterEach(() => vi.unstubAllGlobals())

describe('rotateGuideImage', () => {
  it('swaps dimensions, rotates clockwise and returns a new PNG', async () => {
    const close = vi.fn()
    const translate = vi.fn()
    const rotate = vi.fn()
    const drawImage = vi.fn()
    const bitmap = { width: 120, height: 80, close }
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ translate, rotate, drawImage }),
      toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(['rotated'], { type: 'image/png' })),
    }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.stubGlobal('document', { createElement: () => canvas })

    const result = await rotateGuideImage(new Blob(['original']))

    expect(canvas).toMatchObject({ width: 80, height: 120 })
    expect(translate).toHaveBeenCalledWith(80, 0)
    expect(rotate).toHaveBeenCalledWith(Math.PI / 2)
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0)
    expect(result.type).toBe('image/png')
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes the bitmap when conversion fails', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1, height: 1, close }))
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })

    await expect(rotateGuideImage(new Blob(['invalid']))).rejects.toThrow('Billedet kunne ikke roteres')
    expect(close).toHaveBeenCalledOnce()
  })
})