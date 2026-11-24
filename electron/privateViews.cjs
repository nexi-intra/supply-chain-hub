// Private records in shared team lists. The renderer only ever gets the records the signed-in
// person may see, and every write is checked and translated back onto the full stored list.
// Defence in depth: the files on the share are still readable by anyone with folder access.

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase() && !!String(a || '').trim()
const isManager = actor => actor?.role === 'manager' || actor?.role === 'creator'
function forbidden() { const error = new Error('AUTH_FORBIDDEN'); error.code = 'AUTH_FORBIDDEN'; throw error }
function conflict() { const error = new Error('KV_CONFLICT: Data blev ændret af en anden klient. Genindlæs og prøv igen.'); error.code = 'KV_CONFLICT'; throw error }

const sickNoteVisible = (item, actor) => isManager(actor) || same(item?.userEmail, actor.email) || same(item?.reportedBy, actor.email)

const RULES = {
  emails: {
    view: (item, actor) => same(item?.from, actor.email) || same(item?.to, actor.email) ? item : null,
  },
  'notebook-notes': {
    view: (item, actor) => !item?.isPersonal || same(item.creatorEmail, actor.email) ? item : null,
    canCreate: (item, actor) => !item?.isPersonal || same(item.creatorEmail, actor.email),
  },
  'sick-leave-entries': {
    view: (item, actor) => {
      if (!item || sickNoteVisible(item, actor) || !Object.hasOwn(item, 'reason')) return item
      const { reason, ...rest } = item
      return rest
    },
    // The note was hidden from this person, so their copy never had it: keep the stored one.
    restore: (stored, incoming, actor) => !sickNoteVisible(stored, actor) && Object.hasOwn(stored, 'reason') ? { ...incoming, reason: stored.reason } : incoming,
  },
  // Outbox nobody reads in the app: it may be written to, never read back or changed.
  'email-notifications': { writeOnly: true },
}

const isPrivateKey = key => Object.hasOwn(RULES, key)
const json = value => JSON.stringify(value)

function viewList(rule, list, actor) {
  if (!Array.isArray(list)) return list
  if (rule.writeOnly) return []
  return list.map(item => rule.view(item, actor)).filter(item => item !== null && item !== undefined)
}

/** What `actor` may read of `key`; non-private keys pass through. */
function readView(key, value, actor) {
  const rule = RULES[key]
  if (!rule) return value
  if (rule.writeOnly) return Array.isArray(value) ? [] : value
  return viewList(rule, value, actor)
}

const restoreItem = (rule, stored, incoming, actor) => rule.restore && stored ? rule.restore(stored, incoming, actor) : incoming

/**
 * Turns a write against the actor's view into the operation to run on the stored list:
 * `{ op: null }` = nothing to do. Throws AUTH_FORBIDDEN for records the actor cannot see,
 * KV_CONFLICT when the view the write was based on is out of date.
 */
function planWrite(key, operation, stored, actor) {
  const rule = RULES[key]
  if (!rule) return operation
  if (!operation || typeof operation !== 'object' || operation.path) forbidden()
  const list = Array.isArray(stored) ? stored : stored === undefined ? [] : forbidden()
  const byId = new Map(list.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]))
  const visible = item => !rule.writeOnly && rule.view(item, actor) !== null
  if (operation.op === 'append') {
    if (rule.canCreate && operation.items?.some(item => !rule.canCreate(item, actor))) forbidden()
    return operation
  }
  if (rule.writeOnly) forbidden()
  if (operation.op === 'upsert') {
    const items = (operation.items || []).map(item => {
      const existing = byId.get(item?.id)
      if (existing ? !visible(existing) : rule.canCreate && !rule.canCreate(item, actor)) forbidden()
      return restoreItem(rule, existing, item, actor)
    })
    return { op: 'upsert', items }
  }
  if (operation.op === 'remove') {
    if ((operation.ids || []).some(id => byId.has(id) && !visible(byId.get(id)))) forbidden()
    return operation
  }
  if (operation.op === 'replaceItem') {
    const existing = byId.get(operation.id)
    if (!existing) conflict()
    if (!visible(existing)) forbidden()
    if (json(rule.view(existing, actor)) !== json(operation.expected)) conflict()
    return { op: 'replaceItem', id: operation.id, expected: existing, item: restoreItem(rule, existing, operation.item, actor) }
  }
  if (operation.op === 'compareAndSet' || operation.op === 'set') {
    const current = viewList(rule, list, actor)
    const next = operation.value === undefined || operation.value === null ? [] : operation.value
    if (!Array.isArray(next) || next.some(item => !item || typeof item.id !== 'string')) forbidden()
    if (operation.op === 'compareAndSet' && json(current) !== json(operation.expected ?? [])) {
      if (json(current) === json(next)) return { op: null }
      conflict()
    }
    const wanted = new Map(next.map(item => [item.id, item]))
    const shown = new Set(current.map(item => item.id))
    for (const item of next) {
      const existing = byId.get(item.id)
      if (existing ? !shown.has(item.id) : rule.canCreate && !rule.canCreate(item, actor)) forbidden()
    }
    const value = []
    for (const item of list) {
      if (!item || !shown.has(item.id)) { value.push(item); continue }
      if (wanted.has(item.id)) value.push(restoreItem(rule, item, wanted.get(item.id), actor))
    }
    for (const item of next) if (!byId.has(item.id)) value.push(item)
    return { op: 'compareAndSet', expected: stored, value }
  }
  forbidden()
}

module.exports = { isPrivateKey, readView, planWrite }
