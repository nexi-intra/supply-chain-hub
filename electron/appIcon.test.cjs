const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const PNG = [0x89, 0x50, 0x4e, 0x47]

test('the app icon is a real ICO with every Windows size as PNG', () => {
  const ico = fs.readFileSync(path.join(root, 'build', 'icon.ico'))
  assert.equal(ico.readUInt16LE(0), 0, 'reserved')
  assert.equal(ico.readUInt16LE(2), 1, 'type: icon')
  const count = ico.readUInt16LE(4)
  assert.equal(count, 7)
  const sizes = []
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16
    sizes.push(ico[entry] || 256)
    const size = ico.readUInt32LE(entry + 8)
    const offset = ico.readUInt32LE(entry + 12)
    assert.ok(offset + size <= ico.length, 'the image data is inside the file')
    assert.deepEqual([...ico.subarray(offset, offset + 4)], PNG, `size ${sizes.at(-1)} is a PNG`)
  }
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256])
})

test('the logo files are the chain-H and identical', () => {
  const pub = fs.readFileSync(path.join(root, 'public', 'app-logo.svg'), 'utf8')
  const asset = fs.readFileSync(path.join(root, 'src', 'assets', 'images', 'app-logo.svg'), 'utf8')
  assert.equal(pub, asset)
  assert.doesNotMatch(pub, />SCH</)
  assert.match(pub, /#E6B04F/i)
  for (const link of ['x="27" y="25" width="19" height="78" rx="9.5"', 'x="82" y="25" width="19" height="78" rx="9.5"', 'x="35" y="54" width="58" height="20" rx="10"']) {
    assert.ok(pub.includes(link), `has the link ${link}`)
  }
})
