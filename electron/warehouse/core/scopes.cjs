// Which material, storage location, stock type and group a count covers, and whether two counts of a status overlap.
const { materialKind } = require('./classify.cjs')

const STOCK_TYPES = ['unrestricted', 'blocked']
const STOCK_TYPE_TEXT = { unrestricted: 'unblocked', blocked: 'blocked' }
const ALL_KINDS = ['new', 'used', 'accessory']
const TERMINAL_KINDS = ['new', 'used']
const ACCESSORY_KINDS = ['accessory']

/** Scopes stored before stock types existed count both. */
function scopeStockTypes(scope) {
  return Array.isArray(scope?.stockTypes) && scope.stockTypes.length ? scope.stockTypes : [...STOCK_TYPES]
}

/** Scopes stored before groups existed count terminals and accessories. */
function scopeKinds(scope) {
  return Array.isArray(scope?.kinds) && scope.kinds.length ? scope.kinds : [...ALL_KINDS]
}

function scopeCovers(scope, material, sloc, stockType) {
  return scopeStockTypes(scope).includes(stockType) && scope.slocs.includes(sloc) && scopeKinds(scope).includes(materialKind(material)) && (scope.type !== 'materials' || scope.materials.includes(material))
}

function scopeOverlap(a, b) {
  const stockTypes = scopeStockTypes(a).filter(type => scopeStockTypes(b).includes(type))
  const slocs = a.slocs.filter(sloc => b.slocs.includes(sloc))
  const kinds = scopeKinds(a).filter(kind => scopeKinds(b).includes(kind))
  if (!stockTypes.length || !slocs.length || !kinds.length) return null
  let materials = null
  if (a.type === 'materials' && b.type === 'materials') materials = a.materials.filter(material => b.materials.includes(material))
  else if (a.type === 'materials') materials = [...a.materials]
  else if (b.type === 'materials') materials = [...b.materials]
  if (materials) materials = materials.filter(material => kinds.includes(materialKind(material)))
  if (materials && !materials.length) return null
  return { slocs, stockTypes: STOCK_TYPES.filter(type => stockTypes.includes(type)), materials, kinds: ALL_KINDS.filter(kind => kinds.includes(kind)) }
}

const stockTypesText = types => types.map(type => STOCK_TYPE_TEXT[type]).join(' og ')
const sameKinds = (kinds, wanted) => kinds.length === wanted.length && wanted.every(kind => kinds.includes(kind))

function kindsText(kinds) {
  if (!kinds || sameKinds(kinds, ALL_KINDS)) return ''
  if (sameKinds(kinds, TERMINAL_KINDS)) return 'terminaler, '
  if (sameKinds(kinds, ACCESSORY_KINDS)) return 'tilbehør, '
  return `${kinds.map(kind => ({ new: 'nye terminaler', used: 'brugte terminaler', accessory: 'tilbehør' })[kind]).join(' og ')}, `
}

function describeOverlap(overlap, count) {
  const shown = overlap.materials ? `${overlap.materials.slice(0, 3).join(', ')}${overlap.materials.length > 3 ? ` +${overlap.materials.length - 3}` : ''} i ` : ''
  return `${shown}${overlap.slocs.join(', ')} (${kindsText(overlap.kinds)}${stockTypesText(overlap.stockTypes)}) tælles allerede i "${count.name}" af ${count.owner?.name || 'en kollega'}`
}

module.exports = { STOCK_TYPES, ALL_KINDS, TERMINAL_KINDS, ACCESSORY_KINDS, scopeStockTypes, scopeKinds, scopeCovers, scopeOverlap, describeOverlap }
