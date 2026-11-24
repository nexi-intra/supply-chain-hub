'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { isMainThread, parentPort } = require('node:worker_threads')
const { LANGUAGES, isLetter } = require('./tileSets.cjs')

const MIN_LENGTH = 2
const MAX_LENGTH = 15
const WORDLIST_DIR = path.join(__dirname, 'wordlists')

// Hunspell packages are ESM-only (exports map), so their files are read by path.
function findPackageDir(name) {
  let dir = __dirname
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'index.aff'))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`Dictionary package not found: ${name}`)
    dir = parent
  }
}

// `text` is "WORD\nWORD\n..." sorted by UTF-16 code units; one string instead of a Set keeps memory low.
function lineListContains(text, word) {
  if (!word || word.includes('\n')) return false
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = (low + high) >> 1
    const start = mid === 0 ? 0 : text.lastIndexOf('\n', mid - 1) + 1
    let end = text.indexOf('\n', mid)
    if (end === -1) end = text.length
    const line = text.slice(start, end)
    if (line === word) return true
    if (word < line) high = start
    else low = end + 1
  }
  return false
}

const lists = new Map()

function loadList(language) {
  if (lists.has(language)) return lists.get(language)
  let list = null
  if (language === 'fi') {
    const file = path.join(WORDLIST_DIR, 'fi.txt.gz')
    if (fs.existsSync(file)) list = { kind: 'lines', text: zlib.gunzipSync(fs.readFileSync(file)).toString('utf8') }
  } else {
    const dir = findPackageDir(`dictionary-${language}`)
    const nspell = require('nspell')
    list = { kind: 'spell', spell: nspell({ aff: fs.readFileSync(path.join(dir, 'index.aff')), dic: fs.readFileSync(path.join(dir, 'index.dic')) }) }
  }
  lists.set(language, list)
  return list
}

function hasValidShape(language, word) {
  if (typeof word !== 'string') return false
  const letters = [...word]
  return letters.length >= MIN_LENGTH && letters.length <= MAX_LENGTH && letters.every(letter => isLetter(language, letter))
}

function checkWords(language, words) {
  if (!LANGUAGES.includes(language)) throw new Error(`Unknown language: ${language}`)
  const list = loadList(language)
  const result = {}
  for (const word of words) {
    if (list === null) result[word] = null
    else if (!hasValidShape(language, word)) result[word] = false
    else if (list.kind === 'lines') result[word] = lineListContains(list.text, word)
    else result[word] = list.spell.correct(word.toLowerCase())
  }
  return result
}

if (!isMainThread && parentPort) {
  parentPort.on('message', ({ id, language, words }) => {
    try {
      parentPort.postMessage({ id, result: checkWords(language, words) })
    } catch (error) {
      parentPort.postMessage({ id, error: error.message })
    }
  })
}

module.exports = { lineListContains, checkWords }
