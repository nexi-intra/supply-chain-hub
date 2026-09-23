// Engangs-scan: hvor bliver --accent brugt som BRANDFARVE (stor flade / tekst)
// frem for som neutral interaktionsflade (hover/fokus i menuer og lister)?
// Det afgoer om accent trygt kan skiftes til en neutral tone.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', 'src')
const files = []
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.tsx?$/.test(entry.name)) files.push(full)
  }
})(root)

const pattern = /(?:from|to|via)-accent[\w/\[\].-]*|text-accent(?:-foreground)?[\w/[\].-]*|bg-accent[\w/[\].-]*|border-accent[\w/[\].-]*/g
const hits = new Map()
for (const file of files) {
  const rel = path.relative(root, file)
  const text = fs.readFileSync(file, 'utf8')
  text.split('\n').forEach((line, index) => {
    for (const match of line.match(pattern) || []) {
      if (!hits.has(match)) hits.set(match, [])
      hits.get(match).push(`${rel}:${index + 1}`)
    }
  })
}

for (const [token, places] of [...hits].sort((a, b) => b[1].length - a[1].length)) {
  console.log(String(places.length).padStart(3), token)
  if (places.length <= 6) for (const place of places) console.log('      ', place)
}
