// What Hubert's answer may carry to the renderer: only the fields it uses to show and open a source,
// and never the e-mail address of anyone but the asker (owner, members, from/to and ids built from an address).
const crypto = require('node:crypto')

const EMAIL = /[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*/gu
const PUBLIC_FIELDS = ['kind', 'teamId', 'title', 'guideId', 'library', 'reference', 'version', 'moduleId', 'recordId']

const opaqueToken = email => `x${crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12)}`
const replaceEmails = (value, ownEmail, replace) => value.replace(EMAIL, found => found.toLowerCase() === ownEmail ? found : replace(found))

/** A record id with every address but the asker's swapped for a stable opaque token; `getRecord` accepts both forms. */
function publicRecordId(recordId, askerEmail) {
  return typeof recordId === 'string' ? replaceEmails(recordId, String(askerEmail || '').toLowerCase(), opaqueToken) : recordId
}

function publicSource(source, askerEmail) {
  const own = String(askerEmail || '').toLowerCase()
  const result = {}
  for (const field of PUBLIC_FIELDS) {
    const value = source?.[field]
    if (typeof value !== 'string') continue
    result[field] = field === 'recordId' ? publicRecordId(value, own) : replaceEmails(value, own, () => '—')
  }
  return result
}

/** The answer as the renderer may see it. Apply after the sources have been revalidated. */
function publicAnswer(answer, askerEmail) {
  if (!answer || !Array.isArray(answer.sources)) return answer
  return { ...answer, sources: answer.sources.map(source => publicSource(source, askerEmail)) }
}

module.exports = { publicAnswer, publicSource, publicRecordId }
