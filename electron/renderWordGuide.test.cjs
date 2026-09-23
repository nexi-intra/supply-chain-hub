const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const childProcess = require('node:child_process')
const { renderWordGuide } = require('./renderWordGuide.cjs')

test('rejects invalid DOCX bytes before opening a converter', async () => {
  await assert.rejects(renderWordGuide({ data: Uint8Array.of(1, 2, 3).buffer }), /gyldigt DOCX/)
})

const sampleDirectory = process.env.REAL_GUIDE_DOCX_DIR
if (sampleDirectory) {
  test('retries a transient LibreOffice Python startup failure with a fresh profile', async t => {
    const converterPath = require.resolve('./renderWordGuide.cjs')
    const originalModule = require.cache[converterPath]
    const originalSofficePath = process.env.TCD_GUIDE_SOFFICE_PATH
    const profiles = []
    const remove = fs.promises.rm
    let failureOnly = false
    let cleanupCount = 0
    process.env.TCD_GUIDE_SOFFICE_PATH = process.execPath
    t.mock.method(fs.promises, 'rm', async (directory, options) => {
      assert.equal(options.maxRetries, 60)
      assert.equal(options.retryDelay, 250)
      await remove(directory, options)
      if (++cleanupCount === 2) throw Object.assign(new Error('locked temp file'), { code: 'EBUSY' })
    })
    t.mock.method(console, 'error', () => {})
    t.mock.method(childProcess, 'spawn', (_executable, args) => {
      const child = new EventEmitter()
      child.stderr = new EventEmitter()
      profiles.push(args[0])
      setImmediate(() => {
        if (profiles.length === 1 || failureOnly) {
          child.stderr.emit('data', 'Could not find platform independent libraries <prefix>')
          child.emit('exit', 1, null)
        } else {
          fs.writeFileSync(path.join(args[args.indexOf('--outdir') + 1], 'guide.pdf'), '%PDF-1.7\n')
          child.emit('exit', 0, null)
        }
      })
      return child
    })
    try {
      delete require.cache[converterPath]
      const { renderWordGuide: renderWithStartupFailure } = require('./renderWordGuide.cjs')
      const name = fs.readdirSync(sampleDirectory).find(entry => /\.docx$/i.test(entry))
      assert.ok(name, 'Real DOCX sample required')
      const original = fs.readFileSync(path.join(sampleDirectory, name))
      const payload = { data: original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength) }
      const pdf = await renderWithStartupFailure(payload)
      assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-')
      assert.equal(profiles.length, 2)
      assert.notEqual(profiles[0], profiles[1])
      failureOnly = true
      profiles.length = 0
      await assert.rejects(renderWithStartupFailure(payload), /Could not find platform independent libraries <prefix>/)
      assert.equal(cleanupCount, 2)
    } finally {
      if (originalSofficePath === undefined) delete process.env.TCD_GUIDE_SOFFICE_PATH
      else process.env.TCD_GUIDE_SOFFICE_PATH = originalSofficePath
      require.cache[converterPath] = originalModule
    }
  })
  for (const name of fs.readdirSync(sampleDirectory).filter((entry) => /\.docx$/i.test(entry))) {
    test(`renders original ${name} to a PDF without modifying the DOCX`, async () => {
      const original = fs.readFileSync(path.join(sampleDirectory, name))
      const pdf = Buffer.from(await renderWordGuide({ data: original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength) }))
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
      assert.ok(pdf.length > 1000)
      assert.deepEqual(fs.readFileSync(path.join(sampleDirectory, name)), original)
    })
  }
}