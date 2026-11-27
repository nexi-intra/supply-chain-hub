const test = require('node:test')
const assert = require('node:assert/strict')
const { scannedSerial } = require('./serialInput.cjs')

test('a 24-digit serial becomes its last 18 digits', () => {
  assert.equal(scannedSerial('251427303201349258058038'), '303201349258058038')
  assert.equal(scannedSerial(' 251427 303201349258058038 '), '303201349258058038')
})

test('only exactly 24 digits are shortened', () => {
  for (const value of ['303201349258058038', '51427303201349258058038', '1251427303201349258058038', 'INT4300ABCDEF1234567890X', '']) {
    assert.equal(scannedSerial(value), value)
  }
})
