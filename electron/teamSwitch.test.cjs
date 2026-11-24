const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { isSameTeamTarget } = require('./teamSwitch.cjs')

test('switching to the folder and directory already open is recognised as a no-op', () => {
  const dir = path.join('M:', 'Platform', 'TeamA')
  assert.equal(isSameTeamTarget({ folder: 'TeamA', dataDir: dir }, 'TeamA', dir), true)
  assert.equal(isSameTeamTarget({ folder: 'TeamA', dataDir: dir + path.sep }, 'TeamA', dir), true)
})

test('another folder, another directory or no open team is a real switch', () => {
  const dir = path.join('M:', 'Platform', 'TeamA')
  assert.equal(isSameTeamTarget({ folder: 'TeamA', dataDir: dir }, 'TeamB', path.join('M:', 'Platform', 'TeamB')), false)
  assert.equal(isSameTeamTarget({ folder: 'TeamA', dataDir: dir }, 'TeamA', path.join('N:', 'Platform', 'TeamA')), false)
  assert.equal(isSameTeamTarget({ folder: null, dataDir: path.join('M:', 'Platform') }, 'TeamA', dir), false)
  assert.equal(isSameTeamTarget({ folder: 'TeamA', dataDir: null }, 'TeamA', dir), false)
})
