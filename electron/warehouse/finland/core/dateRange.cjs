function sapDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function sapDateRange(today, monthsBack = 2) {
  const firstOfTarget = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  const lastDay = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
  const from = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), Math.min(today.getDate(), lastDay));
  return { from: sapDate(from), to: sapDate(today) };
}

module.exports = { sapDateRange };
