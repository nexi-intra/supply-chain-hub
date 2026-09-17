function normalizedUrl(value) { const url = new URL(value); url.search = ''; url.hash = ''; return url.href }
function createTrustedWindow(BrowserWindow, getAppUrl) {
  return event => {
    try {
      if (!event?.sender || event.sender.isDestroyed() || !BrowserWindow.fromWebContents(event.sender) || !event.senderFrame) return false
      const frame = event.senderFrame, main = event.sender.mainFrame
      return frame.routingId === main.routingId && frame.processId === main.processId && normalizedUrl(frame.url) === normalizedUrl(getAppUrl())
    } catch { return false }
  }
}
module.exports = { createTrustedWindow }
