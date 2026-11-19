// What kind of material is it, and where is it allowed to be (storage rules)?
const { TEAMS } = require('../teams.cjs')

const KINDS = Object.freeze(['new', 'used', 'accessory'])
const KIND_LABELS = Object.freeze({ new: 'Nye terminaler', used: 'Brugte terminaler', accessory: 'Tilbehør', other: 'Andet' })

// Only what the teams told us; managers maintain the rest in the program.
const DEFAULT_RULES = Object.freeze({
  TCD: { D000: ['new', 'accessory'], D004: ['used'], D005: ['new', 'used'] },
  TRR: { D001: ['used'], D002: ['used'], D003: ['used'] },
})
const SUGGESTION_MIN_SHARE = 0.05

function materialKind(material) {
  const value = String(material || '').trim().toUpperCase()
  // INT####-####-<variant>, with -R for used (variant 0 normal, 9 DEV/TEST).
  if (value.startsWith('INT')) return value.endsWith('-R') ? 'used' : 'new'
  if (value.startsWith('R')) return /^R\d/.test(value) ? 'accessory' : 'other'
  return 'other'
}

function teamExpectedKinds(team) {
  return team === 'TRR' ? ['used'] : [...KINDS]
}

function normalizeKinds(kinds) {
  if (!Array.isArray(kinds)) return null
  const valid = KINDS.filter(kind => kinds.includes(kind))
  return valid.length && valid.length === new Set(kinds).size ? valid : null
}

/** { sloc: allowedKinds[] | null } for the team's own storage locations; null = no rule yet. */
function storageRulesFor(team, stored = {}) {
  const rules = {}
  for (const sloc of TEAMS[team]?.storageLocations || []) {
    const fromManager = stored && Object.hasOwn(stored, sloc) ? normalizeKinds(stored[sloc]?.kinds) : null
    rules[sloc] = fromManager || (DEFAULT_RULES[team]?.[sloc] ? [...DEFAULT_RULES[team][sloc]] : null)
  }
  return rules
}

function isMisplaced(kind, sloc, rules) {
  const allowed = rules && Object.hasOwn(rules, sloc) ? rules[sloc] : null
  return Array.isArray(allowed) && !allowed.includes(kind)
}

/** Where a misplaced item should go: dedicated locations first, the own team before the other team. */
function suggestLocations(kind, team, rulesByTeam) {
  if (!KINDS.includes(kind)) return []
  const pick = rules => Object.entries(rules || {})
    .filter(([, allowed]) => Array.isArray(allowed) && allowed.includes(kind))
    .sort(([a, allowedA], [b, allowedB]) => allowedA.length - allowedB.length || a.localeCompare(b))
    .map(([sloc]) => sloc)
  const own = pick(rulesByTeam[team])
  if (own.length) return own
  return Object.keys(rulesByTeam).filter(other => other !== team).flatMap(other => pick(rulesByTeam[other]))
}

/** A starting point for managers: the kinds that make up a real share of each location's stock today. */
function suggestRulesFromStock(stockRows, slocs) {
  const result = {}
  for (const sloc of slocs) {
    const quantities = { new: 0, used: 0, accessory: 0 }
    for (const row of stockRows) {
      if (row.sloc !== sloc) continue
      const kind = materialKind(row.material)
      if (kind !== 'other') quantities[kind] += (row.unrestricted || 0) + (row.blocked || 0)
    }
    const total = KINDS.reduce((sum, kind) => sum + quantities[kind], 0)
    result[sloc] = { quantities, suggested: total ? KINDS.filter(kind => quantities[kind] / total >= SUGGESTION_MIN_SHARE) : [] }
  }
  return result
}

module.exports = { KINDS, KIND_LABELS, DEFAULT_RULES, materialKind, teamExpectedKinds, normalizeKinds, storageRulesFor, isMisplaced, suggestLocations, suggestRulesFromStock }
