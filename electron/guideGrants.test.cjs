const test = require('node:test')
const assert = require('node:assert/strict')
const { guideAccessIds } = require('./guideGrants.cjs')
const now = Date.parse('2026-09-15T00:00:00Z')
const grant = { guideId: 'g', requestingUserEmail: 'user@example.test', requestingTeamCode: 'A', status: 'approved', requestedAt: '2026-09-01T00:00:00Z', expiresAt: '2026-09-16T00:00:00Z' }
const read = rows => [...guideAccessIds(rows, 'USER@example.test', 'A', now)]
test('shared grant control accepts only own account/home team and unexpired approval', () => {
  assert.deepEqual(read([grant]), ['g'])
  for (const change of [{ requestingUserEmail: 'other@example.test' }, { requestingTeamCode: 'B' }, { expiresAt: 'invalid' }, { expiresAt: '2026-09-14T00:00:00Z' }, { status: 'pending' }]) assert.deepEqual(read([{ ...grant, ...change }]), [])
})
test('a newer rejection or pending revision revokes an older approval regardless of array order', () => {
  for (const status of ['rejected', 'pending']) {
    const newer = { ...grant, status, requestedAt: '2026-09-02T00:00:00Z' }
    assert.deepEqual(read([grant, newer]), []); assert.deepEqual(read([newer, grant]), [])
  }
})
test('ties use the last recorded request and do not revive an earlier approval', () => {
  assert.deepEqual(read([grant, { ...grant, status: 'rejected' }]), [])
})
test('legacy approval without expiry retains its original behavior but malformed permission storage grants nothing', () => {
  assert.deepEqual(read([{ ...grant, expiresAt: undefined }]), ['g'])
  assert.deepEqual(read({}), [])
})
