const KIF = 'D005'
const BLOCKED_SLOC = 'D000'
const USED_FAILED_SLOC = 'D002'

function materialKind(material) {
  const value = String(material || '')
  if (value.endsWith('-0')) return 'new'
  if (value.endsWith('-R')) return 'used'
  return 'other'
}

function normalizeSloc(value) {
  const sloc = String(value ?? '').trim().toUpperCase()
  return /^[A-Z]\d{3}$/.test(sloc) ? sloc : null
}

function planMoves({ kif, target, terminals, sapRows, passedD005 }) {
  const rowsBySerial = new Map(sapRows.map(r => [r.serial, r]))
  const transfersByKey = new Map()
  const blocksByMaterial = new Map()
  const outcomes = {}

  // In KIF a move to D005 is wave 1 and a move from D005 is wave 2.
  const addMove = (from, to, serial, wave = kif && from === KIF ? 2 : 1) => {
    const key = `${wave}|${from}|${to}`
    if (!transfersByKey.has(key)) transfersByKey.set(key, { wave, from, to, serials: [] })
    transfersByKey.get(key).serials.push(serial)
  }

  for (const { serial, failed } of terminals) {
    const row = rowsBySerial.get(serial)
    if (!row) { outcomes[serial] = 'not-found'; continue }

    const kind = materialKind(row.material)
    let destination = target
    let outcome = 'to-target'
    if (failed) {
      if (kind === 'new') { destination = BLOCKED_SLOC; outcome = 'to-blocked' }
      else if (kind === 'used') { destination = USED_FAILED_SLOC; outcome = 'to-d002' }
      else { outcomes[serial] = 'manual'; continue }
    }

    if (row.blocked) {
      outcomes[serial] = failed && kind === 'new' && row.sloc === BLOCKED_SLOC ? 'already-blocked' : 'blocked-stock'
      continue
    }

    if (kif) {
      if (passedD005.has(serial) && row.sloc !== KIF) {
        // Resume: it already passed D005 in this task and no longer stands there, so it moves directly.
        if (row.sloc !== destination) addMove(row.sloc, destination, serial, 2)
      } else {
        if (row.sloc !== KIF) addMove(row.sloc, KIF, serial)
        // D005 -> destination, also when it stood on the destination before.
        if (destination !== KIF) addMove(KIF, destination, serial)
      }
    } else if (row.sloc !== destination) {
      addMove(row.sloc, destination, serial)
    } else if (!failed) {
      outcome = 'skipped'
    }
    outcomes[serial] = outcome

    if (failed && kind === 'new') {
      if (!blocksByMaterial.has(row.material)) blocksByMaterial.set(row.material, { material: row.material, serials: [] })
      blocksByMaterial.get(row.material).serials.push(serial)
    }
  }

  // Stable sort: by wave, then by first appearance.
  const transfers = [...transfersByKey.values()].sort((a, b) => a.wave - b.wave)
  return { transfers, blocks: [...blocksByMaterial.values()], outcomes }
}

module.exports = { KIF, BLOCKED_SLOC, USED_FAILED_SLOC, materialKind, normalizeSloc, planMoves }
