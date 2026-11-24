// Deterministic task/person interpretation. No model, network or hardcoded users.
const canonical = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ')
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BOUNDARY = new Map()
const bounded = (question, value) => {
  // A plain substring test rules out almost every one of the hundreds of aliases before the boundary regex runs.
  if (!question.includes(value)) return false
  let pattern = BOUNDARY.get(value)
  if (!pattern) {
    pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(value)}(?:$|[^\\p{L}\\p{N}])`, 'u')
    if (BOUNDARY.size >= 5000) BOUNDARY.clear()
    BOUNDARY.set(value, pattern)
  }
  return pattern.test(question)
}
const SELF = new Set(['jeg', 'mig', 'min', 'mine', 'mig selv', 'i', 'me', 'my', 'myself', 'minun', 'omat', 'minulla', 'minulle', 'jag', 'mina', 'mitt', 'mig själv'])
const EVERYONE = new Set(['teamet', 'teamets', 'hele teamet', 'hele teamets', 'mit team', 'vores team', 'alle', 'alle medarbejdere', 'alle i teamet', 'vi', 'everyone', 'everybody', 'the team', 'whole team', 'our team', 'my team', 'all employees', 'we', 'koko tiimi', 'tiimi', 'kaikki', 'hela teamet', 'hela teamets', 'mitt team', 'vårt team', 'alla', 'alla anställda', 'alla i teamet'])

function isTaskQuestion(question) {
  const q = canonical(question)
  if (/guide|vejledning|manual|opas|oppaa/.test(q)) return false
  return /opgave|vagt|task|shift|tehtäv|vuoro|arbejdsplan|assignment|uppgift|schema|(?:^|[^\p{L}])pass(?:et|en)?(?=$|[^\p{L}])/u.test(q)
    || /(?:skal|vil|kommer)\s+.+?\s+(?:arbejde|arbejder|lave|stå for|tage sig af)/.test(q)
    || /hvad\s+arbejder\s+.+?\s+med/.test(q)
    || /what\s+(?:should|will|does|is|am|do)\s+.+?\s+(?:do|work|working|be working)/.test(q)
    || /mitä\s+.+?\s+(?:tekee|teen|tehdä|työskentelee)/.test(q)
    || /vad\s+(?:ska|kommer)\s+.+?\s+(?:jobba|arbeta|göra)/.test(q)
    || /vad\s+(?:jobbar|arbetar)\s+.+?\s+med/.test(q)
}

function extractSubject(question) {
  const q = canonical(question)
  const patterns = [
    /(?:hvad|vad)\s+har\s+(.+?)\s+(?:af|for|för)\s+(?:opgaver?|vagter?|uppgifter|pass)\b/,
    /hvad\s+(?:skal|vil|kommer)\s+(.+?)\s+(?:arbejde(?:\s+med)?|arbejder|lave|stå for|tage sig af)/,
    /hvad\s+arbejder\s+(.+?)\s+med/,
    /what\s+(?:should|will|does|is|am|do)\s+(.+?)\s+(?:do|work(?:\s+on)?|working|be working)/,
    /(?:hvilke|hvilken)\s+(?:opgaver?|vagter?|roller?)\s+(?:skal|har|får)\s+(.+?)(?=\s+(?:have|lave|arbejde|i|næste|denne)\b|\s+på(?=\s)|\s+\d|[?!.]|$)/,
    /(?:which|what)\s+(?:tasks|shifts|assignments)\s+(?:does|will|should|do)\s+(.+?)\s+(?:have|do|work)/,
    /(?:opgaver?|vagter?|vagtplan|arbejdsplan|tasks|shifts|assignments|tehtävät|uppgifter|uppgift|pass|schema)\s+(?:for|til|of|för)\s+(?!(?:i dag|i morgen|idag|imorgon|today|tomorrow|next|this|næste|denne|nästa|denna|ensi|tällä|huomenna|tänään|\d)(?:\s|$|[?!.]))(.+?)(?=\s+(?:(?:i|på|on|in)\s+)?(?:næste|denne|next|this|i dag|i morgen|today|tomorrow|ensi|tällä|nästa|denna|idag|imorgon|\d)\b|[?!]|$)/,
    /mitä\s+(.+?)\s+(?:tekee|teen|tehdä|työskentelee)/,
    /(?:mitä|mitkä)\s+(?:tehtäviä|tehtävät|vuoroja)\s+(.+?)\s+(?:on|ovat|tulossa)\b/,
    /vad\s+(?:ska|kommer)\s+(.+?)\s+(?:jobba|arbeta|göra)/,
    /vad\s+(?:jobbar|arbetar)\s+(.+?)\s+med/,
    /(?:vilka|vilken)\s+(?:uppgifter|uppgift|pass)\s+(?:ska|har|får)\s+(.+?)(?=\s+(?:ha|göra|jobba|i|nästa|denna)\b|\s+på(?=\s)|\s+\d|[?!.]|$)/,
  ]
  for (const pattern of patterns) {
    const match = q.match(pattern)
    if (match) return match[1].replace(/\s+(?:fra|i|from|in)\s+.+$/, '').replace(/\s+(?:i dag|idag|i morgen|imorgon|i morgon|today|tomorrow|huomenna|tänään|i går|igår|yesterday|eilen)$/, '').trim()
  }
  // Possessive task phrases; leave inflection intact for alias matching.
  const possessive = q.match(/(?:^|\s)([\p{L}\p{N}_@.+' -]+?)\s+(?:opgaver|vagter|vagtplan|tasks|shifts|tehtävät|uppgifter|pass|schema)\b/u)
  if (possessive) {
    const raw = possessive[1].replace(/^(?:hvad er|vis(?: mig)?|find|show(?: me)?|list|what are|vad är|visa(?: mig)?|hitta)\s+/, '').trim()
    if (raw && !/^(?:hvilke|hvilken|which|what|vilka|vilken|har)$/.test(raw)) return raw
  }
  return null
}

function aliasesFor(person) {
  const names = new Set()
  for (const name of person.names) {
    const value = canonical(name)
    if (!value) continue
    names.add(value)
    const words = value.split(' ')
    names.add(words[0]); names.add(words[words.length - 1])
  }
  for (const username of person.usernames) names.add(canonical(username))
  const aliases = []
  for (const name of names) {
    if (!name) continue
    const rank = name.includes(' ') ? 3 : 1
    for (const alias of [name, `${name}s`, `${name}'s`, `${name}'`, `${name}in`, `${name}n`]) aliases.push({ alias, rank })
  }
  aliases.push({ alias: person.email, rank: 4 })
  return aliases
}

// Common words must never be "corrected" to a name (e.g. "den" -> "Dan").
const NOT_NAMES = new Set('hvor hvad hvem hvornår er den det der ting med for til fra laver status har holder kommer tilbage morgen dag uge næste denne where what who when is the doing back off with for missa missä mitä onko tekee huomenna tänään fri ferie syg sick home hjemme arbejde work var vad vem när är gör tillbaka morgon idag imorgon vecka veckan nästa denna ledig semester sjuk hemma jobbet borta'.split(' '))
const editDistance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}
// "ane" -> Anne: same first letter and 1 (short names) or 2 (long names) letters apart.
function similarPeople(text, people) {
  const words = canonical(text).split(/[^\p{L}]+/u).filter(word => word.length >= 3 && !NOT_NAMES.has(word))
  return people.filter(person => [...person.names].flatMap(name => canonical(name).split(' ')).filter(part => part.length >= 3).some(part =>
    words.some(word => word[0] === part[0] && word !== part && editDistance(word, part) <= (part.length >= 6 ? 2 : 1))))
}
// Finnish case endings on a name ("Bolla" = at Bo): the endings short names may take are the unambiguous ones.
const FI_ENDINGS = ['lla', 'llä', 'lle', 'lta', 'ltä', 'ssa', 'ssä', 'sta', 'stä', 'ksi', 'na', 'nä']
const FI_ENDINGS_LONG_NAMES = [...FI_ENDINGS, 'n', 'a', 'ä', 'ta', 'tä', 'in', 'ille', 'illa']
/** The full name a single inflected word points to ("bolla" -> "Bo Berg"), or null. */
function inflectedName(word, names) {
  const token = canonical(word)
  if (!/^[\p{L}]{3,}$/u.test(token)) return null
  for (const name of names) {
    for (const part of new Set(canonical(name).split(' '))) {
      if (part.length < 2 || token === part || !token.startsWith(part)) continue
      if ((part.length === 2 ? FI_ENDINGS : FI_ENDINGS_LONG_NAMES).includes(token.slice(part.length))) return name
    }
  }
  return null
}

function listPeople(teams, readTeam, creatorEmail) {
  const byEmail = new Map()
  for (const team of teams) {
    const users = readTeam(team, 'users') || {}
    for (const [key, user] of Object.entries(users)) {
      if (!user || typeof user !== 'object') continue
      const email = canonical(user.email || (Array.isArray(users) ? user.id : key))
      if (!email || email === canonical(creatorEmail) || user.role === 'creator' || (user.status && user.status !== 'approved')) continue
      const name = String(user.fullName || user.name || email.split('@')[0]).trim()
      let person = byEmail.get(email)
      if (!person) {
        person = { email, name, names: new Set(), usernames: new Set(), memberships: [] }
        byEmail.set(email, person)
      }
      person.names.add(name)
      if (user.username) person.usernames.add(String(user.username))
      person.memberships.push({ teamId: team.teamId, label: team.abbreviation || team.teamId, identifiers: new Set([email, canonical(user.id), Array.isArray(users) ? '' : canonical(key)].filter(Boolean)) })
    }
  }
  return [...byEmail.values()]
}

// `teamWide`: a team named by the asker without a person ('shifts in TRR') means the whole team, not the asker's own plan.
function selectTaskPeople(question, principal, teams, readTeam, creatorEmail, selectedPerson, { teamWide = false } = {}) {
  const q = canonical(question)
  let raw = extractSubject(q)
  const people = listPeople(teams, readTeam, creatorEmail)
  // A Finnish case form of a name ("Annella" = at Anne) names the person.
  if (raw && !EVERYONE.has(raw) && !SELF.has(raw)) { const full = inflectedName(raw, people.flatMap(person => [...person.names])); if (full) raw = canonical(full) }
  // "hvem har vagt i dag?" / "who has a shift?" spoerger efter HELE teamet.
  const whoHas = /^(?:hvem|who|kuka|ketkä|ketka|vem)\s+(?:har|får|has|have|gets|is on|are on|on|ovat|er på|är på)\b/
  const askWho = whoHas.test(q) && (raw === null || whoHas.test(raw))
  if (askWho) raw = null
  let all = raw !== null && EVERYONE.has(raw)
  const selfWords = /(?:^|\s)(?:jeg|mig|min|mine|me|my|myself|minun|omat|jag|mina|mitt)(?:$|\s)/.test(q)
  if (raw === null) all = askWho || /hele teamet|alle medarbejdere|alle i teamet|teamets|everyone|whole team|all employees|koko tiimi|hela teamet|alla anställda|alla i teamet/.test(q) || (teamWide && !selfWords && !people.some(person => aliasesFor(person).some(({ alias }) => bounded(q, alias))))
  let own = raw !== null && SELF.has(raw)
  if (raw === null) own = !askWho && selfWords
  let candidates = []
  if (all) candidates = people
  else if (own) candidates = people.filter(person => person.email === principal.email)
  else {
    const ranked = people.map(person => ({ person, rank: Math.max(0, ...aliasesFor(person).filter(({ alias }) => raw !== null ? alias === raw : bounded(q, alias)).map(({ rank }) => rank)) }))
    const best = Math.max(0, ...ranked.map(value => value.rank))
    candidates = best ? ranked.filter(value => value.rank === best).map(value => value.person) : []
    // An unnamed task query conventionally means the current user's plan.
    // An explicitly named unknown person must NEVER fall back to that plan.
    if (!candidates.length && raw === null) own = true
    // A name that is almost a known one ("Anna" for Anne) is asked about, not guessed.
    if (!candidates.length && raw) {
      const guesses = similarPeople(raw, people)
      if (guesses.length && selectedPerson === undefined) return { reason: 'didYouMean', choices: guesses.map(person => ({ id: person.email, label: `${person.name} (${[...new Set(person.memberships.map(member => member.label))].join(', ')})` })).sort((a, b) => a.label.localeCompare(b.label)) }
      candidates = guesses
    }
  }
  if (own && !candidates.length) candidates = [{ email: principal.email, name: principal.name, memberships: teams.map(team => ({ teamId: team.teamId, label: team.abbreviation || team.teamId, identifiers: new Set([principal.email]) })) }]
  if (selectedPerson !== undefined) {
    if (typeof selectedPerson !== 'string' || all || !candidates.some(person => person.email === canonical(selectedPerson))) throw new Error('Personvalget passer ikke til spørgsmålet eller de teams, du har adgang til')
    candidates = candidates.filter(person => person.email === canonical(selectedPerson))
  }
  if (!candidates.length && !all) return { reason: 'notFound', subject: raw || '' }
  if (!all && candidates.length > 1) return { reason: 'ambiguous', choices: candidates.map(person => ({ id: person.email, label: `${person.name} (${[...new Set(person.memberships.map(member => member.label))].join(', ')})` })).sort((a, b) => a.label.localeCompare(b.label)) }
  return { own, all, people: candidates }
}

module.exports = { isTaskQuestion, selectTaskPeople, listPeople, aliasesFor, canonical, bounded, similarPeople, inflectedName }
