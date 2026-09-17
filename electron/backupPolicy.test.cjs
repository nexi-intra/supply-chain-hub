const test = require('node:test')
const assert = require('node:assert/strict')
const { exportBackup } = require('./backupPolicy.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('./store.cjs')
test('explicit backup keeps account credentials but excludes session tokens and internal keys', () => {
  const raw = { users: { 'test@example.test': { password: 'synthetic hash' } }, 'active-sessions': { legacy: { token: 'SECRET TOKEN' } }, __internal: 'PRIVATE', guides: [{ id: 'g' }] }
  const backup = exportBackup({ keys: () => Object.keys(raw), get: key => structuredClone(raw[key]) })
  assert.equal(backup.data.users['test@example.test'].password, 'synthetic hash')
  assert.equal(backup.data['active-sessions'], undefined); assert.equal(backup.data.__internal, undefined)
  assert.deepEqual(backup.data.guides, raw.guides); assert.equal(backup.formatVersion, 1)
})
test('backup export never substitutes an empty success after a read failure', () => {
  assert.throws(() => exportBackup({ keys() { throw new Error('EACCES') } }), /EACCES/)
})
test('real store backup fails if an existing key cannot be decoded, rather than silently omitting accounts', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-backup-policy-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const store = createStore(root); store.set('guides', [{ id: 'g' }])
  fs.writeFileSync(path.join(root, 'users.json'), 'synthetic damaged JSON')
  assert.throws(() => exportBackup(store))
})
test('a key disappearing during export fails rather than producing an incomplete successful backup', () => {
  assert.throws(() => exportBackup({ keys: () => ['users'], get: () => undefined }), error => error.code === 'BACKUP_CHANGED')
})
