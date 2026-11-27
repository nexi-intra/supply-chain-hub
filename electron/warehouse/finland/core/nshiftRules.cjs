// Rules that turn an nShift timeline into suggestions for Received, SLA, Terminal and Comment.
// Definitions: plans/nshift-status-design.md, section "Regler". Pure module, no I/O.

const ATTEMPT_IDS = [3000, 2002, 5006, 6000, 6003]
const DELIVERED_IDS = [3000, 2002]
const BOOKING_CONFIRMED_ID = 4004
const OWN_EVENTS_BELOW = 2000

const KOEGE = /k(ø|oe)ge/i
const BRONDBY = /br(ø|oe|o)ndby/i
const TERMINALS = [{ name: 'Vantaa', re: /\bvantaa\b/i }, { name: 'Turku', re: /\bturku\b/i }]
const TERMINAL_COMMENT = { Vantaa: 'Delay Finland, Vanta term', Turku: 'Delay Finland, Turku term' }

const clean = (s) => String(s == null ? '' : s).trim()
const sameNumber = (a, b) => clean(a).replace(/\s+/g, '').toUpperCase() === clean(b).replace(/\s+/g, '').toUpperCase()
const time = (e) => Date.parse(e.at)
const byTime = (a, b) => time(a) - time(b)
const hoursBetween = (a, b) => Math.round((time(b) - time(a)) / 360000) / 10

const dayIn = (at, timeZone) => new Date(at).toLocaleDateString('sv-SE', { timeZone })
const helsinkiDay = (at) => dayIn(at, 'Europe/Helsinki')
// The first scan happens in Denmark, so its day is compared with the pickup day in Danish time.
const copenhagenDay = (at) => dayIn(at, 'Europe/Copenhagen')

// A concrete place names a location, not just the carrier (e.g. "PostNord").
const isConcrete = (place) => clean(place) !== '' && !/^(postnord|dhl)\b/i.test(clean(place))

const isPostnordCourier = (courier) => /^postnord$/i.test(clean(courier))

function placeOf(raw) {
  const a = Array.isArray(raw.addresses) && raw.addresses[0]
  if (!a) return ''
  return [a.name1, a.city, a.countryCode].map(clean).filter(Boolean).join(' ')
}

function toEvent(raw) {
  return {
    at: clean(raw.date),
    statusId: Number(raw.normalizedStatusId),
    status: clean(raw.normalizedStatusName),
    text: clean(raw.configurationName),
    place: placeOf(raw)
  }
}

// One element from the Aggregated/ByBarcode answer ({ shipment, additionalInformation }) to a small timeline.
// Shipment events (nShift and DHL) plus the events of the package whose number is the looked-up T&T (PostNord).
function timelineFrom(element, tracking) {
  const shipment = element && element.shipment
  if (!shipment || typeof shipment !== 'object') return null
  const raws = [...(Array.isArray(shipment.events) ? shipment.events : [])]
  for (const line of Array.isArray(shipment.lines) ? shipment.lines : []) {
    for (const pkg of Array.isArray(line && line.packages) ? line.packages : []) {
      if (pkg && sameNumber(pkg.number, tracking) && Array.isArray(pkg.events)) raws.push(...pkg.events)
    }
  }
  const seen = new Set()
  const events = []
  for (const raw of raws) {
    if (!raw || !(Number(raw.normalizedStatusId) >= OWN_EVENTS_BELOW)) continue
    const e = toEvent(raw)
    if (Number.isNaN(time(e))) continue
    const key = JSON.stringify(e)
    if (seen.has(key)) continue
    seen.add(key)
    events.push(e)
  }
  events.sort(byTime)
  return { tracking: clean(tracking), carrier: clean(shipment.carrierName), events }
}

// Hours from the first event at a place to the first later event at another concrete place.
function hoursAt(events, isHere) {
  const start = events.findIndex((e) => isHere(e.place))
  if (start < 0) return null
  const end = events.slice(start + 1).find((e) => isConcrete(e.place) && !isHere(e.place))
  return end ? hoursBetween(events[start], end) : null
}

function workdaysBetween(fromIso, toIso) {
  const d = new Date(`${fromIso}T00:00:00Z`)
  const end = new Date(`${toIso}T00:00:00Z`)
  let n = 0
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++
  }
  return n
}

function facts(timeline, pickedUp) {
  const events = [...((timeline && timeline.events) || [])].sort(byTime)
  const first = (ids) => events.find((e) => ids.includes(e.statusId))
  const attempt = first(ATTEMPT_IDS)
  const delivered = first(DELIVERED_IDS)
  let terminal = null
  for (const e of events) {
    const hit = TERMINALS.find((t) => t.re.test(e.place))
    if (hit) { terminal = hit; break }
  }
  const firstScan = events.find((e) => isConcrete(e.place) && e.statusId !== BOOKING_CONFIRMED_ID)
  return {
    firstAttempt: attempt ? helsinkiDay(attempt.at) : null,
    delivered: delivered ? helsinkiDay(delivered.at) : null,
    terminal: terminal ? terminal.name : null,
    koegeHours: hoursAt(events, (p) => KOEGE.test(p)),
    viaBrondby: events.some((e) => BRONDBY.test(e.place)),
    terminalHours: terminal ? hoursAt(events, (p) => terminal.re.test(p)) : null,
    firstScanWorkdays: firstScan && pickedUp ? workdaysBetween(pickedUp, copenhagenDay(firstScan.at)) : null
  }
}

const ddmm = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`

function suggest({ timeline, courier, pickedUp, expected }) {
  const f = facts(timeline, pickedUp)
  const postnord = isPostnordCourier(courier)
  const comments = []
  const forgotten = postnord && f.firstScanWorkdays != null && f.firstScanWorkdays >= 2
  if (forgotten) comments.push('Forgotten in warehouse')
  if (postnord && ((f.koegeHours != null && f.koegeHours > 66) || f.viaBrondby)) comments.push('stuck in Køge')
  else if (postnord && f.koegeHours != null && f.koegeHours >= 45) comments.push('1 ekstra day in Køge')
  if (postnord && f.terminal && f.terminalHours != null && f.terminalHours > 48) comments.push(TERMINAL_COMMENT[f.terminal])
  const attemptInTime = !!(expected && f.firstAttempt && f.firstAttempt <= expected)
  if (attemptInTime && f.delivered && f.delivered > expected) comments.push(`1st attempt within SLA (${ddmm(f.firstAttempt)})`)

  let sla = null
  if (expected && (f.delivered || f.firstAttempt)) {
    if (forgotten || attemptInTime) sla = 'OK'
    else sla = f.delivered && f.delivered <= expected ? 'OK' : 'NOK'
  }
  return {
    received: f.delivered,
    sla,
    terminal: postnord ? f.terminal : null,
    comment: comments.length ? comments.join(', ') : null,
    firstAttempt: f.firstAttempt,
    delivered: f.delivered
  }
}

module.exports = { timelineFrom, facts, suggest }
