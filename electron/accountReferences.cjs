const normalize = value => String(value || '').trim().toLowerCase()
const EMAIL_FIELDS = new Set(['email', 'userEmail', 'creatorEmail', 'ownerEmail', 'authorEmail', 'recipientEmail', 'requestingUserEmail', 'createdBy', 'updatedBy', 'submittedBy', 'reviewedBy', 'reportedBy', 'savedBy', 'publishedBy', 'requestedBy', 'from', 'to', 'assignedTo', 'lastEditedBy', 'editedBy', 'originalCreator', 'claimedBy', 'reviewerEditedBy', 'archivedBy', 'restoredBy'])
const ID_FIELDS = new Set(['userId', 'employeeId', 'ownerId', 'authorId', 'createdById'])
const EMAIL_LISTS = new Set(['userEmails', 'recipients', 'cc', 'bcc', 'mentionedUsers', 'allowedUsers', 'sharedWith', 'teamMembers'])
const EMAIL_ROOT_LISTS = new Set(['guide-admin-emails'])
const KEYED_ROOTS = new Set(['home-office-patterns', 'user-settings', 'client-versions', 'force-update-requests', 'guide-review-notice-log'])
const PERSONAL_PREFIXES = ['app-language-', 'user-theme-', 'active-theme-', 'hub-dashboard-', 'announcements-dismissed-', 'seen-vacation-requests-']
function conflict() { const error = new Error('ACCOUNT_MIGRATION_CONFLICT'); error.code = 'ACCOUNT_MIGRATION_CONFLICT'; throw error }
function personalKey(key, oldEmail, newEmail) {
  for (const prefix of PERSONAL_PREFIXES) {
    if (!key.startsWith(prefix)) continue
    if (normalize(key.slice(prefix.length)) === oldEmail) return `${prefix}${newEmail}`
    if (normalize(key.slice(prefix.length)) === `user_${oldEmail}`) return `${prefix}user_${newEmail}`
  }
  if (key.startsWith(`confetti-shown-${oldEmail}-`)) return `confetti-shown-${newEmail}-${key.slice(`confetti-shown-${oldEmail}-`.length)}`
  return key
}
function migrateReferences(key, value, oldEmail, newEmail) {
  const email = value => typeof value === 'string' && normalize(value) === oldEmail ? newEmail : value
  const identity = value => value === `user_${oldEmail}` ? `user_${newEmail}` : email(value)
  function visit(value, field = '') {
    if (Array.isArray(value)) return value.map(item => typeof item === 'string' && EMAIL_LISTS.has(field) ? identity(item) : visit(item))
    if (!value || typeof value !== 'object') return EMAIL_FIELDS.has(field) ? email(value) : ID_FIELDS.has(field) ? identity(value) : value
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item, name)]))
  }
  if (EMAIL_ROOT_LISTS.has(key) && Array.isArray(value)) return value.map(email)
  const result = visit(value)
  if (KEYED_ROOTS.has(key) && result && typeof result === 'object' && !Array.isArray(result)) {
    for (const source of Object.keys(result).filter(candidate => [oldEmail, `user_${oldEmail}`].includes(normalize(candidate)))) {
      const destination = normalize(source) === oldEmail ? newEmail : `user_${newEmail}`
      if (Object.keys(result).some(candidate => candidate !== source && normalize(candidate) === destination)) conflict()
      const record = result[source]; delete result[source]; result[destination] = record
    }
  }
  if (['employee-birthdays', 'employees'].includes(key) && Array.isArray(value)) {
    value.forEach((record, index) => {
      if (normalize(record?.email) !== oldEmail || ![oldEmail, `user_${oldEmail}`].includes(normalize(record?.id))) return
      const destination = normalize(record.id) === oldEmail ? newEmail : `user_${newEmail}`
      if (value.some((item, other) => other !== index && normalize(item?.id) === destination)) conflict()
      result[index].id = destination
    })
  }
  return result
}
function relevantKey(key) { return !key.startsWith('file_') && !key.startsWith('__') && !key.startsWith('account-') && key !== 'users' && key !== 'active-sessions' }
module.exports = { migrateReferences, personalKey, relevantKey }
