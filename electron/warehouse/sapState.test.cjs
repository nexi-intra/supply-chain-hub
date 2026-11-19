const test = require('node:test')
const assert = require('node:assert/strict')
const { computeSapState } = require('./sapState.cjs')

const session = (overrides = {}) => ({ busy: false, popup: false, system: 'PS4', client: '100', user: 'JREMMER', transaction: 'SESSION_MANAGER', ...overrides })
const facts = (...sessions) => ({ running: true, scripting: true, connections: [{ disabledByServer: false, sessions }] })

test('ready when a logged-in PS4/100 session is free', () => {
  assert.deepEqual(computeSapState(facts(session())), { state: 'ready', ready: true, system: 'PS4', client: '100', user: 'JREMMER' })
})

test('SAP not running, scripting disabled or no connection', () => {
  assert.equal(computeSapState({ running: false }).state, 'not-running')
  assert.equal(computeSapState({ running: true, scripting: false }).state, 'scripting-off')
  assert.equal(computeSapState({ running: true, scripting: true, connections: [] }).state, 'not-logged-in')
  assert.equal(computeSapState(null).state, 'error')
  assert.equal(computeSapState('garbage').state, 'error')
})

test('the logon screen does not count as logged in', () => {
  assert.equal(computeSapState(facts(session({ user: '', transaction: 'S000' }))).state, 'not-logged-in')
  assert.equal(computeSapState(facts(session({ transaction: 'S000' }))).state, 'not-logged-in')
})

test('a popup in the only session blocks; another free session is enough', () => {
  assert.equal(computeSapState(facts(session({ popup: true }))).state, 'popup')
  assert.equal(computeSapState(facts(session({ popup: true }), session())).state, 'ready')
})

test('busy sessions: busy when nothing else is usable, ready when another session is free', () => {
  assert.equal(computeSapState(facts({ busy: true })).state, 'busy')
  assert.equal(computeSapState(facts({ busy: true }, session())).state, 'ready')
})

test('a full connection (6 sessions) cannot open the extra session CountPoint needs', () => {
  const six = Array.from({ length: 6 }, () => session())
  assert.equal(computeSapState(facts(...six)).state, 'max-sessions')
  assert.equal(computeSapState(facts(...six.slice(1))).state, 'ready')
})

test('logged in to another system or client is reported as wrong system', () => {
  const qa = computeSapState(facts(session({ system: 'QS4', client: '200' })))
  assert.equal(qa.state, 'wrong-system')
  assert.equal(qa.system, 'QS4')
  assert.equal(qa.client, '200')
  assert.equal(computeSapState(facts(session({ system: 'ps4' }))).state, 'ready')
})

test('scripting disabled by the server is reported as scripting off', () => {
  const state = computeSapState({ running: true, scripting: true, connections: [{ disabledByServer: true, sessions: [session()] }] })
  assert.equal(state.state, 'scripting-off')
})

test('the right system is preferred over another connection', () => {
  const state = computeSapState({
    running: true,
    scripting: true,
    connections: [
      { disabledByServer: false, sessions: [session({ system: 'QS4' })] },
      { disabledByServer: false, sessions: [session({ user: 'OTHER' })] },
    ],
  })
  assert.equal(state.state, 'ready')
  assert.equal(state.user, 'OTHER')
})
