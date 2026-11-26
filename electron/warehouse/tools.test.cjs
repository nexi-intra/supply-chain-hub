const test = require('node:test')
const assert = require('node:assert/strict')
const { TOOLS, TOOL_IDS, toolsForTeam, hasTool } = require('./tools.cjs')

test('tool ids keep the fixed order', () => {
  assert.deepEqual(TOOL_IDS, ['timeclock', 'locations', 'counts', 'softwareload', 'finland'])
  assert.deepEqual(Object.keys(TOOLS), TOOL_IDS)
})

test('TCD has every tool', () => {
  assert.deepEqual(toolsForTeam('TCD'), ['timeclock', 'locations', 'counts', 'softwareload', 'finland'])
})

test('TRR has the four original tools', () => {
  assert.deepEqual(toolsForTeam('TRR'), ['timeclock', 'locations', 'counts', 'softwareload'])
})

test('BPO only has finland', () => {
  assert.deepEqual(toolsForTeam('BPO'), ['finland'])
})

test('unknown, lower case and missing teams have no tools', () => {
  assert.deepEqual(toolsForTeam('PIM'), [])
  assert.deepEqual(toolsForTeam('tcd'), [])
  assert.deepEqual(toolsForTeam(null), [])
  assert.deepEqual(toolsForTeam(undefined), [])
})

test('hasTool checks a single tool', () => {
  assert.equal(hasTool('TRR', 'finland'), false)
  assert.equal(hasTool('BPO', 'finland'), true)
  assert.equal(hasTool('TCD', 'nope'), false)
})
