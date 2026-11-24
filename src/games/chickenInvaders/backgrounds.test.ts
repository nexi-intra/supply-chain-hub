import { describe, it, expect } from 'vitest'
import { drawBackground } from './backgrounds'
import { THEME_IDS, THEMES } from './themes'

/** Optager kald i stedet for at tegne, så tegnekoden kan køres uden et rigtigt canvas. */
function recordingContext() {
  const calls: string[] = []
  const gradient = { addColorStop: () => undefined }
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop]
      if (prop.startsWith('create')) return () => gradient
      return (...args: unknown[]) => {
        calls.push(prop)
        return args
      }
    },
    set: (target, prop: string, value) => {
      target[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('drawBackground', () => {
  it('tegner hvert tema uden fejl og fylder hele banen', () => {
    for (const id of THEME_IDS) {
      const { ctx, calls } = recordingContext()
      expect(() => drawBackground(ctx, 960, 600, THEMES[id])).not.toThrow()
      expect(calls).toContain('fillRect')
    }
  })

  it('giver forskellig tegning for hvert tema', () => {
    const signatures = THEME_IDS.map((id) => {
      const { ctx, calls } = recordingContext()
      drawBackground(ctx, 960, 600, THEMES[id])
      return calls.join(',')
    })
    expect(new Set(signatures).size).toBe(THEME_IDS.length)
  })
})
