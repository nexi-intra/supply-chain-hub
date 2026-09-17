const norm = value => String(value || '').trim().toLowerCase()
function validateConversation(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 6 || value.some(question => typeof question !== 'string' || !question.trim() || question.length > 1000)) throw new Error('Samtalekonteksten må højst indeholde 6 spørgsmål på 1000 tegn')
  return value
}
const isFollowUp = question => norm(question).length <= 180 && /(?:^|\s)(?:den|det|dem|der|så|samme|gamle|gammel|test|og|entä|vanha|sama|and|that|those|it|old|same|then|uddyb|kortere|elaborate)(?:\s|[?!.,]|$)/u.test(norm(question))
// Bounded context: short, recognizable follow-ups. An unrelated new question is
// never rewritten, and previous text never grants access to a team or record.
function continueQuestion(question, previous, now, resolveDates) {
  if (!previous) return question
  // Opposite/variant selections retain the subject, not the previous answer.
  // Historical data is fetched afresh and never inferred from the test address.
  const variant = norm(question).replace(/[?!.,]/g, '').match(/^(?:(?:hvad|what|mikä)\s+(?:er|is|on)\s+)?(?:(?:og|and|entä|hvad med|what about)\s+)?(?:(?:den|det|the|se)\s+)?(gamle|gammel|old|vanha|nye|ny|new|uusi|test|testi)(?:\s+(?:så|then|one|sitten))?$/u)
  if (variant && /\bip(?:-adresse|-address|-osoite)?\b/u.test(norm(previous))) {
    const inherited = norm(previous).replace(/\b(?:gamle|gammel|old|vanha|nye|ny|new|uusi|test|testi|aktuelle|aktuel|current|gældende|nykyinen|guide|guides|historik|history|historia|kilde)\b/gu, ' ').replace(/\s+/g, ' ').trim()
    const old = /gamle|gammel|old|vanha/u.test(variant[1])
    const combined = `${inherited} ${variant[1]}${old ? ' guide historik' : ''}`
    return combined.length <= 1000 ? combined : question
  }
  if (/^(?:hvilken guide|hvilken guide står det i|hvor står det|which guide|where is that documented|missä oppaassa)[?!.,]*$/u.test(norm(question)) && /\bip(?:-adresse|-address|-osoite)?\b/u.test(norm(previous))) {
    const combined = `${previous} guide kilde`
    return combined.length <= 1000 ? combined : question
  }
  if (!resolveDates(question, now)) return question
  let reply = norm(question).replace(/^(?:og|hvad med|and|what about|entä|ja)\s+/u, '')
  const stripPeriod = value => value
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/(?:uge|week|viik(?:ko|olla|on))\s*\d{1,2}(?!\d)/gu, ' ')
    .replace(/(?:næste|denne|sidste|forrige)\s+(?:uge|måned)|(?:next|this|last)\s+(?:week|month|year)|(?:ensi|viime)\s+(?:viik\S*|kuussa)|tällä\s+viik\S*|i dag|i morgen|overmorgen|today|tomorrow|day after tomorrow/gu, ' ')
    .replace(/(?:^|[^\p{L}])(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|monday|tuesday|wednesday|thursday|friday|saturday|sunday|maanantai|tiistai|keskiviikko|torstai|perjantai|lauantai|sunnuntai|januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december|january|february|march|may|june|july|october|december)(?=$|[^\p{L}])/gu, ' ')
  const residual = stripPeriod(reply).replace(/\b(?:19\d{2}|20\d{2}|21\d{2}|2200)\b/g, ' ').replace(/(?:^|\s)(?:i|på|in|on)(?=$|\s)/g, ' ').replace(/[^\p{L}\p{N}]/gu, '')
  if (residual) return question
  let inherited = stripPeriod(norm(previous))
  if (/\b(?:19\d{2}|20\d{2}|21\d{2}|2200)\b/.test(reply)) inherited = inherited.replace(/\b(?:19\d{2}|20\d{2}|21\d{2}|2200)\b/g, ' ')
  const combined = `${inherited} ${reply}`.replace(/\s+/g, ' ').trim()
  if (combined.length > 1000) return question
  return combined
}
module.exports = { continueQuestion, validateConversation, isFollowUp }
