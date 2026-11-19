// Link Library: shared work links per team. New links wait for a manager in the owning team
// (managers' own links are approved at once); colleagues can suggest changes and report links.
// Everything is decided here in the main process; the renderer only sends commands.
const crypto = require('node:crypto')
const { normalizeUrl, urlWarnings, domainOf } = require('./linkSafety.cjs')

const KEY = 'link-library'
const ROLES = ['user', 'manager', 'creator']
const LINK_LIMIT = 2000
const OPERATION_LIMIT = 1000
const ENTRY_LIMIT = 50
const RETRIES = 3
const REPORT_REASONS = ['dead', 'wrong', 'suspicious']
const LINK_FIELDS = ['url', 'title', 'description', 'category', 'sharedWithTeamCodes']
const FIELDS = {
  create: LINK_FIELDS,
  update: ['linkId', ...LINK_FIELDS],
  approve: ['linkId'],
  reject: ['linkId', 'note'],
  delete: ['linkId'],
  suggest: ['linkId', 'url', 'title', 'description', 'category', 'note'],
  'resolve-suggestion': ['linkId', 'suggestionId', 'accept'],
  report: ['linkId', 'reason', 'note'],
  'resolve-report': ['linkId', 'reportId', 'action'],
}
const OPTIONAL = { suggest: ['url', 'title', 'description', 'category', 'note'], reject: ['note'], report: ['note'] }
const UNSAFE_TEXT = /[\x00-\x09\x0b-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/

// The code is repeated in the message: only the message survives the trip to the renderer.
function fail(code, message = code) { const error = new Error(message === code ? code : `${code}: ${message}`); error.code = code; throw error }
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
function text(value, label, max, allowEmpty = false) {
  if (typeof value !== 'string' || UNSAFE_TEXT.test(value)) fail('LINKS_INVALID', `Invalid ${label}`)
  const result = value.trim()
  if ((!allowEmpty && !result) || result.length > max) fail('LINKS_INVALID', `Invalid ${label}`)
  return result
}
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail('LINKS_INVALID', `Invalid ${label}`)
  return value
}
function url(value) {
  const result = normalizeUrl(value)
  if (!result) fail('LINKS_INVALID', 'Only http and https addresses can be saved')
  return result
}

function normalizeCommand(input, teamCodes) {
  if (!plain(input) || typeof input.type !== 'string' || !Object.hasOwn(FIELDS, input.type)) fail('LINKS_INVALID', 'Invalid command')
  const allowed = FIELDS[input.type], optional = OPTIONAL[input.type] || []
  if (Reflect.ownKeys(input).some(key => !['operationId', 'type', ...allowed].includes(key))) fail('LINKS_INVALID', 'Unknown command field')
  if (allowed.some(key => !optional.includes(key) && !Object.hasOwn(input, key))) fail('LINKS_INVALID', 'Missing command field')
  const command = { operationId: identifier(input.operationId, 'operationId'), type: input.type }
  const has = key => Object.hasOwn(input, key) && input[key] !== undefined && input[key] !== null
  if (has('linkId')) command.linkId = identifier(input.linkId, 'linkId')
  if (has('url')) command.url = url(input.url)
  if (has('title')) command.title = text(input.title, 'title', 120, input.type === 'suggest')
  if (has('description')) command.description = text(input.description, 'description', 1000, input.type === 'suggest')
  if (has('category')) command.category = text(input.category, 'category', 60, true)
  if (has('note')) command.note = text(input.note, 'note', 500, true)
  if (has('sharedWithTeamCodes')) {
    if (!Array.isArray(input.sharedWithTeamCodes) || input.sharedWithTeamCodes.length > 20 || input.sharedWithTeamCodes.some(item => typeof item !== 'string' || !teamCodes.includes(item))) fail('LINKS_INVALID', 'Unknown team')
    command.sharedWithTeamCodes = [...new Set(input.sharedWithTeamCodes)]
  }
  if (input.type === 'resolve-suggestion') {
    command.suggestionId = identifier(input.suggestionId, 'suggestionId')
    if (typeof input.accept !== 'boolean') fail('LINKS_INVALID', 'Invalid accept')
    command.accept = input.accept
  }
  if (input.type === 'report') {
    if (!REPORT_REASONS.includes(input.reason)) fail('LINKS_INVALID', 'Invalid reason')
    command.reason = input.reason
  }
  if (input.type === 'resolve-report') {
    command.reportId = identifier(input.reportId, 'reportId')
    if (!['dismiss', 'delete'].includes(input.action)) fail('LINKS_INVALID', 'Invalid action')
    command.action = input.action
  }
  if (input.type === 'suggest' && !['url', 'title', 'description', 'category'].some(key => command[key]) && !command.note) fail('LINKS_INVALID', 'Empty suggestion')
  return command
}

function readData(value) {
  if (value === undefined) return { links: [], operations: [] }
  if (!plain(value) || !Array.isArray(value.links) || !Array.isArray(value.operations) || value.links.some(item => !plain(item) || typeof item.id !== 'string' || !normalizeUrl(item.url))) {
    fail('LINKS_INVALID_DATA', 'Invalid shared link library')
  }
  return value
}

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
const isHidden = item => (item.reports || []).some(report => report.status === 'open' && report.reason === 'suspicious')

function createLinksService({ getStore, getDirectory, openExternal, now = Date.now, makeId = crypto.randomUUID, onChanged } = {}) {
  if (typeof getStore !== 'function' || typeof getDirectory !== 'function' || typeof openExternal !== 'function') throw new TypeError('Invalid links service dependencies')

  async function context(actor) {
    if (!plain(actor) || !ROLES.includes(actor.role) || !plain(actor.home) || typeof actor.email !== 'string') fail('AUTH_REQUIRED', 'An authenticated employee is required')
    const directory = await getDirectory()
    if (!plain(directory) || !Array.isArray(directory.people) || !Array.isArray(directory.teams)) fail('LINKS_DIRECTORY', 'Directory unavailable')
    const person = directory.people.find(item => same(item.email, actor.email))
    if (!person || person.teamCode !== actor.home.folderName || (person.role !== undefined && person.role !== actor.role)) fail('AUTH_REQUIRED', 'An approved current employee is required')
    return {
      directory,
      teamCodes: directory.teams.map(team => team.folderName),
      actor: { email: person.email.toLowerCase(), fullName: person.fullName, teamCode: person.teamCode, role: actor.role },
    }
  }

  const manages = (ctx, item) => ctx.actor.role === 'creator' || (ctx.actor.role === 'manager' && ctx.actor.teamCode === item.ownerTeamCode)
  const mine = (ctx, item) => same(item.createdBy, ctx.actor.email)
  function canSee(ctx, item) {
    if (manages(ctx, item)) return true
    if (isHidden(item)) return false
    if (item.status === 'approved') return item.ownerTeamCode === ctx.actor.teamCode || (item.sharedWithTeamCodes || []).includes(ctx.actor.teamCode)
    return mine(ctx, item)
  }
  const nameOf = (ctx, email, stored) => ctx.directory.people.find(person => same(person.email, email))?.fullName ?? stored

  function publicLink(ctx, item) {
    const managed = manages(ctx, item)
    const openReports = (item.reports || []).filter(report => report.status === 'open')
    return {
      id: item.id, url: item.url, domain: domainOf(item.url), title: item.title, description: item.description, category: item.category,
      ownerTeamCode: item.ownerTeamCode, sharedWithTeamCodes: item.sharedWithTeamCodes || [], status: item.status, hidden: isHidden(item),
      createdByName: nameOf(ctx, item.createdBy, item.createdByName), createdAt: item.createdAt, updatedAt: item.updatedAt,
      mine: mine(ctx, item), canManage: managed, warnings: urlWarnings(item.url),
      ...(managed || mine(ctx, item) ? { reviewNote: item.reviewNote || '', reviewedAt: item.reviewedAt || null, reviewedByOther: !!item.reviewedBy && !same(item.reviewedBy, item.createdBy) } : {}),
      ...(managed ? { openReports: openReports.length, openSuggestions: (item.suggestions || []).filter(entry => entry.status === 'pending').length } : {}),
      myReport: openReports.find(report => same(report.by, ctx.actor.email))?.reason ?? null,
      mySuggestionPending: (item.suggestions || []).some(entry => entry.status === 'pending' && same(entry.by, ctx.actor.email)),
    }
  }

  function stamp() {
    const value = now()
    if (!Number.isFinite(value)) fail('LINKS_INVALID', 'Invalid clock')
    return new Date(value).toISOString()
  }
  const newId = () => identifier(makeId(), 'generated id')
  const fingerprintOf = (email, command) => crypto.createHash('sha256').update(JSON.stringify({ email, command })).digest('hex')

  function find(ctx, data, linkId) {
    const item = data.links.find(entry => entry.id === linkId)
    if (!item || !canSee(ctx, item)) fail('LINKS_NOT_FOUND', 'The link does not exist')
    return item
  }
  function requireManager(ctx, data, linkId) {
    const item = data.links.find(entry => entry.id === linkId)
    if (!item || !manages(ctx, item)) fail('LINKS_FORBIDDEN', 'Only a manager in the owning team can do this')
    return item
  }
  function assertUnique(data, ownerTeamCode, href, exceptId) {
    if (data.links.some(item => item.id !== exceptId && item.ownerTeamCode === ownerTeamCode && item.status !== 'rejected' && item.url === href)) fail('LINKS_DUPLICATE', 'The team already has this link')
  }
  const shareable = (ctx, codes, owner) => codes.filter(code => code !== owner)

  /** Applies one command to `data` (mutated); returns the result for the caller. */
  function apply(ctx, data, cmd, at) {
    const me = ctx.actor
    if (cmd.type === 'create') {
      assertUnique(data, me.teamCode, cmd.url, null)
      if (data.links.length >= LINK_LIMIT) fail('LINKS_LIMIT', 'The library is full')
      const managerCreated = me.role === 'manager' || me.role === 'creator'
      const item = {
        id: newId(), url: cmd.url, title: cmd.title, description: cmd.description, category: cmd.category,
        ownerTeamCode: me.teamCode, sharedWithTeamCodes: shareable(ctx, cmd.sharedWithTeamCodes, me.teamCode),
        status: managerCreated ? 'approved' : 'pending', createdBy: me.email, createdByName: me.fullName, createdAt: at, updatedAt: at,
        ...(managerCreated ? { reviewedBy: me.email, reviewedAt: at } : {}), suggestions: [], reports: [],
      }
      data.links.push(item)
      return item
    }
    if (['approve', 'reject', 'resolve-suggestion', 'resolve-report'].includes(cmd.type)) {
      const item = requireManager(ctx, data, cmd.linkId)
      if (cmd.type === 'approve' || cmd.type === 'reject') {
        if (item.status !== 'pending') fail('LINKS_STATE', 'The link is not waiting for approval')
        Object.assign(item, { status: cmd.type === 'approve' ? 'approved' : 'rejected', reviewedBy: me.email, reviewedAt: at, reviewNote: cmd.note || '', updatedAt: at })
        return item
      }
      if (cmd.type === 'resolve-suggestion') {
        const suggestion = (item.suggestions || []).find(entry => entry.id === cmd.suggestionId && entry.status === 'pending')
        if (!suggestion) fail('LINKS_NOT_FOUND', 'The suggestion does not exist')
        if (cmd.accept) {
          if (suggestion.url) assertUnique(data, item.ownerTeamCode, suggestion.url, item.id)
          for (const field of ['url', 'title', 'description', 'category']) if (suggestion[field]) item[field] = suggestion[field]
          item.updatedAt = at
        }
        Object.assign(suggestion, { status: cmd.accept ? 'accepted' : 'rejected', resolvedBy: me.email, resolvedAt: at })
        return item
      }
      const report = (item.reports || []).find(entry => entry.id === cmd.reportId && entry.status === 'open')
      if (!report) fail('LINKS_NOT_FOUND', 'The report does not exist')
      if (cmd.action === 'delete') {
        data.links = data.links.filter(entry => entry.id !== item.id)
        return { id: item.id, deleted: true }
      }
      Object.assign(report, { status: 'resolved', resolvedBy: me.email, resolvedAt: at })
      return item
    }
    if (cmd.type === 'update') {
      const item = find(ctx, data, cmd.linkId)
      const managed = manages(ctx, item)
      if (!managed && !(mine(ctx, item) && item.status !== 'approved')) fail('LINKS_FORBIDDEN', 'Only a manager can change an approved link')
      assertUnique(data, item.ownerTeamCode, cmd.url, item.id)
      Object.assign(item, { url: cmd.url, title: cmd.title, description: cmd.description, category: cmd.category, sharedWithTeamCodes: shareable(ctx, cmd.sharedWithTeamCodes, item.ownerTeamCode), updatedAt: at })
      if (!managed) Object.assign(item, { status: 'pending', reviewNote: '' })
      return item
    }
    if (cmd.type === 'delete') {
      const item = find(ctx, data, cmd.linkId)
      if (!manages(ctx, item) && !(mine(ctx, item) && item.status !== 'approved')) fail('LINKS_FORBIDDEN', 'Only a manager can delete an approved link')
      data.links = data.links.filter(entry => entry.id !== item.id)
      return { id: item.id, deleted: true }
    }
    const item = find(ctx, data, cmd.linkId)
    if (item.status !== 'approved') fail('LINKS_STATE', 'Only approved links can be reported or improved')
    if (cmd.type === 'suggest') {
      if ((item.suggestions || []).filter(entry => entry.status === 'pending').length >= ENTRY_LIMIT) fail('LINKS_LIMIT', 'Too many open suggestions')
      const suggestion = { id: newId(), by: me.email, byName: me.fullName, at, status: 'pending', note: cmd.note || '' }
      for (const field of ['url', 'title', 'description', 'category']) if (cmd[field]) suggestion[field] = cmd[field]
      item.suggestions = [...(item.suggestions || []), suggestion].slice(-ENTRY_LIMIT * 2)
      return item
    }
    if ((item.reports || []).some(report => report.status === 'open' && same(report.by, me.email))) fail('LINKS_CONFLICT', 'You have already reported this link')
    if ((item.reports || []).filter(report => report.status === 'open').length >= ENTRY_LIMIT) fail('LINKS_LIMIT', 'Too many open reports')
    item.reports = [...(item.reports || []), { id: newId(), by: me.email, byName: me.fullName, at, reason: cmd.reason, note: cmd.note || '', status: 'open' }].slice(-ENTRY_LIMIT * 2)
    return item
  }

  async function command(actor, input) {
    let captured
    try { captured = structuredClone(input) } catch { fail('LINKS_INVALID', 'Invalid command payload') }
    const ctx = await context(actor)
    const cmd = normalizeCommand(captured, ctx.teamCodes)
    const fingerprint = fingerprintOf(ctx.actor.email, cmd)
    const store = await getStore()
    for (let attempt = 0; ; attempt++) {
      const actual = await store.getAsync(KEY, { skipCache: true })
      const data = structuredClone(readData(actual))
      const known = data.operations.find(operation => operation.id === cmd.operationId)
      if (known) {
        if (!same(known.actorEmail, ctx.actor.email) || known.fingerprint !== fingerprint) fail('LINKS_OPERATION_CONFLICT', 'Operation ID is already used')
        const item = data.links.find(entry => entry.id === known.linkId)
        return item && canSee(ctx, item) ? publicLink(ctx, item) : { id: known.linkId }
      }
      const at = stamp()
      const result = apply(ctx, data, cmd, at)
      data.operations = [...data.operations, { id: cmd.operationId, actorEmail: ctx.actor.email, fingerprint, at, linkId: result.id }].slice(-OPERATION_LIMIT)
      try {
        await store.updateAsync(KEY, { op: 'compareAndSet', expected: actual, value: data })
      } catch (error) {
        if (error.code === 'KV_CONFLICT') {
          if (attempt < RETRIES - 1) continue
          fail('LINKS_CONFLICT', 'The library changed while saving')
        }
        throw error
      }
      if (onChanged) { try { await onChanged([KEY]) } catch {} }
      return result.deleted ? result : publicLink(ctx, result)
    }
  }

  async function snapshot(actor) {
    const ctx = await context(actor)
    const data = readData(await (await getStore()).getAsync(KEY, { skipCache: true }))
    const visible = data.links.filter(item => canSee(ctx, item))
    const managed = visible.filter(item => manages(ctx, item))
    const current = item => ({ url: item.url, title: item.title, description: item.description, category: item.category })
    return {
      actor: { teamCode: ctx.actor.teamCode, fullName: ctx.actor.fullName, isManager: ctx.actor.role !== 'user' },
      teams: ctx.directory.teams.map(team => ({ folderName: team.folderName, name: team.name })),
      links: visible.map(item => publicLink(ctx, item)),
      review: {
        pending: managed.filter(item => item.status === 'pending').map(item => publicLink(ctx, item)),
        suggestions: managed.flatMap(item => (item.suggestions || []).filter(entry => entry.status === 'pending').map(entry => ({
          id: entry.id, linkId: item.id, linkTitle: item.title, current: current(item),
          url: entry.url, title: entry.title, description: entry.description, category: entry.category, note: entry.note,
          byName: nameOf(ctx, entry.by, entry.byName), at: entry.at, warnings: entry.url ? urlWarnings(entry.url) : [],
        }))),
        reports: managed.flatMap(item => (item.reports || []).filter(entry => entry.status === 'open').map(entry => ({
          id: entry.id, linkId: item.id, linkTitle: item.title, url: item.url, reason: entry.reason, note: entry.note,
          byName: nameOf(ctx, entry.by, entry.byName), at: entry.at,
        }))),
      },
    }
  }

  /** Opens a link the actor may see in the default browser, using the stored address only. */
  async function open(actor, linkId) {
    const ctx = await context(actor)
    const data = readData(await (await getStore()).getAsync(KEY, { skipCache: true }))
    const item = find(ctx, data, identifier(linkId, 'linkId'))
    if (item.status !== 'approved' && !manages(ctx, item) && !mine(ctx, item)) fail('LINKS_NOT_FOUND', 'The link does not exist')
    const href = normalizeUrl(item.url)
    if (!href) fail('LINKS_INVALID_DATA', 'The stored address is not allowed')
    await openExternal(href)
    return { opened: true }
  }

  return { snapshot, command, open }
}

module.exports = { createLinksService, KEY }
