const { courierFor } = require('./courier.cjs');
const { parcelKey, normalizeDelivery } = require('./sheetIndex.cjs');

const REASONS = {
  'nyt-tt': 'Levering står i arket med et andet T&T',
  'ukendt-courier': 'Ukendt courier',
  'mangler-tt': 'Mangler T&T',
};

// notSent holds keys the user marked as never sent: they are never written, wherever they would have landed.
function compareParcels(parcels, index, shippedFrom = null, notSent = new Set()) {
  const toAdd = [];
  const review = [];
  const inSheet = [];
  const notSentList = [];
  let notShipped = 0;
  let beforeStart = 0;
  const seen = new Set();
  for (const parcel of parcels) {
    const key = parcelKey(parcel.delivery, parcel.tracking);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!parcel.shippedOn) notShipped++;
    else if (shippedFrom && parcel.shippedOn < shippedFrom) beforeStart++;
    else if (!parcel.tracking.trim()) review.push({ parcel, reason: 'mangler-tt' });
    else if (notSent.has(key)) notSentList.push({ parcel, inSheet: index.keys.has(key) });
    else if (index.keys.has(key)) inSheet.push(parcel);
    else if (index.deliveries.has(normalizeDelivery(parcel.delivery))) review.push({ parcel, reason: 'nyt-tt' });
    else if (courierFor(parcel.tracking) === 'Ukendt') review.push({ parcel, reason: 'ukendt-courier' });
    else toAdd.push(parcel);
  }
  return { toAdd, review, inSheet, notSent: notSentList, alreadyInSheet: inSheet.length, notShipped, beforeStart };
}

module.exports = { compareParcels, REASONS };
