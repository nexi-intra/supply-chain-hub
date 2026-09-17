const test = require('node:test')
const assert = require('node:assert/strict')
const { migrateReferences, personalKey, relevantKey } = require('./accountReferences.cjs')
test('guide reviewers, notebook notification owners and keyed notice logs follow the account', () => {
  const old = 'old@example.test', next = 'new@example.test'
  assert.deepEqual(migrateReferences('guide-review-requests', [{ claimedBy: old, reviewerEditedBy: old, archivedBy: old, restoredBy: old, reviewerComment: old }], old, next), [{ claimedBy: next, reviewerEditedBy: next, archivedBy: next, restoredBy: next, reviewerComment: old }])
  assert.deepEqual(migrateReferences('notebook-notifications', [{ editedBy: old, originalCreator: old, lastEditedBy: old }], old, next), [{ editedBy: next, originalCreator: next, lastEditedBy: next }])
  assert.deepEqual(migrateReferences('guide-review-notice-log', { [old]: { guide: '2026-09-15' } }, old, next), { [next]: { guide: '2026-09-15' } })
})
test('only account-derived employee and birthday IDs move, never opaque IDs', () => {
  const old = 'old@example.test', next = 'new@example.test'
  assert.deepEqual(migrateReferences('employee-birthdays', [{ id: old, email: old }, { id: 'opaque-id', email: old }], old, next), [{ id: next, email: next }, { id: 'opaque-id', email: next }])
  assert.throws(() => migrateReferences('employee-birthdays', [{ id: old, email: old }, { id: next, email: 'someone@example.test' }], old, next), error => error.code === 'ACCOUNT_MIGRATION_CONFLICT')
  assert.equal(personalKey(`app-language-user_${old.toUpperCase()}`, old, next), `app-language-user_${next}`)
})
const old = 'old@example.test', next = 'new@example.test'
test('reference migration changes identities in nested modules but never user-written text or stable record ids', () => {
  const value = { userId: `user_${old}`, employeeId: old, creatorEmail: old, title: old, content: old, comment: old, notes: old, password: old, id: `message-${old}`, teamMembers: [{ email: old, name: 'Keep Name' }], sharedWith: [old], proposedGuide: { createdBy: old, sections: [{ steps: [{ text: old, imageIds: ['unchanged'] }] }] } }
  const result = migrateReferences('projects', value, old, next)
  assert.equal(result.userId, `user_${next}`); assert.equal(result.employeeId, next); assert.equal(result.teamMembers[0].email, next)
  assert.deepEqual(result.sharedWith, [next]); assert.equal(result.proposedGuide.createdBy, next)
  for (const field of ['title', 'content', 'comment', 'notes', 'password']) assert.equal(result[field], old)
  assert.equal(result.id, `message-${old}`); assert.equal(result.proposedGuide.sections[0].steps[0].text, old)
  assert.equal(value.userId, `user_${old}`)
})
test('personal preference keys migrate only exact identity boundaries', () => {
  for (const prefix of ['hub-dashboard-', 'active-theme-', 'seen-vacation-requests-', 'announcements-dismissed-']) assert.equal(personalKey(`${prefix}${old}`, old, next), `${prefix}${next}`)
  assert.equal(personalKey(`app-language-user_${old}`, old, next), `app-language-user_${next}`)
  assert.equal(personalKey(`hub-dashboard-${old}.someone`, old, next), `hub-dashboard-${old}.someone`)
  assert.equal(personalKey(`confetti-shown-${old}-09-15-2026`, old, next), `confetti-shown-${next}-09-15-2026`)
})
test('root email mappings cannot overwrite existing target settings', () => {
  assert.deepEqual(migrateReferences('user-settings', { [old]: { phoneNumber: '123' } }, old, next), { [next]: { phoneNumber: '123' } })
  assert.throws(() => migrateReferences('home-office-patterns', { [old]: { weekdays: [1] }, [next]: { weekdays: [2] } }, old, next), /CONFLICT/)
})
test('binary files, private control records and sessions are not treated as ordinary reference data', () => {
  for (const key of ['file_a_chunk_0', 'file_a_meta', '__offline-queue__', 'users', 'active-sessions', 'account-migration-journal']) assert.equal(relevantKey(key), false)
})
