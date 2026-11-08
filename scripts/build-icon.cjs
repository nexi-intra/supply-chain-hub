// Builds build/icon.ico (window, taskbar and exe icon) from public/app-logo.svg.
// Run with Electron so the SVG is drawn by Chromium: npx.cmd electron scripts/build-icon.cjs
// Each size is drawn on its own (crisper than scaling one big picture down) and stored as PNG inside the ICO.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const root = path.join(__dirname, '..')
const svg = fs.readFileSync(path.join(root, 'public', 'app-logo.svg'), 'utf8')

const os = require('node:os')

async function renderAll(sizes) {
  const max = Math.max(...sizes)
  const page = path.join(os.tmpdir(), `sch-icon-${process.pid}.html`)
  fs.writeFileSync(page, `<html><body style="margin:0;background:transparent;overflow:hidden"><img id="logo" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="display:block"></body></html>`)
  const win = new BrowserWindow({ width: max, height: max, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } })
  try {
    await win.loadFile(page)
    const pngs = []
    for (const size of sizes) {
      await win.webContents.executeJavaScript(`(() => { const img = document.getElementById('logo'); img.style.width = img.style.height = '${size}px'; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))) })()`)
      await new Promise(resolve => setTimeout(resolve, 150))
      let image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
      if (image.getSize().width !== size) image = image.resize({ width: size, height: size, quality: 'best' })
      pngs.push({ size, data: image.toPNG() })
    }
    return pngs
  } finally {
    win.destroy()
    fs.rmSync(page, { force: true })
  }
}

function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = header.length
  pngs.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...pngs.map(png => png.data)])
}

app.whenReady().then(async () => {
  const pngs = await renderAll(SIZES)
  const target = path.join(root, 'build', 'icon.ico')
  fs.writeFileSync(target, ico(pngs))
  console.log(`wrote ${target} (${SIZES.join(', ')} px)`)
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
