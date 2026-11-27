const test = require('node:test')
const assert = require('node:assert/strict')
const { timelineFrom, facts, suggest } = require('./nshiftRules.cjs')

// Anonymized timelines: only times, status ids, texts and places.
const KOEGE = 'KØGE PAKKETERMINAL Køge DNK'
const BRONDBY = 'BRØNDBY TERMINAL Brøndby DNK'
const VANTAA = 'VANTAA Vantaa FIN'
const TURKU = 'TURKU Turku FIN'
const LOCAL = 'KUUSANKOSKI Kuusankoski FIN'

const ev = (at, statusId, place, text = 'TEXT', status = 'Status') => ({ at, statusId, status, text, place })
const timeline = (events, carrier = 'Postnord API') => ({ tracking: 'TT1', carrier, events })
const hoursAfter = (iso, hours) => new Date(Date.parse(iso) + Math.round(hours * 3600000)).toISOString().replace('.000Z', '+00:00')

// Picked up Monday 2026-11-23, expected Wednesday 2026-11-25.
const base = { courier: 'Postnord', pickedUp: '2026-11-23', expected: '2026-11-25' }

test('delivered on time gives Received, SLA OK and the terminal', () => {
  const t = timeline([
    ev('2026-11-23T12:00:00+00:00', 4004, 'PostNord'),
    ev('2026-11-23T20:00:00+00:00', 2003, KOEGE),
    ev('2026-11-24T02:00:00+00:00', 2008, KOEGE),
    ev('2026-11-24T10:00:00+00:00', 2003, VANTAA),
    ev('2026-11-24T20:00:00+00:00', 2008, VANTAA),
    ev('2026-11-25T06:00:00+00:00', 2001, LOCAL),
    ev('2026-11-25T11:00:00+00:00', 3000, LOCAL)
  ])
  assert.deepEqual(suggest({ ...base, timeline: t }), {
    received: '2026-11-25', sla: 'OK', terminal: 'Vantaa', comment: null,
    firstAttempt: '2026-11-25', delivered: '2026-11-25'
  })
  assert.deepEqual(facts(t, '2026-11-23'), {
    firstAttempt: '2026-11-25', delivered: '2026-11-25', terminal: 'Vantaa', koegeHours: 14,
    viaBrondby: false, terminalHours: 20, firstScanWorkdays: 0
  })
})

test('first attempt within Expected but delivered later gives SLA OK and the attempt comment', () => {
  const t = timeline([
    ev('2026-11-23T20:00:00+00:00', 2003, KOEGE),
    ev('2026-11-24T10:00:00+00:00', 2003, VANTAA),
    ev('2026-11-25T09:00:00+00:00', 5006, LOCAL),
    ev('2026-11-27T10:00:00+00:00', 3000, LOCAL)
  ])
  const s = suggest({ ...base, timeline: t })
  assert.equal(s.received, '2026-11-27')
  assert.equal(s.firstAttempt, '2026-11-25')
  assert.equal(s.sla, 'OK')
  assert.equal(s.comment, '1st attempt within SLA (25-11)')
})

test('late delivery without an attempt gives NOK', () => {
  const t = timeline([
    ev('2026-11-23T20:00:00+00:00', 2003, KOEGE),
    ev('2026-11-24T10:00:00+00:00', 2003, VANTAA),
    ev('2026-11-26T10:00:00+00:00', 3000, LOCAL)
  ])
  const s = suggest({ ...base, timeline: t })
  assert.equal(s.received, '2026-11-26')
  assert.equal(s.sla, 'NOK')
  assert.equal(s.comment, null)
})

test('no delivery gives no Received and no SLA', () => {
  const t = timeline([
    ev('2026-11-23T20:00:00+00:00', 2003, KOEGE),
    ev('2026-11-24T10:00:00+00:00', 2003, VANTAA),
    ev('2026-11-25T06:00:00+00:00', 2001, LOCAL)
  ])
  const s = suggest({ ...base, timeline: t })
  assert.equal(s.received, null)
  assert.equal(s.sla, null)
  assert.equal(s.firstAttempt, null)
  assert.equal(s.delivered, null)
  assert.equal(suggest({ ...base, timeline: null }).sla, null)
})

test('more than 48 hours in a Finnish terminal gives the delay comment', () => {
  const t = timeline([
    ev('2026-11-23T20:00:00+00:00', 2003, KOEGE),
    ev('2026-11-24T10:00:00+00:00', 2003, VANTAA),
    ev('2026-11-25T10:00:00+00:00', 4000, 'PostNord'),
    ev('2026-11-26T11:00:00+00:00', 2001, LOCAL),
    ev('2026-11-26T12:00:00+00:00', 3000, LOCAL)
  ])
  assert.equal(facts(t, '2026-11-23').terminalHours, 49)
  const s = suggest({ ...base, timeline: t })
  assert.equal(s.terminal, 'Vantaa')
  assert.equal(s.comment, 'Delay Finland, Vanta term')
  assert.equal(s.sla, 'NOK')
  const terminal = (leftAt) => timeline([
    ev('2026-11-23T20:00:00+00:00', 2003, KOEGE),
    ev('2026-11-24T10:00:00+00:00', 2003, VANTAA),
    ev(leftAt, 2001, LOCAL)
  ])
  // Exactly 48.0 hours is not over 48.
  assert.equal(facts(terminal('2026-11-26T10:00:00+00:00'), base.pickedUp).terminalHours, 48)
  assert.equal(suggest({ ...base, timeline: terminal('2026-11-26T10:00:00+00:00') }).comment, null)
  // 48 hours and 1 minute rounds to 48.0 but is over 48.
  assert.equal(facts(terminal('2026-11-26T10:01:00+00:00'), base.pickedUp).terminalHours, 48)
  assert.equal(suggest({ ...base, timeline: terminal('2026-11-26T10:01:00+00:00') }).comment, 'Delay Finland, Vanta term')
})

const koege = (hours, extra = []) => timeline([
  ev('2026-11-23T20:00:00+00:00', 2003, KOEGE),
  ev('2026-11-24T02:00:00+00:00', 2008, KOEGE),
  ...extra,
  ev(hoursAfter('2026-11-23T20:00:00+00:00', hours), 2003, VANTAA),
  ev(hoursAfter('2026-11-23T20:00:00+00:00', hours + 10), 3000, LOCAL)
])

test('45 to 66 hours in Køge gives one extra day', () => {
  for (const hours of [45, 50, 66]) {
    assert.equal(facts(koege(hours), base.pickedUp).koegeHours, hours)
    assert.equal(suggest({ ...base, timeline: koege(hours) }).comment, '1 ekstra day in Køge')
  }
  assert.equal(suggest({ ...base, timeline: koege(44) }).comment, null)
  // The limits are compared on the exact time, not the rounded hours: 2 minutes short of 45 rounds to 45.0.
  assert.equal(facts(koege(45 - 2 / 60), base.pickedUp).koegeHours, 45)
  assert.equal(suggest({ ...base, timeline: koege(45 - 2 / 60) }).comment, null)
})

test('a booking confirmation does not start the Køge time or count as Brøndby', () => {
  const booked = (place) => [ev('2026-11-21T12:00:00+00:00', 4004, place)]
  // Booked at Køge two days before the first real Køge scan: the Køge time is still 10 hours.
  assert.equal(facts(koege(10, booked(KOEGE)), base.pickedUp).koegeHours, 10)
  assert.equal(suggest({ ...base, timeline: koege(10, booked(KOEGE)) }).comment, null)
  assert.equal(facts(koege(10, booked(BRONDBY)), base.pickedUp).viaBrondby, false)
  assert.equal(suggest({ ...base, timeline: koege(10, booked(BRONDBY)) }).comment, null)
})

test('more than 66 hours in Køge or via Brøndby gives stuck', () => {
  assert.equal(suggest({ ...base, timeline: koege(67) }).comment, 'stuck in Køge')
  // 66 hours and 2 minutes rounds to 66.0 but is over 66.
  assert.equal(facts(koege(66 + 2 / 60), base.pickedUp).koegeHours, 66)
  assert.equal(suggest({ ...base, timeline: koege(66 + 2 / 60) }).comment, 'stuck in Køge')
  const brondby = [ev('2026-11-23T18:00:00+00:00', 2003, BRONDBY)]
  const viaBrondby = koege(10, brondby)
  assert.deepEqual([facts(viaBrondby, base.pickedUp).viaBrondby, facts(viaBrondby, base.pickedUp).koegeHours], [true, 10])
  assert.equal(suggest({ ...base, timeline: viaBrondby }).comment, 'stuck in Køge')
  // Brøndby with 50 hours in Køge is stuck, not one extra day.
  assert.equal(suggest({ ...base, timeline: koege(50, brondby) }).comment, 'stuck in Køge')
})

test('a first scan two workdays late gives Forgotten in warehouse and SLA OK', () => {
  // Picked up Friday 2026-11-20; first scan Tuesday 2026-11-24 is two workdays later.
  const t = timeline([
    ev('2026-11-20T12:00:00+00:00', 4004, 'PostNord'),
    ev('2026-11-24T08:00:00+00:00', 2003, KOEGE),
    ev('2026-11-24T20:00:00+00:00', 2003, VANTAA),
    ev('2026-11-26T09:00:00+00:00', 3000, LOCAL)
  ])
  assert.equal(facts(t, '2026-11-20').firstScanWorkdays, 2)
  const s = suggest({ courier: 'Postnord', pickedUp: '2026-11-20', expected: '2026-11-24', timeline: t })
  assert.equal(s.comment, 'Forgotten in warehouse')
  assert.equal(s.sla, 'OK')
  // A first scan on Monday is one workday after Friday: not forgotten.
  const monday = timeline([ev('2026-11-23T08:00:00+00:00', 2003, KOEGE), ev('2026-11-24T09:00:00+00:00', 3000, LOCAL)])
  assert.equal(facts(monday, '2026-11-20').firstScanWorkdays, 1)
  assert.equal(suggest({ courier: 'Postnord', pickedUp: '2026-11-20', expected: '2026-11-24', timeline: monday }).comment, null)
})

test('several comments are joined in the fixed order', () => {
  // Picked up Monday 2026-11-16, first scan Wednesday (2 workdays), 72 h in Køge, 50 h in Turku.
  const t = timeline([
    ev('2026-11-18T08:00:00+00:00', 2003, KOEGE),
    ev('2026-11-21T08:00:00+00:00', 2003, TURKU),
    ev('2026-11-23T10:00:00+00:00', 2001, LOCAL),
    ev('2026-11-24T10:00:00+00:00', 6000, LOCAL, 'The recipients goods reception is closed today'),
    ev('2026-11-30T10:00:00+00:00', 3000, LOCAL)
  ])
  const s = suggest({ courier: 'Postnord', pickedUp: '2026-11-16', expected: '2026-11-25', timeline: t })
  assert.equal(s.comment, 'Forgotten in warehouse, stuck in Køge, Delay Finland, Turku term, 1st attempt within SLA (24-11)')
  assert.equal(s.terminal, 'Turku')
  assert.equal(s.sla, 'OK')
  assert.equal(s.received, '2026-11-30')
})

test('Køge rules do not apply to DHL', () => {
  const t = timeline([
    ev('2026-11-25T08:00:00+00:00', 2003, KOEGE),
    ev('2026-11-25T09:00:00+00:00', 2003, BRONDBY),
    ev('2026-11-28T08:00:00+00:00', 2003, VANTAA),
    ev('2026-11-30T09:00:00+00:00', 6003, LOCAL),
    ev('2026-12-02T10:00:00+00:00', 3000, LOCAL)
  ], 'MyDHL Express')
  const s = suggest({ courier: 'DHL', pickedUp: '2026-11-23', expected: '2026-11-30', timeline: t })
  assert.equal(s.terminal, 'DHL', 'DHL is always DHL in Terminal, whatever terminal the timeline passes')
  assert.equal(s.comment, '1st attempt within SLA (30-11)')
  assert.equal(s.sla, 'OK')
})

test('days are counted in Helsinki time', () => {
  const t = timeline([ev('2026-11-23T20:00:00+00:00', 2003, KOEGE), ev('2026-11-25T22:30:00+00:00', 3000, LOCAL)])
  const s = suggest({ ...base, timeline: t })
  assert.equal(s.received, '2026-11-26')
  assert.equal(s.delivered, '2026-11-26')
  assert.equal(s.sla, 'NOK')
})

const raw = (at, id, address, text = 'TEXT') => ({
  date: at, normalizedStatusId: id, normalizedStatusName: `Status ${id}`, configurationName: text, addresses: address ? [address] : []
})

test('PostNord uses only the package with the looked-up number', () => {
  const element = {
    shipment: {
      carrierName: 'Postnord API',
      events: [raw('2026-11-23T10:00:00+00:00', 1000, null, 'CREATED')],
      lines: [{
        packages: [
          {
            number: 'TT1',
            events: [
              raw('2026-11-24T10:00:00+00:00', 2003, { name1: 'VANTAA', city: 'Vantaa', countryCode: 'FIN' }, 'ARRIVED'),
              raw('2026-11-23T20:00:00+00:00', 2003, { name1: 'KØGE PAKKETERMINAL', city: 'Køge', countryCode: 'DNK', street1: 'Street 1' }, 'ARRIVED'),
              raw('2026-11-25T10:00:00+00:00', 2000, { name1: 'PostNord' }, 'IN TRANSIT')
            ]
          },
          { number: 'TT2', events: [raw('2026-11-24T08:00:00+00:00', 3000, { name1: 'OTHER', city: 'Other', countryCode: 'FIN' })] }
        ]
      }]
    },
    additionalInformation: {}
  }
  assert.deepEqual(timelineFrom(element, 'TT1'), {
    tracking: 'TT1',
    carrier: 'Postnord API',
    events: [
      { at: '2026-11-23T20:00:00+00:00', statusId: 2003, status: 'Status 2003', text: 'ARRIVED', place: KOEGE },
      { at: '2026-11-24T10:00:00+00:00', statusId: 2003, status: 'Status 2003', text: 'ARRIVED', place: VANTAA },
      { at: '2026-11-25T10:00:00+00:00', statusId: 2000, status: 'Status 2000', text: 'IN TRANSIT', place: 'PostNord' }
    ]
  })
})

test('a delivery names only city and country, never the recipient', () => {
  const element = {
    shipment: {
      carrierName: 'Postnord API',
      events: [
        raw('2026-11-23T20:00:00+00:00', 2003, { name1: 'KØGE PAKKETERMINAL', city: 'Køge', countryCode: 'DNK' }, 'ARRIVED'),
        raw('2026-11-24T10:00:00+00:00', 3000, { name1: 'Matti Meikäläinen', city: 'Vantaa', countryCode: 'FIN' }, 'DELIVERED')
      ]
    },
    additionalInformation: {}
  }
  const t = timelineFrom(element, 'TT1')
  assert.deepEqual(t.events.map((e) => e.place), [KOEGE, 'Vantaa FIN'])
  assert.ok(!JSON.stringify(t).includes('Matti'))
  // Rules that match on the city still see it.
  const f = facts(t, '2026-11-23')
  assert.equal(f.terminal, 'Vantaa')
  assert.equal(f.koegeHours, 14)
})

test("nShift's own events below 2000 are ignored", () => {
  const element = {
    shipment: {
      carrierName: 'MyDHL Express',
      events: [
        raw('2026-11-23T09:00:00+00:00', 1000, null, 'CREATED'),
        raw('2026-11-23T09:01:00+00:00', 1001, null, 'TRANSMITTED'),
        raw('2026-11-23T18:00:00+00:00', 2000, { name1: 'HUB', city: 'Hub', countryCode: 'DNK' }, 'IN TRANSIT'),
        raw('2026-11-24T11:00:00+00:00', 3000, { name1: 'LOCAL', city: 'Local', countryCode: 'FIN' }, 'DELIVERED')
      ],
      lines: [{ packages: [{ number: 'PIECE1', events: [raw('2026-11-23T09:02:00+00:00', 1500, null, 'INTERNAL')] }] }]
    },
    additionalInformation: {}
  }
  const t = timelineFrom(element, 'TT1')
  assert.equal(t.carrier, 'MyDHL Express')
  assert.deepEqual(t.events.map((e) => e.statusId), [2000, 3000])
  assert.equal(timelineFrom(null, 'TT1'), null)
  assert.equal(timelineFrom({ additionalInformation: {} }, 'TT1'), null)
})
