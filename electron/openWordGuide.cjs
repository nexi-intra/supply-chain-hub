const path = require('node:path')
const JSZip = require('jszip')

async function openWordGuide({ dialog, shell, fs, window }, payload) {
  const name = String(payload?.fileName || '')
  if (!/\.docx$/i.test(name) || /[\\/:*?"<>|]/.test(name) || /^\.+$/.test(name)) {
    throw new Error('Ugyldigt Word-filnavn')
  }
  if (!(payload.data instanceof ArrayBuffer) || payload.data.byteLength === 0 || payload.data.byteLength > 100 * 1024 * 1024) {
    throw new Error('Ugyldig eller for stor Word-fil')
  }
  let zip
  try {
    zip = await JSZip.loadAsync(payload.data)
    if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) throw new Error('Missing Word parts')
  } catch {
    throw new Error('Filen er ikke et gyldigt DOCX-dokument')
  }

  const result = await dialog.showSaveDialog(window, {
    title: 'Gem en kopi og aabn i Word',
    defaultPath: name,
    filters: [{ name: 'Word-dokument', extensions: ['docx'] }],
  })
  if (result.canceled || !result.filePath) return null
  if (path.extname(result.filePath).toLowerCase() !== '.docx') throw new Error('Vælg et DOCX-filnavn')
  await fs.promises.writeFile(result.filePath, Buffer.from(payload.data))
  const openError = await shell.openPath(result.filePath)
  if (openError) throw new Error(`Filen blev gemt paa ${result.filePath}, men kunne ikke aabnes: ${openError}`)
  return result.filePath
}

module.exports = { openWordGuide }