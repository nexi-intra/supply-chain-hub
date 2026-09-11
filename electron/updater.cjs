// In-app opdateringssystem uden installation (brugerne har ikke admin-rettigheder).
//
// Den fælles datamappe (netværksdrevet) bruges som opdateringskanal:
//   <datamappe>/updates/manifest.json  — metadata om nyeste version
//   <datamappe>/updates/<app>.zip      — selve app-pakken (fra electron-builder)
//
// Publicering: en manager vælger en ny ZIP i appen; den kopieres til updates/
// med sha256-checksum, og manifestet skrives. Alle klienter poller manifestet.
//
// Installation: ZIP kopieres lokalt, checksum verificeres, pakkes ud til en
// midlertidig mappe, og et .cmd-script venter på at appen lukker, kopierer de
// nye filer over den lokale appmappe (fx C:\TCD TOOLS\...) og genstarter appen.
// Alt foregår i brugerens egne mapper — ingen administrator-rettigheder kræves.
// Electron patcher "fs" globalt til at genkende ".asar"-stier som arkiver at
// læse KODE fra. Her behandler vi app.asar som almindelig binær DATA (kopiere/
// hash'e/stat'e), hvilket den patchede fs fejltolker ("ENOENT, not found in
// .../app.asar"). "original-fs" er Electrons upatchede fs — falder tilbage til
// almindelig "fs" uden for Electron (fx når testene køres med ren Node).
let fs
try {
  fs = require('original-fs')
} catch {
  fs = require('fs')
}
const fsp = fs.promises
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { pipeline } = require('stream/promises')
const { spawn } = require('child_process')

const UPDATES_DIR = 'updates'
const MANIFEST_FILE = 'manifest.json'
const HISTORY_FILE = 'history.json'
// Antal tidligere versioner der bevares (zip + udpakket kopi), så en manager
// kan force-pushe en specifik ældre version til én bruger uden at ændre den
// version alle andre klienter auto-opdaterer til.
const HISTORY_RETENTION = 10
const WORK_DIR_PREFIX = 'tcd-hub-update-'

function updatesDir(dataDir) {
  return path.join(dataDir, UPDATES_DIR)
}

function manifestPath(dataDir) {
  return path.join(updatesDir(dataDir), MANIFEST_FILE)
}

function historyPath(dataDir) {
  return path.join(updatesDir(dataDir), HISTORY_FILE)
}

/** Liste over tidligere publicerede versioner (nyeste først), inkl. den aktuelle. */
function readHistory(dataDir) {
  try {
    const raw = fs.readFileSync(historyPath(dataDir), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeHistory(dataDir, history) {
  const tmp = historyPath(dataDir) + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(history, null, 2))
  fs.renameSync(tmp, historyPath(dataDir))
}

/** Finder manifestet for en specifik version (aktuel eller tidligere), eller null. */
function getManifestForVersion(dataDir, version) {
  const current = readManifest(dataDir)
  if (current && current.version === version) return current
  return readHistory(dataDir).find((entry) => entry.version === version) || null
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return false
}

/** Læser manifestet fra den fælles mappe. Returnerer null hvis intet/ugyldigt. */
function readManifest(dataDir) {
  try {
    const raw = fs.readFileSync(manifestPath(dataDir), 'utf8')
    const manifest = JSON.parse(raw)
    if (!manifest || typeof manifest !== 'object') return null
    if (!parseVersion(manifest.version) || typeof manifest.file !== 'string' || typeof manifest.sha256 !== 'string') {
      console.error(`TCD Hub: manifest.json i "${dataDir}" mangler eller har ugyldige felter`)
      return null
    }
    return manifest
  } catch (err) {
    // ENOENT er den normale tilstand (ingen opdatering publiceret endnu) — kun
    // andre fejl (ugyldig JSON, rettigheder) logges, så fejlfinding er muligt.
    if (err.code !== 'ENOENT') {
      console.error(`TCD Hub: kunne ikke læse manifest.json i "${dataDir}":`, err.message)
    }
    return null
  }
}

/** Alle filer under en mappe, som stier relativt til mappen (POSIX-separatorer). */
async function listFilesRecursive(rootDir, prefix = '') {
  const entries = await fsp.readdir(path.join(rootDir, prefix), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(rootDir, relativePath))
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }
  return files
}

async function buildFileIndex(rootDir, onProgress = () => {}) {
  const paths = await listFilesRecursive(rootDir)
  const files = []
  for (let i = 0; i < paths.length; i++) {
    const relativePath = paths[i]
    const absolutePath = path.join(rootDir, relativePath)
    const { size } = await fsp.stat(absolutePath)
    files.push({ path: relativePath, size, sha256: await sha256File(absolutePath) })
    onProgress({ done: i + 1, total: paths.length })
  }
  return files
}

function sha256File(filePath, onProgress) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    let read = 0
    let lastReported = 0
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => {
      hash.update(chunk)
      read += chunk.length
      if (onProgress && (read - lastReported >= 262144)) {
        lastReported = read
        onProgress(read)
      }
    })
    stream.on('end', () => {
      if (onProgress) onProgress(read)
      resolve(hash.digest('hex'))
    })
    stream.on('error', reject)
  })
}

/** Gæt versionsnummer ud fra zip-filnavnet, fx "TCD Hub-1.2.0-win.zip". */
function versionFromFilename(fileName) {
  const match = String(fileName).match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

/**
 * Kopierer zip'en til <datamappe>/updates/, verificerer kopien og skriver
 * manifestet. Gamle zip-filer ryddes op bagefter.
 */
async function publishUpdate(dataDir, { zipPath, version, notes, publishedBy, skipDelta = false, onProgress = () => {} }) {
  if (!parseVersion(version)) {
    throw new Error('Versionsnummeret skal have formatet X.Y.Z, fx 1.2.0')
  }
  const stat = fs.statSync(zipPath)
  const dir = updatesDir(dataDir)
  fs.mkdirSync(dir, { recursive: true })

  onProgress({ phase: 'hashing-source', percent: 0 })
  const sha256 = await sha256File(zipPath, (read) => {
    onProgress({ phase: 'hashing-source', percent: Math.round((read / stat.size) * 100) })
  })
  const fileName = path.basename(zipPath)
  const target = path.join(dir, fileName)

  if (path.resolve(zipPath) !== path.resolve(target)) {
    onProgress({ phase: 'uploading', percent: 0 })
    await copyAndHash(zipPath, target, (copied) => {
      onProgress({ phase: 'uploading', percent: Math.round((copied / stat.size) * 100) })
    })
  }

  onProgress({ phase: 'verifying', percent: 0 })
  const copiedSha = await sha256File(target, (read) => {
    onProgress({ phase: 'verifying', percent: Math.round((read / stat.size) * 100) })
  })
  if (copiedSha !== sha256) {
    try { fs.unlinkSync(target) } catch { /* ignore */ }
    throw new Error('Kopien til den fælles mappe blev beskadiget undervejs — prøv igen')
  }

  const manifest = {
    version,
    file: fileName,
    sha256,
    size: stat.size,
    notes: String(notes || ''),
    publishedAt: new Date().toISOString(),
    publishedBy: String(publishedBy || ''),
  }

  // Udpakket kopi + filindeks, så klienter kun behøver hente de ændrede filer.
  // Zip'en bevares, fordi klienter før 1.3.0 kun kan opdatere fra den.
  // skipDelta: klienter (også ældre installer uden nyeste rettelser) afgør selv
  // delta vs. fuld installation ud fra om manifest.files findes — så uden
  // filindeks tvinges ALLE klienter til den sikre fulde zip-installation,
  // uanset hvilken kode-version de selv kører.
  if (!skipDelta) {
    onProgress({ phase: 'extracting', percent: 0 })
    const versionDir = path.join(dir, version)
    await fsp.rm(versionDir, { recursive: true, force: true })
    await extractZip(target, versionDir)
    onProgress({ phase: 'extracting', percent: 100 })

    onProgress({ phase: 'indexing', percent: 0 })
    manifest.files = await buildFileIndex(versionDir, ({ done, total }) => {
      onProgress({ phase: 'indexing', percent: total > 0 ? Math.round((done / total) * 100) : 100 })
    })
    manifest.deltaDir = version
  }

  const tmp = manifestPath(dataDir) + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2))
  fs.renameSync(tmp, manifestPath(dataDir))

  // Behold op til HISTORY_RETENTION versioner (denne + tidligere), så en
  // manager senere kan vælge en specifik version at force-pushe til én bruger.
  const history = readHistory(dataDir).filter((entry) => entry.version !== version)
  history.unshift(manifest)
  const retained = history.slice(0, HISTORY_RETENTION)
  writeHistory(dataDir, retained)

  const retainedVersions = new Set(retained.map((entry) => entry.version))
  const retainedFiles = new Set(retained.map((entry) => entry.file))

  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name)
    if (name.toLowerCase().endsWith('.zip')) {
      if (!retainedFiles.has(name)) {
        try { fs.unlinkSync(fullPath) } catch { /* en anden klient kan være i gang med den */ }
      }
    } else if (name !== MANIFEST_FILE && name !== HISTORY_FILE && fs.statSync(fullPath).isDirectory()) {
      if (!retainedVersions.has(name)) {
        // Ryd udpakkede mapper for versioner der er faldet ud af historikken.
        try { fs.rmSync(fullPath, { recursive: true, force: true }) } catch { /* i brug */ }
      }
    }
  }
  return manifest
}

function psQuote(value) {
  return value.replace(/'/g, "''")
}

/** Kører et konsolprogram uden at der blinker et vindue frem hos brugeren. */
function runHidden(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} afsluttede med kode ${code}`))
    })
  })
}

/** Udpakker en zip med tar.exe (Windows 10+) og PowerShell som fallback. */
async function extractZip(zipPath, destDir) {
  await fsp.mkdir(destDir, { recursive: true })
  try {
    await runHidden('tar.exe', ['-xf', zipPath, '-C', destDir])
    return
  } catch {
    // tar.exe mangler eller fejlede — prøv PowerShell i stedet.
  }
  await runHidden('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `Expand-Archive -LiteralPath '${psQuote(zipPath)}' -DestinationPath '${psQuote(destDir)}' -Force`,
  ])
}

/**
 * Kopierer og checksummer i én gennemlæsning via streams, så main-processen
 * aldrig blokeres og brugeren kan følge med undervejs.
 */
async function copyAndHash(sourcePath, targetPath, onProgress) {
  const { size } = await fsp.stat(sourcePath)
  const hash = crypto.createHash('sha256')
  let copied = 0
  let lastReported = 0

  const source = fs.createReadStream(sourcePath)
  source.on('data', (chunk) => {
    hash.update(chunk)
    copied += chunk.length
    // Rapportér i spring, så IPC ikke overdøves af små opdateringer.
    if (copied - lastReported >= 262144 || copied === size) {
      lastReported = copied
      onProgress(copied)
    }
  })

  await pipeline(source, fs.createWriteStream(targetPath))
  return hash.digest('hex')
}

/**
 * Finder de filer, der reelt adskiller sig fra den installerede app.
 * Størrelsesforskel afgør sagen med det samme, så kun reelle kandidater hashes.
 */
async function diffAgainstInstall(manifestFiles, installDir, onProgress = () => {}) {
  const changed = []
  let inspected = 0

  for (const entry of manifestFiles) {
    const localPath = path.join(installDir, entry.path)
    let identical = false
    try {
      const stat = await fsp.stat(localPath)
      identical = stat.size === entry.size && (await sha256File(localPath)) === entry.sha256
    } catch {
      identical = false
    }
    if (!identical) changed.push(entry)

    inspected++
    onProgress(Math.round((inspected / manifestFiles.length) * 100))
  }

  return changed
}

/** Filer i installationen, som den nye version ikke længere indeholder. */
async function findObsoleteFiles(manifestFiles, installDir) {
  const wanted = new Set(manifestFiles.map((entry) => entry.path.toLowerCase()))
  let installed = []
  try {
    installed = await listFilesRecursive(installDir)
  } catch {
    return []
  }
  return installed.filter((relativePath) => !wanted.has(relativePath.toLowerCase()))
}

/**
 * Henter og udpakker opdateringen i baggrunden. Appen forbliver brugbar
 * imens; intet erstattes før applyPreparedUpdate() kaldes.
 * Fra manifest-format 2 hentes kun de filer, der har ændret sig.
 */
async function prepareUpdate({ dataDir, manifest, exePath, installDir, onProgress = () => {} }) {
  const targetDir = installDir || path.dirname(exePath)
  const versionDir = manifest.deltaDir ? path.join(updatesDir(dataDir), manifest.deltaDir) : null

  if (Array.isArray(manifest.files) && versionDir && fs.existsSync(versionDir)) {
    try {
      return await prepareDeltaUpdate({ manifest, versionDir, installDir: targetDir, exePath, onProgress })
    } catch (err) {
      // En klient der endnu ikke har denne opdaterings-kode kan ramme fejl her
      // (fx ældre versioner uden original-fs-håndtering af app.asar). Falder
      // trygt tilbage til fuld zip-installation, som ikke rammer den slags —
      // det sikrer klienten altid kan komme videre til en nyere, rettet version.
      console.error('TCD Hub: delta-opdatering fejlede, falder tilbage til fuld installation:', err.message)
      return prepareFullUpdate({ dataDir, manifest, exePath, onProgress })
    }
  }
  return prepareFullUpdate({ dataDir, manifest, exePath, onProgress })
}

async function prepareDeltaUpdate({ manifest, versionDir, installDir, exePath, onProgress }) {
  onProgress({ phase: 'comparing', percent: 0 })
  const changed = await diffAgainstInstall(manifest.files, installDir, (percent) => {
    onProgress({ phase: 'comparing', percent })
  })
  const obsolete = await findObsoleteFiles(manifest.files, installDir)

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), WORK_DIR_PREFIX))
  const stagingDir = path.join(workDir, 'app')
  const totalBytes = changed.reduce((sum, entry) => sum + entry.size, 0)

  try {
    await fsp.mkdir(stagingDir, { recursive: true })
    onProgress({ phase: 'downloading', percent: 0, transferredBytes: 0, totalBytes, fileCount: changed.length })

    let copiedBytes = 0
    for (const entry of changed) {
      const source = path.join(versionDir, entry.path)
      const target = path.join(stagingDir, entry.path)
      await fsp.mkdir(path.dirname(target), { recursive: true })

      const actualSha = await copyAndHash(source, target, (fileBytes) => {
        const percent = totalBytes > 0 ? Math.round(((copiedBytes + fileBytes) / totalBytes) * 100) : 100
        onProgress({ phase: 'downloading', percent, transferredBytes: copiedBytes + fileBytes, totalBytes, fileCount: changed.length })
      })
      if (actualSha !== entry.sha256) {
        throw new Error(`Checksum-fejl i ${entry.path}. Prøv igen senere.`)
      }
      copiedBytes += entry.size
    }

    const exeName = path.basename(exePath)
    const exeChanged = changed.some((entry) => path.basename(entry.path).toLowerCase() === exeName.toLowerCase())
    if (exeChanged && !fs.existsSync(path.join(stagingDir, exeName))) {
      throw new Error(`Opdateringen ligner ikke en TCD Hub-udgivelse (mangler ${exeName})`)
    }

    onProgress({ phase: 'ready', percent: 100, transferredBytes: totalBytes, totalBytes, fileCount: changed.length })
    return { workDir, stagingDir, obsolete, changedCount: changed.length, totalBytes }
  } catch (error) {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

/** Bruges når manifestet kommer fra en ældre publicering uden filindeks. */
async function prepareFullUpdate({ dataDir, manifest, exePath, onProgress }) {
  const sourceZip = path.join(updatesDir(dataDir), manifest.file)
  if (!fs.existsSync(sourceZip)) {
    throw new Error('Opdateringsfilen findes ikke længere i den fælles mappe')
  }

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), WORK_DIR_PREFIX))
  const localZip = path.join(workDir, manifest.file)

  try {
    // Kopiér til lokal disk først — udpakning direkte fra netværksdrev er skrøbelig.
    onProgress({ phase: 'downloading', percent: 0 })
    const actualSha = await copyAndHash(sourceZip, localZip, (copied) => {
      const percent = manifest.size > 0 ? Math.round((copied / manifest.size) * 100) : 0
      onProgress({ phase: 'downloading', percent, transferredBytes: copied, totalBytes: manifest.size })
    })

    onProgress({ phase: 'verifying', percent: 100 })
    if (actualSha !== manifest.sha256) {
      throw new Error('Checksum-fejl: filen er beskadiget eller ændret. Prøv igen senere.')
    }

    onProgress({ phase: 'extracting', percent: 0 })
    const stagingDir = path.join(workDir, 'app')
    await extractZip(localZip, stagingDir)

    const exeName = path.basename(exePath)
    if (!fs.existsSync(path.join(stagingDir, exeName))) {
      throw new Error(`Zip-filen ligner ikke en TCD Hub-udgivelse (mangler ${exeName})`)
    }

    await fsp.rm(localZip, { force: true })
    onProgress({ phase: 'ready', percent: 100 })
    return { workDir, stagingDir, obsolete: [], changedCount: null, totalBytes: manifest.size }
  } catch (error) {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

/**
 * Starter det løsrevne script, der bytter filerne og genstarter appen, når
 * den er lukket. Scriptet køres via wscript.exe, fordi en detached cmd.exe
 * åbner et synligt konsolvindue selv med windowsHide.
 * Kalderen skal selv kalde app.quit() bagefter.
 */
function buildApplyScript({ workDir, stagingDir, installDir, exePath, obsolete = [], appPid = process.pid }) {
  // Sikkerhedsventil: en uventet lang sletteliste tyder på et forkert manifest.
  const safeObsolete = obsolete.length <= 200
    ? obsolete.filter((relativePath) => {
      const resolved = path.resolve(installDir, relativePath)
      return resolved.startsWith(path.resolve(installDir) + path.sep)
    })
    : []

  // "ping -n 2" bruges som 1 sekunds pause — timeout.exe virker ikke uden stdin.
  return [
    '@echo off',
    'setlocal',
    `set "APPPID=${appPid}"`,
    `set "LOG=${path.join(workDir, 'update-log.txt')}"`,
    'echo Venter paa at TCD Hub lukker... > "%LOG%"',
    ':wait',
    'tasklist /FI "PID eq %APPPID%" /NH 2>nul | find "%APPPID%" >nul',
    'if not errorlevel 1 (',
    '  ping -n 2 127.0.0.1 >nul',
    '  goto wait',
    ')',
    'echo Kopierer nye filer... >> "%LOG%"',
    `robocopy "${stagingDir}" "${installDir}" /E /R:10 /W:2 /NFL /NDL /NJH /NJS /NP >> "%LOG%" 2>&1`,
    'if %ERRORLEVEL% GEQ 8 (',
    '  echo Opdatering fejlede - robocopy exit %ERRORLEVEL% >> "%LOG%"',
    `  start "" "${exePath}"`,
    '  exit /b %ERRORLEVEL%',
    ') else (',
    '  echo Opdatering gennemfoert >> "%LOG%"',
    ')',
    ...safeObsolete.map((relativePath) => `del /f /q "${path.join(installDir, relativePath)}" >> "%LOG%" 2>&1`),
    `start "" "${exePath}"`,
    'endlocal',
    '',
  ].join('\r\n')
}

function applyPreparedUpdate({ workDir, stagingDir, installDir, exePath, obsolete = [] }) {
  const script = buildApplyScript({ workDir, stagingDir, installDir, exePath, obsolete })

  const scriptPath = path.join(workDir, 'apply-update.cmd')
  fs.writeFileSync(scriptPath, script)

  // WindowStyle 0 = fuldstændig skjult; False = vent ikke på at scriptet slutter.
  const launcher = [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run Chr(34) & "${scriptPath}" & Chr(34), 0, False`,
    '',
  ].join('\r\n')

  const launcherPath = path.join(workDir, 'apply-update.vbs')
  fs.writeFileSync(launcherPath, launcher)

  const child = spawn('wscript.exe', [launcherPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: workDir,
  })
  child.unref()
}

/** Rydder efterladte arbejdsmapper fra tidligere opdateringer (kaldes ved opstart). */
function cleanupOldWorkDirs() {
  let entries = []
  try {
    entries = fs.readdirSync(os.tmpdir())
  } catch {
    return
  }
  for (const name of entries) {
    if (!name.startsWith(WORK_DIR_PREFIX)) continue
    const dir = path.join(os.tmpdir(), name)
    try {
      const ageMs = Date.now() - fs.statSync(dir).mtimeMs
      // Lad friske mapper være — et opdaterings-script kan stadig køre.
      if (ageMs > 60 * 60 * 1000) fs.rmSync(dir, { recursive: true, force: true })
    } catch { /* ignore */ }
  }
}

module.exports = {
  readManifest,
  readHistory,
  getManifestForVersion,
  isNewerVersion,
  versionFromFilename,
  publishUpdate,
  prepareUpdate,
  applyPreparedUpdate,
  cleanupOldWorkDirs,
  sha256File,
  buildApplyScript,
}
