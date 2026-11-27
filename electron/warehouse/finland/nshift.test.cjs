const test = require('node:test')
const assert = require('node:assert/strict')
const { createNshiftClient } = require('./nshift.cjs')

// Only a fake fetch: these tests never reach nShift.
const TOKEN_URL = 'https://account.nshiftportal.com/idp/connect/token'
const LOOKUP_URL = 'https://api.nshiftportal.com/track/shipmentdata/Operational/Shipments/Aggregated/ByBarcode'
const SECRET = 'TEST-SECRET-123'
const CREDENTIALS = { clientId: 'test-client-0042', clientSecret: SECRET }
const REFUSED = 'FINLAND_NSHIFT_REFUSED: nShift afviste nøglen. Tjek klient-id og hemmelighed under Administration.'

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) })

const element = (tracking) => ({
  shipment: {
    carrierName: 'Postnord API',
    events: [],
    lines: [{
      packages: [{
        number: tracking,
        events: [{
          date: '2026-11-24T10:00:00+00:00', normalizedStatusId: 2003, normalizedStatusName: 'Arrived',
          configurationName: 'ARRIVED', addresses: [{ name1: 'VANTAA', city: 'Vantaa', countryCode: 'FIN' }]
        }]
      }]
    }]
  },
  additionalInformation: {}
})

// A fake fetch: tokens tok1, tok2, ... unless `token()` answers otherwise; lookups answer with `lookup(call)` or one parcel.
function fakeNshift({ token = () => null, lookup = null } = {}) {
  const calls = []
  let tokens = 0
  async function fetch(url, init) {
    const call = { url, init }
    calls.push(call)
    if (url === TOKEN_URL) return token(call) || reply(200, { access_token: `tok${++tokens}`, expires_in: 3600, token_type: 'Bearer' })
    if (url === LOOKUP_URL) return lookup ? lookup(call) : reply(200, [element(JSON.parse(init.body).query)])
    throw new Error(`unexpected url ${url}`)
  }
  const tokenCalls = () => calls.filter((c) => c.url === TOKEN_URL)
  const lookupCalls = () => calls.filter((c) => c.url === LOOKUP_URL)
  return { fetch, calls, tokenCalls, lookupCalls }
}

const client = (nshift, extra = {}) => createNshiftClient({ credentials: async () => CREDENTIALS, fetch: nshift.fetch, pauseMs: 0, ...extra })

function assertNoSecret(error) {
  for (const text of [error.message, String(error), error.stack, JSON.stringify(error), JSON.stringify(Object.assign({}, error))]) {
    assert.ok(!String(text).includes(SECRET), `the secret leaked: ${text}`)
  }
}

test('the token is reused until shortly before it expires', async () => {
  let clock = 1_000_000
  const nshift = fakeNshift()
  const c = client(nshift, { now: () => clock })
  await c.lookup('TT1', '2026-11-23')
  const form = new URLSearchParams(nshift.tokenCalls()[0].init.body.toString())
  assert.deepEqual(Object.fromEntries(form), { grant_type: 'client_credentials', client_id: 'test-client-0042', client_secret: SECRET })
  assert.equal(nshift.tokenCalls()[0].init.method, 'POST')
  assert.match(String(nshift.tokenCalls()[0].init.headers['Content-Type']), /^application\/x-www-form-urlencoded/)
  // Valid for 3600 s; reused until 60 s before that.
  clock += 3540000 - 1
  await c.lookup('TT2', '2026-11-23')
  assert.equal(nshift.tokenCalls().length, 1)
  assert.deepEqual(nshift.lookupCalls().map((call) => call.init.headers.Authorization), ['Bearer tok1', 'Bearer tok1'])
  clock += 1
  await c.lookup('TT3', '2026-11-23')
  assert.equal(nshift.tokenCalls().length, 2)
  assert.equal(nshift.lookupCalls()[2].init.headers.Authorization, 'Bearer tok2')
})

test('a 401 fetches a new token once', async () => {
  let refusals = 1
  const nshift = fakeNshift({ lookup: (call) => (refusals-- > 0 ? reply(401, {}) : reply(200, [element(JSON.parse(call.init.body).query)])) })
  const timeline = await client(nshift).lookup('TT1', '2026-11-23')
  assert.equal(timeline.tracking, 'TT1')
  assert.deepEqual(timeline.events.map((e) => e.place), ['VANTAA Vantaa FIN'])
  assert.deepEqual(nshift.lookupCalls().map((call) => call.init.headers.Authorization), ['Bearer tok1', 'Bearer tok2'])
  assert.equal(nshift.tokenCalls().length, 2)

  // Refused again with the new token: no endless retries.
  const always = fakeNshift({ lookup: () => reply(401, {}) })
  await assert.rejects(client(always).lookup('TT1', '2026-11-23'), (error) => error.code === 'FINLAND_NSHIFT_REFUSED' && error.message === REFUSED)
  assert.equal(always.tokenCalls().length, 2)
  assert.equal(always.lookupCalls().length, 2)
})

test('the search window is pickup minus 3 to plus 27 days', async () => {
  const nshift = fakeNshift()
  await client(nshift).lookup(' TT1 ', '2026-11-23')
  const call = nshift.lookupCalls()[0]
  assert.equal(call.init.method, 'POST')
  assert.equal(call.init.headers['Content-Type'], 'application/json')
  const body = JSON.parse(call.init.body)
  assert.deepEqual(body, {
    query: 'TT1',
    startDate: '2026-11-20T00:00:00Z',
    endDate: '2026-12-20T23:59:59Z',
    pageSize: 5,
    pageIndex: 0,
    installationTags: [],
    actorTags: [],
    carrierTags: []
  })
  assert.ok(Date.parse(body.endDate) - Date.parse(body.startDate) <= 31 * 86400000)
  // Across a month and a year end.
  await client(nshift).lookup('TT1', '2026-01-02')
  const yearEnd = JSON.parse(nshift.lookupCalls()[1].init.body)
  assert.deepEqual([yearEnd.startDate, yearEnd.endDate], ['2025-12-30T00:00:00Z', '2026-01-29T23:59:59Z'])
})

test('a parcel nShift does not know gives null', async () => {
  const nshift = fakeNshift({ lookup: () => reply(200, []) })
  assert.equal(await client(nshift).lookup('UNKNOWN', '2026-11-23'), null)
})

test('a refused secret never appears in the error', async () => {
  for (const status of [400, 401]) {
    const nshift = fakeNshift({ token: () => reply(status, { error: 'invalid_client', error_description: `bad ${SECRET}` }) })
    const c = client(nshift)
    for (const call of [() => c.lookup('TT1', '2026-11-23'), () => c.test()]) {
      await assert.rejects(call(), (error) => {
        assert.equal(error.code, 'FINLAND_NSHIFT_REFUSED')
        assert.equal(error.message, REFUSED)
        assertNoSecret(error)
        return true
      })
    }
    assert.equal(nshift.lookupCalls().length, 0)
  }
  // A failing network whose own error names the secret.
  const broken = createNshiftClient({ credentials: async () => CREDENTIALS, pauseMs: 0, fetch: async () => { throw new Error(`connect failed ${SECRET}`) } })
  await assert.rejects(broken.lookup('TT1', '2026-11-23'), (error) => {
    assert.equal(error.code, 'FINLAND_NSHIFT_FAILED')
    assert.equal(error.message, 'FINLAND_NSHIFT_FAILED: nShift svarer ikke lige nu. Prøv igen om lidt.')
    assertNoSecret(error)
    return true
  })
  // nShift down while looking up.
  const down = fakeNshift({ lookup: () => reply(503, {}) })
  await assert.rejects(client(down).lookup('TT1', '2026-11-23'), (error) => error.code === 'FINLAND_NSHIFT_FAILED')
  // A good key tests fine.
  assert.equal(await client(fakeNshift()).test(), true)
})

test('calls run one at a time with a pause', async () => {
  const pauseMs = 40
  let active = 0
  let most = 0
  const spans = []
  const nshift = fakeNshift()
  async function fetch(url, init) {
    active++
    most = Math.max(most, active)
    const span = { start: performance.now() }
    spans.push(span)
    await new Promise((resolve) => setTimeout(resolve, 5))
    try {
      return await nshift.fetch(url, init)
    } finally {
      span.end = performance.now()
      active--
    }
  }
  const c = createNshiftClient({ credentials: async () => CREDENTIALS, fetch, pauseMs })
  const results = await Promise.all(['TT1', 'TT2', 'TT3'].map((tracking) => c.lookup(tracking, '2026-11-23')))
  assert.deepEqual(results.map((t) => t.tracking), ['TT1', 'TT2', 'TT3'])
  assert.equal(most, 1)
  assert.equal(spans.length, 4)
  for (let i = 1; i < spans.length; i++) {
    // Timers may fire a millisecond early.
    assert.ok(spans[i].start - spans[i - 1].end >= pauseMs - 2, `pause ${spans[i].start - spans[i - 1].end} ms`)
  }
  // A failed lookup does not stop the next one.
  let first = true
  const flaky = fakeNshift({ lookup: (call) => (first ? ((first = false), reply(500, {})) : reply(200, [element(JSON.parse(call.init.body).query)])) })
  const f = client(flaky)
  const [failed, next] = await Promise.allSettled([f.lookup('TT1', '2026-11-23'), f.lookup('TT2', '2026-11-23')])
  assert.equal(failed.reason.code, 'FINLAND_NSHIFT_FAILED')
  assert.equal(next.value.tracking, 'TT2')
})

test('no credentials gives FINLAND_NSHIFT_NOT_SET', async () => {
  const NOT_SET = 'FINLAND_NSHIFT_NOT_SET: nShift er ikke sat op. En manager kan sætte det op under Administration.'
  for (const credentials of [null, { clientId: '', clientSecret: SECRET }, { clientId: 'id', clientSecret: '' }]) {
    const nshift = fakeNshift()
    const c = createNshiftClient({ credentials: async () => credentials, fetch: nshift.fetch, pauseMs: 0 })
    await assert.rejects(c.lookup('TT1', '2026-11-23'), (error) => error.code === 'FINLAND_NSHIFT_NOT_SET' && error.message === NOT_SET)
    await assert.rejects(c.test(), (error) => error.code === 'FINLAND_NSHIFT_NOT_SET')
    assert.equal(nshift.calls.length, 0)
  }
})

test('a key that cannot be read or hangs gives FINLAND_NSHIFT_FAILED without the original error', async () => {
  const FAILED = 'FINLAND_NSHIFT_FAILED: nShift svarer ikke lige nu. Prøv igen om lidt.'
  const nshift = fakeNshift()
  const broken = createNshiftClient({ credentials: async () => { throw new Error(`store said ${SECRET}`) }, fetch: nshift.fetch, pauseMs: 0 })
  for (const call of [() => broken.lookup('TT1', '2026-11-23'), () => broken.test()]) {
    await assert.rejects(call(), (error) => {
      assert.equal(error.code, 'FINLAND_NSHIFT_FAILED')
      assert.equal(error.message, FAILED)
      assertNoSecret(error)
      return true
    })
  }
  const hanging = createNshiftClient({ credentials: () => new Promise(() => {}), fetch: nshift.fetch, pauseMs: 0, credentialsTimeoutMs: 20 })
  await assert.rejects(hanging.lookup('TT1', '2026-11-23'), (error) => error.code === 'FINLAND_NSHIFT_FAILED')
  // The queue goes on after a hanging key.
  await assert.rejects(hanging.test(), (error) => error.code === 'FINLAND_NSHIFT_FAILED')
  assert.equal(nshift.calls.length, 0)
})

test('M: being away gives STORAGE_UNAVAILABLE, never the original error', async () => {
  const UNAVAILABLE = 'STORAGE_UNAVAILABLE: Finlandsforsendelsers fælles data kan ikke læses lige nu'
  const nshift = fakeNshift()
  const original = Object.assign(new Error(`STORAGE_UNAVAILABLE: ${SECRET}`), { code: 'STORAGE_UNAVAILABLE', secret: SECRET })
  const away = createNshiftClient({ credentials: async () => { throw original }, fetch: nshift.fetch, pauseMs: 0 })
  for (const call of [() => away.lookup('TT1', '2026-11-23'), () => away.test()]) {
    await assert.rejects(call(), (error) => {
      assert.notEqual(error, original)
      assert.equal(error.code, 'STORAGE_UNAVAILABLE')
      assert.equal(error.message, UNAVAILABLE)
      assertNoSecret(error)
      return true
    })
  }
  assert.equal(nshift.calls.length, 0)
})

test('an answer of an odd shape gives FINLAND_NSHIFT_FAILED', async () => {
  const odd = { shipment: { get events() { throw new TypeError(`odd ${SECRET}`) } } }
  const nshift = fakeNshift({ lookup: () => reply(200, [odd]) })
  await assert.rejects(client(nshift).lookup('TT1', '2026-11-23'), (error) => {
    assert.equal(error.code, 'FINLAND_NSHIFT_FAILED')
    assertNoSecret(error)
    return true
  })
})
