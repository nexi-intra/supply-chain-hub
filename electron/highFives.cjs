const crypto = require('node:crypto')

const KEY = 'high-fives'
const EMOJIS = Object.freeze(['🙌', '👏', '🎉', '💪', '🔥', '⭐', '🙏', '❤️'])
const MESSAGE_LIMIT = 200
const ITEM_LIMIT = 500
const OPERATION_LIMIT = 1000
const RECEIVED_LIMIT = 100
const TEAM_LIMIT = 50
const ACK_LIMIT = 100
const SEND_LIMIT = 20
const SEND_WINDOW_MS = 3600 * 1000
const RETRIES = 3
const ROLES = ['user', 'manager', 'creator']
const FIELDS = { send: ['recipientEmail', 'emoji', 'message'], acknowledge: ['ids'] }
// C0/C1 controls, line/paragraph separators and bidi overrides.
const UNSAFE_TEXT = /[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/

function fail(code, message) {
  const error = new Error(`${code}: ${message}`)
  error.code = code
  throw error
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
}

function text(value, label, max, code = 'HIGH_FIVES_INVALID') {
  if (typeof value !== 'string' || value.length > max || UNSAFE_TEXT.test(value) || !value.trim()) fail(code, `Invalid ${label}`)
  return value.trim()
}

function identifier(value, label, code = 'HIGH_FIVES_INVALID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail(code, `Invalid ${label}`)
  return value
}

function email(value, code = 'HIGH_FIVES_INVALID') {
  const result = text(value, 'email', 254, code).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(code, 'Invalid email')
  return result
}

function timestamp(value, label, code) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code, `Invalid ${label}`)
}

function normalizeCommand(input) {
  if (!plain(input) || typeof input.type !== 'string' || !Object.hasOwn(FIELDS, input.type)) fail('HIGH_FIVES_INVALID', 'Invalid command')
  if (Reflect.ownKeys(input).some(key => !['operationId', 'type', ...FIELDS[input.type]].includes(key))) fail('HIGH_FIVES_INVALID', 'Unknown command field')
  const command = { operationId: identifier(input.operationId, 'operationId'), type: input.type }
  if (input.type === 'send') {
    command.recipientEmail = email(input.recipientEmail)
    if (!EMOJIS.includes(input.emoji)) fail('HIGH_FIVES_INVALID', 'Invalid emoji')
    command.emoji = input.emoji
    command.message = text(input.message, 'message', MESSAGE_LIMIT)
  } else {
    if (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > ACK_LIMIT) fail('HIGH_FIVES_INVALID', 'Invalid ids')
    command.ids = input.ids.map(id => identifier(id, 'id'))
    if (new Set(command.ids).size !== command.ids.length) fail('HIGH_FIVES_INVALID', 'Duplicate ids')
  }
  return command
}

function readDirectory(input) {
  if (!plain(input) || !Array.isArray(input.people) || !Array.isArray(input.teams)) fail('HIGH_FIVES_DIRECTORY', 'Approved directory is unavailable')
  return {
    teams: input.teams.map(({ folderName, name }) => ({ folderName, name })),
    people: input.people.map(person => ({ email: email(person.email, 'HIGH_FIVES_DIRECTORY'), fullName: person.fullName, teamCode: person.teamCode, role: person.role })),
  }
}

function readData(value) {
  const code = 'HIGH_FIVES_INVALID_DATA'
  if (value === undefined) return { items: [], operations: [] }
  if (!plain(value) || !Array.isArray(value.items) || !Array.isArray(value.operations)) fail(code, 'Invalid shared high-fives')
  for (const item of value.items) {
    if (!plain(item)) fail(code, 'Invalid high-five')
    identifier(item.id, 'id', code)
    email(item.senderEmail, code)
    email(item.recipientEmail, code)
    for (const field of ['senderName', 'senderTeamCode', 'recipientName', 'recipientTeamCode']) text(item[field], field, 200, code)
    text(item.emoji, 'emoji', 16, code)
    text(item.message, 'message', MESSAGE_LIMIT * 2, code)
    timestamp(item.at, 'at', code)
    if (item.readAt !== null) timestamp(item.readAt, 'readAt', code)
  }
  for (const operation of value.operations) {
    if (!plain(operation) || typeof operation.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(operation.fingerprint)) fail(code, 'Invalid operation marker')
    identifier(operation.id, 'operationId', code)
    email(operation.actorEmail, code)
  }
  return value
}

const newestFirst = items => items.map((item, index) => ({ item, index }))
  .sort((a, b) => Date.parse(b.item.at) - Date.parse(a.item.at) || b.index - a.index).map(({ item }) => item)

function createHighFivesService({ getStore, getDirectory, now = Date.now, makeId = crypto.randomUUID, onChanged, directoryTtlMs = 0 } = {}) {
  if (typeof getStore !== 'function' || typeof getDirectory !== 'function' || typeof now !== 'function' || typeof makeId !== 'function' ||
    (onChanged !== undefined && typeof onChanged !== 'function') || !Number.isFinite(directoryTtlMs) || directoryTtlMs < 0) throw new TypeError('Invalid high-fives service dependencies')

  // The directory reads every team's users; calls within the TTL share one read.
  let directoryEntry = null
  function directoryFor(fresh) {
    const at = now()
    if (!fresh && directoryTtlMs > 0 && directoryEntry && at - directoryEntry.at < directoryTtlMs) return directoryEntry.promise
    const promise = (async () => readDirectory(await getDirectory()))()
    if (directoryTtlMs > 0) {
      const entry = { at, promise }
      directoryEntry = entry
      promise.catch(() => { if (directoryEntry === entry) directoryEntry = null })
    }
    return promise
  }
  const invalidateDirectory = () => { directoryEntry = null }

  async function context(actor, write = false, fresh = false) {
    actor = actor && { email: actor.email, role: actor.role, home: actor.home && { folderName: actor.home.folderName } }
    if (!plain(actor) || !ROLES.includes(actor.role) || !plain(actor.home)) fail('AUTH_REQUIRED', 'An authenticated employee is required')
    const actorEmail = email(actor.email, 'AUTH_REQUIRED')
    const matches = (people, candidate) => {
      const found = people.find(item => item.email === candidate)
      return found && actor.home.folderName === found.teamCode && (found.role === undefined || found.role === actor.role) ? found : null
    }
    let directory = await directoryFor(fresh)
    let person = matches(directory.people, actorEmail)
    // A cached directory may predate this person; check the shared drive once before refusing.
    if (!person && directoryTtlMs > 0 && !fresh) {
      directory = await directoryFor(true)
      person = matches(directory.people, actorEmail)
    }
    if (!person) fail('AUTH_REQUIRED', 'An approved current employee is required')
    if (write && actor.role === 'creator') fail('HIGH_FIVES_FORBIDDEN', 'The creator account cannot send or receive high-fives')
    return {
      directory,
      actor: { email: actorEmail, fullName: person.fullName, teamCode: person.teamCode, role: actor.role, canSend: actor.role !== 'creator' },
    }
  }

  function stamp() {
    const value = now()
    if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) fail('HIGH_FIVES_INVALID', 'Invalid service clock')
    return new Date(value).toISOString()
  }

  const newId = () => identifier(makeId(), 'generated id')

  async function changed() {
    if (onChanged) {
      try { await onChanged([KEY]) } catch {}
    }
  }

  const fingerprintOf = (actorEmail, command) => crypto.createHash('sha256').update(JSON.stringify({ actorEmail, command })).digest('hex')

  function publicEntry(item, directory) {
    const sender = directory.people.find(person => person.email === item.senderEmail)
    const recipient = directory.people.find(person => person.email === item.recipientEmail)
    return {
      id: item.id,
      senderName: sender?.fullName ?? item.senderName, senderTeamCode: sender?.teamCode ?? item.senderTeamCode,
      recipientName: recipient?.fullName ?? item.recipientName, recipientTeamCode: recipient?.teamCode ?? item.recipientTeamCode,
      emoji: item.emoji, message: item.message, at: item.at,
    }
  }

  /** Mutates `data` for a send; returns the stored item. */
  function applySend(data, command, ctx, at, fingerprint) {
    const recipient = ctx.directory.people.find(person => person.email === command.recipientEmail)
    if (!recipient || recipient.email === ctx.actor.email || recipient.role === 'creator') fail('HIGH_FIVES_INVALID', 'The recipient must be another approved colleague')
    const since = Date.parse(at) - SEND_WINDOW_MS
    if (data.items.filter(item => item.senderEmail === ctx.actor.email && Date.parse(item.at) > since).length >= SEND_LIMIT) fail('HIGH_FIVES_LIMIT', 'Too many high-fives sent recently')
    const item = {
      id: newId(), senderEmail: ctx.actor.email, senderName: ctx.actor.fullName, senderTeamCode: ctx.actor.teamCode,
      recipientEmail: recipient.email, recipientName: recipient.fullName, recipientTeamCode: recipient.teamCode,
      emoji: command.emoji, message: command.message, at, readAt: null,
    }
    if (data.items.some(current => current.id === item.id)) fail('HIGH_FIVES_CONFLICT', 'Generated id already exists')
    data.items.push(item)
    data.operations.push({ id: command.operationId, actorEmail: ctx.actor.email, fingerprint, at, itemId: item.id })
    return item
  }

  /** Marks the actor's own high-fives read; returns how many changed. */
  function applyAcknowledge(data, command, ctx, at, fingerprint) {
    const targets = command.ids.map(id => data.items.find(item => item.id === id)).filter(Boolean)
    if (targets.some(item => item.recipientEmail !== ctx.actor.email)) fail('HIGH_FIVES_FORBIDDEN', 'Only the recipient can acknowledge a high-five')
    const unread = targets.filter(item => item.readAt === null)
    for (const item of unread) item.readAt = at
    if (unread.length) data.operations.push({ id: command.operationId, actorEmail: ctx.actor.email, fingerprint, at, acknowledged: unread.length })
    return unread.length
  }

  async function command(actor, input) {
    let captured
    try { captured = structuredClone(input) } catch { fail('HIGH_FIVES_INVALID', 'Invalid command payload') }
    const ctx = await context(actor, true, captured?.type === 'send')
    const cmd = normalizeCommand(captured)
    const fingerprint = fingerprintOf(ctx.actor.email, cmd)
    const store = await getStore()
    for (let attempt = 0; ; attempt++) {
      const actual = await store.getAsync(KEY, { skipCache: true })
      const next = structuredClone(readData(actual))
      const known = next.operations.find(operation => operation.id === cmd.operationId)
      if (known) {
        if (known.actorEmail !== ctx.actor.email || known.fingerprint !== fingerprint) fail('HIGH_FIVES_OPERATION_CONFLICT', 'Operation ID is already bound to another actor or payload')
        if (cmd.type === 'acknowledge') return { acknowledged: known.acknowledged ?? 0 }
        const item = next.items.find(current => current.id === known.itemId)
        return item ? publicEntry(item, ctx.directory) : { id: known.itemId }
      }
      const at = stamp()
      const result = cmd.type === 'send' ? applySend(next, cmd, ctx, at, fingerprint) : { acknowledged: applyAcknowledge(next, cmd, ctx, at, fingerprint) }
      if (cmd.type === 'acknowledge' && result.acknowledged === 0) return result
      next.items = next.items.slice(-ITEM_LIMIT)
      next.operations = next.operations.slice(-OPERATION_LIMIT)
      try {
        await store.updateAsync(KEY, { op: 'compareAndSet', expected: actual, value: next })
      } catch (error) {
        if (error.code === 'KV_CONFLICT') {
          if (attempt < RETRIES - 1) continue
          fail('HIGH_FIVES_CONFLICT', 'The high-fives changed while saving')
        }
        throw error
      }
      await changed()
      return cmd.type === 'send' ? publicEntry(result, ctx.directory) : result
    }
  }

  async function snapshot(actor) {
    const ctx = await context(actor)
    const store = await getStore()
    const data = readData(await store.getAsync(KEY, { skipCache: true }))
    const me = ctx.actor.email
    const teamOf = (personEmail, stored) => ctx.directory.people.find(person => person.email === personEmail)?.teamCode ?? stored
    const empty = ctx.actor.role === 'creator'
    const received = empty ? [] : newestFirst(data.items.filter(item => item.recipientEmail === me)).slice(0, RECEIVED_LIMIT).map(item => {
      const { recipientName, recipientTeamCode, ...entry } = publicEntry(item, ctx.directory)
      return { ...entry, readAt: item.readAt }
    })
    const team = empty ? [] : newestFirst(data.items.filter(item =>
      teamOf(item.senderEmail, item.senderTeamCode) === ctx.actor.teamCode || teamOf(item.recipientEmail, item.recipientTeamCode) === ctx.actor.teamCode,
    )).slice(0, TEAM_LIMIT).map(item => publicEntry(item, ctx.directory))
    return {
      actor: { email: me, fullName: ctx.actor.fullName, teamCode: ctx.actor.teamCode, canSend: ctx.actor.canSend },
      received,
      team,
      people: ctx.actor.canSend ? ctx.directory.people.filter(person => person.email !== me && person.role !== 'creator').map(({ email: personEmail, fullName, teamCode }) => ({ email: personEmail, fullName, teamCode })) : [],
      teams: ctx.directory.teams,
    }
  }

  return { snapshot, command, invalidateDirectory }
}

module.exports = { createHighFivesService, EMOJIS }
