// "Tjek SAP-fejl": where MB52 (stock) and IQ09 (serial numbers) disagree, per material, storage location and
// stock type, for serial-managed INT/R materials in the team's storage locations. Read-only, pure functions.
const { materialKind } = require('./classify.cjs')
const { TEAMS } = require('../teams.cjs')

const PLANT = 'D301'
const STOCK_TYPES = ['unrestricted', 'blocked']
const SERIALS_MAX = 500
const ERROR_TYPES = Object.freeze({
  'count-mismatch': 'Antal passer ikke med serienumre',
  'duplicate-serial': 'Serienummer flere steder',
  'stock-without-serials': 'Lager uden serienumre',
  'serials-without-stock': 'Serienumre uden lager',
})
const TYPE_ORDER = Object.keys(ERROR_TYPES)

const upper = value => String(value || '').trim().toUpperCase()

function findSapErrors({ slocs, mb52, serials, plant = PLANT }) {
  const teamSlocs = new Set(slocs)
  const inPlant = row => !row.plant || upper(row.plant) === plant
  const tracked = material => materialKind(material) !== 'other'
  const serialManaged = new Set(serials.filter(row => inPlant(row) && tracked(upper(row.material))).map(row => upper(row.material)))
  const descriptions = new Map()
  const cells = new Map()
  const cellOf = (material, sloc, stockType) => {
    const key = `${material}|${sloc}|${stockType}`
    if (!cells.has(key)) cells.set(key, { material, sloc, stockType, sapQty: 0, serials: [] })
    return cells.get(key)
  }

  for (const row of mb52) {
    const material = upper(row.material)
    const sloc = upper(row.sloc)
    if (!inPlant(row) || !teamSlocs.has(sloc) || !serialManaged.has(material)) continue
    if (row.description && !descriptions.has(material)) descriptions.set(material, row.description)
    for (const stockType of STOCK_TYPES) if (row[stockType] > 0) cellOf(material, sloc, stockType).sapQty += row[stockType]
  }

  const places = new Map()
  for (const row of serials) {
    const material = upper(row.material)
    const sloc = upper(row.sloc)
    const serial = upper(row.serial)
    if (!serial || !inPlant(row) || !tracked(material)) continue
    const stockType = row.stockType === 'blocked' ? 'blocked' : 'unrestricted'
    if (row.description && !descriptions.has(material)) descriptions.set(material, row.description)
    const list = places.get(serial) || []
    if (!list.some(place => place.material === material && place.sloc === sloc && place.stockType === stockType)) list.push({ material, sloc, stockType })
    places.set(serial, list)
    if (teamSlocs.has(sloc)) cellOf(material, sloc, stockType).serials.push(serial)
  }

  const errors = []
  const add = (type, id, fields) => errors.push({ id: `${type}|${id}`, type, description: descriptions.get(fields.material) || '', serials: [], locations: [], ...fields })
  for (const cell of cells.values()) {
    const count = cell.serials.length
    const base = { material: cell.material, sloc: cell.sloc, stockType: cell.stockType, sapQty: cell.sapQty, serialCount: count }
    const id = `${cell.material}|${cell.sloc}|${cell.stockType}`
    if (cell.sapQty > 0 && count > 0 && cell.sapQty !== count) add('count-mismatch', id, base)
    else if (cell.sapQty > 0 && count === 0) add('stock-without-serials', id, base)
    else if (cell.sapQty <= 0 && count > 0) add('serials-without-stock', id, { ...base, serials: [...cell.serials].sort().slice(0, SERIALS_MAX) })
  }
  for (const [serial, list] of places) {
    const home = list.find(place => teamSlocs.has(place.sloc))
    if (list.length < 2 || !home) continue
    add('duplicate-serial', serial, { material: home.material, sloc: home.sloc, stockType: home.stockType, sapQty: null, serialCount: list.length, serials: [serial], locations: list })
  }

  return errors.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.material.localeCompare(b.material) || a.sloc.localeCompare(b.sloc) || a.stockType.localeCompare(b.stockType) || a.id.localeCompare(b.id))
}

/** Compares with the previous check: 'new' or 'open' (still not fixed, first seen kept), plus what was fixed since. */
function followUp(previousErrors, errors, at) {
  const before = new Map((previousErrors || []).map(error => [error.id, error]))
  const ids = new Set(errors.map(error => error.id))
  return {
    errors: errors.map(error => {
      const old = before.get(error.id)
      return { ...error, status: old ? 'open' : 'new', firstSeen: old?.firstSeen ?? at }
    }),
    fixed: (previousErrors || []).filter(error => !ids.has(error.id)).map(error => ({ id: error.id, type: error.type, material: error.material, description: error.description, sloc: error.sloc, stockType: error.stockType, firstSeen: error.firstSeen })),
  }
}

function summarize({ errors, fixed }) {
  const byType = Object.fromEntries(TYPE_ORDER.map(type => [type, 0]))
  for (const error of errors) byType[error.type] += 1
  return { total: errors.length, new: errors.filter(error => error.status === 'new').length, open: errors.filter(error => error.status === 'open').length, fixed: fixed.length, byType }
}

const SCOPES = Object.freeze({ TCD: TEAMS.TCD.storageLocations, TRR: TEAMS.TRR.storageLocations, D301: [...TEAMS.TCD.storageLocations, ...TEAMS.TRR.storageLocations] })

function scopeSlocs(scope) {
  if (!Object.hasOwn(SCOPES, scope)) throw Object.assign(new Error('Vælg TCD, TRR eller hele D301'), { code: 'SAP_CHECK_SCOPE_INVALID' })
  return [...SCOPES[scope]]
}

const teamOfSloc = sloc => Object.values(TEAMS).find(team => team.storageLocations.includes(sloc))?.id || null
const cellKey = error => `${error.material}|${error.sloc}|${error.stockType}`

/** SAP's own comparison (ZMS_STOCK_SER_CHK2) as errors of the same kinds, in the chosen storage locations. */
function reportErrors(rows, slocs) {
  const inScope = new Set(slocs)
  const errors = []
  for (const row of rows) {
    if (!inScope.has(row.sloc)) continue
    for (const [stockType, sapQty, serialCount] of [['unrestricted', row.unrestricted, row.serialsUnrestricted], ['blocked', row.blocked, row.serialsBlocked]]) {
      if (sapQty === serialCount) continue
      const type = sapQty > 0 && serialCount > 0 ? 'count-mismatch' : sapQty > 0 ? 'stock-without-serials' : 'serials-without-stock'
      errors.push({ id: `${type}|${row.material}|${row.sloc}|${stockType}`, type, material: row.material, description: '', sloc: row.sloc, stockType, sapQty, serialCount, serials: [], locations: [] })
    }
  }
  return errors
}

/**
 * Merges CountPoint's errors with SAP's own report: each error says who found it ('both', 'countpoint', 'sap-report').
 * Errors only in the SAP report are kept. `reportRows` null = the report could not run.
 */
function mergeWithReport(ours, reportRows, slocs, reportError = null) {
  if (!reportRows) return { errors: ours.map(error => ({ ...error, source: 'countpoint' })), comparison: { ran: false, error: reportError, rows: 0, both: 0, onlyCountPoint: 0, onlyReport: 0 } }
  const fromReport = reportErrors(reportRows, slocs)
  const reportByCell = new Map(fromReport.map(error => [cellKey(error), error]))
  const matched = new Set()
  const errors = ours.map(error => {
    const report = error.type === 'duplicate-serial' ? null : reportByCell.get(cellKey(error))
    if (!report) return { ...error, source: 'countpoint' }
    matched.add(cellKey(error))
    return { ...error, source: 'both', ...(report.sapQty !== error.sapQty || report.serialCount !== error.serialCount ? { report: { sapQty: report.sapQty, serialCount: report.serialCount } } : {}) }
  })
  const onlyReport = fromReport.filter(error => !matched.has(cellKey(error))).map(error => ({ ...error, source: 'sap-report' }))
  const comparable = ours.filter(error => error.type !== 'duplicate-serial')
  return {
    errors: [...errors, ...onlyReport].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.material.localeCompare(b.material) || a.sloc.localeCompare(b.sloc) || a.stockType.localeCompare(b.stockType) || a.id.localeCompare(b.id)),
    comparison: { ran: true, error: null, rows: reportRows.length, both: matched.size, onlyCountPoint: comparable.length - matched.size, onlyReport: onlyReport.length },
  }
}

/** For follow-up: per storage location the errors of the newest earlier check that covered it (checks newest first). */
function previousErrorsFor(checks, slocs) {
  const result = []
  for (const sloc of slocs) {
    const check = checks.find(item => (item.slocs || []).includes(sloc))
    if (check) result.push(...check.errors.filter(error => error.sloc === sloc))
  }
  return result
}

module.exports = { ERROR_TYPES, findSapErrors, followUp, summarize, scopeSlocs, teamOfSloc, reportErrors, mergeWithReport, previousErrorsFor }
