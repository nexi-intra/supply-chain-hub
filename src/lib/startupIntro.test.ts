import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissStartupIntro } from './startupIntro'

const root = join(__dirname, '..', '..')
const html = readFileSync(join(root, 'index.html'), 'utf8')
const introStart = html.indexOf('<div id="startup-intro"')
const intro = html.slice(html.indexOf('<style id="startup-intro-style">'), html.indexOf('<div id="root">'))

describe('the startup intro markup', () => {
  it('index.html shows the intro before the app code', () => {
    expect(introStart).toBeGreaterThan(-1)
    expect(introStart).toBeLessThan(html.indexOf('<div id="root">'))
    expect(html.slice(introStart, introStart + 120)).toContain('aria-hidden="true"')
    expect(intro).toMatch(/#startup-intro\s*\{[^}]*pointer-events:\s*none/)
  })

  it('fetches nothing from outside and stays small', () => {
    expect(html.split('http://www.w3.org/2000/svg').join('')).not.toMatch(/https?:\/\//)
    expect(Buffer.byteLength(intro)).toBeLessThan(40 * 1024)
  })

  it('every item flies in', () => {
    const items = [...intro.matchAll(/data-item="([a-z0-9]+)"/g)].map(match => match[1])
    expect(items).toEqual(['lane3600', 'move3500', 'n950', 'x70', 'p70', 'document', 'calendar', 'mail', 'guide', 'parcel'])
  })

  it('reduced motion keeps the logo still', () => {
    expect(intro).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.si-item[^}]*animation:\s*none/)
  })

  it('the window starts midnight blue', () => {
    expect(readFileSync(join(root, 'electron', 'main.cjs'), 'utf8')).toContain("backgroundColor: '#0B1422'")
  })
})

function fakeIntro() {
  const classes = new Set<string>()
  const listeners: Record<string, Array<() => void>> = {}
  let present = true
  const element = {
    classList: { add: (name: string) => classes.add(name), contains: (name: string) => classes.has(name) },
    addEventListener: (type: string, listener: () => void) => { (listeners[type] ??= []).push(listener) },
    remove: vi.fn(() => { present = false }),
  }
  const doc = { getElementById: (id: string) => (id === 'startup-intro' && present ? element : null) }
  return { element, classes, doc: doc as unknown as Pick<Document, 'getElementById'>, fire: (type: string) => listeners[type]?.forEach(listener => listener()) }
}

describe('dismissStartupIntro', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fades the intro out and removes it', () => {
    const intro = fakeIntro()
    dismissStartupIntro(intro.doc)
    expect(intro.classes.has('is-leaving')).toBe(true)
    expect(intro.element.remove).not.toHaveBeenCalled()
    intro.fire('transitionend')
    expect(intro.element.remove).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(intro.element.remove).toHaveBeenCalledTimes(1)
  })

  it('removes it even if no transition event comes', () => {
    const intro = fakeIntro()
    dismissStartupIntro(intro.doc)
    vi.advanceTimersByTime(599)
    expect(intro.element.remove).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(intro.element.remove).toHaveBeenCalledTimes(1)
  })

  it('calling it twice or without an intro does nothing more', () => {
    const intro = fakeIntro()
    dismissStartupIntro(intro.doc)
    dismissStartupIntro(intro.doc)
    vi.advanceTimersByTime(1000)
    expect(intro.element.remove).toHaveBeenCalledTimes(1)
    expect(() => dismissStartupIntro({ getElementById: () => null })).not.toThrow()
  })
})

describe('the intro wiring', () => {
  it('the app, the error screen and a 30 s fail-safe all dismiss the intro', () => {
    expect(readFileSync(join(root, 'src', 'App.tsx'), 'utf8')).toContain('dismissStartupIntro()')
    expect(readFileSync(join(root, 'src', 'ErrorFallback.tsx'), 'utf8')).toContain('dismissStartupIntro()')
    expect(html).toMatch(/setTimeout\([\s\S]*is-leaving[\s\S]*30000\)/)
  })
})