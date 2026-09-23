// Ensretter de visuelle moenstre der optraeder ordret mange steder.
//
// Bevidst KUN praecise streng-erstatninger - ingen gaet, intet regex der kan
// ramme ved siden af. Hver linje i MAP er en beslutning, der kan laeses og
// efterproeves i diffen bagefter.
//
//   node scripts/design-codemod.cjs          <- proevekoersel, skriver ikke
//   node scripts/design-codemod.cjs --apply  <- gennemfoerer
const fs = require('fs')
const path = require('path')

const apply = process.argv.includes('--apply')

const MAP = [
  // Tilbage-knappen i toppen af hver skaerm
  [
    'pointer-events-auto bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4',
    'pointer-events-auto bg-background/90 hover:bg-background transition-colors gap-2 font-semibold px-4',
  ],
  [
    'bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4',
    'bg-background/90 hover:bg-background transition-colors gap-2 font-semibold px-4',
  ],

  // Raekker i lister: doble kanter og svaevende skygge -> streg og farvet kant ved hover
  [
    'flex items-center justify-between p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all group',
    'flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors group',
  ],
  [
    'flex items-center justify-between p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all cursor-pointer',
    'flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors cursor-pointer',
  ],
  [
    'flex items-center justify-between p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all',
    'flex items-center justify-between p-5 rounded-md border bg-card hover:border-primary/40 transition-colors',
  ],
  [
    'flex items-center justify-between p-4 rounded-xl border-2 bg-card hover:shadow-md transition-all group',
    'flex items-center justify-between p-4 rounded-md border bg-card hover:border-primary/40 transition-colors group',
  ],
  [
    'flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border-2 bg-card',
    'flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-md border bg-card',
  ],
  [
    'flex flex-col gap-4 p-5 rounded-xl border-2 bg-card hover:shadow-md transition-all',
    'flex flex-col gap-4 p-5 rounded-md border bg-card hover:border-primary/40 transition-colors',
  ],
  [
    'p-4 rounded-xl border-2 bg-card hover:shadow-md transition-all group relative',
    'p-4 rounded-md border bg-card hover:border-primary/40 transition-colors group relative',
  ],
  [
    'p-4 rounded-xl border-2 bg-card flex items-center justify-between gap-4',
    'p-4 rounded-md border bg-card flex items-center justify-between gap-4',
  ],

  // Kort: Card har selv en kant, saa border-2 gav en dobbelt streg
  ['<Card className="p-6 border-2">', '<Card className="p-6">'],
  ['<Card className="p-6 border-2 bg-muted/30">', '<Card className="p-6 bg-muted/30">'],
  ['<Card className="p-8 max-w-md relative z-10 border-2">', '<Card className="p-8 max-w-md relative z-10">'],
  ['<Card className="p-5 border-2', '<Card className="p-5'],

  // Knapper med gradient -> maerkefarven
  ['gap-2 bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90', 'gap-2'],
  ['gap-2 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90', 'gap-2'],
  ['gap-2 bg-gradient-to-r from-primary to-accent', 'gap-2'],
  ['flex-1 gap-2 bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90', 'flex-1 gap-2'],

  // Maerkater
  ['<Badge className="bg-gradient-to-r from-primary to-accent text-white">', '<Badge>'],
  ['<Badge className="bg-gradient-to-r from-accent via-primary to-accent text-white">', '<Badge variant="secondary">'],

  // Runde ikon-/initialfelter
  [
    'w-12 h-12 rounded-xl bg-gradient-to-br from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] flex items-center justify-center text-white font-bold text-lg shadow-lg',
    'w-12 h-12 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg',
  ],
  [
    'w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center text-white font-bold text-lg shadow-lg',
    'w-12 h-12 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg',
  ],
  [
    'w-12 h-12 rounded-xl flex items-center justify-center shadow-md',
    'w-12 h-12 rounded-md flex items-center justify-center',
  ],
  [
    'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shadow-md border-2 border-transparent hover:border-primary/40 transition-colors',
    'w-10 h-10 rounded-md flex items-center justify-center font-bold text-sm border border-transparent hover:border-primary/40 transition-colors',
  ],

  // Statistik-kort: gradient-vask -> flad tone
  ['p-4 bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20', 'p-4 bg-blocked-surface border-blocked/25'],
  ['p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20', 'p-4 bg-attention-surface border-attention/25'],
  ['p-4 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20', 'p-4 bg-accent/10 border-accent/25'],
  ['p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20', 'p-4 bg-primary/10 border-primary/25'],
  [
    'flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-destructive/20 to-destructive/10 text-destructive font-bold text-sm',
    'flex items-center justify-center w-8 h-8 rounded-full bg-blocked-surface text-blocked font-bold text-sm',
  ],

  // Advarselsflader
  [
    'p-6 border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 dark:border-amber-600',
    'p-6 border-attention/40 bg-attention-surface',
  ],
  [
    'p-4 rounded-lg border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600/60',
    'p-4 rounded-md border border-attention/40 bg-attention-surface',
  ],

  // Diverse enkeltstaaende
  ['<div className="border-2 rounded-lg p-4">', '<div className="border rounded-md p-4">'],
  ['<Card className="p-5 md:p-7 border-2">', '<Card className="p-5 md:p-7">'],
  // Farvefelter beholder den kraftige kant - den viser valget - men faar samme radius
  ['"p-4 rounded-lg border-2 cursor-pointer transition-colors"', '"p-4 rounded-md border-2 cursor-pointer transition-colors"'],
  ['p-4 rounded-lg border-2 border-border hover:border-primary/50 cursor-pointer transition-colors', 'p-4 rounded-md border-2 border-border hover:border-primary/50 cursor-pointer transition-colors'],
  [
    "flex items-center justify-between gap-4 rounded-xl border p-4",
    "flex items-center justify-between gap-4 rounded-md border p-4",
  ],
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const root = path.join(__dirname, '..', 'src')
const totals = new Map()
let changedFiles = 0

for (const file of walk(root)) {
  const before = fs.readFileSync(file, 'utf8')
  let after = before
  for (const [from, to] of MAP) {
    if (!after.includes(from)) continue
    const count = after.split(from).length - 1
    totals.set(from, (totals.get(from) || 0) + count)
    after = after.split(from).join(to)
  }
  if (after !== before) {
    changedFiles++
    console.log(`${path.relative(root, file)}`)
    if (apply) fs.writeFileSync(file, after)
  }
}

console.log('\n--- erstatninger ---')
let sum = 0
for (const [from, count] of [...totals].sort((a, b) => b[1] - a[1])) {
  sum += count
  console.log(String(count).padStart(4) + '  ' + from.slice(0, 84))
}
console.log(`\n${apply ? 'Udfoert' : 'Proevekoersel'}: ${sum} erstatninger i ${changedFiles} filer.`)
if (!apply) console.log('Koer med --apply for at gennemfoere.')
