import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { SPOTS } = require('../../../electron/nisse.cjs') as { SPOTS: Record<'easy' | 'medium' | 'hard', string[]> }
const src = join(__dirname, '..', '..')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return tsxFiles(path)
    return name.endsWith('.tsx') && !name.includes('.test.') ? [path] : []
  })
}

describe('the 24 hiding places', () => {
  const sources = tsxFiles(src).map(file => readFileSync(file, 'utf8'))
  const placed = sources.flatMap(text => [...text.matchAll(/<NisseSpot\s+spot="([a-z-]+)"/g)].map(match => match[1]))
  const poses = Object.fromEntries(sources.flatMap(text => [...text.matchAll(/<NisseSpot\s+spot="([a-z-]+)"\s+pose="([a-z]+)"/g)].map(match => [match[1], match[2]])))
  const all = [...SPOTS.easy, ...SPOTS.medium, ...SPOTS.hard]

  it('each place has the nisse that fits it: peeking over an edge, hanging from one, or standing beside something', () => {
    const expected: Record<string, string> = {
      'front-board': 'peek', 'front-tile': 'peek', 'front-customize': 'peek', calendar: 'peek', team: 'peek', 'calendar-approved': 'stand',
      'front-garland': 'hang', 'front-logo': 'hang', 'front-sick': 'hang', shifts: 'hang', meals: 'hang', 'command-palette': 'hang',
      'front-drift': 'stand', 'front-greeting': 'stand', email: 'stand', todo: 'stand', notebook: 'stand', links: 'stand', improvements: 'stand',
      guides: 'stand', knowledge: 'stand', 'profile-menu': 'stand', 'shifts-tasks': 'stand', 'front-bottom': 'stand',
    }
    expect(Object.keys(expected).sort()).toEqual([...all].sort())
    expect(poses).toEqual(expected)
  })

  it('every place the judge can pick exists exactly once in the app', () => {
    for (const spot of all) expect(placed.filter(id => id === spot).length, spot).toBe(1)
  })

  it('no place in the app is unknown to the judge', () => {
    expect(placed.filter(id => !all.includes(id))).toEqual([])
  })
})
