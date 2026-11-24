// Light cleanup before routing: emoji, repeated punctuation, greetings, politeness and thanks are not part of the question.
const WH = '(?:hvem|hvad|hvor|hvornår|hvilke|hvilken|hvilket|hvordan|what|who|where|when|which|how|kuka|ketkä|mitä|mikä|missä|milloin|miten|kuinka|vem|vad|var|när|vilka|vilken|vilket|hur)'
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu
const EMOTICON = /(?:^|\s)(?:[:;=8][-^o]?[)(DPp\]/|]|<3|\^_\^)(?=\s|$|[.!?])/gu
const GREETING = /^(?:(?:hej|hejsa|hejsan|hey|hi|hello|hallo|goddag|godmorgen|god morgen|god morgon|good morning|good afternoon|moi|hei|terve|huomenta|tjena)(?:\s+(?:hubert|hubi|bot|botten|chatbot))?|hubert|hubi)(?:\s*[,!.:;-]+\s*|\s+)(?=\S)/iu
const LEADING_PLEASE = /^(?:please|venligst|snälla|kiitos)[,\s]+(?=\S)/iu
const POLITE = new RegExp(`^(?:(?:kan|ville|vil|kunne|må) (?:du|i)(?: (?:venligst|lige|godt|nok|måske|så|bare))* (?:fortælle|sige|vise|oplyse|give|hjælpe)(?: mig)?(?: (?:med|om)(?: at (?:vide|finde|se))?)?|ved (?:du|i)|jeg (?:vil gerne|ville gerne|skulle|vil) (?:vide|høre|have at vide)|jeg (?:undrer mig over|lurer på)|(?:can|could|would|will) you(?: (?:please|kindly))* (?:tell|show|give|let)(?: me)?(?: know)?|do you know|i(?:'d| would) like to (?:know|ask)|i(?:'m| am) (?:wondering|curious)|i wonder|please (?:tell|show) me|voitko(?: (?:ystävällisesti|kertoa|sanoa))*|tiedätkö|haluaisin tietää|kan (?:du|ni)(?: (?:vara snäll och|gärna))* (?:berätta|säga|visa)(?: för mig| mig)?|vet (?:du|ni)|jag (?:undrar|skulle vilja veta)|kan jeg (?:få|få lov (?:at|til at)) (?:at )?(?:vide|se|høre)|(?:fortæl|sig|vis|oplys)(?: mig)?(?: lige)?|(?:can|may) i (?:get|have|see)(?: to)? know|(?:tell|show) me|i (?:need|want) to know|kerro(?: minulle| mulle)?|voisitko(?: kertoa)?|saanko tietää|får jag veta|kan jag få (?:veta|se)|berätta(?: för mig)?|visa mig)[,:]?\\s*(?:om |at |that |että |att )?(?=${WH}(?![\\p{L}]))`, 'iu')
const TRAILING = /(?:[\s,;.!?:]+(?:(?:mange |tusind |tusinde )?tak(?: (?:på forhånd|for hjælpen|for det|skal du have))?|(?:thanks|thank you|thx|cheers)(?: (?:in advance|a lot|so much|for the help))?|please|venligst|kiitos(?: (?:paljon|etukäteen))?|kiitokset|(?:tusen )?tack(?: på förhand| för hjälpen)?|snälla))+[\s!.?:)-]*$/iu
const words = text => text.split(/\s+/).filter(Boolean).length

// Strips only while something worth answering (two words) is left.
const strip = (text, pattern) => {
  const next = text.replace(pattern, '').trim()
  return words(next) >= 2 ? next : text
}

/** The question without decoration, or '' when nothing but symbols is left. */
function tidyQuestion(question) {
  let text = String(question).replace(EMOJI, ' ').replace(EMOTICON, ' ').replace(/\s+/g, ' ').trim()
  text = text.replace(/^["“”«»‹›¿¡>]+|["“”«»‹›]+$/gu, '').replace(/^'([^']*)'$/u, '$1').trim()
  text = text.replace(/[?!]*\?[?!]*/g, '?').replace(/!+/g, '!')
  text = text.replace(/[.,;:!…]+$/u, '').trim()
  for (const pattern of [GREETING, POLITE, LEADING_PLEASE, TRAILING]) text = strip(text, pattern)
  text = text.replace(/[.,;:!…]+$/u, '').trim()
  return /[\p{L}\p{N}]/u.test(text) ? text : ''
}

/** Clauses of a long, rambling message that start at a question word (last first, at most three); none for short messages. */
function focusClauses(question) {
  const text = tidyQuestion(question)
  if (words(text) < 10) return []
  const starts = [...text.matchAll(new RegExp(`(?<![\\p{L}])${WH}(?![\\p{L}])`, 'giu'))].map(match => match.index).reverse()
  return starts.map(index => text.slice(index).trim()).filter(clause => words(clause) >= 3 && words(clause) <= words(text) - 3).slice(0, 3).map(clause => tidyQuestion(clause) || clause)
}

module.exports = { tidyQuestion, focusClauses }
