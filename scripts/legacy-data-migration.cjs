// Bevarings-sikker migrering fra TCD Hub til Supply Chain Hub.
//
// Eksisterende Supply Chain-data vinder ved enhver konflikt. Migreringen kan
// kun tilføje manglende nøgler, objektfelter og array-elementer; den sletter
// aldrig noget. Fælles data (madplan og delte guides) rutes til _shared.
//
// Standard er dry-run:
//   node scripts/legacy-data-migration.cjs
// Skriv ændringer med backup:
//   node scripts/legacy-data-migration.cjs --apply
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { createStore } = require('../electron/store.cjs')

const DEFAULT_OLD_DIR = 'M:\\375750 - Terminal Configurations & Dispatch\\10. Ai Tools - Storage\\TCD HUB STORAGE'
const DEFAULT_PLATFORM_ROOT = 'M:\\372000 - SC All Employees\\ai Tools\\Supply Chain Hub Storage'
const DEFAULT_TEAM_FOLDER = 'TCD'
const SHARED_KEYS = new Set(['meal-plan-weeks', 'shared-guides'])
const LOCK_ATTEMPTS = 50
const LOCK_RETRY_MS = 100
const STALE_LOCK_MS = 10_000

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const fields = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    return `{${fields.join(',')}}`
  }
  return JSON.stringify(value)
}

function firstDefined(object, fields) {
  for (const field of fields) {
    const value = object?.[field]
    if (value !== undefined && value !== null && value !== '') return String(value).toLowerCase()
  }
  return null
}

function itemIdentity(item, key) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return `value:${stableStringify(item)}`
  }

  if (key === 'meal-plan-weeks') {
    const year = firstDefined(item, ['year']) || ''
    const week = firstDefined(item, ['weekNumber', 'week'])
    if (week) return `meal-plan:${year}:${week}`
  }

  const id = firstDefined(item, ['id', '_id', 'uuid'])
  if (id) return `id:${id}`
  const email = firstDefined(item, ['email'])
  if (email) return `email:${email}`
  const token = firstDefined(item, ['token'])
  if (token) return `token:${token}`

  // Ældre datatyper uden id identificeres på de mest stabile domænefelter.
  const user = firstDefined(item, ['userEmail', 'employeeEmail', 'employeeName', 'username'])
  const date = firstDefined(item, ['date', 'startDate', 'createdAt'])
  const type = firstDefined(item, ['type', 'role', 'category', 'name'])
  if (user && date) return `user-date:${user}:${date}:${type || ''}`

  return `object:${stableStringify(item)}`
}

/**
 * Sammenlægger source ind i target uden at ændre en eksisterende target-værdi.
 * Manglende objektfelter og array-elementer tilføjes rekursivt.
 */
function mergePreservingTarget(source, target, key = '') {
  if (target === undefined) {
    return { value: clone(source), changed: true, added: 1, conflicts: 0 }
  }
  if (source === undefined) {
    return { value: clone(target), changed: false, added: 0, conflicts: 0 }
  }

  if (Array.isArray(source) && Array.isArray(target)) {
    const value = clone(target)
    const targetIndexes = new Map(value.map((item, index) => [itemIdentity(item, key), index]))
    let changed = false
    let added = 0
    let conflicts = 0

    for (const sourceItem of source) {
      const identity = itemIdentity(sourceItem, key)
      const targetIndex = targetIndexes.get(identity)
      if (targetIndex === undefined) {
        targetIndexes.set(identity, value.length)
        value.push(clone(sourceItem))
        changed = true
        added++
        continue
      }

      const nested = mergePreservingTarget(sourceItem, value[targetIndex], key)
      if (nested.changed) {
        value[targetIndex] = nested.value
        changed = true
      }
      added += nested.added
      conflicts += nested.conflicts
    }
    return { value, changed, added, conflicts }
  }

  const sourceIsObject = source && typeof source === 'object' && !Array.isArray(source)
  const targetIsObject = target && typeof target === 'object' && !Array.isArray(target)
  if (sourceIsObject && targetIsObject) {
    const value = clone(target)
    let changed = false
    let added = 0
    let conflicts = 0
    for (const [field, sourceValue] of Object.entries(source)) {
      const nested = mergePreservingTarget(sourceValue, value[field], key)
      if (nested.changed) {
        value[field] = nested.value
        changed = true
      }
      added += nested.added
      conflicts += nested.conflicts
    }
    return { value, changed, added, conflicts }
  }

  const same = stableStringify(source) === stableStringify(target)
  return { value: clone(target), changed: false, added: 0, conflicts: same ? 0 : 1 }
}

function keyFilename(key) {
  return `${encodeURIComponent(key)}.json`
}

function acquireKeyLock(directory, key) {
  const lockPath = path.join(directory, `${keyFilename(key)}.lock`)
  for (let attempt = 1; attempt <= LOCK_ATTEMPTS; attempt++) {
    try {
      const handle = fs.openSync(lockPath, 'wx')
      fs.writeSync(handle, `legacy-migration:${process.pid}`)
      fs.closeSync(handle)
      return lockPath
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
          fs.unlinkSync(lockPath)
          continue
        }
      } catch {
        continue
      }
      if (attempt === LOCK_ATTEMPTS) throw new Error(`Kunne ikke få lås på "${key}"`)
      wait(LOCK_RETRY_MS)
    }
  }
  throw new Error(`Kunne ikke få lås på "${key}"`)
}

function backupTargetFile({ targetDirectory, key, backupRoot, scope }) {
  const sourcePath = path.join(targetDirectory, keyFilename(key))
  if (!fs.existsSync(sourcePath)) return false
  const destinationDirectory = path.join(backupRoot, scope)
  const destinationPath = path.join(destinationDirectory, keyFilename(key))
  fs.mkdirSync(destinationDirectory, { recursive: true })
  if (!fs.existsSync(destinationPath)) fs.copyFileSync(sourcePath, destinationPath)
  return true
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function buildMigrationPlan({ oldDir, platformRoot, teamFolder = DEFAULT_TEAM_FOLDER }) {
  if (!fs.existsSync(oldDir)) throw new Error(`Den gamle datamappe findes ikke: ${oldDir}`)
  if (!fs.existsSync(platformRoot)) throw new Error(`Supply Chain-platformroden findes ikke: ${platformRoot}`)

  const teamDir = path.join(platformRoot, teamFolder)
  const sharedDir = path.join(platformRoot, '_shared')
  if (!fs.existsSync(teamDir)) throw new Error(`TCD-teamets datamappe findes ikke: ${teamDir}`)
  if (!fs.existsSync(sharedDir)) throw new Error(`Den fælles datamappe findes ikke: ${sharedDir}`)

  const oldStore = createStore(oldDir)
  const teamStore = createStore(teamDir)
  const sharedStore = createStore(sharedDir)
  const entries = []

  for (const key of oldStore.keys().sort()) {
    const sourceValue = oldStore.get(key, { skipCache: true })
    const shared = SHARED_KEYS.has(key)
    const targetStore = shared ? sharedStore : teamStore
    const targetDirectory = shared ? sharedDir : teamDir
    const targetValue = targetStore.get(key, { skipCache: true })
    const result = mergePreservingTarget(sourceValue, targetValue, key)
    entries.push({
      key,
      scope: shared ? '_shared' : teamFolder,
      targetDirectory,
      sourceValue,
      targetExists: targetValue !== undefined,
      changed: result.changed,
      added: result.added,
      conflicts: result.conflicts,
    })
  }

  return { oldDir, platformRoot, teamFolder, teamDir, sharedDir, entries }
}

function applyMigrationPlan(plan, { backupRoot }) {
  const stores = {
    [plan.teamFolder]: createStore(plan.teamDir),
    _shared: createStore(plan.sharedDir),
  }
  let changedKeys = 0
  let added = 0
  let conflicts = 0
  let backedUpFiles = 0

  for (const entry of plan.entries) {
    if (!entry.changed) {
      conflicts += entry.conflicts
      continue
    }

    const targetStore = stores[entry.scope]
    const lockPath = acquireKeyLock(entry.targetDirectory, entry.key)
    try {
      // Genlæs efter låsen. Så bevares også Supply-data, der er kommet til
      // siden dry-run/planlægningen begyndte.
      const liveTarget = targetStore.get(entry.key, { skipCache: true })
      const liveMerge = mergePreservingTarget(entry.sourceValue, liveTarget, entry.key)
      conflicts += liveMerge.conflicts
      if (!liveMerge.changed) continue

      if (backupTargetFile({
        targetDirectory: entry.targetDirectory,
        key: entry.key,
        backupRoot,
        scope: entry.scope,
      })) backedUpFiles++

      targetStore.set(entry.key, liveMerge.value)
      changedKeys++
      added += liveMerge.added
    } finally {
      try { fs.unlinkSync(lockPath) } catch {}
    }
  }

  return { changedKeys, added, conflicts, backedUpFiles }
}

function runMigration({
  oldDir = DEFAULT_OLD_DIR,
  platformRoot = DEFAULT_PLATFORM_ROOT,
  teamFolder = DEFAULT_TEAM_FOLDER,
  apply = false,
  backupRoot,
  logger = console,
} = {}) {
  const plan = buildMigrationPlan({ oldDir, platformRoot, teamFolder })
  const planned = plan.entries.filter((entry) => entry.changed)
  const preview = {
    mode: apply ? 'apply' : 'dry-run',
    scannedKeys: plan.entries.length,
    changedKeys: planned.length,
    added: planned.reduce((sum, entry) => sum + entry.added, 0),
    conflicts: plan.entries.reduce((sum, entry) => sum + entry.conflicts, 0),
    teamKeys: planned.filter((entry) => entry.scope === teamFolder).length,
    sharedKeys: planned.filter((entry) => entry.scope === '_shared').length,
  }

  logger.log(`[legacy-migration] ${preview.mode}: ${preview.scannedKeys} gamle nøgler scannet`)
  logger.log(`[legacy-migration] ${preview.changedKeys} målnøgler får kun tilføjet manglende data; ${preview.conflicts} Supply-konflikter bevares urørt`)
  if (!apply || planned.length === 0) return { ...preview, applied: false, backupRoot: null }

  const resolvedBackupRoot = backupRoot || path.join(platformRoot, '_migration-backups', timestampForPath())
  fs.mkdirSync(resolvedBackupRoot, { recursive: true })
  const result = applyMigrationPlan(plan, { backupRoot: resolvedBackupRoot })
  logger.log(`[legacy-migration] Udført: ${result.changedKeys} nøgler ændret, ${result.added} manglende poster/felter tilføjet`)
  logger.log(`[legacy-migration] Backup: ${resolvedBackupRoot}`)
  return { ...preview, ...result, applied: true, backupRoot: resolvedBackupRoot }
}

function argumentValue(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2)
    const result = runMigration({
      apply: args.includes('--apply'),
      oldDir: argumentValue(args, '--old-dir') || DEFAULT_OLD_DIR,
      platformRoot: argumentValue(args, '--platform-root') || DEFAULT_PLATFORM_ROOT,
      teamFolder: argumentValue(args, '--team') || DEFAULT_TEAM_FOLDER,
      backupRoot: argumentValue(args, '--backup-root'),
    })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(`[legacy-migration] FEJL: ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = {
  DEFAULT_OLD_DIR,
  DEFAULT_PLATFORM_ROOT,
  SHARED_KEYS,
  itemIdentity,
  mergePreservingTarget,
  buildMigrationPlan,
  applyMigrationPlan,
  runMigration,
}
