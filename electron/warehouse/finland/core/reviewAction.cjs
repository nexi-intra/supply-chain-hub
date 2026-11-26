// What the window can do with a parcel whose delivery is in the sheet with a different T&T.
const { courierFor, normalizeTracking } = require('./courier.cjs');
const { normalizeDelivery, trackingsInCell } = require('./sheetIndex.cjs');

function reviewAction(parcel, parcels, sheetRows) {
  const delivery = normalizeDelivery(parcel.delivery);
  const rowsD = sheetRows
    .filter((r) => normalizeDelivery(r.delivery) === delivery)
    .map((r) => ({ row: r.row, numbers: trackingsInCell(r.trackingText) }));
  const manual = { kind: 'manual', rows: rowsD.map((r) => r.row) };
  const newTracking = normalizeTracking(parcel.tracking);
  const courier = courierFor(newTracking);
  if (!rowsD.length || courier === 'Ukendt') return manual;

  const sapNumbers = new Set(parcels.filter((p) => normalizeDelivery(p.delivery) === delivery).map((p) => normalizeTracking(p.tracking)));
  const inSheet = new Set(rowsD.flatMap((r) => r.numbers));
  const missingInSheet = [...sapNumbers].filter((n) => !inSheet.has(n));
  // A row counts as unknown if its T&T is empty or holds any number SAP does not have on the delivery.
  const unknownRows = rowsD.filter((r) => !r.numbers.length || r.numbers.some((n) => !sapNumbers.has(n)));
  const counts = new Map();
  rowsD.forEach((r) => new Set(r.numbers).forEach((n) => counts.set(n, (counts.get(n) || 0) + 1)));
  const duplicated = [...counts].filter(([, c]) => c > 1);

  if (!unknownRows.length && !duplicated.length) {
    const last = rowsD.reduce((a, b) => (b.row > a.row ? b : a));
    return { kind: 'add', afterRow: last.row, afterDelivery: delivery };
  }
  if (missingInSheet.length !== 1 || missingInSheet[0] !== newTracking) return manual;
  if (!unknownRows.length && duplicated.length === 1 && duplicated[0][1] === 2) {
    const [oldTracking] = duplicated[0];
    const target = rowsD.filter((r) => r.numbers.includes(oldTracking)).reduce((a, b) => (b.row > a.row ? b : a));
    // Only a cell holding just the duplicated number may be overwritten.
    if (target.numbers.length !== 1) return manual;
    return { kind: 'replace-duplicate', row: target.row, oldTracking, newTracking, courier };
  }
  if (rowsD.length === 1 && unknownRows.length === 1 && unknownRows[0].numbers.length === 1) {
    return { kind: 'replace-unknown', row: rowsD[0].row, oldTracking: unknownRows[0].numbers[0], newTracking, courier };
  }
  return manual;
}

module.exports = { reviewAction };
