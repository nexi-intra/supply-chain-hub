import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChristmasDecorations } from './ChristmasDecorations'
import { SnowCap } from './SnowCap'
import { AdventDoor } from './AdventDoor'
import { HangingOrnament } from './HangingOrnament'
import { Card } from '@/components/ui/card'
import { ChristmasContext } from '@/contexts/ChristmasContext'
import { ORNAMENT_KINDS } from '@/lib/christmas'

describe('ChristmasDecorations', () => {
  it('front pages get the full package', () => {
    const html = renderToStaticMarkup(<ChristmasDecorations mode="full" />)
    for (const part of ['xmas-snowfall', 'xmas-ridge', 'xmas-garland', 'xmas-twinkle', 'xmas-flags', 'xmas-string-ornament', 'xmas-drift', 'xmas-nisse']) expect(html, part).toContain(part)
    expect(html).not.toContain('xmas-branch')
  })

  it('work screens get still decoration only: snow on the edge and lights that do not blink', () => {
    const html = renderToStaticMarkup(<ChristmasDecorations mode="calm" />)
    expect(html).toContain('xmas-ridge')
    expect(html).toContain('xmas-garland')
    expect(html).toContain('xmas-string-ornament is-small')
    for (const part of ['xmas-snowfall', 'xmas-twinkle', 'xmas-flags', 'xmas-drift', 'xmas-nisse']) expect(html, part).not.toContain(part)
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
  it('lies on top of a card, can carry a decoration on a thread and sheds a little snow on hover', () => {
    const html = renderToStaticMarkup(<SnowCap seed={3} ornament={{ kind: 'heart', color: '#c8352d' }} />)
    expect(html).toContain('xmas-cap')
    expect(html).toContain('xmas-ornament-heart')
    expect(html).toContain('xmas-thread')
    expect(html).toContain('xmas-sprinkle')
    expect(renderToStaticMarkup(<SnowCap seed={3} ornament={null} />)).not.toContain('xmas-ornament')
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

describe('HangingOrnament', () => {
  it('draws every classic Danish decoration on a thread', () => {
    for (const kind of ORNAMENT_KINDS) {
      const html = renderToStaticMarkup(<HangingOrnament kind={kind} color="#c8352d" thread={20} />)
      expect(html, kind).toContain(`xmas-ornament-${kind}`)
      expect(html, kind).toContain('xmas-thread')
    }
  })

  it('two woven hearts on one page do not share pattern ids', () => {
    const html = renderToStaticMarkup(<><HangingOrnament kind="heart" color="#c8352d" thread={20} /><HangingOrnament kind="heart" color="#c8352d" thread={20} /></>)
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1])
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('every card in the app gets snow in the season', () => {
  const season = { month: 12 as const, day: 16, daysToEve: 8, phase: 'advent' as const }
  const withChristmas = (active: boolean, node: ReactNode) => (
    <ChristmasContext.Provider value={{ season, enabled: true, setEnabled: () => {}, active, mode: 'calm' }}>{node}</ChristmasContext.Provider>
  )

  it('lies on a card while the theme is on', () => {
    expect(renderToStaticMarkup(withChristmas(true, <Card>Min uge</Card>))).toContain('xmas-cap')
  })

  it('not when the theme is off or the card brings its own snow', () => {
    expect(renderToStaticMarkup(withChristmas(false, <Card>Min uge</Card>))).not.toContain('xmas-cap')
    expect(renderToStaticMarkup(withChristmas(true, <Card snow={false}>Vagtplan</Card>))).not.toContain('xmas-cap')
  })
})