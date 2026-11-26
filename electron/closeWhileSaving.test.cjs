const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { guardCloseWhileSaving, savingMessage } = require('./closeWhileSaving.cjs')

function fakeWindow() {
  const win = new EventEmitter()
  win.destroyed = false
  win.closes = 0
  win.isDestroyed = () => win.destroyed
  // Like BrowserWindow.close(): emits 'close', and only closes if no listener prevented it.
  win.close = () => {
    let prevented = false
    win.emit('close', { preventDefault: () => { prevented = true } })
    if (!prevented) { win.closes++; win.destroyed = true }
  }
  return win
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('with nothing being saved the window closes at once and no message is shown', () => {
  const win = fakeWindow()
  let shown = 0
  guardCloseWhileSaving(win, { hasPendingWrites: () => false, whenSaved: async () => true, showMessage: async () => { shown++ }, language: () => 'da' })
  win.close()
  assert.equal(win.closes, 1)
  assert.equal(shown, 0)
})

test('a pending write keeps the window open with a message and closes it by itself once saved', async () => {
  const win = fakeWindow()
  const saved = deferred()
  const messages = []
  let aborted = false
  guardCloseWhileSaving(win, {
    hasPendingWrites: () => true,
    whenSaved: () => saved.promise,
    showMessage: (options, signal) => { messages.push(options); return new Promise(resolve => signal.addEventListener('abort', () => { aborted = true; resolve() })) },
    language: () => 'da',
  })
  win.close()
  assert.equal(win.closes, 0, 'must not close while the write is on its way')
  assert.equal(messages.length, 1)
  assert.match(messages[0].message, /Gemmer/)
  win.close()
  assert.equal(messages.length, 1, 'a second click on X must not stack messages')
  saved.resolve(true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(aborted, true, 'the message is taken down when everything is saved')
  assert.equal(win.closes, 1)
})

test('"Luk alligevel" closes at once even though the write is not done', async () => {
  const win = fakeWindow()
  guardCloseWhileSaving(win, {
    hasPendingWrites: () => true,
    whenSaved: () => new Promise(() => {}),
    showMessage: async () => ({ response: 0 }),
    language: () => 'da',
  })
  win.close()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(win.closes, 1)
})

test('the message follows the language of the app', () => {
  assert.match(savingMessage('en').message, /Saving/)
  assert.match(savingMessage('fi').buttons[0], /\S/)
  assert.match(savingMessage('sv').message, /Sparar/)
  assert.deepEqual(savingMessage('xx'), savingMessage('da'))
})

test('closing asks first when confirmClose has something to say, and "Bliv i programmet" keeps the window', async () => {
  const win = fakeWindow()
  const answer = deferred()
  let asked = 0
  guardCloseWhileSaving(win, {
    hasPendingWrites: () => false,
    whenSaved: async () => true,
    showMessage: async () => {},
    language: () => 'da',
    confirmClose: () => { asked++; return answer.promise },
  })
  win.close()
  win.close()
  assert.equal(asked, 1, 'a second click on X must not ask twice')
  assert.equal(win.closes, 0)
  answer.resolve(false)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(win.closes, 0, 'stays open')
  win.close()
  assert.equal(asked, 2, 'asked again at the next close')
})

test('"Luk alligevel" goes on to the saving guard, and a failing check closes without asking', async () => {
  const win = fakeWindow()
  const saved = deferred()
  const messages = []
  guardCloseWhileSaving(win, {
    hasPendingWrites: () => true,
    whenSaved: () => saved.promise,
    showMessage: (options, signal) => { messages.push(options); return new Promise(resolve => signal.addEventListener('abort', resolve)) },
    language: () => 'da',
    confirmClose: async () => true,
  })
  win.close()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(win.closes, 0, 'still waits for the write')
  assert.equal(messages.length, 1)
  saved.resolve(true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(win.closes, 1)

  const other = fakeWindow()
  guardCloseWhileSaving(other, { hasPendingWrites: () => false, whenSaved: async () => true, showMessage: async () => {}, language: () => 'da', confirmClose: async () => { throw new Error('M: is away') } })
  other.close()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(other.closes, 1)
})
