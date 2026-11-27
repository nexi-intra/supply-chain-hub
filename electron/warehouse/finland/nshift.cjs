// nShift client for Finlandsforsendelser: a token by client credentials and one parcel's timeline by T&T.
// One call to nShift at a time per hub, with a pause between calls. The secret is only ever sent in the token request
// and never appears in an error.
const { timelineFrom } = require('./core/nshiftRules.cjs')

const TOKEN_URL = 'https://account.nshiftportal.com/idp/connect/token'
const LOOKUP_URL = 'https://api.nshiftportal.com/track/shipmentdata/Operational/Shipments/Aggregated/ByBarcode'
const TOKEN_MARGIN_MS = 60000
const DEFAULT_TOKEN_SECONDS = 3600
const TIMEOUT_MS = 30000
const DAY_MS = 86400000
// The API refuses more than 31 days between startDate and endDate.
const DAYS_BEFORE = 3
const DAYS_AFTER = 27

const NOT_SET_TEXT = 'nShift er ikke sat op. En manager kan sætte det op under Administration.'
const REFUSED_TEXT = 'nShift afviste nøglen. Tjek klient-id og hemmelighed under Administration.'
const FAILED_TEXT = 'nShift svarer ikke lige nu. Prøv igen om lidt.'

function codeError(code, text) {
  return Object.assign(new Error(text ? `${code}: ${text}` : code), { code })
}

const notSet = () => codeError('FINLAND_NSHIFT_NOT_SET', NOT_SET_TEXT)
const refused = () => codeError('FINLAND_NSHIFT_REFUSED', REFUSED_TEXT)
const failed = () => codeError('FINLAND_NSHIFT_FAILED', FAILED_TEXT)
const clean = (value) => String(value == null ? '' : value).trim()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Pickup day minus 3 to plus 27 days, whole days in UTC; null for anything but a real 'YYYY-MM-DD'. */
function searchWindow(pickedUp) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(pickedUp))
  if (!match) return null
  const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (new Date(day).toISOString().slice(0, 10) !== match[0]) return null
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
  return {
    startDate: `${iso(day - DAYS_BEFORE * DAY_MS)}T00:00:00Z`,
    endDate: `${iso(day + DAYS_AFTER * DAY_MS)}T23:59:59Z`
  }
}

function createNshiftClient({ credentials, fetch = globalThis.fetch, now = Date.now, pauseMs = 250 }) {
  let token = null
  let operations = Promise.resolve()
  let paused = Promise.resolve()

  // Operations (a lookup or a test) run one after the other, so two never fetch a token at the same time.
  function enqueue(operation) {
    const run = operations.then(operation)
    operations = run.catch(() => {})
    return run
  }

  // Every call waits for the pause after the previous one. Network errors become FINLAND_NSHIFT_FAILED without the
  // original error, which could carry the request.
  async function send(url, init) {
    await paused
    try {
      const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined
      return await fetch(url, { ...init, signal })
    } catch {
      throw failed()
    } finally {
      paused = sleep(pauseMs)
    }
  }

  async function readJson(response) {
    try {
      return await response.json()
    } catch {
      throw failed()
    }
  }

  async function readCredentials() {
    const value = await credentials()
    const clientId = clean(value && value.clientId)
    const clientSecret = clean(value && value.clientSecret)
    if (!clientId || !clientSecret) throw notSet()
    return { clientId, clientSecret }
  }

  async function newToken(creds) {
    token = null
    const requestedAt = now()
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: creds.clientId, client_secret: creds.clientSecret })
    const response = await send(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString()
    })
    if (response.status === 400 || response.status === 401) throw refused()
    if (!response.ok) throw failed()
    const answer = await readJson(response)
    const value = clean(answer && answer.access_token)
    if (!value) throw failed()
    const seconds = Number(answer.expires_in) > 0 ? Number(answer.expires_in) : DEFAULT_TOKEN_SECONDS
    token = { value, expiresAt: requestedAt + seconds * 1000, clientId: creds.clientId, clientSecret: creds.clientSecret }
    return value
  }

  // The token is reused until a minute before it expires, and only for the same key.
  function tokenFor(creds) {
    const reusable = token && token.clientId === creds.clientId && token.clientSecret === creds.clientSecret && now() < token.expiresAt - TOKEN_MARGIN_MS
    return reusable ? token.value : newToken(creds)
  }

  async function lookupNow(tracking, pickedUp) {
    const query = clean(tracking)
    const window = searchWindow(pickedUp)
    if (!query || !window) throw codeError('FINLAND_INVALID_INPUT', 'Kolliet mangler T&T eller afhentningsdag.')
    const creds = await readCredentials()
    const body = JSON.stringify({ query, ...window, pageSize: 5, pageIndex: 0, installationTags: [], actorTags: [], carrierTags: [] })
    const ask = async (bearer) => send(LOOKUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${bearer}` },
      body
    })
    let response = await ask(await tokenFor(creds))
    // A token nShift no longer accepts gets one new try.
    if (response.status === 401) response = await ask(await newToken(creds))
    if (response.status === 401 || response.status === 403) {
      token = null
      throw refused()
    }
    if (!response.ok) throw failed()
    const answer = await readJson(response)
    if (!Array.isArray(answer)) throw failed()
    return answer.length ? timelineFrom(answer[0], query) : null
  }

  async function testNow() {
    await newToken(await readCredentials())
    return true
  }

  return {
    /** The parcel's timeline, or null when nShift does not know it. `pickedUp` is 'YYYY-MM-DD'. */
    lookup: (tracking, pickedUp) => enqueue(() => lookupNow(tracking, pickedUp)),
    /** True when nShift accepts the key; always fetches a new token. */
    test: () => enqueue(testNow)
  }
}

module.exports = { createNshiftClient, searchWindow }
