import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = join(__dirname, '..', '..')
const read = (...path: string[]) => readFileSync(join(src, ...path), 'utf8')

describe('the Christmas theme is wired in', () => {
  it('every screen sits inside the provider and the layer picks full, calm or nothing per screen', () => {
    const app = read('App.tsx')
    expect(app.match(/<ChristmasProvider/g)?.length).toBe(3)
    expect(app.match(/<ChristmasLayer \/>/g)?.length).toBe(3)
    expect(app).toContain('mode={christmasMode(currentView)}')
  })

  it('the front page has snow on the module cards, the advent door and the Christmas board', () => {
    const hub = read('views', 'Hub.tsx')
    expect(hub).toContain('<SnowCap')
    expect(hub).toContain('<AdventDoor')
    expect(hub).toContain('xmas-banner')
    expect(hub).toContain('xmas-tile')
  })

  it('the logo gets a Santa hat and the theme can be switched off where light/dark is chosen', () => {
    expect(read('components', 'HubMark.tsx')).toContain('hub-mark-hat')
    expect(read('components', 'ThemeToggle.tsx')).toContain('useChristmas')
  })

  it('stays a surprise: nothing in the changelog users read in "What is new"', () => {
    expect(read('lib', 'changelog.ts')).not.toMatch(/\bjul|christmas|snow|nisse|advent/i)
  })

  it('stays a surprise on the shared drive too: the default is never written, only a real opt-out', () => {
    const context = read('contexts', 'ChristmasContext.tsx')
    expect(context).toMatch(/useKV<boolean>\([^)]*\{ initializeIfMissing: false \}\)/)
    expect(context).not.toContain('user-christmas-guest')
  })
})
