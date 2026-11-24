const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { renderWordGuide, convertWithWord, unpackedScriptPath } = require('./renderWordGuide.cjs')

function fakeProcess(code) {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => { child.killed = true }
  if (code !== null) setImmediate(() => child.emit('close', code))
  return child
}

test('rejects invalid DOCX bytes before opening Word', async () => {
  await assert.rejects(renderWordGuide({ data: Uint8Array.of(1, 2, 3).buffer }), /gyldigt DOCX/)
})

// PowerShell cannot read a file inside app.asar, so the packaged app must start the script from app.asar.unpacked.
test('starts the Word helper from app.asar.unpacked in the packaged app', () => {
  assert.equal(
    unpackedScriptPath('C:\\Program Files\\Hub\\resources\\app.asar\\electron\\wordToPdf.ps1'),
    'C:\\Program Files\\Hub\\resources\\app.asar.unpacked\\electron\\wordToPdf.ps1',
  )
  assert.equal(
    unpackedScriptPath('/opt/hub/resources/app.asar/electron/wordToPdf.ps1'),
    '/opt/hub/resources/app.asar.unpacked/electron/wordToPdf.ps1',
  )
})

test('keeps the helper path unchanged outside an asar archive and when already unpacked', () => {
  const dev = path.join('C:\\TCD Tools', 'Hub', 'electron', 'wordToPdf.ps1')
  assert.equal(unpackedScriptPath(dev), dev)
  const unpacked = path.join('C:\\Hub', 'resources', 'app.asar.unpacked', 'electron', 'wordToPdf.ps1')
  assert.equal(unpackedScriptPath(unpacked), unpacked)
})

test('the build unpacks the Word helper so PowerShell can run it', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  assert.ok(pkg.build.asarUnpack?.includes('electron/wordToPdf.ps1'), 'build.asarUnpack must list electron/wordToPdf.ps1')
  assert.ok(fs.existsSync(path.join(__dirname, 'wordToPdf.ps1')))
})

test('uses the local PowerShell/Word helper without a network converter', async () => {
  let executable
  let args
  await convertWithWord('script.ps1', 'guide.docx', 'guide.pdf', {
    spawnProcess: (command, commandArgs) => {
      executable = command
      args = commandArgs
      return fakeProcess(0)
    },
  })
  assert.match(executable, /WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/i)
  assert.deepEqual(args.slice(-3), ['script.ps1', 'guide.docx', 'guide.pdf'])
})

test('maps a missing Word installation to a stable error code', async () => {
  await assert.rejects(convertWithWord('script.ps1', 'guide.docx', 'guide.pdf', {
    spawnProcess: () => fakeProcess(41),
  }), /WORD_PDF_UNAVAILABLE/)
})

test('maps a busy Word process to a stable error code', async () => {
  await assert.rejects(convertWithWord('script.ps1', 'guide.docx', 'guide.pdf', {
    spawnProcess: () => fakeProcess(43),
  }), /WORD_PDF_BUSY/)
})

test('maps a failed Word conversion to a stable error code', async () => {
  await assert.rejects(convertWithWord('script.ps1', 'guide.docx', 'guide.pdf', {
    spawnProcess: () => fakeProcess(42),
  }), /WORD_PDF_FAILED/)
})

test('reports when the PowerShell helper cannot start', async () => {
  await assert.rejects(convertWithWord('script.ps1', 'guide.docx', 'guide.pdf', {
    spawnProcess: () => {
      const child = fakeProcess(null)
      setImmediate(() => child.emit('error', new Error('ENOENT')))
      return child
    },
  }), /WORD_PDF_UNAVAILABLE/)
})

test('stops a stuck helper without blocking the app indefinitely', async () => {
  let child
  await assert.rejects(convertWithWord('script.ps1', 'guide.docx', 'guide.pdf', {
    spawnProcess: () => { child = fakeProcess(null); return child },
    timeoutMs: 10,
  }), /WORD_PDF_TIMEOUT/)
  assert.equal(child.killed, true)
})

const sampleDirectory = process.env.REAL_GUIDE_DOCX_DIR
if (process.platform === 'win32' && sampleDirectory) {
  for (const name of fs.readdirSync(sampleDirectory).filter(entry => /\.docx$/i.test(entry))) {
    test(`renders original ${name} to a PDF with Word without modifying the DOCX`, async () => {
      const original = fs.readFileSync(path.join(sampleDirectory, name))
      const pdf = Buffer.from(await renderWordGuide({ data: original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength) }))
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
      assert.ok(pdf.length > 1000)
      assert.deepEqual(fs.readFileSync(path.join(sampleDirectory, name)), original)
    })
  }
}
