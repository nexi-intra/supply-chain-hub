// Some PCs end up drawing the whole app on the CPU (no GPU compositing): measured when a second app
// instance lost the GPU cache, and it also happens with remote desktop or blocklisted drivers. Blur,
// backdrop-filter, large drop-shadows and endless ambient animations then cost a full repaint every
// frame and make the app feel sluggish. Software rendering is detected here and marked on <html> as
// data-render-mode="software", so main.css can switch those effects off.

const SOFTWARE_RENDERERS = /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software/i

type CanvasLike = { getContext(kind: string): unknown }
type WebGlLike = {
  RENDERER: number
  getParameter(name: number): unknown
  getExtension(name: string): unknown
}

/** True when WebGL is unavailable or runs on a software rasteriser. Anything unexpected counts as software. */
export function isSoftwareRendering(createCanvas: () => CanvasLike = () => document.createElement('canvas')): boolean {
  try {
    const canvas = createCanvas()
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGlLike | null
    if (!gl) return true
    const debug = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null
    const renderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
    ;(gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext()
    return SOFTWARE_RENDERERS.test(renderer)
  } catch {
    return true
  }
}

export type RenderMode = 'gpu' | 'software'

export function applyRenderMode(root: { dataset: DOMStringMap } = document.documentElement, detect: () => boolean = isSoftwareRendering): RenderMode {
  const mode: RenderMode = detect() ? 'software' : 'gpu'
  root.dataset.renderMode = mode
  return mode
}
