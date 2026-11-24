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
test('improvement operational invitation references follow a rename while audit actors remain historical', () => {
  const value = [{ createdBy: old, assignments: [{ email: old, invitedBy: old }], notifications: [{ recipientEmail: old }], history: [{ actorEmail: old, actorName: 'Original name', message: old }] }]
  const result = migrateReferences('improvement-cases', value, old, next)
  assert.equal(result[0].assignments[0].email, next)
  assert.equal(result[0].assignments[0].invitedBy, next)
  assert.equal(result[0].notifications[0].recipientEmail, next)
  assert.equal(result[0].history[0].actorEmail, old)
  assert.equal(result[0].history[0].message, old)
  assert.equal(value[0].assignments[0].invitedBy, old)
})
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
  for (const prefix of ['hub-dashboard-', 'seen-vacation-requests-', 'announcements-dismissed-']) assert.equal(personalKey(`${prefix}${old}`, old, next), `${prefix}${next}`)
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
test('multiplayer index emails follow a rename but display names and opaque values stay', () => {
  const value = {
    games: [{ id: 'g1', players: [{ email: old, name: old, teamCode: 'SC' }, { email: 'other@example.test', name: 'Other', teamCode: 'OPS' }], turn: old, winner: old, scores: [1, 2] },
      { id: 'g2', players: [{ email: 'other@example.test' }, { email: old }], turn: null, winner: 'draw' }],
    notifications: [{ id: 'n1', gameId: 'g1', recipientEmail: old, actorEmail: old, type: 'turn' }],
    operations: [{ operationId: 'op1', fingerprint: 'abc', actorEmail: old, gameId: 'g1' }],
    topWords: [{ id: 'g1:0', word: 'HUND', score: 14, language: 'da', email: old, at: '2026-10-01T10:00:00.000Z' }],
  }
  const result = migrateReferences('multiplayer-index', value, old, next)
  assert.equal(result.topWords[0].email, next)
  assert.equal(result.topWords[0].word, 'HUND')
  assert.equal(result.games[0].players[0].email, next)
  assert.equal(result.games[0].players[0].name, old)
  assert.equal(result.games[0].players[1].email, 'other@example.test')
  assert.equal(result.games[0].turn, next)
  assert.equal(result.games[0].winner, next)
  assert.equal(result.games[1].players[1].email, next)
  assert.equal(result.games[1].winner, 'draw')
  assert.equal(result.games[1].turn, null)
  assert.equal(result.notifications[0].recipientEmail, next)
  assert.equal(result.notifications[0].actorEmail, next)
  assert.equal(result.operations[0].actorEmail, next)
  assert.equal(result.operations[0].fingerprint, 'abc')
  assert.equal(value.games[0].turn, old)
  assert.equal(migrateReferences('multiplayer-command', { opponentEmail: old }, old, next).opponentEmail, old)
  assert.equal(migrateReferences('multiplayer-index', { opponentEmail: old }, old, next).opponentEmail, next)
  assert.equal(relevantKey('multiplayer-index'), true)
})
test('high-five sender, recipient and operation actor emails follow a rename but names and messages stay', () => {
  const value = {
    items: [{ id: 'h1', senderEmail: old, senderName: old, recipientEmail: 'other@example.test', recipientName: 'Other', emoji: '🙌', message: `Thanks ${old}`, readAt: null },
      { id: 'h2', senderEmail: 'other@example.test', recipientEmail: old, recipientName: 'Old Name', message: 'Hi', readAt: null }],
    operations: [{ id: 'op1', fingerprint: 'abc', actorEmail: old, itemId: 'h1' }],
  }
  const result = migrateReferences('high-fives', value, old, next)
  assert.equal(result.items[0].senderEmail, next)
  assert.equal(result.items[0].senderName, old)
  assert.equal(result.items[0].message, `Thanks ${old}`)
  assert.equal(result.items[0].recipientEmail, 'other@example.test')
  assert.equal(result.items[1].senderEmail, 'other@example.test')
  assert.equal(result.items[1].recipientEmail, next)
  assert.equal(result.operations[0].actorEmail, next)
  assert.equal(result.operations[0].fingerprint, 'abc')
  assert.equal(value.items[0].senderEmail, old)
  assert.equal(migrateReferences('high-fives', { recipientEmail: old }, old, next).recipientEmail, next)
  assert.equal(migrateReferences('other-key', { senderEmail: old }, old, next).senderEmail, old)
  assert.equal(relevantKey('high-fives'), true)
})
