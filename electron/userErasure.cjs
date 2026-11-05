// Removes what one team store holds about a deleted account (GDPR art. 17). Shared records the
// person wrote for others (sent messages, shared notes, guides) stay with their recipients.

const same = (a, b) => String(a || '').trim().toLowerCase() === b

// List key -> does this record belong to the person?
const LISTS = {
  'shift-assignments': (item, email) => same(item?.employeeId, email),
  'shift-patterns': (item, email) => same(item?.employeeId, email),
  'vacation-entries': (item, email) => same(item?.userEmail, email),
  'sick-leave-entries': (item, email) => same(item?.userEmail, email),
  'home-office-exceptions': (item, email) => same(item?.userEmail, email),
  'employee-birthdays': (item, email) => same(item?.email, email),
  emails: (item, email) => same(item?.to, email),
  'email-folders': (item, email) => same(item?.userId, email),
  'notebook-notes': (item, email) => item?.isPersonal === true && same(item?.creatorEmail, email),
  'email-notifications': (item, email) => same(item?.to, email),
}
const OBJECTS = ['home-office-patterns', 'user-settings']
const PERSONAL_PREFIXES = ['todos-personal-', 'app-language-', 'user-theme-', 'hub-dashboard-', 'announcements-dismissed-', 'seen-vacation-requests-', 'hub-notifications-dismissed-', 'improvement-seen-', 'hubert-briefing-', 'confetti-shown-', 'link-favorites-']

/** `store` needs getAsync/updateAsync/deleteAsync/keysAsync (raw or offline-resilient store). */
async function eraseUserData(store, rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase()
  const result = { records: 0, keys: 0 }
  if (!email) return result
  for (const [key, belongs] of Object.entries(LISTS)) {
    const list = await store.getAsync(key, { skipCache: true })
    if (!Array.isArray(list)) continue
    const ids = list.filter(item => belongs(item, email) && typeof item.id === 'string').map(item => item.id)
    if (!ids.length) continue
    await store.updateAsync(key, { op: 'remove', ids })
    result.records += ids.length
  }
  for (const key of OBJECTS) {
    const value = await store.getAsync(key, { skipCache: true })
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    for (const field of Object.keys(value).filter(field => same(field, email))) {
      await store.updateAsync(key, { op: 'deleteField', field })
      result.records += 1
    }
  }
  const owns = new RegExp(`[-_]${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|-)`)
  for (const key of await store.keysAsync()) {
    if (!PERSONAL_PREFIXES.some(prefix => key.startsWith(prefix)) || !owns.test(key.toLowerCase())) continue
    await store.deleteAsync(key)
    result.keys += 1
  }
  return result
}

module.exports = { eraseUserData }
