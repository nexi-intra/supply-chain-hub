// Opens a mail draft in classic Outlook through COM (cscript + scripts/outlook/draft.vbs). The draft is shown to the
// user and never sent. Text goes through UTF-8 files in a temp folder, never through command-line arguments.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const childProcess = require('node:child_process')
const { defaultCscriptPath } = require('./sapBridge.cjs')

function codeError(code, message) {
  const error = new Error(message || code)
  error.code = code
  return error
}

const oneLine = value => String(value || '').replace(/[\r\n]+/g, ' ').trim()

function checkDraft({ to = '', cc = '', subject, html, attachment }) {
  if (!subject || typeof html !== 'string') throw codeError('OUTLOOK_FAILED', 'Mailen mangler emne eller tekst')
  if (attachment && (!path.isAbsolute(attachment) || path.extname(attachment).toLowerCase() !== '.xlsx' || !fs.existsSync(attachment))) throw codeError('OUTLOOK_FAILED', 'Excel-filen blev ikke fundet')
  return { to: oneLine(to), cc: oneLine(cc), subject: oneLine(subject), html, attachment: attachment || '' }
}

function createOutlookDrafter({ scriptPath, cscriptPath = defaultCscriptPath(), execFile = childProcess.execFile, tempRoot = os.tmpdir(), timeoutMs = 60000 }) {
  async function draft(input) {
    const mail = checkDraft(input)
    const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-mail-'))
    try {
      await Promise.all([
        fs.promises.writeFile(path.join(dir, 'to.txt'), mail.to, 'utf8'),
        fs.promises.writeFile(path.join(dir, 'cc.txt'), mail.cc, 'utf8'),
        fs.promises.writeFile(path.join(dir, 'subject.txt'), mail.subject, 'utf8'),
        fs.promises.writeFile(path.join(dir, 'body.html'), mail.html, 'utf8'),
        fs.promises.writeFile(path.join(dir, 'attachment.txt'), mail.attachment, 'utf8'),
      ])
      const output = await new Promise((resolve, reject) => {
        execFile(cscriptPath, ['//NoLogo', '//E:vbscript', scriptPath, dir], { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
          if (error) return reject(codeError('OUTLOOK_FAILED', error.killed ? 'Outlook svarede ikke i tide' : 'Outlook-scriptet kunne ikke køre'))
          resolve(String(stdout))
        })
      })
      let result = null
      try { result = JSON.parse(output.trim().split(/\r?\n/).pop()) } catch {}
      if (result?.ok) return { ok: true }
      if (result?.error === 'no-outlook') throw codeError('OUTLOOK_UNAVAILABLE', 'Klassisk Outlook blev ikke fundet')
      throw codeError('OUTLOOK_FAILED', `Outlook-kladden fejlede (${String(result?.error || 'ukendt').slice(0, 40)})`)
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }
  return { draft }
}

/** Development/E2E only: writes the draft as JSON instead of opening Outlook. */
function createFakeDrafter(dir) {
  return {
    async draft(input) {
      const mail = checkDraft(input)
      await fs.promises.mkdir(dir, { recursive: true })
      await fs.promises.writeFile(path.join(dir, `draft-${Date.now()}.json`), JSON.stringify(mail, null, 2), 'utf8')
      return { ok: true }
    },
  }
}

module.exports = { createOutlookDrafter, createFakeDrafter }
