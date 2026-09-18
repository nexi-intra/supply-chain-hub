const PUBLIC_CHANNELS = new Set(['auth:login', 'auth:signup', 'auth:resume', 'auth:current', 'auth:logout', 'auth:renew', 'auth:select-view', 'auth:profile', 'registry:list-teams', 'registry:get-creator-email', 'registry:lookup-team', 'kv:connection-status', 'updates:status', 'updates:check', 'updates:history'])
const CREATOR_CHANNELS = new Set(['registry:set-creator-email', 'registry:create-team', 'registry:list-team-administration', 'registry:update-team', 'registry:list-access-views', 'registry:create-access-view', 'registry:update-access-view', 'registry:delete-access-view', 'registry:list-user-options', 'kv:choose-data-dir', 'updates:select-zip', 'updates:publish', 'backup:export'])
const GUEST_KEYS = new Set(['app-language-guest', 'user-theme-guest'])
const PERSONAL_KEY = /^(?:app-language-|user-theme-|active-theme-|hub-dashboard-|todos-personal-)/
const WRITES = new Set(['kv:set', 'kv:update', 'kv:delete'])
const IDENTITY_WRITES = new Set(['registry:assign-user', 'registry:set-creator-email', 'registry:create-team', 'registry:update-team', 'registry:create-access-view', 'registry:update-access-view', 'registry:delete-access-view', 'registry:submit-guide-access-request'])
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
        if (!Array.isArray(keys) || !keys.length || keys.length > 100 || keys.some(key => typeof key !== 'string' || !key || key.length > 512 || key.startsWith('__') || key.startsWith('account-') || key === 'active-sessions')) denied()
        if (keys.every(key => GUEST_KEYS.has(key))) return listener(event, ...args)
      }
      if (PUBLIC_CHANNELS.has(channel)) return listener(event, ...args)
      const service = auth(), actor = service.current(event.sender.id)
      if (RECOVERY_CHANNELS.has(channel)) {
        if (channel !== 'accounts:status') service.requireRole(event.sender.id, 'creator')
        return listener(event, ...args)
      }
      const accountService = accounts(), accountContext = accountService?.context()
      if (CREATOR_CHANNELS.has(channel)) service.requireRole(event.sender.id, 'creator')
      if (channel === 'registry:assign-user') {
        service.requireRole(event.sender.id, 'manager')
        if (actor.role !== 'creator' && args[1] !== actor.home.teamId) denied()
      }
      if (channel === 'registry:switch-to-team') {
        const target = listTeams().find(team => team.folderName === args[0])
        if (!target || actor.viewId || (actor.role !== 'creator' && target.teamId !== actor.home.teamId)) denied()
      }
      if (channel.startsWith('kv:') && currentFolder() && actor.role !== 'creator' && currentFolder() !== actor.home.folderName) denied()
      if (WRITES.has(channel)) {
        const key = args[0]
        if (actor.viewId && !PERSONAL_KEY.test(key)) denied()
        if (key === 'users' || key === 'guide-admin-emails') service.requireRole(event.sender.id, 'manager')
        if (key === 'force-update-requests') {
          const operation = args[1]
          if (!(channel === 'kv:update' && operation?.op === 'deleteField' && operation.field === actor.email && !actor.viewId)) service.requireRole(event.sender.id, 'manager')
        }
        if (key === 'users' && channel !== 'kv:update') denied()
        if (PERSONAL_KEY.test(key) && ![actor.email, actor.userId].some(identity => key.endsWith(`-${identity}`))) denied()
      }
      if (channel.startsWith('assistant:') && channel !== 'assistant:stop') {
        if (args[0]?.token !== actor.token || (args[0]?.viewId || null) !== actor.viewId) denied()
      }
      const scope = [actor.token, actor.viewId, actor.role, currentFolder()]
      const emailRename = channel === 'kv:update' && args[0] === 'users' && args[1]?.op === 'renameField' && args[1].field !== args[1].newField
      const invoke = () => {
        if (WRITES.has(channel) && !emailRename) {
          accountService?.assertReferences(args[0], args[1])
          if (args[0] === 'users' && args[1]?.op === 'setField') accountService?.assertAvailable(args[1].field)
        }
        if (channel === 'registry:assign-user') accountService?.assertAvailable(args[0])
        return listener(event, ...args)
      }
      const result = await (accountService && !emailRename && (WRITES.has(channel) || IDENTITY_WRITES.has(channel)) ? accountService.runWriteAsync(invoke) : invoke())
      if (!emailRename && accountService?.context() !== accountContext) denied('AUTH_CONTEXT_CHANGED')
      // A completed own-email migration deliberately revokes this session.
      // Only the backend migration result may bypass the ordinary postcheck.
      if (emailRename && accountService && actor.email.toLowerCase() === args[1].field.toLowerCase() && result?.[args[1].newField]?.email === args[1].newField) return result
      const after = service.current(event.sender.id)
      const contextChange = channel === 'registry:switch-to-team' || channel === 'registry:set-creator-email'
      if (after.token !== scope[0] || after.viewId !== scope[1] || (!contextChange && (after.role !== scope[2] || currentFolder() !== scope[3]))) denied('AUTH_CONTEXT_CHANGED')
      return result
    })
  } }
}
module.exports = { createSecuredIpc, PUBLIC_CHANNELS, CREATOR_CHANNELS }
