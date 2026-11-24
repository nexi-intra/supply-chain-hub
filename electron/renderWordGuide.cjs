const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const JSZip = require('jszip')

// PowerShell cannot open a file inside app.asar; electron-builder copies the helper to app.asar.unpacked (build.asarUnpack).
function unpackedScriptPath(scriptPath) {
  return scriptPath.replace(/([\\/])app\.asar(?=[\\/])/, '$1app.asar.unpacked')
}

function convertWithWord(scriptPath, sourcePath, pdfPath, { spawnProcess = spawn, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const child = spawnProcess(executable, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath, sourcePath, pdfPath,
    ], { windowsHide: true })
    let stdout = ''
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-4096) })
    child.stderr.on('data', () => {})
    const timer = setTimeout(() => {
      finish(new Error('WORD_PDF_TIMEOUT'))
      child.kill()
      const wordProcessId = stdout.match(/(?:^|\r?\n)WORD_PROCESS=(\d+)(?:\r?\n|$)/)?.[1]
      if (process.platform === 'win32' && wordProcessId) {
        const killer = spawnProcess('taskkill', ['/PID', wordProcessId, '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => {})
        killer.unref?.()
      }
    }, timeoutMs)
    child.once('error', () => finish(new Error('WORD_PDF_UNAVAILABLE')))
    child.once('close', (code, signal) => {
      if (!signal && code === 0) finish()
      else finish(new Error(code === 41 ? 'WORD_PDF_UNAVAILABLE' : code === 43 ? 'WORD_PDF_BUSY' : 'WORD_PDF_FAILED'))
    })
  })
}

async function renderWordGuide(payload) {
  const data = payload?.data
  if (!(data instanceof ArrayBuffer) || !data.byteLength || data.byteLength > 100 * 1024 * 1024) {
    throw new Error('Ugyldig eller for stor Word-fil')
  }
  try {
    const zip = await JSZip.loadAsync(data)
    if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) throw new Error('Missing Word parts')
  } catch {
    throw new Error('Filen er ikke et gyldigt DOCX-dokument')
  }
  const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tcd-guide-preview-'))
  let conversionError
  try {
    await fs.promises.writeFile(path.join(folder, 'guide.docx'), Buffer.from(data))
    await convertWithWord(unpackedScriptPath(path.join(__dirname, 'wordToPdf.ps1')), path.join(folder, 'guide.docx'), path.join(folder, 'guide.pdf'))
    const pdf = await fs.promises.readFile(path.join(folder, 'guide.pdf'))
    if (pdf.subarray(0, 5).toString() !== '%PDF-' || pdf.byteLength > 100 * 1024 * 1024) {
      throw new Error('PDF-konvertering gav ikke en gyldig PDF')
    }
    return Uint8Array.from(pdf).buffer
  } catch (error) {
    conversionError = error
    throw error
  } finally {
    try {
      await fs.promises.rm(folder, { recursive: true, force: true, maxRetries: 60, retryDelay: 250 })
    } catch (error) {
      if (!conversionError) throw error
      console.error('Kunne ikke fjerne midlertidige guidefiler efter konverteringsfejl:', error)
    }
  }
}

module.exports = { renderWordGuide, convertWithWord, unpackedScriptPath }