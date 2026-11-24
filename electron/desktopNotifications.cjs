// Windows toasts for hub notifications: dedupe across restarts, no toast while the window has focus,
// a burst limit, and click -> focus + navigate. All state lives in one small local file in userData.
const nodeFs = require('node:fs')
const path = require('node:path')

const STATE_FILE = 'desktop-notifications-seen.json'
const SEEN_LIMIT = 1000
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10_000
const LANGUAGES = ['da', 'en', 'fi', 'sv']
const VIEW_IDS = ['hub', 'guides', 'knowledge', 'calendar', 'shifts', 'admin', 'manager', 'creator', 'team', 'email', 'meals', 'games', 'projects', 'improvements', 'notebook', 'links', 'warehouse']
const LIMITS = { id: 200, title: 120, body: 300, param: 200 }
const PARAM_KEYS = ['tab', 'itemId', 'search']

const SUMMARY = {
  da: n => `${n} ${n === 1 ? 'ny notifikation' : 'nye notifikationer'} i Supply Chain Hub`,
  en: n => `${n} new ${n === 1 ? 'notification' : 'notifications'} in Supply Chain Hub`,
  fi: n => `${n} ${n === 1 ? 'uusi ilmoitus' : 'uutta ilmoitusta'} Supply Chain Hubissa`,
  sv: n => `${n} ${n === 1 ? 'ny notis' : 'nya notiser'} i Supply Chain Hub`,
}

function invalid(message) {
  return Object.assign(new Error(`NOTIFICATION_INVALID: ${message}`), { code: 'NOTIFICATION_INVALID' })
}

function isPlain(value) {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function boundedString(value, name, max, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.length === 0)) throw invalid(`Invalid ${name}`)
  return value
}

function onlyKeys(value, allowed, name) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw invalid(`Unknown ${name} field`)
}

function normalizeTarget(target) {
  if (target === undefined || target === null) return null
  if (!isPlain(target)) throw invalid('Invalid target')
  onlyKeys(target, ['view', 'params'], 'target')
  if (typeof target.view !== 'string' || !VIEW_IDS.includes(target.view)) throw invalid('Unknown target view')
  if (target.params === undefined) return { view: target.view }
  if (!isPlain(target.params)) throw invalid('Invalid target params')
  onlyKeys(target.params, PARAM_KEYS, 'target param')
  const params = {}
  for (const key of PARAM_KEYS) if (target.params[key] !== undefined) params[key] = boundedString(target.params[key], `target param ${key}`, LIMITS.param)
  return { view: target.view, params }
}

function normalizeDesktopNotification(input) {
  if (!isPlain(input)) throw invalid('Invalid payload')
  onlyKeys(input, ['id', 'title', 'body', 'target', 'language'], 'notification')
  if (input.language !== undefined && !LANGUAGES.includes(input.language)) throw invalid('Unknown language')
  return {
    id: boundedString(input.id, 'id', LIMITS.id),
    title: boundedString(input.title, 'title', LIMITS.title),
    body: boundedString(input.body, 'body', LIMITS.body, { allowEmpty: true }),
    target: normalizeTarget(input.target),
    language: input.language ?? 'en',
  }
}

function createDesktopNotifier({
  Notification, getWindow, userDataDir, now = Date.now, fs = nodeFs,
  setTimer = (callback, ms) => { const timer = setTimeout(callback, ms); timer.unref?.(); return timer },
  clearTimer = timer => clearTimeout(timer),
}) {
  const file = path.join(userDataDir, STATE_FILE)
  let enabled = true
  let seen = []
  let seenSet = new Set()
  let loaded = false
  let language = 'en'
  let shownAt = []
  let overflow = 0
  let summaryTimer = null
  const live = new Set()

  function load() {
    if (loaded) return
    loaded = true
    try {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (state && typeof state === 'object') {
        if (state.enabled === false) enabled = false
        if (Array.isArray(state.seen)) seen = state.seen.filter(id => typeof id === 'string').slice(-SEEN_LIMIT)
      }
    } catch {
      // Missing or unreadable state starts fresh: default on, nothing seen.
    }
    seenSet = new Set(seen)
  }

  function save() {
    const temp = `${file}.${process.pid}.tmp`
    try {
      fs.mkdirSync(userDataDir, { recursive: true })
      fs.writeFileSync(temp, JSON.stringify({ enabled, seen }))
      fs.renameSync(temp, file)
    } catch {
      // A failing disk only costs dedupe across restarts; never break the app over it.
    }
  }

  function remember(id) {
    seen.push(id)
    seenSet.add(id)
    if (seen.length > SEEN_LIMIT) {
      seen = seen.slice(-SEEN_LIMIT)
      seenSet = new Set(seen)
    }
    save()
  }

  const windowFocused = () => {
    const win = getWindow()
    return Boolean(win) && !win.isDestroyed() && win.isFocused()
  }

  function focusWindow(target, clickId) {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (target) win.webContents.send('app:navigate', target, clickId)
  }

  function show(options, target, clickId) {
    const toast = new Notification(options)
    live.add(toast)
    const release = () => { live.delete(toast) }
    toast.on('click', () => { release(); focusWindow(target, clickId) })
    toast.on('close', release)
    toast.on('failed', release)
    toast.show()
  }

  function flushSummary() {
    summaryTimer = null
    const count = overflow
    overflow = 0
    if (count === 0 || windowFocused()) return
    show({ title: SUMMARY[language](count), body: '' }, null)
  }

  /** `clickId` is the renderer's own id for the item (`id` is scoped to the user); a click sends it back. */
  function notify({ id, title, body, target = null, language: requested, clickId = id }) {
    load()
    if (!enabled) return 'disabled'
    if (!Notification.isSupported()) return 'unsupported'
    if (requested && SUMMARY[requested]) language = requested
    if (seenSet.has(id)) return 'already-seen'
    remember(id)
    if (windowFocused()) return 'window-focused'
    const current = now()
    shownAt = shownAt.filter(time => current - time < RATE_WINDOW_MS)
    if (shownAt.length >= RATE_LIMIT) {
      overflow++
      if (!summaryTimer) summaryTimer = setTimer(flushSummary, RATE_WINDOW_MS)
      return 'rate-limited'
    }
    shownAt.push(current)
    show({ title, body }, target, clickId)
    return 'shown'
  }

  return {
    notify,
    isEnabled() { load(); return enabled },
    setEnabled(value) {
      load()
      enabled = Boolean(value)
      if (!enabled && summaryTimer) { clearTimer(summaryTimer); summaryTimer = null; overflow = 0 }
      save()
    },
  }
}

/** IPC-facing wrapper: validates input and scopes ids to the signed-in user so a shared machine never mixes users. */
function createDesktopNotificationHandlers(notifier) {
  return {
    notify(actor, request) {
      const normalized = normalizeDesktopNotification(request)
      return notifier.notify({ ...normalized, id: `${actor.userId}:${normalized.id}`, clickId: normalized.id })
    },
    enabled(value) {
      if (value === undefined) return notifier.isEnabled()
      if (typeof value !== 'boolean') throw invalid('Invalid enabled flag')
      notifier.setEnabled(value)
      return notifier.isEnabled()
    },
  }
}

module.exports = { createDesktopNotifier, createDesktopNotificationHandlers, normalizeDesktopNotification, SEEN_LIMIT, VIEW_IDS, LIMITS }
