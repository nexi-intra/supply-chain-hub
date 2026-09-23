const { test } = require('node:test')
const assert = require('node:assert/strict')
const JSZip = require('jszip')
const { openWordGuide } = require('./openWordGuide.cjs')

async function fixture() {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('word/document.xml', '<document/>')
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const calls = []
  const deps = {
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: 'C:\\Guides\\guide.docx' }) },
    fs: { promises: { writeFile: async (...args) => { calls.push(args) } } },
    shell: { openPath: async (filePath) => { calls.push(['open', filePath]); return '' } },
    window: {},
  }
  return { data, deps, calls }
}

test('saves exact original bytes before opening the chosen DOCX in Word', async () => {
  const { data, deps, calls } = await fixture()
  assert.equal(await openWordGuide(deps, { fileName: 'guide.docx', data }), 'C:\\Guides\\guide.docx')
  assert.deepEqual(calls.map((call) => call[0]), ['C:\\Guides\\guide.docx', 'open'])
  assert.deepEqual(calls[0][1], Buffer.from(data))
  assert.equal(calls[0].length, 2)
})

test('respects a confirmed replacement in the save dialog', async () => {
  const { deps, data, calls } = await fixture()
  deps.fs.promises.writeFile = async (filePath, contents) => {
    calls.push([filePath, contents])
  }
  await openWordGuide(deps, { fileName: 'guide.docx', data })
  assert.deepEqual(calls.map((call) => call[0]), ['C:\\Guides\\guide.docx', 'open'])
})

test('rejects non-DOCX input without opening a save dialog or writing a file', async () => {
  const { deps, data, calls } = await fixture()
  let dialogCalled = false
  deps.dialog.showSaveDialog = async () => { dialogCalled = true; return { canceled: true } }
  await assert.rejects(openWordGuide(deps, { fileName: '../guide.docx', data }), /filnavn/)
  await assert.rejects(openWordGuide(deps, { fileName: 'guide.docx', data: new Uint8Array([80, 75, 3, 4]).buffer }), /gyldigt DOCX/)
  assert.equal(dialogCalled, false)
  assert.equal(calls.length, 0)
})

test('cancel does not write or open the DOCX', async () => {
  const { deps, data, calls } = await fixture()
  deps.dialog.showSaveDialog = async () => ({ canceled: true })
  assert.equal(await openWordGuide(deps, { fileName: 'guide.docx', data }), null)
  assert.equal(calls.length, 0)
})