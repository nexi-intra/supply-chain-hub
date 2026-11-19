const test = require('node:test')
const assert = require('node:assert/strict')
const { buildSapCheckMail, escapeHtml } = require('./sapCheckMail.cjs')

const error = (id, extra = {}) => ({ id, type: 'count-mismatch', status: 'open', material: 'INT4100-4921-0', description: 'SmartPOS P300', sloc: 'D000', stockType: 'unrestricted', sapQty: 3303, serialCount: 3304, serials: [], locations: [], ...extra })

test('the mail has a clear subject, a count per error type and the errors as a table', () => {
  const check = { at: new Date(2026, 9, 19, 9).getTime(), slocs: ['D000', 'D004'] }
  const errors = [error('a'), error('b', { type: 'serials-without-stock', status: 'new', stockType: 'blocked', sapQty: 0, serialCount: 3, serials: ['B1', 'B2', 'B3'] })]
  const mail = buildSapCheckMail({ team: 'TCD', check, errors, mode: 'all' })
  assert.equal(mail.subject, 'SAP-fejl D301 TCD 19.10.2026 – 2 fejl (1 nye)')
  assert.match(mail.html, /D000, D004/)
  assert.match(mail.html, /3\.303 på lager, 3\.304 serienumre/)
  assert.match(mail.html, /3 serienumre, intet blocked lager/)
  assert.equal(buildSapCheckMail({ team: 'TCD', check, errors: [errors[1]], mode: 'new' }).subject, 'SAP-fejl D301 TCD 19.10.2026 – 1 fejl (nye)')
})

test('the mail can be written in English for the SAP team', () => {
  const check = { at: new Date(2026, 9, 19, 9).getTime(), slocs: ['D000'] }
  const errors = [error('a'), error('b', { type: 'duplicate-serial', status: 'new', sapQty: null, serialCount: 2, serials: ['U1'], locations: [{ material: 'INT1-0-R', sloc: 'D004', stockType: 'unrestricted' }, { material: 'INT1-0-R', sloc: 'D001', stockType: 'blocked' }] })]
  const mail = buildSapCheckMail({ team: 'TCD', check, errors, mode: 'all', language: 'en' })
  assert.equal(mail.subject, 'SAP errors D301 TCD 2026-10-19 – 2 errors (1 new)')
  assert.match(mail.html, /Hello SAP team/)
  assert.match(mail.html, /3,303 in stock, 3,304 serial numbers/)
  assert.match(mail.html, /U1 is in 2 places: INT1-0-R D004 Unblocked, INT1-0-R D001 Blocked/)
  assert.doesNotMatch(mail.html, /Hej|fejl/)
  assert.equal(buildSapCheckMail({ team: 'TCD', check, errors: [errors[0]], mode: 'new', language: 'en' }).subject, 'SAP errors D301 TCD 2026-10-19 – 1 error (new)')
})

test('text from SAP is escaped, so it can never become HTML in Outlook', () => {
  const mail = buildSapCheckMail({ team: 'TCD', check: { at: Date.now(), slocs: ['D000'] }, errors: [error('x', { description: '<img src=x onerror=alert(1)> & "q"' })], mode: 'all' })
  assert.doesNotMatch(mail.html, /<img/)
  assert.match(mail.html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;q&quot;/)
  assert.equal(escapeHtml("'"), '&#39;')
})
