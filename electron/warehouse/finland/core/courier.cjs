function normalizeTracking(text) {
  const t = String(text == null ? '' : text).trim().toUpperCase();
  return t.startsWith('JJD') ? t.slice(1) : t;
}

function courierFor(tracking) {
  const t = normalizeTracking(tracking);
  if (/^JD\d{18}$/.test(t)) return 'DHL';
  if (/^00073215\d{12}$/.test(t)) return 'Postnord';
  if (/^00157145\d{12}$/.test(t)) return 'DSV';
  return 'Ukendt';
}

module.exports = { normalizeTracking, courierFor };
