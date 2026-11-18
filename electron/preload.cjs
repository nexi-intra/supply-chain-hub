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
  profile: request => ipcRenderer.invoke('auth:profile', request),
})
contextBridge.exposeInMainWorld('electronImprovements', {
  snapshot: () => ipcRenderer.invoke('improvements:snapshot'),
  command: command => ipcRenderer.invoke('improvements:command', command),
  onChanged: callback => {
    const listener = () => callback()
    ipcRenderer.on('improvements:changed', listener)
    return () => ipcRenderer.removeListener('improvements:changed', listener)
  },
})
// Warehouse Management (Optælling), TCD and TRR only; the backend checks the open hub on every call.
const warehouse = (channel, payload) => ipcRenderer.invoke(`warehouse:${channel}`, payload)
const warehouseEvents = channel => listener => {
  const wrapped = (_event, payload) => listener(payload)
  ipcRenderer.on(`warehouse:${channel}`, wrapped)
  return () => ipcRenderer.removeListener(`warehouse:${channel}`, wrapped)
}
contextBridge.exposeInMainWorld('electronWarehouse', {
  me: () => warehouse('me'),
  app: {
    copyText: text => warehouse('clipboard:write', { text }),
  },
  sap: {
    status: options => warehouse('sap:status', options),
    onFetchProgress: warehouseEvents('sap:fetch-progress'),
  },
  statuses: {
    overview: () => warehouse('statuses:overview'),
    start: request => warehouse('statuses:start', request),
    checklist: id => warehouse('statuses:checklist', { id }),
    lock: (id, language) => warehouse('statuses:lock', { id, language }),
    unlock: request => warehouse('statuses:unlock', request),
    remove: id => warehouse('statuses:delete', { id }),
    archive: id => warehouse('statuses:archive', { id }),
    showInSap: request => warehouse('sap:show-doc', request),
  },
  counts: {
    list: () => warehouse('counts:list'),
    preview: request => warehouse('counts:preview', request),
    create: request => warehouse('counts:create', request),
    open: id => warehouse('counts:open', { id }),
    state: id => warehouse('counts:state', { id }),
    serials: request => warehouse('counts:serials', request),
    materialSerials: request => warehouse('counts:material-serials', request),
    scan: request => warehouse('counts:scan', request),
    undo: request => warehouse('counts:undo', request),
    removeSerial: request => warehouse('counts:remove-serial', request),
    saveLine: request => warehouse('counts:save-line', request),
    deleteLine: request => warehouse('counts:delete-line', request),
    importSerials: request => warehouse('counts:import', request),
    lookupMatdoc: request => warehouse('counts:matdoc-lookup', request),
    importFile: title => warehouse('counts:import-file', { title }),
    requestJoin: id => warehouse('counts:request-join', { id }),
    decideMember: request => warehouse('counts:decide-member', request),
    notifications: () => warehouse('counts:notifications'),
    onChanged: warehouseEvents('counts:changed'),
    claim: request => warehouse('counts:claim', request),
    release: request => warehouse('counts:release', request),
    close: id => warehouse('counts:close', { id }),
    reopen: id => warehouse('counts:reopen', { id }),
    remove: id => warehouse('counts:delete', { id }),
    refetchPreview: id => warehouse('counts:refetch-preview', { id }),
    refetchApply: request => warehouse('counts:refetch-apply', request),
    approval: request => warehouse('counts:approval', request),
    lockMaterial: request => warehouse('counts:material-lock', request),
    requestMaterial: request => warehouse('counts:material-request', request),
    answerMaterialRequest: request => warehouse('counts:material-answer', request),
    releaseMaterial: request => warehouse('counts:material-release', request),
    submitMaterial: request => warehouse('counts:material-submit', request),
    approveClean: id => warehouse('counts:approve-clean', { id }),
    copySerials: request => warehouse('counts:copy-serials', request),
    doc: id => warehouse('counts:doc', { id }),
    fetchDoc: id => warehouse('counts:doc-fetch', { id }),
    flush: id => warehouse('counts:flush', { id }),
    report: (id, language) => warehouse('counts:report', { id, language }),
    openReport: file => warehouse('counts:open-report', { file }),
    showReport: file => warehouse('counts:show-report', { file }),
  },
  rules: {
    get: () => warehouse('rules:get'),
    set: request => warehouse('rules:set', request),
  },
  serialRules: {
    get: () => warehouse('serial-rules:get'),
    set: request => warehouse('serial-rules:set', request),
  },
  placements: {
    save: request => warehouse('placements:save', request),
  },
  roles: {
    me: () => warehouse('roles:me'),
    list: () => warehouse('roles:list'),
    setAdmin: request => warehouse('roles:set-admin', request),
    setRole: request => warehouse('roles:set-role', request),
    setLocationAdmin: request => warehouse('roles:set-location-admin', request),
  },
  piDocs: {
    list: id => warehouse('pidocs:list', { id }),
    create: request => warehouse('pidocs:create', request),
    print: request => warehouse('pidocs:print', request),
    count: request => warehouse('pidocs:count', request),
    post: request => warehouse('pidocs:post', request),
    remove: request => warehouse('pidocs:delete', request),
  },
  sapCheck: {
    overview: () => warehouse('sap-check:overview'),
    latest: () => warehouse('sap-check:latest'),
    run: request => warehouse('sap-check:run', request),
    setSettings: request => warehouse('sap-check:settings', request),
    mail: request => warehouse('sap-check:mail', request),
  },
  // Stempelkort: the own clock; registrations and statistics answer managers only.
  timeclock: {
    status: () => warehouse('timeclock:status'),
    start: request => warehouse('timeclock:start', request),
    pause: () => warehouse('timeclock:pause'),
    resume: () => warehouse('timeclock:resume'),
    stop: request => warehouse('timeclock:stop', request),
    cancel: () => warehouse('timeclock:cancel'),
    entries: request => warehouse('timeclock:entries', request),
    updateEntry: request => warehouse('timeclock:update-entry', request),
    deleteEntry: request => warehouse('timeclock:delete-entry', request),
  },
  // Placeringer: where pallets stand, pick places and FIFO, per hub.
  locations: {
    overview: request => warehouse('locations:overview', request),
    lookupDocument: request => warehouse('locations:lookup-document', request),
    suggest: request => warehouse('locations:suggest', request),
    putAway: request => warehouse('locations:put-away', request),
    take: request => warehouse('locations:take', request),
    refill: request => warehouse('locations:refill', request),
    move: request => warehouse('locations:move', request),
    changeSloc: request => warehouse('locations:change-sloc', request),
    editPallet: request => warehouse('locations:edit-pallet', request),
    search: request => warehouse('locations:search', request),
    materialCard: request => warehouse('locations:material-card', request),
    locationCard: request => warehouse('locations:location-card', request),
    palletCard: request => warehouse('locations:pallet-card', request),
    list: () => warehouse('locations:list'),
    stamp: () => warehouse('locations:stamp'),
    log: request => warehouse('locations:log', request),
    undo: request => warehouse('locations:undo', request),
    rackCard: request => warehouse('locations:rack-card', request),
    mapContents: () => warehouse('locations:map-contents'),
    shelfPut: request => warehouse('locations:shelf-put', request),
    shelfTake: request => warehouse('locations:shelf-take', request),
    shelfMove: request => warehouse('locations:shelf-move', request),
    shelfSet: request => warehouse('locations:shelf-set', request),
    createRack: request => warehouse('locations:create-rack', request),
    addShelf: request => warehouse('locations:add-shelf', request),
    deleteLocations: request => warehouse('locations:delete-locations', request),
    setActiveMany: request => warehouse('locations:set-active-many', request),
    createLocation: request => warehouse('locations:create-location', request),
    createSeries: request => warehouse('locations:create-series', request),
    editLocation: request => warehouse('locations:edit-location', request),
    setActive: request => warehouse('locations:set-active', request),
    setTags: request => warehouse('locations:set-tags', request),
    previewImport: request => warehouse('locations:preview-import', request),
    applyImport: request => warehouse('locations:apply-import', request),
    pending: () => warehouse('locations:pending'),
    acknowledgeFailures: ids => warehouse('locations:ack-failures', { ids }),
    layout: () => warehouse('locations:layout'),
    layoutDraft: () => warehouse('locations:layout-draft'),
    layoutPreview: () => warehouse('locations:layout-preview'),
    layoutVersions: () => warehouse('locations:layout-versions'),
    startLayoutDraft: () => warehouse('locations:layout-start-draft'),
    saveLayoutDraft: request => warehouse('locations:layout-save-draft', request),
    discardLayoutDraft: () => warehouse('locations:layout-discard-draft'),
    publishLayout: request => warehouse('locations:layout-publish', request),
    openLayoutVersion: request => warehouse('locations:layout-open-version', request),
    onChanged: warehouseEvents('locations:changed'),
    onSyncFailed: warehouseEvents('locations:sync-failed'),
    onImportProgress: warehouseEvents('locations:import-progress'),
  },
})
contextBridge.exposeInMainWorld('electronMultiplayer', {
  snapshot: () => ipcRenderer.invoke('multiplayer:snapshot'),
  game: gameId => ipcRenderer.invoke('multiplayer:game', gameId),
  gameStamp: gameId => ipcRenderer.invoke('multiplayer:game-stamp', gameId),
  preview: input => ipcRenderer.invoke('multiplayer:preview', input),
  command: input => ipcRenderer.invoke('multiplayer:command', input),
  warmWords: language => ipcRenderer.invoke('multiplayer:warm-words', language),
  onChanged: callback => {
    const listener = () => callback()
    ipcRenderer.on('multiplayer:changed', listener)
    return () => ipcRenderer.removeListener('multiplayer:changed', listener)
  },
})
contextBridge.exposeInMainWorld('electronHighFives', {
  snapshot: () => ipcRenderer.invoke('highFives:snapshot'),
  command: command => ipcRenderer.invoke('highFives:command', command),
  onChanged: callback => {
    const listener = () => callback()
    ipcRenderer.on('highFives:changed', listener)
    return () => ipcRenderer.removeListener('highFives:changed', listener)
  },
})
contextBridge.exposeInMainWorld('electronNisse', {
  today: preview => ipcRenderer.invoke('nisse:today', preview),
  claim: input => ipcRenderer.invoke('nisse:claim', input),
  finds: () => ipcRenderer.invoke('nisse:finds'),
  onChanged: callback => {
    const listener = () => callback()
    ipcRenderer.on('nisse:changed', listener)
    return () => ipcRenderer.removeListener('nisse:changed', listener)
  },
})
contextBridge.exposeInMainWorld('electronLinks', {
  snapshot: () => ipcRenderer.invoke('links:snapshot'),
  command: command => ipcRenderer.invoke('links:command', command),
  open: linkId => ipcRenderer.invoke('links:open', linkId),
  onChanged: callback => {
    const listener = () => callback()
    ipcRenderer.on('links:changed', listener)
    return () => ipcRenderer.removeListener('links:changed', listener)
  },
})
contextBridge.exposeInMainWorld('electronDesktopNotifications', {
  notify: request => ipcRenderer.invoke('notifications:desktop', request),
  isEnabled: () => ipcRenderer.invoke('notifications:desktop-enabled'),
  setEnabled: enabled => ipcRenderer.invoke('notifications:desktop-enabled', enabled),
  onNavigate: callback => {
    const listener = (_event, target, notificationId) => callback(target, typeof notificationId === 'string' ? notificationId : undefined)
    ipcRenderer.on('app:navigate', listener)
    return () => ipcRenderer.removeListener('app:navigate', listener)
  },
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
  openInWord: (payload) => ipcRenderer.invoke('guides:open-in-word', payload),
  renderPdf: (payload) => ipcRenderer.invoke('guides:render-pdf', payload),
})

// Åbner en fil/mappe-sti i OS'ets standardprogram/Stifinder — bruges til klikbare
// stier i guide-preview (se src/lib/linkify.tsx). Kun til lokale/UNC-stier, ikke URL'er
// (dem åbner en almindelig <a target="_blank"> allerede via setWindowOpenHandler i main.cjs).
contextBridge.exposeInMainWorld('electronShell', {
  openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
  setSpellcheckLanguage: (language) => ipcRenderer.invoke('app:set-spellcheck-language', language),
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
  listUserOptions: (requesterEmail) => ipcRenderer.invoke('registry:list-user-options', requesterEmail),
  listManagerAccess: () => ipcRenderer.invoke('registry:list-manager-access'),
  setManagerAccess: (email, teamIds) => ipcRenderer.invoke('registry:set-manager-access', email, teamIds),
  listMyHubs: () => ipcRenderer.invoke('registry:list-my-hubs'),
  listExtraManagers: () => ipcRenderer.invoke('registry:list-extra-managers'),
  onHubsChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('registry:hubs-changed', listener)
    return () => ipcRenderer.removeListener('registry:hubs-changed', listener)
  },
  getCurrentTeam: () => ipcRenderer.invoke('registry:get-current-team'),
  readTeamKey: (folderName, key) => ipcRenderer.invoke('registry:read-team-key', folderName, key),
  readTeamKeys: (folderName, keys) => ipcRenderer.invoke('registry:read-team-keys', folderName, keys),
  readTeamsKeys: (requests) => ipcRenderer.invoke('registry:read-teams-keys', requests),
  readSharedGuideFile: (kind, guideId, key) => ipcRenderer.invoke('registry:read-shared-guide-file', kind, guideId, key),
  submitGuideAccessRequest: (folderName, request) => ipcRenderer.invoke('registry:submit-guide-access-request', folderName, request),
  submitKnowledgeAccessRequest: (folderName, request) => ipcRenderer.invoke('registry:submit-knowledge-access-request', folderName, request),
})

contextBridge.exposeInMainWorld('electronTranslation', {
  workerAssets: () => ipcRenderer.invoke('translation:worker-assets'),
  registry: () => ipcRenderer.invoke('translation:registry'),
  modelFiles: (pair) => ipcRenderer.invoke('translation:model-files', pair),
})
