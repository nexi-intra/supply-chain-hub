const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createFixtureRunner } = require('./sapFixtures.cjs')

const FIXTURES = path.join(__dirname, 'fixtures', 'sap')

test('fake SAP reads the materials and documents from an async (Electron 44) clipboard', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sap-fixtures-'))
  try {
    let clipboard = 'R092-0039\r\nR133-0032'
    const runScript = createFixtureRunner(FIXTURES, { readClipboard: () => Promise.resolve(clipboard) })
    await runScript('pidoc-create', ['PS4', 'test', 'D000', 'unrestricted', 'CPTEST01', dir, 'test.txt', '60', 'R092-0039', 'clipboard'])
    const log = fs.readFileSync(path.join(dir, 'test.txt'), 'utf8')
    assert.match(log, /Total Number of Stock Management Units for PI\s+2/)
    assert.match(log, /\tR133-0032\t/)
    clipboard = '105900001\r\n105900002'
    await runScript('pidoc-post', ['PS4', '2026', dir, 'mi20.txt', 'mi22.txt', '60', '105900001', '105900001', '105900002', 'clipboard'])
    const posted = fs.readFileSync(path.join(dir, 'mi20.txt'), 'utf8')
    assert.match(posted, /\t105900001\t/)
    assert.match(posted, /\t105900002\t/)
    await runScript('pidoc-post', ['PS4', '2026', dir, 'mi20.txt', 'mi22.txt', '60', '105900003', '105900003', '105900003'])
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'mi20.txt'), 'utf8'), /\t105900001\t/, 'one document: the clipboard is not read')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
