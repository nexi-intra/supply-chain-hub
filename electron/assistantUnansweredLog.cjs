// Ren, testbar logik for HVILKE Hubert-spoergsmaal der er vaerd at logge som
// "ubesvaret" (mode: 'unsupported') - saa Hubert-daekningen kan forbedres over
// tid. Selve KV-skrivningen (best-effort, maa aldrig braekke svaret) sker i
// main.cjs. Gemmer bevidst KUN spoergsmaalstekst, sprog, viewId og tidspunkt -
// ingen e-mail/token, for at holde loggen saa privat som muligt.
function buildUnansweredLogEntry(request, answer, now = new Date()) {
  if (!answer || answer.mode !== 'unsupported') return null
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
