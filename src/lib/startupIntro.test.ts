import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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
    expect(html.replaceAll('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//)
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
