// Turns the raw facts from scripts/sap/status.vbs into one state the UI can show.
// Plain function, no I/O, so every rule is unit tested.
const EXPECTED = Object.freeze({ system: 'PS4', client: '100' })
// SAP's standard limit on sessions per connection (rdisp/max_alt_modes).
const MAX_SESSIONS = 6
const LOGON_TRANSACTION = 'S000'

const sameText = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase()

function result(state, details = {}) {
  return { state, ready: state === 'ready', system: details.system || null, client: details.client || null, user: details.user || null }
}

function computeSapState(facts, expected = EXPECTED) {
  if (!facts || typeof facts !== 'object') return result('error')
  if (facts.running !== true) return result('not-running')
  if (facts.scripting === false) return result('scripting-off')
  const connections = Array.isArray(facts.connections) ? facts.connections : []
  const sessions = connections.flatMap(connection => (Array.isArray(connection?.sessions) ? connection.sessions : [])
    .map(session => ({ ...session, connection })))
  const loggedIn = session => session.busy !== true && !!String(session.user || '').trim() && !sameText(session.transaction, LOGON_TRANSACTION)
  const onExpectedSystem = session => sameText(session.system, expected.system) && String(session.client || '').trim() === expected.client

  const candidates = sessions.filter(session => loggedIn(session) && onExpectedSystem(session))
  if (candidates.length) {
    const { connection } = candidates[0]
    const details = { system: candidates[0].system, client: candidates[0].client, user: candidates[0].user }
    if (connection.disabledByServer === true) return result('scripting-off', details)
    if (connection.sessions.length >= MAX_SESSIONS) return result('max-sessions', details)
    const free = candidates.find(session => session.popup !== true)
    if (!free) return result('popup', details)
    return result('ready', { system: free.system, client: free.client, user: free.user })
  }
  if (sessions.some(session => session.busy === true)) return result('busy')
  const elsewhere = sessions.find(loggedIn)
  if (elsewhere) return result('wrong-system', { system: elsewhere.system, client: elsewhere.client, user: elsewhere.user })
  return result('not-logged-in')
}

module.exports = { computeSapState, EXPECTED, MAX_SESSIONS }
