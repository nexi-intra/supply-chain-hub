const path = require('node:path')
const crypto = require('node:crypto')
const { withFileLock, withFileLockAsync } = require('./fileLock.cjs')
const { updateUsers, publicUsers } = require('./userPolicy.cjs')
const { migrateReferences, personalKey, relevantKey } = require('./accountReferences.cjs')
const { registeredTeamDir } = require('./teamReadPolicy.cjs')
const normalize = value => String(value || '').trim().toLowerCase()
const JOURNAL = 'account-migration-journal', CONTROL = 'account-migration-control', RETIRED = 'account-retired-identities'
const terminal = record => !record || ['committed', 'rolled-back'].includes(record.state)
const state = value => value === undefined ? { present: false } : { present: true, value }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function fail(code) { const error = new Error(code); error.code = code; throw error }
function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value) }
function control(record) { return { id: record.id, root: record.root, teamId: record.teamId, oldEmail: record.oldEmail, newEmail: record.newEmail, state: record.state, applied: record.applied, total: record.steps.length } }

function createAccountService({ getRoot, registry, openStore, beforeStep = () => {}, assertNoPendingSync = () => {}, maxJournalBytes = 32 * 1024 * 1024, now = Date.now }) {
  // Coalesces the migration-context read gate that securedIpc runs before and
  // after every IPC call. Only the READ gate is cached; every write/migration
  // path (rename/recover/runWrite) still takes the real account lock, so data
  // stays fully serialized and atomic. A migration started by another client
  // is therefore detected within CONTEXT_TTL_MS instead of instantly.
  const CONTEXT_TTL_MS = 500
  let contextCache = null
  const invalidateContext = () => { contextCache = null }
  // Genbrug store-instansen pr. mappe: openStore/createStore laver ellers en
  // synkron mkdirSync mod netvaerksdrevet ved HVERT kald (fx hver skrivning).
  const storeCache = new Map()
  const openStoreCached = dir => { if (!storeCache.has(dir)) storeCache.set(dir, openStore(dir)); return storeCache.get(dir) }
  const metadata = () => openStoreCached(path.join(getRoot(), '_registry'))
  function readControl() {
    const meta = metadata()
    let record = meta.get(CONTROL, { skipCache: true })
    if (record === undefined) {
      const journal = meta.get(JOURNAL, { skipCache: true })
      if (journal === undefined) return null
      if (!object(journal) || !Array.isArray(journal.steps) || !Array.isArray(journal.scopes)) fail('ACCOUNT_MIGRATION_INVALID')
      record = control(journal)
    }
    if (!object(record) || typeof record.id !== 'string' || record.root !== path.resolve(getRoot()) || !['running', 'failed', 'rolling-back', 'rollback-failed', 'committed', 'rolled-back'].includes(record.state) || !Number.isInteger(record.total) || !Number.isInteger(record.applied) || record.applied < 0 || record.applied > record.total) fail('ACCOUNT_MIGRATION_INVALID')
    return record
  }
  function pending() {
    const progress = readControl()
    if (terminal(progress)) return null
    const journal = metadata().get(JOURNAL, { skipCache: true })
    if (!object(journal) || journal.id !== progress.id || journal.root !== progress.root || !Array.isArray(journal.steps) || !Array.isArray(journal.scopes) || journal.steps.length !== progress.total) fail('ACCOUNT_MIGRATION_INVALID')
    return { ...journal, state: progress.state, applied: progress.applied }
  }
  const globalLock = () => path.join(getRoot(), '_registry', 'account-operation.lock')
  // Uden staleMs blokerede en enkelt crashet/dræbt klient permanent ALLE
  // fremtidige konto-operationer (herunder login) for ALLE klienter, indtil
  // nogen manuelt slettede laasefilen. 60s er langt over enhver legitim
  // holdetid for disse operationer (typisk under et sekund, selv med flere
  // teams paa langsomt SMB), saa en live konkurrerende klient stjaeles aldrig.
  const ACCOUNT_LOCK_STALE_MS = 60000
  const withAccountLock = callback => withFileLock(globalLock(), callback, { attempts: 1, staleMs: ACCOUNT_LOCK_STALE_MS })
  // Login/resume: faa korte gen-forsoeg i stedet for att fejle straks - to
  // klienter der logger ind samtidigt gav ellers falske "Kunne ikke oprette
  // forbindelse"-fejl. Brugeren venter allerede ved en spinner her.
  const withAuthenticationLock = callback => withFileLock(globalLock(), callback, { attempts: 6, delayMs: 120, staleMs: ACCOUNT_LOCK_STALE_MS })
  function assertReady() { if (!terminal(readControl())) fail('ACCOUNT_MIGRATION_PENDING') }
  function synchronous(callback) {
    if (typeof callback !== 'function' || require('node:util').types.isAsyncFunction(callback)) fail('KV_INVALID_OPERATION')
    const result = callback()
    if (result && typeof result.then === 'function') fail('KV_INVALID_OPERATION')
    return result
  }
  function runWrite(callback) { return withAccountLock(() => { assertReady(); return synchronous(callback) }) }
  // Asynkron tvilling til IPC-skrivninger: samme globale konto-laas og
  // migrations-gate, men await-baseret saa main-event-loopet aldrig blokeres.
  // Flere ikke-blokerende forsoeg erstatter sync-vejens attempts:1, saa
  // samtidige skrivninger fra flere klienter ikke fejler unoedigt med KV_LOCK_BUSY.
  async function readControlAsync() {
    const meta = metadata()
    let record = await meta.getAsync(CONTROL, { skipCache: true })
    if (record === undefined) {
      const journal = await meta.getAsync(JOURNAL, { skipCache: true })
      if (journal === undefined) return null
      if (!object(journal) || !Array.isArray(journal.steps) || !Array.isArray(journal.scopes)) fail('ACCOUNT_MIGRATION_INVALID')
      record = control(journal)
    }
    if (!object(record) || typeof record.id !== 'string' || record.root !== path.resolve(getRoot()) || !['running', 'failed', 'rolling-back', 'rollback-failed', 'committed', 'rolled-back'].includes(record.state) || !Number.isInteger(record.total) || !Number.isInteger(record.applied) || record.applied < 0 || record.applied > record.total) fail('ACCOUNT_MIGRATION_INVALID')
    return record
  }
  function runWriteAsync(callback) {
    return withFileLockAsync(globalLock(), async () => {
      if (!terminal(await readControlAsync())) fail('ACCOUNT_MIGRATION_PENDING')
      return callback()
    }, { attempts: 10, delayMs: 150, staleMs: 600000 })
  }
  function runAuthentication(email, callback) {
    return withAuthenticationLock(() => {
      const recovering = !terminal(readControl())
      if (recovering && normalize(email) !== normalize(registry.getCreatorEmail(getRoot()))) fail('ACCOUNT_MIGRATION_PENDING')
      return synchronous(() => callback({ recovering }))
    })
  }
  function context() {
    if (contextCache && now() - contextCache.at < CONTEXT_TTL_MS) return contextCache.value
    // Lock-free read gate: writes are atomic (temp+rename), so a plain read of
    // the migration control always sees a consistent terminal/non-terminal
    // state. Every migration WRITE still takes the account lock (rename/recover/
    // runWrite), so this only removes the lock churn from the read path.
    const record = readControl()
    if (!terminal(record)) fail('ACCOUNT_MIGRATION_PENDING')
    const value = record ? `${record.id}:${record.state}` : null
    contextCache = { at: now(), value }
    return value
  }
  function assertReferences(key, value) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.op === 'string') {
      for (const property of ['value', 'items', 'expected']) if (Object.hasOwn(value, property)) assertReferences(key, value[property])
    }
    const retired = metadata().get(RETIRED, { skipCache: true }) || {}
    for (const [email, record] of Object.entries(retired)) {
      if (personalKey(key, email, record.replacement) !== key || (key === 'users' && ((value?.field && normalize(value.field) === email) || Object.keys(value || {}).some(field => normalize(field) === email))) || !same(value, migrateReferences(key, value, email, record.replacement))) fail('ACCOUNT_RETIRED_REFERENCE')
    }
  }
  function assertAvailable(email) {
    if (metadata().get(RETIRED, { skipCache: true })?.[normalize(email)]) fail('ACCOUNT_EMAIL_RETIRED')
  }
  function status(actor) {
    const record = readControl()
    if (terminal(record)) return null
    if (actor.viewId || (actor.role !== 'creator' && (actor.role !== 'manager' || actor.home.teamId !== record.teamId))) fail('AUTH_FORBIDDEN')
    const { id, state, oldEmail, newEmail, applied, total, teamId } = record
    return { id, state, oldEmail, newEmail, applied, total, teamId }
  }
  function withStores(scopes, callback) {
    const capabilities = new Map()
    const ordered = [...scopes].sort((a, b) => a.directory.localeCompare(b.directory, 'en'))
    function enter(index) {
      if (index === ordered.length) return callback(capabilities)
      const scope = ordered[index]
      return scope.store.withLockedKeys(scope.keys, transaction => { capabilities.set(scope.id, transaction); return enter(index + 1) })
    }
    return enter(0)
  }
  const writeState = (capability, key, value) => value.present ? capability.set(key, value.value) : capability.delete(key)
  function readStep(step, capability) {
    const value = capability.get(step.key)
    if (step.kind === 'sessions') return state(Object.fromEntries(Object.entries(value || {}).filter(([, session]) => normalize(session?.email) === step.email)))
    return state(value)
  }
  function writeStep(step, capability, desired) {
    if (step.kind !== 'sessions') return writeState(capability, step.key, desired)
    const others = Object.fromEntries(Object.entries(capability.get(step.key) || {}).filter(([, session]) => normalize(session?.email) !== step.email))
    capability.set(step.key, { ...others, ...desired.value })
  }
  function apply(record, capabilities, identity, reverse = false) {
    const journal = capabilities.get('_metadata')
    const indexes = record.steps.map((_, index) => index)
    if (reverse) indexes.reverse()
    try {
      // All involved key locks are held. Detect third-party conflicts across
      // the entire recovery plan before making even the first recovery write.
      for (const step of record.steps) {
        const capability = step.scope === '_identity' ? identity : capabilities.get(step.scope)
        const current = readStep(step, capability)
        if (!same(current, step.before) && !same(current, step.after)) fail('ACCOUNT_MIGRATION_CONFLICT')
      }
      for (const index of indexes) {
        const step = record.steps[index], capability = step.scope === '_identity' ? identity : capabilities.get(step.scope)
        const current = readStep(step, capability), expected = reverse ? step.after : step.before, desired = reverse ? step.before : step.after
        // A write may have reached disk before an exception or progress save.
        if (!same(current, desired)) {
          if (!same(current, expected)) fail('ACCOUNT_MIGRATION_CONFLICT')
          beforeStep({ index, scope: step.scope, key: step.key, reverse })
          writeStep(step, capability, desired)
        }
        record.applied = reverse ? Math.min(record.applied, index) : index + 1
        journal.set(CONTROL, control(record))
      }
      record.state = reverse ? 'rolled-back' : 'committed'
      journal.set(CONTROL, control(record))
    } catch (error) {
      record.state = reverse ? 'rollback-failed' : 'failed'
      try { journal.set(CONTROL, control(record)) } catch { /* previous durable control remains authoritative */ }
      throw error
    }
  }
  function rename(actor, folder, operation) {
    invalidateContext()
    return withAccountLock(() => {
      assertReady()
      assertNoPendingSync()
      const oldEmail = normalize(operation?.field), newEmail = normalize(operation?.newField)
      if (operation?.op !== 'renameField' || !oldEmail || oldEmail === newEmail) fail('KV_INVALID_OPERATION')
      const root = getRoot(), teams = registry.listTeams(root)
      const target = registeredTeamDir(root, teams, folder).team
      if (actor.viewId || !['creator', 'manager'].includes(actor.role) || (actor.role !== 'creator' && actor.home.teamId !== target.teamId)) fail('AUTH_FORBIDDEN')
      if (normalize(registry.getCreatorEmail(root)) === oldEmail) fail('AUTH_FORBIDDEN')
      return registry.withIdentityTransaction(root, identity => {
        const meta = metadata(), scopes = [{ id: '_metadata', directory: meta.dataDir, store: meta, keys: [JOURNAL, CONTROL, RETIRED] }]
        for (const team of teams) {
          const directory = registeredTeamDir(root, teams, team.folderName).directory, store = openStore(directory)
          const keys = [...new Set(['users', ...store.keys().filter(relevantKey)])]
          for (const key of [...keys]) { const moved = personalKey(key, oldEmail, newEmail); if (moved !== key) keys.push(moved) }
          scopes.push({ id: `team:${team.teamId}`, directory, store, keys: [...new Set(keys)] })
        }
        const shared = openStore(path.join(root, '_shared'))
        scopes.push({ id: '_shared', directory: shared.dataDir, store: shared, keys: [...new Set(['active-sessions', ...shared.keys().filter(relevantKey)])] })
        return withStores(scopes, capabilities => {
          for (const team of teams) { const value = capabilities.get(`team:${team.teamId}`).get('users'); if (value !== undefined && !object(value)) fail('KV_INVALID_OPERATION') }
          const home = capabilities.get(`team:${target.teamId}`), users = home.get('users') || {}, existing = users[operation.field]
          if (!existing || normalize(existing.email || operation.field) !== oldEmail) fail('KV_CONFLICT')
          for (const team of teams) if (Object.entries(capabilities.get(`team:${team.teamId}`).get('users') || {}).some(([key, user]) => !(team.teamId === target.teamId && key === operation.field) && [oldEmail, newEmail].includes(normalize(user?.email || key)))) fail('KV_CONFLICT')
          const directory = identity.get('directory')
          if (directory[newEmail] && directory[newEmail] !== target.teamId) fail('KV_CONFLICT')
          const retiredBefore = capabilities.get('_metadata').get(RETIRED), retired = retiredBefore || {}, accountId = existing.accountId || crypto.randomUUID()
          if (!object(retired)) fail('KV_INVALID_OPERATION')
          if (retired[newEmail] && retired[newEmail].accountId !== accountId) fail('ACCOUNT_EMAIL_RETIRED')
          // Reuse the same public snapshot/password/role validation without
          // writing anything while constructing the entire preflight plan.
          let nextUsers
          updateUsers({ mutate(key, callback) { nextUsers = callback(structuredClone(users)) } }, { ...operation, newField: newEmail, value: { ...operation.value, email: newEmail } }, actor, registry.getCreatorEmail(root), { accountId })
          const steps = []
          const add = (scope, key, before, after) => { if (!same(state(before), state(after))) steps.push({ scope, key, before: state(before), after: state(after) }) }
          for (const scope of scopes.filter(item => item.id !== '_metadata')) {
            const capability = capabilities.get(scope.id)
            for (const key of scope.keys.filter(relevantKey)) {
              const before = capability.get(key)
              if (before === undefined) continue
              const moved = personalKey(key, oldEmail, newEmail), after = migrateReferences(key, before, oldEmail, newEmail)
              if (moved !== key) {
                if (capability.get(moved) !== undefined) fail('ACCOUNT_MIGRATION_CONFLICT')
                add(scope.id, moved, undefined, after); add(scope.id, key, before, undefined)
              } else add(scope.id, key, before, after)
            }
          }
          const views = identity.get('views')
          add('_identity', 'views', views, migrateReferences('access-views', views, oldEmail, newEmail))
          const nextDirectory = { ...directory, [newEmail]: target.teamId }; delete nextDirectory[oldEmail]
          add('_identity', 'directory', directory, nextDirectory)
          const nextRetired = { ...retired, [oldEmail]: { accountId, replacement: newEmail } }; delete nextRetired[newEmail]
          add('_metadata', RETIRED, retiredBefore, nextRetired)
          add(`team:${target.teamId}`, 'users', users, nextUsers)
          const sessionCapability = capabilities.get('_shared'), sessions = sessionCapability.get('active-sessions')
          if (sessions && (typeof sessions !== 'object' || Array.isArray(sessions))) fail('KV_INVALID_OPERATION')
          const oldSessions = Object.fromEntries(Object.entries(sessions || {}).filter(([, session]) => normalize(session?.email) === oldEmail))
          if (Object.keys(oldSessions).length) steps.push({ scope: '_shared', key: 'active-sessions', kind: 'sessions', email: oldEmail, before: state(oldSessions), after: state({}) })
          const record = { id: crypto.randomUUID(), root: path.resolve(root), teamId: target.teamId, oldEmail, newEmail, initiatedBy: actor.email, state: 'running', applied: 0, steps, scopes: scopes.map(({ id, directory, keys }) => ({ id, directory, keys })) }
          if (Buffer.byteLength(JSON.stringify(record)) > maxJournalBytes) fail('ACCOUNT_MIGRATION_TOO_LARGE')
          capabilities.get('_metadata').set(JOURNAL, record)
          capabilities.get('_metadata').set(CONTROL, control(record))
          apply(record, capabilities, identity)
          return publicUsers(nextUsers)
        })
      })
    })
  }
  function recover(actor, id, reverse) {
    if (actor.role !== 'creator' || actor.viewId) fail('AUTH_FORBIDDEN')
    invalidateContext()
    return withAccountLock(() => {
      const record = pending(), root = getRoot()
      if (!record || record.id !== id || record.root !== path.resolve(root)) fail('ACCOUNT_MIGRATION_NOT_FOUND')
      const teams = registry.listTeams(root)
      const scopes = record.scopes.map(scope => {
        const directory = scope.id === '_metadata' ? path.join(root, '_registry') : scope.id === '_shared' ? path.join(root, '_shared') : registeredTeamDir(root, teams, teams.find(team => scope.id === `team:${team.teamId}`)?.folderName).directory
        if (path.resolve(scope.directory) !== path.resolve(directory)) fail('AUTH_FORBIDDEN')
        return { ...scope, directory, store: openStore(directory) }
      })
      registry.withIdentityTransaction(root, identity => withStores(scopes, capabilities => {
        const snapshot = capabilities.get('_metadata').get(JOURNAL), progress = capabilities.get('_metadata').get(CONTROL)
        if (progress && !same(control(record), progress)) fail('ACCOUNT_MIGRATION_CONFLICT')
        const fresh = progress ? { ...snapshot, state: progress.state, applied: progress.applied } : snapshot
        if (!same(record, fresh)) fail('ACCOUNT_MIGRATION_CONFLICT')
        record.state = reverse ? 'rolling-back' : 'running'
        capabilities.get('_metadata').set(CONTROL, control(record))
        apply(record, capabilities, identity, reverse)
      }))
      return { state: reverse ? 'rolled-back' : 'committed' }
    })
  }
  return { rename, pending, status, assertReady, assertAvailable, assertReferences, context, runWrite, runWriteAsync, runAuthentication, resume: (actor, id) => recover(actor, id, false), rollback: (actor, id) => recover(actor, id, true) }
}
module.exports = { createAccountService }
