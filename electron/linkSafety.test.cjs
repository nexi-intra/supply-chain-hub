const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeUrl, urlWarnings, domainOf } = require('./linkSafety.cjs')

test('only http and https addresses are accepted, trimmed and normalised', () => {
  assert.equal(normalizeUrl('  https://portal.dhl.com/booking  '), 'https://portal.dhl.com/booking')
  assert.equal(normalizeUrl('HTTPS://Example.com'), 'https://example.com/')
  for (const bad of ['javascript:alert(1)', 'file:///C:/Windows/system32/calc.exe', 'ms-settings:', 'ftp://x.com', 'www.example.com', '', 'https://exa mple.com', 'https://x.com/\nevil', `https://x.com/${'a'.repeat(2100)}`, 'http://', 42]) {
    assert.equal(normalizeUrl(bad), null, String(bad).slice(0, 40))
  }
})

test('warnings point out what a manager should look at before approving', () => {
  assert.deepEqual(urlWarnings('https://portal.dhl.com/booking'), [])
  assert.deepEqual(urlWarnings('http://portal.dhl.com'), ['not-https'])
  assert.ok(urlWarnings('https://10.0.0.5/admin').includes('ip-address'))
  assert.ok(urlWarnings('https://[::1]/').includes('ip-address'))
  assert.ok(urlWarnings('https://bit.ly/abc').includes('shortener'))
  assert.ok(urlWarnings('https://xn--dhl-xyz.com/').includes('punycode'))
  assert.ok(urlWarnings('https://user:pw@example.com/').includes('credentials'))
  assert.ok(urlWarnings('https://example.com:8443/').includes('unusual-port'))
})

test('the domain is shown without www', () => {
  assert.equal(domainOf('https://www.dhl.com/x'), 'dhl.com')
  assert.equal(domainOf('https://portal.dhl.com/x'), 'portal.dhl.com')
})
