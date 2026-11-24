const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn, spawnSync } = require('node:child_process')
const asar = require('@electron/asar')
const { chromium } = require('playwright-core')
const version = require('../package.json').version

const root = path.resolve(process.argv[2] || path.join(__dirname, '..', 'release', 'win-unpacked'))
const asarPath = path.join(root, 'resources', 'app.asar')
const exePath = path.join(root, 'Supply Chain Hub.exe')
const files = new Set(asar.listPackage(asarPath).map(file => file.replaceAll('\\', '/')))
for (const file of ['/electron/main.cjs', '/electron/openWordGuide.cjs', '/electron/renderWordGuide.cjs', '/node_modules/jszip/lib/index.js']) {
  assert.ok(files.has(file), `Packaged runtime missing ${file}`)
}
assert.equal(JSON.parse(asar.extractFile(asarPath, 'package.json')).version, version)
assert.ok(fs.statSync(exePath).size > 0, 'Packaged executable is missing')

// PowerShell cannot run a script from inside app.asar, so the Word helper must also exist unpacked.
const unpackedScript = path.join(root, 'resources', 'app.asar.unpacked', 'electron', 'wordToPdf.ps1')
assert.ok(fs.existsSync(unpackedScript), 'wordToPdf.ps1 must be in app.asar.unpacked (build.asarUnpack)')
assert.deepEqual(fs.readFileSync(unpackedScript), asar.extractFile(asarPath, 'electron/wordToPdf.ps1'), 'unpacked wordToPdf.ps1 differs from the packaged copy')

const wordProbe = `
const path = require('node:path')
const JSZip = require(path.join(process.env.PROBE_ASAR, 'node_modules', 'jszip'))
const { renderWordGuide } = require(path.join(process.env.PROBE_ASAR, 'electron', 'renderWordGuide.cjs'))
;(async () => {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Probe</w:t></w:r></w:p></w:body></w:document>')
  const bytes = await zip.generateAsync({ type: 'nodebuffer' })
  const pdf = Buffer.from(await renderWordGuide({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }))
  console.log('PDF-OK ' + pdf.subarray(0, 5).toString() + ' ' + pdf.length)
})().catch(error => { console.log('PDF-ERROR ' + error.message); process.exitCode = 1 })
`

// Runs the packaged renderWordGuide from inside app.asar (Electron in Node mode) with real Word.
async function verifyWordPdfConversion() {
  const registered = process.platform === 'win32' && spawnSync('reg', ['query', 'HKCR\\Word.Application'], { windowsHide: true }).status === 0
  if (!registered) { console.log('Word PDF conversion skipped: Microsoft Word is not installed'); return }
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-word-probe-'))
  const script = path.join(folder, 'probe.cjs')
  fs.writeFileSync(script, wordProbe)
  try {
    const result = await new Promise(resolve => {
      const probe = spawn(exePath, [script], { cwd: folder, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PROBE_ASAR: asarPath }, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      probe.stdout.on('data', chunk => { out += chunk })
      probe.stderr.on('data', chunk => { out += chunk })
      const timer = setTimeout(() => { out += ' TIMEOUT'; probe.kill() }, 120000)
      probe.once('close', () => { clearTimeout(timer); resolve(out) })
      probe.once('error', error => { clearTimeout(timer); resolve(`PROBE-START-FAILED ${error.message}`) })
    })
    if (/WORD_PDF_(BUSY|UNAVAILABLE)/.test(result)) { console.log(`Word PDF conversion skipped: ${result.trim()}`); return }
    assert.match(result, /PDF-OK %PDF- \d+/, `Packaged app could not convert a DOCX to PDF: ${result}`)
    console.log('Packaged app converts a DOCX to PDF with Word from app.asar')
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

async function main() {
  await verifyWordPdfConversion()
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-157-release-smoke-'))
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const value = server.address().port
      server.close(() => resolve(value))
    })
  })
  const child = spawn(exePath, [`--remote-debugging-port=${port}`], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, APPDATA: path.join(sandbox, 'Roaming'), LOCALAPPDATA: path.join(sandbox, 'Local'), TCD_HUB_DATA_DIR: path.join(sandbox, 'storage'), ELECTRON_START_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let ready = false
  const append = chunk => {
    output = (output + chunk.toString()).slice(-8000)
    if (output.includes('TCD Hub: klar efter')) ready = true
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Packaged app did not start: ${output}`)), 30000)
      const interval = setInterval(() => {
        if (!ready) return
        clearTimeout(timeout)
        clearInterval(interval)
        resolve()
      }, 100)
      child.once('error', error => { clearTimeout(timeout); clearInterval(interval); reject(error) })
      child.once('exit', code => { clearTimeout(timeout); clearInterval(interval); reject(new Error(`Packaged app exited with ${code}: ${output}`)) })
    })
    const deadline = Date.now() + 15000
    let loaded = false
    while (!loaded && Date.now() < deadline) {
      try {
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
        try {
          const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('file:'))
          if (page) {
            await page.locator('#root').getByText('Supply Chain Hub', { exact: true }).waitFor({ timeout: 1000 })
            const status = await page.evaluate(() => window.electronKv.getConnectionStatus())
            assert.equal(path.resolve(status.dataDir), path.join(sandbox, 'storage'))
            loaded = true
          }
        } finally { await browser.close() }
      } catch (error) {
        if (error.code === 'ERR_ASSERTION') throw error
        await new Promise(resolve => setTimeout(resolve, 250))
      }
    }
    assert.ok(loaded, `Packaged login window did not load: ${output}`)
    console.log(`Packaged ${version} login opens with jszip and isolated local storage (${files.size} ASAR entries)`)
  } finally {
    if (process.platform === 'win32' && child.pid) {
      await new Promise(resolve => {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.once('exit', resolve)
        killer.once('error', resolve)
      })
    } else child.kill()
    await fs.promises.rm(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })