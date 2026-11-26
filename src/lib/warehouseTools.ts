// Which teams may use each tool in Arbejdsværktøjer. Must match
// electron/warehouse/tools.cjs; a test keeps the two in sync.
export type WarehouseTool = 'timeclock' | 'locations' | 'counts' | 'softwareload' | 'finland'

export const WAREHOUSE_TOOLS: Readonly<Record<WarehouseTool, readonly string[]>> = {
  timeclock: ['TCD', 'TRR'],
  locations: ['TCD', 'TRR'],
  counts: ['TCD', 'TRR'],
  softwareload: ['TCD', 'TRR'],
  finland: ['BPO', 'TCD'],
}

const TOOL_IDS = Object.keys(WAREHOUSE_TOOLS) as WarehouseTool[]

export function toolsForTeam(teamId: string | null | undefined): WarehouseTool[] {
  if (typeof teamId !== 'string') return []
  return TOOL_IDS.filter(tool => WAREHOUSE_TOOLS[tool].includes(teamId))
}
