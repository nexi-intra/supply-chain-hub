const { courierFor, normalizeTracking } = require('./courier.cjs');

function sheetPostalCode(code) {
  const t = String(code || '').trim();
  return /^\d+$/.test(t) ? Number(t) : t;
}

function toSheetRows(parcels) {
  return parcels
    .map((p) => ({
      delivery: Number(p.delivery),
      orderType: p.orderType.trim(),
      postalCode: sheetPostalCode(p.postalCode),
      courier: courierFor(p.tracking),
      tracking: normalizeTracking(p.tracking),
      pickedUp: p.shippedOn,
    }))
    .sort((a, b) => a.pickedUp.localeCompare(b.pickedUp) || a.delivery - b.delivery || a.tracking.localeCompare(b.tracking));
}

module.exports = { toSheetRows };
