const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { resolveWarehouseConfig, DEFAULT_PLACEMENTS_DIR } = require('./config.cjs')

const files = entries => file => {
  if (Object.hasOwn(entries, file)) return entries[file]
  throw Object.assign(new Error('missing'), { code: 'ENOENT' })
}
const dir = path.resolve('C:/apps/Supply Chain Hub')
const config = warehouse => files({ [path.join(dir, 'supply-chan-hub.config')]: JSON.stringify({ dataDir: 'M:\\Hub', ...(warehouse ? { warehouse } : {}) }) })

test('defaults: PS4 and the TCD placement folder on M:', () => {
  assert.deepEqual(resolveWarehouseConfig({ env: {}, configDirs: [dir], readFile: config(null) }), { placementsDir: DEFAULT_PLACEMENTS_DIR, sapSystem: 'PS4' })
})

test('the "warehouse" section of supply-chan-hub.config sets the SAP system and placement folder; unknown systems fall back to PS4', () => {
  assert.deepEqual(resolveWarehouseConfig({ env: {}, configDirs: [dir], readFile: config({ sapSystem: 'qs4', placementsDir: './sheets' }) }), { placementsDir: path.join(dir, 'sheets'), sapSystem: 'QS4' })
  assert.equal(resolveWarehouseConfig({ env: {}, configDirs: [dir], readFile: config({ sapSystem: 'XS4' }) }).sapSystem, 'PS4')
})

test('environment variables override the config file', () => {
  const result = resolveWarehouseConfig({ env: { TCD_HUB_SAP_SYSTEM: 'PS4', TCD_HUB_PLACEMENTS_DIR: 'C:/tmp/sheets' }, configDirs: [dir], readFile: config({ sapSystem: 'QS4', placementsDir: './sheets' }) })
  assert.deepEqual(result, { placementsDir: path.resolve('C:/tmp/sheets'), sapSystem: 'PS4' })
})
