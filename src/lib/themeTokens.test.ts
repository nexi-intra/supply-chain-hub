import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, '..', 'main.css'), 'utf8')
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`)
  return css.slice(start, css.indexOf('}', start))
}
const tokens = (body: string) =>
  [...body.matchAll(/(--[\w-]+|background):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)].map(([, name, l, c, h]) => ({ name, l: +l, c: +c, h: +h }))

describe('dark theme lives in the logo midnight', () => {
  it('every neutral surface and ink uses the Kæde-H midnight hue', () => {
    const neutrals = tokens(block('.dark')).filter(token => token.c < 0.07 && !token.name.startsWith('--signal'))
    expect(neutrals.length).toBeGreaterThan(15)
    for (const token of neutrals) expect(token.h, token.name).toBeGreaterThanOrEqual(255)
    for (const token of neutrals) expect(token.h, token.name).toBeLessThanOrEqual(262)
    for (const token of tokens(block('.dark body'))) expect(token.h, token.name).toBe(259)
  })

  it('Nexi indigo stays the colour of actions', () => {
    const dark = block('.dark')
    expect(dark).toContain('--primary: oklch(0.68 0.16 268)')
    expect(dark).toContain('--ring: oklch(0.68 0.16 268)')
    expect(block(':root')).toContain('--primary: oklch(0.395 0.205 273)')
  })
})
