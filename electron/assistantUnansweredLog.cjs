// Ren, testbar logik for HVILKE Hubert-spoergsmaal der er vaerd at logge som
// "ubesvaret" - saa Hubert-daekningen kan forbedres over tid. Selve
// KV-skrivningen (best-effort, maa aldrig braekke svaret) sker i main.cjs.
// Gemmer bevidst KUN spoergsmaalstekst, sprog, viewId og tidspunkt - ingen
// e-mail/token, for at holde loggen saa privat som muligt.
//
// To signaler: den gamle haarde afvisning (`mode: 'unsupported'`), og
// `unmatched` - et spoergsmaal der fik et brugbart overblik i stedet for en
// afvisning, men stadig ikke ramte noget kendt emne. Uden det sidste ville
// blindgyde-fjernelsen (fase 4) have gjort manglende daekning usynlig.
function buildUnansweredLogEntry(request, answer, now = new Date()) {
  if (!answer || (answer.mode !== 'unsupported' && answer.unmatched !== true)) return null
  const question = typeof request?.question === 'string' ? request.question.trim() : ''
  if (!question) return null
  return {
    question: question.slice(0, 1000),
    language: typeof request?.language === 'string' ? request.language : 'da',
    viewId: typeof request?.viewId === 'string' ? request.viewId : null,
    createdAt: now.toISOString(),
  }
}

module.exports = { buildUnansweredLogEntry }
