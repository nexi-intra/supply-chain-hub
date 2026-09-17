#!/usr/bin/env node

// Smoke-tests the locally installed models with the exact Bergamot npm runtime
// used by the app. This catches incompatible or incomplete Mozilla model sets.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker as ThreadWorker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

// @browsermt's Node worker contains CommonJS compatibility code but is shipped
// as .js inside an ESM package. Copy it as .cjs for this standalone smoke test.
const packageRoot = path.dirname(fileURLToPath(import.meta.resolve('@browsermt/bergamot-translator/translator.js')))
const packageWorkerDir = path.join(packageRoot, 'worker')
const temporaryWorkerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supply-chain-hub-bergamot-'))
for (const name of ['bergamot-translator-worker.js', 'bergamot-translator-worker.wasm']) {
  fs.copyFileSync(path.join(packageWorkerDir, name), path.join(temporaryWorkerDir, name))
}
const nodeWorkerSource = fs.readFileSync(path.join(packageWorkerDir, 'translator-worker.js'), 'utf8')
  .replace(
    'const buffer = await readFile(url.pathname);',
    "const {fileURLToPath} = require('node:url'); const buffer = await readFile(fileURLToPath(url));",
  )
fs.writeFileSync(path.join(temporaryWorkerDir, 'translator-worker.cjs'), nodeWorkerSource)

class NodeWebWorker {
  constructor() {
    this.worker = new ThreadWorker(path.join(temporaryWorkerDir, 'translator-worker.cjs'))
  }

  addEventListener(eventName, callback) {
    if (eventName === 'message') this.worker.on('message', (data) => callback({ data }))
    else this.worker.on(eventName, callback)
  }

  postMessage(message, transferList) {
    this.worker.postMessage(message, transferList)
  }

  terminate() {
    return this.worker.terminate()
  }
}

globalThis.window = { Worker: NodeWebWorker }
globalThis.Worker = NodeWebWorker

const { BatchTranslator, TranslatorBacking } = await import('@browsermt/bergamot-translator/translator.js')

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'supply-chan-hub.config'), 'utf8'))
const dataDirIndex = process.argv.indexOf('--data-dir')
const dataDir = path.resolve(dataDirIndex >= 0 ? process.argv[dataDirIndex + 1] : config.dataDir)
const modelsRoot = path.join(dataDir, 'translation-models')

function asArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function installedPairs() {
  if (!fs.existsSync(modelsRoot)) return []
  return fs.readdirSync(modelsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z]{4}$/.test(entry.name))
    .map((entry) => ({ from: entry.name.slice(0, 2), to: entry.name.slice(2, 4), files: {} }))
}

class LocalBacking extends TranslatorBacking {
  async loadModelRegistery() {
    return installedPairs()
  }

  async loadTranslationModel({ from, to }) {
    const directory = path.join(modelsRoot, `${from}${to}`)
    const names = fs.readdirSync(directory)
    const find = (pattern) => {
      const name = names.find((candidate) => pattern.test(candidate))
      if (!name) throw new Error(`Manglende ${pattern} i ${directory}`)
      return { name, data: asArrayBuffer(fs.readFileSync(path.join(directory, name))) }
    }
    const model = find(/^model.*\.bin$/)
    const shortlist = find(/^lex.*\.bin$/)
    const vocabs = names.filter((name) => /\.spm$/.test(name)).sort()
      .map((name) => asArrayBuffer(fs.readFileSync(path.join(directory, name))))
    return {
      model: model.data,
      shortlist: shortlist.data,
      vocabs,
      qualityModel: null,
      config: /intgemm8\.bin$/.test(model.name) ? { 'gemm-precision': 'int8shiftAll' } : {},
    }
  }
}

const backing = new LocalBacking({ cacheSize: 400, downloadTimeout: 0 })
const translator = new BatchTranslator({ pivotLanguage: null, workers: 1 }, backing)

async function translate(from, to, text) {
  const response = await translator.translate({ from, to, text, html: false })
  const result = response.target.text.trim()
  if (!result || result === text) throw new Error(`${from}→${to} gav ingen reel oversættelse: ${result}`)
  console.log(`${from}→${to}: ${result}`)
  return result
}

try {
  const finnish = await translate('en', 'fi', 'Open the main menu and select the delivery address.')
  await translate('fi', 'en', 'Avaa päävalikko ja valitse toimitusosoite.')
  const danishToEnglish = await translate('da', 'en', 'Åbn hovedmenuen og vælg leveringsadressen.')
  await translate('en', 'fi', danishToEnglish)
  const finnishToEnglish = await translate('fi', 'en', finnish)
  await translate('en', 'da', finnishToEnglish)
  console.log('Bergamot verificeret for engelsk↔finsk og dansk↔finsk via engelsk.')
} finally {
  translator.delete()
  // Worker termination is asynchronous; cleanup is best-effort on Windows.
  setTimeout(() => {
    try { fs.rmSync(temporaryWorkerDir, { recursive: true, force: true }) } catch { /* temporary only */ }
  }, 250)
}
