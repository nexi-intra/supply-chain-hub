const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
// The folders a script's "<folder>/*.test.cjs" globs run.
const folders = script => new Set([...scripts[script].matchAll(/(\S+)\/\*\.test\.cjs/g)].map(match => match[1]))

function testFolders(dir) {
  const found = new Set()
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.isDirectory() && !['node_modules', 'fixtures'].includes(entry.name)) for (const folder of testFolders(`${dir}/${entry.name}`)) found.add(folder)
    else if (entry.isFile() && entry.name.endsWith('.test.cjs')) found.add(dir)
  }
  return found
}

test('npm test runs every folder of main-process tests, and test:warehouse every warehouse one', () => {
  const all = [...testFolders('electron')].sort()
  assert.deepEqual(all.filter(folder => !folders('test').has(folder)), [])
  assert.deepEqual(all.filter(folder => folder.startsWith('electron/warehouse') && !folders('test:warehouse').has(folder)), [])
})
