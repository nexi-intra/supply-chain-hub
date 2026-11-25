import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GuideZoomControl } from './GuideZoomControl'

const labels = { zoomOut: 'Zoom ud', zoomIn: 'Zoom ind', zoomReset: 'Tilbage til 100 %' }
const render = (zoom: number) => renderToStaticMarkup(<GuideZoomControl zoom={zoom} onChange={() => {}} labels={labels} />)
const buttonTag = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? ''
const DISABLED = ' disabled=""'

describe('GuideZoomControl', () => {
  it('shows the current zoom', () => {
    const html = render(125)
    expect(html).toContain('125 %')
    expect(html).toContain('aria-label="Zoom ud"')
    expect(html).toContain('aria-label="Zoom ind"')
    expect(html).toContain('title="Tilbage til 100 %"')
  })

  it('disables buttons at the bounds', () => {
    expect(buttonTag(render(50), 'Zoom ud')).toContain(DISABLED)
    expect(buttonTag(render(50), 'Zoom ind')).not.toContain(DISABLED)
    expect(buttonTag(render(300), 'Zoom ind')).toContain(DISABLED)
    expect(buttonTag(render(300), 'Zoom ud')).not.toContain(DISABLED)
    expect(buttonTag(render(100), 'Zoom ud')).not.toContain(DISABLED)
    expect(buttonTag(render(100), 'Zoom ind')).not.toContain(DISABLED)
  })
})
