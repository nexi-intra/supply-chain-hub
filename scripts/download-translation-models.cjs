#!/usr/bin/env node

// Downloads released Firefox Translations models from Mozilla Remote Settings,
// verifies both the compressed and decompressed SHA-256 hashes, and installs
// them in <dataDir>/translation-models/<pair>/ for Supply Chain Hub's Bergamot
// runtime. Node 24+ is required for built-in Zstandard decompression.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const RECORDS_URL = 'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models-v2/records'
const ATTACHMENTS_URL = 'https://firefox-settings-attachments.cdn.mozilla.net/'
const DEFAULT_PAIRS = ['daen', 'enda', 'enfi', 'fien']

function parseArguments(argv) {
  let dataDir = null
  let pairs = null
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--data-dir') {
      dataDir = argv[++index]
      if (!dataDir) throw new Error('--data-dir kræver en sti')
    } else if (argument === '--pairs') {
      const value = argv[++index]
      if (!value) throw new Error('--pairs kræver fx enfi,fien')
      pairs = value.split(',').map((pair) => pair.trim().toLowerCase()).filter(Boolean)
    } else {
      throw new Error(`Ukendt argument: ${argument}`)
    }
  }

  if (!dataDir) {
    const configPath = path.join(process.cwd(), 'supply-chan-hub.config')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    dataDir = config.dataDir
  }
  if (!dataDir) throw new Error('Ingen datamappe angivet og ingen dataDir i supply-chan-hub.config')

  const selectedPairs = pairs || DEFAULT_PAIRS
  for (const pair of selectedPairs) {
    if (!/^[a-z]{4}$/.test(pair)) throw new Error(`Ugyldigt sprogpar: ${pair}`)
  }
  return { dataDir: path.resolve(dataDir), pairs: selectedPairs }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function compareVersions(left, right) {
  const toParts = (value) => String(value).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const a = toParts(left)
  const b = toParts(right)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference !== 0) return difference
  }
  return 0
}

function chooseRelease(records, pair) {
  const matching = records.filter((record) =>
    `${record.sourceLanguage}${record.targetLanguage}` === pair
    && !record.filter_expression
    && ['model', 'lex', 'vocab', 'srcvocab', 'trgvocab'].includes(record.fileType),
  )

  const groups = new Map()
  for (const record of matching) {
    const key = `${record.version}|${record.architecture}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }

  const complete = [...groups.entries()].filter(([, group]) => {
    const types = new Set(group.map((record) => record.fileType))
    return types.has('model') && types.has('lex')
      && (types.has('vocab') || (types.has('srcvocab') && types.has('trgvocab')))
  })
  complete.sort(([leftKey], [rightKey]) => {
    const [leftVersion, leftArchitecture] = leftKey.split('|')
    const [rightVersion, rightArchitecture] = rightKey.split('|')
    const versionDifference = compareVersions(rightVersion, leftVersion)
    if (versionDifference !== 0) return versionDifference
    const rank = { 'base-memory': 0, tiny: 1, base: 2 }
    return (rank[leftArchitecture] ?? 9) - (rank[rightArchitecture] ?? 9)
  })

  if (complete.length === 0) throw new Error(`Mozilla har ikke et komplet frigivet modelsæt for ${pair}`)
  const [key, files] = complete[0]
  const [version, architecture] = key.split('|')
  return { version, architecture, files }
}

async function downloadRecord(record) {
  const url = new URL(record.attachment.location, ATTACHMENTS_URL)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${record.name}: download fejlede med HTTP ${response.status}`)
  const compressed = Buffer.from(await response.arrayBuffer())
  if (compressed.length !== record.attachment.size) {
    throw new Error(`${record.name}: forkert komprimeret størrelse (${compressed.length} != ${record.attachment.size})`)
  }
  if (sha256(compressed) !== record.attachment.hash.toLowerCase()) {
    throw new Error(`${record.name}: SHA-256 for den komprimerede fil matcher ikke Mozilla-metadata`)
  }

  const decompressed = zlib.zstdDecompressSync(compressed)
  if (record.decompressedSize && decompressed.length !== record.decompressedSize) {
    throw new Error(`${record.name}: forkert udpakket størrelse (${decompressed.length} != ${record.decompressedSize})`)
  }
  if (record.decompressedHash && sha256(decompressed) !== record.decompressedHash.toLowerCase()) {
    throw new Error(`${record.name}: SHA-256 efter udpakning matcher ikke Mozilla-metadata`)
  }
  return decompressed
}

async function installPair(dataDir, pair, release) {
  const targetDir = path.join(dataDir, 'translation-models', pair)
  fs.mkdirSync(targetDir, { recursive: true })
  console.log(`${pair}: Mozilla ${release.version} (${release.architecture})`)

  for (const record of release.files.sort((a, b) => a.name.localeCompare(b.name))) {
    const destination = path.join(targetDir, record.name)
    if (fs.existsSync(destination) && record.decompressedHash) {
      const existing = fs.readFileSync(destination)
      if (sha256(existing) === record.decompressedHash.toLowerCase()) {
        console.log(`  ✓ ${record.name} findes allerede og er verificeret`)
        continue
      }
    }

    console.log(`  ↓ ${record.name}`)
    const contents = await downloadRecord(record)
    const temporary = `${destination}.${process.pid}.tmp`
    fs.writeFileSync(temporary, contents)
    fs.copyFileSync(temporary, destination)
    fs.unlinkSync(temporary)
    console.log(`  ✓ ${record.name} (${contents.length.toLocaleString('da-DK')} bytes)`)
  }
}

async function main() {
  if (typeof zlib.zstdDecompressSync !== 'function') {
    throw new Error('Denne Node-version understøtter ikke Zstandard. Brug Node 24 eller nyere.')
  }
  const { dataDir, pairs } = parseArguments(process.argv.slice(2))
  console.log(`Datamappe: ${dataDir}`)
  console.log(`Henter modelregister: ${RECORDS_URL}`)
  const response = await fetch(RECORDS_URL)
  if (!response.ok) throw new Error(`Modelregister fejlede med HTTP ${response.status}`)
  const payload = await response.json()

  for (const pair of pairs) {
    await installPair(dataDir, pair, chooseRelease(payload.data || [], pair))
  }
  console.log('Alle valgte Bergamot-modeller er installeret og verificeret.')
}

main().catch((error) => {
  console.error(error.stack || error.message || error)
  process.exitCode = 1
})
