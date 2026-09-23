const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const asar = require('@electron/asar')
const { chromium } = require('playwright-core')

const root = path.resolve(process.argv[2] || path.join(__dirname, '..', 'release', 'win-unpacked'))
const asarPath = path.join(root, 'resources', 'app.asar')
const exePath = path.join(root, 'Supply Chain Hub.exe')
const files = new Set(asar.listPackage(asarPath).map(file => file.replaceAll('\\', '/')))
for (const file of ['/electron/main.cjs', '/electron/openWordGuide.cjs', '/electron/renderWordGuide.cjs', '/node_modules/jszip/lib/index.js']) {
  assert.ok(files.has(file), `Packaged runtime missing ${file}`)
}
assert.equal(JSON.parse(asar.extractFile(asarPath, 'package.json')).version, '1.5.7')
assert.ok(fs.statSync(exePath).size > 0, 'Packaged executable is missing')

async function main() {
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
    console.log(`Packaged 1.5.7 login opens with jszip and isolated local storage (${files.size} ASAR entries)`)
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