// The state of a count, computed from the SAP snapshot and every participant's journal events.
// Pure functions: the same events always give the same result, on every client.
const crypto = require('node:crypto')
const { KINDS, materialKind } = require('./classify.cjs')
const { scopeCovers, scopeStockTypes } = require('./scopes.cjs')

const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/
const STOCK_TYPES = ['unrestricted', 'blocked']
const KIND_ORDER = [...KINDS, 'other']
const round2 = value => Math.round(value * 100) / 100 || 0

function normalizeSerial(value) {
  const serial = String(value ?? '').replace(/\s+/g, '').toUpperCase()
  return SERIAL_PATTERN.test(serial) ? serial : ''
}

/** What a scanned serial means for this count. `found` maps serial -> the first active scan of it. */
function matchSerial(rawSerial, index, found) {
  const serial = normalizeSerial(rawSerial)
  if (!serial) return { outcome: 'invalid', serial: '', blocked: false, move: false, suggestions: [] }
  const info = index.serials.get(serial)
  const material = info ? index.materials.get(info.material) : null
  const base = {
    serial,
    material: info?.material || null,
    description: material?.description || '',
    kind: material?.kind || null,
    sloc: info?.sloc || null,
    stockType: info?.stockType || null,
    blocked: info?.stockType === 'blocked',
    move: false,
    suggestions: [],
  }
  if (found.has(serial)) return { ...base, outcome: 'duplicate', previous: found.get(serial) }
  if (!info) return { ...base, outcome: 'unknown', blocked: false }
  if (info.inScope) {
    const line = index.lines.get(`${info.material}|${info.sloc}`)
    return { ...base, outcome: 'found', move: Boolean(line?.misplaced), suggestions: line?.misplaced ? line.suggestions : [] }
  }
  if (index.scopeSlocs.has(info.sloc)) {
    const other = (index.others || []).find(entry => scopeCovers(entry.scope, info.material, info.sloc, info.stockType))
    return other ? { ...base, outcome: 'other-count', otherCount: other.name } : { ...base, outcome: 'outside' }
  }
  return { ...base, outcome: 'other-sloc', move: true }
}

function activeEvents(events) {
  const sorted = [...events].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const undone = new Set(sorted.filter(event => event.type === 'undo' && typeof event.target === 'string').map(event => event.target))
  return sorted.filter(event => event.type !== 'undo' && !undone.has(event.id))
}

function aggregateCount({ snapshot, index, events }) {
  const rows = new Map()
  const rowFor = (material, sloc, stockType) => {
    const key = `${material}|${sloc}|${stockType}`
    if (!rows.has(key)) {
      const entry = index.materials.get(material)
      const line = index.lines.get(`${material}|${sloc}`)
      rows.set(key, {
        material, description: entry?.description || '', kind: entry?.kind || materialKind(material), sloc, stockType,
        serialManaged: Boolean(entry?.serialManaged), unitPrice: entry ? entry.unitPrice : null,
        sapQty: 0, sapSerials: 0, countedSerials: 0, countedLines: 0,
        misplaced: Boolean(line?.inScope && line.misplaced), suggestions: line?.inScope && line.misplaced ? line.suggestions : [],
      })
    }
    return rows.get(key)
  }
  const types = new Set(scopeStockTypes(snapshot.scope))
  for (const line of snapshot.stock) {
    if (!line.inScope) continue
    const material = snapshot.materials[line.m].material
    if (line.unrestricted && types.has('unrestricted')) rowFor(material, line.sloc, 'unrestricted').sapQty += line.unrestricted
    if (line.blocked && types.has('blocked')) rowFor(material, line.sloc, 'blocked').sapQty += line.blocked
  }
  const missing = new Map()
  for (const [serial, info] of index.serials) {
    if (!info.inScope) continue
    rowFor(info.material, info.sloc, info.stockType).sapSerials += 1
    missing.set(serial, info)
  }

  const found = new Map()
  const duplicates = []
  const extra = []
  const moves = []
  const lineVersions = new Map()
  let foundCount = 0
  const active = activeEvents(events)
  // A removal cancels every registration of that serial up to its time; a scan after it counts again.
  const removedUntil = new Map()
  for (const event of active) if (event.type === 'serial-remove') removedUntil.set(normalizeSerial(event.serial), Math.max(event.at, removedUntil.get(normalizeSerial(event.serial)) ?? -Infinity))
  const recordSerial = (rawSerial, event, source) => {
    if (event.at <= (removedUntil.get(normalizeSerial(rawSerial)) ?? -Infinity)) return
    const result = matchSerial(rawSerial, index, found)
    if (result.outcome === 'invalid') return
    const who = { by: event.by, byName: event.byName, at: event.at, place: event.place || '', source, eventId: event.id, document: event.document || '' }
    if (result.outcome === 'duplicate') { duplicates.push({ serial: result.serial, ...who, previous: result.previous }); return }
    found.set(result.serial, who)
    if (result.outcome === 'found') {
      foundCount += 1
      missing.delete(result.serial)
      rowFor(result.material, result.sloc, result.stockType).countedSerials += 1
    } else {
      extra.push({ serial: result.serial, outcome: result.outcome, material: result.material, description: result.description, sloc: result.sloc, stockType: result.stockType, ...(result.otherCount ? { otherCount: result.otherCount } : {}), ...who })
    }
    if (result.move) moves.push({ serial: result.serial, material: result.material, description: result.description, sloc: result.sloc, stockType: result.stockType, quantity: 1, reason: result.outcome === 'other-sloc' ? 'other-sloc' : 'misplaced', suggestions: result.suggestions, ...who })
  }
  for (const event of active) {
    if (event.type === 'scan') recordSerial(event.serial, event, 'scan')
    else if (event.type === 'import' && Array.isArray(event.serials)) for (const serial of event.serials) recordSerial(serial, event, 'import')
    else if (event.type === 'line' && typeof event.lineId === 'string') lineVersions.set(event.lineId, event)
    else if (event.type === 'line-delete' && typeof event.lineId === 'string') lineVersions.delete(event.lineId)
  }

  const lines = []
  for (const event of lineVersions.values()) {
    const qty = Number.isFinite(event.qty) && event.qty >= 0 ? event.qty : 0
    const line = { lineId: event.lineId, place: event.place || '', area: event.area || '', material: String(event.material || '').toUpperCase(), sloc: event.sloc, stockType: event.stockType === 'blocked' ? 'blocked' : 'unrestricted', qty, status: event.status === 'error' ? 'error' : 'counted', comment: event.comment || '', by: event.by, byName: event.byName, at: event.at }
    lines.push(line)
    if (!line.material || !line.sloc) continue
    const row = rowFor(line.material, line.sloc, line.stockType)
    row.countedLines += qty
    if (row.misplaced && qty > 0) moves.push({ serial: null, material: line.material, description: row.description, sloc: line.sloc, stockType: line.stockType, quantity: qty, reason: 'misplaced', suggestions: row.suggestions, by: line.by, byName: line.byName, at: line.at, place: line.place, source: 'line' })
  }

  const result = [...rows.values()].map(row => {
    const counted = row.countedSerials + row.countedLines
    const diff = counted - row.sapQty
    return { ...row, counted, diff, valueDiff: row.unitPrice === null ? null : round2(diff * row.unitPrice), sapMismatch: row.serialManaged && row.sapSerials !== row.sapQty }
  }).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.material.localeCompare(b.material) || a.sloc.localeCompare(b.sloc) || STOCK_TYPES.indexOf(a.stockType) - STOCK_TYPES.indexOf(b.stockType))

  return {
    rows: result,
    totals: totalsOf(result),
    lines,
    serials: {
      found: foundCount,
      expected: foundCount + missing.size,
      missing: [...missing].map(([serial, info]) => ({ serial, material: info.material, description: index.materials.get(info.material)?.description || '', sloc: info.sloc, stockType: info.stockType })),
      extra,
    },
    duplicates,
    moves,
    found,
  }
}

function totalsOf(rows) {
  const totals = {}
  for (const row of rows) {
    const group = (totals[row.kind] ||= {})
    const bucket = (group[row.stockType] ||= { sapQty: 0, counted: 0, diff: 0, valueDiff: 0 })
    bucket.sapQty += row.sapQty
    bucket.counted += row.counted
    bucket.diff += row.diff
    bucket.valueDiff = round2(bucket.valueDiff + (row.valueDiff || 0))
  }
  return totals
}

/**
 * Approved (and posted) materials show the SAP quantity, count and difference frozen at approval, so a later SAP
 * fetch for other materials cannot change them. Anything counted after the approval is shown as countedAfter.
 */
function applyApprovals(aggregate, approvals = {}) {
  const frozenOf = material => {
    const approval = approvals[material]
    return ['approved', 'posted'].includes(approval?.status) && Array.isArray(approval.frozen) ? approval : null
  }
  const rows = []
  const seen = new Set()
  for (const row of aggregate.rows) {
    const approval = frozenOf(row.material)
    if (!approval) { rows.push(row); continue }
    const frozen = approval.frozen.find(item => item.sloc === row.sloc && item.stockType === row.stockType)
    seen.add(`${row.material}|${row.sloc}|${row.stockType}`)
    if (!frozen) { rows.push({ ...row, sapQty: 0, diff: row.counted, valueDiff: row.unitPrice === null ? null : round2(row.counted * row.unitPrice), frozenAt: approval.at, countedAfter: row.counted }); continue }
    rows.push({ ...row, sapQty: frozen.sapQty, counted: frozen.counted, diff: frozen.diff, valueDiff: frozen.valueDiff, frozenAt: approval.at, countedAfter: row.counted - frozen.counted })
  }
  const template = new Map(aggregate.rows.map(row => [row.material, row]))
  for (const [material, approval] of Object.entries(approvals)) {
    if (!frozenOf(material)) continue
    for (const frozen of approval.frozen) {
      if (seen.has(`${material}|${frozen.sloc}|${frozen.stockType}`)) continue
      const base = template.get(material) || { material, description: '', kind: materialKind(material), serialManaged: false, unitPrice: null, sapSerials: 0, countedSerials: 0, countedLines: 0, misplaced: false, suggestions: [], sapMismatch: false }
      rows.push({ ...base, sloc: frozen.sloc, stockType: frozen.stockType, sapQty: frozen.sapQty, counted: frozen.counted, diff: frozen.diff, valueDiff: frozen.valueDiff, frozenAt: approval.at, countedAfter: -frozen.counted })
    }
  }
  return { ...aggregate, rows, totals: totalsOf(rows) }
}

/** The rows of one material as they are frozen when a manager approves it. */
function freezeRows(rows, material) {
  return rows.filter(row => row.material === material).map(row => ({ sloc: row.sloc, stockType: row.stockType, sapQty: row.sapQty, counted: row.counted, diff: row.diff, valueDiff: row.valueDiff }))
}

const lineIdFor = (place, material) => `pl-${crypto.createHash('sha256').update(`${place}|${material}`).digest('hex').slice(0, 12)}`
const naturalCompare = (a, b) => String(a).localeCompare(String(b), 'da', { numeric: true })

/** Count lists from the placement sheet: placements holding an in-scope material that is counted by quantity. */
function buildCountLists({ snapshot, index, placements }) {
  const bestSloc = new Map()
  for (const line of snapshot.stock) {
    if (!line.inScope) continue
    const material = snapshot.materials[line.m].material
    const quantity = line.unrestricted + line.blocked
    const best = bestSloc.get(material)
    if (!best || quantity > best.quantity) bestSloc.set(material, { sloc: line.sloc, quantity })
  }
  const lists = []
  const seen = new Set()
  for (const placement of placements || []) {
    const material = String(placement.material || '').toUpperCase()
    const entry = index.materials.get(material)
    if (!entry || entry.serialManaged || !bestSloc.has(material)) continue
    const lineId = lineIdFor(placement.placement, material)
    if (seen.has(lineId)) continue
    seen.add(lineId)
    lists.push({ lineId, area: placement.area || '', place: placement.placement, material, description: entry.description, sloc: bestSloc.get(material).sloc, sheetQty: Number.isFinite(placement.quantity) ? placement.quantity : null })
  }
  return lists.sort((a, b) => naturalCompare(a.area, b.area) || naturalCompare(a.place, b.place) || a.material.localeCompare(b.material))
}

function computeProgress({ snapshot, aggregate, countLists = [], events, approvals = {}, now = Date.now() }) {
  const emptyPair = () => ({ unrestricted: { found: 0, expected: 0 }, blocked: { found: 0, expected: 0 } })
  const terminals = { new: emptyPair(), used: emptyPair() }
  const accessorySerials = { found: 0, expected: 0 }
  const slocs = new Map()
  const slocFor = sloc => { if (!slocs.has(sloc)) slocs.set(sloc, { sloc, found: 0, expected: 0, countedQty: 0, sapQty: 0 }); return slocs.get(sloc) }
  for (const row of aggregate.rows) {
    const bucket = slocFor(row.sloc)
    if (row.serialManaged) {
      const found = Math.min(row.countedSerials, row.sapSerials)
      bucket.found += found
      bucket.expected += row.sapSerials
      if (row.kind === 'new' || row.kind === 'used') {
        terminals[row.kind][row.stockType].found += found
        terminals[row.kind][row.stockType].expected += row.sapSerials
      } else {
        accessorySerials.found += found
        accessorySerials.expected += row.sapSerials
      }
    } else {
      bucket.countedQty += row.countedLines
      bucket.sapQty += row.sapQty
    }
  }

  const activeLines = new Map(aggregate.lines.map(line => [line.lineId, line]))
  const areas = new Map()
  const areaFor = area => { const name = area || '–'; if (!areas.has(name)) areas.set(name, { area: name, counted: 0, total: 0 }); return areas.get(name) }
  let linesCounted = 0
  let linesTotal = 0
  const listIds = new Set()
  for (const listLine of countLists) {
    listIds.add(listLine.lineId)
    const bucket = areaFor(listLine.area)
    bucket.total += 1
    linesTotal += 1
    if (activeLines.get(listLine.lineId)?.status === 'counted') { bucket.counted += 1; linesCounted += 1 }
  }
  for (const line of aggregate.lines) {
    if (listIds.has(line.lineId)) continue
    const bucket = areaFor(line.area)
    bucket.total += 1
    linesTotal += 1
    if (line.status === 'counted') { bucket.counted += 1; linesCounted += 1 }
  }
  let accessoryCounted = 0
  let accessorySap = 0
  for (const row of aggregate.rows) {
    if (row.kind === 'accessory' && !row.serialManaged) { accessoryCounted += row.countedLines; accessorySap += row.sapQty }
  }

  const expectedSerials = aggregate.serials.expected
  const reached = aggregate.serials.found + linesCounted
  const total = expectedSerials + linesTotal

  const counters = new Map()
  const active = activeEvents(events)
  for (const event of active) {
    if (!['scan', 'import', 'line'].includes(event.type)) continue
    const counter = counters.get(event.by) || { email: event.by, name: event.byName || event.by, events: 0, serials: 0, lines: 0, lastAt: 0 }
    counter.events += 1
    if (event.type === 'scan') counter.serials += 1
    if (event.type === 'import') counter.serials += Array.isArray(event.serials) ? event.serials.length : 0
    if (event.type === 'line') counter.lines += 1
    counter.lastAt = Math.max(counter.lastAt, event.at)
    counters.set(event.by, counter)
  }

  const materials = new Map()
  for (const row of aggregate.rows) {
    if (row.sapQty <= 0 && row.counted <= 0) continue
    const entry = materials.get(row.material) || { done: true }
    if (row.serialManaged ? row.countedSerials < row.sapSerials : row.countedLines <= 0 && row.sapQty > 0) entry.done = false
    materials.set(row.material, entry)
  }
  for (const listLine of countLists) {
    if (activeLines.get(listLine.lineId)?.status !== 'counted' && materials.has(listLine.material)) materials.get(listLine.material).done = false
  }
  const approvalValues = Object.entries(approvals).filter(([material]) => materials.has(material)).map(([, value]) => value?.status)

  const hourAgo = now - 3600 * 1000
  const recent = active.filter(event => ['scan', 'import', 'line'].includes(event.type) && event.at >= hourAgo)
  const perHour = recent.reduce((sum, event) => sum + (event.type === 'import' ? event.serials?.length || 0 : 1), 0)

  return {
    overall: { reached, total, percent: total ? Math.round((reached / total) * 100) : 0 },
    terminals,
    accessory: { lines: { counted: linesCounted, total: linesTotal }, quantity: { counted: accessoryCounted, sap: accessorySap }, serials: accessorySerials },
    materials: {
      total: materials.size,
      counted: [...materials.values()].filter(entry => entry.done).length,
      approved: approvalValues.filter(status => status === 'approved' || status === 'posted').length,
      posted: approvalValues.filter(status => status === 'posted').length,
    },
    areas: [...areas.values()].sort((a, b) => naturalCompare(a.area, b.area)),
    slocs: [...slocs.values()].sort((a, b) => a.sloc.localeCompare(b.sloc)),
    counters: [...counters.values()].sort((a, b) => b.events - a.events),
    pace: { perHour, etaHours: perHour > 0 ? round2(Math.max(total - reached, 0) / perHour) : null },
    fetchedAt: snapshot.fetchedAt,
  }
}

module.exports = { normalizeSerial, matchSerial, activeEvents, aggregateCount, applyApprovals, freezeRows, buildCountLists, computeProgress, lineIdFor }
