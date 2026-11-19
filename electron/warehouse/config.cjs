// Warehouse Management settings: the SAP system and TCD's placement-sheet folder. Read from the "warehouse"
// section of supply-chan-hub.config; environment variables override (development/E2E). No Electron imports.
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_PLACEMENTS_DIR = 'M:\\375750 - Terminal Configurations & Dispatch\\4. Warehouse Management\\1. Placeringer'
const CONFIG_FILE = 'supply-chan-hub.config'
// Production is PS4; QS4 is the test system.
const SAP_SYSTEMS = Object.freeze(['PS4', 'QS4'])
const DEFAULT_SAP_SYSTEM = 'PS4'

const sapSystemOf = value => {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return SAP_SYSTEMS.includes(text) ? text : null
}

function readSection(dir, readFile) {
  let config
  try {
    config = JSON.parse(readFile(path.join(dir, CONFIG_FILE), 'utf8'))
  } catch {
    return null
  }
  const section = config && typeof config === 'object' && config.warehouse && typeof config.warehouse === 'object' && !Array.isArray(config.warehouse) ? config.warehouse : null
  if (!section) return null
  const placementsDir = typeof section.placementsDir === 'string' && section.placementsDir.trim() ? path.resolve(dir, section.placementsDir.trim()) : null
  return { placementsDir, sapSystem: sapSystemOf(section.sapSystem) }
}

/** Priority: environment -> "warehouse" section of the first supply-chan-hub.config in `configDirs` -> defaults. */
function resolveWarehouseConfig({ env = process.env, configDirs = [], readFile = fs.readFileSync } = {}) {
  let fromFile = null
  for (const dir of configDirs) {
    fromFile = readSection(dir, readFile)
    if (fromFile) break
  }
  const placementsEnv = typeof env.TCD_HUB_PLACEMENTS_DIR === 'string' ? env.TCD_HUB_PLACEMENTS_DIR.trim() : ''
  return {
    placementsDir: placementsEnv ? path.resolve(placementsEnv) : fromFile?.placementsDir || DEFAULT_PLACEMENTS_DIR,
    sapSystem: sapSystemOf(env.TCD_HUB_SAP_SYSTEM) || fromFile?.sapSystem || DEFAULT_SAP_SYSTEM,
  }
}

module.exports = { resolveWarehouseConfig, DEFAULT_PLACEMENTS_DIR, SAP_SYSTEMS, DEFAULT_SAP_SYSTEM }
