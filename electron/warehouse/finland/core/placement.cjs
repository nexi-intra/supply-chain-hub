// Where a day's new rows go in the sheet: after the last row with the same date, else after the
// last row with the nearest earlier date, else at the top. Newer than everything means the bottom (null).
function insertionPoint(rows, date) {
  const dated = rows.filter((r) => r.pickedUp);
  if (!dated.length) return null;
  if (dated.every((r) => r.pickedUp < date)) return null;
  const lastFilledRow = Math.max(...rows.filter((r) => r.delivery || r.pickedUp).map((r) => r.row));

  let anchorDate = dated.some((r) => r.pickedUp === date) ? date : null;
  if (!anchorDate) {
    const earlier = dated.filter((r) => r.pickedUp < date).map((r) => r.pickedUp);
    if (!earlier.length) return { afterRow: Math.min(...rows.map((r) => r.row)) - 1, afterDelivery: '' };
    anchorDate = earlier.reduce((a, b) => (b > a ? b : a));
  }
  const anchor = dated.filter((r) => r.pickedUp === anchorDate).reduce((a, b) => (b.row > a.row ? b : a));
  if (anchor.row >= lastFilledRow) return null;
  return { afterRow: anchor.row, afterDelivery: anchor.delivery };
}

module.exports = { insertionPoint };
