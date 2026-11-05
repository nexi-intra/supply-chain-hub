// "Tjek SAP-fejl": fetches MB52 + IQ09 (read-only), finds where SAP disagrees with itself, compares with SAP's own
// report ZMS_STOCK_SER_CHK2, remembers each check for follow-up and lets admins/managers open an Outlook draft to the
// SAP team. Shared by TCD and TRR (one shared store). Nothing is sent automatically and nothing is written to SAP.
const crypto = require('node:crypto')
const path = require('node:path')
const { findSapErrors, followUp, summarize, scopeSlocs, teamOfSloc, mergeWithReport, previousErrorsFor } = require('./core/sapCheck.cjs')
const { buildSapCheckMail, languageOf } = require('./core/sapCheckMail.cjs')

const INDEX_KEY = 'sap-tjek'
const SETTINGS_KEY = 'sap-tjek-indstillinger'
const KEEP = 50
const ID = /^[a-z0-9]{6,40}$/
const EMAIL = /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/
const ADDRESSES_MAX = 10

function codeError(code, message) {
  const error = new Error(message || code)
  error.code = code
  return error
}

const lower = value => String(value || '').trim().toLowerCase()
const defaultId = () => `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`

function parseAddresses(value) {
  const list = [...new Set(String(value || '').split(/[;,\s]+/).map(lower).filter(Boolean))]
  if (list.length > ADDRESSES_MAX || list.some(address => !EMAIL.test(address))) throw codeError('SAP_CHECK_SETTINGS_INVALID', 'Skriv gyldige mailadresser adskilt af semikolon (højst 10)')
  return list.join('; ')
}

/**
 * `sharedStore`: the store both teams use for SAP checks. `storeFor(team)` is only read for SAP-team settings saved
 * before the checks were shared.
 */
function createSapCheckService({ sharedStore, storeFor = null, fetcher, roles, reportWriter, drafter, emit = () => {}, now = Date.now, newId = defaultId, keep = KEEP }) {
  const checkKey = id => `sap-tjek-${id}`
  const me = user => ({ email: lower(user.email), name: user.fullName || user.email, team: user.team })
  const entryOf = check => ({ id: check.id, scope: check.scope, at: check.at, by: check.by, summary: check.summary, comparison: check.comparison, mail: check.mail })

  async function canMail(user) {
    const role = await roles.roleOf(user)
    return { role, canMail: role === 'admin' || role === 'manager' || role === 'status-manager' }
  }

  async function requireMailer(user) {
    const rights = await canMail(user)
    if (!rights.canMail) throw codeError('ADMIN_ONLY', 'Kun admins og managers kan gøre det')
    return rights
  }

  async function entries() {
    const all = (await sharedStore.getAsync(INDEX_KEY)) || {}
    return Object.values(all).filter(entry => entry && ID.test(entry.id)).sort((a, b) => b.at - a.at)
  }

  async function getCheck(id) {
    if (typeof id !== 'string' || !ID.test(id)) throw codeError('SAP_CHECK_NOT_FOUND', 'Tjekket findes ikke')
    const check = await sharedStore.getAsync(checkKey(id))
    if (!check) throw codeError('SAP_CHECK_NOT_FOUND', 'Tjekket findes ikke')
    return check
  }

  async function settingsOf(user) {
    let value = await sharedStore.getAsync(SETTINGS_KEY)
    if (!value && storeFor) value = await storeFor(user.team).getAsync(SETTINGS_KEY).catch(() => null)
    value = value || {}
    return { to: value.to || '', cc: value.cc || '', language: languageOf(value.language), updatedBy: value.updatedBy || null, updatedAt: value.updatedAt || null }
  }

  async function overview(user) {
    const [rights, list, settings] = await Promise.all([canMail(user), entries(), settingsOf(user)])
    const latest = list[0] ? await getCheck(list[0].id).catch(() => null) : null
    return { ...rights, team: user.team, settings, latest, history: list.slice(0, 20) }
  }

  /** The newest check covering the user's team, without its error list, for the reminder before a status is started. */
  async function latest(user) {
    return (await entries()).find(entry => entry.scope === 'D301' || entry.scope === user.team || !entry.scope) || null
  }

  /** The newest earlier checks until every storage location of this check is covered. */
  async function previousChecks(slocs) {
    const result = []
    const missing = new Set(slocs)
    for (const entry of await entries()) {
      if (!missing.size) break
      const check = await getCheck(entry.id).catch(() => null)
      if (!check) continue
      result.push(check)
      for (const sloc of check.slocs || []) missing.delete(sloc)
    }
    return result
  }

  async function run(user, { scope } = {}) {
    const chosen = scope || user.team
    const slocs = scopeSlocs(chosen)
    const fetched = await fetcher.fetchPlant({ onProgress: step => emit('sap:fetch-progress', { step }) })
    emit('sap:fetch-progress', { step: 'sap-report' })
    let reportRows = null
    let reportError = null
    try {
      reportRows = await fetcher.fetchStockCheck()
    } catch (error) {
      reportError = error.code === 'SAP_NO_ACCESS' ? 'Ingen adgang til ZMS_STOCK_SER_CHK2 i SAP' : `ZMS_STOCK_SER_CHK2 kunne ikke køres (${String(error.message || error.code).slice(0, 120)})`
    }
    emit('sap:fetch-progress', { step: 'done' })
    const descriptions = new Map()
    for (const row of [...fetched.mb52, ...fetched.serials]) if (row.description && !descriptions.has(String(row.material).toUpperCase())) descriptions.set(String(row.material).toUpperCase(), row.description)
    const merged = mergeWithReport(findSapErrors({ slocs, mb52: fetched.mb52, serials: fetched.serials }), reportRows, slocs, reportError)
    const errors = merged.errors.map(error => ({ ...error, description: error.description || descriptions.get(error.material) || '' }))
    const at = now()
    const previous = await previousChecks(slocs)
    const result = followUp(previousErrorsFor(previous, slocs), errors, at)
    const check = { id: newId(), scope: chosen, at, by: me(user), slocs, sapUser: fetched.sapUser || '', fetchedAt: fetched.fetchedAt || at, errors: result.errors, fixed: result.fixed, summary: summarize(result), comparison: merged.comparison, previousId: previous[0]?.id || null, mail: null }
    await sharedStore.setAsync(checkKey(check.id), check)
    await sharedStore.updateAsync(INDEX_KEY, { op: 'setField', field: check.id, value: entryOf(check) })
    for (const old of (await entries()).slice(keep)) {
      await sharedStore.updateAsync(INDEX_KEY, { op: 'deleteField', field: old.id })
      await sharedStore.deleteAsync(checkKey(old.id)).catch(() => {})
    }
    return check
  }

  async function setSettings(user, { to, cc, language } = {}) {
    await requireMailer(user)
    const value = { to: parseAddresses(to), cc: parseAddresses(cc), language: languageOf(language), updatedBy: me(user), updatedAt: now() }
    await sharedStore.setAsync(SETTINGS_KEY, value)
    return value
  }

  /**
   * `scope` 'D301' (all errors of the check), 'TCD' or 'TRR' (that team's storage locations).
   * `language` 'da' or 'en' (anything else = Danish); without it, the saved language is used.
   */
  async function createMail(user, { id, mode, language, scope } = {}) {
    await requireMailer(user)
    const check = await getCheck(id)
    const chosen = mode === 'new' ? 'new' : 'all'
    const mailScope = ['TCD', 'TRR'].includes(scope) ? scope : 'D301'
    const inScope = check.errors.filter(error => mailScope === 'D301' || teamOfSloc(error.sloc) === mailScope)
    const errors = chosen === 'new' ? inScope.filter(error => error.status === 'new') : inScope
    if (!errors.length) throw codeError('SAP_CHECK_NOTHING', chosen === 'new' ? 'Der er ingen nye fejl siden sidste tjek' : 'Der er ingen fejl at sende')
    const settings = await settingsOf(user)
    const lang = language === undefined || language === null ? settings.language : languageOf(language)
    const label = mailScope === 'D301' ? (check.scope === 'D301' ? 'TCD + TRR' : check.scope) : mailScope
    const mailCheck = { ...check, slocs: check.slocs.filter(sloc => mailScope === 'D301' || teamOfSloc(sloc) === mailScope), fixed: (check.fixed || []).filter(error => mailScope === 'D301' || teamOfSloc(error.sloc) === mailScope) }
    const file = await reportWriter.sapCheck(user.team, { team: label, check: mailCheck, errors, mode: chosen, language: lang })
    const { subject, html } = buildSapCheckMail({ team: label, check: mailCheck, errors, mode: chosen, language: lang })
    try {
      await drafter.draft({ to: settings.to, cc: settings.cc, subject, html, attachment: file })
    } catch (error) {
      const reason = error.code === 'OUTLOOK_UNAVAILABLE' ? 'Kræver klassisk Outlook' : 'Outlook svarede ikke'
      throw codeError('OUTLOOK_UNAVAILABLE', `Outlook kunne ikke åbne kladden (${reason}). Excel-filen er gemt i rapportmappen: ${path.basename(file)}`)
    }
    const mail = { by: me(user), at: now(), mode: chosen, scope: mailScope, language: lang, count: errors.length, file: path.basename(file) }
    const fresh = await getCheck(check.id)
    const mails = [...(fresh.mails || (fresh.mail ? [fresh.mail] : [])), mail]
    await sharedStore.setAsync(checkKey(check.id), { ...fresh, mail, mails })
    await sharedStore.updateAsync(INDEX_KEY, { op: 'setField', field: check.id, value: entryOf({ ...fresh, mail }) })
    return { file: mail.file, count: mail.count, to: settings.to }
  }

  return { overview, latest, run, setSettings, createMail }
}

module.exports = { createSapCheckService }
