// What may be stored and opened as a Link Library link, and what a manager should check before approving it.

const MAX_URL = 2048
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 't.ly'])

/** The canonical http(s) address, or null when it may not be stored or opened. */
function normalizeUrl(input) {
  if (typeof input !== 'string') return null
  const value = input.trim()
  if (!value || value.length > MAX_URL || /[\s\x00-\x1f\x7f]/.test(value)) return null
  let url
  try { url = new URL(value) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!url.hostname) return null
  return url.href.length > MAX_URL ? null : url.href
}

const hostOf = href => new URL(href).hostname.toLowerCase()

function domainOf(href) {
  return hostOf(href).replace(/^www\./, '')
}

/** Codes for the review screen; an empty list means nothing stands out. */
function urlWarnings(href) {
  const url = new URL(href)
  const host = url.hostname.toLowerCase()
  const warnings = []
  if (url.protocol !== 'https:') warnings.push('not-https')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) warnings.push('ip-address')
  if (SHORTENERS.has(host.replace(/^www\./, ''))) warnings.push('shortener')
  if (host.split('.').some(label => label.startsWith('xn--'))) warnings.push('punycode')
  if (url.username || url.password) warnings.push('credentials')
  if (url.port && !['80', '443'].includes(url.port)) warnings.push('unusual-port')
  return warnings
}

module.exports = { normalizeUrl, urlWarnings, domainOf }
