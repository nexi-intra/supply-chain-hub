// Every SAP and Outlook script compiles. VBScript compiles a whole file before it runs a line, so each script is run as a
// copy that quits right after "Option Explicit": a syntax error (e.g. a reserved word as a variable) fails here,
// and nothing ever reaches SAP or Outlook.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const childProcess = require('node:child_process')
const { defaultCscriptPath, SCRIPTS, WRITE_SCRIPTS } = require('./sapBridge.cjs')

const FOLDERS = [path.join(__dirname, 'sap'), path.join(__dirname, 'outlook')]
const scripts = FOLDERS.flatMap(folder => (fs.existsSync(folder) ? fs.readdirSync(folder).filter(name => name.endsWith('.vbs')).map(name => path.join(folder, name)) : []))
const cscript = process.platform === 'win32' ? defaultCscriptPath() : null

test('every SAP and Outlook script compiles without running', { skip: !cscript || !fs.existsSync(cscript) }, () => {
  assert.ok(scripts.length >= 10, `${scripts.length} scripts`)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbs-compile-'))
  try {
    for (const script of scripts) {
      const source = fs.readFileSync(script, 'utf8')
      assert.match(source, /^Option Explicit\r?$/m, `${path.basename(script)} has Option Explicit`)
      const copy = path.join(dir, path.basename(script))
      fs.writeFileSync(copy, source.replace(/^Option Explicit\r?$/m, 'Option Explicit\r\nWScript.Quit 0'), 'utf8')
      const result = childProcess.spawnSync(cscript, ['//NoLogo', '//E:vbscript', copy], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
      assert.equal(result.status, 0, `${path.basename(script)}: ${(result.stdout + result.stderr).trim()}`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('zms-cons-info.vbs is there and is a read script', () => {
  assert.equal(SCRIPTS['zms-cons-info'], 'zms-cons-info.vbs')
  assert.ok(!Object.hasOwn(WRITE_SCRIPTS, 'zms-cons-info'))
  assert.ok(fs.existsSync(path.join(__dirname, 'sap', 'zms-cons-info.vbs')))
})
