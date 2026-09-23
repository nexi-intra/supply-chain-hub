const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { spawn } = require('node:child_process')
const JSZip = require('jszip')

function findSoffice() {
  const candidates = [
    process.env.TCD_GUIDE_SOFFICE_PATH,
    process.resourcesPath && path.join(process.resourcesPath, 'libreoffice', 'program', 'soffice.com'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'TCD Hub', 'libreoffice', 'program', 'soffice.com'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'LibreOffice', 'program', 'soffice.com'),
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate))
}

function convertOnce(soffice, folder, attempt) {
  return new Promise((resolve, reject) => {
    const profile = pathToFileURL(path.join(folder, `profile-${attempt}`)).href
    const child = spawn(soffice, [
      `-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf:writer_pdf_Export',
      '--outdir', folder, path.join(folder, 'guide.docx'),
    ], { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-1024) })
    const timer = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).unref()
      } else {
        child.kill()
      }
    }, 60000)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (signal || code !== 0) reject(new Error(`PDF-konvertering fejlede: ${stderr || signal || code}`))
      else resolve()
    })
  })
}

async function convert(soffice, folder) {
  try {
    await convertOnce(soffice, folder, 1)
  } catch (error) {
    if (!/Could not find platform independent libraries <prefix>/i.test(String(error))) throw error
    await convertOnce(soffice, folder, 2)
  }
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
  const soffice = findSoffice()
  if (!soffice) throw new Error('LibreOffice mangler. PDF-visning kan ikke dannes på denne computer.')
  const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tcd-guide-preview-'))
  let conversionError
  try {
    await fs.promises.writeFile(path.join(folder, 'guide.docx'), Buffer.from(data))
    await convert(soffice, folder)
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

module.exports = { renderWordGuide }