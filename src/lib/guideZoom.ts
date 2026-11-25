// Zoom of an open guide (GuideViewer). Remembered per PC; Chrome's own zoom steps.

export const GUIDE_ZOOM_STEPS: readonly number[] = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300]
export const GUIDE_ZOOM_DEFAULT = 100

const STORAGE_KEY = 'guide-viewer-zoom'

export function readGuideZoom(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return GUIDE_ZOOM_STEPS.includes(stored) ? stored : GUIDE_ZOOM_DEFAULT
  } catch {
    return GUIDE_ZOOM_DEFAULT
  }
}

export function saveGuideZoom(zoom: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(zoom)) } catch { /* only a convenience */ }
}

export function stepGuideZoom(zoom: number, direction: 1 | -1): number {
  const next = direction === 1
    ? GUIDE_ZOOM_STEPS.find(step => step > zoom)
    : [...GUIDE_ZOOM_STEPS].reverse().find(step => step < zoom)
  return next ?? (direction === 1 ? GUIDE_ZOOM_STEPS[GUIDE_ZOOM_STEPS.length - 1] : GUIDE_ZOOM_STEPS[0])
}

interface ZoomKeyEvent {
  ctrlKey: boolean
  metaKey?: boolean
  altKey?: boolean
  key: string
  target?: EventTarget | null
}

function isEditable(target: EventTarget | null | undefined): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null | undefined
  if (!element) return false
  return element.isContentEditable === true || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT'
}

export function guideZoomShortcut(event: ZoomKeyEvent): 'in' | 'out' | 'reset' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditable(event.target)) return null
  if (event.key === '+' || event.key === '=') return 'in'
  if (event.key === '-') return 'out'
  if (event.key === '0') return 'reset'
  return null
}

// Chrome's PDF viewer reads its start zoom from the address fragment.
export function guideZoomPdfUrl(url: string, zoom: number): string {
  return `${url.split('#')[0]}#zoom=${zoom}`
}
