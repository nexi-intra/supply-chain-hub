// Finlandsforsendelser's `warehouse:finland:*` channels for BPO and TCD (handleTool(['finland'])). The window's input is
// checked here as in Finland T&T's app/main.cjs before the service sees it. One service per Hub process; the data
// everyone shares lives in "<platform root>\_lagerstyring\finlandsforsendelser".
const os = require('node:os')
const path = require('node:path')
const { createFinlandShared } = require('./shared.cjs')
const { createFinlandExcel } = require('./excel.cjs')
const { createFinlandService } = require('./service.cjs')
const { fetchParcels } = require('./sap.cjs')
const { FIELDS } = require('./core/followUpSync.cjs')
const { createTrackingWindows } = require('./tracking.cjs')
const { createNshiftClient } = require('./nshift.cjs')

const SALES_ORG = 'F300'
const TRACKING_URLS = Object.freeze({
  Postnord: 'https://www.postnord.dk/varktojer/track-trace?shipmentId={id}',
  DHL: 'https://www.dhl.com/dk-en/home/tracking.html?tracking-id={id}&submit=1',
  // DSV's page cannot take the number in the address: it is copied for Ctrl+V instead.
  DSV: 'https://mydsv.dsv.com/app/tracking-public/',
})
const KEY = /^\d{1,20}\|[A-Z0-9]{5,40}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TEXT_MAX = 300
const MANUAL_FIELD_MAX = 60
const MANUAL_FIELDS = ['delivery', 'orderType', 'postalCode', 'courier', 'tracking', 'pickedUp']
const CREDENTIAL_MAX = 200

function codeError(code, text) {
  return Object.assign(new Error(text ? `${code}: ${text}` : code), { code })
}

const invalid = text => codeError('FINLAND_INVALID_INPUT', text)
const isManager = user => user.role === 'manager' || user.role === 'creator'
// Channels that change the sheet or the shared data; refused while M: is away, as the other warehouse writes.
const WRITES = new Set([
  'write-day', 'fix-review', 'save-draft', 'save-followup', 'resolve-conflict', 'add-manual-row', 'mark-not-sent',
  'restore-not-sent', 'delete-not-sent-row', 'set-settings', 'clear-drafts', 'fetch-status', 'apply-suggestions',
  'set-nshift-settings',
])

/** A real calendar date as yyyy-mm-dd (2026-13-01 and 2026-02-30 are not). */
function isDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function checkKey(key) {
  if (typeof key !== 'string' || !KEY.test(key)) throw invalid('Ugyldigt kolli.')
  return key
}

function checkDate(date) {
  if (!isDate(date)) throw invalid('Ugyldig dato.')
  return date
}

function checkWanted(wanted) {
  if (!wanted || typeof wanted !== 'object') throw invalid('Ugyldige felter.')
  const out = {}
  for (const f of FIELDS) {
    if (wanted[f] === undefined) continue
    const v = String(wanted[f])
    if ((f === 'expected' || f === 'received') && v && !isDate(v)) throw invalid('Ugyldig dato.')
    if (f === 'sla' && !['', 'OK', 'NOK'].includes(v)) throw invalid('Ugyldig SLA.')
    if (v.length > TEXT_MAX) throw invalid('Teksten er for lang.')
    out[f] = v
  }
  return out
}

// The sheet values a form was opened with; any text (e.g. "Retur" in a date column), used only to spot conflicts.
function checkBase(base) {
  if (!base || typeof base !== 'object') return {}
  const out = {}
  for (const f of FIELDS) {
    if (base[f] === undefined) continue
    const v = String(base[f])
    if (v.length > TEXT_MAX) throw invalid('Teksten er for lang.')
    out[f] = v
  }
  return out
}

function checkManualInput(input) {
  const out = {}
  for (const f of MANUAL_FIELDS) {
    const v = String(input[f] ?? '')
    if (v.length > MANUAL_FIELD_MAX) throw invalid('Et felt er for langt.')
    out[f] = v
  }
  return out
}

/** One parcel (`{ key }`) or one day (`{ date }`) to look up in nShift; exactly one of them. */
function checkStatusTarget(p) {
  const hasDate = p.date !== undefined
  const hasKey = p.key !== undefined
  if (hasDate === hasKey) throw invalid('Vælg en dag eller et kolli.')
  return hasDate ? { date: checkDate(p.date) } : { key: checkKey(p.key) }
}

/**
 * The fields the person touched in the open parcel, which "Brug forslagene" leaves alone: `{ [key]: field names }`, at
 * most one parcel. Missing is nothing kept.
 */
function checkKeep(keep) {
  if (keep === undefined) return {}
  if (!keep || typeof keep !== 'object' || Array.isArray(keep)) throw invalid('Ugyldige felter.')
  const keys = Object.keys(keep)
  if (keys.length > 1) throw invalid('Ugyldige felter.')
  const out = {}
  for (const key of keys) {
    const fields = keep[key]
    if (!Array.isArray(fields) || !fields.every(f => FIELDS.includes(f))) throw invalid('Ugyldige felter.')
    out[checkKey(key)] = [...new Set(fields)]
  }
  return out
}

/** The nShift client id and secret as typed: text of 1 to 200 characters after trimming. Never echoed in the error. */
function checkCredentials(p) {
  const out = {}
  for (const f of ['clientId', 'clientSecret']) {
    const v = typeof p[f] === 'string' ? p[f].trim() : ''
    if (!v || v.length > CREDENTIAL_MAX) throw invalid('Klient-id og hemmelighed skal udfyldes med højst 200 tegn.')
    out[f] = v
  }
  return out
}

/** As the app: a review fix takes any T&T of letters and digits, a not-sent mark only a real one (5 to 40). */
function checkParcel(delivery, tracking, minTracking = 5) {
  const pattern = new RegExp(`^[A-Z0-9]{${minTracking},40}$`)
  if (!/^\d{1,20}$/.test(String(delivery ?? '')) || !pattern.test(String(tracking ?? ''))) throw invalid('Ugyldigt kolli.')
  return [String(delivery), String(tracking)]
}

/** The courier's tracking page for `tracking`, from `urls` (courier → https address with {id}). Only https. */
function trackingUrl(urls, courier, tracking) {
  const template = typeof courier === 'string' && Object.hasOwn(urls, courier) ? urls[courier] : null
  if (typeof template !== 'string' || !/^[A-Z0-9]{5,40}$/i.test(String(tracking ?? ''))) throw invalid('Trackingsiden kan ikke åbnes for dette kolli.')
  let url
  try {
    url = new URL(template.replace('{id}', encodeURIComponent(tracking)))
  } catch {
    throw invalid('Trackingadressen er ugyldig.')
  }
  if (url.protocol !== 'https:') throw invalid('Trackingadressen skal starte med https.')
  return url.toString()
}

/** The dialog shown when the Hub closes while the person has follow-up changes not in the sheet (as Finland T&T). */
function closeWarning(count) {
  return {
    type: 'warning',
    buttons: ['Luk alligevel', 'Bliv i programmet'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'Finlandsforsendelser',
    message: `${count} kolli har ændringer, der ikke er gemt i arket.`,
    detail: 'Ændringerne er gemt i appen og er der igen, når du åbner programmet. Tryk på markeringen øverst og "Ja, gem alle i arket" for at sende dem til arket.',
  }
}

/**
 * Registers the channels through register.cjs' `handleTool`. `storageConnected()` is false while M: is away; the writes
 * are refused then (STORAGE_UNAVAILABLE). `deps` (tests only) may replace `excel`, `fetchParcels`, `now`,
 * `trackingWindows` and `nshift`. Returns `pending(user)` for the close warning and `closeWindows()` for the tracking windows.
 */
function registerFinland({ handleTool, sap, runScript, opener, platformRoot, roles, copyForPerson, unpacked, scriptsDir, sapSystem, userDataDir, storageConnected = () => true, deps = {} }) {
  const now = deps.now || Date.now
  const store = opener.lazy(() => path.join(platformRoot(), '_lagerstyring', 'finlandsforsendelser'))
  const shared = createFinlandShared({ store, now, workbookOverride: process.env.TCD_HUB_FINLAND_WORKBOOK })
  const excel = deps.excel || createFinlandExcel({
    scriptsDir: unpacked(path.join(scriptsDir, 'finland', 'excel')),
    tmpDir: path.join(os.tmpdir(), 'finlandsforsendelser'),
    workbook: () => shared.settings.get(),
  })
  const fromSap = deps.fetchParcels || (async range => {
    const status = await sap.status({ fresh: true })
    if (!status.ready) throw codeError('FINLAND_SAP_NOT_READY', 'SAP er ikke klar. Log på PS4 på engelsk, og prøv igen.')
    return fetchParcels({ bridge: sap, runScript, system: sapSystem, salesOrg: SALES_ORG, range })
  })
  // One nShift client per Hub process, so its calls go one at a time; the key is read from the shared data on each call.
  const nshift = deps.nshift || createNshiftClient({ credentials: () => shared.nshift.credentials() })
  const service = createFinlandService({ shared, excel, fetchParcels: fromSap, isAdmin: user => roles.isFinlandAdmin(user), nshift, now })
  let tracking = deps.trackingWindows || null
  const trackingWindows = () => {
    if (!tracking) {
      tracking = createTrackingWindows({
        boundsFile: path.join(userDataDir, 'finland-tracking-windows.json'),
        log: message => { if (process.env.TCD_HUB_DEBUG) console.log(`Finlandsforsendelser sporing: ${message}`) },
      })
    }
    return tracking
  }

  const handle = (name, fn) => handleTool(['finland'], `finland:${name}`, !WRITES.has(name) ? fn : (user, p, event) => {
    if (!storageConnected()) throw codeError('STORAGE_UNAVAILABLE')
    return fn(user, p, event)
  })
  handle('load', user => service.load(user))
  // Reads only the sheet, so Opfølgning works while SAP is not ready.
  handle('load-sheet', user => service.loadSheet(user))
  // The person's own changes not in the sheet yet, from the shared drafts store only (never Excel), so the window's
  // "N kolli er ikke gemt i arket" shows before the sheet is read.
  handle('pending', user => service.pending(user))
  // What this Hub fetched earlier (null when nothing yet), so the tool picks up where it was; never SAP or Excel.
  handle('current', user => service.current(user))
  handle('write-day', (user, p) => service.writeDay(user, checkDate(p.date)))
  handle('fix-review', (user, p) => service.fixReview(user, ...checkParcel(p.delivery, p.tracking, 1)))
  handle('save-draft', (user, p) => service.saveDraft(user, checkKey(p.key), checkWanted(p.wanted), p.slaManual === true, checkBase(p.base)))
  // `date: null` saves every day; a missing date is refused, so "all" is never the result of a mistake.
  handle('save-followup', (user, p) => service.saveFollowUp(user, p.date === null ? null : checkDate(p.date)))
  handle('resolve-conflict', (user, p) => {
    if (!FIELDS.includes(p.field) || !['sheet', 'mine'].includes(p.choice)) throw invalid('Ugyldigt valg.')
    return service.resolveConflict(user, checkKey(p.key), p.field, p.choice)
  })
  handle('check-manual', (user, p) => service.checkManual(user, checkManualInput(p)))
  handle('add-manual-row', (user, p) => service.addManualRow(user, checkManualInput(p)))
  handle('mark-not-sent', (user, p) => service.markNotSent(user, ...checkParcel(p.delivery, p.tracking)))
  handle('restore-not-sent', (user, p) => service.restoreNotSent(user, checkKey(p.key)))
  handle('delete-not-sent-row', (user, p) => {
    if (!Number.isInteger(p.row) || p.row < 2) throw invalid('Ugyldig række.')
    return service.deleteNotSentRow(user, checkKey(p.key), p.row)
  })
  handle('open-tracking', async (user, p) => {
    const url = trackingUrl(TRACKING_URLS, p.courier, p.tracking)
    const id = String(p.tracking)
    trackingWindows().open(p.courier, id, url)
    if (TRACKING_URLS[p.courier].includes('{id}')) return { copied: false }
    // DSV: the number goes on the clipboard for Ctrl+V; the page is open either way.
    const copied = await copyForPerson(id).then(() => true, () => false)
    return { copied }
  })
  handle('settings', () => shared.settings.get())
  handle('set-settings', (user, p) => shared.settings.set(user, {
    workbookUrl: typeof p.workbookUrl === 'string' ? p.workbookUrl : '',
    sheetName: typeof p.sheetName === 'string' ? p.sheetName : '',
    tableName: typeof p.tableName === 'string' ? p.tableName : '',
  }))
  // Everyone's changes not in the sheet yet (the manager's own included, of every sheet), how much of it and how many
  // not-sent marks belong to the sheet written now (they stay behind when a manager switches sheet), and who deleted
  // whose changes.
  handle('drafts-overview', async user => {
    if (!isManager(user)) throw codeError('MANAGER_ONLY')
    const { workbookUrl } = await shared.settings.get()
    const [people, current, notSent, cleared] = await Promise.all([
      shared.drafts.others(''), shared.drafts.others('', workbookUrl), shared.notSent.list(workbookUrl), shared.drafts.clearedLog(),
    ])
    return {
      people: people.map(person => ({ email: person.email, name: person.name, count: person.keys.length, byDay: person.byDay, updatedAt: person.updatedAt })),
      currentSheet: { workbookUrl, drafts: current.reduce((sum, person) => sum + person.keys.length, 0), notSent: notSent.length },
      cleared: cleared.map(entry => ({ by: entry.by, byName: entry.byName, email: entry.email, name: entry.name, count: entry.count, at: entry.at })),
    }
  })
  handle('clear-drafts', (user, p) => {
    if (typeof p.email !== 'string' || !p.email.trim() || p.email.length > 200) throw invalid('Ugyldig e-mail.')
    return shared.drafts.clear(user, p.email)
  })
  // Status from nShift: every Finland user fetches it and turns the suggestions into their own drafts; nothing goes in
  // the sheet before "Gem i arket".
  handle('fetch-status', (user, p) => service.fetchStatus(user, checkStatusTarget(p)))
  handle('apply-suggestions', (user, p) => service.applySuggestions(user, { date: checkDate(p.date), keep: checkKeep(p.keep) }))
  // The key: only a manager or the creator sees whether it is set (never the secret), sets it and tests it.
  handle('nshift-settings', user => {
    if (!isManager(user)) throw codeError('MANAGER_ONLY')
    return service.nshiftStatus()
  })
  handle('set-nshift-settings', (user, p) => {
    if (!isManager(user)) throw codeError('MANAGER_ONLY')
    return service.setNshift(user, checkCredentials(p))
  })
  handle('test-nshift', user => {
    if (!isManager(user)) throw codeError('MANAGER_ONLY')
    return service.testNshift(user)
  })

  return {
    pending: user => service.pending(user),
    closeWindows: () => { if (tracking) tracking.closeAll() },
  }
}

module.exports = { registerFinland, trackingUrl, closeWarning, TRACKING_URLS }
