const test = require('node:test')
const assert = require('node:assert/strict')
const { createTrustedWindow } = require('./trustedWindow.cjs')
function fixture() {
  const url = 'file:///synthetic/index.html', frame = { routingId: 1, processId: 2, url }
  const event = { sender: { isDestroyed: () => false, mainFrame: frame }, senderFrame: frame }
  const trusted = createTrustedWindow({ fromWebContents: () => ({}) }, () => url)
  return { event, trusted }
}
test('only the app main frame can call the backend, including SPA routes', () => {
  const f = fixture(); assert.equal(f.trusted(f.event), true)
  f.event.senderFrame = { ...f.event.senderFrame, url: 'file:///synthetic/index.html#/guides' }
  assert.equal(f.trusted(f.event), true)
  for (const change of [{ routingId: 3 }, { processId: 4 }, { url: 'https://example.test' }, { url: 'file:///synthetic/other.html' }]) {
    const g = fixture(); g.event.senderFrame = { ...g.event.senderFrame, ...change }; assert.equal(g.trusted(g.event), false)
  }
})
test('destroyed, missing or malformed frames fail closed', () => {
  const f = fixture(); f.event.sender.isDestroyed = () => true; assert.equal(f.trusted(f.event), false)
  assert.equal(f.trusted(null), false)
  const g = fixture(); g.event.senderFrame = null; assert.equal(g.trusted(g.event), false)
  const h = fixture(); h.event.senderFrame = { ...h.event.senderFrame, url: 'not a URL' }; assert.equal(h.trusted(h.event), false)
})
