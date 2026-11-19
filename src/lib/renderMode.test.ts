import { describe, expect, it, vi } from 'vitest'
import { applyRenderMode, isSoftwareRendering } from './renderMode'

const UNMASKED_RENDERER = 0x9246
const RENDERER = 0x1f01

function canvasWith(renderer: string | null, { debugInfo = true } = {}) {
  const loseContext = vi.fn()
  const gl = renderer === null ? null : {
    RENDERER,
    getParameter: (name: number) => (name === UNMASKED_RENDERER || name === RENDERER ? renderer : null),
    getExtension: (name: string) => (name === 'WEBGL_debug_renderer_info' && debugInfo ? { UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER } : name === 'WEBGL_lose_context' ? { loseContext } : null),
  }
  return { canvas: () => ({ getContext: () => gl }), loseContext }
}

describe('isSoftwareRendering', () => {
  it('treats a real GPU as hardware and releases the probe context', () => {
    const probe = canvasWith('ANGLE (Intel, Intel(R) Arc(TM) 130V GPU (8GB) Direct3D11 vs_5_0 ps_5_0, D3D11)')
    expect(isSoftwareRendering(probe.canvas)).toBe(false)
    expect(probe.loseContext).toHaveBeenCalledOnce()
  })

  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
  ])('recognises the software rasteriser %s', renderer => {
    expect(isSoftwareRendering(canvasWith(renderer).canvas)).toBe(true)
  })

  it('treats a missing WebGL context (GPU disabled) as software', () => {
    expect(isSoftwareRendering(canvasWith(null).canvas)).toBe(true)
  })

  it('falls back to the plain renderer name without the debug extension', () => {
    expect(isSoftwareRendering(canvasWith('SwiftShader', { debugInfo: false }).canvas)).toBe(true)
    expect(isSoftwareRendering(canvasWith('WebKit WebGL', { debugInfo: false }).canvas)).toBe(false)
  })

  it('counts a probe that throws as software', () => {
    expect(isSoftwareRendering(() => { throw new Error('no canvas') })).toBe(true)
  })
})

describe('applyRenderMode', () => {
  it('marks the root element so CSS can lighten the effects', () => {
    const root = { dataset: {} as DOMStringMap }
    expect(applyRenderMode(root, () => true)).toBe('software')
    expect(root.dataset.renderMode).toBe('software')
    expect(applyRenderMode(root, () => false)).toBe('gpu')
    expect(root.dataset.renderMode).toBe('gpu')
  })
})
