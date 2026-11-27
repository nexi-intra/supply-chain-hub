const STOCK_TYPE_ORDER = { unrestricted: 0, blocked: 1 }

function compareGroups(a, b) {
  if (a.sloc !== b.sloc) return a.sloc < b.sloc ? -1 : 1
  return (STOCK_TYPE_ORDER[a.stockType] ?? 2) - (STOCK_TYPE_ORDER[b.stockType] ?? 2)
}

function compareByCount(a, b) {
  if (a.count !== b.count) return b.count - a.count
  return a.countName < b.countName ? -1 : a.countName > b.countName ? 1 : 0
}

/**
 * Decides which open count a material document belongs to. Pure: no I/O, no clock.
 * `counts[].serials` is the `serials` Map from `indexSnapshot`.
 */
function matdocTarget({ serials, counts }) {
  const distinct = []
  const seen = new Set()
  for (const raw of serials || []) {
    const serial = String(raw ?? '').trim().toUpperCase()
    if (!serial || seen.has(serial)) continue
    seen.add(serial)
    distinct.push(serial)
  }

  const groups = new Map()
  const byCount = new Map()
  const rows = []
  let unknown = 0
  let known = 0
  let unclaimed = 0

  for (const serial of distinct) {
    const owners = []
    let newest = null
    for (const count of counts || []) {
      const hit = count.serials.get(serial)
      if (!hit) continue
      if (hit.inScope) owners.push({ count, hit })
      if (!newest || count.fetchedAt > newest.count.fetchedAt) newest = { count, hit }
    }
    if (!newest) {
      unknown += 1
      rows.push({ serial, material: null, sloc: null, stockType: null, countId: null, countName: null })
      continue
    }
    known += 1
    const { hit } = owners[0] || newest
    const groupKey = `${hit.sloc}|${hit.stockType}`
    const group = groups.get(groupKey) || { sloc: hit.sloc, stockType: hit.stockType, count: 0 }
    group.count += 1
    groups.set(groupKey, group)
    if (!owners.length) unclaimed += 1
    for (const { count } of owners) {
      const entry = byCount.get(count.id) || { countId: count.id, countName: count.name, count: 0 }
      entry.count += 1
      byCount.set(count.id, entry)
    }
    const owner = owners[0] ? owners[0].count : null
    rows.push({ serial, material: hit.material, sloc: hit.sloc, stockType: hit.stockType, countId: owner ? owner.id : null, countName: owner ? owner.name : null })
  }

  const groupList = [...groups.values()].sort(compareGroups)
  const countList = [...byCount.values()].sort(compareByCount)
  const single = groupList.length === 1 ? groupList[0] : null

  let outcome
  if (!known) outcome = 'unknown'
  else if (groupList.length > 1) outcome = 'mixed'
  else if (unclaimed === known) outcome = 'none'
  else if (unclaimed > 0) outcome = 'outside'
  else if (countList.length > 1) outcome = 'several'
  else outcome = 'ok'

  const target = outcome === 'ok' ? countList[0] : null
  return {
    outcome,
    countId: target ? target.countId : null,
    countName: target ? target.countName : null,
    sloc: single ? single.sloc : null,
    stockType: single ? single.stockType : null,
    groups: groupList,
    byCount: countList,
    rows,
    unknown,
  }
}

module.exports = { matdocTarget }
