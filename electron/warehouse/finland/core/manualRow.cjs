// A row typed in by hand (e.g. DSV, which is not in SAP): checked against the rules and the sheet before it is written.
const { courierFor, normalizeTracking } = require('./courier.cjs');
const { normalizeDelivery, trackingsInCell } = require('./sheetIndex.cjs');

const COURIERS = ['DSV', 'Postnord', 'DHL'];
const NAMES = { DSV: 'DSV', Postnord: 'PostNord', DHL: 'DHL' };
const pad = (n) => String(n).padStart(2, '0');

function checkManualRow(input, sheetRows, today) {
  const errors = {};
  const delivery = String(input.delivery ?? '').trim();
  const orderType = String(input.orderType ?? '').trim().toUpperCase();
  const postal = String(input.postalCode ?? '').trim();
  const courier = String(input.courier ?? '');
  const tracking = normalizeTracking(String(input.tracking ?? '').replace(/\s+/g, ''));
  const pickedUp = String(input.pickedUp ?? '');
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  if (!delivery) errors.delivery = 'Skriv leveringsnummeret.';
  else if (!/^\d{1,12}$/.test(delivery)) errors.delivery = 'Leveringsnummeret må kun have cifre.';
  else if (!normalizeDelivery(delivery)) errors.delivery = 'Leveringsnummeret kan ikke kun være nuller.';
  if (orderType.length > 10) errors.orderType = 'Order type må højst have 10 tegn.';
  else if (!/^[A-Z0-9]*$/.test(orderType)) errors.orderType = 'Order type må kun have bogstaver og cifre, fx ZRO.';
  if (!postal) errors.postalCode = 'Skriv postnummeret.';
  else if (postal.length > 12) errors.postalCode = 'Postnummeret er for langt.';
  if (!COURIERS.includes(courier)) errors.courier = 'Vælg DSV, PostNord eller DHL.';

  if (!tracking) errors.tracking = 'Skriv T&T-nummeret.';
  else if (!/^JD\d{18}$/.test(tracking) && !/^\d{20}$/.test(tracking)) {
    errors.tracking = 'T&T skal være 20 cifre (DSV og PostNord) eller JD og 18 cifre (DHL).';
  } else if (!errors.courier) {
    const byPattern = courierFor(tracking);
    if (byPattern !== 'Ukendt' && byPattern !== courier) errors.courier = `Nummeret er et ${NAMES[byPattern]}-nummer. Vælg ${NAMES[byPattern]}.`;
    if (byPattern === 'Ukendt' && courier === 'DHL') errors.courier = 'Et DHL-nummer starter med JD. Vælg DSV eller PostNord.';
  }

  const realDate = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso; };
  if (!pickedUp) errors.pickedUp = 'Vælg datoen for afhentning.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(pickedUp) || !realDate(pickedUp)) errors.pickedUp = 'Datoen findes ikke.';
  else if (pickedUp > todayIso) errors.pickedUp = 'Datoen må ikke ligge efter i dag.';

  if (!errors.tracking && !errors.delivery) {
    const wanted = normalizeDelivery(delivery);
    for (const r of sheetRows) {
      if (!trackingsInCell(r.trackingText).includes(tracking)) continue;
      const other = normalizeDelivery(r.delivery);
      errors.tracking = other === wanted
        ? `Står allerede i række ${r.row}.`
        : `T&T står allerede på levering ${other} i række ${r.row}.`;
      break;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    row: {
      delivery: Number(normalizeDelivery(delivery)),
      orderType,
      postalCode: /^\d+$/.test(postal) ? Number(postal) : postal,
      courier,
      tracking,
      pickedUp,
    },
  };
}

module.exports = { checkManualRow, COURIERS };
