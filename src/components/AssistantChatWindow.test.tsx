import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantChatWindow, CHAT_WIDTHS } from './AssistantChatWindow'
const render = (language: 'da' | 'en' | 'fi' = 'da') => renderToStaticMarkup(<main><button>Hub remains available</button><AssistantChatWindow language={language} width="compact" onWidthChange={() => {}} onMinimize={() => {}} onClose={() => {}} ready status="Guide search ready" settings={<button>Clear chat</button>}><p>Synthetic chat only</p></AssistantChatWindow></main>)
describe('floating assistant window', () => {
  it('uses Hubert as its visible and accessible name in all languages', () => {
    for (const language of ['da', 'en', 'fi'] as const) {
      expect(render(language)).toContain('aria-label="Hubert"')
      expect(render(language)).toContain('>Hubert</')
      expect(render(language)).not.toMatch(/Hub-assistent|Hub assistant|Hub-avustaja/)
    }
  })
  it('is a nonmodal region, with no overlay or modal/sheet primitives', () => {
    const html = render()
    expect(html).toContain('data-assistant-window')
    expect(html).toContain('<section')
    expect(html).not.toContain('aria-modal')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('data-slot="sheet')
    expect(html).not.toContain('overlay')
    expect(html).toContain('<button>Hub remains available</button>')
  })
  it('provides exactly three widths in a dropdown, without a range slider', () => {
    const html = render()
    expect(html).toContain('<select')
    expect(html.match(/<option /g)).toHaveLength(3)
    expect(html).not.toContain('type="range"')
    expect(CHAT_WIDTHS).toEqual({ compact: 360, standard: 440, wide: 560 })
  })
  it('bounds width and height by the viewport and offers minimize/close', () => {
    const html = render()
    expect(html).toContain('calc(100vw - 24px)')
    expect(html).toContain('calc(100dvh - 40px)')
    expect(html).toContain('aria-label="Minimér"')
    expect(html).toContain('aria-label="Luk"')
  })
  it('localizes controls and keeps model/RAM/help paragraphs out of the header', () => {
    expect(render('en')).toContain('aria-label="Minimize"')
    expect(render('fi')).toContain('aria-label="Pienennä"')
    expect(render()).not.toMatch(/Qwen|RAM:|Spørg til hubbens data/)
  })
})
