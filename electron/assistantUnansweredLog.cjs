// Ren, testbar logik for HVILKE Hubert-spoergsmaal der er vaerd at logge som
// "ubesvaret" - saa Hubert-daekningen kan forbedres over tid. Selve
// KV-skrivningen (best-effort, maa aldrig braekke svaret) sker i main.cjs.
// Gemmer bevidst KUN spoergsmaalstekst, sprog og tidspunkt - ingen
// e-mail/token, for at holde loggen saa privat som muligt.
//
// Tre signaler: den gamle haarde afvisning (`mode: 'unsupported'`), `unmatched`
// (et brugbart overblik i stedet for en afvisning, men intet kendt emne ramt) og
// et svar uden ét eneste resultat (`total === 0`), medmindre svaret selv siger at
// det tomme resultat er det rigtige svar (`weak: false`). Det sidste faar
// `reason: 'empty'`, saa det kan adskilles fra de to foerste. Indholdet af svaret
// gemmes aldrig.
function buildUnansweredLogEntry(request, answer, now = new Date()) {
  const empty = answer?.total === 0 && answer.weak !== false
  if (!answer || (answer.mode !== 'unsupported' && answer.unmatched !== true && !empty)) return null
  const question = typeof request?.question === 'string' ? request.question.trim() : ''
  if (!question) return null
  return {
    question: question.slice(0, 1000),
    language: typeof request?.language === 'string' ? request.language : 'da',
    createdAt: now.toISOString(),
    ...(empty && answer.mode !== 'unsupported' && answer.unmatched !== true ? { reason: 'empty' } : {}),
  }
}

module.exports = { buildUnansweredLogEntry }
