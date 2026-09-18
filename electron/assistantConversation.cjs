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
  // Personskifte-opfoelgning til indsigts-spoergsmaal: "og Bo?" efter
  // "hvor er Anne paa torsdag?" genbruger intent + periode med den nye person.
  // Ren tekst-omskrivning; adgang og personopslag afgoeres stadig nedstroems.
  const swap = norm(question).replace(/[?!.,]+\s*$/u, '').match(/^(?:og|and|entä|ja|hvad med|what about)\s+([\p{L}\p{N}@._' -]{2,40})$/u)
  if (swap && !resolveDates(swap[1], now)) {
    const p = norm(previous)
    const whereVerb = p.match(/hvor er|hvor befinder|where is|where's|missä on/u)
    const backVerb = /(?:hvornår|hvornaar)\s+er\s+.{2,60}?tilbage/u.test(p) ? 'da' : /when\s+is\s+.{2,60}?back/u.test(p) ? 'en' : /milloin\s+.{2,60}?(?:palaa|takaisin)/u.test(p) ? 'fi' : null
    if (whereVerb || backVerb) {
      const periodPatterns = [
        /\b\d{4}-\d{2}-\d{2}\b/gu,
        /(?:uge|week|viik(?:ko|olla|on))\s*\d{1,2}(?!\d)/gu,
        /(?:næste|denne|sidste|forrige)\s+uge|(?:next|this|last)\s+week|ensi\s+viik\S*|tällä\s+viik\S*|i dag|idag|i morgen|imorgen|overmorgen|today|tomorrow|tänään|huomenna/gu,
        /(?:^|[^\p{L}])((?:på\s+)?(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|maanantai(?:na)?|tiistai(?:na)?|keskiviikko(?:na)?|torstai(?:na)?|perjantai(?:na)?|lauantai(?:na)?|sunnuntai(?:na)?)(?=$|[^\p{L}])/gu,
      ]
      const periods = periodPatterns.flatMap((pattern, index) => [...p.matchAll(pattern)].map(match => index === 3 ? match[1] : match[0]))
      const rewritten = backVerb
        ? backVerb === 'fi' ? `milloin ${swap[1]} palaa` : backVerb === 'en' ? `when is ${swap[1]} back` : `hvornår er ${swap[1]} tilbage`
        : `${whereVerb[0]} ${swap[1]} ${periods.join(' ')}`.trim()
      if (rewritten.length <= 1000) return rewritten
    }
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
