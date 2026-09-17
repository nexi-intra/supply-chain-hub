const normalize = value => String(value || '').trim().toLowerCase()
function fail(code = 'AUTH_FORBIDDEN') { const error = new Error(code); error.code = code; throw error }
function publicUsers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, user]) => {
    const { password, ...profile } = user || {}
    return [key, profile]
  }))
}
function updateUsers(store, operation, actor, creatorEmail, trusted = {}) {
  if (actor.viewId || !['creator', 'manager'].includes(actor.role)) fail()
  const allowed = new Set(['setField', 'deleteField', 'renameField'])
  if (!allowed.has(operation?.op) || typeof operation.field !== 'string' || !operation.field) fail()
  const unsafe = new Set(['__proto__', 'constructor', 'prototype'])
  if (unsafe.has(operation.field) || unsafe.has(operation.newField)) fail()
  const targetKey = operation.op === 'renameField' ? operation.newField : operation.field
  if (typeof targetKey !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(targetKey) || targetKey.length > 254) fail()
  let result
  store.mutate('users', value => {
    const users = value || {}
    if (typeof users !== 'object' || Array.isArray(users)) fail('KV_INVALID_OPERATION')
    const existing = users[operation.field], creator = normalize(creatorEmail)
    if (normalize(operation.field) === creator && (operation.op === 'deleteField' || actor.role !== 'creator' || normalize(targetKey) !== creator)) fail()
    // setField creates only. Existing accounts require an explicit public
    // snapshot (renameField also supports an unchanged email).
    if (operation.op === 'setField' && existing) fail('KV_CONFLICT')
    if (operation.op === 'renameField') {
      if (!existing || JSON.stringify(publicUsers({ record: existing }).record) !== JSON.stringify(operation.expected)) fail('KV_CONFLICT')
    }
    const collision = Object.entries(users).some(([key, user]) => key !== operation.field && normalize(user?.email || key) === normalize(targetKey))
    if (collision) fail('KV_CONFLICT')
    const next = { ...users }
    if (operation.op === 'deleteField') delete next[operation.field]
    else {
      const input = operation.value
      if (!input || typeof input !== 'object' || Array.isArray(input) || normalize(input.email) !== normalize(targetKey)) fail('KV_INVALID_OPERATION')
      const record = { ...(existing || {}), ...input, email: normalize(targetKey) }
      // Account continuity is backend-owned, never editable from a form.
      delete record.accountId
      if (trusted.accountId || existing?.accountId) record.accountId = trusted.accountId || existing.accountId
      if (record.role === 'creator' && normalize(targetKey) !== creator) fail()
      if (record.role && !['creator', 'manager', 'admin', 'user'].includes(record.role)) fail()
      if (record.status && !['approved', 'pending', 'rejected'].includes(record.status)) fail()
      if (typeof input.password === 'string' && input.password) {
        if (!/^pbkdf2\$150000\$[a-zA-Z0-9+/]{22}==\$[a-zA-Z0-9+/]{43}=$/.test(input.password)) fail('KV_INVALID_OPERATION')
        record.password = input.password
      } else record.password = existing?.password
      if (!record.password) fail('KV_INVALID_OPERATION')
      if (record.username && Object.entries(users).some(([key, user]) => key !== operation.field && normalize(user?.username) === normalize(record.username))) fail('KV_CONFLICT')
      if (operation.op === 'renameField') delete next[operation.field]
      next[targetKey] = record
    }
    result = publicUsers(next)
    return next
  })
  return result
}
module.exports = { publicUsers, updateUsers }
