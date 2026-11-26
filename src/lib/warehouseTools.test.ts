import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { WAREHOUSE_TOOLS, toolsForTeam } from './warehouseTools'

const require = createRequire(import.meta.url)
const backend = require('../../electron/warehouse/tools.cjs')

describe('warehouseTools', () => {
  it('matches the backend tool table', () => {
    expect(WAREHOUSE_TOOLS).toEqual(backend.TOOLS)
    expect(Object.keys(WAREHOUSE_TOOLS)).toEqual(Object.keys(backend.TOOLS))
  })

  it('lists the tools of a team in the fixed order', () => {
    expect(toolsForTeam('TCD')).toEqual(['timeclock', 'locations', 'counts', 'softwareload', 'finland'])
    expect(toolsForTeam('BPO')).toEqual(['finland'])
    expect(toolsForTeam(null)).toEqual([])
  })
})
