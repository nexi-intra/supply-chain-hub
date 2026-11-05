// Every Finnish text, language list or locale in the main process also has Swedish.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const count = (text, pattern) => (text.match(pattern) || []).length
const CHECKS = [
  ['language ternary', /===\s*['"]fi['"]/g, /===\s*['"]sv['"]/g],
  ['text object', /(?:^|[\s{,])fi:\s*[{'"`(\[/]/g, /(?:^|[\s{,])sv:\s*[{'"`(\[/]/g],
  ['locale', /['"]fi-FI['"]/g, /['"]sv-SE['"]/g],
]
const LANGUAGE_LIST = /\[[^\]\n]*'fi'[^\]\n]*\]/g

test('main-process Swedish coverage matches Finnish', () => {
  const gaps = []
  for (const name of fs.readdirSync(__dirname).filter(file => file.endsWith('.cjs') && !file.endsWith('.test.cjs'))) {
    const text = fs.readFileSync(path.join(__dirname, name), 'utf8')
    for (const [label, finnish, swedish] of CHECKS) {
      const fi = count(text, finnish)
      const sv = count(text, swedish)
      if (sv < fi) gaps.push(`${name}: ${label} fi=${fi} sv=${sv}`)
    }
    for (const list of text.match(LANGUAGE_LIST) || []) {
      if (!list.includes("'sv'")) gaps.push(`${name}: language list without sv ${list}`)
    }
  }
  assert.deepEqual(gaps, [])
})
