// Suggestions and status for following up a parcel: columns H (Expected), I (Received), J (SLA), L (Comment), M (Terminal).
const { parcelKey, normalizeDelivery, trackingsInCell } = require('./sheetIndex.cjs');
const { leadDays } = require('./leadTimes.cjs');

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);
const isWeekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

function addWorkdays(iso, n) {
  const d = toDate(iso);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) left--;
  }
  return toIso(d);
}

// The agreement's lead-time table (see leadTimes.cjs and plans/nshift-status-design.md).
function expectedSuggestion({ courier, postalCode, country, pickedUp }) {
  if (!pickedUp || (country && String(country).toUpperCase() !== 'FI')) return null;
  const days = leadDays(courier, postalCode);
  return days == null ? null : addWorkdays(pickedUp, days);
}

function slaFor(expected, received) {
  if (!expected || !received) return '';
  return received <= expected ? 'OK' : 'NOK';
}

function receivedChoices(pickedUp) {
  const out = [pickedUp];
  for (let i = 1; i <= 6; i++) out.push(addWorkdays(pickedUp, i));
  return out;
}

function isFollowedUp(f, courier) {
  if (!f || !f.received || !f.sla) return false;
  return courier !== 'Postnord' || !!String(f.terminal || '').trim();
}

function followUpDays(rows) {
  const byDay = new Map();
  for (const r of rows) {
    if (!r.pickedUp || !normalizeDelivery(r.delivery)) continue;
    if (!byDay.has(r.pickedUp)) byDay.set(r.pickedUp, { total: 0, done: 0 });
    const d = byDay.get(r.pickedUp);
    d.total++;
    if (isFollowedUp(r.followUp, r.courier)) d.done++;
  }
  return [...byDay.keys()].sort().map((date) => {
    const { total, done } = byDay.get(date);
    return { date, total, done, status: done === total ? 'done' : done ? 'some' : 'open' };
  });
}

function topComments(rows, n = 6) {
  const counts = new Map();
  for (const r of rows) {
    const c = String(r.followUp?.comment || '').trim();
    if (c) counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([c]) => c);
}

function duplicateKeys(rows) {
  const counts = new Map();
  for (const r of rows) {
    if (!normalizeDelivery(r.delivery)) continue;
    for (const t of new Set(trackingsInCell(r.trackingText))) {
      const k = parcelKey(r.delivery, t);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return new Set([...counts].filter(([, c]) => c > 1).map(([k]) => k));
}

module.exports = { addWorkdays, expectedSuggestion, slaFor, receivedChoices, isFollowedUp, followUpDays, topComments, duplicateKeys };
