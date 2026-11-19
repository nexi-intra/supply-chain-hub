'use strict'

// Builds electron/games/wordPuzzle/wordlists/fi.txt.gz for Word-Puzzle.
// Sources (see electron/games/wordPuzzle/WORDLISTS.md):
//   --hunspell <dir>  fginter/hunspell-fi 0.2 (CC0): fi_FI.aff + fi_FI.dic, expanded to every word form
//   --kotus <file>    Kotus "Nykysuomen sanalista 2024" (CC BY 4.0), base forms; optional
// Usage: node scripts/build-finnish-wordlist.cjs --hunspell <dir> [--kotus <file>] [--out <file>]

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { isLetter } = require('../electron/games/wordPuzzle/tileSets.cjs')

const MIN_LENGTH = 2
const MAX_LENGTH = 15
const VOWEL = /[AEIOUYÄÖ]/u
// The hunspell source spells many abbreviations in lowercase (km, tv, ay, eu); two-letter words must be on this list.
const TWO_LETTER_WORDS = new Set(['AI', 'EI', 'EN', 'ET', 'HA', 'HE', 'JA', 'JO', 'ME', 'NE', 'NO', 'OI', 'ON', 'SE', 'TE', 'UI', 'YÖ', 'ÄH'])
// Lowercase abbreviations, bare case endings and stray fragments found in the hunspell source.
const BLOCKED = new Set(['ALV', 'ATK', 'DNA', 'ECU', 'EIH', 'EIK', 'EIL', 'EIM', 'EIN', 'EIP', 'EIS', 'EIT', 'EIV', 'EUR', 'HRA', 'III', 'KLO', 'LVI', 'MME', 'NRO', 'OYJ', 'PNÄ', 'PVÄ', 'RVA', 'SSÄ', 'STÄ', 'TMI', 'USB'])

function parseArgs(argv) {
  const args = { out: path.join(__dirname, '..', 'electron', 'games', 'wordPuzzle', 'wordlists', 'fi.txt.gz') }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    if (!['hunspell', 'kotus', 'out'].includes(key) || argv[i + 1] === undefined) throw new Error(`Bad argument: ${argv[i]}`)
    args[key] = argv[i + 1]
  }
  if (!args.hunspell) throw new Error('--hunspell <dir> is required')
  return args
}

// Proper nouns and abbreviations are written with capitals in the sources, so only all-lowercase entries count.
function toGameWord(raw) {
  const word = raw.normalize('NFC').trim()
  if (word !== word.toLowerCase()) return null
  const upper = word.toUpperCase()
  const letters = [...upper]
  if (letters.length < MIN_LENGTH || letters.length > MAX_LENGTH) return null
  if (!VOWEL.test(upper) || BLOCKED.has(upper) || (letters.length === 2 && !TWO_LETTER_WORDS.has(upper))) return null
  return letters.every(letter => isLetter('fi', letter)) ? upper : null
}

function conditionRegex(condition, kind) {
  if (condition === '.') return null
  return new RegExp(kind === 'SFX' ? `${condition}$` : `^${condition}`, 'u')
}

function parseAffixes(text) {
  const rules = new Map()
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] !== 'SFX' && parts[0] !== 'PFX') continue
    const [kind, flag, a, b, c] = parts
    if (!rules.has(flag)) rules.set(flag, { kind, cross: false, entries: [] })
    const rule = rules.get(flag)
    if (c === undefined) {
      rule.cross = a === 'Y'
      continue
    }
    if (b.includes('/')) throw new Error(`Affix continuation classes are not supported: ${line}`)
    rule.entries.push({ strip: a === '0' ? '' : a, add: b === '0' ? '' : b, condition: conditionRegex(c ?? '.', kind) })
  }
  return rules
}

function applyRule(rule, word) {
  const forms = []
  for (const { strip, add, condition } of rule.entries) {
    if (condition && !condition.test(word)) continue
    if (rule.kind === 'SFX') {
      if (strip && !word.endsWith(strip)) continue
      forms.push(word.slice(0, word.length - strip.length) + add)
    } else {
      if (strip && !word.startsWith(strip)) continue
      forms.push(add + word.slice(strip.length))
    }
  }
  return forms
}

function expandHunspell(dir, add) {
  const rules = parseAffixes(fs.readFileSync(path.join(dir, 'fi_FI.aff'), 'utf8'))
  const lines = fs.readFileSync(path.join(dir, 'fi_FI.dic'), 'utf8').split(/\r?\n/)
  let stems = 0
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    stems++
    const slash = line.indexOf('/')
    const stem = slash === -1 ? line : line.slice(0, slash)
    add(stem)
    if (slash === -1) continue
    const flags = line.slice(slash + 1).split(',').map(flag => rules.get(flag)).filter(Boolean)
    const crossSuffixed = []
    for (const rule of flags) {
      if (rule.kind !== 'SFX') continue
      for (const form of applyRule(rule, stem)) {
        add(form)
        if (rule.cross) crossSuffixed.push(form)
      }
    }
    for (const rule of flags) {
      if (rule.kind !== 'PFX') continue
      for (const form of applyRule(rule, stem)) add(form)
      if (rule.cross) for (const suffixed of crossSuffixed) for (const form of applyRule(rule, suffixed)) add(form)
    }
  }
  return stems
}

// Kotus TXT: one entry per line, tab-separated, headword first. Inflection type 100 marks a misspelling.
function readKotus(file, add) {
  let entries = 0
  for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const columns = line.split('\t')
    const headword = columns[0]?.trim()
    if (!headword || /^(hakusana|sana)$/i.test(headword)) continue
    if (columns.slice(1).some(column => column.trim().split(/\s+/)[0] === '100')) continue
    entries++
    add(headword)
  }
  return entries
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const words = new Set()
  const add = raw => {
    const word = toGameWord(raw)
    if (word) words.add(word)
  }
  const stems = expandHunspell(args.hunspell, add)
  const fromHunspell = words.size
  const kotusEntries = args.kotus ? readKotus(args.kotus, add) : 0
  const sorted = [...words].sort()
  fs.mkdirSync(path.dirname(args.out), { recursive: true })
  fs.writeFileSync(args.out, zlib.gzipSync(Buffer.from(sorted.join('\n') + '\n', 'utf8'), { level: 9 }))
  console.log(JSON.stringify({ stems, fromHunspell, kotusEntries, addedByKotus: words.size - fromHunspell, total: sorted.length, bytes: fs.statSync(args.out).size }))
}

if (require.main === module) main()

module.exports = { toGameWord, parseAffixes, applyRule }
