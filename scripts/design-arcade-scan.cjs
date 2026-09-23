// Finder de klasse-strenge der gaar igen paa tvaers af spillene, saa de kan
// ensrettes eet sted i stedet for haand-rettes 300 gange. Rent laesende.
const fs = require('fs')
const path = require('path')

const FILES = [
  'components/EndlessDodger.tsx',
  'components/NeonSnake.tsx',
  'components/NexiFlyer.tsx',
  'components/BrickBreak.tsx',
  'components/Tetris.tsx',
  'components/PauseOverlay.tsx',
  'components/CubeBasherGame.tsx',
  'components/TheLibrarian2Game.tsx',
  'views/Arcade.tsx',
  'views/GameCorner.tsx',
  'views/Modern.tsx',
]

const SUSPECT = /(bg-gradient-to-|bg-clip-text|border-2|shadow-(lg|xl|2xl)\b|rounded-(xl|2xl|3xl)\b)/
const root = path.join(__dirname, '..', 'src')
const counts = new Map()

for (const rel of FILES) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.match(/className="[^"]*"/g) || []) {
    const value = match.slice(11, -1)
    if (!SUSPECT.test(value)) continue
    counts.set(value, (counts.get(value) || 0) + 1)
  }
}

const sorted = [...counts].sort((a, b) => b[1] - a[1])
console.log(`unikke klasse-strenge: ${sorted.length}   samlet: ${sorted.reduce((s, x) => s + x[1], 0)}`)
console.log('')
for (const [value, count] of sorted) {
  if (count < 2) continue
  console.log(String(count).padStart(3) + '  ' + value)
}
console.log('\n--- kun een forekomst hver (haandarbejde) ---')
console.log(sorted.filter(([, c]) => c === 1).length + ' stk.')
