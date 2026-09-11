// Electron main process. Loads the Vite dev server during development
// (ELECTRON_START_URL) and the built dist/index.html in production.
//
// Data is stored as JSON files in a shared data directory (see resolveDataDir)
// so multiple machines can point at the same folder on a network share and
// stay in sync. A polling watcher broadcasts external changes to all windows.
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { createStore } = require('./store.cjs')
const { createResilientStore } = require('./offlineSync.cjs')
const updater = require('./updater.cjs')
const registry = require('./registry.cjs')

// Brugerens mappevalg fra Manager Panel gemmes her og overlever opdateringer.
function userConfigPath() {
  return path.join(app.getPath('userData'), 'storage-config.json')
}

// Lokal spejl-cache af den delte store — altid tilgængelig, bruges som
// fallback når netværksstien ikke kan læses (se offlineSync.cjs). Navnerummes
// pr. team (scope) så flere teams' offline-caches aldrig blandes sammen på
// samme maskine (relevant for Creators team-skift, se switchToTeamDir).
function localCacheDir(scope) {
  return path.join(app.getPath('userData'), 'offline-cache', scope || '_platform')
}

/**
 * Resolve the shared data directory, in priority order:
 *  1. TCD_HUB_DATA_DIR environment variable
 *  2. "dataDir" in tcd-hub.config.json placed next to the executable
 *  3. Folder chosen in the app (Manager Panel), stored in userData
 *  4. Local per-user fallback: <userData>/data
 * If a configured directory can't be created/accessed, falls back to local.
 * `failedSources` lists any higher-priority candidates that were attempted
 * and failed before landing on the returned one — used to warn the user that
 * they silently started in local-only mode instead of the intended shared folder.
 */
function resolveDataDir() {
  const candidates = []

  if (process.env.TCD_HUB_DATA_DIR) {
    candidates.push({ dir: process.env.TCD_HUB_DATA_DIR, source: 'env' })
  }

  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'))
  for (const configDir of [exeDir, path.join(__dirname, '..')]) {
    try {
      const configPath = path.join(configDir, 'tcd-hub.config.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (config.dataDir) {
        // Relative paths resolve against the config file's directory.
        candidates.push({ dir: path.resolve(configDir, config.dataDir), source: 'config' })
        break
      }
    } catch {
      // No config file here — try the next location.
    }
  }

  try {
    const userConfig = JSON.parse(fs.readFileSync(userConfigPath(), 'utf8'))
    if (userConfig.dataDir) {
      candidates.push({ dir: userConfig.dataDir, source: 'user' })
    }
  } catch {
    // No user-chosen folder yet.
  }

  candidates.push({ dir: path.join(app.getPath('userData'), 'data'), source: 'default' })

  const failedSources = []
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate.dir, { recursive: true })
      fs.accessSync(candidate.dir, fs.constants.W_OK)
      return { dir: candidate.dir, source: candidate.source, failedSources }
    } catch (err) {
      failedSources.push(candidate.source)
      console.error(`TCD Hub: data dir "${candidate.dir}" is not usable (${err.code}), trying next`)
    }
  }
  throw new Error('No writable data directory available')
}

let store
let dataDirSource = 'default'
// Roden hvor det centrale team-/bruger-register (_registry/) ligger — resolveDataDir()s
// resultat er nu PLATFORMROD, ikke nødvendigvis et specifikt teams egen datamappe.
let platformRoot = null
// Mappenavnet for det team storen aktuelt peger på (null = peger stadig kun på platformroden,
// dvs. før et team er slået op — sker kun helt kortvarigt før login/signup er fuldført).
let currentTeamFolder = null
let stopWatcher = null
// Platform-delt store (Fase 9.1): data der IKKE hører til noget enkelt team (fx madplanen —
// alle teams spiser i samme kantine). Peger på <platformRoot>/_shared/, oprettes ÉN gang ved
// opstart og skiftes ALDRIG ud ved team-skift (i modsætning til `store`). Nøgler heri er
// listet i SHARED_KV_KEYS — kv:*-handlerne ruter dertil i stedet for det aktive teams store.
let sharedStore = null
let stopSharedWatcher = null
const SHARED_KV_KEYS = new Set(['meal-plan-weeks', 'shared-guides'])
let updateCheckTimer = null
let updateInProgress = false
// Forbindelsesstatus til den delte datamappe — opdateres af store.watch()'s
// polling når et netværksdrev forsvinder/kommer tilbage, samt én gang ved
// opstart hvis appen måtte falde tilbage til en lavere-prioriteret mappe.
let storageConnected = true
let storageStartedDisconnected = false
let storageFailedSources = []
let storageConnectionSince = Date.now()

const UPDATE_CHECK_INTERVAL = 15 * 60 * 1000

/** Tjekker manifestet i den fælles opdateringskanal (platformrod, delt af ALLE teams) og notificerer alle vinduer ved ny version. */
function checkForUpdates() {
  try {
    // Undgå at afbryde en opdatering, der allerede henter i baggrunden.
    if (updateInProgress) return null
    const manifest = updater.readManifest(platformRoot)
    if (manifest && updater.isNewerVersion(manifest.version, app.getVersion())) {
      broadcast('updates:available', manifest)
      return manifest
    }
    return null
  } catch (err) {
    console.error('TCD Hub: update check failed', err)
    return null
  }
}

// Debounce batches of changed keys to reduce re-render storms in renderer.
// When multiple files change within 100ms, batch them into a single broadcast.
function createDebouncedBroadcast(delayMs = 100) {
  let timer = null
  let pendingKeys = new Set()

  return (changedKeys) => {
    changedKeys.forEach(k => pendingKeys.add(k))
    
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (pendingKeys.size > 0) {
        broadcast('kv:changed', Array.from(pendingKeys))
        pendingKeys.clear()
      }
      timer = null
    }, delayMs)
  }
}

function startWatcher() {
  if (stopWatcher) stopWatcher()
  const debouncedBroadcast = createDebouncedBroadcast(100)
  stopWatcher = store.watch((changedKeys) => debouncedBroadcast(changedKeys), setStorageConnected)
}

/**
 * Selv-helbredende étgangs-migrering (Fase 9.1): hvis madplanen endnu ikke findes i den delte
 * store, men findes i et af de eksisterende teams mapper (fra dengang den var team-scoped),
 * kopiér den over ÉN gang. Kaldes ved hver opstart — billig no-op når migreringen allerede er sket.
 */
function migrateSharedMealPlanIfNeeded() {
  try {
    if (sharedStore.get('meal-plan-weeks') !== undefined) return
    for (const team of registry.listTeams(platformRoot)) {
      const teamDir = path.join(platformRoot, team.folderName)
      const legacyMealPlan = createStore(teamDir).get('meal-plan-weeks')
      if (legacyMealPlan !== undefined) {
        sharedStore.set('meal-plan-weeks', legacyMealPlan)
        console.log(`TCD Hub: migrerede team-scoped madplan fra "${team.folderName}" til den delte store`)
        return
      }
    }
  } catch (err) {
    console.error('TCD Hub: madplan-migrering fejlede', err)
  }
}

function startSharedWatcher() {
  if (stopSharedWatcher) stopSharedWatcher()
  const debouncedBroadcast = createDebouncedBroadcast(100)
  stopSharedWatcher = sharedStore.watch((changedKeys) => debouncedBroadcast(changedKeys), () => {})
}

/** Aktuel forbindelsesstatus til den delte datamappe — sendt til renderer ved opstart og efter hver ændring. */
function getStorageConnectionStatus() {
  return {
    connected: storageConnected,
    dataDir: store.dataDir,
    source: dataDirSource,
    since: storageConnectionSince,
    startedDisconnected: storageStartedDisconnected,
    failedSources: storageFailedSources,
    pendingSyncCount: store.getPendingSyncCount(),
  }
}

/** Kaldes af store.watch() når dataDir skifter mellem tilgængelig/utilgængelig. */
function setStorageConnected(connected) {
  if (connected === storageConnected) return
  storageConnected = connected
  storageConnectionSince = Date.now()
  broadcast('storage:connection-changed', getStorageConnectionStatus())
}

/** Kaldes af den resiliente store når en offline-kø er (delvist) afspillet mod netværksstien. */
function handleSyncResult(result) {
  broadcast('storage:sync-result', result)
  // Antallet af afventende ændringer kan have ændret sig — opdater også statusvisningen.
  broadcast('storage:connection-changed', getStorageConnectionStatus())
}

// --- Automatisk daglig backup -------------------------------------------
// Skriver hele storen (dekrypteret) til <datamappe>/Backup/tcd-hub-auto-backup-YYYY-MM-DD.json.
// Exclusive create ('wx') sikrer at kun én af de delte klienter skriver dagens fil.
const AUTO_BACKUP_KEEP = 14
const AUTO_BACKUP_CHECK_INTERVAL = 60 * 60 * 1000
let autoBackupTimer = null

function backupStore(targetStore) {
  try {
    const backupDir = path.join(targetStore.dataDir, 'Backup')
    fs.mkdirSync(backupDir, { recursive: true })
    const today = new Date().toISOString().slice(0, 10)
    const target = path.join(backupDir, `tcd-hub-auto-backup-${today}.json`)
    if (fs.existsSync(target)) return

    const payload = JSON.stringify({
      app: 'tcd-hub',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      auto: true,
      data: targetStore.dumpAll(),
    }, null, 2)

    let fd
    try {
      fd = fs.openSync(target, 'wx')
    } catch (err) {
      if (err.code === 'EEXIST') return // En anden klient nåede det først.
      throw err
    }
    try {
      fs.writeSync(fd, payload)
    } finally {
      fs.closeSync(fd)
    }
    console.log(`TCD Hub: automatisk backup skrevet: ${target}`)

    // Rotation: behold de nyeste AUTO_BACKUP_KEEP auto-backups.
    const autoBackups = fs.readdirSync(backupDir)
      .filter((name) => /^tcd-hub-auto-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
    for (const name of autoBackups.slice(0, Math.max(0, autoBackups.length - AUTO_BACKUP_KEEP))) {
      try { fs.unlinkSync(path.join(backupDir, name)) } catch {}
    }
  } catch (err) {
    console.error('TCD Hub: automatisk backup fejlede', err)
  }
}

function runAutoBackup() {
  backupStore(store)
  // Platform-delt data (fx madplanen, Fase 9.1) hører ikke til under noget team og skal derfor
  // sikkerhedskopieres separat, under sin egen _shared/Backup/-mappe.
  if (sharedStore) backupStore(sharedStore)
}

function startAutoBackup() {
  if (autoBackupTimer) clearInterval(autoBackupTimer)
  runAutoBackup()
  // Timetjek dækker både midnat og klienter, der bare får lov at køre.
  autoBackupTimer = setInterval(runAutoBackup, AUTO_BACKUP_CHECK_INTERVAL)
  autoBackupTimer.unref?.()
}

/** Kopierer alle datafiler til den nye mappe og skifter storen over. */
function switchDataDir(newDir) {
  const oldDir = store.dataDir
  if (path.resolve(newDir) === path.resolve(oldDir)) {
    return { dataDir: oldDir, migratedFiles: 0 }
  }

  fs.mkdirSync(newDir, { recursive: true })
  fs.accessSync(newDir, fs.constants.W_OK)

  let migratedFiles = 0
  for (const name of fs.readdirSync(oldDir)) {
    if (!name.endsWith('.json')) continue
    // Eksisterende filer i målmappen bevares — den nye mappe kan allerede
    // være i brug af andre klienter.
    const target = path.join(newDir, name)
    if (!fs.existsSync(target)) {
      fs.copyFileSync(path.join(oldDir, name), target)
      migratedFiles++
    }
  }

  fs.writeFileSync(userConfigPath(), JSON.stringify({ dataDir: newDir }, null, 2))

  store = createResilientStore(createStore(newDir), createStore(localCacheDir(currentTeamFolder)), { onSyncResult: handleSyncResult })
  dataDirSource = 'user'
  // Netop verificeret tilgængelig ovenfor (mkdirSync+accessSync) — nulstil
  // eventuel "startede offline"-tilstand fra opstart.
  storageStartedDisconnected = false
  storageFailedSources = []
  setStorageConnected(true)
  startWatcher()
  startAutoBackup()

  // Alle keys kan have ændret sig — bed alle vinduer om at genindlæse.
  broadcast('kv:changed', store.keys())
  return { dataDir: newDir, migratedFiles }
}

/**
 * Skifter storen over til et specifikt teams datamappe, kaldet efter et
 * registeropslag (email -> team) ved login/signup. I modsætning til
 * switchDataDir() (brugerens manuelle mappevalg i Datalagring) migrerer denne
 * IKKE løse .json-filer over og skriver IKKE storage-config.json — et teams
 * mappe hører til under platformRoot og skal ikke forveksles med brugerens
 * egen manuelle override af HELE lagerstien.
 */
function switchToTeamDir(folderName, newDir) {
  fs.mkdirSync(newDir, { recursive: true })
  fs.accessSync(newDir, fs.constants.W_OK)

  if (stopWatcher) stopWatcher()
  store = createResilientStore(createStore(newDir), createStore(localCacheDir(folderName)), { onSyncResult: handleSyncResult })
  currentTeamFolder = folderName
  dataDirSource = 'team'
  storageStartedDisconnected = false
  storageFailedSources = []
  setStorageConnected(true)
  startWatcher()
  startAutoBackup()

  broadcast('kv:changed', store.keys())
  return { dataDir: newDir }
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    // Avoid a blank white window while the app bundle loads.
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Open external links (e.g. mailto:, https://) in the OS default handler.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // No app menu (autoHideMenuBar) means the usual DevTools accelerators may not
  // be registered — bind F12 / Ctrl+Shift+I explicitly so support/debugging works.
  win.webContents.on('before-input-event', (_event, input) => {
    const isF12 = input.key === 'F12'
    const isCtrlShiftI = input.control && input.shift && input.key.toLowerCase() === 'i'
    if (isF12 || isCtrlShiftI) {
      win.webContents.toggleDevTools()
    }
  })

  const devServerUrl = process.env.ELECTRON_START_URL
  if (devServerUrl) {
    win.loadURL(devServerUrl)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  // Support-diagnostik: viser om WebGL kører på rigtig GPU eller software.
  // Læses først efter 5s — ved ready-tid melder alt altid "disabled" (GPU-
  // processen er ikke færdiginitialiseret). Korrupte GPU-cache-mapper i
  // userData ("Unable to move the cache: Access is denied") kan slå GPU'en
  // helt fra — fix: slet GPUCache/Cache/Dawn*-mapperne i %APPDATA%\tcd-hub.
  setTimeout(() => {
    try { console.log('TCD Hub: GPU feature status', JSON.stringify(app.getGPUFeatureStatus())) } catch { /* ikke kritisk */ }
  }, 5000)
  const resolved = resolveDataDir()
  platformRoot = resolved.dir
  store = createResilientStore(createStore(resolved.dir), createStore(localCacheDir()), { onSyncResult: handleSyncResult })
  dataDirSource = resolved.source
  storageStartedDisconnected = resolved.failedSources.length > 0
  storageFailedSources = resolved.failedSources
  storageConnected = !storageStartedDisconnected
  storageConnectionSince = Date.now()
  console.log('TCD Hub: using data directory', store.dataDir)
  if (storageStartedDisconnected) {
    console.error('TCD Hub: preferred data dir(s) unavailable at startup, fell back after trying:', resolved.failedSources)
  }

  // Platform-delt store (Fase 9.1) — oprettes én gang, uafhængig af hvilket team der er aktivt.
  sharedStore = createResilientStore(createStore(path.join(platformRoot, '_shared')), createStore(localCacheDir('_shared')), { onSyncResult: handleSyncResult })
  migrateSharedMealPlanIfNeeded()
  startSharedWatcher()

  ipcMain.handle('kv:get', (_event, key) => (SHARED_KV_KEYS.has(key) ? sharedStore : store).get(key))
  ipcMain.handle('kv:set', (_event, key, value) => (SHARED_KV_KEYS.has(key) ? sharedStore : store).set(key, value))
  ipcMain.handle('kv:delete', (_event, key) => (SHARED_KV_KEYS.has(key) ? sharedStore : store).delete(key))
  ipcMain.handle('kv:keys', () => store.keys())
  // Atomar array-opdatering under fil-lås; broadcast med det samme så dette
  // vindues useKV-abonnenter opdaterer uden at vente på 2s-polleren.
  ipcMain.handle('kv:update', (_event, key, operation) => {
    const result = (SHARED_KV_KEYS.has(key) ? sharedStore : store).update(key, operation)
    broadcast('kv:changed', [key])
    return result
  })
  ipcMain.handle('kv:data-dir', () => store.dataDir)
  ipcMain.handle('kv:storage-info', () => ({ dataDir: store.dataDir, source: dataDirSource }))
  ipcMain.handle('kv:connection-status', () => getStorageConnectionStatus())
  ipcMain.handle('kv:retry-sync', () => store.retrySyncNow())
  ipcMain.handle('kv:choose-data-dir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Vælg mappe til appens data',
      buttonLabel: 'Brug denne mappe',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: store.dataDir,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return switchDataDir(result.filePaths[0])
  })

  // --- Centralt team-/bruger-register (Supply Chain Hub multitenancy, Fase 1) ---
  ipcMain.handle('registry:lookup-team', (_event, email) => registry.lookupTeamForEmail(platformRoot, email))
  ipcMain.handle('registry:list-teams', () => registry.listTeams(platformRoot))
  ipcMain.handle('registry:assign-user', (_event, email, teamId) => {
    registry.assignUserToTeam(platformRoot, email, teamId)
  })
  ipcMain.handle('registry:switch-to-team', (_event, folderName) => {
    const newDir = path.join(platformRoot, folderName)
    return switchToTeamDir(folderName, newDir)
  })
  ipcMain.handle('registry:get-creator-email', () => registry.getCreatorEmail(platformRoot))
  ipcMain.handle('registry:set-creator-email', (_event, email) => registry.setCreatorEmail(platformRoot, email))
  ipcMain.handle('registry:create-team', (_event, team) => registry.createTeam(platformRoot, team))
  ipcMain.handle('registry:get-current-team', () => {
    if (!currentTeamFolder) return null
    return registry.listTeams(platformRoot).find((team) => team.folderName === currentTeamFolder) || null
  })
  // Tværgående READ-ONLY opslag i et ANDET teams data uden at skifte den aktive store
  // (Team Oversigt, Guide Bibliotek-team-vælger m.fl., se Fase 8). Opretter en midlertidig
  // store-instans for mål-teamets mappe — rører ALDRIG `store`/`currentTeamFolder`.
  ipcMain.handle('registry:read-team-key', (_event, folderName, key) => {
    const teamDir = path.join(platformRoot, folderName)
    return createStore(teamDir).get(key)
  })
  // Tværgående SKRIVNING, men snævert afgrænset til ét formål: en bruger i team A
  // anmoder om adgang til en guide ejet af team B. Gemmes i team B's EGEN
  // 'guide-access-requests', så B's manager ser den som en helt normal del af deres
  // eget team — ingen generel "skriv hvad som helst til et andet team"-mekanisme.
  ipcMain.handle('registry:submit-guide-access-request', (_event, folderName, request) => {
    const teamDir = path.join(platformRoot, folderName)
    return createStore(teamDir).update('guide-access-requests', { op: 'append', items: [request] })
  })

  ipcMain.handle('guides:choose-export-dir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Vælg rodmappe til guidebiblioteket',
      buttonLabel: 'Brug denne mappe',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // --- Neural oversættelse (Bergamot) -------------------------------------
  // Worker/WASM ligger i dist/translation (inde i app.asar); modellerne ligger
  // i den delte datamappe, så én download tjener alle klienter.

  // Renderer kører under file:// hvor fetch() er blokeret — filerne læses derfor her.
  ipcMain.handle('translation:worker-assets', () => {
    const assetDir = path.join(__dirname, '..', 'dist', 'translation')
    try {
      return {
        workerJs: fs.readFileSync(path.join(assetDir, 'translator-worker.js'), 'utf8'),
        glueJs: fs.readFileSync(path.join(assetDir, 'bergamot-translator-worker.js'), 'utf8'),
        wasm: fs.readFileSync(path.join(assetDir, 'bergamot-translator-worker.wasm')).buffer,
      }
    } catch (err) {
      throw new Error(`Oversættelsesfiler mangler i "${assetDir}" (${err.code || err.message}) — bygget uden dist/translation?`)
    }
  })

  // Registry: scanner platformrodens fælles translation-models/ for sprogpar-mapper (fx 'daen', 'enda').
  // Delt af ALLE teams (samme sprogmodeller uanset team) — IKKE inde i et enkelt teams datamappe.
  ipcMain.handle('translation:registry', () => {
    const modelsDir = path.join(platformRoot, 'translation-models')
    if (!fs.existsSync(modelsDir)) return []
    return fs.readdirSync(modelsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[a-z]{4}$/.test(entry.name))
      .map((entry) => ({ from: entry.name.slice(0, 2), to: entry.name.slice(2, 4) }))
  })

  // Modelfiler for ét sprogpar: model*.bin, lex*.bin (shortlist), vocab*.spm.
  ipcMain.handle('translation:model-files', (_event, pair) => {
    if (!/^[a-z]{4}$/.test(String(pair))) throw new Error(`Ugyldigt sprogpar: ${pair}`)
    const dir = path.join(platformRoot, 'translation-models', pair)
    const names = fs.readdirSync(dir)
    const find = (pattern) => {
      const name = names.find((n) => pattern.test(n))
      if (!name) throw new Error(`Manglende modelfil (${pattern}) i ${dir}`)
      return fs.readFileSync(path.join(dir, name)).buffer
    }
    const modelName = names.find((n) => /^model.*\.bin$/.test(n)) || ''
    return {
      model: find(/^model.*\.bin$/),
      shortlist: find(/^lex.*\.bin$/),
      vocabs: names.filter((n) => /\.spm$/.test(n)).sort().map((n) => fs.readFileSync(path.join(dir, n)).buffer),
      // intgemm8-modeller (uden alphas) kræver denne gemm-præcision.
      gemmPrecision: /intgemm8\.bin$/.test(modelName) ? 'int8shiftAll' : undefined,
    }
  })

  // Åbner en fil/mappe-sti (UNC eller drevbogstav) i OS'ets standardprogram/Stifinder — brugt
  // til at gøre stier i guide-tekst klikbare (se src/lib/linkify.tsx). shell.openExternal()
  // virker kun for rigtige URL-schemes (http/mailto/...), IKKE for bare Windows-stier, som
  // derfor har brug for denne egen IPC frem for en almindelig <a href>.
  ipcMain.handle('shell:open-path', async (_event, targetPath) => {
    const errorMessage = await shell.openPath(String(targetPath || ''))
    if (errorMessage) throw new Error(errorMessage)
  })

  // Skriver en genereret DOCX til <rod>/<kategori>/<filnavn> og opretter kategorimappen.
  ipcMain.handle('guides:export-docx', async (_event, payload) => {
    const sanitize = (value) => String(value || '').replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+|\.+$/g, '').trim()
    const root = String(payload?.root || '')
    if (!root || !fs.existsSync(root)) {
      throw new Error(`Eksport-mappen findes ikke: ${root}`)
    }
    const category = sanitize(payload?.category) || 'Ukategoriseret'
    const fileName = sanitize(payload?.fileName) || 'guide.docx'
    const targetDir = path.join(root, category)
    if (!path.resolve(targetDir).startsWith(path.resolve(root))) {
      throw new Error('Ugyldig kategoristi')
    }
    fs.mkdirSync(targetDir, { recursive: true })
    const filePath = path.join(targetDir, fileName)
    await fs.promises.writeFile(filePath, Buffer.from(payload.data))
    return filePath
  })

  ipcMain.handle('updates:status', () => {
    const manifest = updater.readManifest(platformRoot)
    return {
      currentVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      manifest,
      updateAvailable: !!manifest && updater.isNewerVersion(manifest.version, app.getVersion()),
    }
  })

  ipcMain.handle('updates:check', () => checkForUpdates())

  ipcMain.handle('updates:select-zip', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Vælg app-pakke (.zip) der skal publiceres',
      buttonLabel: 'Vælg denne pakke',
      properties: ['openFile'],
      filters: [{ name: 'App-pakke (zip)', extensions: ['zip'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const zipPath = result.filePaths[0]
    const stat = fs.statSync(zipPath)
    return {
      path: zipPath,
      fileName: path.basename(zipPath),
      size: stat.size,
      version: updater.versionFromFilename(zipPath),
    }
  })

  ipcMain.handle('updates:publish', async (_event, payload) => {
    const version = String(payload.version)
    // Tillader at publicere den samme version som denne app selv kører — andre
    // klienter kan sagtens være bagud (fx stadig på 1.4.0), selvom manageren
    // allerede er opdateret. Kun reelle nedgraderinger blokeres.
    if (updater.isNewerVersion(app.getVersion(), version)) {
      throw new Error(`Version ${version} er ældre end denne app (${app.getVersion()})`)
    }
    const existingManifest = updater.readManifest(platformRoot)
    if (existingManifest && updater.isNewerVersion(existingManifest.version, version)) {
      throw new Error(`Version ${version} er ældre end den seneste publicerede version (${existingManifest.version})`)
    }
    const manifest = await updater.publishUpdate(platformRoot, {
      zipPath: String(payload.zipPath),
      version,
      notes: String(payload.notes || ''),
      publishedBy: String(payload.publishedBy || ''),
      skipDelta: !!payload.skipDelta,
      onProgress: (progress) => broadcast('updates:publish-progress', progress),
    })
    checkForUpdates()
    return manifest
  })

  ipcMain.handle('updates:history', () => {
    const current = updater.readManifest(platformRoot)
    const history = updater.readHistory(platformRoot)
    if (current && !history.some((entry) => entry.version === current.version)) {
      return [current, ...history]
    }
    return history
  })

  ipcMain.handle('updates:install', async (_event, payload) => {
    if (!app.isPackaged) {
      throw new Error('Opdatering kan kun installeres fra den byggede app (ikke i udviklingstilstand)')
    }
    if (updateInProgress) return
    const requestedVersion = payload && payload.version ? String(payload.version) : null
    const manifest = requestedVersion
      ? updater.getManifestForVersion(platformRoot, requestedVersion)
      : updater.readManifest(platformRoot)

    if (requestedVersion && !manifest) {
      throw new Error(`Version ${requestedVersion} findes ikke længere i opdateringshistorikken`)
    }
    if (!requestedVersion && (!manifest || !updater.isNewerVersion(manifest.version, app.getVersion()))) {
      throw new Error('Der er ingen nyere version at installere')
    }

    updateInProgress = true
    const exePath = app.getPath('exe')
    const installDir = path.dirname(exePath)
    try {
      // Hentes i baggrunden; kun ændrede filer overføres, og appen forbliver brugbar.
      const prepared = await updater.prepareUpdate({
        dataDir: platformRoot,
        manifest,
        exePath,
        installDir,
        onProgress: (progress) => broadcast('updates:progress', progress),
      })

      broadcast('updates:progress', { phase: 'restarting', percent: 100 })
      updater.applyPreparedUpdate({
        ...prepared,
        installDir,
        exePath,
      })
      // Giv vinduet et øjeblik til at vise beskeden før appen lukker og byttes ud.
      setTimeout(() => app.quit(), 1200)
    } catch (error) {
      updateInProgress = false
      broadcast('updates:progress', { phase: 'error', percent: 0, message: error.message })
      throw error
    }
  })

  startWatcher()

  createWindow()

  updater.cleanupOldWorkDirs()
  // Backup kører først når appen har haft et øjeblik til at starte færdig.
  setTimeout(startAutoBackup, 30 * 1000)
  // Første tjek kort efter opstart (når vinduet er indlæst), derefter fast interval.
  setTimeout(checkForUpdates, 10 * 1000)
  updateCheckTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL)
  updateCheckTimer.unref?.()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
