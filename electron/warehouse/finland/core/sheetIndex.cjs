const { normalizeTracking } = require('./courier.cjs');

const TRACKING_IN_CELL = /J?J?D\d{18}|\d{20}/gi;

function normalizeDelivery(delivery) {
  return String(delivery == null ? '' : delivery).trim().replace(/\.0+$/, '').replace(/^0+/, '');
}

function parcelKey(delivery, tracking) {
  return `${normalizeDelivery(delivery)}|${normalizeTracking(tracking)}`;
}

function trackingsInCell(text) {
  return (String(text || '').match(TRACKING_IN_CELL) || []).map(normalizeTracking);
}

function buildSheetIndex(rows) {
  const keys = new Set();
  const deliveries = new Set();
  for (const r of rows) {
    const delivery = normalizeDelivery(r.delivery);
    if (!delivery) continue;
    deliveries.add(delivery);
    for (const tracking of trackingsInCell(r.trackingText)) {
      keys.add(parcelKey(delivery, tracking));
    }
  }
  return { keys, deliveries };
}

module.exports = { buildSheetIndex, parcelKey, normalizeDelivery, trackingsInCell };
