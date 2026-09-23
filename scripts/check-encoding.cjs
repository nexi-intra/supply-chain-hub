// Vagthund mod tegnfejl.
//
// Vi har set to slags skade i praksis:
//  1) BOM + dobbelt-kodning: "Vaerdien" bliver til "VAErdien" med de
//     karakteristiske Ã-par, efter en PowerShell Get-Content/Set-Content
//     rundtur. Det rammer ogsaa rigtige fejlbeskeder, saa brugerne ser vaas.
//  2) literale backslash-u-sekvenser skrevet som TEKST i markdown og css,
//     hvor de ikke bliver afkodet af noget som helst.
//     (I JavaScript-kildekode er de derimod helt lovlige escapes.)
//
// Koer uden argumenter for at kontrollere, med --fix for at reparere.
const fs = require('node:fs')
const path = require('node:path')

const fix = process.argv.includes('--fix')
const repoRoot = path.join(__dirname, '..')

const files = []
for (const dir of ['src', 'electron', 'plans']) {
  const root = path.join(repoRoot, dir)
  if (!fs.existsSync(root)) continue
  ;(function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(tsx?|cjs|css|json|md)$/.test(entry.name)) files.push(full)
    }
  })(root)
}

// Et dobbelt-kodet dokument bestaar udelukkende af tegn der ligger i latin1
// og indeholder de karakteristiske par. Vi vender kun om hvis resultatet er
// gyldig UTF-8 - ellers lader vi filen vaere.
const DOUBLE_ENCODED = /[\u00c2-\u00c3][\u0080-\u00bf]|\u00e2\u0080[\u0090-\u009f]/

const problems = []
let repaired = 0

for (const file of files) {
  const rel = path.relative(repoRoot, file).replace(/\\/g, '/')
  let buffer = fs.readFileSync(file)
  let changed = false

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    if (fix) {
      buffer = buffer.subarray(3)
      changed = true
    } else {
      problems.push(rel + ': har BOM')
    }
  }

  let text = buffer.toString('utf8')

  if (DOUBLE_ENCODED.test(text)) {
    if (fix) {
      // Filen kan vaere DELVIST skadet, saa vi vender ikke hele filen om.
      // I stedet afkoder vi praecis de sekvenser der er dobbelt-kodede, og
      // lader alt andet staa uroert.
      const mended = text.replace(
        /[\u00c2-\u00c3][\u0080-\u00bf]|\u00e2\u0080[\u0080-\u00bf]/g,
        match => Buffer.from(match, 'latin1').toString('utf8'),
      )
      if (!mended.includes('\ufffd')) {
        buffer = Buffer.from(mended, 'utf8')
        changed = true
      } else {
        problems.push(rel + ': dobbelt-kodet, men kan ikke vendes sikkert')
      }
    } else {
      const line = text.split('\n').findIndex(l => DOUBLE_ENCODED.test(l)) + 1
      problems.push(rel + ':' + line + ': dobbelt-kodet tekst')
    }
  }

  // Literale escape-sekvenser er kun et problem i tekstformater.
  if (/\.(md|css)$/.test(rel)) {
    text.split('\n').forEach((line, index) => {
      if (/\\u00[0-9a-fA-F]{2}/.test(line)) {
        problems.push(rel + ':' + (index + 1) + ': literal escape-sekvens')
      }
    })
  }

  if (changed) {
    fs.writeFileSync(file, buffer)
    repaired++
  }
}

if (fix) console.log(repaired + ' fil(er) repareret.')

if (problems.length) {
  for (const problem of problems.slice(0, 40)) console.log(problem)
  console.log('\n' + problems.length + ' problem(er)')
  process.exit(1)
}
console.log(files.length + ' filer gennemgaaet, ingen tegnfejl.')
