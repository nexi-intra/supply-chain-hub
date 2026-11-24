import { describe, expect, it } from 'vitest'
import { moduleGridColumns, withModuleInCorner } from './hubModuleOrder'

const modules = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index === Math.min(3, count - 1) ? 'games' : `m${index}` }))

describe('withModuleInCorner', () => {
  it('puts Game Corner first in the last row for every number of modules and columns', () => {
    for (let count = 1; count <= 16; count++) {
      for (let columns = 1; columns <= 4; columns++) {
        const ordered = withModuleInCorner(modules(count), 'games', columns)
        const index = ordered.findIndex(module => module.id === 'games')
        expect(ordered).toHaveLength(count)
        expect(index % columns).toBe(0)
        expect(Math.floor(index / columns)).toBe(Math.floor((count - 1) / columns))
      }
    }
  })

  it('keeps the order of the other modules', () => {
    expect(withModuleInCorner(modules(14), 'games', 4).map(module => module.id)).toEqual(['m0', 'm1', 'm2', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12', 'games', 'm13'])
  })
})

describe('moduleGridColumns', () => {
  it('follows the breakpoints of the grid', () => {
    expect([639, 640, 1023, 1024, 1279, 1280].map(moduleGridColumns)).toEqual([1, 2, 2, 3, 3, 4])
  })
})
