import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GUIDE_ZOOM_DEFAULT, createGuideZoomWheel, guideZoomPdfUrl, guideZoomShortcut, readGuideZoom, saveGuideZoom, stepGuideZoom, subscribeGuideZoom } from './guideZoom'

const KEY = 'guide-viewer-zoom'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('guideZoom', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('steps up and down along the fixed steps', () => {
    expect(stepGuideZoom(100, 1)).toBe(110)
    expect(stepGuideZoom(100, -1)).toBe(90)
    expect(stepGuideZoom(67, -1)).toBe(50)
  })

  it('stays within bounds', () => {
    expect(stepGuideZoom(300, 1)).toBe(300)
    expect(stepGuideZoom(50, -1)).toBe(50)
  })

  it('remembers the zoom', () => {
    saveGuideZoom(150)
    expect(readGuideZoom()).toBe(150)
  })

  it('falls back to 100 for invalid stored values', () => {
    expect(readGuideZoom()).toBe(GUIDE_ZOOM_DEFAULT)
    for (const stored of ['abc', '999', '-5', '115']) {
      localStorage.setItem(KEY, stored)
      expect(readGuideZoom()).toBe(100)
    }
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('storage unavailable') } })
    expect(readGuideZoom()).toBe(100)
  })

  it('maps keyboard shortcuts', () => {
    expect(guideZoomShortcut({ ctrlKey: true, key: '+' })).toBe('in')
    expect(guideZoomShortcut({ ctrlKey: true, key: '=' })).toBe('in')
    expect(guideZoomShortcut({ ctrlKey: true, key: '-' })).toBe('out')
    expect(guideZoomShortcut({ ctrlKey: true, key: '0' })).toBe('reset')
    expect(guideZoomShortcut({ ctrlKey: false, key: '+' })).toBeNull()
    expect(guideZoomShortcut({ ctrlKey: true, altKey: true, key: '+' })).toBeNull()
    expect(guideZoomShortcut({ ctrlKey: true, key: 'a' })).toBeNull()
  })

  it('ignores shortcuts in editable targets', () => {
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
      expect(guideZoomShortcut({ ctrlKey: true, key: '+', target: target as unknown as EventTarget })).toBeNull()
    }
    expect(guideZoomShortcut({ ctrlKey: true, key: '+', target: { tagName: 'DIV' } as unknown as EventTarget })).toBe('in')
  })

  it('adds the zoom to a PDF address', () => {
    expect(guideZoomPdfUrl('blob:x/1', 150)).toBe('blob:x/1#zoom=150')
    expect(guideZoomPdfUrl('blob:x/1#page=2', 80)).toBe('blob:x/1#zoom=80')
  })

  it('steps once per notch but collects small touchpad deltas', () => {
    const wheel = createGuideZoomWheel()
    expect(wheel(-100)).toBe(1)
    expect(wheel(120)).toBe(-1)
    const steps = Array.from({ length: 30 }, () => wheel(-4)).filter(step => step !== 0)
    expect(steps).toEqual([1])
  })

  it('tells every open viewer when the zoom changes', () => {
    const seen: number[] = []
    const unsubscribe = subscribeGuideZoom(() => seen.push(readGuideZoom()))
    saveGuideZoom(150)
    unsubscribe()
    saveGuideZoom(200)
    expect(seen).toEqual([150])
  })
})
