// Which follow-up cells can be written, without overwriting what someone else has changed since it was read.
const { parcelKey, normalizeDelivery, trackingsInCell } = require('./sheetIndex.cjs');
const { slaFor } = require('./followUp.cjs');

const FIELDS = ['expected', 'received', 'sla', 'comment', 'terminal'];
const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

function rowsByKey(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!normalizeDelivery(r.delivery)) continue;
    for (const t of new Set(trackingsInCell(r.trackingText))) {
      const k = parcelKey(r.delivery, t);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
  }
  return map;
}

function planWrites(drafts, rows) {
  const byKey = rowsByKey(rows);
  const writes = [];
  const done = [];
  const conflicts = [];
  const notFound = [];
  for (const d of drafts) {
    const key = parcelKey(d.delivery, d.tracking);
    const found = byKey.get(key) || [];
    if (found.length !== 1) {
      notFound.push(key);
      continue;
    }
    const row = found[0];
    const cells = {};
    const expect = {};
    let conflict = false;
    for (const field of FIELDS) {
      if (!(field in (d.fields || {}))) continue;
      const wanted = d.fields[field];
      const current = row.followUp?.[field] ?? '';
      if (same(current, wanted)) continue;
      if (same(current, d.original?.[field])) {
        cells[field] = wanted;
        expect[field] = String(current).trim();
      } else {
        conflict = true;
        conflicts.push({ key, field, original: d.original?.[field] ?? '', current, wanted });
      }
    }
    // A parcel is written whole or not at all: SLA depends on the dates, so a half write could disagree with itself.
    if (conflict) continue;
    if (Object.keys(cells).length) writes.push({ row: row.row, delivery: normalizeDelivery(d.delivery), tracking: d.tracking, cells, expect });
    else done.push(key);
  }
  return { writes, done, conflicts, notFound };
}

function resolveDraft(draft, conflict, choice) {
  const next = { ...draft, fields: { ...draft.fields }, original: { ...draft.original, [conflict.field]: conflict.current } };
  if (choice === 'sheet') {
    delete next.fields[conflict.field];
    if ((conflict.field === 'expected' || conflict.field === 'received') && !draft.slaManual) {
      const now = { ...next.original, ...next.fields };
      const sla = slaFor(now.expected, now.received);
      if (same(sla, next.original.sla)) delete next.fields.sla;
      else next.fields.sla = sla;
    }
  }
  return Object.keys(next.fields).length ? next : null;
}

// Adds what the user touched now to the parcel's draft. "original" is what the sheet held when editing
// began (the form's base for a new draft), so a later change by someone else is seen as a conflict.
function mergeDraft({ existing, base, wanted, slaManual, delivery, tracking, pickedUp }) {
  const original = existing ? existing.original : { ...base };
  const fields = existing ? { ...existing.fields } : {};
  for (const f of Object.keys(wanted)) {
    if (!FIELDS.includes(f)) continue;
    if (same(wanted[f], original[f])) delete fields[f];
    else fields[f] = String(wanted[f]).trim();
  }
  if (!Object.keys(fields).length) return null;
  return { delivery, tracking, pickedUp, fields, original, slaManual: !!slaManual };
}

module.exports = { planWrites, resolveDraft, mergeDraft, FIELDS };
