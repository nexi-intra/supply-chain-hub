// Finlandsforsendelser data shared by everyone who writes the sheet (BPO and TCD), in one folder on M:: parcels marked
// as not sent, the write lock on the sheet, a log of what was written per day, the sheet's address, and each person's
// drafts (follow-up changes not in the sheet yet), the nShift key and the timelines fetched from nShift. Every change
// goes through mutateAsync, so two PCs never overwrite each other.
const crypto = require('node:crypto')
const fs = require('node:fs')
const { parcelKey } = require('./core/sheetIndex.cjs')

const NOT_SENT_KEY = 'ikke-sendt'
const LOCK_KEY = 'skrivelaas'
const DAY_LOG_KEY = 'dagslog'
const SETTINGS_KEY = 'indstillinger'
const DRAFTS_PREFIX = 'kladder-'
// Not under DRAFTS_PREFIX, so it is never read as someone's drafts.
const CLEARED_LOG_KEY = 'slettede-kladder'
const CLEARED_LOG_MAX = 200
// The nShift client id and secret, and the timelines fetched from nShift per T&T.
const NSHIFT_KEY = 'nshift'
const STATUSES_KEY = 'nshift-status'
const STATUSES_MAX = 4000
const CREDENTIAL_MAX = 200
const RECENT_MS = 30 * 60000
const DAY_LOG_MAX_DAYS = 120
const DEFAULT_LOCK_TTL_MS = 2 * 60000
const NAME_MAX = 64
const URL_MAX = 2048

const TEST_WORKBOOK_URL = 'https://christianiabpos.sharepoint.com/sites/NordicSupplyChain/Shared Documents/General/Testark - Ordre sendt til Finland fra Danmark.xlsx'
const DEFAULT_SETTINGS = { workbookUrl: TEST_WORKBOOK_URL, sheetName: 'Sheet1', tableName: 'Table2' }

function codeError(code, message) {
  const error = new Error(message || code)
  error.code = code
  return error
}

const lower = value => String(value || '').trim().toLowerCase()
const text = value => String(value == null ? '' : value).trim()
const isManager = user => user?.role === 'manager' || user?.role === 'creator'
const nameOf = user => text(user.fullName) || lower(user.email)
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const draftsKeyOf = email => DRAFTS_PREFIX + crypto.createHash('sha1').update(lower(email)).digest('hex').slice(0, 16)
/** The sheet a draft, not-sent mark or written key belongs to; from before sheets were recorded, the test sheet. */
const workbookOf = entry => (isObject(entry) && text(entry.workbookUrl)) || TEST_WORKBOOK_URL
const inWorkbook = (entry, workbookUrl) => !workbookUrl || workbookOf(entry) === workbookUrl
const lockTtl = ttlMs => (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_LOCK_TTL_MS)

function lockedError(current, email) {
  if (email && current.email === email) return codeError('FINLAND_LOCKED', 'FINLAND_LOCKED: Du skriver allerede i arket fra en anden pc. Prøv igen om lidt.')
  return codeError('FINLAND_LOCKED', `FINLAND_LOCKED: ${current.name || current.email} skriver ${dayMonth(current.day)} i arket lige nu`)
}

/** '2026-11-19' as '19.11'; anything else as it is. */
function dayMonth(day) {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(day || ''))
  return match ? `${Number(match[2])}.${Number(match[1])}` : String(day || '')
}

/** An https address or an absolute Windows path to an .xlsx (a local copy for testing). */
function validWorkbookUrl(value) {
  if (!value || value.length > URL_MAX) return false
  if (/^https:\/\/\S/i.test(value)) return true
  return /^([a-z]:\\|\\\\)/i.test(value) && /\.xlsx$/i.test(value)
}

function createFinlandShared({ store, now = Date.now, workbookOverride = '' }) {
  // A local .xlsx copy given when the Hub is started (TCD_HUB_FINLAND_WORKBOOK, for testing); it wins over the sheet
  // chosen in Administration on this PC only, and the shared choice on M: is left as it is.
  const localCopy = /^([a-z]:\\|\\\\)/i.test(text(workbookOverride)) && validWorkbookUrl(text(workbookOverride)) ? text(workbookOverride) : ''

  async function folderExists() {
    return fs.promises.access(store.dataDir).then(() => true, () => false)
  }

  /**
   * A missing key is empty only while the folder is there; with M: down it must not read as "nothing marked".
   * Always from the file, never the read cache: another PC may just have marked a parcel, written keys or taken the lock.
   */
  async function read(key) {
    const value = await store.getAsync(key, { skipCache: true })
    if (value === undefined && store.dataDir && !(await folderExists())) throw codeError('STORAGE_UNAVAILABLE', 'Finlandsforsendelsers fælles data kan ikke læses lige nu')
    return value
  }

  async function keys() {
    try {
      return await store.keysAsync()
    } catch (error) {
      if (error?.code === 'ENOENT') throw codeError('STORAGE_UNAVAILABLE', 'Finlandsforsendelsers fælles data kan ikke læses lige nu')
      throw error
    }
  }

  const notSent = {
    /** Every mark, or only the marks of the sheet `workbookUrl`. */
    async list(workbookUrl = null) {
      const value = await read(NOT_SENT_KEY)
      return Object.values(isObject(value) ? value : {}).filter(entry => inWorkbook(entry, workbookUrl)).sort((a, b) => (a.at || 0) - (b.at || 0))
    },

    /**
     * Marks a parcel as not sent in the sheet `entry.workbookUrl`. Marking it again keeps who marked it first; a mark
     * from another sheet (the test sheet) is replaced.
     */
    async mark(user, entry = {}) {
      const delivery = text(entry.delivery)
      const tracking = text(entry.tracking)
      const key = parcelKey(delivery, tracking)
      if (!delivery || !tracking || key.startsWith('|') || key.endsWith('|')) throw codeError('FINLAND_ENTRY_INVALID', 'Forsendelsen mangler leverance eller T&T')
      const marked = {
        delivery, tracking,
        shippedOn: text(entry.shippedOn), orderType: text(entry.orderType), postalCode: text(entry.postalCode),
        by: lower(user.email), byName: nameOf(user), at: now(),
        ...(text(entry.workbookUrl) ? { workbookUrl: text(entry.workbookUrl) } : {}),
      }
      let stored = marked
      await store.mutateAsync(NOT_SENT_KEY, current => {
        const list = isObject(current) ? current : {}
        if (Object.hasOwn(list, key) && workbookOf(list[key]) === workbookOf(marked)) { stored = list[key]; return undefined }
        return { ...list, [key]: marked }
      })
      return stored
    },

    /** `key` = parcelKey(delivery, tracking). True when it was on the list (for the sheet `workbookUrl` when given). */
    async restore(key, workbookUrl = null) {
      let found = false
      await store.mutateAsync(NOT_SENT_KEY, current => {
        if (!isObject(current) || !Object.hasOwn(current, key) || !inWorkbook(current[key], workbookUrl)) return undefined
        found = true
        const next = { ...current }
        delete next[key]
        return next
      })
      return found
    },
  }

  const lock = {
    /**
     * Takes the write lock on the sheet, or throws FINLAND_LOCKED while any lock that has not expired is held, also one
     * of the same person on another PC. Each acquisition has its own token (`release.token`): only that token renews
     * the lock (renew) or frees it (the returned release), so an expired lock taken by someone else is never freed or
     * written under by an old acquisition. A `ttlMs` that is not a positive number gets the default two minutes; the
     * time is taken once the file lock is held, so waiting for it does not shorten the lock.
     */
    async acquire(user, { day, action, ttlMs } = {}) {
      const email = lower(user.email)
      const token = crypto.randomUUID()
      const ttl = lockTtl(ttlMs)
      await store.mutateAsync(LOCK_KEY, current => {
        const at = now()
        if (isObject(current) && current.expiresAt > at) throw lockedError(current, email)
        return { email, name: nameOf(user), day: text(day), action: text(action), at, expiresAt: at + ttl, token }
      })
      async function release() {
        await store.mutateAsync(LOCK_KEY, current => isObject(current) && current.token === token ? null : undefined)
      }
      release.token = token
      return release
    },

    /**
     * Gives the lock `ttlMs` more from now, only while it is still the acquisition `token`'s and has not expired.
     * Otherwise someone may have taken it and written in between, so FINLAND_LOCKED is thrown and nothing may be written.
     */
    async renew(token, { ttlMs } = {}) {
      const ttl = lockTtl(ttlMs)
      await store.mutateAsync(LOCK_KEY, current => {
        const at = now()
        const live = isObject(current) && current.expiresAt > at
        if (live && token && current.token === token) return { ...current, expiresAt: at + ttl }
        if (live) throw lockedError(current, '')
        throw codeError('FINLAND_LOCKED', 'FINLAND_LOCKED: Låsen på arket løb ud, før programmet nåede at skrive. Intet er skrevet. Prøv igen.')
      })
    },

    /** The lock while it holds, or null. */
    async current() {
      const value = await read(LOCK_KEY)
      if (!isObject(value) || !(value.expiresAt > now())) return null
      return { email: value.email, name: value.name, day: value.day, action: value.action, at: value.at, expiresAt: value.expiresAt }
    },
  }

  // A written key is { at, workbookUrl }; from before sheets were recorded, only its time (the test sheet).
  const keyTime = value => (typeof value === 'number' ? value : Number(value?.at) || 0)

  const dayLog = {
    /**
     * What was just written to the sheet `workbookUrl` for `day`: a summary per day (last writer, when, parcels written
     * in all) and each parcel key with its time, so a colleague's sheet read from before the write does not write it
     * again. Without a `day` only the keys are recorded (rows Excel may have written before it failed).
     */
    async record(user, day, recorded = [], { workbookUrl } = {}) {
      const at = now()
      const book = text(workbookUrl)
      const list = (Array.isArray(recorded) ? recorded : []).map(String).filter(Boolean)
      await store.mutateAsync(DAY_LOG_KEY, current => {
        const days = { ...(isObject(current?.days) ? current.days : {}) }
        const keys = {}
        // Only keys within the recent window are kept, so the file stays small.
        for (const [key, value] of Object.entries(isObject(current?.keys) ? current.keys : {})) if (keyTime(value) >= at - RECENT_MS) keys[key] = value
        for (const key of list) keys[key] = book ? { at, workbookUrl: book } : at
        if (text(day)) {
          // A day written in another sheet before (the test sheet) starts its count over.
          const before = days[day] && workbookOf(days[day]) === (book || TEST_WORKBOOK_URL) ? Number(days[day].count) || 0 : 0
          days[day] = { byName: nameOf(user), at, count: before + list.length, ...(book ? { workbookUrl: book } : {}) }
        }
        const kept = Object.keys(days).sort().slice(-DAY_LOG_MAX_DAYS)
        return { days: Object.fromEntries(kept.map(name => [name, days[name]])), keys }
      })
    },

    /** Keys written in the last `withinMs`, to any sheet or only to the sheet `workbookUrl`. */
    async recentKeys(withinMs = RECENT_MS, workbookUrl = null) {
      const value = await read(DAY_LOG_KEY)
      const since = now() - withinMs
      return new Set(Object.entries(isObject(value?.keys) ? value.keys : {})
        .filter(([, entry]) => keyTime(entry) >= since && inWorkbook(entry, workbookUrl))
        .map(([key]) => key))
    },

    /** The summary per day, of any sheet or only of the sheet `workbookUrl`. */
    async days(workbookUrl = null) {
      const value = await read(DAY_LOG_KEY)
      const days = isObject(value?.days) ? value.days : {}
      return Object.fromEntries(Object.entries(days).filter(([, entry]) => inWorkbook(entry, workbookUrl)))
    },
  }

  const settings = {
    async get() {
      const value = await read(SETTINGS_KEY)
      const stored = isObject(value) ? value : {}
      const result = {
        workbookUrl: stored.workbookUrl || DEFAULT_SETTINGS.workbookUrl,
        sheetName: stored.sheetName || DEFAULT_SETTINGS.sheetName,
        tableName: stored.tableName || DEFAULT_SETTINGS.tableName,
      }
      if (localCopy) return { ...result, workbookUrl: localCopy, isTest: true, localCopy: true }
      return { ...result, isTest: result.workbookUrl === TEST_WORKBOOK_URL }
    },

    /** Which sheet everyone writes. Only a manager or creator. */
    async set(user, values = {}) {
      if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan vælge arket')
      const workbookUrl = text(values.workbookUrl)
      const sheetName = text(values.sheetName)
      const tableName = text(values.tableName)
      if (!validWorkbookUrl(workbookUrl)) throw codeError('FINLAND_SETTINGS_INVALID', 'Arkets adresse skal begynde med https:// eller være en fuld sti til en .xlsx fil')
      if (!sheetName || sheetName.length > NAME_MAX || !tableName || tableName.length > NAME_MAX) throw codeError('FINLAND_SETTINGS_INVALID', 'Fane og tabel skal udfyldes med højst 64 tegn')
      const next = { workbookUrl, sheetName, tableName, by: lower(user.email), byName: nameOf(user), at: now() }
      await store.mutateAsync(SETTINGS_KEY, current => isObject(current) && current.workbookUrl === workbookUrl && current.sheetName === sheetName && current.tableName === tableName ? undefined : next)
      return { workbookUrl, sheetName, tableName, isTest: workbookUrl === TEST_WORKBOOK_URL }
    },
  }

  /**
   * One person's drafts, the same calls as the app's createDraftStore but async. `name` is kept with them for the
   * overview; without it the stored name (or the address) is used.
   */
  function drafts(email, name) {
    const owner = lower(email)
    const key = draftsKeyOf(owner)
    const draftsOf = value => (isObject(value?.drafts) ? value.drafts : {})
    const change = fn => store.mutateAsync(key, current => {
      const before = draftsOf(current)
      const after = fn({ ...before })
      if (!after) return undefined
      return { email: owner, name: text(name) || text(current?.name) || owner, drafts: after }
    })

    return {
      all: async () => Object.values(draftsOf(await read(key))),
      async get(draftKey) {
        const list = draftsOf(await read(key))
        return Object.hasOwn(list, draftKey) ? list[draftKey] : null
      },
      async set(draftKey, draft) {
        if (typeof draftKey !== 'string' || !draftKey) throw codeError('FINLAND_ENTRY_INVALID', 'Kladden mangler en nøgle')
        const updatedAt = new Date(now()).toISOString()
        await change(current => ({ ...current, [draftKey]: { ...draft, updatedAt } }))
      },
      async remove(draftKeys = []) {
        await change(current => {
          const present = draftKeys.filter(draftKey => Object.hasOwn(current, draftKey))
          if (!present.length) return null
          for (const draftKey of present) delete current[draftKey]
          return current
        })
      },
    }
  }

  /**
   * Everyone else's drafts: per person the count per pick-up day and the parcel keys, of every sheet or only of the
   * sheet `workbookUrl`.
   */
  drafts.others = async function others(email, workbookUrl = null) {
    const own = draftsKeyOf(email)
    const result = []
    for (const key of (await keys()).filter(name => name.startsWith(DRAFTS_PREFIX) && name !== own)) {
      const value = await store.getAsync(key)
      const list = Object.fromEntries(Object.entries(isObject(value?.drafts) ? value.drafts : {}).filter(([, draft]) => inWorkbook(draft, workbookUrl)))
      const draftKeys = Object.keys(list)
      if (!draftKeys.length) continue
      const byDay = {}
      let updatedAt = ''
      for (const draft of Object.values(list)) {
        if (draft?.pickedUp) byDay[draft.pickedUp] = (byDay[draft.pickedUp] || 0) + 1
        if (draft?.updatedAt > updatedAt) updatedAt = draft.updatedAt
      }
      result.push({ email: value.email, name: value.name || value.email, byDay, keys: draftKeys, updatedAt })
    }
    return result.sort((a, b) => String(a.name).localeCompare(String(b.name), 'da'))
  }

  /** Deletes someone's drafts in the app (never in the sheet), and logs who did it. Only a manager or creator. */
  drafts.clear = async function clear(manager, email) {
    if (!isManager(manager)) throw codeError('MANAGER_ONLY', 'Kun managers kan slette andres ændringer')
    const target = lower(email)
    let cleared = 0
    let name = target
    await store.mutateAsync(draftsKeyOf(target), current => {
      cleared = Object.keys(isObject(current?.drafts) ? current.drafts : {}).length
      name = text(current?.name) || target
      return cleared ? { ...current, drafts: {} } : undefined
    })
    if (cleared) {
      const entry = { by: lower(manager.email), byName: nameOf(manager), email: target, name, count: cleared, at: now() }
      await store.mutateAsync(CLEARED_LOG_KEY, current => [...(Array.isArray(current) ? current : []), entry].slice(-CLEARED_LOG_MAX))
    }
    return { email: target, cleared }
  }

  /** Who deleted whose drafts, newest first (the last 200). */
  drafts.clearedLog = async function clearedLog() {
    const value = await read(CLEARED_LOG_KEY)
    return (Array.isArray(value) ? value : []).slice().reverse()
  }

  // Only the store's encryption on disk protects the key; the window only ever gets status().
  const storedCredentials = value => (isObject(value) && typeof value.clientId === 'string' && value.clientId && typeof value.clientSecret === 'string' && value.clientSecret
    ? { clientId: value.clientId, clientSecret: value.clientSecret }
    : null)
  const credential = value => (typeof value === 'string' ? value.trim() : '')

  // Only these fields are stored, so a recipient's name or address can never come along.
  const storedTimeline = entry => ({
    tracking: text(entry.tracking),
    carrier: text(entry.carrier),
    fetchedAt: entry.fetchedAt,
    events: (Array.isArray(entry.events) ? entry.events : []).filter(isObject).map(e => ({
      at: text(e.at), statusId: Number(e.statusId), status: text(e.status), text: text(e.text), place: text(e.place),
    })),
  })

  const nshift = {
    /** The client id and secret for the backend's calls to nShift, or null when not set up. Never for the window. */
    async credentials() {
      return storedCredentials(await read(NSHIFT_KEY))
    },

    /** What the window may know: whether it is set up and the last four characters of the client id. */
    async status() {
      const stored = storedCredentials(await read(NSHIFT_KEY))
      return { configured: Boolean(stored), clientIdEnding: stored ? stored.clientId.slice(-4) : '' }
    },

    /** Sets the key everyone uses. Only a manager or creator. Returns the status, never the secret. */
    async set(user, values = {}) {
      // A status manager from Optælling is passed on as a manager, but may not set the key.
      if (!isManager(user) || user.statusManager) throw codeError('MANAGER_ONLY', 'Kun managers kan sætte nShift op')
      const clientId = credential(values?.clientId)
      const clientSecret = credential(values?.clientSecret)
      if (!clientId || clientId.length > CREDENTIAL_MAX || !clientSecret || clientSecret.length > CREDENTIAL_MAX) {
        throw codeError('FINLAND_SETTINGS_INVALID', 'Klient-id og hemmelighed skal udfyldes med højst 200 tegn')
      }
      const next = { clientId, clientSecret, by: lower(user.email), byName: nameOf(user), at: now() }
      await store.mutateAsync(NSHIFT_KEY, current => isObject(current) && current.clientId === clientId && current.clientSecret === clientSecret ? undefined : next)
      return { configured: true, clientIdEnding: clientId.slice(-4) }
    },
  }

  // The status file is large (up to 4000 timelines) and read on every snapshot, so it is parsed again only when its
  // modification time or size has changed. A missing file is always read, so a folder that is gone still refuses.
  let statusesCopy = null

  async function readStatuses() {
    const stat = await store.statAsync(STATUSES_KEY).catch(() => undefined)
    if (stat && statusesCopy && statusesCopy.mtimeMs === stat.mtimeMs && statusesCopy.size === stat.size) return statusesCopy.value
    const value = await read(STATUSES_KEY)
    statusesCopy = stat && isObject(value) ? { ...stat, value } : null
    return value
  }

  const statuses = {
    /** The stored timeline per T&T among `trackings`; T&T never fetched are left out. */
    async get(trackings = []) {
      const value = await readStatuses()
      const stored = isObject(value) ? value : {}
      const result = {}
      for (const tracking of Array.isArray(trackings) ? trackings : []) {
        if (typeof tracking === 'string' && Object.hasOwn(stored, tracking) && isObject(stored[tracking])) result[tracking] = structuredClone(stored[tracking])
      }
      return result
    },

    /**
     * Stores fetched timelines for everyone, one per T&T, with only { tracking, carrier, fetchedAt, events }; an older
     * fetch never replaces a newer one. Above 4000 timelines the ones fetched longest ago are dropped.
     */
    async put(timelines = []) {
      const list = (Array.isArray(timelines) ? timelines : []).filter(entry => isObject(entry) && text(entry.tracking) && typeof entry.fetchedAt === 'string')
      if (!list.length) return
      await store.mutateAsync(STATUSES_KEY, current => {
        const next = { ...(isObject(current) ? current : {}) }
        for (const entry of list) {
          const tracking = text(entry.tracking)
          const before = next[tracking]
          if (isObject(before) && String(before.fetchedAt || '') > entry.fetchedAt) continue
          next[tracking] = storedTimeline(entry)
        }
        const keys = Object.keys(next)
        if (keys.length <= STATUSES_MAX) return next
        const kept = keys.sort((a, b) => String(next[b]?.fetchedAt || '').localeCompare(String(next[a]?.fetchedAt || ''))).slice(0, STATUSES_MAX)
        return Object.fromEntries(kept.map(tracking => [tracking, next[tracking]]))
      })
      // The next get reads the file again: a stat taken after the write could already be another PC's write.
      statusesCopy = null
    },
  }

  return { notSent, lock, dayLog, settings, drafts, nshift, statuses }
}

module.exports = { createFinlandShared, TEST_WORKBOOK_URL, draftsKeyOf, workbookOf }
