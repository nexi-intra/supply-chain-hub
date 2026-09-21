const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { pipeline } = require('node:stream/promises')
const { Transform } = require('node:stream')
const { getAIModel, allModelFileNames } = require('./aiModels.cjs')

const GiB = 1024 ** 3
const DEFAULT_ASSET_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'SupplyChainHub', 'ai')

function findExecutable(dir) {
  if (!fs.existsSync(dir)) return null
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === 'llama-server.exe') return file
    if (entry.isDirectory()) {
      const found = findExecutable(file)
      if (found) return found
    }
  }
  return null
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

// Loftet var 384, hvilket afskar trinvise vejledninger og generelle svar midt i
// en saetning. Hoejere loft koster kun tid naar kalderen faktisk beder om mere.
const MAX_COMPLETION_TOKENS = 1536

function createLocalAI({ assetDir = DEFAULT_ASSET_DIR, sharedAssetDir = null, freeMemory = () => os.freemem(), minimumFreeGiB, idleMs = 120000, defaultModelId = '4b' } = {}) {
  getAIModel(defaultModelId)
  // Reclaim disk from model files that are no longer offered (e.g. the old 8B).
  try {
    if (fs.existsSync(assetDir)) {
      const allowed = allModelFileNames()
      for (const entry of fs.readdirSync(assetDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.gguf') && !allowed.has(entry.name)) {
          try { fs.unlinkSync(path.join(assetDir, entry.name)) } catch { /* leave locked/in-use files */ }
        }
      }
    }
  } catch { /* best-effort cleanup, never blocks startup */ }
  let child = null
  let startPromise = null
  let idleTimer = null
  let busy = false
  let port = null
  let key = null
  let abortController = null
  let logTail = ''
  let lastMetrics = null
  let generation = 0
  let loadedVision = false
  let loadedModelId = null
  let provisioning = false
  let provisionProgress = 0
  let provisionPromise = null

  // Er den delte model (paa det faelles drev) til stede og komplet?
  function sharedInstalled() {
    try {
      if (!sharedAssetDir || !fs.existsSync(sharedAssetDir)) return false
      const config = getAIModel(defaultModelId)
      return !!findExecutable(path.join(sharedAssetDir, 'runtime'))
        && fs.existsSync(path.join(sharedAssetDir, config.files[0].name))
        && fs.existsSync(path.join(sharedAssetDir, config.files[1].name))
    } catch { return false }
  }

  // Testtilstand: TCD_HUB_AI_MIN_FREE_GIB saenker (0 = fjerner) RAM-kravet, saa
  // man kan maale hvad modellen reelt goer ved maskinen. Produktionsstandarden i
  // aiModels.cjs roeres ikke - uden env-variablen er opfoerslen praecis som foer.
  function requiredFreeGiB(config, vision) {
    const override = Number(process.env.TCD_HUB_AI_MIN_FREE_GIB)
    if (Number.isFinite(override) && override >= 0) return override
    return Math.max(minimumFreeGiB || 0, vision ? config.minimumVisionFreeGiB : config.minimumFreeGiB)
  }

  function status(modelId = loadedModelId || defaultModelId) {
    const config = getAIModel(modelId)
    const model = path.join(assetDir, config.files[0].name)
    const projector = path.join(assetDir, config.files[1].name)
    return {
      installed: !!findExecutable(path.join(assetDir, 'runtime')) && fs.existsSync(model) && fs.existsSync(projector),
      sharedAvailable: sharedInstalled(),
      provisioning,
      provisionProgress,
      running: !!child,
      busy,
      vision: !!child && loadedVision,
      freeGiB: Number((freeMemory() / GiB).toFixed(2)),
      minimumFreeGiB: requiredFreeGiB(config, false),
      minimumVisionFreeGiB: requiredFreeGiB(config, true),
      modelId,
      loadedModelId: child ? loadedModelId : null,
      model: config.name,
      lastMetrics,
    }
  }

  function stop() {
    generation++
    clearTimeout(idleTimer)
    abortController?.abort()
    const previous = child
    child = null
    previous?.kill()
    port = null
    key = null
  }

  function scheduleUnload() {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(stop, idleMs)
    idleTimer.unref?.()
  }

  async function start(vision, modelId) {
    if (startPromise) return startPromise
    if (child) return
    const config = getAIModel(modelId)
    const model = path.join(assetDir, config.files[0].name)
    const projector = path.join(assetDir, config.files[1].name)
    const snapshot = status(modelId)
    if (!snapshot.installed) throw new Error(`AI-modellen mangler. Kør npm run ai:download -- --model ${modelId} i udviklingsmappen.`)
    const required = requiredFreeGiB(config, vision)
    if (required > 0 && freeMemory() < required * GiB) throw new Error(`For lidt ledig RAM (${snapshot.freeGiB} GB). ${vision ? 'Billedmodellen' : 'Modellen'} kræver mindst ${required} GB ledigt før start. Dataopslag kan stadig bruges.`)
    const epoch = generation
    startPromise = (async () => {
      const nextPort = await availablePort()
      if (epoch !== generation) throw new Error('AI-start afbrudt')
      port = nextPort
      key = crypto.randomBytes(32).toString('hex')
      logTail = ''
      const processHandle = spawn(findExecutable(path.join(assetDir, 'runtime')), [
        '--model', model, ...(vision ? ['--mmproj', projector] : ['--no-mmproj']),
        '--host', '127.0.0.1', '--port', String(port), '--api-key', key,
        '--no-webui', '--no-agent',
        '--ctx-size', '4096', '--parallel', '1',
        '--threads', '3', '--threads-batch', '3', '--batch-size', '128', '--ubatch-size', '128',
        '--n-gpu-layers', '0', '--no-mmproj-offload', '--image-max-tokens', '512',
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
        // Do not inherit cloud keys, proxies, HF tokens or inference settings.
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: process.env.PATH,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        USERPROFILE: process.env.USERPROFILE,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        LLAMA_API_KEY: key,
      } })
      child = processHandle
      loadedVision = vision
      loadedModelId = modelId
      let processError = null
      const capture = data => { logTail = (logTail + data.toString()).slice(-4000) }
      processHandle.stdout.on('data', capture)
      processHandle.stderr.on('data', capture)
      processHandle.on('error', error => { processError = error })
      processHandle.on('exit', () => { if (child === processHandle) child = null })
      const deadline = Date.now() + 120000
      while (Date.now() < deadline) {
        if (epoch !== generation) throw new Error('AI-start afbrudt')
        if (processError) throw processError
        if (processHandle.exitCode !== null || child !== processHandle) throw new Error(`AI-motoren stoppede: ${logTail.slice(-1200)}`)
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`, { redirect: 'error', signal: AbortSignal.timeout(1000) })
          if (response.ok) return
        } catch { /* the helper is still loading */ }
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      throw new Error('AI-motoren kunne ikke starte inden for 120 sekunder')
    })()
    try { await startPromise } catch (error) { stop(); throw error } finally { startPromise = null }
  }

  async function complete(messages, { maxTokens = 256, modelId = defaultModelId, temperature = 0 } = {}) {
    getAIModel(modelId)
    if (busy) throw new Error('AI’en behandler allerede et spørgsmål. Vent eller stop svaret.')
    const vision = messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url'))
    if (child && (loadedVision !== vision || loadedModelId !== modelId)) stop()
    busy = true
    clearTimeout(idleTimer)
    const startedAt = Date.now()
    const epoch = generation
    try {
      await start(vision, modelId)
      if (epoch !== generation) throw new Error('AI-svar afbrudt')
      const loadedAt = Date.now()
      abortController = new AbortController()
      const deadline = setTimeout(() => abortController?.abort(), 180000)
      let response
      try {
        response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ messages, max_tokens: Math.min(maxTokens, MAX_COMPLETION_TOKENS), temperature, repeat_penalty: 1.1, stream: false, cache_prompt: false, chat_template_kwargs: { enable_thinking: false } }),
          signal: abortController.signal,
        })
        if (!response.ok) throw new Error(`Lokal AI-fejl: HTTP ${response.status}`)
        const result = await response.json()
        if (epoch !== generation) throw new Error('AI-svar afbrudt')
        const text = result.choices?.[0]?.message?.content?.trim()
        if (!text) throw new Error('AI-motoren returnerede ikke noget svar')
        lastMetrics = { modelId, totalMs: Date.now() - startedAt, loadMs: loadedAt - startedAt, tokens: result.usage?.completion_tokens, timings: result.timings || null }
        return { text, metrics: lastMetrics }
      } finally { clearTimeout(deadline) }
    } catch (error) {
      stop()
      throw error
    } finally {
      abortController = null
      busy = false
      if (child && freeMemory() < 0.75 * GiB) stop()
      else if (child) scheduleUnload()
    }
  }

  async function hashOf(stream) {
    const hash = crypto.createHash('sha256')
    for await (const chunk of stream) hash.update(chunk)
    return hash.digest('hex')
  }

  function listFiles(dir, base = '') {
    const out = []
    if (!fs.existsSync(dir)) return out
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...listFiles(abs, path.join(base, entry.name)))
      else if (entry.isFile()) out.push({ abs, rel: path.join(base, entry.name), size: fs.statSync(abs).size })
    }
    return out
  }

  // Kopier den delte model fra det faelles drev til den lokale asset-mappe EN gang.
  // Selve inferensen koerer altid lokalt; drevet bruges kun til distribution.
  async function provision(onProgress = () => {}) {
    if (provisionPromise) return provisionPromise
    if (status().installed) { onProgress({ copied: 1, total: 1, ratio: 1 }); return }
    if (!sharedInstalled()) throw new Error('Den delte AI-model blev ikke fundet paa det faelles drev.')
    provisionPromise = (async () => {
      provisioning = true
      provisionProgress = 0
      try {
        const config = getAIModel(defaultModelId)
        const models = config.files.map(file => ({ src: path.join(sharedAssetDir, file.name), dest: path.join(assetDir, file.name), size: fs.statSync(path.join(sharedAssetDir, file.name)).size, sha256: file.sha256 }))
        const runtime = listFiles(path.join(sharedAssetDir, 'runtime')).map(file => ({ src: file.abs, dest: path.join(assetDir, 'runtime', file.rel), size: file.size, sha256: null }))
        const items = [...models, ...runtime]
        const total = items.reduce((sum, item) => sum + item.size, 0)
        let copied = 0
        let lastReport = 0
        const report = force => {
          provisionProgress = total ? copied / total : 1
          const now = Date.now()
          if (force || now - lastReport >= 400) { lastReport = now; onProgress({ copied, total, ratio: provisionProgress }) }
        }
        report(true)
        fs.mkdirSync(assetDir, { recursive: true })
        for (const item of items) {
          if (fs.existsSync(item.dest) && fs.statSync(item.dest).size === item.size && (!item.sha256 || await hashOf(fs.createReadStream(item.dest)) === item.sha256)) {
            copied += item.size; report(); continue
          }
          fs.mkdirSync(path.dirname(item.dest), { recursive: true })
          const partial = `${item.dest}.partial`
          const hash = item.sha256 ? crypto.createHash('sha256') : null
          await pipeline(
            fs.createReadStream(item.src),
            new Transform({ transform(chunk, _encoding, callback) { hash?.update(chunk); copied += chunk.length; report(); callback(null, chunk) } }),
            fs.createWriteStream(partial),
          )
          if (hash && hash.digest('hex') !== item.sha256) { try { fs.unlinkSync(partial) } catch { /* ignore */ } throw new Error(`Kontrolsum stemte ikke for ${path.basename(item.dest)} - proev igen.`) }
          fs.renameSync(partial, item.dest)
        }
        provisionProgress = 1
        report(true)
      } finally {
        provisioning = false
        provisionPromise = null
      }
    })()
    return provisionPromise
  }

  return { status, complete, stop, provision }
}

module.exports = { createLocalAI, DEFAULT_ASSET_DIR }
