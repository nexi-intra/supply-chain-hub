// Optaelling af de visuelle moenstre der skal ensrettes, pr. fil.
// Rent laesende - roerer ikke koden.
const fs = require('fs')
const path = require('path')

const PATTERNS = {
  grad: /bg-gradient-to-/g,
  clip: /bg-clip-text/g,
  b2: /border-2/g,
  shadow: /shadow-(lg|xl|2xl)\b/g,
  radius: /rounded-(xl|2xl|3xl)\b/g,
  upper: /\buppercase\b/g,
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'ui') continue
      walk(full, out)
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

const root = path.join(__dirname, '..', 'src')
const rows = []
for (const file of [...walk(path.join(root, 'views')), ...walk(path.join(root, 'components'))]) {
  const text = fs.readFileSync(file, 'utf8')
  const counts = {}
  let sum = 0
  for (const [name, re] of Object.entries(PATTERNS)) {
    counts[name] = (text.match(re) || []).length
    sum += counts[name]
  }
  if (sum > 0) rows.push({ fil: path.relative(root, file), sum, ...counts })
}

rows.sort((a, b) => b.sum - a.sum)
const pad = (v, n) => String(v).padEnd(n)
const num = (v, n) => String(v).padStart(n)
console.log(pad('fil', 42) + num('sum', 5) + num('grad', 6) + num('clip', 6) + num('b2', 5) + num('skygge', 8) + num('radius', 8) + num('versal', 8))
console.log('-'.repeat(88))
for (const r of rows) {
  console.log(pad(r.fil, 42) + num(r.sum, 5) + num(r.grad, 6) + num(r.clip, 6) + num(r.b2, 5) + num(r.shadow, 8) + num(r.radius, 8) + num(r.upper, 8))
}
console.log('-'.repeat(88))
console.log(`${rows.length} filer, ${rows.reduce((s, r) => s + r.sum, 0)} forekomster i alt`)
