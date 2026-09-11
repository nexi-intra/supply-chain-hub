const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createStore } = require('../electron/store.cjs')
const { mergePreservingTarget, runMigration } = require('./legacy-data-migration.cjs')

function makeTempDir(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

function fixture(t) {
  const root = makeTempDir(t, 'legacy-migration-')
  const oldDir = path.join(root, 'old')
  const platformRoot = path.join(root, 'platform')
  const teamDir = path.join(platformRoot, 'TCD')
  const sharedDir = path.join(platformRoot, '_shared')
  fs.mkdirSync(oldDir, { recursive: true })
  fs.mkdirSync(teamDir, { recursive: true })
  fs.mkdirSync(sharedDir, { recursive: true })
  return {
    root,
    oldDir,
    platformRoot,
    oldStore: createStore(oldDir),
    teamStore: createStore(teamDir),
    sharedStore: createStore(sharedDir),
  }
}

test('mergePreservingTarget keeps target conflicts and adds only missing data', () => {
  const source = {
    alice: { fullName: 'Old name', phone: '123' },
    charlie: { fullName: 'Charlie' },
  }
  const target = {
    alice: { fullName: 'Supply name', role: 'manager' },
    bob: { fullName: 'Bob' },
  }

  const result = mergePreservingTarget(source, target, 'users')

  assert.deepEqual(result.value, {
    alice: { fullName: 'Supply name', role: 'manager', phone: '123' },
    bob: { fullName: 'Bob' },
    charlie: { fullName: 'Charlie' },
  })
  assert.ok(result.changed)
  assert.ok(result.conflicts >= 1)
})

test('array merge preserves matching target records and appends missing legacy records', () => {
  const source = [
    { id: 'a', title: 'Old title', legacyOnly: true },
    { id: 'c', title: 'Legacy C' },
  ]
  const target = [
    { id: 'a', title: 'Supply title', supplyOnly: true },
    { id: 'b', title: 'Supply B' },
  ]

  const result = mergePreservingTarget(source, target, 'projects')

  assert.deepEqual(result.value, [
    { id: 'a', title: 'Supply title', supplyOnly: true, legacyOnly: true },
    { id: 'b', title: 'Supply B' },
    { id: 'c', title: 'Legacy C' },
  ])
})

test('dry-run changes no Supply data', (t) => {
  const data = fixture(t)
  data.oldStore.set('users', { alice: { fullName: 'Old' }, charlie: { fullName: 'Charlie' } })
  data.teamStore.set('users', { alice: { fullName: 'Supply' } })

  const result = runMigration({ oldDir: data.oldDir, platformRoot: data.platformRoot, logger: { log() {} } })

  assert.equal(result.applied, false)
  assert.deepEqual(data.teamStore.get('users', { skipCache: true }), { alice: { fullName: 'Supply' } })
})

test('apply preserves team/shared target data, routes meal plan, and creates backups', (t) => {
  const data = fixture(t)
  const backupRoot = path.join(data.root, 'backup')
  data.oldStore.set('users', {
    alice: { fullName: 'Old', phone: '123' },
    charlie: { fullName: 'Charlie' },
  })
  data.teamStore.set('users', {
    alice: { fullName: 'Supply', role: 'manager' },
    bob: { fullName: 'Bob' },
  })
  data.oldStore.set('meal-plan-weeks', [
    { year: 2026, weekNumber: 36, menu: 'Old menu' },
    { year: 2026, weekNumber: 37, menu: 'Legacy week' },
  ])
  data.sharedStore.set('meal-plan-weeks', [
    { year: 2026, weekNumber: 36, menu: 'Supply menu' },
  ])

  const result = runMigration({
    oldDir: data.oldDir,
    platformRoot: data.platformRoot,
    apply: true,
    backupRoot,
    logger: { log() {} },
  })

  assert.equal(result.applied, true)
  assert.deepEqual(data.teamStore.get('users', { skipCache: true }), {
    alice: { fullName: 'Supply', role: 'manager', phone: '123' },
    bob: { fullName: 'Bob' },
    charlie: { fullName: 'Charlie' },
  })
  assert.deepEqual(data.sharedStore.get('meal-plan-weeks', { skipCache: true }), [
    { year: 2026, weekNumber: 36, menu: 'Supply menu' },
    { year: 2026, weekNumber: 37, menu: 'Legacy week' },
  ])
  assert.ok(fs.existsSync(path.join(backupRoot, 'TCD', 'users.json')))
  assert.ok(fs.existsSync(path.join(backupRoot, '_shared', 'meal-plan-weeks.json')))
})
