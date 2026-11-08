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
  const placed = tsxFiles(src).flatMap(file => [...readFileSync(file, 'utf8').matchAll(/<NisseSpot\s+spot="([a-z-]+)"/g)].map(match => match[1]))
  const all = [...SPOTS.easy, ...SPOTS.medium, ...SPOTS.hard]

  it('every place the judge can pick exists exactly once in the app', () => {
    for (const spot of all) expect(placed.filter(id => id === spot).length, spot).toBe(1)
  })

  it('no place in the app is unknown to the judge', () => {
    expect(placed.filter(id => !all.includes(id))).toEqual([])
  })
})
