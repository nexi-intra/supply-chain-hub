const norm = value => String(value || '').trim().toLowerCase()
const { INTENTS: { briefing: BRIEFING } } = require('./assistantInsights.cjs')
const { inflectedName, similarPeople } = require('./assistantPeople.cjs')
const { isAppWord } = require('./assistantAppGuide.cjs')
const { needsGameChoice } = require('./assistantMultiplayer.cjs')
const { relativeMatch, stripRelative } = require('./assistantRelativeDates.cjs')
// "og ugen efter?" / "and the day before?" / "entä edellinen päivä?" - et periodeskift, ikke et personnavn.
const SHIFT = /^(?:(?:og|and|entä|ja|hvad med|what about|och|vad sägs om) )?(?:the )?(?:(ugen|dagen|week|day|viikko|päivä|veckan)\s+(efter|after|sen jälkeen|jälkeen|därefter|før|before|ennen|aiemmin|innan|före)|(næste|forrige|next|previous|seuraava|edellinen|nästa|föregående)(?:na)?\s+(dag|day|päivä|dagen)(?:nä)?)$/u
function parseShift(text) {
  const match = text.match(SHIFT)
  if (!match) return null
  const unit = match[1] || match[4]
  const word = match[2] || match[3]
  return { unit, weekly: /^(?:ugen|week|viikko|veckan)$/u.test(unit), back: /^(?:før|before|ennen|aiemmin|innan|före|forrige|previous|edellinen|föregående)$/u.test(word) }
}
const PERIOD_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/gu,
  /(?:uge|week|viik(?:ko|olla|on)|vecka|veckan)\s*\d{1,2}(?!\d)/gu,
  /(?:næste|denne|sidste|forrige)\s+uge|(?:next|this|last)\s+week|ensi\s+viik\S*|tällä\s+viik\S*|(?:nästa|denna)\s+vecka|förra\s+veckan|i dag|idag|i morgen|imorgen|i morgon|imorgon|overmorgen|övermorgon|ylihuomenna|today|tomorrow|tänään|huomenna/gu,
  /(?:^|[^\p{L}])((?:på\s+)?(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|måndag|tisdag|lördag|söndag)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|maanantai(?:na)?|tiistai(?:na)?|keskiviikko(?:na)?|torstai(?:na)?|perjantai(?:na)?|lauantai(?:na)?|sunnuntai(?:na)?)(?=$|[^\p{L}])/gu,
]
const periodsIn = (text, now = new Date()) => [...PERIOD_PATTERNS.flatMap((pattern, index) => [...text.matchAll(pattern)].map(match => index === 3 ? match[1] : match[0])), ...(relativeMatch(text, now)?.text ? [relativeMatch(text, now).text] : [])]
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// The last known person (full or first name) mentioned in `text`.
function findPerson(text, names) {
  let best = null
  for (const name of names) {
    for (const alias of new Set([name, name.split(' ')[0]])) {
      if (alias.length < 2) continue
      for (const match of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(norm(alias))}(?:a|ä|lla|llä|lle|lta|ltä)?(?![\\p{L}\\p{N}])`, 'gu'))) {
        if (!best || match.index > best.index || (match.index === best.index && match[0].length > best.length)) best = { name, index: match.index, length: match[0].length }
      }
    }
  }
  return best
}
// "og hans opgaver?" / "and her vacation?": the person comes from the previous question.
const PRONOUN = /^(?:(?:og|and|entä|ja|och|hvad med|what about|vad sägs om) )?(?:hans|hendes|his|her|their|hänen|hennes|deras)\s+(.+)$/u
const PRONOUN_BACK = /^(?:(?:og|and|entä|ja|och) )?(?:hvornår er (?:hun|han|de) (?:tilbage)|when is (?:she|he|they) back|milloin (?:hän|he) palaa|när är (?:hon|han|de) tillbaka)$/u
const PARENTAL_WORD = /barsel|parental|perhevapaa|föräldraledig/u
// "nej, jeg mente i dag" / "I meant Clara" / "sorry, tomorrow": the correction is the follow-up without the opening words.
const MEANT = '(?:jeg mente|mente jeg|jeg mener|jeg spurgte om|i meant|i mean|i was asking about|i asked about|tarkoitin|tarkoitan|kysyin|jag menade|jag menar|jag frågade om)'
const CORRECTION = new RegExp(`^(?:(?:nej|næ|no|nope|ei|nä)[,.]?\\s+)?(?:(?:undskyld|sorry|oops|hov|ups|anteeksi|förlåt|oj)[,.]?\\s+)?${MEANT}\\s+(.+)$|^(?:nej|næ|no|nope|ei|nä|undskyld|sorry|anteeksi|förlåt)[,.]?\\s+(.{2,40})$`, 'u')
// "hvornår er han tilbage?" / "is she sick tomorrow?": the pronoun is the person of the previous question.
const SUBJECT_PRONOUN = /(?<![\p{L}])(?:han|hun|ham|hende|he|she|him|hän|hänet|hon|honom|henne)(?![\p{L}])/gu
const PERSON_QUESTION = /^(?:(?:og|and|entä|ja|och)\s+)?(?:hvornår|hvor|hvad|hvem|er|har|kommer|when|where|what|is|does|will|has|did|was|milloin|missä|mitä|onko|oliko|palaako|när|var|vad|är)(?![\p{L}])/u
const TOPIC_WORDS = {
  status: { da: /ferie|syg|hjemme|fravær|barsel|\bfri\b/u, en: /vacation|holiday|sick|home office|absen|\boff\b|parental/u, fi: /loma|saira|etätyö|etätöis|poissa|vapaa/u, sv: /semester|sjuk|hemma|hemarbete|frånvaro|ledig|föräldraledig/u },
  tasks: { da: /vagt|opgave/u, en: /shift|task/u, fi: /vuoro|tehtäv/u, sv: /\bpass\b|uppgift|schema/u },
}
// "og Bo?" after "hvem har ferie næste uge?": the same topic and period, asked about that person.
function topicFollowUp(previous, name, when, uiLanguage) {
  for (const [kind, patterns] of Object.entries(TOPIC_WORDS)) {
    const languages = Object.keys(patterns).filter(language => patterns[language].test(previous))
    if (!languages.length) continue
    const language = languages.includes(uiLanguage) ? uiLanguage : languages[0]
    return (kind === 'tasks' ? TASKS_OF : STATUS_OF)[language](name, when).replace(/\s+/g, ' ').trim()
  }
  return null
}
function pronounSubject(question, previous, names) {
  const text = norm(question).replace(/[?!.,]+\s*$/u, '')
  if (text.split(/\s+/).length > 10 || !PERSON_QUESTION.test(text)) return null
  const found = text.match(SUBJECT_PRONOUN)
  if (!found || found.length !== 1) return null
  const person = findPerson(norm(previous), names)
  return person ? text.replace(SUBJECT_PRONOUN, norm(person.name)) : null
}
const GAME_SWAP = /^(?:(?:og|and|entä|ja|och|hvad med|what about|vad sägs om) )?(?:i |in |at )?(skak|chess|schack|shakki|shakissa|word[- ]?puzzle(?:ssa)?)$/u
const CHESS_MENTION = /(?<![\p{L}])(?:skak\p{L}*|chess|schack\p{L}*|shak[ki]\p{L}*)(?![\p{L}])/iu
// The answer to "which game do you mean?": just the game.
const BARE_GAME = /^(?:(?:i|in|at|på)\s+)?(?:skak|chess|schack|shakki|shakissa|word[- ]?puzzle(?:ssa)?)$/u
const TASK_NOUNS = { da: /^(?:opgaver|vagter|vagtplan)$/u, en: /^(?:tasks|shifts|schedule)$/u, sv: /^(?:uppgifter|pass|schema|schemat)$/u, fi: /^(?:tehtävä\S*|vuoro\S*)$/u }
const STATUS_NOUNS = { da: /^(?:ferie|fravær|sygdom|hjemmearbejde|status)$/u, en: /^(?:vacation|absence|holiday|sick leave|home office|status)$/u, sv: /^(?:semester|frånvaro|sjukdom|hemarbete|status)$/u, fi: /^(?:loma\S*|poissaolo\S*|sairaus\S*|etätyö\S*|status\S*)$/u }
const TASKS_OF = { da: (name, when) => `${when} opgaver for ${name}`, en: (name, when) => `${when} tasks for ${name}`, sv: (name, when) => `${when} uppgifter för ${name}`, fi: (name, when) => `${name} tehtävät ${when}` }
const STATUS_OF = { da: (name, when) => `hvor er ${name} ${when}`, en: (name, when) => `where is ${name} ${when}`, sv: (name, when) => `var är ${name} ${when}`, fi: (name, when) => `missä ${name} on ${when}` }
function pronounFollowUp(question, previous, names, uiLanguage) {
  const match = norm(question).replace(/[?!.,]+\s*$/u, '').match(PRONOUN)
  if (!match) return null
  const noun = match[1].trim()
  const person = findPerson(norm(previous), names)
  if (!person) return null
  const languagesFor = nouns => Object.keys(nouns).filter(language => nouns[language].test(noun))
  const taskLanguages = languagesFor(TASK_NOUNS)
  const statusLanguages = languagesFor(STATUS_NOUNS)
  const pick = languages => languages.includes(uiLanguage) ? uiLanguage : languages[0]
  const when = periodsIn(norm(previous)).join(' ')
  const rewritten = taskLanguages.length ? TASKS_OF[pick(taskLanguages)](person.name, when) : statusLanguages.length ? STATUS_OF[pick(statusLanguages)](person.name, when) : null
  return rewritten && rewritten.trim().length <= 1000 ? rewritten.replace(/\s+/g, ' ').trim() : null
}
function validateConversation(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 6 || value.some(question => typeof question !== 'string' || !question.trim() || question.length > 1000)) throw new Error('Samtalekonteksten må højst indeholde 6 spørgsmål på 1000 tegn')
  return value
}
const isFollowUp = question => norm(question).length <= 180 && /(?:^|\s)(?:den|det|dem|der|så|samme|gamle|gammel|test|og|entä|vanha|sama|and|that|those|it|old|same|then|uddyb|kortere|elaborate|och|samma|gamla|sedan|utveckla|kortare)(?:\s|[?!.,]|$)/u.test(norm(question))
// Bounded context: short, recognizable follow-ups. An unrelated new question is
// never rewritten, and previous text never grants access to a team or record.
function continueQuestion(question, previous, now, resolveDates, { people = () => [], language = 'da' } = {}) {
  if (!previous) return question
  const corrected = norm(question).replace(/[?!.]+\s*$/u, '').match(CORRECTION)
  if (corrected) {
    const rest = (corrected[1] || corrected[2]).trim()
    const asFollowUp = resolveDates(rest, now) ? rest : `og ${rest}`
    const result = continueQuestion(asFollowUp, previous, now, resolveDates, { people, language })
    if (result !== asFollowUp) return result
    return rest.split(/\s+/).length >= 3 ? rest : question
  }
  // Opposite/variant selections retain the subject, not the previous answer.
  // Historical data is fetched afresh and never inferred from the test address.
  const variant = norm(question).replace(/[?!.,]/g, '').match(/^(?:(?:hvad|what|mikä|vad)\s+(?:er|is|on|är)\s+)?(?:(?:og|and|entä|hvad med|what about|och|vad sägs om)\s+)?(?:(?:den|det|the|se)\s+)?(gamle|gammel|old|vanha|nye|ny|new|uusi|test|testi|gamla|nya)(?:\s+(?:så|then|one|sitten|då))?$/u)
  if (variant && /\bip(?:-adresse|-address|-osoite|-adress)?\b/u.test(norm(previous))) {
    const inherited = norm(previous).replace(/\b(?:gamle|gammel|old|vanha|nye|ny|new|uusi|test|testi|aktuelle|aktuel|current|gældende|nykyinen|guide|guides|historik|history|historia|kilde|gamla|nya|aktuella|nuvarande|källa)\b/gu, ' ').replace(/\s+/g, ' ').trim()
    const old = /gamle|gammel|old|vanha|gamla/u.test(variant[1])
    const combined = `${inherited} ${variant[1]}${old ? ' guide historik' : ''}`
    return combined.length <= 1000 ? combined : question
  }
  if (/^(?:hvilken guide|hvilken guide står det i|hvor står det|which guide|where is that documented|missä oppaassa|vilken guide|vilken guide står det i|var står det)[?!.,]*$/u.test(norm(question)) && /\bip(?:-adresse|-address|-osoite|-adress)?\b/u.test(norm(previous))) {
    const combined = `${previous} guide kilde`
    return combined.length <= 1000 ? combined : question
  }
  // Personskifte-opfoelgning til indsigts-spoergsmaal: "og Bo?" efter
  // "hvor er Anne paa torsdag?" genbruger intent + periode med den nye person.
  // Ren tekst-omskrivning; adgang og personopslag afgoeres stadig nedstroems.
  const pronoun = pronounFollowUp(question, previous, people(), language)
  if (pronoun) return pronoun
  // "og hvornår er hun tilbage?" after a parental-leave list: the list already names everybody with the day they are back.
  if (PRONOUN_BACK.test(norm(question).replace(/[?!.,]+\s*$/u, '')) && PARENTAL_WORD.test(norm(previous))) return previous
  const subjectPronoun = pronounSubject(question, previous, people())
  if (subjectPronoun) return subjectPronoun
  const swap = norm(question).replace(/[?!.,]+\s*$/u, '').match(/^(?:og|and|entä|ja|hvad med|what about|och|vad sägs om)\s+([\p{L}\p{N}@._' -]{2,40})$/u)
  if (swap && !resolveDates(swap[1], now) && !parseShift(norm(question).replace(/[?!.,]+\s*$/u, ''))) {
    const p = norm(previous)
    const names = people()
    // "og Annes?" after a question about messages or to-dos asks for somebody else's: carry the noun so the privacy guard sees it.
    const privateNoun = p.match(/beskeder|messages?|mails?|e-?mails?|to-?dos?|viestit|meddelanden/u)?.[0]
    const colleague = privateNoun && names.find(name => norm(name).split(' ').some(part => part.length >= 2 && ['', 's', 'n', 'in', "'s"].some(ending => swap[1].trim() === `${part}${ending}`)))
    if (colleague) return `vis ${norm(colleague)}s ${privateNoun}`
    // An inflected name ("Bolla" = at Bo) is the person; a misspelled one is passed on as typed, so the answer can ask "did you mean".
    const subject = inflectedName(swap[1], names)?.toLowerCase() ?? swap[1]
    // Efter et personligt overblik ("hvad sker der i dag?") betyder "og Bo?" Bos status samme dag.
    const briefingVerb = BRIEFING.test(p) ? (/\b(?:what|my|today|tomorrow|week|anything|new)\b/u.test(p) ? 'where is' : /mitä|tänään|huomenna|uutta|viikk/u.test(p) ? 'missä on' : /(?:^|\s)(?:vad|händer|något|nåt|nytt|vecka|veckan|översikt|gör jag)(?=\s|[?!.]|$)/u.test(p) ? 'var är' : 'hvor er') : null
    const whereVerb = p.match(/hvor er|hvor befinder|where is|where's|missä on|var är|var befinner/u) || (/(?:^|\s)missä\s+(?!on(?:\s|$))\S+(?:\s\S+)?\s+on(?=\s|[?!.]|$)/u.test(p) ? ['missä'] : null) || (briefingVerb ? [briefingVerb] : null)
    const backVerb = /(?:hvornår|hvornaar)\s+er\s+.{2,60}?tilbage/u.test(p) ? 'da' : /when\s+is\s+.{2,60}?back/u.test(p) ? 'en' : /milloin\s+.{2,60}?(?:palaa|takaisin)/u.test(p) ? 'fi' : /när\s+(?:är|kommer)\s+.{2,60}?tillbaka/u.test(p) ? 'sv' : null
    if (whereVerb || backVerb) {
      const periods = periodsIn(p)
      const rewritten = backVerb
        ? backVerb === 'fi' ? `milloin ${subject} palaa` : backVerb === 'sv' ? `när är ${subject} tillbaka` : backVerb === 'en' ? `when is ${subject} back` : `hvornår er ${subject} tilbage`
        : whereVerb[0] === 'missä' ? `missä ${subject} on ${periods.join(' ')}`.trim() : `${whereVerb[0]} ${subject} ${periods.join(' ')}`.trim()
      if (rewritten.length <= 1000) return rewritten
    }
    // Any other question about a person (tasks, vacation ...): "og Clara?" swaps the person and keeps the rest.
    const earlier = findPerson(p, names)
    const target = findPerson(subject, names)
    const misspelled = !target && /^[\p{L}]{3,}$/u.test(subject) && similarPeople(subject, names.map(name => ({ names: new Set([name]) }))).length > 0
    if (!earlier && (target || misspelled)) {
      const topic = topicFollowUp(p, target ? norm(target.name) : subject, periodsIn(p, now).join(' '), language)
      if (topic) return topic
    }
    if (earlier && ((target && target.length === subject.trim().length && target.name !== earlier.name) || misspelled)) {
      const swapped = `${p.slice(0, earlier.index)}${target ? norm(target.name) : subject}${p.slice(earlier.index + earlier.length)}`
      if (swapped.length <= 1000) return swapped
    }
  }
  // "og i skak?" after a Word-Puzzle question asks the same about chess.
  const bareGame = norm(question).replace(/[?!.,]+\s*$/u, '')
  if (BARE_GAME.test(bareGame) && needsGameChoice(previous)) return `${previous} ${bareGame}`
  const gameSwap = norm(question).replace(/[?!.,]+\s*$/u, '').match(GAME_SWAP)
  if (gameSwap && /word.?puzzle/u.test(norm(previous)) && !/word.?puzzle/u.test(gameSwap[1])) return previous.replace(/word.?puzzle\p{L}*/iu, /^miten|^mikä/iu.test(previous.trim()) ? 'shakkiin' : gameSwap[1])
  // "and in Word-Puzzle?" after a chess question: the other direction.
  if (gameSwap && /word.?puzzle/u.test(gameSwap[1]) && CHESS_MENTION.test(previous) && !/word.?puzzle/u.test(norm(previous))) return previous.replace(CHESS_MENTION, gameSwap[1])
  // "and Multiplayer?": a bare app word after an app question is the question about that module.
  const bareTerm = norm(question).replace(/[?!.,]+\s*$/u, '').match(/^(?:og|and|entä|ja|och|hvad med|what about|vad sägs om) ([\p{L}-]{5,30})$/u)
  if (bareTerm && isAppWord(bareTerm[1]) && !findPerson(bareTerm[1], people())) return bareTerm[1]
  const stripPeriod = value => stripRelative(value, now)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/(?:uge|week|viik(?:ko|olla|on)|vecka|veckan)\s*\d{1,2}(?!\d)/gu, ' ')
    .replace(/(?:næste|denne|sidste|forrige)\s+(?:uge|måned)|(?:next|this|last)\s+(?:week|month|year)|(?:ensi|viime)\s+(?:viik\S*|kuussa)|tällä\s+viik\S*|(?:nästa|denna)\s+(?:vecka|månad)|förra\s+(?:veckan|månaden)|i dag|idag|i morgen|imorgen|i morgon|imorgon|i overmorgen|overmorgen|övermorgon|ylihuomenna|huomenna|tänään|today|tomorrow|day after tomorrow/gu, ' ')
    .replace(/(?:^|[^\p{L}])(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|monday|tuesday|wednesday|thursday|friday|saturday|sunday|maanantai(?:na)?|tiistai(?:na)?|keskiviikko(?:na)?|torstai(?:na)?|perjantai(?:na)?|lauantai(?:na)?|sunnuntai(?:na)?|måndag|tisdag|lördag|söndag|januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december|january|february|march|may|june|july|october|december|januari|februari|mars|augusti)(?=$|[^\p{L}])/gu, ' ')
  // "og ugen efter?" / "and the day before?" flytter forrige periode frem eller tilbage.
  const shift = parseShift(norm(question).replace(/[?!.,]+\s*$/u, ''))
  const previousRange = shift ? resolveDates(previous, now) : null
  if (previousRange) {
    const start = new Date(`${previousRange.start}T12:00:00`)
    const days = Math.round((new Date(`${previousRange.end}T12:00:00`) - start) / 86400000) + 1
    const direction = shift.back ? -1 : 1
    const base = stripPeriod(norm(previous)).replace(/[?!.]+/g, ' ')
    let period = null
    if (shift.weekly && days === 7 && start.getDay() === 1) {
      // ISO-ugenummer for mandagen ugen efter/før.
      const thursday = new Date(start); thursday.setDate(start.getDate() + 3 + 7 * direction)
      const jan4 = new Date(thursday.getFullYear(), 0, 4, 12)
      const week = 1 + Math.round(((thursday - jan4) / 86400000 - 3 + (jan4.getDay() + 6) % 7) / 7)
      period = `${{ ugen: 'uge', week: 'week', viikko: 'viikko', veckan: 'vecka' }[shift.unit]} ${week} ${thursday.getFullYear()}`
    } else if (!shift.weekly && days === 1) {
      const next = new Date(start); next.setDate(start.getDate() + direction)
      period = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
    }
    if (period) return `${base} ${period}`.replace(/\s+/g, ' ').trim()
  }
  if (!resolveDates(question, now)) return question
  let reply = norm(question).replace(/^(?:og|hvad med|and|what about|entä|ja|och|vad sägs om)\s+/u, '')
  const residual = stripPeriod(reply).replace(/\b(?:19\d{2}|20\d{2}|21\d{2}|2200)\b/g, ' ').replace(/(?:^|\s)(?:i|på|in|on)(?=$|\s)/g, ' ').replace(/[^\p{L}\p{N}]/gu, '')
  if (residual) return question
  let inherited = stripPeriod(norm(previous)).replace(/[?!.]+/g, ' ')
  if (/\b(?:19\d{2}|20\d{2}|21\d{2}|2200)\b/.test(reply)) inherited = inherited.replace(/\b(?:19\d{2}|20\d{2}|21\d{2}|2200)\b/g, ' ')
  const combined = `${inherited} ${reply}`.replace(/\s+/g, ' ').trim()
  if (combined.length > 1000) return question
  return combined
}
module.exports = { continueQuestion, validateConversation, isFollowUp }
