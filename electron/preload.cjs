// Exposes the shared file-based KV store to the renderer. All file I/O stays
// in the main process; the renderer only sees an async API.
const { contextBridge, ipcRenderer } = require('electron')
const kvChangedListeners = new Set()
ipcRenderer.on('kv:changed', (_event, changedKeys) => {
  for (const listener of kvChangedListeners) listener(changedKeys)
})
contextBridge.exposeInMainWorld('electronAccounts', {
  status: () => ipcRenderer.invoke('accounts:status'),
  resume: id => ipcRenderer.invoke('accounts:resume', id),
  rollback: id => ipcRenderer.invoke('accounts:rollback', id),
})
contextBridge.exposeInMainWorld('electronBackup', {
  export: () => ipcRenderer.invoke('backup:export'),
})
// Login/resume/renew already retry internally against the shared account lock
// (accountService.cjs, ~40 attempts ≈ 8s) before ever throwing KV_LOCK_BUSY, but
// on a genuinely busy SMB share (confirmed live: multiple concurrent clients
// can keep the lock churning for several seconds straight) even that can run
// out. A single leftover KV_LOCK_BUSY must never be shown to the user as "you
// cannot log in" when a retry a moment later would simply work - so retry the
// WHOLE call here too (same backoff+jitter shape already used for KV writes in
// src/lib/electronKvBridge.ts). Kept SHORT (only 2 extra attempts): each retry
// re-runs the full ~8s internal budget above, so a long outer ladder here would
// compound into an excessive total wait. Safe to retry: a busy-lock error means
// the operation never ran, so nothing can be applied twice.
const AUTH_RETRY_BACKOFF_MS = [500, 1500]
async function retryOnLockBusy(invoke) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await invoke()
    } catch (error) {
      const message = String(error?.message ?? error)
      if (attempt >= AUTH_RETRY_BACKOFF_MS.length || !message.includes('KV_LOCK_BUSY')) throw error
      const jitter = 0.7 + Math.random() * 0.6
      await new Promise(resolve => setTimeout(resolve, Math.round(AUTH_RETRY_BACKOFF_MS[attempt] * jitter)))
    }
  }
}
contextBridge.exposeInMainWorld('electronAuth', {
  login: request => retryOnLockBusy(() => ipcRenderer.invoke('auth:login', request)),
  signup: request => ipcRenderer.invoke('auth:signup', request),
  resume: token => retryOnLockBusy(() => ipcRenderer.invoke('auth:resume', token)),
  current: () => ipcRenderer.invoke('auth:current'),
  renew: () => retryOnLockBusy(() => ipcRenderer.invoke('auth:renew')),
  logout: () => ipcRenderer.invoke('auth:logout'),
  selectView: viewId => ipcRenderer.invoke('auth:select-view', viewId),
  profile: request => ipcRenderer.invoke('auth:profile', request),
})
contextBridge.exposeInMainWorld('electronAssistant', {
  status: request => ipcRenderer.invoke('assistant:status', request),
  ask: request => ipcRenderer.invoke('assistant:ask', request),
  stop: options => ipcRenderer.invoke('assistant:stop', options),
  prepare: request => ipcRenderer.invoke('assistant:prepare', request),
  provision: request => ipcRenderer.invoke('assistant:provision', request),
  guide: request => ipcRenderer.invoke('assistant:guide', request),
  image: request => ipcRenderer.invoke('assistant:image', request),
  record: request => ipcRenderer.invoke('assistant:record', request),
  onProvisionProgress: callback => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('assistant:provision-progress', listener)
    return () => ipcRenderer.removeListener('assistant:provision-progress', listener)
  },
  onContextChanged: callback => {
    const listener = () => callback()
    ipcRenderer.on('assistant:context-changed', listener)
    return () => ipcRenderer.removeListener('assistant:context-changed', listener)
  },
  onGuidesChanged: callback => {
    const listener = () => callback()
    ipcRenderer.on('assistant:guides-changed', listener)
    return () => ipcRenderer.removeListener('assistant:guides-changed', listener)
  },
})

contextBridge.exposeInMainWorld('electronKv', {
  get: (key) => ipcRenderer.invoke('kv:get', key),
  getMany: (keys) => ipcRenderer.invoke('kv:get-many', keys),
  set: (key, value) => ipcRenderer.invoke('kv:set', key, value),
  delete: (key) => ipcRenderer.invoke('kv:delete', key),
  keys: () => ipcRenderer.invoke('kv:keys'),
  update: (key, operation) => ipcRenderer.invoke('kv:update', key, operation),
  getDataDir: () => ipcRenderer.invoke('kv:data-dir'),
  getStorageInfo: () => ipcRenderer.invoke('kv:storage-info'),
  chooseDataDir: () => ipcRenderer.invoke('kv:choose-data-dir'),
  getConnectionStatus: () => ipcRenderer.invoke('kv:connection-status'),
  retrySync: () => ipcRenderer.invoke('kv:retry-sync'),
  onConnectionChanged: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('storage:connection-changed', listener)
    return () => ipcRenderer.removeListener('storage:connection-changed', listener)
  },
  onSyncResult: (callback) => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('storage:sync-result', listener)
    return () => ipcRenderer.removeListener('storage:sync-result', listener)
  },
  onChanged: (callback) => {
    kvChangedListeners.add(callback)
    return () => kvChangedListeners.delete(callback)
  },
})

contextBridge.exposeInMainWorld('electronUpdates', {
  getStatus: () => ipcRenderer.invoke('updates:status'),
  check: () => ipcRenderer.invoke('updates:check'),
  history: () => ipcRenderer.invoke('updates:history'),
  selectZip: () => ipcRenderer.invoke('updates:select-zip'),
  publish: (payload) => ipcRenderer.invoke('updates:publish', payload),
  install: (version) => ipcRenderer.invoke('updates:install', version ? { version } : undefined),
  onUpdateAvailable: (callback) => {
    const listener = (_event, manifest) => callback(manifest)
    ipcRenderer.on('updates:available', listener)
    return () => ipcRenderer.removeListener('updates:available', listener)
  },
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('updates:progress', listener)
    return () => ipcRenderer.removeListener('updates:progress', listener)
  },
  onPublishProgress: (callback) => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('updates:publish-progress', listener)
    return () => ipcRenderer.removeListener('updates:publish-progress', listener)
  },
})

contextBridge.exposeInMainWorld('electronGuides', {
  chooseExportDir: () => ipcRenderer.invoke('guides:choose-export-dir'),
  exportDocx: (payload) => ipcRenderer.invoke('guides:export-docx', payload),
})

// Åbner en fil/mappe-sti i OS'ets standardprogram/Stifinder — bruges til klikbare
// stier i guide-preview (se src/lib/linkify.tsx). Kun til lokale/UNC-stier, ikke URL'er
// (dem åbner en almindelig <a target="_blank"> allerede via setWindowOpenHandler i main.cjs).
contextBridge.exposeInMainWorld('electronShell', {
  openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
})

// Centralt team-/bruger-register (Supply Chain Hub multitenancy) — slår en
// emails team op FØR den rigtige per-team KV-store peges på, se registry.cjs.
contextBridge.exposeInMainWorld('electronRegistry', {
  lookupTeam: (email) => ipcRenderer.invoke('registry:lookup-team', email),
  listTeams: () => ipcRenderer.invoke('registry:list-teams'),
  assignUser: (email, teamId) => ipcRenderer.invoke('registry:assign-user', email, teamId),
  switchToTeam: (folderName) => ipcRenderer.invoke('registry:switch-to-team', folderName),
  getCreatorEmail: () => ipcRenderer.invoke('registry:get-creator-email'),
  setCreatorEmail: (email) => ipcRenderer.invoke('registry:set-creator-email', email),
  createTeam: (team) => ipcRenderer.invoke('registry:create-team', team),
  listTeamAdministration: (requesterEmail) => ipcRenderer.invoke('registry:list-team-administration', requesterEmail),
  updateTeam: (requesterEmail, teamId, input) => ipcRenderer.invoke('registry:update-team', requesterEmail, teamId, input),
  listAccessViews: (requesterEmail) => ipcRenderer.invoke('registry:list-access-views', requesterEmail),
  listMyAccessViews: (email) => ipcRenderer.invoke('registry:list-my-access-views', email),
  createAccessView: (requesterEmail, input) => ipcRenderer.invoke('registry:create-access-view', requesterEmail, input),
  updateAccessView: (requesterEmail, viewId, input) => ipcRenderer.invoke('registry:update-access-view', requesterEmail, viewId, input),
  deleteAccessView: (requesterEmail, viewId) => ipcRenderer.invoke('registry:delete-access-view', requesterEmail, viewId),
  listUserOptions: (requesterEmail) => ipcRenderer.invoke('registry:list-user-options', requesterEmail),
  readAccessViewKey: (email, viewId, teamId, key) => ipcRenderer.invoke('registry:read-access-view-key', email, viewId, teamId, key),
  getCurrentTeam: () => ipcRenderer.invoke('registry:get-current-team'),
  readTeamKey: (folderName, key) => ipcRenderer.invoke('registry:read-team-key', folderName, key),
  readTeamKeys: (folderName, keys) => ipcRenderer.invoke('registry:read-team-keys', folderName, keys),
  readTeamsKeys: (requests) => ipcRenderer.invoke('registry:read-teams-keys', requests),
  submitGuideAccessRequest: (folderName, request) => ipcRenderer.invoke('registry:submit-guide-access-request', folderName, request),
})

contextBridge.exposeInMainWorld('electronTranslation', {
  workerAssets: () => ipcRenderer.invoke('translation:worker-assets'),
  registry: () => ipcRenderer.invoke('translation:registry'),
  modelFiles: (pair) => ipcRenderer.invoke('translation:model-files', pair),
})
