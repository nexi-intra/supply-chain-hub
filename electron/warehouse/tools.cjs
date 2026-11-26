// Which teams may use each tool in Arbejdsværktøjer. The order of the keys is
// the order tools are listed in. Mirrored by src/lib/warehouseTools.ts.
const TOOLS = Object.freeze({
  timeclock: Object.freeze(['TCD', 'TRR']),
  locations: Object.freeze(['TCD', 'TRR']),
  counts: Object.freeze(['TCD', 'TRR']),
  softwareload: Object.freeze(['TCD', 'TRR']),
  finland: Object.freeze(['BPO', 'TCD']),
})
const TOOL_IDS = Object.freeze(Object.keys(TOOLS))

function hasTool(teamId, toolId) {
  return typeof teamId === 'string' && Object.hasOwn(TOOLS, toolId) && TOOLS[toolId].includes(teamId)
}

function toolsForTeam(teamId) {
  return TOOL_IDS.filter(toolId => hasTool(teamId, toolId))
}

module.exports = { TOOLS, TOOL_IDS, toolsForTeam, hasTool }
