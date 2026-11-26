const { compareParcels } = require('./compare.cjs');

function dayStatus(missing, inSheet) {
  if (!missing.length) return 'full';
  if (!inSheet.length) return 'none';
  return 'partial';
}

function dayOverview(parcels, index, notSentKeys = new Set()) {
  const byDay = new Map();
  for (const p of parcels) {
    if (!p.shippedOn) continue;
    if (!byDay.has(p.shippedOn)) byDay.set(p.shippedOn, []);
    byDay.get(p.shippedOn).push(p);
  }
  return [...byDay.keys()].sort().map((date) => {
    const { toAdd: missing, review, inSheet, notSent } = compareParcels(byDay.get(date), index, null, notSentKeys);
    return {
      date,
      total: missing.length + review.length + inSheet.length + notSent.length,
      missing,
      review,
      inSheet,
      notSent,
      status: dayStatus(missing, inSheet),
    };
  });
}

function defaultDay(days, todayIso) {
  if (!days.length) return null;
  if (days.some((d) => d.date === todayIso)) return todayIso;
  return days[days.length - 1].date;
}

module.exports = { dayOverview, defaultDay };
