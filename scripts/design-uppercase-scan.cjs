// Samler de klasse-strenge der stadig bruger VERSAL-labels, saa de kan
// ensrettes eet sted. Rent laesende.
const fs = require('fs')
const path = require('path')

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'ui') walk(full, out)
    } else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const root = path.join(__dirname, '..', 'src')
const found = new Map()

for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.match(/"[^"]*\buppercase\b[^"]*"/g) || []) {
    const value = match.slice(1, -1)
    if (value.includes('first-letter:uppercase')) continue
    found.set(value, (found.get(value) || 0) + 1)
  }
}

for (const [value, count] of [...found].sort((a, b) => b[1] - a[1])) {
  console.log(String(count).padStart(3) + '  ' + value)
}
console.log(`\n${found.size} unikke, ${[...found.values()].reduce((a, b) => a + b, 0)} forekomster`)
