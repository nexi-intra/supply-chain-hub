// Exposes the shared file-based KV store to the renderer. All file I/O stays
// in the main process; the renderer only sees an async API.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronKv', {
  get: (key) => ipcRenderer.invoke('kv:get', key),
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
    const listener = (_event, changedKeys) => callback(changedKeys)
    ipcRenderer.on('kv:changed', listener)
    return () => ipcRenderer.removeListener('kv:changed', listener)
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
  getCurrentTeam: () => ipcRenderer.invoke('registry:get-current-team'),
  readTeamKey: (folderName, key) => ipcRenderer.invoke('registry:read-team-key', folderName, key),
  submitGuideAccessRequest: (folderName, request) => ipcRenderer.invoke('registry:submit-guide-access-request', folderName, request),
})

contextBridge.exposeInMainWorld('electronTranslation', {
  workerAssets: () => ipcRenderer.invoke('translation:worker-assets'),
  registry: () => ipcRenderer.invoke('translation:registry'),
  modelFiles: (pair) => ipcRenderer.invoke('translation:model-files', pair),
})
