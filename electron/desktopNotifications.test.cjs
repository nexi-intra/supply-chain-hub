const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createDesktopNotifier, createDesktopNotificationHandlers, normalizeDesktopNotification, SEEN_LIMIT, VIEW_IDS } = require('./desktopNotifications.cjs')

const DIR = path.join('C:', 'userData')
const FILE = path.join(DIR, 'desktop-notifications-seen.json')

function memoryFs() {
  const files = new Map()
  const writes = []
  return {
    files, writes,
    mkdirSync() {},
    readFileSync(file) {
      if (!files.has(file)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return files.get(file)
    },
    writeFileSync(file, text) { writes.push(file); files.set(file, text) },
    renameSync(from, to) { files.set(to, files.get(from)); files.delete(from) },
  }
}

function fakeNotification({ supported = true } = {}) {
  const instances = []
  return class FakeNotification {
    static isSupported() { return supported }
    static get instances() { return instances }
    constructor(options) { this.options = options; this.handlers = {}; this.shown = false; instances.push(this) }
    on(event, callback) { this.handlers[event] = callback; return this }
    show() { this.shown = true }
  }
}

function fakeWindow({ focused = false } = {}) {
  const win = {
    focused, destroyed: false, minimized: false, calls: [], sent: [],
    isFocused() { return this.focused },
    isDestroyed() { return this.destroyed },
    isMinimized() { return this.minimized },
    restore() { this.calls.push('restore'); this.minimized = false },
    show() { this.calls.push('show') },
    focus() { this.calls.push('focus'); this.focused = true },
    webContents: { send(channel, ...payload) { win.sent.push([channel, ...payload]) } },
  }
  return win
}

function setup(options = {}) {
  const fs = options.fs ?? memoryFs()
  const Notification = options.Notification ?? fakeNotification()
  const win = options.win === undefined ? fakeWindow() : options.win
  const clock = { time: options.start ?? 1_000_000 }
  const timers = []
  const notifier = createDesktopNotifier({
    Notification, fs, userDataDir: DIR, getWindow: () => win, now: () => clock.time,
    setTimer: (callback, ms) => { const timer = { callback, ms, cleared: false }; timers.push(timer); return timer },
    clearTimer: timer => { timer.cleared = true },
  })
  return { notifier, fs, Notification, win, clock, timers }
}

const item = (id, extra = {}) => ({ id, title: `Title ${id}`, body: `Body ${id}`, target: { view: 'email' }, ...extra })

test('shows a notification when the window is not focused and records the id', () => {
  const { notifier, Notification } = setup()
  assert.equal(notifier.notify(item('a')), 'shown')
  assert.equal(Notification.instances.length, 1)
  assert.equal(Notification.instances[0].shown, true)
  assert.equal(Notification.instances[0].options.title, 'Title a')
  assert.equal(Notification.instances[0].options.body, 'Body a')
})

test('the same id is never shown twice, also across restarts', () => {
  const first = setup()
  assert.equal(first.notifier.notify(item('a')), 'shown')
  assert.equal(first.notifier.notify(item('a')), 'already-seen')
  assert.equal(first.Notification.instances.length, 1)
  const second = setup({ fs: first.fs })
  assert.equal(second.notifier.notify(item('a')), 'already-seen')
  assert.equal(second.Notification.instances.length, 0)
  assert.equal(second.notifier.notify(item('b')), 'shown')
})

test('seen ids are written atomically through a temp file and capped to the newest ones', () => {
  const { notifier, fs } = setup()
  for (let index = 0; index < SEEN_LIMIT + 25; index++) notifier.notify(item(`id-${index}`, { target: null }))
  assert.equal([...fs.files.keys()].filter(file => file !== FILE).length, 0)
  assert.ok(fs.writes.some(file => file !== FILE), 'writes go to a temp file first')
  const saved = JSON.parse(fs.files.get(FILE))
  assert.equal(saved.seen.length, SEEN_LIMIT)
  assert.equal(saved.seen[saved.seen.length - 1], `id-${SEEN_LIMIT + 24}`)
  assert.ok(!saved.seen.includes('id-0'))
})

test('a focused window suppresses the toast but still records the id', () => {
  const win = fakeWindow({ focused: true })
  const { notifier, Notification } = setup({ win })
  assert.equal(notifier.notify(item('a')), 'window-focused')
  assert.equal(Notification.instances.length, 0)
  win.focused = false
  assert.equal(notifier.notify(item('a')), 'already-seen')
  assert.equal(Notification.instances.length, 0)
})

test('a missing or destroyed window counts as not focused', () => {
  const none = setup({ win: null })
  assert.equal(none.notifier.notify(item('a')), 'shown')
  const win = fakeWindow({ focused: true })
  win.destroyed = true
  const gone = setup({ win })
  assert.equal(gone.notifier.notify(item('a')), 'shown')
})

test('is enabled by default; disabling is a persisted no-op that does not record ids', () => {
  const first = setup()
  assert.equal(first.notifier.isEnabled(), true)
  first.notifier.setEnabled(false)
  assert.equal(first.notifier.isEnabled(), false)
  assert.equal(first.notifier.notify(item('a')), 'disabled')
  assert.equal(first.Notification.instances.length, 0)
  const second = setup({ fs: first.fs })
  assert.equal(second.notifier.isEnabled(), false)
  second.notifier.setEnabled(true)
  assert.equal(second.notifier.notify(item('a')), 'shown')
  assert.equal(setup({ fs: first.fs }).notifier.isEnabled(), true)
})

test('is a no-op when notifications are unsupported', () => {
  const { notifier, Notification } = setup({ Notification: fakeNotification({ supported: false }) })
  assert.equal(notifier.notify(item('a')), 'unsupported')
  assert.equal(Notification.instances.length, 0)
})

test('a corrupt state file falls back to defaults', () => {
  const fs = memoryFs()
  fs.files.set(FILE, '{not json')
  const { notifier } = setup({ fs })
  assert.equal(notifier.isEnabled(), true)
  assert.equal(notifier.notify(item('a')), 'shown')
})

test('a failing disk never throws out of notify', () => {
  const fs = memoryFs()
  fs.writeFileSync = () => { throw new Error('EACCES') }
  const { notifier } = setup({ fs })
  assert.equal(notifier.notify(item('a')), 'shown')
  assert.equal(notifier.notify(item('a')), 'already-seen')
})

test('rate limit: max 5 per 10 s, extras are recorded and summarised once', () => {
  const { notifier, Notification, timers, clock } = setup()
  const results = Array.from({ length: 8 }, (_, index) => notifier.notify(item(`id-${index}`, { language: 'en' })))
  assert.deepEqual(results, ['shown', 'shown', 'shown', 'shown', 'shown', 'rate-limited', 'rate-limited', 'rate-limited'])
  assert.equal(Notification.instances.length, 5)
  assert.equal(timers.filter(timer => !timer.cleared).length, 1, 'one summary timer')
  assert.equal(notifier.notify(item('id-6')), 'already-seen', 'rate-limited ids are recorded as seen')
  clock.time += 10_000
  timers[0].callback()
  assert.equal(Notification.instances.length, 6)
  assert.equal(Notification.instances[5].options.title, '3 new notifications in Supply Chain Hub')
  assert.equal(Notification.instances[5].shown, true)
  clock.time += 1
  assert.equal(notifier.notify(item('later')), 'shown', 'window has reset')
})

test('the summary follows the language of the last notification and singular/plural', () => {
  const { notifier, Notification, timers } = setup()
  for (let index = 0; index < 6; index++) notifier.notify(item(`id-${index}`, { language: 'sv' }))
  timers[0].callback()
  assert.equal(Notification.instances[5].options.title, '1 ny notis i Supply Chain Hub')
})

test('the summary is skipped when the window has focus by then', () => {
  const { notifier, Notification, timers, win } = setup()
  for (let index = 0; index < 7; index++) notifier.notify(item(`id-${index}`))
  win.focused = true
  timers[0].callback()
  assert.equal(Notification.instances.length, 5)
})

test('shown notifications outside the burst window do not count against the limit', () => {
  const { notifier, clock } = setup()
  for (let round = 0; round < 3; round++) {
    for (let index = 0; index < 5; index++) assert.equal(notifier.notify(item(`r${round}-${index}`)), 'shown')
    clock.time += 10_001
  }
})

test('click restores and focuses the window and sends app:navigate with the target and the clicked id', () => {
  const { notifier, Notification, win } = setup()
  win.minimized = true
  notifier.notify(item('user1:a', { clickId: 'a', target: { view: 'games', params: { tab: 'multiplayer', itemId: 'g1' } } }))
  Notification.instances[0].handlers.click()
  assert.deepEqual(win.calls, ['restore', 'show', 'focus'])
  assert.deepEqual(win.sent, [['app:navigate', { view: 'games', params: { tab: 'multiplayer', itemId: 'g1' } }, 'a']])
})

test('click on a notification without target only focuses the window', () => {
  const { notifier, Notification, win } = setup()
  notifier.notify(item('a', { target: null }))
  Notification.instances[0].handlers.click()
  assert.deepEqual(win.calls, ['show', 'focus'])
  assert.deepEqual(win.sent, [])
})

test('click does nothing when the window is gone', () => {
  const { notifier, Notification, win } = setup()
  notifier.notify(item('a'))
  win.destroyed = true
  assert.doesNotThrow(() => Notification.instances[0].handlers.click())
  assert.deepEqual(win.sent, [])
})

test('normalizeDesktopNotification accepts a valid request and normalises the target', () => {
  const result = normalizeDesktopNotification({ id: 'x', title: 'T', body: 'B', target: { view: 'games', params: { tab: 'multiplayer', itemId: 'g' } }, language: 'fi' })
  assert.deepEqual(result, { id: 'x', title: 'T', body: 'B', target: { view: 'games', params: { tab: 'multiplayer', itemId: 'g' } }, language: 'fi' })
  assert.deepEqual(normalizeDesktopNotification({ id: 'x', title: 'T', body: '' }), { id: 'x', title: 'T', body: '', target: null, language: 'en' })
  assert.deepEqual(normalizeDesktopNotification({ id: 'x', title: 'T', body: 'B', target: { view: 'hub' } }).target, { view: 'hub' })
})

test('normalizeDesktopNotification enforces bounds, view ids, params and unknown fields', () => {
  const base = { id: 'x', title: 'T', body: 'B', target: { view: 'hub' } }
  const bad = [
    null, 'text', [], { ...base, id: '' }, { ...base, id: 'a'.repeat(201) }, { ...base, id: 5 },
    { ...base, title: '' }, { ...base, title: 'a'.repeat(121) }, { ...base, body: 'a'.repeat(301) }, { ...base, body: 7 },
    { ...base, target: { view: 'unknown-view' } }, { ...base, target: { view: 7 } }, { ...base, target: 'hub' },
    { ...base, target: { view: 'hub', extra: 1 } },
    { ...base, target: { view: 'hub', params: { tab: 'a'.repeat(201) } } },
    { ...base, target: { view: 'hub', params: { itemId: 3 } } },
    { ...base, target: { view: 'hub', params: { other: 'x' } } },
    { ...base, target: { view: 'hub', params: 'x' } },
    { ...base, language: 'de' }, { ...base, extra: true },
  ]
  for (const input of bad) assert.throws(() => normalizeDesktopNotification(input), error => error.code === 'NOTIFICATION_INVALID', JSON.stringify(input))
  assert.doesNotThrow(() => normalizeDesktopNotification({ ...base, id: 'a'.repeat(200), title: 'a'.repeat(120), body: 'a'.repeat(300) }))
})

test('VIEW_IDS covers every view the app can navigate to', () => {
  assert.ok(['hub', 'guides', 'knowledge', 'calendar', 'shifts', 'admin', 'manager', 'creator', 'team', 'email', 'meals', 'games', 'projects', 'improvements', 'notebook'].every(view => VIEW_IDS.includes(view)))
})

test('handlers scope seen ids to the signed-in user and validate the enabled flag', () => {
  const { notifier, Notification } = setup()
  const handlers = createDesktopNotificationHandlers(notifier)
  assert.equal(handlers.notify({ userId: 'u1' }, item('a')), 'shown')
  assert.equal(handlers.notify({ userId: 'u1' }, item('a')), 'already-seen')
  assert.equal(handlers.notify({ userId: 'u2' }, item('a')), 'shown')
  assert.equal(Notification.instances.length, 2)
  assert.throws(() => handlers.notify({ userId: 'u1' }, { ...item('a'), body: 'x'.repeat(301) }), error => error.code === 'NOTIFICATION_INVALID')
  assert.equal(handlers.enabled(undefined), true)
  assert.equal(handlers.enabled(false), false)
  assert.equal(notifier.isEnabled(), false)
  assert.throws(() => handlers.enabled('no'), error => error.code === 'NOTIFICATION_INVALID')
  assert.throws(() => handlers.enabled(1), error => error.code === 'NOTIFICATION_INVALID')
})
