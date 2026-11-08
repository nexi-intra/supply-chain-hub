import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChristmasDecorations } from './ChristmasDecorations'
import { SnowCap } from './SnowCap'
import { AdventDoor } from './AdventDoor'

describe('ChristmasDecorations', () => {
  it('front pages get the full package', () => {
    const html = renderToStaticMarkup(<ChristmasDecorations mode="full" />)
    for (const part of ['xmas-snowfall', 'xmas-ridge', 'xmas-garland', 'xmas-twinkle', 'xmas-branch', 'xmas-drift', 'xmas-nisse']) expect(html, part).toContain(part)
  })

  it('work screens get still decoration only: snow on the edge and lights that do not blink', () => {
    const html = renderToStaticMarkup(<ChristmasDecorations mode="calm" />)
    expect(html).toContain('xmas-ridge')
    expect(html).toContain('xmas-garland')
    for (const part of ['xmas-snowfall', 'xmas-twinkle', 'xmas-branch', 'xmas-drift', 'xmas-nisse']) expect(html, part).not.toContain(part)
  })

  it('the games get nothing', () => {
    expect(renderToStaticMarkup(<ChristmasDecorations mode="off" />)).toBe('')
  })

  it('never catches a click and is hidden from screen readers', () => {
    const html = renderToStaticMarkup(<ChristmasDecorations mode="full" />)
    expect(html).toMatch(/^<div[^>]*aria-hidden="true"[^>]*pointer-events-none/)
  })

  it('each bulb hangs from a socket on the wire', () => {
    const html = renderToStaticMarkup(<ChristmasDecorations mode="calm" />)
    const sockets = html.match(/class="xmas-socket"/g) ?? []
    const bulbs = html.match(/class="xmas-bulb"/g) ?? []
    expect(sockets.length).toBeGreaterThan(10)
    expect(bulbs.length).toBe(sockets.length)
  })
})

describe('SnowCap', () => {
  it('lies on top of a card, can carry a bauble on a thread and sheds a little snow on hover', () => {
    const html = renderToStaticMarkup(<SnowCap seed={3} bauble />)
    expect(html).toContain('xmas-cap')
    expect(html).toContain('xmas-bauble')
    expect(html).toContain('xmas-thread')
    expect(html).toContain('xmas-sprinkle')
    expect(renderToStaticMarkup(<SnowCap seed={3} />)).not.toContain('xmas-bauble')
  })
})

describe('AdventDoor', () => {
  it('is a real button with the day on it', () => {
    const html = renderToStaticMarkup(<AdventDoor day={16} language="da" />)
    expect(html).toMatch(/<button[^>]*type="button"/)
    expect(html).toContain('>16<')
    expect(html).toContain('Dagens låge')
  })
})
