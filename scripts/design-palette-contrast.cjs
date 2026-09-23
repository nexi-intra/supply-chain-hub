// Engangs-regnestykke: hvilke farver i medarbejderpaletten kan ikke baere
// laesbar tekst (WCAG AA, 4.5:1), og hvor lidt skal lysheden aendres for at
// de kan? Hue og chroma roeres ikke - farven skal stadig vaere "den samme".
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'employeeColors.ts'), 'utf8')
const entries = [...src.matchAll(/bg: 'oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)'.*?name: '([^']+)'/g)]
  .map(m => ({ L: +m[1], C: +m[2], H: +m[3], name: m[4] }))

function luminance(L, C, H) {
  const rad = (H * Math.PI) / 180
  const a = C * Math.cos(rad)
  const b = C * Math.sin(rad)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  const clamp = x => Math.min(1, Math.max(0, x))
  return 0.2126 * clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
    + 0.7152 * clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
    + 0.0722 * clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
}
const BLACK = luminance(0.14, 0.03, 274)
const WHITE = luminance(0.99, 0, 0)
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const best = (L, C, H) => {
  const bg = luminance(L, C, H)
  return Math.max(ratio(bg, BLACK), ratio(bg, WHITE))
}

for (const e of entries) {
  const now = best(e.L, e.C, e.H)
  if (now >= 4.5) { console.log(`ok    ${e.name.padEnd(12)} L=${e.L}  ${now.toFixed(2)}`); continue }
  // Find naermeste lyshed der klarer kravet, i skridt paa 0.01
  let fix = null
  for (let step = 1; step <= 40 && !fix; step++) {
    for (const dir of [-1, 1]) {
      const L = +(e.L + dir * step * 0.01).toFixed(2)
      if (L <= 0.05 || L >= 0.99) continue
      if (best(L, e.C, e.H) >= 4.5) { fix = L; break }
    }
  }
  console.log(`FIX   ${e.name.padEnd(12)} L=${e.L} (${now.toFixed(2)})  ->  L=${fix} (${best(fix, e.C, e.H).toFixed(2)})`)
}
