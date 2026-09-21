// Explicit developer command only. No hub data or credentials leave the PC.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { execFileSync } = require('node:child_process')
const { getAIModel } = require('../electron/aiModels.cjs')

const assetDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'SupplyChainHub', 'ai')
const runtimeFile = { name: 'llama-b10964-bin-win-cpu-x64.zip', url: 'https://github.com/ggml-org/llama.cpp/releases/download/b10964/llama-b10964-bin-win-cpu-x64.zip', sha256: '917f39c076402c421224824607397af20f53625a60defc20e8dd22446bf4c5d7' }

async function hashFile(file) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function download(entry, model) {
  const target = path.join(assetDir, entry.name)
  if (fs.existsSync(target) && await hashFile(target) === entry.sha256) {
    console.log(`Verified existing ${entry.name}`)
    return
  }
  const url = entry.url || `https://huggingface.co/${model.repository}/resolve/${model.revision}/${entry.name}`
  const response = await fetch(url, { signal: AbortSignal.timeout(30 * 60 * 1000) })
  if (!response.ok) throw new Error(`Download ${entry.name}: HTTP ${response.status}`)
  const hash = crypto.createHash('sha256')
  let received = 0
  let reportedAt = 0
  const counter = new Transform({ transform(chunk, _encoding, callback) {
    hash.update(chunk)
    received += chunk.length
    if (Date.now() - reportedAt > 10000) {
      console.log(`${entry.name}: ${Math.round(received / 1024 / 1024)} MiB`)
      reportedAt = Date.now()
    }
    callback(null, chunk)
  } })
  const partial = `${target}.partial`
  await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(partial))
  if (hash.digest('hex') !== entry.sha256) throw new Error(`Checksum mismatch: ${entry.name}; not installed`)
  fs.renameSync(partial, target)
  console.log(`Verified ${entry.name}`)
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This pilot uses the Windows x64 CPU runtime')
  const modelFlag = process.argv.indexOf('--model')
  const model = getAIModel(modelFlag < 0 ? '4b' : process.argv[modelFlag + 1])
  fs.mkdirSync(assetDir, { recursive: true })
  console.log(`AI assets (separate from releases): ${assetDir}`)
  console.log(`Selected model: ${model.name}`)
  await Promise.all([runtimeFile, ...model.files].map(entry => download(entry, model)))
  const runtimeDir = path.join(assetDir, 'runtime')
  // Literal paths; no string-built shell command or global installation.
  if (!fs.existsSync(runtimeDir)) execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '& { param($archivePath,$destinationPath) Expand-Archive -LiteralPath $archivePath -DestinationPath $destinationPath -Force }', path.join(assetDir, runtimeFile.name), runtimeDir], { windowsHide: true })
  console.log(`Ready: ${runtimeDir}`)
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { assetDir }
