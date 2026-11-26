import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { WAREHOUSE_TOOLS, canOpenTool, toolsForTeam, type WarehouseTool } from './warehouseTools'

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

  it('opens only a tool of the team, and Administration only for a Hub manager', () => {
    const user = (tools: WarehouseTool[], canAdminister: boolean) => ({ tools, canAdminister })
    expect(canOpenTool('finland', user(['finland'], false))).toBe(true)
    expect(canOpenTool('counts', user(['finland'], true))).toBe(false)
    expect(canOpenTool('admin', user(['finland'], true))).toBe(true)
    expect(canOpenTool('admin', user(['finland'], false))).toBe(false)
    expect(canOpenTool('admin', user([], true))).toBe(false)
  })
})
