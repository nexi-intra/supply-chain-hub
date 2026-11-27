// Working days from pickup to expected delivery in Finland, per the agreement with PostNord and DHL.
// Rows marked "forslag" in plans/nshift-status-design.md fill gaps from colleague practice and await confirmation.
const LEAD_TIMES = [
  { from: 100, to: 2990, Postnord: 2, DHL: 1 },
  { from: 3000, to: 4990, Postnord: 2, DHL: 1 },
  { from: 5000, to: 12999, Postnord: 2, DHL: 1 },
  { from: 13000, to: 16999, Postnord: 2, DHL: 1 },
  { from: 17000, to: 19999, Postnord: 2, DHL: 1 },
  { from: 20000, to: 25999, Postnord: 2, DHL: 1 },
  { from: 22000, to: 22999, Postnord: 3, DHL: 2 },
  { from: 26000, to: 27999, Postnord: 2, DHL: 1 },
  { from: 28000, to: 32999, Postnord: 2, DHL: 1 },
  { from: 33000, to: 39999, Postnord: 2, DHL: 1 },
  { from: 40000, to: 58999, Postnord: 2, DHL: 2 },
  { from: 59000, to: 59999, Postnord: 2, DHL: 2 },
  { from: 60000, to: 69999, Postnord: 2, DHL: 2 },
  { from: 70000, to: 79999, Postnord: 3, DHL: 2 },
  { from: 80000, to: 92999, Postnord: 3, DHL: 2 },
  { from: 93000, to: 94999, Postnord: 3, DHL: 2 },
  { from: 95000, to: 99999, Postnord: 4, DHL: 3 },
]

const COURIERS = ['Postnord', 'DHL']

// Postal codes often lose leading zeros in the sheet, so they are padded to 5 digits.
function leadDays(courier, postalCode) {
  if (!COURIERS.includes(courier)) return null
  const code = String(postalCode ?? '').trim()
  if (!/^\d{1,5}$/.test(code)) return null
  const n = Number(code.padStart(5, '0'))
  let best = null
  for (const r of LEAD_TIMES) {
    if (n < r.from || n > r.to) continue
    if (!best || r.to - r.from < best.to - best.from) best = r
  }
  return best ? best[courier] : null
}

module.exports = { LEAD_TIMES, leadDays }
