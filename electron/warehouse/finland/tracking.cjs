// Finlandsforsendelser's tracking windows, ported from Finland T&T's app/tracking.cjs. Electron is loaded on first use,
// so the module can be required where Electron is not (tests).
const fs = require('node:fs')

const NAMES = { Postnord: 'PostNord', DHL: 'DHL', DSV: 'DSV' }

// One tracking window per courier. Opening the next parcel reuses that courier's window
// instead of adding another browser tab.
function createTrackingWindows({ boundsFile, log = () => {} }) {
  const { app, BrowserWindow, session, shell, screen } = require('electron')
  const windows = new Map()
  let bounds = {}
  try { bounds = JSON.parse(fs.readFileSync(boundsFile, 'utf8')) } catch { bounds = {} }
  if (!bounds || typeof bounds !== 'object') bounds = {}
  let ses = null

  function trackingSession() {
    if (ses) return ses
    // Persistent, so a cookie choice on the courier's site is only made once.
    ses = session.fromPartition('persist:tracking')
    // Some courier sites turn away browsers that announce themselves as Electron. The app's own token is cut out whole,
    // since the Hub's name has spaces in it.
    const own = `${app.getName()}/${app.getVersion()}`
    ses.setUserAgent(ses.getUserAgent().split(own).join('').split(' ').filter(t => t && !t.startsWith('Electron/')).join(' '))
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    return ses
  }

  function onScreen(b) {
    if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return {}
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      b.x < a.x + a.width - 100 && b.x + b.width > a.x + 100 && b.y >= a.y - 10 && b.y < a.y + a.height - 100)
    return visible ? { x: b.x, y: b.y, width: b.width, height: b.height } : {}
  }

  function remember(courier, w) {
    if (w.isDestroyed()) return
    bounds[courier] = w.getNormalBounds()
    try { fs.writeFileSync(boundsFile, JSON.stringify(bounds)) } catch { /* only window placement is lost */ }
  }

  // Shows the window on top without taking the keyboard, so dates can still be typed in the Hub.
  function bringForward(w) {
    if (w.isMinimized()) w.restore()
    w.showInactive()
    w.moveTop()
  }

  function open(courier, tracking, url) {
    const title = `${NAMES[courier] || courier} sporing: ${tracking}`
    const existing = windows.get(courier)
    if (existing && !existing.isDestroyed()) {
      existing.setTitle(title)
      existing.loadURL(url).catch(error => log(`side ikke indlæst: ${error?.code || error?.message}`))
      bringForward(existing)
      log(`genbrugt ${courier}-vindue`)
      return
    }
    const w = new BrowserWindow({
      width: 1050,
      height: 900,
      ...onScreen(bounds[courier]),
      title,
      autoHideMenuBar: true,
      show: false,
      webPreferences: { session: trackingSession(), contextIsolation: true, sandbox: true, nodeIntegration: false },
    })
    w.setMenu(null)
    w.on('page-title-updated', event => event.preventDefault())
    // Links that open a new window go to the normal browser rather than piling up here.
    w.webContents.setWindowOpenHandler(({ url: target }) => {
      if (/^https:\/\//i.test(target)) shell.openExternal(target)
      return { action: 'deny' }
    })
    w.on('close', () => remember(courier, w))
    w.on('closed', () => { if (windows.get(courier) === w) windows.delete(courier) })
    windows.set(courier, w)
    // A page that fails, or is replaced while it loads, rejects; the window shows what it got.
    w.loadURL(url).catch(error => log(`side ikke indlæst: ${error?.code || error?.message}`))
    bringForward(w)
    log(`nyt ${courier}-vindue`)
  }

  function closeAll() {
    for (const [courier, w] of windows) {
      remember(courier, w)
      if (!w.isDestroyed()) w.destroy()
    }
    windows.clear()
  }

  return { open, closeAll, count: () => windows.size }
}

module.exports = { createTrackingWindows }
