// The SAP snapshot a count is measured against. Built once per fetch from MB52 + IQ09 for the whole plant,
// so a scanned serial that SAP has somewhere else can still be explained.
const { TEAMS } = require('../teams.cjs')
const { KINDS, materialKind, isMisplaced, suggestLocations } = require('./classify.cjs')
const { STOCK_TYPES, ALL_KINDS, scopeStockTypes, scopeKinds } = require('./scopes.cjs')

const SNAPSHOT_VERSION = 1
const PLANT = 'D301'
const MATERIAL_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,39}$/

function scopeError(message) {
  const error = new Error(message)
  error.code = 'SCOPE_INVALID'
  return error
}

function normalizeMaterial(value) {
  const material = String(value ?? '').trim().toUpperCase()
  if (!MATERIAL_PATTERN.test(material)) throw scopeError(`Ugyldigt materialenummer: ${String(value).slice(0, 40)}`)
  return material
}

function normalizeStockTypes(value) {
  if (value === undefined || value === null) return [...STOCK_TYPES]
  const types = Array.isArray(value) ? value : []
  if (!types.length || types.some(type => !STOCK_TYPES.includes(type))) throw scopeError('Vælg unblocked eller blocked')
  return STOCK_TYPES.filter(type => types.includes(type))
}

function normalizeKinds(value) {
  if (value === undefined || value === null) return [...ALL_KINDS]
  const kinds = Array.isArray(value) ? value : []
  if (!kinds.length || kinds.some(kind => !ALL_KINDS.includes(kind))) throw scopeError('Vælg terminaler eller tilbehør')
  return ALL_KINDS.filter(kind => kinds.includes(kind))
}

function normalizeScope(team, scope) {
  const teamSlocs = TEAMS[team]?.storageLocations
  if (!teamSlocs) throw scopeError('Ukendt team')
  const stockTypes = normalizeStockTypes(scope?.stockTypes)
  const kinds = normalizeKinds(scope?.kinds)
  if (scope?.type === 'slocs') {
    const slocs = [...new Set((scope.slocs || []).map(value => String(value).trim().toUpperCase()))]
    if (!slocs.length || slocs.some(sloc => !teamSlocs.includes(sloc))) throw scopeError('Vælg en eller flere af teamets storage locations')
    return { type: 'slocs', slocs: teamSlocs.filter(sloc => slocs.includes(sloc)), materials: [], stockTypes, kinds }
  }
  if (scope?.type === 'materials') {
    const materials = [...new Set((scope.materials || []).map(normalizeMaterial))]
    if (!materials.length) throw scopeError('Skriv mindst ét materialenummer')
    return { type: 'materials', slocs: [...teamSlocs], materials, stockTypes, kinds }
  }
  throw scopeError('Vælg storage locations eller materialenumre')
}

const roundMoney = value => Math.round(value * 100) / 100

function buildSnapshot({ team, scope, mb52, serials, rulesByTeam, exclusions = [], fetchedAt, fetchedBy }) {
  const normalizedScope = normalizeScope(team, scope)
  const excludedManual = []
  for (const entry of exclusions) {
    const material = normalizeMaterial(entry?.material)
    if (excludedManual.some(item => item.material === material)) continue
    excludedManual.push({ material, reason: String(entry?.reason || '').trim().slice(0, 200) })
  }
  const excludedSet = new Set(excludedManual.map(item => item.material))
  const scopeSlocs = new Set(normalizedScope.slocs)
  const scopeMaterials = normalizedScope.type === 'materials' ? new Set(normalizedScope.materials) : null
  const kindSet = new Set(normalizedScope.kinds)
  const inScope = (material, sloc) => scopeSlocs.has(sloc) && (!scopeMaterials || scopeMaterials.has(material)) && !excludedSet.has(material) && kindSet.has(materialKind(material))
  const types = new Set(normalizedScope.stockTypes)

  const materials = []
  const materialIndex = new Map()
  const totals = new Map()
  const indexOf = (material, description) => {
    if (!materialIndex.has(material)) {
      materialIndex.set(material, materials.length)
      materials.push({ material, description: description || '', kind: materialKind(material), serialManaged: false, unitPrice: null })
    }
    const entry = materials[materialIndex.get(material)]
    if (!entry.description && description) entry.description = description
    return materialIndex.get(material)
  }

  const stock = []
  const other = { materials: new Set(), quantity: 0 }
  for (const row of mb52) {
    const quantity = (row.unrestricted || 0) + (row.blocked || 0)
    if (!quantity) continue
    const material = String(row.material).toUpperCase()
    const kind = materialKind(material)
    if (kind === 'other') {
      const counts = scopeMaterials ? scopeMaterials.has(material) && scopeSlocs.has(row.sloc) : scopeSlocs.has(row.sloc)
      if (counts) { other.materials.add(material); other.quantity += quantity }
      continue
    }
    const m = indexOf(material, row.description)
    const sum = totals.get(m) || { quantity: 0, value: 0 }
    sum.quantity += quantity
    sum.value += (row.valueUnrestricted || 0) + (row.valueBlocked || 0)
    totals.set(m, sum)
    const lineInScope = inScope(material, row.sloc) && ((types.has('unrestricted') && row.unrestricted > 0) || (types.has('blocked') && row.blocked > 0))
    const misplaced = lineInScope && isMisplaced(kind, row.sloc, rulesByTeam?.[team])
    stock.push({
      m, sloc: row.sloc,
      unrestricted: row.unrestricted || 0, blocked: row.blocked || 0,
      valueUnrestricted: row.valueUnrestricted || 0, valueBlocked: row.valueBlocked || 0,
      inScope: lineInScope, misplaced,
      suggestions: misplaced ? suggestLocations(kind, team, rulesByTeam || {}) : [],
    })
  }
  for (const [m, sum] of totals) {
    materials[m].unitPrice = sum.quantity > 0 ? Math.round(sum.value * 10000 / sum.quantity) / 10000 : null
  }

  const serialRows = []
  for (const row of serials) {
    const material = String(row.material).toUpperCase()
    if (materialKind(material) === 'other') continue
    const m = indexOf(material, row.description)
    materials[m].serialManaged = true
    serialRows.push([String(row.serial).toUpperCase(), m, row.sloc, row.stockType === 'blocked' ? 'b' : 'u'])
  }

  return {
    v: SNAPSHOT_VERSION,
    plant: PLANT,
    team,
    fetchedAt,
    fetchedBy,
    scope: normalizedScope,
    materials,
    stock,
    serials: serialRows,
    excluded: { other: { materials: other.materials.size, quantity: other.quantity }, manual: excludedManual },
  }
}

/** Fast lookups for matching scans against a stored snapshot. */
function indexSnapshot(snapshot) {
  const scopeSlocs = new Set(snapshot.scope.slocs)
  const scopeMaterials = snapshot.scope.type === 'materials' ? new Set(snapshot.scope.materials) : null
  const excluded = new Set(snapshot.excluded.manual.map(item => item.material))
  const types = new Set(scopeStockTypes(snapshot.scope))
  const kinds = new Set(scopeKinds(snapshot.scope))
  const inScope = (material, sloc, stockType) => scopeSlocs.has(sloc) && (!scopeMaterials || scopeMaterials.has(material)) && !excluded.has(material) && (!stockType || types.has(stockType)) && kinds.has(materialKind(material))
  const materials = new Map(snapshot.materials.map((entry, index) => [entry.material, { ...entry, index }]))
  const serials = new Map()
  for (const [serial, m, sloc, type] of snapshot.serials) {
    const material = snapshot.materials[m].material
    const stockType = type === 'b' ? 'blocked' : 'unrestricted'
    serials.set(serial, { material, sloc, stockType, inScope: inScope(material, sloc, stockType) })
  }
  const lines = new Map()
  for (const line of snapshot.stock) lines.set(`${snapshot.materials[line.m].material}|${line.sloc}`, line)
  return { materials, serials, lines, scopeSlocs, stockTypes: types, inScope, others: [] }
}

function emptyGroup() {
  return { materials: 0, lines: 0, unrestricted: 0, blocked: 0, serials: 0, value: 0 }
}

function summarizeSnapshot(snapshot) {
  const groups = Object.fromEntries(KINDS.map(kind => [kind, emptyGroup()]))
  const materialsPerGroup = Object.fromEntries(KINDS.map(kind => [kind, new Set()]))
  const misplaced = []
  const types = new Set(scopeStockTypes(snapshot.scope))
  for (const line of snapshot.stock) {
    if (!line.inScope) continue
    const entry = snapshot.materials[line.m]
    const group = groups[entry.kind]
    const unrestricted = types.has('unrestricted') ? line.unrestricted : 0
    const blocked = types.has('blocked') ? line.blocked : 0
    materialsPerGroup[entry.kind].add(entry.material)
    group.lines += 1
    group.unrestricted += unrestricted
    group.blocked += blocked
    group.value = roundMoney(group.value + (unrestricted ? line.valueUnrestricted : 0) + (blocked ? line.valueBlocked : 0))
    if (line.misplaced) {
      misplaced.push({ material: entry.material, description: entry.description, kind: entry.kind, sloc: line.sloc, unrestricted, blocked, suggestions: line.suggestions })
    }
  }
  const index = indexSnapshot(snapshot)
  for (const info of index.serials.values()) {
    if (info.inScope) groups[index.materials.get(info.material).kind].serials += 1
  }
  for (const kind of KINDS) groups[kind].materials = materialsPerGroup[kind].size
  return { slocs: [...snapshot.scope.slocs], groups, misplaced, excluded: snapshot.excluded }
}

module.exports = { SNAPSHOT_VERSION, PLANT, MATERIAL_PATTERN, normalizeMaterial, normalizeScope, buildSnapshot, indexSnapshot, summarizeSnapshot }
