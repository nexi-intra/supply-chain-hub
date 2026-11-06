const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { promisify } = require('node:util')
const pbkdf2 = promisify(crypto.pbkdf2)
const ITERATIONS = 150000
const DAY = 24 * 60 * 60 * 1000
// Laesninger mens kontolaasen holdes: friske og uden om store'ns laese-koe.
const UNDER_LOCK_READ = Object.freeze({ skipCache: true, unthrottled: true })
const normalize = value => String(value || '').trim().toLowerCase()
const sessionKey = token => crypto.createHash('sha256').update(token).digest('hex')
function fail(code) { const error = new Error(code); error.code = code; throw error }
function loadDeviceSecret(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  try { fs.writeFileSync(target, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
  for (let attempt = 0; attempt < 3; attempt++) {
    const value = fs.readFileSync(target)
    if (value.length === 32) return value
    if (attempt < 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
  fail('AUTH_DEVICE_KEY_INVALID')
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = await pbkdf2(password, salt, ITERATIONS, 32, 'sha256')
  return `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`
}
async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored || typeof password !== 'string') return false
  if (!stored.startsWith('pbkdf2$')) {
    const actual = Buffer.from(password), expected = Buffer.from(stored)
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  }
  const parts = stored.split('$'), iterations = Number(parts[1])
  if (parts.length !== 4 || !Number.isInteger(iterations) || iterations < 1 || iterations > 1000000) return false
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(parts[2] || '') || !/^[a-zA-Z0-9+/]+={0,2}$/.test(parts[3] || '')) return false
  const salt = Buffer.from(parts[2], 'base64'), expected = Buffer.from(parts[3], 'base64')
  if (salt.length < 8 || salt.length > 64 || expected.length !== 32) return false
  const actual = await pbkdf2(password, salt, iterations, 32, 'sha256')
  return crypto.timingSafeEqual(actual, expected)
}

// Only the backend can mint sessions. Persistent keys are token hashes: the
// shared file does not contain reusable plaintext bearer tokens. Every use
// checks the account and directory afresh (no cached privilege fallback).
function createAuthService({ registry, getRoot, openTeam, openSessions, switchTeam, getActiveFolder = () => null, deviceSecret, now = Date.now, runWrite = callback => callback(), runWriteAsync = async callback => callback(), runAuthentication = (_, callback) => callback({ recovering: false }), runAuthenticationAsync = async (_email, callback) => callback({ recovering: false }), assertAvailable = () => {}, contextTtlMs = 500 }) {
  if (!Buffer.isBuffer(deviceSecret) || deviceSecret.length !== 32) fail('AUTH_DEVICE_KEY_INVALID')
  const bindings = new Map(), busy = new Set(), attempts = new Map(), epochs = new Map()
  // Coalesces the session/role reads behind every IPC call into one snapshot per
  // sender. A revoked session or changed role takes effect within contextTtlMs
  // (main.cjs uses 15 s and clears the cache as soon as its watcher sees
  // active-sessions/users change); migration context (accountService) is gated separately.
  const contextCache = new Map(), CONTEXT_TTL_MS = contextTtlMs
  // Bumped by every invalidation, so a resolve that started before a logout/role change is never cached afterwards.
  let generation = 0
  const pendingResolves = new Map()
  const invalidate = sender => { generation++; contextCache.delete(sender) }
  const sign = record => crypto.createHmac('sha256', deviceSecret).update(JSON.stringify([getRoot(), record.authVersion, record.email, record.userId, record.teamId, record.createdAt, record.expiresAt, record.credentialHash])).digest('hex')
  const signed = record => ({ ...record, signature: sign(record) })
  function account(email) {
    const home = registry.lookupTeamForEmail(getRoot(), email)
    if (!home) fail('AUTH_CREDENTIALS')
    return accountIn(home, openTeam(home).get('users', { skipCache: true }), email)
  }
  async function accountAsync(email, readOptions = { skipCache: true }) {
    const home = registry.lookupTeamForEmail(getRoot(), email)
    if (!home) fail('AUTH_CREDENTIALS')
    const target = openTeam(home)
    return accountIn(home, typeof target.getAsync === 'function' ? await target.getAsync('users', readOptions) : target.get('users', { skipCache: true }), email)
  }
  function accountIn(home, stored, email) {
    const users = stored || {}
    const entry = Object.entries(users).find(([key, user]) => normalize(user?.email || key) === normalize(email))
    if (!entry) fail('AUTH_CREDENTIALS')
    return { home, key: entry[0], user: structuredClone(entry[1]) }
  }
  function approved(user) {
    if (user.status === 'pending') fail('AUTH_PENDING')
    if (user.status && user.status !== 'approved') fail('AUTH_REJECTED')
  }
  function cachedActor(sender) {
    const cached = contextCache.get(sender)
    return cached && cached.root === getRoot() && cached.folder === getActiveFolder() && now() - cached.at < CONTEXT_TTL_MS ? structuredClone(cached.actor) : null
  }
  function remember(sender, actor, startedAt) {
    if (startedAt === generation) contextCache.set(sender, { at: now(), root: getRoot(), folder: getActiveFolder(), actor: structuredClone(actor) })
  }
  function current(sender) {
    const cached = cachedActor(sender)
    if (cached) return cached
    const startedAt = generation
    const actor = resolveCurrent(sender)
    remember(sender, actor, startedAt)
    return structuredClone(actor)
  }
  /** current() without blocking the main thread on the shared drive; concurrent calls for one window share one resolve. */
  async function currentAsync(sender) {
    const cached = cachedActor(sender)
    if (cached) return cached
    let pending = pendingResolves.get(sender)
    if (!pending || pending.generation !== generation || pending.root !== getRoot() || pending.folder !== getActiveFolder()) {
      const startedAt = generation
      const promise = resolveCurrentAsync(sender).then(actor => { remember(sender, actor, startedAt); return actor })
      pending = { promise, generation: startedAt, root: getRoot(), folder: getActiveFolder() }
      pendingResolves.set(sender, pending)
      const entry = pending
      promise.then(() => {}, () => {}).finally(() => { if (pendingResolves.get(sender) === entry) pendingResolves.delete(sender) })
    }
    return structuredClone(await pending.promise)
  }
  function boundSession(sender, sessions) {
    const bound = bindings.get(sender)
    if (!bound || bound.root !== getRoot()) fail('AUTH_REQUIRED')
    const session = sessions?.[sessionKey(bound.token)]
    if (!session || session.authVersion !== 1 || session.expiresAt <= now() || !Number.isFinite(session.expiresAt)) fail('AUTH_REQUIRED')
    if (typeof session.signature !== 'string' || !/^[a-f0-9]{64}$/.test(session.signature) || !crypto.timingSafeEqual(Buffer.from(session.signature, 'hex'), Buffer.from(sign(session), 'hex'))) fail('AUTH_REQUIRED')
    return { bound, session }
  }
  function boundOrFail(sender) {
    const bound = bindings.get(sender)
    if (!bound || bound.root !== getRoot()) fail('AUTH_REQUIRED')
    return bound
  }
  function resolveCurrent(sender) {
    boundOrFail(sender)
    const { bound, session } = boundSession(sender, openSessions().get('active-sessions', { skipCache: true }))
    return actorFrom(bound, session, account(normalize(session.email)))
  }
  async function resolveCurrentAsync(sender, readOptions = { skipCache: true }) {
    boundOrFail(sender)
    if (typeof registry.prefetchAsync === 'function') await registry.prefetchAsync(getRoot())
    const sessionStore = openSessions()
    const sessions = typeof sessionStore.getAsync === 'function' ? await sessionStore.getAsync('active-sessions', readOptions) : sessionStore.get('active-sessions', { skipCache: true })
    const { bound, session } = boundSession(sender, sessions)
    return actorFrom(bound, session, await accountAsync(normalize(session.email), readOptions))
  }
  // Under kontolaasen: samme resolve som currentAsync, men laesningerne springer
  // laese-koeen over (laasen holdes imens) og deles ikke med en koe-ventende resolve.
  async function currentUnderLockAsync(sender) {
    const startedAt = generation
    const actor = await resolveCurrentAsync(sender, UNDER_LOCK_READ)
    remember(sender, actor, startedAt)
    return structuredClone(actor)
  }
  function actorFrom(bound, session, { home, user }) {
    const email = normalize(session.email)
    approved(user)
    if (typeof user.password !== 'string' || !user.password || session.credentialHash !== sessionKey(user.password)) fail('AUTH_REQUIRED')
    if (home.teamId !== session.teamId) fail('AUTH_REQUIRED')
    const creator = normalize(registry.getCreatorEmail(getRoot()))
    const homeRole = email === creator ? 'creator' : user.role === 'manager' || user.role === 'admin' || (!user.role && user.isManager) ? 'manager' : 'user'
    // The open hub decides the role: own role at home, manager in an extra team, nothing elsewhere.
    const teams = [home, ...(homeRole === 'creator' ? [] : registry.managerTeamsForEmail?.(getRoot(), email) || [])]
    const folder = getActiveFolder()
    const activeTeam = !folder ? home : (homeRole === 'creator' ? registry.listTeams(getRoot()) : teams).find(team => team.folderName === folder) || null
    const role = homeRole === 'creator' ? 'creator' : activeTeam?.teamId === home.teamId ? homeRole : activeTeam ? 'manager' : 'user'
    return { token: bound.token, email, userId: session.userId, teamId: session.teamId, expiresAt: session.expiresAt, createdAt: session.createdAt, role, homeRole, home, activeTeam, teams }
  }
  function requireRole(sender, role) {
    const actor = current(sender)
    if (actor.role !== 'creator' && (role === 'creator' || actor.role !== 'manager')) fail('AUTH_FORBIDDEN')
    return actor
  }
  async function exclusive(sender, callback, throttle = false) {
    if (busy.has(sender) || busy.size >= 4) fail('AUTH_BUSY')
    if (throttle) {
      const recent = (attempts.get(sender) || []).filter(time => now() - time < 60000)
      if (recent.length >= 10) fail('AUTH_BUSY')
      attempts.set(sender, [...recent, now()])
    }
    busy.add(sender)
    const epoch = epochs.get(sender) || 0
    const check = () => { if ((epochs.get(sender) || 0) !== epoch) fail('AUTH_REQUIRED') }
    try { return await callback(check) } finally { busy.delete(sender) }
  }
  async function login(sender, request) {
    return exclusive(sender, async (check) => {
      if (typeof request?.email !== 'string' || !request.email.trim() || request.email.length > 254 || typeof request.password !== 'string' || !request.password || request.password.length > 1024) fail('AUTH_CREDENTIALS')
      await registry.prefetchAsync?.(getRoot())
      const identity = normalize(request.email)
      let email = identity
      if (!identity.includes('@')) {
        const candidates = []
        for (const team of registry.listTeams(getRoot())) {
          const users = await openTeam(team).getAsync('users', { skipCache: true }) || {}
          for (const [key, user] of Object.entries(users)) if (normalize(user?.username) === identity) candidates.push(normalize(user.email || key))
        }
        if (new Set(candidates).size !== 1) fail('AUTH_CREDENTIALS')
        email = candidates[0]
      }
      const original = await accountAsync(email)
      if (!await verifyPassword(request.password, original.user.password)) fail('AUTH_CREDENTIALS')
      const upgraded = original.user.password.startsWith('pbkdf2$') ? undefined : await hashPassword(request.password)
      check()
      const actor = await runAuthenticationAsync(email, async ({ recovering }) => {
      // Laasen og alle laesninger er nu async: en logout kan ske ved hvert
      // await, saa epoch tjekkes igen foer hver skrivning og foer binding.
      check()
      // Password hashing is asynchronous: recheck password/status after it.
      const fresh = await accountAsync(email, UNDER_LOCK_READ)
      if (fresh.user.password !== original.user.password || fresh.home.teamId !== original.home.teamId) fail('AUTH_CREDENTIALS')
      approved(fresh.user)
      const effectiveUpgrade = recovering ? undefined : upgraded
      if (effectiveUpgrade) await openTeam(fresh.home).mutateAsync('users', users => {
        check()
        const user = users?.[fresh.key]
        if (!user || user.password !== original.user.password) fail('AUTH_CREDENTIALS')
        approved(user)
        return { ...users, [fresh.key]: { ...user, password: effectiveUpgrade } }
      })
      const token = `session_${crypto.randomBytes(32).toString('hex')}`
      const record = signed({ authVersion: 1, email, userId: `user_${email}`, teamId: fresh.home.teamId, credentialHash: sessionKey(effectiveUpgrade || fresh.user.password), createdAt: now(), expiresAt: now() + (request.rememberMe === true ? 365 * DAY : DAY) })
      const previous = bindings.get(sender)
      await openSessions().mutateAsync('active-sessions', sessions => {
        check()
        if (sessions && (typeof sessions !== 'object' || Array.isArray(sessions))) fail('KV_INVALID_OPERATION')
        const next = recovering ? { ...(sessions || {}) } : Object.fromEntries(Object.entries(sessions || {}).filter(([, value]) => !(value?.authVersion === 1 && Number.isFinite(value.expiresAt) && value.expiresAt <= now())))
        if (previous && previous.root === getRoot() && (!recovering || normalize(next[sessionKey(previous.token)]?.email) === email)) delete next[sessionKey(previous.token)]
        next[sessionKey(token)] = record
        return next
      })
      try { check() } catch (error) {
        // Logout kom mens sessionen blev skrevet: fjern den igen (tokenet er aldrig udleveret).
        await openSessions().updateAsync('active-sessions', { op: 'deleteField', field: sessionKey(token) }).catch(() => {})
        throw error
      }
      bindings.set(sender, { token, root: getRoot() })
      invalidate(sender)
      return currentUnderLockAsync(sender)
      })
      // Starting a team watcher may replay its queue. Do it after releasing
      // the account lock; each queued write acquires that lock independently.
      check()
      switchTeam(actor.home)
      return currentAsync(sender)
    }, true)
  }
  async function signup(sender, request) {
    return exclusive(sender, async (check) => {
      const email = normalize(request?.email)
      if (typeof request?.email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254 || typeof request.password !== 'string' || request.password.length < 6 || request.password.length > 1024 || typeof request.fullName !== 'string' || !request.fullName.trim() || typeof request.phone !== 'string' || !request.phone.trim() || request.fullName.length > 200 || request.phone.length > 80) fail('AUTH_INVALID_SIGNUP')
      if (email === normalize(registry.getCreatorEmail(getRoot()))) fail('AUTH_RESERVED')
      assertAvailable(email)
      let team = registry.lookupTeamForEmail(getRoot(), email)
      if (!team) {
        const teams = registry.listTeams(getRoot())
        if (teams.length === 0) fail('AUTH_NO_TEAMS')
        if (teams.length !== 1) fail('AUTH_PICK_TEAM')
        team = teams[0]
      }
      const password = await hashPassword(request.password)
      check()
      return runWrite(() => {
      assertAvailable(email)
      const assigned = registry.lookupTeamForEmail(getRoot(), email)
      if (assigned && assigned.teamId !== team.teamId) fail('AUTH_EMAIL_EXISTS')
      for (const registered of registry.listTeams(getRoot())) {
        if (Object.entries(openTeam(registered).get('users', { skipCache: true }) || {}).some(([key, user]) => normalize(user?.email || key) === email)) fail('AUTH_EMAIL_EXISTS')
      }
      registry.assignUserToTeam(getRoot(), email, team.teamId)
      const target = openTeam(team)
      target.mutate('users', value => {
        const users = value || {}
        if (Object.entries(users).some(([key, user]) => normalize(user?.email || key) === email)) fail('AUTH_EMAIL_EXISTS')
        return { ...users, [email]: { email, password, fullName: request.fullName.trim(), phone: request.phone.trim(), role: 'user', isManager: false, status: 'pending' } }
      })
      // Notifications are constructed here, never accepted as privileged
      // status/recipient payloads from the signup form.
      const managers = Object.values(target.get('users', { skipCache: true }) || {}).filter(user => (!user.status || user.status === 'approved') && (user.role === 'manager' || user.role === 'admin' || (!user.role && user.isManager)))
      const labels = request.language === 'en' ? ['New signup request', 'A user requests access'] : request.language === 'fi' ? ['Uusi rekisteröitymispyyntö', 'Käyttäjä pyytää käyttöoikeutta'] : request.language === 'sv' ? ['Ny registreringsbegäran', 'En användare begär åtkomst'] : ['Ny tilmeldingsanmodning', 'En bruger anmoder om adgang']
      try { for (const manager of managers) {
        const id = crypto.randomUUID(), message = `${labels[1]}: ${request.fullName.trim()} (${email}), ${request.phone.trim()}`
        target.update('emails', { op: 'append', items: [{ id, from: email, to: manager.email, subject: labels[0], message, timestamp: now(), read: false }] })
        target.update('email-notifications', { op: 'append', items: [{ id: `${id}-notification`, to: manager.email, subject: labels[0], body: message, timestamp: new Date(now()).toISOString(), type: 'user-signup', read: false }] })
      } } catch { console.error('Supply Chain Hub: signup saved, manager notification could not be saved') }
      return { email, status: 'pending' }
      })
    }, true)
  }
  async function resume(sender, token) {
    return exclusive(sender, async (check) => {
      if (typeof token !== 'string' || !/^session_[a-f0-9]{64}$/.test(token)) fail('AUTH_REQUIRED')
      await registry.prefetchAsync?.(getRoot())
      check()
      const previous = bindings.get(sender), attempt = { token, root: getRoot() }
      bindings.set(sender, attempt)
      invalidate(sender)
      try {
        const actor = await currentAsync(sender)
        await runAuthenticationAsync(actor.email, () => actor)
        check()
        switchTeam(actor.home)
        return await currentAsync(sender)
      } catch (error) {
        // Gendan kun hvis bindingen stadig er vores: en logout/forget under et
        // await har allerede fjernet den og maa ikke fortrydes.
        if (bindings.get(sender) === attempt) { if (previous) bindings.set(sender, previous); else bindings.delete(sender) }
        invalidate(sender)
        throw error
      }
    })
  }
  async function renew(sender) {
    const actor = await currentAsync(sender)
    return runAuthenticationAsync(actor.email, async () => {
    if (bindings.get(sender)?.token !== actor.token) fail('AUTH_REQUIRED')
    const key = sessionKey(actor.token)
    await openSessions().mutateAsync('active-sessions', sessions => {
      if (!sessions?.[key] || sessions[key].expiresAt <= now()) fail('AUTH_REQUIRED')
      if (sessions[key].signature !== sign(sessions[key])) fail('AUTH_REQUIRED')
      return { ...sessions, [key]: signed({ ...sessions[key], expiresAt: now() + 365 * DAY }) }
    })
    invalidate(sender)
    return currentUnderLockAsync(sender)
    })
  }
  async function logout(sender) {
    // Epoch, binding og cache ryddes synkront foer foerste await.
    epochs.set(sender, (epochs.get(sender) || 0) + 1)
    const bound = bindings.get(sender)
    bindings.delete(sender)
    invalidate(sender)
    if (bound && bound.root === getRoot()) await runWriteAsync(() => openSessions().updateAsync('active-sessions', { op: 'deleteField', field: sessionKey(bound.token) }))
  }
  async function profile(sender, request) {
    return exclusive(sender, async check => {
      const actor = current(sender), original = account(actor.email)
      if (typeof request?.phone !== 'string' || request.phone.length > 80) fail('AUTH_INVALID_PROFILE')
      const changing = typeof request.newPassword === 'string' && request.newPassword.length > 0
      let password
      if (changing) {
        if (request.newPassword.length < 6 || request.newPassword.length > 1024 || typeof request.currentPassword !== 'string' || request.currentPassword.length > 1024) fail('AUTH_INVALID_PROFILE')
        if (!await verifyPassword(request.currentPassword, original.user.password)) fail('AUTH_CREDENTIALS')
        password = await hashPassword(request.newPassword)
      }
      check()
      return runWrite(() => {
      current(sender)
      openTeam(original.home).mutate('users', users => {
        const latest = users?.[original.key]
        if (!latest || latest.password !== original.user.password) fail('KV_CONFLICT')
        approved(latest)
        return { ...users, [original.key]: { ...latest, phone: request.phone, ...(password ? { password } : {}) } }
      })
      if (password) { epochs.set(sender, (epochs.get(sender) || 0) + 1); bindings.delete(sender); invalidate(sender) }
      return { passwordChanged: changing }
      })
    })
  }
  function forget(sender) { epochs.set(sender, (epochs.get(sender) || 0) + 1); bindings.delete(sender); attempts.delete(sender); invalidate(sender) }
  return { login, signup, resume, current, currentAsync, requireRole, renew, logout, profile, forget, invalidateAll: () => { generation++; contextCache.clear() } }
}
module.exports = { createAuthService, hashPassword, verifyPassword, sessionKey, loadDeviceSecret }
