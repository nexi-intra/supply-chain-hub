// When an account is deleted, the cross-team records in _shared stop pointing at the person:
// high-fives to/from them are removed, and games and improvement cases keep their history
// under a pseudonym ("Slettet bruger") so colleagues' records stay intact (GDPR art. 17).
const crypto = require('node:crypto')

const DELETED_NAME = 'Slettet bruger'
const json = value => JSON.stringify(value)
const aliasFor = email => `slettet-${crypto.createHash('sha256').update(email).digest('hex').slice(0, 12)}@slettet.invalid`

/** Deep copy where the person's e-mail and name no longer appear. */
function pseudonymise(value, email, fullName, alias) {
  const name = String(fullName || '').trim()
  // A full name ("Anna Holm") is also replaced inside sentences; a single word only as a whole value.
  const inText = name.length >= 5 && name.includes(' ')
  const walk = item => {
    if (typeof item === 'string') {
      if (item.trim().toLowerCase() === email) return alias
      if (name && item.trim() === name) return DELETED_NAME
      return inText && item.includes(name) ? item.split(name).join(DELETED_NAME) : item
    }
    if (Array.isArray(item)) return item.map(walk)
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, entry]) => [walk(key), walk(entry)]))
    return item
  }
  return walk(value)
}

/** Compare-and-set with a few retries, so a concurrent write by a running client is never lost. */
async function rewrite(store, key, transform) {
  for (let attempt = 0; ; attempt++) {
    const current = await store.getAsync(key, { skipCache: true })
    if (current === undefined) return false
    const next = transform(structuredClone(current))
    if (json(next) === json(current)) return false
    try {
      await store.updateAsync(key, { op: 'compareAndSet', expected: current, value: next })
      return true
    } catch (error) {
      if (attempt >= 4 || !String(error?.message).startsWith('KV_CONFLICT')) throw error
    }
  }
}

async function eraseSharedUserData({ shared, games }, rawEmail, fullName) {
  const email = String(rawEmail || '').trim().toLowerCase()
  const result = { highFives: false, improvements: false, links: false, multiplayer: false, games: 0 }
  if (!email) return result
  const alias = aliasFor(email)
  const same = value => String(value || '').trim().toLowerCase() === email

  result.highFives = await rewrite(shared, 'high-fives', data => ({
    ...data,
    items: (data.items || []).filter(item => !same(item.senderEmail) && !same(item.recipientEmail)),
    operations: (data.operations || []).filter(operation => !same(operation.actorEmail)),
  }))

  result.improvements = await rewrite(shared, 'improvement-cases', cases => (Array.isArray(cases) ? cases : []).map(item => {
    const next = pseudonymise(item, email, fullName, alias)
    return { ...next, notifications: (next.notifications || []).filter(note => note.recipientEmail !== alias) }
  }))

  // Links stay for the team; who created, suggested or reported them becomes "Slettet bruger".
  result.links = await rewrite(shared, 'link-library', library => pseudonymise(library, email, fullName, alias))

  result.multiplayer = await rewrite(shared, 'multiplayer-index', index => {
    const next = pseudonymise(index, email, fullName, alias)
    return { ...next, notifications: (next.notifications || []).filter(note => note.recipientEmail !== alias) }
  })
  // Every game file, also those already pruned from the index; unchanged files are only read.
  for (const key of (await games.keysAsync()).filter(item => item.startsWith('game-'))) {
    if (await rewrite(games, key, game => pseudonymise(game, email, fullName, alias))) result.games += 1
  }
  return result
}

module.exports = { eraseSharedUserData, aliasFor, DELETED_NAME }
