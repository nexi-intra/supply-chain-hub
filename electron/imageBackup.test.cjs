const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { backupImmutableBlobs, IMAGE_BACKUP_DIR } = require('./imageBackup.cjs')
const { keyToFilename } = require('./store.cjs')

const isBlob = key => key.startsWith('file_') && (key.includes('_chunk_') || key.endsWith('_meta'))

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-image-backup-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const dataDir = path.join(root, 'TCD')
  const backupDir = path.join(dataDir, 'Backup')
  fs.mkdirSync(backupDir, { recursive: true })
  const put = (key, content = `encrypted:${key}`) => fs.writeFileSync(path.join(dataDir, keyToFilename(key)), content)
  const keys = () => fs.readdirSync(dataDir).filter(name => name.endsWith('.json')).map(name => decodeURIComponent(name.slice(0, -5)))
  const copies = () => fs.existsSync(path.join(backupDir, IMAGE_BACKUP_DIR)) ? fs.readdirSync(path.join(backupDir, IMAGE_BACKUP_DIR)).sort() : []
  return { dataDir, backupDir, put, keys, copies }
}

const run = (f, extra = {}) => backupImmutableBlobs({ dataDir: f.dataDir, backupDir: f.backupDir, isImmutableBlobKey: isBlob, today: '2026-11-07', ...extra })

test('every image blob is copied once, byte for byte, and only blobs are copied', async t => {
  const f = fixture(t)
  f.put('file_a_meta', 'meta-bytes'); f.put('file_a_chunk_0', 'chunk-bytes'); f.put('vacation-entries')
  const result = await run(f)
  assert.deepEqual([...result.backedUp].sort(), ['file_a_chunk_0', 'file_a_meta'])
  assert.equal(result.copied, 2)
  assert.deepEqual(f.copies(), [keyToFilename('file_a_chunk_0'), keyToFilename('file_a_meta')].sort())
  assert.equal(fs.readFileSync(path.join(f.backupDir, IMAGE_BACKUP_DIR, keyToFilename('file_a_meta')), 'utf8'), 'meta-bytes')
  const again = await run(f)
  assert.equal(again.copied, 0, 'an image never changes, so it is never copied twice')
  assert.equal(again.backedUp.size, 2)
})

test('the time budget stops copying; the rest is copied on a later run and is NOT reported as backed up meanwhile', async t => {
  const f = fixture(t)
  for (let i = 0; i < 5; i++) f.put(`file_x${i}_meta`)
  let clock = 0
  const first = await run(f, { budgetMs: 2, now: () => clock++ })
  assert.ok(first.copied >= 1 && first.copied < 5, `copied ${first.copied}`)
  assert.equal(first.backedUp.size, first.copied)
  const second = await run(f)
  assert.equal(second.backedUp.size, 5)
})

test('a copy interrupted half-way is never mistaken for a backup', async t => {
  const f = fixture(t)
  f.put('file_b_meta')
  fs.mkdirSync(path.join(f.backupDir, IMAGE_BACKUP_DIR))
  fs.writeFileSync(path.join(f.backupDir, IMAGE_BACKUP_DIR, `${keyToFilename('file_b_meta')}.123.tmp`), 'half')
  const result = await run(f)
  assert.ok(result.backedUp.has('file_b_meta'))
  assert.deepEqual(f.copies(), [keyToFilename('file_b_meta')], 'the leftover temp file is cleaned up')
})

test('a blob deleted from the hub keeps its copy for keepDays, then the copy is removed', async t => {
  const f = fixture(t)
  f.put('file_gone_meta')
  await run(f)
  fs.unlinkSync(path.join(f.dataDir, keyToFilename('file_gone_meta')))
  const day1 = await run(f, { today: '2026-11-08', keepDays: 14 })
  assert.equal(day1.pruned, 0)
  assert.ok(f.copies().includes(keyToFilename('file_gone_meta')), 'kept: a restore of an older daily backup may need it')
  const day14 = await run(f, { today: '2026-11-21', keepDays: 14 })
  assert.equal(day14.pruned, 0)
  const day15 = await run(f, { today: '2026-11-22', keepDays: 14 })
  assert.equal(day15.pruned, 1)
  assert.ok(!f.copies().includes(keyToFilename('file_gone_meta')))
})

test('a blob that comes back (restored) is no longer counted as deleted', async t => {
  const f = fixture(t)
  f.put('file_back_meta')
  await run(f)
  fs.unlinkSync(path.join(f.dataDir, keyToFilename('file_back_meta')))
  await run(f, { today: '2026-11-08' })
  f.put('file_back_meta')
  await run(f, { today: '2026-11-09' })
  fs.unlinkSync(path.join(f.dataDir, keyToFilename('file_back_meta')))
  const later = await run(f, { today: '2026-11-20', keepDays: 14 })
  assert.equal(later.pruned, 0, 'the 14 days start again from the second deletion')
})

test('a blob deleted between listing and copying is skipped without failing the backup', async t => {
  const f = fixture(t)
  f.put('file_c_meta')
  const keys = f.keys()
  fs.unlinkSync(path.join(f.dataDir, keyToFilename('file_c_meta')))
  const result = await backupImmutableBlobs({ dataDir: f.dataDir, backupDir: f.backupDir, keys, isImmutableBlobKey: isBlob, today: '2026-11-07' })
  assert.equal(result.copied, 0)
  assert.equal(result.backedUp.size, 0)
})
