// The storage locations a softwareload task may end in, with SAP's own description (MB52 F4 help on Storage Location,
// plant D301, read 20.11.2026) and the team that owns them. D102–D106 are left out on purpose. src/lib/softwareload.ts
// holds the same list for the view.

const SOFTWARELOAD_TARGETS = Object.freeze([
  { sloc: 'D000', description: 'Central Warehous', team: 'TCD' },
  { sloc: 'D001', description: 'Raw Terminals', team: 'TRR' },
  { sloc: 'D002', description: 'Repair', team: 'TRR' },
  { sloc: 'D003', description: 'SWAP Inbound', team: 'TRR' },
  { sloc: 'D004', description: 'SWAP Outbound', team: 'TCD' },
  { sloc: 'D005', description: 'SA – secure room', team: 'TCD' },
  { sloc: 'D006', description: 'Forecast Prep', team: 'TCD' },
].map(Object.freeze))

const isSoftwareloadTarget = sloc => SOFTWARELOAD_TARGETS.some(item => item.sloc === sloc)

module.exports = { SOFTWARELOAD_TARGETS, isSoftwareloadTarget }
