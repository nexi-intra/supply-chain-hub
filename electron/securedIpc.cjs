const PUBLIC_CHANNELS = new Set(['auth:login', 'auth:signup', 'auth:resume', 'auth:current', 'auth:logout', 'auth:renew', 'auth:profile', 'registry:list-teams', 'registry:get-creator-email', 'registry:lookup-team', 'kv:connection-status', 'updates:status', 'updates:check', 'updates:history', 'app:set-spellcheck-language'])
const CREATOR_CHANNELS = new Set(['registry:set-creator-email', 'registry:create-team', 'registry:list-team-administration', 'registry:update-team', 'registry:list-user-options', 'registry:list-manager-access', 'registry:set-manager-access', 'kv:choose-data-dir', 'updates:select-zip', 'updates:publish', 'backup:export'])
const GUEST_KEYS = new Set(['app-language-guest', 'user-theme-guest'])
const PERSONAL_KEY = /^(?:app-language-|user-theme-|hub-dashboard-|todos-personal-|hub-notifications-dismissed-|link-favorites-)/
// Personal data (not just preferences): even reading it is limited to the owner.
const OWNER_READ_KEY = /^(?:todos-personal-|hub-notifications-dismissed-)/
const WRITES = new Set(['kv:set', 'kv:update', 'kv:delete'])
// En sund gemning mod det delte drev tager ~1 s (maalt). Over dette er der noget galt.
const SLOW_WRITE_WARNING_MS = 4000
const IDENTITY_WRITES = new Set(['registry:assign-user', 'registry:set-creator-email', 'registry:create-team', 'registry:update-team', 'registry:set-manager-access', 'registry:submit-guide-access-request', 'registry:submit-knowledge-access-request'])
const RECOVERY_CHANNELS = new Set(['accounts:status', 'accounts:resume', 'accounts:rollback'])
function denied(code = 'AUTH_FORBIDDEN') { const error = new Error(code); error.code = code; throw error }

// All registered handlers pass through this entry point. Unknown/new channels
// require a session by default; a caller-supplied email never grants a role.
function createSecuredIpc(native, { auth, trusted, currentFolder, listTeams, accounts = () => null }) {
  return { handle(channel, listener) {
    native.handle(channel, async (event, ...args) => {
      if (!trusted(event)) denied('AUTH_UNTRUSTED_WINDOW')
      // The login screen may install the creator-published latest release.
      // An explicit historical/forced version still requires authentication.
      if (channel === 'updates:install' && args[0] === undefined) return listener(event, ...args)
      if (channel.startsWith('kv:') && ['kv:get', 'kv:get-many', 'kv:set', 'kv:delete', 'kv:update'].includes(channel)) {
        const keys = channel === 'kv:get-many' ? args[0] : [args[0]]
        if (!Array.isArray(keys) || !keys.length || keys.length > 100 || keys.some(key => typeof key !== 'string' || !key || key.length > 512 || key.startsWith('__') || key.startsWith('account-') || key === 'active-sessions' || key === 'improvement-cases' || key === 'multiplayer-index' || key === 'high-fives' || key === 'link-library')) denied()
        if (keys.every(key => GUEST_KEYS.has(key))) return listener(event, ...args)
      }
      if (PUBLIC_CHANNELS.has(channel)) return listener(event, ...args)
      // Async, cached auth: the synchronous variant read the shared drive on the main thread and froze the whole app.
      const service = auth(), actorOf = sender => (typeof service.currentAsync === 'function' ? service.currentAsync(sender) : service.current(sender))
      let actor = await actorOf(event.sender.id)
      // Rolle-tjek venter async paa en frisk aktoer (aldrig synkron M:-laesning paa main-traaden,
      // aldrig en forældet rolle). Den friske aktoer bruges derefter, ogsaa som efterkontrollens scope.
      const requireRole = async role => {
        const fresh = typeof service.requireRoleAsync === 'function' ? await service.requireRoleAsync(event.sender.id, role) : service.requireRole(event.sender.id, role)
        if (fresh) actor = fresh
      }
      if (RECOVERY_CHANNELS.has(channel)) {
        if (channel !== 'accounts:status') await requireRole('creator')
        return listener(event, ...args)
      }
      const accountService = accounts(), contextOf = () => (typeof accountService?.contextAsync === 'function' ? accountService.contextAsync() : accountService?.context())
      const accountContext = await contextOf()
      if (CREATOR_CHANNELS.has(channel)) await requireRole('creator')
      if (channel === 'registry:assign-user') {
        await requireRole('manager')
        if (actor.role !== 'creator' && args[1] !== actor.activeTeam?.teamId) denied()
      }
      if (channel === 'registry:switch-to-team') {
        const target = listTeams().find(team => team.folderName === args[0])
        if (!target || (actor.role !== 'creator' && !actor.teams.some(team => team.teamId === target.teamId))) denied()
      }
      if (channel.startsWith('kv:') && currentFolder() && actor.role !== 'creator' && !actor.teams.some(team => team.folderName === currentFolder())) denied()
      const ownKey = key => [actor.email, actor.userId].some(identity => identity && key.endsWith(`-${identity}`))
      if (channel === 'kv:get' || channel === 'kv:get-many') {
        const keys = channel === 'kv:get-many' ? args[0] : [args[0]]
        if (keys.some(key => OWNER_READ_KEY.test(key) && !ownKey(key))) denied()
      }
      if (WRITES.has(channel)) {
        const key = args[0]
        if (key === 'users' || key === 'guide-admin-emails') await requireRole('manager')
        if (key === 'force-update-requests') {
          const operation = args[1]
          if (!(channel === 'kv:update' && operation?.op === 'deleteField' && operation.field === actor.email)) await requireRole('manager')
        }
        if (key === 'users' && channel !== 'kv:update') denied()
        if (PERSONAL_KEY.test(key) && ![actor.email, actor.userId].some(identity => key.endsWith(`-${identity}`))) denied()
      }
      if (channel.startsWith('assistant:') && channel !== 'assistant:stop') {
        if (args[0]?.token !== actor.token) denied()
      }
      const scope = [actor.token, actor.role, currentFolder()]
      const emailRename = channel === 'kv:update' && args[0] === 'users' && args[1]?.op === 'renameField' && args[1].field !== args[1].newField
      const invoke = () => {
        if (channel === 'improvements:command') accountService?.assertReferences('improvement-cases', args[0])
        if (channel === 'multiplayer:command') accountService?.assertReferences('multiplayer-index', args[0])
        if (channel === 'highFives:command') accountService?.assertReferences('high-fives', args[0])
        if (channel === 'links:command') accountService?.assertReferences('link-library', args[0])
        if (WRITES.has(channel) && !emailRename) {
          accountService?.assertReferences(args[0], args[1])
          if (args[0] === 'users' && args[1]?.op === 'setField') accountService?.assertAvailable(args[1].field)
        }
        if (channel === 'registry:assign-user') accountService?.assertAvailable(args[0])
        return listener(event, ...args)
      }
      // Brugere har rapporteret gemninger der tog 2-5 minutter. Uden maaling kan
      // vi kun gaette paa hvad der brugte tiden. Logges kun naar det er galt, saa
      // den normale drift (~1 s) forbliver stille.
      const domainWrite = channel === 'improvements:command' || channel === 'multiplayer:command' || channel === 'highFives:command' || channel === 'links:command'
      const writeStartedAt = WRITES.has(channel) || domainWrite ? Date.now() : 0
      const checksReferences = WRITES.has(channel) || domainWrite || channel === 'registry:assign-user'
      if (checksReferences && !emailRename && typeof accountService?.prepareReferenceChecksAsync === 'function') await accountService.prepareReferenceChecksAsync()
      const result = await (accountService && !emailRename && (WRITES.has(channel) || IDENTITY_WRITES.has(channel) || domainWrite) ? accountService.runWriteAsync(invoke) : invoke())
      if (writeStartedAt) {
        const elapsedMs = Date.now() - writeStartedAt
        if (elapsedMs >= SLOW_WRITE_WARNING_MS) console.warn(`TCD Hub: LANGSOM gemning ${elapsedMs} ms  ${channel} "${args[0]}"`)
      }
      if (!emailRename && accountService && await contextOf() !== accountContext) denied('AUTH_CONTEXT_CHANGED')
      // A completed own-email migration deliberately revokes this session.
      // Only the backend migration result may bypass the ordinary postcheck.
      if (emailRename && accountService && actor.email.toLowerCase() === args[1].field.toLowerCase() && result?.[args[1].newField]?.email === args[1].newField) return result
      const after = await actorOf(event.sender.id)
      const contextChange = channel === 'registry:switch-to-team' || channel === 'registry:set-creator-email'
      if (after.token !== scope[0] || (!contextChange && (after.role !== scope[1] || currentFolder() !== scope[2]))) denied('AUTH_CONTEXT_CHANGED')
      return result
    })
  } }
}
module.exports = { createSecuredIpc, PUBLIC_CHANNELS, CREATOR_CHANNELS, PERSONAL_KEY }
