// Finlandsforsendelser data shared by everyone who writes the sheet (BPO and TCD), in one folder on M:: parcels marked
// as not sent, the write lock on the sheet, a log of what was written per day, the sheet's address, and each person's
// drafts (follow-up changes not in the sheet yet). Every change goes through mutateAsync, so two PCs never overwrite
// each other.
const crypto = require('node:crypto')
const fs = require('node:fs')
const { parcelKey } = require('./core/sheetIndex.cjs')

const NOT_SENT_KEY = 'ikke-sendt'
const LOCK_KEY = 'skrivelaas'
const DAY_LOG_KEY = 'dagslog'
const SETTINGS_KEY = 'indstillinger'
const DRAFTS_PREFIX = 'kladder-'
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

function createFinlandShared({ store, now = Date.now }) {
  async function folderExists() {
    return fs.promises.access(store.dataDir).then(() => true, () => false)
  }

  /** A missing key is empty only while the folder is there; with M: down it must not read as "nothing marked". */
  async function read(key) {
    const value = await store.getAsync(key)
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
    async list() {
      const value = await read(NOT_SENT_KEY)
      return Object.values(isObject(value) ? value : {}).sort((a, b) => (a.at || 0) - (b.at || 0))
    },

    /** Marks a parcel as not sent. Marking it again keeps who marked it first. */
    async mark(user, entry = {}) {
      const delivery = text(entry.delivery)
      const tracking = text(entry.tracking)
      const key = parcelKey(delivery, tracking)
      if (!delivery || !tracking || key.startsWith('|') || key.endsWith('|')) throw codeError('FINLAND_ENTRY_INVALID', 'Forsendelsen mangler leverance eller T&T')
      const marked = {
        delivery, tracking,
        shippedOn: text(entry.shippedOn), orderType: text(entry.orderType), postalCode: text(entry.postalCode),
        by: lower(user.email), byName: nameOf(user), at: now(),
      }
      let stored = marked
      await store.mutateAsync(NOT_SENT_KEY, current => {
        const list = isObject(current) ? current : {}
        if (Object.hasOwn(list, key)) { stored = list[key]; return undefined }
        return { ...list, [key]: marked }
      })
      return stored
    },

    /** `key` = parcelKey(delivery, tracking). True when it was on the list. */
    async restore(key) {
      let found = false
      await store.mutateAsync(NOT_SENT_KEY, current => {
        if (!isObject(current) || !Object.hasOwn(current, key)) return undefined
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
     * Takes the write lock on the sheet, or throws FINLAND_LOCKED while someone else holds one that has not expired.
     * The same person may take her own lock again. The returned release frees the lock only while it is still this
     * acquisition's (a token per acquisition), so an expired lock taken by someone else, or taken again by the same
     * person, is never freed by an old release.
     */
    async acquire(user, { day, action, ttlMs = DEFAULT_LOCK_TTL_MS } = {}) {
      const email = lower(user.email)
      const token = crypto.randomUUID()
      const at = now()
      const value = { email, name: nameOf(user), day: text(day), action: text(action), at, expiresAt: at + Math.max(0, Number(ttlMs) || 0), token }
      await store.mutateAsync(LOCK_KEY, current => {
        if (isObject(current) && current.email !== email && current.expiresAt > now()) {
          throw codeError('FINLAND_LOCKED', `FINLAND_LOCKED: ${current.name || current.email} skriver ${dayMonth(current.day)} i arket lige nu`)
        }
        return value
      })
      return async function release() {
        await store.mutateAsync(LOCK_KEY, current => isObject(current) && current.email === email && current.at === at && current.token === token ? null : undefined)
      }
    },

    /** The lock while it holds, or null. */
    async current() {
      const value = await read(LOCK_KEY)
      if (!isObject(value) || !(value.expiresAt > now())) return null
      return { email: value.email, name: value.name, day: value.day, action: value.action, at: value.at, expiresAt: value.expiresAt }
    },
  }

  const dayLog = {
    /**
     * What was just written to the sheet for `day`: a summary per day (last writer, when, parcels written in all) and
     * each parcel key with its time, so a colleague's sheet read from before the write does not write it again.
     */
    async record(user, day, recorded = []) {
      const at = now()
      const list = (Array.isArray(recorded) ? recorded : []).map(String).filter(Boolean)
      await store.mutateAsync(DAY_LOG_KEY, current => {
        const days = { ...(isObject(current?.days) ? current.days : {}) }
        const keys = {}
        // Only keys within the recent window are kept, so the file stays small.
        for (const [key, time] of Object.entries(isObject(current?.keys) ? current.keys : {})) if (time >= at - RECENT_MS) keys[key] = time
        for (const key of list) keys[key] = at
        if (text(day)) days[day] = { byName: nameOf(user), at, count: (Number(days[day]?.count) || 0) + list.length }
        const kept = Object.keys(days).sort().slice(-DAY_LOG_MAX_DAYS)
        return { days: Object.fromEntries(kept.map(name => [name, days[name]])), keys }
      })
    },

    async recentKeys(withinMs = RECENT_MS) {
      const value = await read(DAY_LOG_KEY)
      const since = now() - withinMs
      return new Set(Object.entries(isObject(value?.keys) ? value.keys : {}).filter(([, time]) => time >= since).map(([key]) => key))
    },

    async days() {
      const value = await read(DAY_LOG_KEY)
      return isObject(value?.days) ? value.days : {}
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

  /** Everyone else's drafts: per person the count per pick-up day and the parcel keys. */
  drafts.others = async function others(email) {
    const own = draftsKeyOf(email)
    const result = []
    for (const key of (await keys()).filter(name => name.startsWith(DRAFTS_PREFIX) && name !== own)) {
      const value = await store.getAsync(key)
      const list = isObject(value?.drafts) ? value.drafts : {}
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

  /** Deletes someone's drafts in the app (never in the sheet). Only a manager or creator. */
  drafts.clear = async function clear(manager, email) {
    if (!isManager(manager)) throw codeError('MANAGER_ONLY', 'Kun managers kan slette andres ændringer')
    const target = lower(email)
    let cleared = 0
    await store.mutateAsync(draftsKeyOf(target), current => {
      cleared = Object.keys(isObject(current?.drafts) ? current.drafts : {}).length
      return cleared ? { ...current, drafts: {} } : undefined
    })
    return { email: target, cleared }
  }

  return { notSent, lock, dayLog, settings, drafts }
}

module.exports = { createFinlandShared, TEST_WORKBOOK_URL, draftsKeyOf }
