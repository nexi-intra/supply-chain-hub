const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createOutlookDrafter, createFakeDrafter } = require('./outlookDraft.cjs')

function attachment() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-mail-test-'))
  const file = path.join(dir, 'SAP-fejl TCD.xlsx')
  fs.writeFileSync(file, 'x')
  return file
}

test('the draft text goes to the script through UTF-8 files, and the temp folder is removed', async () => {
  const seen = {}
  const execFile = (exe, args, options, callback) => {
    const dir = args[3]
    for (const name of ['to.txt', 'cc.txt', 'subject.txt', 'body.html', 'attachment.txt']) seen[name] = fs.readFileSync(path.join(dir, name), 'utf8')
    seen.dir = dir
    seen.args = args.slice(0, 3)
    callback(null, 'noise\r\n{"ok":true}\r\n')
  }
  const file = attachment()
  const drafter = createOutlookDrafter({ scriptPath: 'C:\\x\\draft.vbs', cscriptPath: 'cscript.exe', execFile })
  assert.deepEqual(await drafter.draft({ to: 'sap@example.test', cc: '', subject: 'SAP-fejl – æøå\r\nBcc: x', html: '<p>Hej</p>', attachment: file }), { ok: true })
  assert.deepEqual(seen.args, ['//NoLogo', '//E:vbscript', 'C:\\x\\draft.vbs'])
  assert.deepEqual([seen['to.txt'], seen['subject.txt'], seen['body.html'], seen['attachment.txt']], ['sap@example.test', 'SAP-fejl – æøå Bcc: x', '<p>Hej</p>', file])
  assert.equal(fs.existsSync(seen.dir), false)
})

test('no classic Outlook gives OUTLOOK_UNAVAILABLE; a missing attachment is refused before Outlook is opened', async () => {
  let calls = 0
  const drafter = createOutlookDrafter({ scriptPath: 'draft.vbs', cscriptPath: 'cscript.exe', execFile: (exe, args, options, callback) => { calls++; callback(null, '{"ok":false,"error":"no-outlook"}') } })
  await assert.rejects(drafter.draft({ subject: 'S', html: '', attachment: attachment() }), { code: 'OUTLOOK_UNAVAILABLE' })
  await assert.rejects(drafter.draft({ subject: 'S', html: '', attachment: 'C:\\nope\\x.xlsx' }), { code: 'OUTLOOK_FAILED' })
  await assert.rejects(drafter.draft({ subject: 'S', html: '', attachment: 'relative.xlsx' }), { code: 'OUTLOOK_FAILED' })
  assert.equal(calls, 1)
})

test('the fake drafter for E2E writes the draft as JSON', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-fake-outlook-'))
  await createFakeDrafter(dir).draft({ to: 'a@example.test', subject: 'S', html: '<p>x</p>' })
  const [name] = fs.readdirSync(dir)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).subject, 'S')
})

test('the attachment is checked without a synchronous file call (it lies on M:)', async t => {
  const existsSync = t.mock.method(fs, 'existsSync')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-fake-outlook-'))
  await createFakeDrafter(dir).draft({ subject: 'S', html: '', attachment: attachment() })
  await assert.rejects(createFakeDrafter(dir).draft({ subject: 'S', html: '', attachment: 'C:\\nope\\x.xlsx' }), { code: 'OUTLOOK_FAILED' })
  assert.equal(existsSync.mock.callCount(), 0)
})