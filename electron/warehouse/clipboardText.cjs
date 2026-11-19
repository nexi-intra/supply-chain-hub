// The SAP scripts read their lists (materials, documents, serials) from the Windows clipboard. Electron 44's clipboard is
// async and resolves even when Windows refuses it, so the text is read back before SAP is started: never old text.
const CLIPBOARD_REFUSED = 'Udklipsholderen virker ikke lige nu (Windows nægter adgang), så SAP kan ikke få listen – prøv igen, eller tag ét ad gangen'

const sameText = (a, b) => String(a ?? '').replace(/\r\n/g, '\n') === String(b ?? '').replace(/\r\n/g, '\n')

/** True when the clipboard really holds `text` afterwards. */
async function putOnClipboard(clipboard, text) {
  await clipboard.writeText(text)
  return sameText(await clipboard.readText(), text)
}

module.exports = { putOnClipboard, CLIPBOARD_REFUSED }
